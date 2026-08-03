import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Serve a foto do imóvel guardada no banco (fallback sem Vercel Blob). É PÚBLICA
// (liberada no middleware) para a uazapi conseguir baixar e enviar no WhatsApp,
// MAS é acessada por um TOKEN aleatório (não pelo id sequencial): sem o token não
// dá para enumerar a carteira de nenhum tenant.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const foto = await prisma.fotoImovel.findUnique({ where: { token } });
  if (!foto?.dados) return new NextResponse("não encontrada", { status: 404 });
  const bytes = Buffer.from(foto.dados);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": foto.mimeType || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(bytes.length),
    },
  });
}
