import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consumirToken } from "@/lib/conta";

// Link de verificação de e-mail: /verificar-email?token=... — marca o usuário
// como verificado e manda para o login. É público (fora do middleware protegido).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const origin = req.nextUrl.origin;
  const usuarioId = token ? await consumirToken(token, "VERIFICACAO") : null;
  if (!usuarioId) {
    return NextResponse.redirect(`${origin}/login?erro=verificacao`);
  }
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { emailVerificadoEm: new Date() },
  });
  return NextResponse.redirect(`${origin}/login?verificado=1`);
}
