// Helpers do painel do dono. A guarda de acesso é exigirOperador() (lib/operador.ts):
// o dono é um Operador, entidade própria — não um Usuario com flag, que o obrigaria
// a ser funcionário de alguma imobiliária.

import { prisma } from "@/lib/db";
import { exigirOperador } from "@/lib/operador";

// Câmbio de referência para converter o custo medido (USD) em BRL. Mantido em
// linha com o CENARIO_PADRAO da calculadora (lib/cmv.ts). Ajuste se destoar.
const USD_BRL = 5.6;

export function brlDeCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Custo real MEDIDO por agente nos últimos N dias — alimenta a coluna
// "medido × simulado" da calculadora. Usa a telemetria real (tabela UsoIA), que
// grava custoUsd por turno. _count conta TURNOS (uma linha por chamada), não
// conversas distintas — então "por conversa" aqui superestima o denominador e
// sai otimista; quando a telemetria acumular, agrupe por conversa de verdade.
export async function custoRealPorAgente(dias = 30) {
  await exigirOperador();
  const desde = new Date(Date.now() - dias * 86_400_000);
  const linhas = await prisma.usoIA.groupBy({
    by: ["agente"],
    where: { criadoEm: { gte: desde } },
    _sum: { custoUsd: true },
    _count: true,
  });
  return linhas
    .filter((l) => l._count > 0)
    .map((l) => ({
      agente: l.agente as string,
      conversas: l._count,
      brlPorConversa: ((l._sum.custoUsd ?? 0) / l._count) * USD_BRL,
    }));
}
