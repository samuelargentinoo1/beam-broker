// O caso real: a tela mostrava o campo de chave da MiniMax PREENCHIDO, sendo
// que o código manda ele vir vazio. Era o gerenciador de senhas do navegador
// enchendo o <input type="password"> com a senha de login. Como a regra de
// gravação é "campo preenchido substitui", um salvar comum trocava a chave boa
// pela senha do usuário — sem erro nenhum. Depois só sobrava um "MiniMax
// recusou a chave" impossível de diagnosticar.
import { describe, expect, it } from "vitest";

import { validarCredencial } from "@/lib/credenciais";

// JWT de mentira, no formato da MiniMax (três partes, começa com "ey").
const CHAVE_MINIMAX =
  "eyJhbGciOiJIUzI1NiJ9.eyJHcm91cElEIjoiMTk0OCJ9.assinatura_longa_o_suficiente";

describe("campo vazio é o caminho normal, não um erro", () => {
  it("vazio não reclama — significa 'mantém o que está salvo'", () => {
    expect(validarCredencial("MINIMAX", "")).toBeNull();
    expect(validarCredencial("UAZAPI", "   ")).toBeNull();
  });
});

describe("a senha do navegador não passa por chave", () => {
  it("senha de gente é curta demais para ser chave", () => {
    // É este o caso do print: o navegador preencheu com a senha de login.
    for (const tipo of ["MINIMAX", "UAZAPI", "ZAPSIGN"] as const) {
      const m = validarCredencial(tipo, "MinhaSenha123");
      expect(m).toBeTruthy();
      expect(m).toContain("navegador");
    }
  });

  it("texto longo mas sem cara de chave da MiniMax também é barrado", () => {
    expect(validarCredencial("MINIMAX", "a".repeat(60))).toContain("MiniMax");
  });

  it("chave colada junto com texto em volta é barrada", () => {
    expect(validarCredencial("MINIMAX", `API key: ${CHAVE_MINIMAX}`)).toContain("espaço");
  });
});

describe("chave legítima passa", () => {
  it("aceita o JWT da MiniMax", () => {
    expect(validarCredencial("MINIMAX", CHAVE_MINIMAX)).toBeNull();
  });

  it("aceita TAMBÉM o formato sk-api- do console atual da MiniMax", () => {
    // O console (Pay-as-you-go → Access → Create new API Key) gera "sk-api-...".
    // Recusar isso bloquearia a única chave que a conta produz hoje.
    expect(validarCredencial("MINIMAX", `sk-api-${"x".repeat(100)}`)).toBeNull();
  });

  it("o que não é nem sk- nem JWT continua barrado", () => {
    const m = validarCredencial("MINIMAX", "x".repeat(60));
    expect(m).toContain("sk-api-");
    expect(m).toContain("eyJ");
  });

  it("reconhece o prefixo de cada provedor", () => {
    expect(validarCredencial("ELEVENLABS", `sk_${"a".repeat(40)}`)).toBeNull();
    expect(validarCredencial("ASAAS", `$aact_${"a".repeat(40)}`)).toBeNull();
  });

  it("prefixo errado é recusado com o prefixo certo no recado", () => {
    expect(validarCredencial("ELEVENLABS", `xi_${"a".repeat(40)}`)).toContain("sk_");
    expect(validarCredencial("ASAAS", `${"a".repeat(40)}`)).toContain("$aact_");
  });

  it("token opaco (ZapSign, uazapi) passa sem exigir prefixo", () => {
    // Estes provedores não têm prefixo estável: inventar um bloquearia chave
    // legítima, que é pior do que deixar passar.
    expect(validarCredencial("ZAPSIGN", "a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBeNull();
    expect(validarCredencial("UAZAPI", "x".repeat(32))).toBeNull();
  });
});
