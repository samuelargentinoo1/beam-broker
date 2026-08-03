// O TTS soletra dígito. "R$ 350.000,00" vira "erre cifrão trezentos ponto zero
// zero zero vírgula zero zero" em qualquer motor de voz — e nenhuma instrução
// no prompt garante que a IA escreva por extenso toda vez. Por isso a conversão
// é mecânica, e por isso ela tem teste.
import { describe, expect, it } from "vitest";

import { extenso, numeroPorExtenso } from "@/lib/numero-extenso";

describe("extenso de um número", () => {
  it("os limites que quebram implementação ingênua", () => {
    expect(extenso(0)).toBe("zero");
    expect(extenso(100)).toBe("cem"); // não "cento"
    expect(extenso(101)).toBe("cento e um"); // "cento" só quando tem resto
    expect(extenso(1000)).toBe("mil"); // não "um mil"
    expect(extenso(1_000_000)).toBe("um milhão"); // aqui o "um" É obrigatório
  });

  it("a regra do 'e' antes do último bloco", () => {
    // "e" entra quando o resto é menor que cem OU é centena redonda.
    expect(extenso(1500)).toBe("mil e quinhentos");
    expect(extenso(1200)).toBe("mil e duzentos");
    expect(extenso(1234)).toBe("mil duzentos e trinta e quatro");
    expect(extenso(1050)).toBe("mil e cinquenta");
  });

  it("valores de imóvel, que é o que a Carol fala o dia inteiro", () => {
    expect(extenso(350_000)).toBe("trezentos e cinquenta mil");
    expect(extenso(189_900)).toBe("cento e oitenta e nove mil e novecentos");
    expect(extenso(2_500_000)).toBe("dois milhões e quinhentos mil");
  });
});

describe("moeda", () => {
  it("o caso que motivou tudo", () => {
    expect(numeroPorExtenso("R$ 350.000,00")).toBe("trezentos e cinquenta mil reais");
  });

  it("valor sem centavo escrito", () => {
    expect(numeroPorExtenso("R$ 2.500")).toBe("dois mil e quinhentos reais");
  });

  it("centavo zerado SOME — ninguém fala 'vírgula zero zero'", () => {
    expect(numeroPorExtenso("R$ 1.200,00")).not.toContain("centavo");
  });

  it("centavo de verdade é falado", () => {
    expect(numeroPorExtenso("R$ 1.250,50")).toBe(
      "mil duzentos e cinquenta reais e cinquenta centavos"
    );
  });

  it("singular de um real", () => {
    expect(numeroPorExtenso("R$ 1,00")).toBe("um real");
  });

  it("valor já escrito com escala", () => {
    expect(numeroPorExtenso("a partir de R$ 350 mil")).toBe(
      "a partir de trezentos e cinquenta mil reais"
    );
    expect(numeroPorExtenso("R$ 1,2 milhão")).toContain("milhão de reais");
  });
});

describe("as notações do ramo imobiliário", () => {
  it("metragem nas duas grafias", () => {
    expect(numeroPorExtenso("70m²")).toBe("setenta metros quadrados");
    expect(numeroPorExtenso("70 m2")).toBe("setenta metros quadrados");
  });

  it("2/4 é dois quartos, não uma fração", () => {
    expect(numeroPorExtenso("apê 2/4")).toContain("dois quartos");
    expect(numeroPorExtenso("3/4 no centro")).toContain("três quartos");
  });

  it("percentual com decimal", () => {
    expect(numeroPorExtenso("9,99%")).toBe("nove vírgula noventa e nove por cento");
    expect(numeroPorExtenso("8%")).toBe("oito por cento");
  });

  it("ordinal", () => {
    expect(numeroPorExtenso("1º andar")).toBe("primeiro andar");
    expect(numeroPorExtenso("2ª parcela")).toContain("segunda");
  });
});

describe("hora falada como gente fala", () => {
  it("13:30 é uma e meia da tarde, não treze e trinta", () => {
    // Hora militar em conversa soa a despacho de rádio.
    expect(numeroPorExtenso("13:30")).toBe("uma e meia da tarde");
  });

  it("reconhece o período do dia", () => {
    expect(numeroPorExtenso("9:00")).toContain("da manhã");
    expect(numeroPorExtenso("20:00")).toContain("da noite");
  });

  it("meia e quinze têm nome próprio", () => {
    expect(numeroPorExtenso("10:15")).toContain("e quinze");
    expect(numeroPorExtenso("10:30")).toContain("e meia");
  });

  it("aceita a grafia com h", () => {
    expect(numeroPorExtenso("14h30")).toContain("e meia");
    expect(numeroPorExtenso("às 9h")).toContain("da manhã");
  });
});

describe("concordância de gênero", () => {
  it("duas vagas, dois quartos, uma suíte", () => {
    // "dois vagas" entrega a máquina na hora.
    expect(numeroPorExtenso("2 vagas")).toContain("duas vagas");
    expect(numeroPorExtenso("2 quartos")).toContain("dois quartos");
    expect(numeroPorExtenso("1 suíte")).toContain("uma suíte");
  });
});

describe("idempotente", () => {
  it("rodar duas vezes não duplica nada", () => {
    // Garantido por construção: depois da primeira passada não sobra dígito.
    for (const t of [
      "O Bosque tem 2/4, 70m² e sai por R$ 350.000,00",
      "Visita 13:30, entrada de R$ 2.500 e juros de 9,99%",
      "1º andar, 2 vagas, a 3 km do centro",
    ]) {
      const uma = numeroPorExtenso(t);
      expect(numeroPorExtenso(uma)).toBe(uma);
    }
  });

  it("depois da conversão não sobra dígito para o TTS soletrar", () => {
    const dito = numeroPorExtenso("O Bosque tem 2/4, 70m² e sai por R$ 350.000,00 às 13:30");
    expect(dito).not.toMatch(/\d/);
    expect(dito).not.toContain("R$");
  });
});

describe("o que NÃO deve mexer", () => {
  it("texto sem número passa intacto", () => {
    const t = "Olha, tem sim, pode vir ver quando quiser.";
    expect(numeroPorExtenso(t)).toBe(t);
  });
});
