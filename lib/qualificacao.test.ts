// A escada de qualificação de empreendimento: as perguntas na ordem, e só
// depois os documentos. E o que cada resposta muda na análise.
import { describe, expect, it } from "vitest";

import {
  DOCUMENTOS,
  PERGUNTAS,
  analisar,
  bloqueadoPorRestricao,
  documentosAplicaveis,
  documentosPendentes,
  idadeEmAnos,
  normalizarDocumentos,
  prazoMaximoMeses,
  proximaPergunta,
  rendaFamiliar,
  resumo,
  temCarteira,
} from "@/lib/qualificacao";

const HOJE = new Date("2026-07-27T12:00:00.000Z");
// Solteiro, nome limpo, com entrada: as 15 perguntas base.
const COMPLETO = {
  quartosDesejados: 2,
  banheirosDesejados: 1,
  localizacaoDesejada: "Vila Redentora",
  primeiroImovel: true,
  estadoCivil: "SOLTEIRO",
  nomeRestrito: false,
  entradaDisponivel: 30000,
  parcelaDesejada: 1500,
  vinculo: "CLT",
  tresAnosRegistro: true,
  dependentes: 1,
  rendaBrutaMensal: 6000,
  rendaDeclaradaIr: true,
  dataNascimento: new Date("1990-05-10T12:00:00.000Z"),
  temFgts: true,
};

describe("a escada de perguntas", () => {
  it("produto vem primeiro, financeiro depois — esta é a ordem da escada", () => {
    expect(PERGUNTAS.map((p) => p.chave)).toEqual([
      "quartosDesejados",
      "banheirosDesejados",
      "localizacaoDesejada",
      "primeiroImovel",
      "estadoCivil",
      "conjugeImovelProprio",
      "nomeRestrito",
      "previsaoQuitacao",
      "temOutroTitular",
      "nomeAlternativo",
      "entradaDisponivel",
      "querParcelarEntrada",
      "vinculo",
      "tresAnosRegistro",
      "dependentes",
      "rendaBrutaMensal",
      "rendaDeclaradaIr",
      "dataNascimento",
      "temFgts",
      "conjugeNome",
      "conjugeVinculo",
      "conjugeRendaBrutaMensal",
      "conjugeDataNascimento",
      "parcelaDesejada",
    ]);
  });

  it("a próxima pergunta pula o que já foi respondido — nunca repete", () => {
    // A conversa de compra abre pelo PRODUTO, não pelo dinheiro.
    expect(proximaPergunta({})!.chave).toBe("quartosDesejados");
    expect(proximaPergunta({ quartosDesejados: 2 })!.chave).toBe("banheirosDesejados");
    // Resposta "não" é resposta: false não pode contar como não respondida.
    expect(proximaPergunta({ ...COMPLETO, primeiroImovel: false, estadoCivil: null })!.chave).toBe(
      "estadoCivil"
    );
    // Zero dependentes também é resposta.
    expect(proximaPergunta({ ...COMPLETO, dependentes: 0, rendaBrutaMensal: null })!.chave).toBe(
      "rendaBrutaMensal"
    );
    expect(proximaPergunta(COMPLETO)).toBeNull();
  });

  it("só está completa com todas as aplicáveis respondidas", () => {
    expect(analisar({ quartosDesejados: 2 }, HOJE).completa).toBe(false);
    expect(analisar({ quartosDesejados: 2 }, HOJE).respondidas).toBe(1);
    expect(analisar(COMPLETO, HOJE).completa).toBe(true);
  });
});

