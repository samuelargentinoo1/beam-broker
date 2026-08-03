// Qualificação de locação SEM bureau/API: a própria IA valida com base nas duas
// variáveis que a imobiliária usa na prática — a RENDA declarada frente ao
// ALUGUEL e a GARANTIA oferecida. Regra de mercado brasileira:
//   • renda comprovada de ~3x o valor do aluguel; e
//   • uma garantia válida (seguro-fiança, fiador, caução ou título de capitalização).
// Sem renda ou sem garantia definida → a equipe faz a validação final.

export type ResultadoCredito = {
  score: number; // aproximação (mantido para o registro da proposta)
  resultado: "APROVADO" | "APROVADO_COM_RESSALVA" | "REPROVADO";
  detalhes: string;
};

export function analisarCredito(params: {
  valorAluguel: number;
  rendaMensal?: number | null;
  garantia?: string | null;
  cpfCnpj?: string; // ignorado (sem bureau) — mantido por compatibilidade
}): ResultadoCredito {
  const { valorAluguel, rendaMensal, garantia } = params;
  const g = (garantia ?? "").toLowerCase();
  // Garantia FORTE (seguro-fiança / fiador / título de capitalização) cobre parte
  // do risco → tolera renda um pouco menor. Caução/depósito é garantia mais fraca
  // p/ inadimplência longa → exige renda cheia (~3x).
  const garantiaForte = /(seguro|fian|fiador|capitaliza|t[ií]tulo)/.test(g);
  const garantiaFraca = /(cau[cç]|dep[oó]sito)/.test(g);
  const temGarantia = garantiaForte || garantiaFraca;
  const razao =
    rendaMensal && rendaMensal > 0 && valorAluguel > 0 ? rendaMensal / valorAluguel : null;

  // Renda mínima para aprovação depende da garantia: 2.5x com garantia forte,
  // 3x com caução/sem garantia.
  const minAprovado = garantiaForte ? 2.5 : 3;

  let resultado: ResultadoCredito["resultado"];
  let detalhes: string;

  if (razao === null) {
    resultado = "APROVADO_COM_RESSALVA";
    detalhes = "Renda não informada — a equipe confirma os comprovantes antes de fechar.";
  } else if (razao >= minAprovado && temGarantia) {
    resultado = "APROVADO";
    detalhes = `Renda de ${razao.toFixed(1)}x o aluguel (mínimo ${minAprovado}x para esta garantia) com garantia (${garantia}). Perfil dentro do padrão.`;
  } else if (razao < 2 && !temGarantia) {
    resultado = "REPROVADO";
    detalhes = `Renda de ${razao.toFixed(1)}x o aluguel (abaixo de 2x) e sem garantia definida. Recomendável fiador, seguro-fiança ou um imóvel de aluguel menor.`;
  } else {
    resultado = "APROVADO_COM_RESSALVA";
    const faltas: string[] = [];
    if (razao < minAprovado) faltas.push(`renda de ${razao.toFixed(1)}x o aluguel (ideal ${minAprovado}x para esta garantia)`);
    if (!temGarantia) faltas.push("garantia a definir (seguro-fiança, fiador ou caução)");
    detalhes = `A equipe faz a validação final: ${faltas.join("; ")}.`;
  }

  const score = resultado === "APROVADO" ? 750 : resultado === "APROVADO_COM_RESSALVA" ? 520 : 320;
  return { score, resultado, detalhes };
}
