// TOTP (RFC 6238) e base32 (RFC 4648) — implementados aqui em vez de trazer uma
// dependência: são ~60 linhas, o algoritmo é estável desde 2011, e assim dá para
// provar a corretude contra os vetores de teste oficiais da RFC (ver totp.test.ts).
//
// Usado no 2FA do operador (dono do SaaS): a conta dele vê dado financeiro e
// pessoal de todos os clientes, então senha sozinha não basta.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const ALFABETO_B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function paraBase32(buf: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_B32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_B32[(valor << (5 - bits)) & 31];
  return saida;
}

export function deBase32(s: string): Buffer {
  const limpo = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpo) {
    const i = ALFABETO_B32.indexOf(c);
    if (i < 0) throw new Error("segredo base32 inválido");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// Segredo de 20 bytes (160 bits) — o tamanho recomendado para HMAC-SHA1.
export function gerarSegredoTotp(): string {
  return paraBase32(randomBytes(20));
}

// HOTP (RFC 4226): HMAC do contador, truncagem dinâmica, módulo 10^digitos.
function hotp(segredo: Buffer, contador: number, digitos: number, algoritmo: string): string {
  const buf = Buffer.alloc(8);
  // Contador de 64 bits big-endian. writeBigUInt64BE evita perda de precisão.
  buf.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac(algoritmo, segredo).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binario =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binario % 10 ** digitos).padStart(digitos, "0");
}

export function gerarCodigoTotp(
  segredoBase32: string,
  em: number = Date.now(),
  { passo = 30, digitos = 6, algoritmo = "sha1" } = {}
): string {
  const contador = Math.floor(em / 1000 / passo);
  return hotp(deBase32(segredoBase32), contador, digitos, algoritmo);
}

// Valida o código aceitando uma janela de ±1 passo (30s), que absorve relógio
// levemente dessincronizado — o padrão recomendado pela RFC 6238.
export function validarCodigoTotp(
  segredoBase32: string,
  codigo: string,
  em: number = Date.now(),
  janela = 1
): boolean {
  const informado = codigo.replace(/\D/g, "");
  if (informado.length !== 6) return false;
  for (let d = -janela; d <= janela; d++) {
    const esperado = gerarCodigoTotp(segredoBase32, em + d * 30_000);
    const a = Buffer.from(esperado);
    const b = Buffer.from(informado);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

// URI otpauth:// lido pelo app autenticador (Google Authenticator, 1Password…).
export function uriOtpauth(segredoBase32: string, conta: string, emissor = "Administrativo"): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  const params = new URLSearchParams({
    secret: segredoBase32,
    issuer: emissor,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${rotulo}?${params.toString()}`;
}

// ─── Códigos de recuperação ────────────────────────────────────────────────
// Uso único, guardados só como hash — quem ler o banco não consegue entrar.

export function gerarCodigosRecuperacao(quantidade = 8): string[] {
  // Sem caracteres ambíguos: estes códigos são anotados no papel.
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const codigos: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    const b = randomBytes(10);
    let s = "";
    for (let j = 0; j < 10; j++) {
      if (j === 5) s += "-";
      s += abc[b[j]! % abc.length];
    }
    codigos.push(s);
  }
  return codigos;
}

export function normalizarCodigoRecuperacao(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