describe("os documentos", () => {
  it("são os 6 da lista, mais o bloco condicional do cônjuge", () => {
    expect(DOCUMENTOS.map((d) => d.chave)).toEqual([
      "IDENTIDADE",
      "ESTADO_CIVIL",
      "RESIDENCIA",
      "CTPS",
      "HOLERITE",
      "EXTRATO_FGTS",
      "CONJUGE",
    ]);
  });

  it("antes de saber o vínculo, pede a lista inteira — menos a do cônjuge", () => {
    // Cônjuge fica fora enquanto o estado civil não foi perguntado: pedir
    // documento de esposa a um solteiro é pior do que pedir depois.
    expect(documentosAplicaveis({}).map((d) => d.chave)).not.toContain("CONJUGE");
    expect(documentosAplicaveis({})).toHaveLength(6);
  });

  it("autônomo não tem carteira nem holerite", () => {
    expect(temCarteira("CLT")).toBe(true);
    expect(temCarteira("SERVIDOR")).toBe(true);
    expect(temCarteira("AUTONOMO")).toBe(false);
    const semFgts = documentosAplicaveis({ vinculo: "AUTONOMO", temFgts: false }).map((d) => d.chave);
    expect(semFgts).toEqual(["IDENTIDADE", "ESTADO_CIVIL", "RESIDENCIA"]);
    // E cada documento cortado diz o que pedir no lugar.
    for (const d of DOCUMENTOS.filter((x) => x.soComCarteira)) expect(d.alternativa).toBeTruthy();
  });

  it("autônomo COM saldo de FGTS antigo ainda entrega o extrato", () => {
    // Quem é autônomo hoje pode ter saldo de um emprego CLT anterior — e esse
    // saldo entra na entrada. Cortar o extrato pelo vínculo atual jogaria fora
    // dinheiro que o cliente tem.
    const chaves = documentosAplicaveis({ vinculo: "AUTONOMO", temFgts: true }).map((d) => d.chave);
    expect(chaves).toContain("EXTRATO_FGTS");
    expect(chaves).not.toContain("HOLERITE");
    expect(chaves).not.toContain("CTPS");
  });

  it("sem FGTS, o extrato do FGTS sai da lista", () => {
    const chaves = documentosAplicaveis({ vinculo: "CLT", temFgts: false }).map((d) => d.chave);
    expect(chaves).not.toContain("EXTRATO_FGTS");
    expect(chaves).toContain("HOLERITE");
  });

  it("o que já chegou sai dos pendentes", () => {
    const pendentes = documentosPendentes({
      ...COMPLETO,
      documentosRecebidos: ["IDENTIDADE", "RESIDENCIA"],
    });
    expect(pendentes.map((d) => d.chave)).toEqual([
      "ESTADO_CIVIL",
      "CTPS",
      "HOLERITE",
      "EXTRATO_FGTS",
    ]);
  });

  it("chave de documento vinda de fora é entrada não confiável", () => {
    expect(normalizarDocumentos(["identidade", "IDENTIDADE", "xpto", ""])).toEqual(["IDENTIDADE"]);
  });
});

describe("análise do enquadramento", () => {
  it("a renda define a faixa e a parcela máxima", () => {
    const a = analisar(COMPLETO, HOJE);
    expect(a.faixa?.faixa).toBe(3); // 6.000 está entre 4.700 e 8.000
    expect(a.parcelaMaxima).toBe(1800); // 30% de 6.000
    expect(a.impeditivos).toEqual([]);
  });

  it("já ter imóvel no nome é impeditivo do MCMV, não um aviso", () => {
    const a = analisar({ ...COMPLETO, primeiroImovel: false }, HOJE);
    expect(a.impeditivos.join(" ")).toContain("fora do MCMV");
    expect(a.impeditivos.join(" ")).toContain("SBPE");
  });

  it("renda acima do teto da última faixa também sai do programa", () => {
    const a = analisar({ ...COMPLETO, rendaBrutaMensal: 20_000 }, HOJE);
    expect(a.faixa).toBeNull();
    expect(a.impeditivos).toHaveLength(1);
  });

  it("a idade limita o prazo: idade + prazo até 80 anos e 6 meses", () => {
    expect(idadeEmAnos(new Date("1990-05-10T12:00:00Z"), HOJE)).toBe(36);
    // 36 anos e 2 meses ⇒ 434 meses restariam, mas o teto legal é 420.
    expect(prazoMaximoMeses(new Date("1990-05-10T12:00:00Z"), HOJE)).toBe(420);
    // Aos 60 anos e 2 meses (722 meses de vida), sobram 966 - 722 = 244.
    expect(prazoMaximoMeses(new Date("1966-05-10T12:00:00Z"), HOJE)).toBe(244);
    // Passado o limite, o prazo não vira negativo.
    expect(prazoMaximoMeses(new Date("1930-01-10T12:00:00Z"), HOJE)).toBe(0);
  });

  it("prazo curto vira aviso de parcela alta", () => {
    const a = analisar({ ...COMPLETO, dataNascimento: new Date("1955-01-10T12:00:00Z") }, HOJE);
    expect(a.prazoMaximoMeses).toBeLessThan(120);
    expect(a.atencoes.join(" ")).toContain("parcela sai mais alta");
  });

  it("FGTS só serve com 3 anos de registro", () => {
    expect(analisar(COMPLETO, HOJE).podeUsarFgts).toBe(true);
    const semTempo = analisar({ ...COMPLETO, tresAnosRegistro: false }, HOJE);
    expect(semTempo.podeUsarFgts).toBe(false);
    expect(semTempo.atencoes.join(" ")).toContain("Pró-Cotista");
    // Sem a resposta, o sistema diz que não sabe em vez de assumir.
    expect(analisar({ ...COMPLETO, temFgts: null }, HOJE).podeUsarFgts).toBeNull();
  });

  it("o resumo cabe num card", () => {
    expect(resumo({ quartosDesejados: 2 })).toBe("1/15 perguntas");
    expect(resumo(COMPLETO)).toBe("15/15 perguntas · Faixa 3 · 0/6 documentos");
    expect(resumo({ ...COMPLETO, documentosRecebidos: ["IDENTIDADE"] })).toContain("1/6 documentos");
    // Autônomo tem menos documentos aplicáveis, e o resumo reflete isso.
    expect(resumo({ ...COMPLETO, vinculo: "AUTONOMO" })).toContain("0/4 documentos");
    expect(resumo({ ...COMPLETO, vinculo: "AUTONOMO", temFgts: false })).toContain("0/3 documentos");
  });
});

