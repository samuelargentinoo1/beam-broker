import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

// Serve o áudio de uma mensagem (nota de voz do cliente ou fala da IA) guardado
// no banco, para o player do painel de atendimento. Protegido: só o usuário
// logado, e apenas mensagens de conversas da SUA imobiliária.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await getSessao();
  if (!sessao) return new NextResponse("não autenticado", { status: 401 });

  const { id } = await params;
  const msg = await prisma.mensagem.findUnique({
    where: { id: Number(id) },
    select: {
      audioUrl: true,
      audioDados: true,
      audioMime: true,
      conversa: { select: { imobiliariaId: true } },
    },
  });
  if (!msg || (!msg.audioUrl && !msg.audioDados))
    return new NextResponse("não encontrado", { status: 404 });
  if (msg.conversa.imobiliariaId !== sessao.imobiliaria.id)
    return new NextResponse("sem acesso", { status: 403 });

  // Áudio no Blob (privado): faz stream pela rota (já autenticada); a URL do blob
  // nunca é exposta ao cliente. Fallback: bytes no banco (dev/legado).
  if (msg.audioUrl) {
    try {
      const { get } = await import("@vercel/blob");
      const r = await get(msg.audioUrl, { access: "private" });
      if (r?.stream) {
        return new NextResponse(r.stream, {
          headers: {
            "Content-Type": msg.audioMime || "audio/mpeg",
            "Cache-Control": "private, max-age=86400",
          },
        });
      }
    } catch {
      /* cai no fallback */
    }
  }
  if (!msg.audioDados) return new NextResponse("não encontrado", { status: 404 });
  const bytes = Buffer.from(msg.audioDados);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": msg.audioMime || "audio/mpeg",
      "Cache-Control": "private, max-age=86400",
      "Content-Length": String(bytes.length),
    },
  });
}
