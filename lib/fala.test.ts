// O que faz a Carol soar gente não é a voz escolhida — é o texto que chega no
// TTS e o ritmo com que ele é dito. Estes testes travam as duas coisas.
import { describe, expect, it } from "vitest";

import {
  falarSiglas,
  oralidade,
  prepararFala,
  prosodia,
  respiracao,
  duracaoFalaMs,
  marcadoresDeFala,
  climaDoTexto,
} from "@/lib/fala";

// Números, dinheiro e medidas migraram para lib/numero-extenso.test.ts —
// eram duas cópias da mesma lógica, e duas cópias divergem.

describe("siglas do ramo", () => {
  it("FGTS e companhia são soletrados, não lidos como palavra", () => {
    expect(falarSiglas("usa o FGTS")).toBe("usa o efe gê tê esse");
    expect(falarSiglas("entra no MCMV")).toBe("entra no Minha Casa Minha Vida");
    expect(falarSiglas("o IPTU é anual")).toContain("i pê tê u");
  });

  it("abreviação de endereço vira palavra inteira", () => {
    expect(falarSiglas("Av. Brasil, apto 42")).toContain("Avenida Brasil");
    expect(falarSiglas("Av. Brasil, apto 42")).toContain("apartamento");
  });
});

describe("oralidade", () => {
  it("troca só o que é seguro trocar", () => {
    expect(oralidade("está disponível")).toBe("tá disponível");
    expect(oralidade("bom para a família")).toBe("bom pra família");
    expect(oralidade("ótimo para o casal")).toBe("ótimo pro casal");
  });

  it("NÃO estraga 'para' como verbo", () => {
    // "o ônibus para na esquina" não pode virar "o ônibus pra na esquina".
    expect(oralidade("o ônibus para na esquina")).toBe("o ônibus para na esquina");
  });
});

