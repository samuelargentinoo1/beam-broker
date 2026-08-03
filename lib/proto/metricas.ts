// Números do painel do dono. Todos coerentes entre si: as taxas de passagem
// batem com as contagens, e o gargalo apontado é de fato a maior queda.

export const FUNIL = [
  { etapa: "Leads recebidos", qtd: 1240, mesAnterior: 1408, diasMedios: 0 },
  { etapa: "Respondidos", qtd: 1178, mesAnterior: 1352, diasMedios: 0.2 },
  { etapa: "Qualificados", qtd: 512, mesAnterior: 604, diasMedios: 1.4 },
  { etapa: "Visitaram imóvel", qtd: 164, mesAnterior: 214, diasMedios: 6.8 },
  { etapa: "Propostas", qtd: 71, mesAnterior: 88, diasMedios: 4.1 },
  { etapa: "Fechados", qtd: 33, mesAnterior: 42, diasMedios: 9.6 },
];

export const DIAS_MES_ANTERIOR = [0, 0.1, 1.1, 4.9, 3.6, 8.8];

// A maior queda percentual entre etapas consecutivas — calculada, não digitada,
// para o texto do gargalo nunca divergir dos números da tabela.
export function gargalo() {
  let pior = { i: 1, passagem: 1 };
  for (let i = 1; i < FUNIL.length; i++) {
    const p = FUNIL[i]!.qtd / FUNIL[i - 1]!.qtd;
    if (p < pior.passagem) pior = { i, passagem: p };
  }
  return pior;
}

export const CONVERSAO_CASA = 2.7;
export const CONVERSAO_SETOR = 1.52;

export const MOTIVOS_PERDA_DADOS = [
  { motivo: "Sem crédito", pct: 34, qtd: 61 },
  { motivo: "Achou mais barato", pct: 19, qtd: 34 },
  { motivo: "Sumiu", pct: 16, qtd: 29 },
  { motivo: "Preço alto", pct: 12, qtd: 22 },
  { motivo: "Comprou com concorrente", pct: 9, qtd: 16 },
  { motivo: "Desistiu", pct: 6, qtd: 11 },
  { motivo: "Imóvel indisponível", pct: 4, qtd: 7 },
];

export const DIAGNOSTICO = {
  quando: "Segunda, 08:00",
  texto: `Bom dia. Semana passada entraram 47 leads (−12% vs. anterior). A conversão caiu de 3,1% para 2,4%, e a causa está no tempo de resposta: subiu de 8min para 41min, puxado pelo Ricardo, que está com 23 negócios abertos.

Ação da semana: redistribuir 8 negócios do Ricardo.
Estimativa de recuperação: 2 a 3 vendas no mês.`,
};

export const VELOCIDADE_ETAPAS = FUNIL.map((f, i) => ({
  etapa: f.etapa,
  atual: f.diasMedios,
  anterior: DIAS_MES_ANTERIOR[i] ?? 0,
}));
