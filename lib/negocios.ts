// Regras do CRM de Negócios.
//
// Duas decisões governam este arquivo:
//   1. O funil é DADO (tabela Funil/FaseFunil), não constante. Quem desenha a
//      régua é a imobiliária; o código só lê. Trocar "Qualificado" por
//      "Diagnóstico" é um UPDATE, não um deploy.
//   2. TODA mudança de estado do negócio grava um EventoNegocio. A linha do
//      tempo não é um extra da tela — é o log do negócio, e a tela só o lê.
//      Por isso mover/ganhar/perder/anotar passam sempre por aqui.

import { prisma } from "@/lib/db";
import type { Prisma, ResultadoNegocio } from "@prisma/client";

// Funil que a imobiliária recebe ao abrir o módulo pela primeira vez. É um
// ponto de partida editável, não uma regra: as fases vivem no banco.
export const FASES_PADRAO = [
  "Novo",
  "Qualificado",
  "Em atendimento",
  "Visita",
  "Proposta",
  "Fechado",
] as const;

export const FUNIL_PADRAO = "Venda";

// Os quatro pipelines do comercial. Cada um tem régua PRÓPRIA: locação não passa
// por proposta, captação nem começa em lead. Um funil só, com etapas genéricas,
// obriga a equipe a fingir que a etapa existe — e o relatório mente junto.
export const PIPELINES: Record<string, readonly string[]> = {
  Venda: FASES_PADRAO,
  "Locação": ["Novo", "Qualificado", "Visita", "Cadastro", "Análise", "Fechado"],
  "Lançamento": ["Interesse", "Simulação", "Reserva", "Contrato", "Assinado", "Fechado"],
  "Captação": ["Contato", "Visita técnica", "Autorização", "Fotos", "Publicado", "Fechado"],
};

// Perder sem motivo não vira aprendizado. Lista fixa: texto livre aqui produz
// 40 grafias de "sem crédito" e nenhum gráfico utilizável.
export const MOTIVOS_PERDA = [
  "Sem crédito",
  "Achou mais barato",
  "Sumiu",
  "Comprou com concorrente",
  "Preço alto",
  "Desistiu",
  "Imóvel indisponível",
] as const;

// Probabilidade por etapa — base da previsão ponderada do mês.
export const PROBABILIDADE_ETAPA: Record<string, number> = {
  Novo: 0.05, Qualificado: 0.15, "Em atendimento": 0.3, Visita: 0.5, Proposta: 0.75,
  Cadastro: 0.6, "Análise": 0.8,
  Interesse: 0.1, "Simulação": 0.3, Reserva: 0.6, Contrato: 0.85, Assinado: 0.95,
  Contato: 0.2, "Visita técnica": 0.4, "Autorização": 0.7, Fotos: 0.85, Publicado: 0.95,
  Fechado: 1,
};

export type TipoEvento =
  | "NEGOCIO_CRIADO"
  | "FASE_ALTERADA"
  | "NOTA"
  | "ATIVIDADE_CONCLUIDA"
  | "EMAIL"
  | "GANHO"
  | "PERDIDO";

// Filtros da linha do tempo, exatamente como aparecem na tela.
export const FILTROS_TIMELINE = {
  todas: null,
  email: ["EMAIL"],
  notas: ["NOTA"],
  atividades: ["ATIVIDADE_CONCLUIDA", "FASE_ALTERADA", "NEGOCIO_CRIADO", "GANHO", "PERDIDO"],
} as const;

export type ChaveFiltro = keyof typeof FILTROS_TIMELINE;

export const TIPOS_ATIVIDADE = ["TAREFA", "LIGACAO", "EMAIL", "REUNIAO", "VISITA"] as const;
export type TipoAtividade = (typeof TIPOS_ATIVIDADE)[number];

export const ROTULO_ATIVIDADE: Record<TipoAtividade, string> = {
  TAREFA: "Tarefa",
  LIGACAO: "Ligação",
  EMAIL: "E-mail",
  REUNIAO: "Reunião",
  VISITA: "Visita",
};

// ─── Funil ──────────────────────────────────────────────────────────────────

