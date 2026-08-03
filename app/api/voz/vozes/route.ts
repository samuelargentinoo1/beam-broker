import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessao } from "@/lib/sessao";
import { listarVozes } from "@/lib/voz";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// Catálogo de vozes da conta MiniMax da imobiliária logada, português primeiro.
// Sem isto a tela de voz é um campo de texto onde ninguém sabe o que colar — e
// um voice_id errado não dá erro na conversa, dá silêncio.
export async function GET() {
  const sessao = await getSessao();
  if (!sessao) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const imob = await prisma.imobiliaria.findUnique({
    where: { id: sessao.imobiliaria.id },
    select: { minimaxApiKey: true, minimaxGroupId: true },
  });
  if (!imob?.minimaxApiKey)
    return NextResponse.json(
      { vozes: [], erro: "Salve a API Key da MiniMax para carregar as vozes." },
      { status: 400 }
    );

  const r = await listarVozes(imob.minimaxApiKey, imob.minimaxGroupId);
  if (!r.ok) return NextResponse.json({ vozes: [], erro: r.erro }, { status: 502 });

  return NextResponse.json({ vozes: r.dados });
}