describe("estado civil muda a coleta", () => {
  const CASADO = { ...COMPLETO, estadoCivil: "CASADO" };

  it("casado ganha as 4 perguntas do cônjuge; solteiro não vê nenhuma", () => {
    expect(analisar(COMPLETO, HOJE).total).toBe(15);
    expect(analisar(CASADO, HOJE).total).toBe(20);
    // A do imóvel do cônjuge vem PRIMEIRO: é ela que elimina.
    expect(proximaPergunta(CASADO)!.chave).toBe("conjugeImovelProprio");
    // União estável conta igual a casamento.
    expect(analisar({ ...COMPLETO, estadoCivil: "UNIAO_ESTAVEL" }, HOJE).total).toBe(20);
    expect(analisar({ ...COMPLETO, estadoCivil: "DIVORCIADO" }, HOJE).total).toBe(15);
  });

  it("a renda do cônjuge SOMA e é isso que faz o casal caber na faixa", () => {
    // Sozinho, 2.500 é Faixa 1. Com o cônjuge, a família vai para a Faixa 2.
    const so = analisar({ ...COMPLETO, rendaBrutaMensal: 2500 }, HOJE);
    expect(so.faixa?.faixa).toBe(1);
    const casal = analisar(
      { ...CASADO, rendaBrutaMensal: 2500, conjugeRendaBrutaMensal: 2000 },
      HOJE
    );
    expect(rendaFamiliar({ ...CASADO, rendaBrutaMensal: 2500, conjugeRendaBrutaMensal: 2000 })).toBe(4500);
    expect(casal.faixa?.faixa).toBe(2);
    expect(casal.parcelaMaxima).toBe(1350); // 30% de 4.500
  });

  it("a renda do cônjuge NÃO soma quando a pessoa é solteira", () => {
    // Campo sobrando de um cadastro anterior não pode inflar a renda.
    const r = { ...COMPLETO, estadoCivil: "SOLTEIRO", conjugeRendaBrutaMensal: 9000 };
    expect(rendaFamiliar(r)).toBe(6000);
  });

  it("o prazo é limitado pelo comprador MAIS VELHO do casal", () => {
    const casal = analisar(
      {
        ...CASADO,
        dataNascimento: new Date("1990-05-10T12:00:00Z"), // 36 anos
        conjugeDataNascimento: new Date("1966-05-10T12:00:00Z"), // 60 anos
      },
      HOJE
    );
    expect(casal.idade).toBe(60);
    expect(casal.prazoMaximoMeses).toBe(244); // o prazo do mais velho, não o do titular
  });

  it("casado entrega também os documentos do cônjuge", () => {
    expect(documentosAplicaveis(CASADO).map((d) => d.chave)).toContain("CONJUGE");
    expect(documentosAplicaveis(COMPLETO).map((d) => d.chave)).not.toContain("CONJUGE");
  });
});

