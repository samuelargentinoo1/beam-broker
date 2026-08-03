// Autenticação multi-tenant: usuários no banco (senha scrypt), sessão em
// cookie assinado por HMAC. O middleware (edge) valida a assinatura — que é
// puramente criptográfica (não pode acessar o banco no edge runtime). A
// checagem de REVOGAÇÃO de sessão (sessaoVersao contra o banco) é feita em
// getSessao (lib/sessao.ts), que roda no Node.

export const COOKIE_SESSAO = "sessao";

// Segredo de assinatura da sessão. Sem ele — ou curto demais — o cookie poderia
// ser forjado (login como qualquer usuário, cujo id é sequencial). Falha FECHADO
// já no import do módulo: o app NÃO sobe degradado. Em produção defina uma env
// forte; em desenvolvimento defina no .env (o .env.example traz um exemplo).
const SECRET = process.env.AUTH_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error(
    "AUTH_SECRET ausente ou curta demais (mínimo 32 caracteres). Gere com: openssl rand -hex 32"
  );
}
// A partir daqui SECRET é garantidamente uma string com 32+ caracteres.
const SEGREDO: string = SECRET;

async function hmac(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SEGREDO),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Comparação de strings hex em tempo constante (evita timing attack na
// assinatura). Roda no edge (sem node:crypto), então é XOR byte a byte na mão,
// com early-return apenas quando os comprimentos diferem.
function comparaConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type SessaoToken = { usuarioId: number; sessaoVersao: number };

// Token: "<usuarioId>.<sessaoVersao>.<expiraEmMs>.<hmac>"
export async function criarToken(usuarioId: number, sessaoVersao: number): Promise<string> {
  const expira = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 dias
  const payload = `${usuarioId}.${sessaoVersao}.${expira}`;
  return `${payload}.${await hmac(payload)}`;
}

// Valida o token (assinatura + expiração) e devolve {usuarioId, sessaoVersao}.
// Validação PURAMENTE CRIPTOGRÁFICA — funciona no edge (middleware). A conferência
// da versão de sessão contra o banco é responsabilidade de getSessao (Node).
export async function validarToken(token: string | undefined): Promise<SessaoToken | null> {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 4) return null;
  const [id, versao, expira, assinatura] = partes;
  if (!/^\d+$/.test(expira) || Number(expira) < Date.now()) return null;
  if (!comparaConstante(await hmac(`${id}.${versao}.${expira}`), assinatura)) return null;
  const usuarioId = Number(id);
  const sessaoVersao = Number(versao);
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) return null;
  if (!Number.isInteger(sessaoVersao) || sessaoVersao < 0) return null;
  return { usuarioId, sessaoVersao };
}
