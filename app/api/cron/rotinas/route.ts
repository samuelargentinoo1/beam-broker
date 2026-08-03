import { NextRequest, NextResponse } from "next/server";
import { executarRotinasDiarias } from "@/lib/proativo";

export const maxDuration = 60;

// Rotina diária do sistema — chamada pelo Vercel Cron (vercel.json).
// Gera faturas do mês, marca atrasadas, roda a régua (segundas) e faz o
// follow-up de leads frios pela IA de vendas.
export async function GET(req: NextRequest) {
  // Vercel Cron envia Authorization: Bearer ${CRON_SECRET} quando a env existe.
  // CRON_SECRET é OBRIGATÓRIO em produção: sem ele, 500 (erro de configuração) —
  // NUNCA executa a rotina global sem proteção. Com a env, auth errada → 401.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("CRON_SECRET ausente — recusando o cron (rotinas).");
      return NextResponse.json({ error: "cron não configurado (defina CRON_SECRET)" }, { status: 500 });
    }
  } else if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const resultado = await executarRotinasDiarias();
  return NextResponse.json({ ok: true, ...resultado });
}
