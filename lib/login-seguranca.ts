// Segurança do login/cadastro: rate limit por e-mail e por IP, hash "dummy" para
// comparação de tempo constante (evita enumeração de e-mails pelo tempo de
// resposta) e força de senha. Sem isto, scrypt protege o hash mas nada impede
// milhares de tentativas nem criar contas em massa (que queimam a ANTHROPIC_API_KEY).

import { prisma } from "@/lib/db";
import { hashSenha } from "@/lib/senha";

const JANELA_MS = 15 * 60 * 1000; // 15 min
const MAX_POR_EMAIL = 5;
const MAX_POR_IP = 20;
const MAX_CADASTRO_POR_IP = 5; // contas por hora por IP

// Hash fixo de uma senha aleatória — quando o usuário NÃO existe, verificamos a
// senha contra este hash para gastar ~o mesmo tempo de um usuário real.
export const HASH_DUMMY = hashSenha("dummy-para-tempo-constante-nao-e-senha-de-ninguem");

export function ipDaRequisicao(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") ?? "desconhecido";
}

export async function loginBloqueado(email: string, ip: string): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_MS);
  const [porEmail, porIp] = await Promise.all([
    prisma.tentativaLogin.count({ where: { chave: `email:${email}`, em: { gte: desde } } }),
    prisma.tentativaLogin.count({ where: { chave: `ip:${ip}`, em: { gte: desde } } }),
  ]);
  return porEmail >= MAX_POR_EMAIL || porIp >= MAX_POR_IP;
}

export async function registrarFalhaLogin(email: string, ip: string): Promise<void> {
  await prisma.tentativaLogin
    .createMany({ data: [{ chave: `email:${email}` }, { chave: `ip:${ip}` }] })
    .catch(() => {});
  limparAntigas();
}

export async function limparTentativasLogin(email: string, ip: string): Promise<void> {
  await prisma.tentativaLogin
    .deleteMany({ where: { chave: { in: [`email:${email}`, `ip:${ip}`] } } })
    .catch(() => {});
}

export async function cadastroBloqueado(ip: string): Promise<boolean> {
  const desde = new Date(Date.now() - 60 * 60 * 1000); // 1h
  const n = await prisma.tentativaLogin.count({ where: { chave: `cadastro:ip:${ip}`, em: { gte: desde } } });
  return n >= MAX_CADASTRO_POR_IP;
}

export async function registrarCadastro(ip: string): Promise<void> {
  await prisma.tentativaLogin.create({ data: { chave: `cadastro:ip:${ip}` } }).catch(() => {});
  limparAntigas();
}

// Força de senha mínima (P1.9): pelo menos 10 caracteres.
export function senhaForte(senha: string): boolean {
  return typeof senha === "string" && senha.length >= 10;
}

// Limpeza best-effort de registros com mais de 1 hora (não bloqueia o fluxo).
function limparAntigas() {
  prisma.tentativaLogin
    .deleteMany({ where: { em: { lt: new Date(Date.now() - 60 * 60 * 1000) } } })
    .catch(() => {});
}
