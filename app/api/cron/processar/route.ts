import { NextRequest, NextResponse } from "next/server";
import { processarFila } from "@/lib/proativo";

export const maxDuration = 60; // agora o timeout é POR lote de jobs, não global
export const dynamic = "force-dynamic";

// Consumidor da fila de jobs (chamado pelo Vercel Cron a cada minuto): processa
// alguns jobs pendentes por invocação, cada tenant isolado. CRON_SECRET
// obrigatório em produção.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("CRON_SECRET ausente — recusando o cron (processar).");
      return NextResponse.json({ error: "cron não configurado (defina CRON_SECRET)" }, { status: 500 });
    }
  } else if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const r = await processarFila(5);
  return NextResponse.json({ ok: true, ...r });
}