// Garante que a imobiliária tenha ao menos um funil utilizável. Chamado ao
// abrir o quadro: um CRM que abre vazio e sem colunas não ensina nada.
export async function garantirFunil(imobiliariaId: number) {
  // Provisiona os quatro pipelines na primeira abertura. Idempotente: rodar de
  // novo não duplica funil nem fase.
  const nomes = Object.keys(PIPELINES);
  const existentes = await prisma.funil.findMany({
    where: { imobiliariaId },
    select: { id: true, nome: true, _count: { select: { fases: true } } },
  });
  const porNome = new Map(existentes.map((f) => [f.nome, f]));
  const faltando = nomes.filter((n) => !porNome.get(n) || porNome.get(n)!._count.fases === 0);

  if (faltando.length) {
    await prisma.$transaction(async (tx) => {
      for (const [i, nome] of nomes.entries()) {
        if (!faltando.includes(nome)) continue;
        const funil =
          porNome.get(nome) ??
          (await tx.funil.create({ data: { imobiliariaId, nome, ordem: i } }));
        await tx.faseFunil.createMany({
          data: PIPELINES[nome]!.map((fase, j) => ({ funilId: funil.id, nome: fase, ordem: j })),
          skipDuplicates: true,
        });
      }
    });
  }

  return prisma.funil.findFirstOrThrow({
    where: { imobiliariaId },
    orderBy: { ordem: "asc" },
    include: { fases: { orderBy: { ordem: "asc" } } },
  });
}

export async function listarFunis(imobiliariaId: number) {
  return prisma.funil.findMany({
    where: { imobiliariaId },
    orderBy: { ordem: "asc" },
    include: { fases: { orderBy: { ordem: "asc" } } },
  });
}

// ─── Quadro ─────────────────────────────────────────────────────────────────

export type CardNegocio = {
  id: number;
  titulo: string;
  valor: number | null;
  faseId: number;
  contatoNome: string | null;
  responsavelNome: string | null;
  diasNaFase: number;
  atividadesPendentes: number;
  atividadesAtrasadas: number;
  interacoes: number;
  responsavelIniciais: string;
  travadoPor: string | null;
  travadoAte: string | null;
  probabilidade: number;
};

