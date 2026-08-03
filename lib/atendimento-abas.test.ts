// As abas do Atendimento IA seguem o plano do cliente, exatamente como
// especificado:
//   Recepção   → Recepcionista
//   Comercial  → Recepcionista / Venda de locação / Venda de imóvel
//   Captação   → sempre add-on (up-sell), nunca embutida num plano
import { describe, expect, it } from "vitest";

import { agentesAtivos, PRODUTOS } from "@/lib/planos";

// O painel do cliente é sobre atendimento ao público. AJUDA_CORRETOR é o canal
// INTERNO do corretor (ele consulta a carteira pelo WhatsApp), então fica fora
// desta conferência — mas continua existindo em todo plano.
const chatsDePublico = (modulos: string[], addons: string[] = []) =>
  agentesAtivos(modulos, addons)
    .filter((a) => a !== "AJUDA_CORRETOR")
    .sort();

describe("abas por plano", () => {
  it("Recepção: só o recepcionista", () => {
    expect(chatsDePublico(PRODUTOS.RECEPCAO.modulos, PRODUTOS.RECEPCAO.addons)).toEqual([
      "RECEPCAO",
    ]);
  });

  it("Comercial: recepcionista + venda de locação + venda de imóvel", () => {
    expect(chatsDePublico(PRODUTOS.COMERCIAL.modulos, PRODUTOS.COMERCIAL.addons)).toEqual(
      ["COMPRA_VENDA", "RECEPCAO", "VENDAS"].sort()
    );
  });
});

describe("Captação é sempre up-sell", () => {
  it("nenhum dos planos traz o captador embutido", () => {
    for (const p of Object.values(PRODUTOS)) {
      expect(chatsDePublico(p.modulos, p.addons)).not.toContain("CAPTACAO");
    }
  });

  it("com o add-on vendido, o captador aparece — e só ele muda", () => {
    const sem = chatsDePublico(PRODUTOS.COMERCIAL.modulos, []);
    const com = chatsDePublico(PRODUTOS.COMERCIAL.modulos, ["CAPTACAO"]);
    expect(com).toContain("CAPTACAO");
    expect(com).toHaveLength(sem.length + 1);
    // O add-on acrescenta; não remove nem troca nada.
    for (const a of sem) expect(com).toContain(a);
  });

  it("o add-on vale sobre Comercial", () => {
    expect(chatsDePublico(PRODUTOS.COMERCIAL.modulos, ["CAPTACAO"])).toContain("CAPTACAO");
  });
});

describe("a aba inicial existe no plano", () => {
  // O painel abre na primeira aba disponível.
  const inicial = (modulos: string[], addons: string[] = []) => agentesAtivos(modulos, addons)[0];

  it("nunca abre numa aba que o cliente não tem", () => {
    for (const p of Object.values(PRODUTOS)) {
      const escolhida = inicial(p.modulos, p.addons);
      expect(agentesAtivos(p.modulos, p.addons)).toContain(escolhida);
    }
    expect(inicial(PRODUTOS.RECEPCAO.modulos)).toBe("RECEPCAO");
    expect(inicial(PRODUTOS.COMERCIAL.modulos)).toBe("RECEPCAO");
  });
});
