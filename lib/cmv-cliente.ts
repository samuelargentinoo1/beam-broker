// CMV de um cliente específico: o MEDIDO (telemetria real) confrontado com o
// SIMULADO (lib/cmv.ts) usando o volume real daquele cliente.
//
// A calculadora sozinha responde "quanto vai custar antes de fechar preço".
// Isto responde a pergunta seguinte, que é a que não deixa a margem escapar:
// "quanto está custando AGORA, e o que acontece se este cliente dobrar de uso?"

import { prisma } from "@/lib/db";
import {
  CENARIO_PADRAO,
  PERFIS_PADRAO,
  analisarMargem,
  consolidarMes,
  curvaSensibilidade,
  type Agente,
  type Cenario,
} from "@/lib/cmv";
import { agentesAtivos, calcularFatura, type Produto } from "@/lib/planos";

const USD_BRL = CENARIO_PADRAO.usdBrl;

// Volume REAL de conversas por agente no período, e o custo REAL de IA.
// Conversas de simulação ficam de fora do volume (são ensaio), mas o custo
// delas entra no medido — porque a fatura da Anthropic vem do mesmo jeito.
async function medirVolume(imobiliariaId: number, desde: Date) {
  const [porAgente, uso] = await Promise.all([
    prisma.conversa.groupBy({
      by: ["agente"],
      where: { imobiliariaId, simulacao: false, atualizadaEm: { gte: desde } },
      _count: true,
    }),
    prisma.usoIA.aggregate({
      where: { imobiliariaId, criadoEm: { gte: desde } },
      _sum: { custoUsd: true },
      _count: true,
    }),
  ]);

  const volume = { ...CENARIO_PADRAO.volume };
  for (const chave of Object.keys(volume) as Agente[]) volume[chave] = 0;
  for (const l of porAgente) {
    const a = l.agente as Agente;
    if (a in volume) volume[a] = l._count;
  }

  return {
    volume,
    conversasReais: porAgente.reduce((s, l) => s + l._count, 0),
    turnos: uso._count,
    custoRealBrl: (uso._sum.custoUsd ?? 0) * USD_BRL,
  };
}

export type CmvDoCliente = Awaited<ReturnType<typeof cmvDoCliente>>;

export async function cmvDoCliente(params: {
  imobiliariaId: number;
  modulos: string[];
  addons: string[];
  produto: Produto;
  contratosAtivos: number;
  leadsAtendidos: number;
  infraPorClienteBrl?: number;
}) {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const medido = await medirVolume(params.imobiliariaId, inicioMes);
  const ativos = agentesAtivos(params.modulos, params.addons);

  // Cenário do cliente: os parâmetros de custo do modelo, mas o VOLUME dele.
  const cenario: Cenario = { ...CENARIO_PADRAO, volume: medido.volume };
  const consolidado = consolidarMes(cenario, PERFIS_PADRAO, ativos);

  // Receita real: mensalidade + medidores do plano dele.
  const fatura = calcularFatura({
    produto: params.produto,
    contratosAtivos: params.contratosAtivos,
    leadsAtendidos: params.leadsAtendidos,
    cmvIaCentavos: Math.round(medido.custoRealBrl * 100),
  });
  const receitaBrl = fatura.total / 100;
  const infra = params.infraPorClienteBrl ?? 35;

  // A margem que vale é a do custo MEDIDO — o simulado serve de conferência.
  const margemMedida = analisarMargem(
    receitaBrl,
    { ...consolidado, brlIa: medido.custoRealBrl },
    infra
  );
  const margemSimulada = analisarMargem(receitaBrl, consolidado, infra);

  // Divergência medido × simulado: acima de 25% os parâmetros de PERFIS_PADRAO
  // estão desatualizados para este cliente (ou há consumo não atribuído).
  const desvioPct =
    consolidado.brlIa > 0
      ? ((medido.custoRealBrl - consolidado.brlIa) / consolidado.brlIa) * 100
      : null;

  // "E se dobrar?" — a linha onde a margem fica vermelha é a cota que o plano
  // deste cliente deveria ter.
  const sensibilidade = curvaSensibilidade(
    receitaBrl,
    cenario,
    PERFIS_PADRAO,
    ativos,
    infra,
    [1, 1.5, 2, 3, 5]
  );

  const cotaBrl = params.produto.cotaIaCentavos / 100;
  return {
    medido,
    consolidado,
    fatura,
    receitaBrl,
    infra,
    margemMedida,
    margemSimulada,
    desvioPct,
    sensibilidade,
    cotaBrl,
    usoCotaPct: cotaBrl > 0 ? (medido.custoRealBrl / cotaBrl) * 100 : null,
  };
}
