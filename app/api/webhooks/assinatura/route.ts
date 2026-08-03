import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { concluirAssinatura } from "@/lib/assinatura";

// Webhook da plataforma de assinatura (formato ZapSign: {event_type, token}).
// Aceita também formato simples para testes: {assinaturaId}.
export async function POST(req: NextRequest) {
  // Autenticação do webhook (fail-closed em produção): a ZapSign envia o token
  // configurado. Sem ZAPSIGN_WEBHOOK_TOKEN em produção, RECUSA — evita que
  // qualquer um conclua assinaturas de contratos.
  const tokenEsperado = process.env.ZAPSIGN_WEBHOOK_TOKEN;
  if (!tokenEsperado) {
    if (process.env.NODE_ENV === "production")
      return NextResponse.json({ error: "webhook não configurado (defina ZAPSIGN_WEBHOOK_TOKEN)" }, { status: 401 });
  } else {
    const recebido =
      req.headers.get("x-webhook-token") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      req.nextUrl.searchParams.get("token");
    if (recebido !== tokenEsperado)
      return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const body = await req.json();

  const eventType: string | undefined = body.event_type;
  const assinaturaId: string | undefined = body.token ?? body.assinaturaId;

  if (eventType && eventType !== "doc_signed") {
    return NextResponse.json({ ignorado: eventType });
  }
  if (!assinaturaId) {
    return NextResponse.json({ error: "token/assinaturaId ausente" }, { status: 400 });
  }

  // Idempotência: a ZapSign reenvia o evento. Chave = doc_signed + assinaturaId.
  const eventoId = `${eventType ?? "doc_signed"}:${assinaturaId}`;
  const jaVisto = await prisma.eventoWebhook.findUnique({
    where: { provedor_eventoId: { provedor: "zapsign", eventoId } },
  });
  if (jaVisto) return NextResponse.json({ ok: true, duplicado: true });

  const contrato = await concluirAssinatura(assinaturaId);
  if (!contrato) {
    return NextResponse.json({ error: "contrato não encontrado" }, { status: 404 });
  }
  await prisma.eventoWebhook.create({ data: { provedor: "zapsign", eventoId } }).catch(() => {});
  return NextResponse.json({ ok: true, contrato: contrato.codigo, status: contrato.assinaturaStatus });
}
