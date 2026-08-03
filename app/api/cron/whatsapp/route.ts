import { NextRequest, NextResponse } from "next/server";
import { monitorarInstancias } from "@/lib/monitor";
import { processarFollowUps, enviarAvisosProprietarioAgendados } from "@/lib/followup";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Cron de alta frequência (a cada 15 min — vercel.json):
//  1) monitora a conexão do WhatsApp (reconecta instâncias caídas);
//  2) roda a cadência de follow-up comercial (toques de 2h/6h/24h/72h/7d, só em
//     horário comercial). Roda frequente para os toques curtos (2h/6h) saírem na
//     hora certa. Também dá para chamar manualmente com o CRON_SECRET.
export async function GET(req: NextRequest) {
  // CRON_SECRET obrigatório em produção: sem ele, 500 (config) — nunca executa
  // sem proteção. Com a env, auth errada → 401.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("CRON_SECRET ausente — recusando o cron (whatsapp).");
      return NextResponse.json({ error: "cron não configurado (defina CRON_SECRET)" }, { status: 500 });
    }
  } else if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const instancias = await monitorarInstancias();
  const followUps = await processarFollowUps().catch((e) => {
    console.error("processarFollowUps:", e);
    return 0;
  });
  const avisosProprietario = await enviarAvisosProprietarioAgendados().catch((e) => {
    console.error("enviarAvisosProprietarioAgendados:", e);
    return 0;
  });
  return NextResponse.json({ ok: true, instancias, followUps, avisosProprietario });
}