export function iniciais(nome: string | null): string {
  if (!nome) return "—";
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function diasEntre(de: Date, ate: Date = new Date()): number {
  const ms = ate.getTime() - de.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export async function carregarQuadro(imobiliariaId: number, funilId: number) {
  const agora = new Date();
  const negocios = await prisma.negocio.findMany({
    // Ganhos e perdidos saem do quadro: o funil mostra o que está EM JOGO.
    where: { imobiliariaId, funilId, resultado: "ABERTO" },
    orderBy: { criadoEm: "desc" },
    include: {
      responsavel: { select: { nome: true } },
      travadoPor: { select: { nome: true } },
      contato: { select: { nome: true } },
      atividades: { where: { status: "PENDENTE" }, select: { quando: true } },
      _count: { select: { eventos: true } },
    },
  });

  const cards: CardNegocio[] = negocios.map((n) => ({
    id: n.id,
    titulo: n.titulo,
    valor: n.valor ? Number(n.valor) : null,
    faseId: n.faseId,
    contatoNome: n.contato?.nome ?? n.contatoNome,
    responsavelNome: n.responsavel?.nome ?? null,
    diasNaFase: diasEntre(n.faseDesde, agora),
    atividadesPendentes: n.atividades.length,
    atividadesAtrasadas: n.atividades.filter((a) => a.quando < agora).length,
    interacoes: n._count.eventos,
    responsavelIniciais: iniciais(n.responsavel?.nome ?? null),
    // A trava só vale enquanto não vence — depois disso o negócio volta a ser
    // de quem pegar, e o selo some sozinho.
    travadoPor: n.travadoAte && n.travadoAte > agora ? (n.travadoPor?.nome?.split(" ")[0] ?? null) : null,
    travadoAte:
      n.travadoAte && n.travadoAte > agora
        ? n.travadoAte.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
        : null,
    probabilidade: Number(n.probabilidade),
  }));

  return cards;
}

// Totais por fase — a soma que aparece no cabeçalho de cada coluna. Negócio
// "sem valor" conta na quantidade mas não soma dinheiro.
export function totaisPorFase(cards: CardNegocio[], faseId: number) {
  const daFase = cards.filter((c) => c.faseId === faseId);
  return {
    quantidade: daFase.length,
    valor: daFase.reduce((s, c) => s + (c.valor ?? 0), 0),
  };
}

// ─── Mutações (toda uma grava evento) ───────────────────────────────────────

async function registrar(
  tx: Prisma.TransactionClient,
  negocioId: number,
  tipo: TipoEvento,
  titulo: string,
  detalhe?: string | null,
  autorId?: number | null
) {
  await tx.eventoNegocio.create({
    data: { negocioId, tipo, titulo, detalhe: detalhe ?? null, autorId: autorId ?? null },
  });
}

export async function criarNegocio(params: {
  imobiliariaId: number;
  funilId: number;
  faseId: number;
  titulo: string;
  valor?: number | null;
  contatoNome?: string | null;
  contatoTelefone?: string | null;
  responsavelId?: number | null;
  autorId?: number | null;
}) {
  return prisma.$transaction(async (tx) => {
    const n = await tx.negocio.create({
      data: {
        imobiliariaId: params.imobiliariaId,
        funilId: params.funilId,
        faseId: params.faseId,
        titulo: params.titulo,
        valor: params.valor ?? null,
        contatoNome: params.contatoNome ?? null,
        contatoTelefone: params.contatoTelefone ?? null,
        responsavelId: params.responsavelId ?? null,
      },
    });
    await registrar(tx, n.id, "NEGOCIO_CRIADO", "Negócio adicionado", null, params.autorId);
    return n;
  });
}

// Move o negócio de fase. Regrava faseDesde (é o relógio de "dias na fase") e
// registra o de-para na linha do tempo — sem isso, ninguém sabe se o negócio
// avançou ou voltou.
export async function moverFase(negocioId: number, faseId: number, autorId?: number | null) {
  return prisma.$transaction(async (tx) => {
    const atual = await tx.negocio.findUniqueOrThrow({
      where: { id: negocioId },
      include: { fase: true, funil: true },
    });
    if (atual.faseId === faseId) return atual;

    const nova = await tx.faseFunil.findUniqueOrThrow({ where: { id: faseId } });
    // Uma fase de OUTRO funil moveria o negócio para um quadro onde ele não
    // aparece — recusa em vez de sumir com o card.
    if (nova.funilId !== atual.funilId) throw new Error("A fase é de outro funil.");

    const movido = await tx.negocio.update({
      where: { id: negocioId },
      data: {
        faseId,
        faseDesde: new Date(),
        // A probabilidade acompanha a etapa: previsão que não muda ao avançar o
        // negócio não é previsão, é enfeite.
        probabilidade: PROBABILIDADE_ETAPA[nova.nome] ?? 0.3,
      },
    });
    await registrar(
      tx,
      negocioId,
      "FASE_ALTERADA",
      "Fase alterada",
      `De ${atual.fase.nome} para ${nova.nome}`,
      autorId
    );
    return movido;
  });
}

export async function definirResultado(
  negocioId: number,
  resultado: ResultadoNegocio,
  autorId?: number | null,
  motivoPerda?: string | null
) {
  // Perda SEM motivo é recusada aqui, não só na tela: é este campo que sustenta
  // o gráfico de motivos do painel do dono. Sem ele, a estatística nasce furada.
  if (resultado === "PERDIDO" && !motivoPerda) {
    throw new Error("Informe o motivo da perda.");
  }
  return prisma.$transaction(async (tx) => {
    const n = await tx.negocio.update({
      where: { id: negocioId },
      data: {
        resultado,
        fechadoEm: resultado === "ABERTO" ? null : new Date(),
        motivoPerda: resultado === "PERDIDO" ? motivoPerda : null,
      },
    });
    if (resultado !== "ABERTO") {
      await registrar(
        tx,
        negocioId,
        resultado === "GANHO" ? "GANHO" : "PERDIDO",
        resultado === "GANHO" ? "Negócio ganho" : "Negócio perdido",
        resultado === "PERDIDO" ? `Motivo: ${motivoPerda}` : null,
        autorId
      );
    }
    return n;
  });
}

// Previsão ponderada do mês: soma de valor × probabilidade dos negócios abertos.
export function previsaoPonderada(cards: CardNegocio[]) {
  return cards.reduce((s, c) => s + (c.valor ?? 0) * c.probabilidade, 0);
}

export async function anotar(
  negocioId: number,
  texto: string,
  autorId?: number | null,
  tipo: "NOTA" | "EMAIL" = "NOTA"
) {
  return prisma.eventoNegocio.create({
    data: {
      negocioId,
      tipo,
      titulo: tipo === "EMAIL" ? "E-mail registrado" : "Nota",
      detalhe: texto,
      autorId: autorId ?? null,
    },
  });
}

// ─── Atividades ─────────────────────────────────────────────────────────────

export async function criarAtividade(params: {
  negocioId: number;
  titulo: string;
  quando: Date;
  tipo?: TipoAtividade;
  responsavelId?: number | null;
}) {
  return prisma.atividadeCrm.create({
    data: {
      negocioId: params.negocioId,
      titulo: params.titulo,
      quando: params.quando,
      tipo: params.tipo ?? "TAREFA",
      responsavelId: params.responsavelId ?? null,
    },
  });
}

// Concluir a atividade é o que a joga na linha do tempo — é o registro do que
// foi FEITO, e é dele que sai o histórico do negócio.
export async function concluirAtividade(atividadeId: number, autorId?: number | null) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.atividadeCrm.findUniqueOrThrow({ where: { id: atividadeId } });
    if (a.status === "CONCLUIDA") return a;

    const agora = new Date();
    const feita = await tx.atividadeCrm.update({
      where: { id: atividadeId },
      data: { status: "CONCLUIDA", concluidaEm: agora },
    });
    await registrar(
      tx,
      a.negocioId,
      "ATIVIDADE_CONCLUIDA",
      "Atividade concluída",
      `${a.titulo} (${ROTULO_ATIVIDADE[(a.tipo as TipoAtividade) ?? "TAREFA"] ?? a.tipo})`,
      autorId
    );
    return feita;
  });
}

