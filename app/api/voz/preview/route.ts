import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessao } from "@/lib/sessao";
import { gerarAudioDetalhado } from "@/lib/voz";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Gera uma amostra da voz em PORTUGUÊS BRASILEIRO, para o usuário ouvir antes de
// escolher. Usa a chave MiniMax da imobiliária logada e o voiceId pedido.
export async function GET(req: NextRequest) {
  const sessao = await getSessao();
  if (!sessao) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const imob = await prisma.imobiliaria.findUnique({
    where: { id: sessao.imobiliaria.id },
    select: { minimaxApiKey: true, minimaxGroupId: true },
  });
  if (!imob?.minimaxApiKey)
    return NextResponse.json({ erro: "Salve a API Key da MiniMax primeiro." }, { status: 400 });

  const voiceId = req.nextUrl.searchParams.get("voiceId") || undefined;
  const amostra = "Oi! Aqui é a Carol. Tudo bem? Vou te ajudar a encontrar o imóvel ideal pra você.";
  const r = await gerarAudioDetalhado(amostra, imob.minimaxApiKey, voiceId, imob.minimaxGroupId);
  // O MOTIVO vai para a tela: chave inválida, saldo zerado e voice_id
  // inexistente dão o mesmo sintoma, e sem a mensagem não dá para diagnosticar.
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });

  return new NextResponse(new Uint8Array(r.dados), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
