// Telemetria de consumo de IA e cota por imobiliária. Base do custo variável do
// produto: sem isto não dá para saber quanto cada cliente custa nem impor limite.

import { prisma } from "@/lib/db";
import type { AgenteIA } from "@prisma/client";

// Preços por MILHÃO de tokens (USD). Aproximados — ajuste conforme a tabela
// vigente da Anthropic. cacheWrite ~1,25x input; cacheRead ~0,1x input.
type Preco = { input: number; output: number; cacheRead: number; cacheWrite: number };
const PRECOS: Record<string, Preco> = {
  // Claude Sonnet
  "claude-sonnet-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  // Claude Haiku
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1.0 },
};
// Fallback: usa o preço de Sonnet quando o modelo não está na tabela.
const PRECO_PADRAO: Preco = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

export type UsoTokens = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export function custoUsd(modelo: string, u: UsoTokens): number {
  const p = PRECOS[modelo] ?? PRECO_PADRAO;
  const c =
    ((u.inputTokens ?? 0) * p.input +
      (u.outputTokens ?? 0) * p.output +
      (u.cacheReadTokens ?? 0) * p.cacheRead +
      (u.cacheWriteTokens ?? 0) * p.cacheWrite) /
    1_000_000;
  return Math.round(c * 1e6) / 1e6; // 6 casas (micro-dólar)
}

// Registra o consumo de um turno. Nunca lança (telemetria não pode derrubar a
// resposta ao cliente).
export async function registrarUso(
  imobiliariaId: number,
  agente: AgenteIA,
  modelo: string,
  u: UsoTokens
): Promise<void> {
  try {
    await prisma.usoIA.create({
      data: {
        imobiliariaId,
        agente,
        modelo,
        inputTokens: u.inputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
        cacheReadTokens: u.cacheReadTokens ?? 0,
        cacheWriteTokens: u.cacheWriteTokens ?? 0,
        custoUsd: custoUsd(modelo, u),
      },
    });
  } catch (e) {
    console.error("registrarUso falhou:", e);
  }
}

// Custo de IA da imobiliária no mês corrente (USD).
export async function custoMesUsd(imobiliariaId: number, ref: Date = new Date()): Promise<number> {
  const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const r = await prisma.usoIA.aggregate({
    where: { imobiliariaId, criadoEm: { gte: inicio } },
    _sum: { custoUsd: true },
  });
  return r._sum.custoUsd ?? 0;
}

// Câmbio de referência (USD→BRL) para converter o CMV medido em reais. Alinhado
// ao CENARIO_PADRAO da calculadora (lib/cmv.ts).
const USD_BRL = 5.6;

// Competência (YYYY-MM) do mês corrente — usada no painel do dono.
export function competenciaAtual(ref: Date = new Date()): string {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
}

// CMV de IA de uma imobiliária numa competência (YYYY-MM), em CENTAVOS de BRL,
// mais a contagem de turnos registrados. Base da fatura no painel do dono.
export async function cmvDoMes(
  imobiliariaId: number,
  competencia: string
): Promise<{ centavosBrl: number; mensagens: number }> {
  const [ano, mes] = competencia.split("-").map(Number);
  const inicio = new Date(ano, (mes ?? 1) - 1, 1);
  const fim = new Date(ano, mes ?? 1, 1); // 1º dia do mês seguinte
  const r = await prisma.usoIA.aggregate({
    where: { imobiliariaId, criadoEm: { gte: inicio, lt: fim } },
    _sum: { custoUsd: true },
    _count: true,
  });
  const usd = r._sum.custoUsd ?? 0;
  return { centavosBrl: Math.round(usd * USD_BRL * 100), mensagens: r._count };
}

// A imobiliária pode consumir IA? false quando a cota mensal foi atingida.
export async function podeConsumirIA(imobiliariaId: number): Promise<boolean> {
  const imob = await prisma.imobiliaria.findUnique({
    where: { id: imobiliariaId },
    select: { iaCotaMensalUsd: true },
  });
  const cota = imob?.iaCotaMensalUsd;
  if (cota == null || cota <= 0) return true; // sem cota = ilimitado
  return (await custoMesUsd(imobiliariaId)) < cota;
}
