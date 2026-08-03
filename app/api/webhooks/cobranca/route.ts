import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { baixarFatura } from "@/lib/baixa";

// Webhook de baixa automática do gateway de cobrança.
// Aceita o formato do Asaas ({event: "PAYMENT_RECEIVED", payment: {...}})
// e um formato simples para testes ({gatewayId, formaPagamento?, valor?}).
export async function POST(req: NextRequest) {
  // Autenticação do webhook (fail-closed): o Asaas envia o token configurado no
  // header. Sem WEBHOOK_COBRANCA_TOKEN em produção, RECUSA — evita que qualquer
  // um marque faturas como pagas. Em dev segue para facilitar testes locais.
  const tokenEsperado = process.env.WEBHOOK_COBRANCA_TOKEN;
  if (!tokenEsperado) {
    if (process.env.NODE_ENV === "production")
      return NextResponse.json({ error: "webhook não configurado (defina WEBHOOK_COBRANCA_TOKEN)" }, { status: 401 });
  } else {
    const recebido =
      req.headers.get("asaas-access-token") ??
      req.headers.get("x-webhook-token") ??
      req.nextUrl.searchParams.get("token");
    if (recebido !== tokenEsperado) {
      return NextResponse.json({ error: "não autorizado" }, { status: 401 });
    }
  }

  const body = await req.json();
  // Em produção, só o formato oficial do gateway (event+payment). O formato
  // "simples" (marca pago por gatewayId) fica restrito a dev/teste.
  if (!body?.event && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "formato não suportado" }, { status: 400 });
  }

  let gatewayId: string | undefined;
  let formaPagamento = "PIX";
  let valorPago: number | undefined;

  if (body.event && body.payment) {
    // Formato Asaas
    if (!["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(body.event)) {
      return NextResponse.json({ ignorado: body.event });
    }
    gatewayId = body.payment.id;
    valorPago = body.payment.value;
    formaPagamento =
      body.payment.billingType === "BOLETO"
        ? "BOLETO"
        : body.payment.billingType === "CREDIT_CARD"
          ? "CARTAO"
          : "PIX";
  } else {
    // Formato simples (testes/integrações próprias)
    gatewayId = body.gatewayId;
    formaPagamento = body.formaPagamento ?? "PIX";
    valorPago = body.valor;
  }

  if (!gatewayId) {
    return NextResponse.json({ error: "gatewayId ausente" }, { status: 400 });
  }

  // Idempotência: o Asaas reenvia o mesmo evento. Se já processamos este id de
  // evento, ignora. (A baixa em si já é idempotente — isto é defesa extra e evita
  // reprocessar/reavisar.) Sem id de evento, seguimos: a baixa cobre o resto.
  const eventoId = body?.id ? String(body.id) : gatewayId ? `${body.event ?? "?"}:${gatewayId}` : null;
  if (eventoId) {
    const jaVisto = await prisma.eventoWebhook.findUnique({
      where: { provedor_eventoId: { provedor: "asaas", eventoId } },
    });
    if (jaVisto) return NextResponse.json({ ok: true, duplicado: true });
  }

  const fatura = await prisma.fatura.findUnique({ where: { gatewayId } });
  if (!fatura) {
    return NextResponse.json({ error: "fatura não encontrada" }, { status: 404 });
  }

  try {
    const atualizada = await baixarFatura({ faturaId: fatura.id, formaPagamento, valorPago });
    // marca o evento como processado (best-effort) — reenvios futuros são ignorados
    if (eventoId)
      await prisma.eventoWebhook.create({ data: { provedor: "asaas", eventoId } }).catch(() => {});
    return NextResponse.json({ ok: true, faturaId: atualizada.id, status: atualizada.status });
  } catch (e) {
    // Não devolve 500 (evita retry-storm do gateway). A idempotência da baixa
    // já protege contra duplicidade; registra o erro para diagnóstico.
    console.error("baixarFatura (webhook) falhou:", e);
    return NextResponse.json({ ok: false, erro: "falha ao processar baixa" });
  }
}
