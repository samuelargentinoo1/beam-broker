// Monitor de saúde das instâncias de WhatsApp (uazapi).
//
// A conexão em si é mantida pelo celular vinculado + servidor uazapi; o sistema
// não segura a sessão no ar. O que o monitor faz é: checar o estado de cada
// instância periodicamente (Vercel Cron), registrar quando cai (visível em
// Configurações → Mensagens recebidas) e, quando desconectada, disparar uma
// tentativa de reconexão segura (só age se estiver realmente fora).

import { prisma } from "@/lib/db";
import { statusUazapi, reconectarUazapi } from "@/lib/uazapi";

export async function monitorarInstancias() {
  const imobs = await prisma.imobiliaria.findMany({
    where: { uazapiToken: { not: null } },
    select: { id: true, nome: true },
  });

  const resultado: { imobiliaria: string; conectado: boolean; acao?: string }[] = [];

  for (const im of imobs) {
    const st = await statusUazapi(im.id);
    let acao: string | undefined;

    if (!st.conectado) {
      // tenta reconectar (a função é status-safe: não mexe se já conectado)
      const rec = await reconectarUazapi(im.id);
      acao = rec.ok ? "reconexão solicitada" : `falha na reconexão: ${rec.detalhe}`;
      await prisma.webhookLog.create({
        data: {
          provedor: "monitor",
          imobiliariaId: im.id,
          resultado: `⚠️ WhatsApp DESCONECTADO (${st.estado}) — ${acao}. Se persistir, releia o QR em Configurações.`,
          corpo: JSON.stringify({ servidor: st.servidor, detalhe: st.detalhe, reconexao: rec.detalhe }).slice(0, 2000),
        },
      });
    }

    resultado.push({ imobiliaria: im.nome, conectado: st.conectado, acao });
  }

  return resultado;
}
