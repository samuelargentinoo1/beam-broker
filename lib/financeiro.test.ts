// Testes das regras financeiras — os valores esperados foram calculados À MÃO,
// não gerados pelo código. É aqui que um bug vira prejuízo para o cliente.
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  aplicarReajuste,
  calcularEncargosAtraso,
  calcularMultaRescisao,
  calcularRemuneracao,
  calcularRepasse,
  centavos,
} from "@/lib/financeiro";

const D = (x: number | string) => new Prisma.Decimal(x);

describe("calcularEncargosAtraso", () => {
  it("multa 2% + juros 1% a.m. pro rata em 17 dias sobre R$ 2.847,33", () => {
    const { multa, juros } = calcularEncargosAtraso("2847.33", 17, 2, 1);
    // multa = 2847,33 * 0,02 = 56,9466 -> 56,95
    expect(multa.toFixed(2)).toBe("56.95");
    // juros = 2847,33 * 0,01 * 17/30 = 16,13487 -> 16,13
    expect(juros.toFixed(2)).toBe("16.13");
  });

  it("sem atraso não cobra nada", () => {
    const { multa, juros } = calcularEncargosAtraso("1000.00", 0, 2, 1);
    expect(multa.toFixed(2)).toBe("0.00");
    expect(juros.toFixed(2)).toBe("0.00");
  });

  it("dízima: aluguel R$ 1.000,00 com juros 3,33%", () => {
    // 1000 * 0,0333 * 30/30 = 33,30
    const { juros } = calcularEncargosAtraso("1000.00", 30, 2, "3.33");
    expect(juros.toFixed(2)).toBe("33.30");
  });
});

describe("calcularRemuneracao", () => {
  it("taxa de administração 8,5% sobre R$ 3.200,00 = 272,00", () => {
    const r = calcularRemuneracao({
      modeloRemuneracao: "PERCENTUAL",
      valorAluguel: "3200.00",
      taxaAdmPercent: "8.5",
      ehPrimeiraFatura: false,
    });
    expect(r.toFixed(2)).toBe("272.00");
  });

  it("modelo PRIMEIRO_ALUGUEL: 1ª fatura retém 100%, demais 0", () => {
    const primeira = calcularRemuneracao({
      modeloRemuneracao: "PRIMEIRO_ALUGUEL",
      valorAluguel: "1850.00",
      taxaAdmPercent: "10",
      ehPrimeiraFatura: true,
    });
    const demais = calcularRemuneracao({
      modeloRemuneracao: "PRIMEIRO_ALUGUEL",
      valorAluguel: "1850.00",
      taxaAdmPercent: "10",
      ehPrimeiraFatura: false,
    });
    expect(primeira.toFixed(2)).toBe("1850.00");
    expect(demais.toFixed(2)).toBe("0.00");
  });
});

describe("calcularRepasse", () => {
  it("desconto de manutenção maior que o aluguel dá zero, não negativo", () => {
    const { repasse } = calcularRepasse({ valorPago: "1000.00", taxaAdm: "100.00", descontos: "2000.00" });
    expect(repasse.toFixed(2)).toBe("0.00");
    expect(repasse.isNegative()).toBe(false);
  });

  it("repasse = pago - taxa - descontos - seguro-fiança", () => {
    const { repasse } = calcularRepasse({
      valorPago: "2000.00",
      taxaAdm: "200.00",
      descontos: "50.00",
      seguroFianca: "100.00",
    });
    // 2000 - 200 - 50 - 100 = 1650
    expect(repasse.toFixed(2)).toBe("1650.00");
  });
});

describe("calcularMultaRescisao", () => {
  it("contrato de 30 meses rescindido no mês 22 (8/30 restantes, 3 aluguéis)", () => {
    const inicio = new Date(Date.UTC(2024, 0, 1));
    const fim = new Date(Date.UTC(2026, 6, 1)); // 30 meses depois (~)
    // rescisão de forma que reste exatamente 8/30 do período
    const totalMs = fim.getTime() - inicio.getTime();
    const dataRescisao = new Date(fim.getTime() - Math.round((totalMs * 8) / 30));
    const multa = calcularMultaRescisao({ valorAluguel: "2000.00", inicio, fim, dataRescisao });
    // 3 * 2000 * 8/30 = 1600,00
    expect(multa.toFixed(2)).toBe("1600.00");
  });

  it("rescisão após o fim do contrato = 0", () => {
    const inicio = new Date(Date.UTC(2024, 0, 1));
    const fim = new Date(Date.UTC(2025, 0, 1));
    const multa = calcularMultaRescisao({
      valorAluguel: "2000.00",
      inicio,
      fim,
      dataRescisao: new Date(Date.UTC(2025, 6, 1)),
    });
    expect(multa.toFixed(2)).toBe("0.00");
  });
});

describe("aplicarReajuste", () => {
  it("reajuste de 4,52% sobre 2.628,60 = 2.747,41", () => {
    // 2628,60 * 1,0452 = 2747,4127 -> 2747,41
    expect(aplicarReajuste("2628.60", "4.52").toFixed(2)).toBe("2747.41");
  });
});

describe("soma sem drift de ponto flutuante", () => {
  it("12 competências de 1.234,57 batem com o total anual, centavo a centavo", () => {
    let soma = D(0);
    for (let i = 0; i < 12; i++) soma = soma.plus(centavos("1234.57"));
    expect(soma.toFixed(2)).toBe("14814.84");
    // e igual a 12 * 1234,57
    expect(soma.equals(D("1234.57").times(12))).toBe(true);
  });
});
