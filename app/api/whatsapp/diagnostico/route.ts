import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessao } from "@/lib/sessao";
import {
  statusUazapi,
  enviarTesteUazapi,
  criarInstanciaUazapi,
  reconectarUazapi,
  configurarWebhookUazapi,
} from "@/lib/uazapi";
import { testarIA } from "@/lib/agentes";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Diagnóstico do WhatsApp, escopado à imobiliária logada. Roda no servidor
// (Vercel), então alcança o servidor uazapi mesmo que o navegador não alcance.
export async function POST(req: NextRequest) {
  const sessao = await getSessao();
  if (!sessao) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const acao = body?.acao;

  if (acao === "status") {
    const status = await statusUazapi(sessao.imobiliaria.id);
    return NextResponse.json(status);
  }
  if (acao === "enviar") {
    const numero = String(body?.numero ?? "").trim();
    if (!numero) return NextResponse.json({ ok: false, detalhe: "Informe um número." });
    const r = await enviarTesteUazapi(sessao.imobiliaria.id, numero);
    return NextResponse.json(r);
  }
  if (acao === "criar-instancia") {
    const r = await criarInstanciaUazapi(sessao.imobiliaria.id, {
      serverUrl: String(body?.serverUrl ?? "").trim(),
      adminToken: String(body?.adminToken ?? "").trim(),
      nome: String(body?.nome ?? "").trim(),
    });
    return NextResponse.json(r);
  }
  if (acao === "reconectar") {
    const r = await reconectarUazapi(sessao.imobiliaria.id);
    return NextResponse.json(r);
  }
  if (acao === "ia") {
    const r = await testarIA();
    return NextResponse.json(r);
  }
  if (acao === "configurar-webhook") {
    const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, "");
    // Marca a URL com o id da imobiliária: cada instância uazapi passa a postar
    // numa URL "carimbada" com o seu tenant, então o webhook roteia com certeza
    // para a imobiliária certa (multi-número), sem depender de token/fallback.
    // Carrega também o segredo do webhook (?s=) quando configurado — é a camada
    // que faz o handler rejeitar (401) requisições sem o segredo.
    const segredo = process.env.UAZAPI_WEBHOOK_SECRET;
    const sufixoSegredo = segredo ? `&s=${encodeURIComponent(segredo)}` : "";
    const r = await configurarWebhookUazapi(
      sessao.imobiliaria.id,
      `${base}/api/webhooks/uazapi?imob=${sessao.imobiliaria.id}${sufixoSegredo}`
    );
    // A URL configurada carrega o segredo do webhook; ele vai para a uazapi, não
    // para a tela. Redige antes de responder — quem tivesse o segredo poderia
    // forjar webhooks e escrever dentro de qualquer tenant.
    const redigir = (t: unknown) =>
      segredo && typeof t === "string" ? t.split(encodeURIComponent(segredo)).join("***").split(segredo).join("***") : t;
    return NextResponse.json({ ...r, detalhe: redigir((r as { detalhe?: unknown }).detalhe) });
  }
  if (acao === "webhooks") {
    // ESCOPO OBRIGATÓRIO: o WebhookLog é uma tabela global (guarda o payload cru
    // de TODOS os tenants, com telefone e texto das mensagens dos clientes
    // finais). Sem o filtro por imobiliária, esta rota entregava a conversa dos
    // clientes de uma imobiliária para qualquer usuário logado de outra.
    // Os registros sem tenant identificado (imobiliariaId null — webhook que não
    // foi roteado) NÃO entram aqui: podem ser de qualquer instância.
    const logs = await prisma.webhookLog.findMany({
      where: { imobiliariaId: sessao.imobiliaria.id },
      orderBy: { recebidoEm: "desc" },
      take: 10,
    });
    return NextResponse.json({
      logs: logs.map((l) => ({
        recebidoEm: l.recebidoEm,
        resultado: l.resultado,
        telefone: l.telefone,
        corpo: l.corpo.slice(0, 500),
      })),
    });
  }
  return NextResponse.json({ error: "ação inválida" }, { status: 400 });
}
