// O bug: a IA responde, quebra a objeção do lead e manda a MESMA resposta de
// novo — na mesma mensagem ou ecoando a anterior. O corte é mecânico, então
// vale mesmo quando o modelo desobedece o prompt.
import { describe, expect, it } from "vitest";

import {
  normalizarParaComparar,
  semEcoDaAnterior,
  semRepeticao,
  semRepeticaoInterna,
} from "@/lib/repeticao";
import { dividirEmBolhas } from "@/lib/whatsapp";

describe("comparação por significado, não por formatação", () => {
  it("ignora acento, pontuação, caixa e tags de áudio", () => {
    expect(normalizarParaComparar("Você tem FGTS?")).toBe(
      normalizarParaComparar("[laughs] voce tem fgts")
    );
    expect(normalizarParaComparar("R$ 259.300,00")).toBe(normalizarParaComparar("r$ 259 300 00"));
  });
});

describe("repetição dentro da mesma mensagem", () => {
  it("corta a bolha repetida e mantém a ordem", () => {
    const partes = [
      "A entrega está prevista para março de 2029.",
      "Entendo a preocupação, é longe mesmo, mas o preço trava agora.",
      "A entrega está prevista para março de 2029.",
      "Esse vai ser seu primeiro imóvel?",
    ];
    expect(semRepeticaoInterna(partes)).toEqual([
      "A entrega está prevista para março de 2029.",
      "Entendo a preocupação, é longe mesmo, mas o preço trava agora.",
      "Esse vai ser seu primeiro imóvel?",
    ]);
  });

  it("pega a repetição mesmo escrita um pouco diferente", () => {
    const partes = ["Você tem saldo de FGTS?", "voce tem saldo de fgts"];
    expect(semRepeticaoInterna(partes)).toHaveLength(1);
  });

  it("não mexe em confirmação curta legítima", () => {
    // "Certo." duas vezes é feio, mas cortar deixaria a conversa truncada — e
    // o risco de falso positivo em frase curta é alto.
    expect(semRepeticaoInterna(["Certo.", "Certo."])).toHaveLength(2);
  });

  it("o divisor de bolhas do WhatsApp já entrega sem repetição", () => {
    const texto = "Fica no Jardim Aclimação, em Rio Preto.\n\nEntendo.\n\nFica no Jardim Aclimação, em Rio Preto.";
    expect(dividirEmBolhas(texto)).toEqual([
      "Fica no Jardim Aclimação, em Rio Preto.",
      "Entendo.",
    ]);
  });
});

describe("eco da mensagem anterior", () => {
  const anterior = "R$ 259.300, 200 m², entrega em 03/2029.\n\nQuer que eu veja se cabe no seu bolso?";

  it("tira o parágrafo que só repete o que já foi dito", () => {
    const nova =
      "R$ 259.300, 200 m², entrega em 03/2029.\n\nEntendo, o prazo assusta mesmo. Esse vai ser seu primeiro imóvel?";
    expect(semEcoDaAnterior(nova, anterior)).toBe(
      "Entendo, o prazo assusta mesmo. Esse vai ser seu primeiro imóvel?"
    );
  });

  it("resposta INTEIRA repetida é mantida — calar a IA é pior que repetir", () => {
    expect(semEcoDaAnterior(anterior, anterior)).toBe(anterior);
  });

  it("sem mensagem anterior, não mexe em nada", () => {
    const nova = "Oi, aqui é a Carol.";
    expect(semEcoDaAnterior(nova, null)).toBe(nova);
    expect(semEcoDaAnterior(nova, "")).toBe(nova);
  });

  it("resposta nova de verdade passa intacta", () => {
    const nova = "Entendo. Você trabalha registrado ou é autônomo?";
    expect(semEcoDaAnterior(nova, anterior)).toBe(nova);
  });
});

describe("os dois cortes juntos", () => {
  it("o caso completo: eco da anterior mais bolha duplicada", () => {
    const anterior = "O Residencial Clarisse Novelli fica no Jardim Aclimação.";
    const nova =
      "O Residencial Clarisse Novelli fica no Jardim Aclimação.\n\n" +
      "Entendo que pareça longe, mas dá 15 minutos do centro.\n\n" +
      "Entendo que pareça longe, mas dá 15 minutos do centro.\n\n" +
      "Esse vai ser seu primeiro imóvel?";
    expect(semRepeticao(nova, anterior)).toBe(
      "Entendo que pareça longe, mas dá 15 minutos do centro.\n\nEsse vai ser seu primeiro imóvel?"
    );
  });
});