describe("renda declarada no imposto de renda", () => {
  it("renda não declarada vira atenção, não impeditivo", () => {
    // Não é barreira: parte da renda pode ser declarada. Mas o banco só olha o
    // que é comprovável, e descobrir isso na análise é tarde demais.
    const a = analisar({ ...COMPLETO, rendaDeclaradaIr: false }, HOJE);
    expect(a.impeditivos).toEqual([]);
    expect(a.atencoes.join(" ")).toContain("NÃO declarada no último IR");
  });

  it("sem a resposta, não inventa alerta", () => {
    expect(analisar({ ...COMPLETO, rendaDeclaradaIr: null }, HOJE).atencoes.join(" ")).not.toContain(
      "IR"
    );
  });
});

describe("imóvel no nome do cônjuge, entrada e parcela", () => {
  const CASADO = {
    ...COMPLETO,
    estadoCivil: "CASADO",
    conjugeNome: "Maria",
    conjugeVinculo: "CLT",
    conjugeRendaBrutaMensal: 2000,
    conjugeDataNascimento: new Date("1992-01-10T12:00:00Z"),
  };

  it("imóvel no nome do cônjuge tira o CASAL do MCMV", () => {
    // No financiamento os dois entram como compradores: o imóvel dele conta
    // como se fosse dos dois.
    const a = analisar({ ...CASADO, conjugeImovelProprio: true }, HOJE);
    expect(a.impeditivos.join(" ")).toContain("Cônjuge já tem imóvel");
    expect(a.impeditivos.join(" ")).toContain("SBPE");
  });

  it("cônjuge sem imóvel não gera impeditivo", () => {
    expect(analisar({ ...CASADO, conjugeImovelProprio: false }, HOJE).impeditivos).toEqual([]);
  });

  it("a pergunta do imóvel do cônjuge não existe para solteiro", () => {
    const chaves = analisar(COMPLETO, HOJE);
    expect(chaves.total).toBe(15);
    // Mesmo com o campo preenchido por engano, ele não conta nem elimina.
    const a = analisar({ ...COMPLETO, conjugeImovelProprio: true }, HOJE);
    expect(a.impeditivos).toEqual([]);
  });

  it("a entrada aumenta o teto real de compra", () => {
    const a = analisar({ ...COMPLETO, entradaDisponivel: 50_000 }, HOJE);
    expect(a.faixa?.tetoImovel).toBe(350_000);
    expect(a.tetoComEntrada).toBe(400_000);
    expect(a.entradaDisponivel).toBe(50_000);
  });

  it("parcela esperada acima do que a renda permite vira aviso", () => {
    // Renda 6.000 → o banco aceita 1.800. Esperar 3.000 é expectativa fora da
    // realidade, e é melhor descobrir agora do que na proposta.
    const a = analisar({ ...COMPLETO, parcelaDesejada: 3000 }, HOJE);
    expect(a.atencoes.join(" ")).toContain("acima do que a renda permite");
    expect(a.impeditivos).toEqual([]);
  });

  it("parcela dentro do limite não gera aviso", () => {
    expect(analisar({ ...COMPLETO, parcelaDesejada: 1500 }, HOJE).atencoes.join(" ")).not.toContain(
      "acima do que a renda permite"
    );
  });
});

