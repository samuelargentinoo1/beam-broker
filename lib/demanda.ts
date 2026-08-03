// Demanda represada: o que a IA identificou mas o cliente não contratou o
// módulo para atender. Lido pelo cliente (card discreto no Dashboard) e pelo
// dono (agregado no painel, para saber a quem ligar).

import { prisma } from "@/lib/db";

const NOME_ASSUNTO: Record<string, string> = {
  ADM: "administração de imóveis",
  COMERCIAL: "aluguel e compra de imóveis",
  CAPTACAO: "anunciar um imóvel",
};

export function assuntoDoModulo(modulo: string): string {
  return NOME_ASSUNTO[modulo] ?? "outros assuntos";
}

// Resumo do mês para o card do cliente. Usa o módulo mais procurado para
// nomear o assunto — o texto fala de gente, não de plano.
export async function resumoDemandaNaoAtendida(imobiliariaId: number, desde: Date) {
  const linhas = await prisma.demandaNaoAtendida.groupBy({
    by: ["modulo"],
    where: { imobiliariaId, em: { gte: desde } },
    _count: true,
  });
  const total = linhas.reduce((s, l) => s + l._count, 0);
  if (total === 0) return { total: 0, foraDoHorario: 0, assunto: "", porModulo: [] as const };

  const foraDoHorario = await prisma.demandaNaoAtendida.count({
    where: { imobiliariaId, em: { gte: desde }, foraDoHorario: true },
  });
  const principal = [...linhas].sort((a, b) => b._count - a._count)[0]!;
  return {
    total,
    foraDoHorario,
    assunto: assuntoDoModulo(principal.modulo),
    porModulo: linhas.map((l) => ({ modulo: l.modulo, total: l._count })),
  };
}

// Agregado dos últimos N dias por módulo — a visão do dono.
export async function demandaPorModulo(imobiliariaId: number, dias = 90) {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const linhas = await prisma.demandaNaoAtendida.groupBy({
    by: ["modulo"],
    where: { imobiliariaId, em: { gte: desde } },
    _count: true,
  });
  return linhas
    .map((l) => ({ modulo: l.modulo, total: l._count }))
    .sort((a, b) => b.total - a.total);
}

// Total do mês corrente por imobiliária — coluna "demanda represada" na lista
// de clientes do painel do dono.
export async function demandaDoMesPorImobiliaria(): Promise<Map<number, number>> {
  const inicio = new Date();
  inicio.setDate(1);
  inicio.setHours(0, 0, 0, 0);
  const linhas = await prisma.demandaNaoAtendida.groupBy({
    by: ["imobiliariaId"],
    where: { em: { gte: inicio } },
    _count: true,
  });
  return new Map(linhas.map((l) => [l.imobiliariaId, l._count]));
}
