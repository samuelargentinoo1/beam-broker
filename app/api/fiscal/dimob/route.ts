import { NextRequest, NextResponse } from "next/server";
import { gerarDimob } from "@/lib/fiscal";
import { getSessao } from "@/lib/sessao";

export async function GET(req: NextRequest) {
  const sessao = await getSessao();
  if (!sessao) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const ano = Number(req.nextUrl.searchParams.get("ano")) || new Date().getFullYear();
  const conteudo = await gerarDimob(ano, sessao.imobiliaria.id);
  return new NextResponse(conteudo, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="DIMOB_${ano}.txt"`,
    },
  });
}
