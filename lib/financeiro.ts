// Regras financeiras — multa, juros, remuneração e seguro-fiança são
// CONFIGURÁVEIS por imobiliária e por contrato. Os defaults (2% / 1% a.m.) são
// o padrão de mercado.
//
// ARITMÉTICA EM DECIMAL (Decimal.js via Prisma). Ponto flutuante binário não
// representa 0,1 exatamente; o erro reaparece na soma de N parcelas. Aqui tudo
// é Decimal.
// REGRA DE ARREDONDAMENTO: ROUND_HALF_UP (padrão comercial brasileiro), aplicado
// APENAS no valor FINAL de cada lançamento — nunca em passos intermediários (o
// erro acumularia). Multiplicações/divisões ficam em precisão plena; só o
// resultado vai a 2 casas.

import { Prisma } from "@prisma/client";

export type Numerico = Prisma.Decimal | number | string;
const D = (x: Numerico): Prisma.Decimal => new Prisma.Decimal(x ?? 0);
const ROUND = Prisma.Decimal.ROUND_HALF_UP;

// Arredonda para 2 casas (centavos) com ROUND_HALF_UP — use no valor FINAL.
export function centavos(x: Numerico): Prisma.Decimal {
  return D(x).toDecimalPlaces(2, ROUND);
}

// Converte para number apenas na BORDA de apresentação (componentes React) —
// nunca antes de um cálculo.
export function paraNumero(x: Numerico | null | undefined): number {
  return x == null ? 0 : D(x).toNumber();
}

export function calcularEncargosAtraso(
  valorTotal: Numerico,
  diasAtraso: number,
  multaPercent: Numerico = 2,
  jurosMesPercent: Numerico = 1
): { multa: Prisma.Decimal; juros: Prisma.Decimal } {
  if (diasAtraso <= 0) return { multa: D(0), juros: D(0) };
  const base = D(valorTotal);
  const multa = centavos(base.times(D(multaPercent).div(100)));
  const juros = centavos(base.times(D(jurosMesPercent).div(100)).times(diasAtraso).div(30));
  return { multa, juros };
}

// Remuneração da imobiliária sobre uma fatura de aluguel:
//  PERCENTUAL       → taxa mensal (% sobre o aluguel)
//  PRIMEIRO_ALUGUEL → a primeira fatura do contrato fica inteira com a
//                     imobiliária (taxa de intermediação); demais sem taxa
export function calcularRemuneracao(params: {
  modeloRemuneracao: "PERCENTUAL" | "PRIMEIRO_ALUGUEL";
  valorAluguel: Numerico;
  taxaAdmPercent: Numerico;
  ehPrimeiraFatura: boolean;
}): Prisma.Decimal {
  if (params.modeloRemuneracao === "PRIMEIRO_ALUGUEL") {
    return params.ehPrimeiraFatura ? centavos(params.valorAluguel) : D(0);
  }
  return centavos(D(params.valorAluguel).times(D(params.taxaAdmPercent).div(100)));
}

// Repasse líquido ao proprietário: tudo que o inquilino pagou, menos a
// remuneração da imobiliária, menos descontos (manutenções) e menos o
// seguro-fiança (que é repassado à seguradora, não ao proprietário).
export function calcularRepasse(params: {
  valorPago: Numerico;
  taxaAdm: Numerico;
  descontos?: Numerico;
  seguroFianca?: Numerico;
}): { taxaAdm: Prisma.Decimal; descontos: Prisma.Decimal; repasse: Prisma.Decimal } {
  const taxaAdm = centavos(params.taxaAdm);
  const descontos = centavos(params.descontos ?? 0);
  const seguroFianca = D(params.seguroFianca ?? 0);
  // repasse nunca negativo: descontos maiores que o pago dão zero, não negativo.
  const bruto = D(params.valorPago).minus(taxaAdm).minus(descontos).minus(seguroFianca);
  const repasse = centavos(bruto.isNegative() ? D(0) : bruto);
  return { taxaAdm, descontos, repasse };
}

export function aplicarReajuste(valorAtual: Numerico, percentual: Numerico): Prisma.Decimal {
  return centavos(D(valorAtual).times(D(1).plus(D(percentual).div(100))));
}

// Multa de rescisão antecipada — praxe de mercado (art. 4º Lei 8.245/91):
// 3 aluguéis proporcionais ao período restante do contrato.
export function calcularMultaRescisao(params: {
  valorAluguel: Numerico;
  inicio: Date;
  fim: Date;
  dataRescisao: Date;
}): Prisma.Decimal {
  const total = params.fim.getTime() - params.inicio.getTime();
  const restante = Math.max(0, params.fim.getTime() - params.dataRescisao.getTime());
  if (total <= 0 || restante <= 0) return D(0);
  // proporção restante/total em precisão plena; arredonda só no fim.
  return centavos(D(params.valorAluguel).times(3).times(restante).div(total));
}

// Arredondamento de NUMBER puro (contextos que não envolvem Decimal do banco).
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
