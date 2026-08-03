// TOTP conferido contra os VETORES DE TESTE OFICIAIS da RFC 6238 (Appendix B).
// É a prova de que a implementação própria é compatível com qualquer app
// autenticador — sem isso, 2FA quebrado só apareceria quando alguém ficasse
// trancado para fora da conta.
import { describe, expect, it } from "vitest";

import {
  deBase32,
  paraBase32,
  gerarCodigoTotp,
  gerarSegredoTotp,
  validarCodigoTotp,
  uriOtpauth,
  gerarCodigosRecuperacao,
  normalizarCodigoRecuperacao,
} from "@/lib/totp";

// A RFC usa o segredo ASCII "12345678901234567890" (20 bytes).
const SEGREDO_RFC = paraBase32(Buffer.from("12345678901234567890", "ascii"));

describe("base32 (RFC 4648)", () => {
  it("codifica e decodifica de volta ao original", () => {
    for (const texto of ["", "f", "fo", "foo", "foob", "fooba", "foobar", "12345678901234567890"]) {
      expect(deBase32(paraBase32(Buffer.from(texto, "ascii"))).toString("ascii")).toBe(texto);
    }
  });

  it("usa o alfabeto padrão", () => {
    expect(paraBase32(Buffer.from("foobar", "ascii"))).toBe("MZXW6YTBOI");
  });

  it("recusa caractere fora do alfabeto", () => {
    expect(() => deBase32("MZXW6YTB01")).toThrow(); // 0 e 1 não existem em base32
  });
});

describe("vetores de teste da RFC 6238 (SHA-1, 8 dígitos)", () => {
  // Appendix B: tempo (segundos) → TOTP esperado, para SHA-1.
  const VETORES: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  it.each(VETORES)("t=%i produz %s", (segundos, esperado) => {
    const codigo = gerarCodigoTotp(SEGREDO_RFC, segundos * 1000, { digitos: 8 });
    expect(codigo).toBe(esperado);
  });
});

describe("validação com janela de tolerância", () => {
  const agora = 1_700_000_000_000;

  it("aceita o código do passo atual", () => {
    const codigo = gerarCodigoTotp(SEGREDO_RFC, agora);
    expect(validarCodigoTotp(SEGREDO_RFC, codigo, agora)).toBe(true);
  });

  it("aceita o passo anterior e o seguinte (relógio dessincronizado)", () => {
    expect(validarCodigoTotp(SEGREDO_RFC, gerarCodigoTotp(SEGREDO_RFC, agora - 30_000), agora)).toBe(true);
    expect(validarCodigoTotp(SEGREDO_RFC, gerarCodigoTotp(SEGREDO_RFC, agora + 30_000), agora)).toBe(true);
  });

  it("recusa código de fora da janela", () => {
    expect(validarCodigoTotp(SEGREDO_RFC, gerarCodigoTotp(SEGREDO_RFC, agora - 120_000), agora)).toBe(false);
  });

  it("recusa código errado, vazio ou de tamanho inválido", () => {
    expect(validarCodigoTotp(SEGREDO_RFC, "000000", agora)).toBe(false);
    expect(validarCodigoTotp(SEGREDO_RFC, "", agora)).toBe(false);
    expect(validarCodigoTotp(SEGREDO_RFC, "12345", agora)).toBe(false);
  });

  it("aceita código digitado com espaço", () => {
    const codigo = gerarCodigoTotp(SEGREDO_RFC, agora);
    expect(validarCodigoTotp(SEGREDO_RFC, `${codigo.slice(0, 3)} ${codigo.slice(3)}`, agora)).toBe(true);
  });
});

describe("segredo e URI", () => {
  it("gera segredo base32 utilizável", () => {
    const s = gerarSegredoTotp();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(validarCodigoTotp(s, gerarCodigoTotp(s))).toBe(true);
  });

  it("monta o otpauth:// com emissor e parâmetros", () => {
    const uri = uriOtpauth("JBSWY3DPEHPK3PXP", "dono@exemplo.com");
    expect(uri).toContain("otpauth://totp/Administrativo%3Adono%40exemplo.com");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Administrativo");
    expect(uri).toContain("period=30");
  });
});

describe("códigos de recuperação", () => {
  it("gera 8 códigos distintos, sem caracteres ambíguos", () => {
    const codigos = gerarCodigosRecuperacao();
    expect(codigos).toHaveLength(8);
    expect(new Set(codigos).size).toBe(8);
    for (const c of codigos) {
      expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(c).not.toMatch(/[O0I1L]/); // ditados/anotados à mão
    }
  });

  it("normaliza para comparação (maiúsculas, sem hífen)", () => {
    expect(normalizarCodigoRecuperacao("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(normalizarCodigoRecuperacao("ABCDE FGHJK")).toBe("ABCDEFGHJK");
  });
});
