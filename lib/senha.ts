// Hash de senhas (scrypt, Node) — separado de lib/auth.ts porque o
// middleware (edge) importa auth.ts e não pode carregar node:crypto.

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashSenha(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verificarSenha(senha: string, senhaHash: string): boolean {
  const [salt, hash] = senhaHash.split(":");
  if (!salt || !hash) return false;
  const calculado = scryptSync(senha, salt, 64);
  const esperado = Buffer.from(hash, "hex");
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}
