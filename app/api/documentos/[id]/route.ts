import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessao } from "@/lib/sessao";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await getSessao();
  if (!sessao) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const doc = await prisma.documento.findFirst({
    where: { id: Number(id), imobiliariaId: sessao.imobiliaria.id },
  });
  if (!doc?.arquivo) {
    return NextResponse.json({ error: "documento não encontrado" }, { status: 404 });
  }

  // Vercel Blob: o documento é PRIVADO. NÃO redirecionamos para a URL do blob
  // (URL vazada = acesso permanente sem autenticação — exposição de dado LGPD).
  // Em vez disso, fazemos STREAM do conteúdo pela própria rota (já autenticada e
  // escopada por tenant acima). Documentos antigos ainda públicos (pré-migração)
  // caem no fallback de fetch server-side.
  if (doc.arquivo.startsWith("http")) {
    const nome = encodeURIComponent(doc.nome || "documento");
    const disposicao = `attachment; filename="${nome}"`;
    try {
      const { get } = await import("@vercel/blob");
      const r = await get(doc.arquivo, { access: "private" });
      if (r?.stream) {
        return new NextResponse(r.stream, {
          headers: {
            "Content-Type": doc.mimeType ?? "application/octet-stream",
            "Content-Disposition": disposicao,
          },
        });
      }
    } catch {
      /* pode ser um blob público antigo (ainda não migrado) — cai no fallback */
    }
    // Fallback: documento público legado — busca server-side e faz stream (a URL
    // do blob nunca é exposta ao cliente).
    const resp = await fetch(doc.arquivo);
    if (!resp.ok || !resp.body) {
      return NextResponse.json({ error: "arquivo ausente no storage" }, { status: 404 });
    }
    return new NextResponse(resp.body, {
      headers: {
        "Content-Type": doc.mimeType ?? resp.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": disposicao,
      },
    });
  }

  // Local: arquivo é sempre um basename gerado pelo sistema — sem path traversal
  const caminho = path.join(process.cwd(), "uploads", path.basename(doc.arquivo));
  try {
    const conteudo = await readFile(caminho);
    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        "Content-Type": doc.mimeType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.nome)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "arquivo ausente no storage" }, { status: 404 });
  }
}