describe("nome restrito: a escada PARA", () => {
  it("com restrição, as únicas perguntas que seguem são as da própria restrição", () => {
    const r = { ...COMPLETO, nomeRestrito: true, previsaoQuitacao: null, temOutroTitular: null };
    // Mesmo com todo o resto respondido, o que vem é a previsão de quitação.
    expect(proximaPergunta(r)!.chave).toBe("previsaoQuitacao");
    const comData = { ...r, previsaoQuitacao: new Date("2026-12-01T12:00:00Z") };
    expect(proximaPergunta(comData)!.chave).toBe("temOutroTitular");
  });

  it("respondidas as duas e sem outro nome, a IA fica sem próxima pergunta", () => {
    // É isto que impede a IA de insistir: não sobra nada para perguntar.
    // "false" é resposta: perguntei e não tem ninguém. Se isso virasse null,
    // a IA repergunta para sempre — o bug que motivou a regra.
    const r = {
      ...COMPLETO,
      nomeRestrito: true,
      previsaoQuitacao: new Date("2026-12-01T12:00:00Z"),
      temOutroTitular: false,
    };
    expect(proximaPergunta(r)).toBeNull();
    expect(bloqueadoPorRestricao(r)).toBe(true);
  });

  it("o bloqueio carrega a data da volta e NÃO conta como qualificação completa", () => {
    const a = analisar(
      {
        ...COMPLETO,
        nomeRestrito: true,
        previsaoQuitacao: new Date("2026-12-01T12:00:00Z"),
        temOutroTitular: false,
      },
      HOJE
    );
    expect(a.bloqueio?.retomarEm).toEqual(new Date("2026-12-01T12:00:00Z"));
    expect(a.completa).toBe(false);
    expect(a.impeditivos.join(" ")).toContain("NÃO apresente imóvel");
  });

  it("outro nome destrava e a conversa segue normalmente", () => {
    const r = {
      ...COMPLETO,
      nomeRestrito: true,
      previsaoQuitacao: new Date("2026-12-01T12:00:00Z"),
      temOutroTitular: true,
      nomeAlternativo: "Maria da Silva (mãe)",
    };
    expect(bloqueadoPorRestricao(r)).toBe(false);
    const a = analisar(r, HOJE);
    expect(a.bloqueio).toBeNull();
    expect(a.completa).toBe(true);
    expect(a.atencoes.join(" ")).toContain("Maria da Silva");
  });

  it("nome limpo não abre pergunta nenhuma de restrição", () => {
    expect(analisar(COMPLETO, HOJE).total).toBe(15);
    // Restrição abre duas: previsão de quitação e "tem outro titular?".
    expect(analisar({ ...COMPLETO, nomeRestrito: true }, HOJE).total).toBe(17);
    // O nome só é pedido depois do "sim" — não se pergunta nome de quem não existe.
    expect(analisar({ ...COMPLETO, nomeRestrito: true, temOutroTitular: true }, HOJE).total).toBe(18);
  });
});

describe("entrada: sem entrada e querendo parcelar, só na planta", () => {
  it("entrada zero abre a pergunta do parcelamento; entrada > 0 não", () => {
    // 0 é RESPOSTA ("não tenho"), diferente de null ("ainda não perguntei").
    const semNada = { ...COMPLETO, entradaDisponivel: 0, querParcelarEntrada: null };
    expect(proximaPergunta(semNada)!.chave).toBe("querParcelarEntrada");
    expect(proximaPergunta(COMPLETO)).toBeNull();
  });

  it("sem entrada e querendo parcelar, a busca fica presa em empreendimento não entregue", () => {
    const a = analisar({ ...COMPLETO, entradaDisponivel: 0, querParcelarEntrada: true }, HOJE);
    expect(a.somenteNaPlanta).toBe(true);
    expect(a.atencoes.join(" ")).toContain("não entregue");
    expect(a.atencoes.join(" ")).toContain("FGTS");
  });

  it("sem entrada mas SEM querer parcelar não prende a busca", () => {
    const a = analisar({ ...COMPLETO, entradaDisponivel: 0, querParcelarEntrada: false }, HOJE);
    expect(a.somenteNaPlanta).toBe(false);
  });
});

describe("preferência de produto vira filtro", () => {
  it("a análise devolve o que a pessoa pediu, para a busca usar", () => {
    const a = analisar(COMPLETO, HOJE);
    expect(a.quartos).toBe(2);
    expect(a.banheiros).toBe(1);
    expect(a.localizacao).toBe("Vila Redentora");
  });
});

describe("o cliente que ABRE dizendo que tem restrição", () => {
  // O caso do print: primeira mensagem já é "quero comprar mas tenho restrição".
  // Nada mais foi perguntado ainda.
  const soARestricao = { nomeRestrito: true };

  it("a próxima pergunta é a previsão de quitação, não o silêncio", () => {
    // Antes devolvia null: a primeira pendente global era "quantos quartos", que
    // não é do bloco da restrição, e a escada parava sem coletar a data.
    expect(proximaPergunta(soARestricao)!.chave).toBe("previsaoQuitacao");
  });

  it("depois da data vem o outro titular, e só então o silêncio", () => {
    const comData = { ...soARestricao, previsaoQuitacao: new Date("2026-12-01T12:00:00Z") };
    expect(proximaPergunta(comData)!.chave).toBe("temOutroTitular");
    expect(proximaPergunta({ ...comData, temOutroTitular: false })).toBeNull();
  });

  it("com outro titular, a escada volta do começo — pelo produto", () => {
    const destravado = {
      ...soARestricao,
      previsaoQuitacao: new Date("2026-12-01T12:00:00Z"),
      temOutroTitular: true,
      nomeAlternativo: "Maria",
    };
    expect(proximaPergunta(destravado)!.chave).toBe("quartosDesejados");
  });
});
