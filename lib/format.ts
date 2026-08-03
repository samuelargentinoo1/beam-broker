import type { Prisma } from "@prisma/client";

// Aceita Decimal (Prisma), number ou null. Decimal é convertido para number só
// aqui, na borda de apresentação.
export function brl(valor: Prisma.Decimal | number | string | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  const n = typeof valor === "number" ? valor : Number(valor);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TZ_BR = "America/Sao_Paulo";

export function dataBr(data: Date | string | null | undefined): string {
  if (!data) return "—";
  // Formata sempre no fuso de Brasília — o servidor (Vercel) roda em UTC.
  return new Date(data).toLocaleDateString("pt-BR", { timeZone: TZ_BR });
}

// Ano/mês/dia do relógio de parede em Brasília para uma data (independe do
// fuso do servidor). Evita erro de competência/vencimento na virada do dia.
export function partesBrasilia(ref: Date = new Date()): { ano: number; mes: number; dia: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_BR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ref);
  const get = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { ano: get("year"), mes: get("month"), dia: get("day") };
}

export function competenciaAtual(ref: Date = new Date()): string {
  const { ano, mes } = partesBrasilia(ref);
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

// Data de vencimento (dia do mês) fixada ao meio-dia UTC — assim o dia exibido
// é o mesmo em UTC e em Brasília, sem risco de "voltar um dia" na formatação.
export function dataVencimento(ano: number, mes1a12: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1a12 - 1, dia, 12, 0, 0));
}

// Próximo número de uma sequência de códigos (ex.: AP-0007) a partir do MAIOR
// código existente com aquele prefixo — não do count. Assim, apagar um registro
// não faz o próximo cadastro colidir num código já usado.
export function proximoNumero(codigos: string[], prefixo: string): number {
  let max = 0;
  for (const c of codigos) {
    const m = c.match(new RegExp(`^${prefixo}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

export function competenciaBr(competencia: string): string {
  // Competências especiais (rescisão "RESC-...", parcelas de acordo "AC1-P2")
  // são exibidas como estão.
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    if (competencia.startsWith("RESC-")) return "Multa rescisória";
    const acordo = competencia.match(/^AC(\d+)-P(\d+)$/);
    if (acordo) return `Acordo #${acordo[1]} — parcela ${acordo[2]}`;
    return competencia;
  }
  const [ano, mes] = competencia.split("-");
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

export function diasEmAtraso(vencimento: Date): number {
  const hoje = new Date();
  const diff = Math.floor((hoje.getTime() - new Date(vencimento).getTime()) / 86_400_000);
  return Math.max(0, diff);
}
