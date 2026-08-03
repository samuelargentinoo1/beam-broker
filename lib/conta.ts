// Fluxos de conta que dependem de e-mail: verificação e redefinição de senha.
// Tokens aleatórios (crypto), uso único, com expiração. Só ENFORÇAM quando há
// provedor de e-mail configurado (emailConfigurado()).

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { enviarEmail, emailConfigurado } from "@/lib/email";
import type { TipoTokenEmail } from "@prisma/client";

function baseUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function criarToken(usuarioId: number, tipo: TipoTokenEmail, horas: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.tokenEmail.create({
    data: { usuarioId, tipo, token, expiraEm: new Date(Date.now() + horas * 3600_000) },
  });
  return token;
}

// Consome um token válido (não usado, não expirado, do tipo certo) e o marca como
// usado. Retorna o usuarioId ou null.
export async function consumirToken(token: string, tipo: TipoTokenEmail): Promise<number | null> {
  const t = await prisma.tokenEmail.findUnique({ where: { token } });
  if (!t || t.tipo !== tipo || t.usadoEm || t.expiraEm < new Date()) return null;
  await prisma.tokenEmail.update({ where: { id: t.id }, data: { usadoEm: new Date() } });
  return t.usuarioId;
}

export async function enviarVerificacaoEmail(usuarioId: number, email: string): Promise<void> {
  if (!emailConfigurado()) return;
  const token = await criarToken(usuarioId, "VERIFICACAO", 48);
  const link = `${baseUrl()}/verificar-email?token=${token}`;
  await enviarEmail({
    para: email,
    assunto: "Confirme seu e-mail",
    html: `<p>Confirme seu e-mail para ativar o acesso:</p><p><a href="${link}">${link}</a></p><p>O link expira em 48 horas.</p>`,
    texto: `Confirme seu e-mail: ${link}`,
  });
}

// Solicita redefinição de senha. NÃO revela se o e-mail existe (anti-enumeração):
// o chamador sempre mostra a mesma mensagem.
export async function solicitarResetSenha(email: string): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !emailConfigurado()) return;
  const token = await criarToken(usuario.id, "RESET_SENHA", 2);
  const link = `${baseUrl()}/redefinir-senha?token=${token}`;
  await enviarEmail({
    para: email,
    assunto: "Redefinição de senha",
    html: `<p>Recebemos um pedido para redefinir sua senha:</p><p><a href="${link}">${link}</a></p><p>O link expira em 2 horas. Se não foi você, ignore este e-mail.</p>`,
    texto: `Redefinir senha: ${link}`,
  });
}