export async function reabrirAtividade(atividadeId: number) {
  return prisma.atividadeCrm.update({
    where: { id: atividadeId },
    data: { status: "PENDENTE", concluidaEm: null },
  });
}

// ─── Campos personalizados (Quiz Raio-X) ────────────────────────────────────

export async function camposDaImobiliaria(imobiliariaId: number) {
  return prisma.campoPersonalizado.findMany({
    where: { imobiliariaId },
    orderBy: { ordem: "asc" },
  });
}

export async function salvarCampos(negocioId: number, valores: Record<number, string>) {
  const entradas = Object.entries(valores);
  if (entradas.length === 0) return;
  await prisma.$transaction(
    entradas.map(([campoId, valor]) =>
      valor.trim() === ""
        ? // Campo esvaziado: apaga o valor em vez de gravar string vazia, para
          // "nenhum campo preenchido" continuar sendo verdade.
          prisma.valorCampoNegocio.deleteMany({
            where: { negocioId, campoId: Number(campoId) },
          })
        : prisma.valorCampoNegocio.upsert({
            where: { negocioId_campoId: { negocioId, campoId: Number(campoId) } },
            update: { valor },
            create: { negocioId, campoId: Number(campoId), valor },
          })
    )
  );
}

// ─── Formatação ─────────────────────────────────────────────────────────────

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// "Hoje, 14:10" / "Ontem, 15:03" / "16 Jul, 10:42" — o formato dos cartões e da
// linha do tempo. Data absoluta só quando o relativo deixa de ajudar.
export function quando(d: Date, agora: Date = new Date()): string {
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const delta = (dia(agora) - dia(d)) / 86_400_000;
  if (delta === 0) return `Hoje, ${hora}`;
  if (delta === 1) return `Ontem, ${hora}`;
  // "29 Jul" — o toLocaleDateString pt-BR devolve "29 de jul."; o formato curto
  // é montado à mão porque é ele que cabe no card e na linha do tempo.
  const mes = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd} ${mes.charAt(0).toUpperCase()}${mes.slice(1)}, ${hora}`;
}
