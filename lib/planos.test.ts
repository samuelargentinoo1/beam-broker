// Critérios de aceite do M0: Captação é ADD-ON, nunca módulo; nenhum produto a
// traz embutida; e ela não pode ser vendida sobre Recepção (sem carteira).
import { describe, expect, it } from "vitest";

import {
  LISTA_PRODUTOS,
  PRODUTOS,
  addonPermitido,
  agentesAtivos,
  calcularFatura,
  temAddon,
  temModulo,
} from "@/lib/planos";

describe("módulos e add-ons são coisas separadas", () => {
  it("nenhum produto tem CAPTACAO dentro de modulos", () => {
    for (const p of LISTA_PRODUTOS) {
      expect(p.modulos as string[]).not.toContain("CAPTACAO");
    }
  });

  it("os módulos de cada produto são exatamente os da especificação", () => {
    expect(PRODUTOS.RECEPCAO.modulos).toEqual([]);
    expect(PRODUTOS.COMERCIAL.modulos).toEqual(["COMERCIAL"]);
  });

  it("nenhum produto traz Captação embutida (é sempre venda separada)", () => {
    for (const p of LISTA_PRODUTOS) expect(p.addons).toEqual([]);
  });
});

describe("addonPermitido", () => {
  it("recusa Captação sobre Recepção — não há carteira para captar", () => {
    expect(addonPermitido(PRODUTOS.RECEPCAO.modulos, "CAPTACAO")).toBe(false);
  });

  it("aceita Captação sobre qualquer produto com carteira", () => {
    expect(addonPermitido(PRODUTOS.COMERCIAL.modulos, "CAPTACAO")).toBe(true);
  });
});

describe("agentesAtivos", () => {
  it("Recepção: só os dois agentes base", () => {
    expect(agentesAtivos(PRODUTOS.RECEPCAO.modulos)).toEqual(["RECEPCAO", "AJUDA_CORRETOR"]);
  });

  it("Comercial: base + venda de locação e de compra/venda", () => {
    expect(agentesAtivos(PRODUTOS.COMERCIAL.modulos).sort()).toEqual(
      ["AJUDA_CORRETOR", "COMPRA_VENDA", "RECEPCAO", "VENDAS"].sort()
    );
  });

  it("Comercial sem add-on: 4 agentes, sem CAPTACAO", () => {
    const a = agentesAtivos(PRODUTOS.COMERCIAL.modulos, PRODUTOS.COMERCIAL.addons);
    expect(a).toHaveLength(4);
    expect(a).not.toContain("CAPTACAO");
  });

  it("o add-on acrescenta exatamente um agente", () => {
    const sem = agentesAtivos(PRODUTOS.COMERCIAL.modulos, []);
    const com = agentesAtivos(PRODUTOS.COMERCIAL.modulos, ["CAPTACAO"]);
    expect(com).toHaveLength(sem.length + 1);
    expect(com).toContain("CAPTACAO");
  });

  it("a contagem por produto bate com a matriz de verificação", () => {
    // Recepção 2 · Comercial 4
    expect(agentesAtivos(PRODUTOS.RECEPCAO.modulos)).toHaveLength(2);
    expect(agentesAtivos(PRODUTOS.COMERCIAL.modulos)).toHaveLength(4);
  });
});

describe("helpers de consulta", () => {
  it("temModulo e temAddon olham listas distintas", () => {
    expect(temModulo(["COMERCIAL"], "COMERCIAL")).toBe(true);
    expect(temModulo([], "COMERCIAL")).toBe(false);
    expect(temAddon(["CAPTACAO"], "CAPTACAO")).toBe(true);
    expect(temAddon([], "CAPTACAO")).toBe(false);
  });
});

describe("calcularFatura", () => {
  it("soma fixo + medidores e cobra o excedente acima da cota", () => {
    const f = calcularFatura({
      produto: PRODUTOS.COMERCIAL,
      contratosAtivos: 100,
      leadsAtendidos: 200,
      cmvIaCentavos: 60000, // cota é 40000
    });
    expect(f.fixo).toBe(59700);
    // Comercial não cobra por contrato ativo — só por lead atendido.
    expect(f.porContrato).toBe(0);
    expect(f.porLead).toBe(190 * 200);
    // excedente: (60000-40000) * 2500/1000 = 50000
    expect(f.excedente).toBe(50000);
    expect(f.total).toBe(59700 + 0 + 38000 + 50000);
    expect(f.margem).toBe(f.total - 60000);
  });

  it("não cobra excedente dentro da cota", () => {
    const f = calcularFatura({
      produto: PRODUTOS.RECEPCAO,
      contratosAtivos: 0,
      leadsAtendidos: 0,
      cmvIaCentavos: 1000,
    });
    expect(f.excedente).toBe(0);
    expect(f.total).toBe(29700);
  });
});
