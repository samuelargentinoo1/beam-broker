// Critérios de aceite do dock: contagem de abas por produto e ausência de
// separador órfão.
import { describe, expect, it } from "vitest";

import { ITENS_NAV, gruposVisiveis, navVisivel } from "@/lib/navegacao";
import { PRODUTOS } from "@/lib/planos";

const conta = (modulos: string[]) => navVisivel(modulos).length;

// As 13 telas de gestão comercial. É a lista que o produto vende — se uma sair
// do dock sem sair daqui, o teste avisa.
const TELAS_COMERCIAIS = [
  "/meu-dia",
  "/dados-comerciais",
  "/negocios",
  "/atividades",
  "/leads-portais",
  "/metricas-marketing",
  "/meu-captador",
  "/meu-corretor",
  "/conversas",
  "/contatos",
  "/tinder-imoveis",
  "/estoque",
  "/site",
];

describe("abas visíveis por produto", () => {
  it("Recepção (sem módulos) → só as abas base", () => {
    expect(conta(PRODUTOS.RECEPCAO.modulos)).toBe(2);
    expect(navVisivel([]).map((i) => i.href)).toEqual(["/", "/imoveis"]);
  });

  it("Comercial → as abas base + as 13 do módulo", () => {
    expect(conta(PRODUTOS.COMERCIAL.modulos)).toBe(2 + TELAS_COMERCIAIS.length);
    const hrefs = navVisivel(["COMERCIAL"]).map((i) => i.href);
    for (const href of TELAS_COMERCIAIS) expect(hrefs).toContain(href);
  });
});

describe("nenhum separador órfão", () => {
  it("grupos vazios são descartados antes de inserir separadores", () => {
    // Recepção: só o grupo base sobra → nenhum separador entre grupos.
    const recepcao = gruposVisiveis([]);
    expect(recepcao).toHaveLength(1);
    expect(recepcao[0]!.every((i) => i.grupo === "base")).toBe(true);

    // Comercial: base + comercial → 1 separador.
    expect(gruposVisiveis(["COMERCIAL"])).toHaveLength(2);
  });

  it("nenhum grupo devolvido está vazio", () => {
    for (const modulos of [[], ["COMERCIAL"]]) {
      for (const g of gruposVisiveis(modulos)) expect(g.length).toBeGreaterThan(0);
    }
  });

  it("a ordem dos grupos é sempre base → comercial", () => {
    expect(gruposVisiveis(["COMERCIAL"]).map((g) => g[0]!.grupo)).toEqual(["base", "comercial"]);
  });
});

describe("mapeamento das abas", () => {
  it("cada aba tem um único dono (não há módulo duplo)", () => {
    const porHref = new Map<string, string>();
    for (const i of ITENS_NAV) {
      expect(porHref.has(i.href)).toBe(false);
      porHref.set(i.href, i.modulo ?? "base");
    }
  });

  it("as rotas que saíram do dock não voltaram", () => {
    // /importar virou botão em Imóveis; /pesquisa é a busca do header;
    // /auditoria virou seção em Configurações. Leads, Pessoas e Atendimento IA
    // foram removidos do produto — o CRM é o Negócios.
    const hrefs = ITENS_NAV.map((i) => i.href);
    for (const href of [
      "/importar",
      "/pesquisa",
      "/auditoria",
      "/leads",
      "/pessoas",
      "/atendimento",
      "/contratos",
      "/faturas",
      "/repasses",
      "/inadimplencia",
      "/ocorrencias",
      "/fiscal",
      "/chaves",
      "/documentos",
    ]) {
      expect(hrefs).not.toContain(href);
    }
  });

  it("toda tela de gestão comercial pertence ao módulo COMERCIAL", () => {
    const dono = (href: string) => ITENS_NAV.find((i) => i.href === href)?.modulo;
    for (const href of TELAS_COMERCIAIS) expect(dono(href)).toBe("COMERCIAL");
    for (const href of ["/", "/imoveis"]) expect(dono(href)).toBeUndefined();
  });
});
