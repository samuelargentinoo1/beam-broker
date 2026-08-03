import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/sessao";
import { buscarCep } from "@/lib/cep";

export const dynamic = "force-dynamic";

// Busca de endereço por CEP para o preenchimento automático dos formulários.
// Protegido: só usuário logado (evita virar proxy aberto de CEP).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ cep: string }> }) {
  const sessao = await getSessao();
  if (!sessao) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { cep } = await params;
  const endereco = await buscarCep(cep);
  if (!endereco) return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 });
  return NextResponse.json(endereco);
}