describe("respiração", () => {
  it("emoji não é lido em voz alta", () => {
    expect(respiracao("Achei um ótimo 😍 quer ver?")).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it("risada escrita some do texto (vira emoção, não sílaba)", () => {
    expect(respiracao("kkkk pois é")).not.toContain("kkkk");
    expect(respiracao("haha entendi")).not.toContain("haha");
  });

  it("quebra de linha vira pausa de frase", () => {
    expect(respiracao("Oi\nTudo bem?")).toBe("Oi. Tudo bem?");
  });

  it("reticências viram pausa, não três pontos lidos", () => {
    expect(respiracao("olha... é isso")).toBe("olha, é isso");
  });
});

describe("o pipeline inteiro", () => {
  it("a frase típica da Carol sai inteiramente falável", () => {
    const dito = prepararFala("O Bosque tem 2 quartos, 70 m², e sai por R$ 189.900,00 😍");
    expect(dito).toContain("dois quartos");
    expect(dito).toContain("setenta metros quadrados");
    expect(dito).toContain("cento e oitenta e nove mil e novecentos reais");
    expect(dito).not.toMatch(/\d/); // nenhum dígito sobra para o TTS soletrar
    expect(dito).not.toMatch(/R\$/);
  });

  it("fecha a frase — sem ponto final a entonação fica pendurada", () => {
    // Frases que já abrem como fala não ganham marcador, então dá para ver o
    // fechamento isolado.
    expect(prepararFala("Olha, tem sim")).toBe("Olha, tem sim.");
    expect(prepararFala("Oi, quer ver?")).toBe("Oi, quer ver?");
  });
});

describe("prosódia: o ritmo vem do que a frase diz", () => {
  it("toda fala cai dentro da faixa de conversa — 1,00 a 1,11", () => {
    for (const t of [
      "Oi!",
      "Quer ver?",
      "Saiu a aprovação do seu financiamento!",
      "Infelizmente esse já foi vendido e não temos outro parecido.",
      "Fica em 350 mil reais, com 70 m² e 8% de juros.",
      "a".repeat(300),
    ]) {
      const s = prosodia(t).speed;
      expect(s).toBeGreaterThanOrEqual(1.0);
      expect(s).toBeLessThanOrEqual(1.11);
    }
  });

  it("o TOM nunca muda, em nenhuma situação", () => {
    // O pitch da MiniMax é global: mexer nele não faz entonação dentro da
    // frase, troca a voz inteira. Duas bolhas seguidas soavam como duas
    // pessoas diferentes.
    expect(prosodia("Quer ver?").pitch).toBe(0);
    expect(prosodia("Quero ver.").pitch).toBe(0);
  });

  it("o tom fica em zero em QUALQUER situação", () => {
    for (const t of ["Quer ver?", "Infelizmente foi vendido.", "Saiu a aprovação!", "Oi"]) {
      expect(prosodia(t).pitch).toBe(0);
    }
  });

  it("a variação de ritmo cabe numa faixa estreita — é a mesma pessoa falando", () => {
    // Antes: 12,7% entre duas bolhas seguidas. O ouvido lê isso como troca de
    // locutor, e não como ênfase.
    const casos = [
      "Oi! Tudo bem?",
      "Infelizmente esse já foi vendido.",
      "Tem sim, pode vir ver.",
      "Fica em 350 mil reais, com 70 m².",
      "a".repeat(300),
    ].map((t) => prosodia(t).speed);
    // O espalhamento é limitado pela própria faixa 1,00–1,11: no máximo 11%.
    // Sem esse limite, jitter mais largo + modificadores chegavam a 18,4% —
    // pior que os 12,7% que soavam como troca de locutor.
    // 0,111 e não 0,11: a faixa dá exatamente 11%, e ponto flutuante devolve
    // 0.1100000000000001 na conta.
    const spread = (Math.max(...casos) - Math.min(...casos)) / Math.min(...casos);
    expect(spread).toBeLessThanOrEqual(0.111);
  });

  it("notícia boa sai animada e mais rápida; ruim, mais lenta e baixa", () => {
    const boa = prosodia("Saiu a aprovação do seu financiamento!");
    const ruim = prosodia("Infelizmente esse já foi vendido.");
    expect(boa.emotion).toBe("happy");
    expect(ruim.emotion).toBe("sad");
    expect(boa.speed).toBeGreaterThan(ruim.speed);
  });

  it("valor e metragem DESACELERAM — o cliente precisa acompanhar", () => {
    // Com o jitter mais largo que o pedido trouxe, o modificador de conteúdo
    // desloca a distribuição mas já não domina frase a frase. O que dá para
    // afirmar é a MÉDIA: textos com dado saem mais lentos que textos sem.
    const media = (ts: string[]) => ts.reduce((s, t) => s + prosodia(t).speed, 0) / ts.length;
    const comDado = media([
      "Fica em 350 mil reais.",
      "São 70 m² no total.",
      "O juros fica em 8% ao ano.",
      "A entrada é de 50 mil.",
    ]);
    const semDado = media([
      "Fica bem pertinho de você.",
      "Esse combina com o que procura.",
      "Dá pra ver quando quiser.",
      "Tem sim, pode vir.",
    ]);
    expect(comDado).toBeLessThan(semDado);
  });

  it("a tag escrita pela IA manda mais que o conteúdo", () => {
    // Quem redigiu escolheu de propósito; não se sobrepõe isso por heurística.
    expect(prosodia("Esse já foi vendido", "happy").emotion).toBe("happy");
  });

  it("risada escrita vira emoção, mesmo sem tag", () => {
    expect(prosodia("kkkk pois é").emotion).toBe("happy");
  });

  it("frases diferentes têm cadências diferentes — gente não é metrônomo", () => {
    const a = prosodia("Tem sim, pode vir ver.");
    const b = prosodia("Claro, é só me falar.");
    expect(a.speed).not.toBe(b.speed);
  });

  it("a MESMA frase sai sempre igual — a variação é determinística", () => {
    expect(prosodia("Tem sim, pode vir ver.").speed).toBe(prosodia("Tem sim, pode vir ver.").speed);
  });

  it("fala em ritmo de conversa, não de locução", () => {
    for (const t of [
      "Oi!",
      "Infelizmente esse já foi vendido e não temos outro parecido.",
      "Saiu a aprovação!",
      "a".repeat(300),
      "Fica em 350 mil reais, com 70 m² e 8% de juros.",
    ]) {
      const p = prosodia(t);
      // 0,95 era ritmo de LOCUÇÃO. Conversa de WhatsApp passa de 1.
      expect(p.speed).toBeGreaterThanOrEqual(1.0);
      expect(p.speed).toBeLessThanOrEqual(1.25);
    }
  });
});

// A bolinha de "gravando áudio" durava 8 segundos para QUALQUER áudio. Isso
// entrega a máquina tanto quanto a voz: ninguém leva 8 segundos gravando
// "tem sim, pode vir ver".
describe("quanto tempo o 'gravando áudio' fica no ar", () => {
  it("áudio curto grava rápido; áudio longo grava por mais tempo", () => {
    const curto = duracaoFalaMs("Tem sim, pode vir ver.");
    const longo = duracaoFalaMs(
      "Olha, esse do Bosque tem dois quartos e uma vaga, fica pertinho do centro, " +
        "e a entrada dá pra parcelar em até sessenta meses. Quer que eu te mande o book?"
    );
    expect(longo).toBeGreaterThan(curto * 2);
  });

  it("falando mais rápido, grava por menos tempo", () => {
    const t = "Achei um que combina bem com o que você procura.";
    expect(duracaoFalaMs(t, 1.2)).toBeLessThan(duracaoFalaMs(t, 0.9));
  });

  it("nunca some nem trava o atendimento", () => {
    expect(duracaoFalaMs("Oi")).toBeGreaterThanOrEqual(1500);
    expect(duracaoFalaMs("a".repeat(5000))).toBeLessThanOrEqual(20000);
  });
});

// Ninguém começa a falar direto no assunto. "Olha,", "Então," são o que separa
// FALA de texto lido em voz alta — e some do texto escrito, porque quem escreve
// já corta isso. Por isso vive só no caminho do áudio.
describe("marcadores de fala", () => {
  it("abre como quem fala, não como quem lê", () => {
    const dito = marcadoresDeFala("tem sim, pode vir ver quando quiser hoje");
    expect(dito).toMatch(/^(Olha|Então|Ah|Olha só|Ó|Poxa|Pois é)/);
  });

  it("NÃO empilha marcador em cima de saudação que já existe", () => {
    expect(marcadoresDeFala("Oi! Tudo bem?")).toBe("Oi! Tudo bem?");
    expect(marcadoresDeFala("Olha, tem sim")).toBe("Olha, tem sim");
  });

  it("o marcador combina com o clima — 'Poxa' não abre notícia boa", () => {
    const ruim = marcadoresDeFala("esse já foi vendido ontem, que pena mesmo", "ruim");
    expect(ruim).not.toMatch(/^Olha só/);
  });

  it("frases diferentes abrem diferente — um marcador só seria o mesmo robô", () => {
    const abre = (t: string) => marcadoresDeFala(t).split(",")[0];
    const variantes = new Set(
      [
        "tem sim, pode vir ver quando quiser",
        "consigo te mandar as fotos agora mesmo",
        "esse fica bem pertinho do centro da cidade",
        "dá pra agendar amanhã de manhã sem problema",
        "a entrada pode ser parcelada em vários meses",
      ].map(abre)
    );
    expect(variantes.size).toBeGreaterThan(1);
  });

  it("a MESMA frase abre sempre igual", () => {
    const t = "tem sim, pode vir ver quando quiser";
    expect(marcadoresDeFala(t)).toBe(marcadoresDeFala(t));
  });

  it("o marcador é do ÁUDIO — quem lê recebe o texto enxuto", () => {
    // marcadoresDeFala só é chamado dentro de prepararFala, e prepararFala só
    // roda no caminho da voz (corpoMinimax). O texto das bolhas não passa aqui.
    const escrito = "tem sim, pode vir ver quando quiser";
    expect(escrito).not.toMatch(/^(Olha|Então|Ah|Ó|Poxa|Pois é)/);
    expect(prepararFala(escrito)).toMatch(/^(Olha|Então|Ah|Ó|Poxa|Pois é)/);
  });
});

describe("clima da mensagem", () => {
  it("separa notícia boa, ruim e neutra", () => {
    expect(climaDoTexto("Saiu a aprovação!")).toBe("boa");
    expect(climaDoTexto("Infelizmente já foi vendido")).toBe("ruim");
    expect(climaDoTexto("O endereço é rua A")).toBe("geral");
  });

  it("é generoso com o que vira emoção — a voz foi pedida expressiva", () => {
    expect(climaDoTexto("Esse combina com o que você procura")).toBe("boa");
    expect(climaDoTexto("Tem sim")).toBe("boa");
    expect(climaDoTexto("Você tem restrição no nome?")).toBe("ruim");
  });
});
