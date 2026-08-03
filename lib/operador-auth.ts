// Sessão do OPERADOR (dono do SaaS) — cookie e segredo separados dos do cliente.
// Ter login de cliente não dá acesso ao painel do dono, e vice-versa.
//
// Mesmo desenho de lib/auth.ts: HMAC + expiração, validável no edge (middleware);
// a revogação por sessaoVersao é conferida em getOperador (Node, com banco).
//
// SEGREDO AUSENTE = SEM ACESSO DE OPERADOR (fail-closed), mas SEM derrubar o app.
// Um throw no import mataria o site inteiro, porque o middleware importa este
// módulo — foi exatamente esse tipo de falha que já causou 500 em todas as rotas.
// Aqui a ausência do segredo apenas torna impossível criar ou validar um token:
// /admin fica inacessível e a tela de entrada explica o que configurar.

export const COOKIE_OPERADOR = "sessao_operador";

// Chave de assinatura da sessão do operador. Preferimos OPERADOR_SECRET, mas
// se ela não existir DERIVAMOS do AUTH_SECRET com um rótulo próprio.
//
// Por que derivar é seguro: o rótulo muda o material da chave, então o HMAC
// resultante é uma chave diferente da usada nas sessões de cliente — um cookie
// de cliente nunca vira cookie de operador, nem o contrário. E por que fazer
// isso: exigir uma variável a mais só para o painel abrir era uma barreira sem
// ganho de segurança real (quem tem o AUTH_SECRET já tem o servidor inteiro).
const SEGREDO_EXPLICITO = process.env.OPERADOR_SECRET;
const AUTH = process.env.AUTH_SECRET;
const SEGREDO =
  SEGREDO_EXPLICITO && SEGREDO_EXPLICITO.length >= 32
    ? SEGREDO_EXPLICITO
    : AUTH && AUTH.length >= 32
      ? `operador-v1:${AUTH}`
      : undefined;

export function operadorConfigurado(): boolean {
  return typeof SEGREDO === "string" && SEGREDO.length >= 32;
}

async function hmac(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SEGREDO as string),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Comparação em tempo constante, sem node:crypto (roda no edge).
function comparaConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type TokenOperador = { operadorId: number; sessaoVersao: number };

// Token: "<operadorId>.<sessaoVersao>.<expiraEmMs>.<hmac>"
// Validade curta (8h): a conta do operador vê dado financeiro e pessoal de todos
// os clientes — não faz sentido durar os 7 dias da sessão de cliente.
export async function criarTokenOperador(
  operadorId: number,
  sessaoVersao: number
): Promise<string | null> {
  if (!operadorConfigurado()) return null;
  const expira = Date.now() + 8 * 60 * 60 * 1000;
  const payload = `${operadorId}.${sessaoVersao}.${expira}`;
  return `${payload}.${await hmac(payload)}`;
}

// ─── Pré-autenticação (entre a senha e o 2FA) ──────────────────────────────
// Cookie curto que diz apenas "esta pessoa acertou a senha". NÃO é sessão: é
// assinado num DOMÍNIO HMAC diferente ("2fa:"), então nem por acidente nem por
// manipulação um token de pré-auth passa por validarTokenOperador — a assinatura
// simplesmente não bate.

export const COOKIE_PRE_OPERADOR = "pre_operador";

export async function criarTokenPreOperador(operadorId: number): Promise<string | null> {
  if (!operadorConfigurado()) return null;
  const expira = Date.now() + 5 * 60 * 1000; // 5 min para digitar o código
  const payload = `${operadorId}.${expira}`;
  return `${payload}.${await hmac(`2fa:${payload}`)}`;
}

export async function validarTokenPreOperador(
  token: string | undefined
): Promise<number | null> {
  if (!token || !operadorConfigurado()) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [id, expira, assinatura] = partes;
  if (!/^\d+$/.test(expira!) || Number(expira) < Date.now()) return null;
  if (!comparaConstante(await hmac(`2fa:${id}.${expira}`), assinatura!)) return null;
  const operadorId = Number(id);
  return Number.isInteger(operadorId) && operadorId > 0 ? operadorId : null;
}

export async function validarTokenOperador(
  token: string | undefined
): Promise<TokenOperador | null> {
  if (!token || !operadorConfigurado()) return null;
  const partes = token.split(".");
  if (partes.length !== 4) return null;
  const [id, versao, expira, assinatura] = partes;
  if (!/^\d+$/.test(expira) || Number(expira) < Date.now()) return null;
  if (!comparaConstante(await hmac(`${id}.${versao}.${expira}`), assinatura)) return null;
  const operadorId = Number(id);
  const sessaoVersao = Number(versao);
  if (!Number.isInteger(operadorId) || operadorId <= 0) return null;
  if (!Number.isInteger(sessaoVersao) || sessaoVersao < 0) return null;
  return { operadorId, sessaoVersao };
}
