// Guarda contra a IA repetir o que já disse.
//
// O sintoma no WhatsApp: o lead responde algo com uma objeção, a IA responde,
// quebra a objeção e MANDA A MESMA RESPOSTA DE NOVO — às vezes na mesma
// mensagem (duas bolhas iguais), às vezes na mensagem seguinte (eco da
// anterior). Instrução de prompt reduz, mas não elimina: modelo com muita
// instrução "volte para a pergunta X" tende a emitir X duas vezes.
//
// Aqui o corte é mecânico e acontece na saída, depois do modelo — então vale
// mesmo quando ele desobedece.

// Compara SIGNIFICADO, não formatação: sem acento, sem pontuação, sem caixa,
// sem as tags de emoção do áudio ([laughs], [sighs]) e sem espaço repetido.
export function normalizarParaComparar(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/\[[a-z ]+\]/g, " ") // tags de emoção do áudio
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // pontuação
    .replace(/\s+/g, " ")
    .trim();
}

// Abaixo disto não vale deduplicar: "certo", "isso", "ok" podem repetir por
// motivo legítimo, e cortar deixaria a conversa truncada.
const MINIMO = 12;

// Tira bolhas repetidas DENTRO da mesma mensagem, preservando a primeira
// ocorrência e a ordem.
export function semRepeticaoInterna(partes: string[]): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const parte of partes) {
    const chave = normalizarParaComparar(parte);
    if (chave.length >= MINIMO && vistas.has(chave)) continue;
    if (chave.length >= MINIMO) vistas.add(chave);
    saida.push(parte);
  }
  return saida;
}

// Tira da resposta nova os parágrafos que só repetem a mensagem anterior da IA.
// Se sobrar nada, devolve a resposta original: calar a IA é pior que repetir.
export function semEcoDaAnterior(resposta: string, anterior: string | null | undefined): string {
  if (!anterior) return resposta;
  const jaDito = new Set(
    anterior
      .split(/\n\s*\n/)
      .map((p) => normalizarParaComparar(p))
      .filter((p) => p.length >= MINIMO)
  );
  if (jaDito.size === 0) return resposta;

  const partes = resposta.split(/\n\s*\n/);
  const sobrando = partes.filter((p) => {
    const chave = normalizarParaComparar(p);
    return chave.length < MINIMO || !jaDito.has(chave);
  });
  if (sobrando.length === 0 || sobrando.length === partes.length) return resposta;
  return sobrando.join("\n\n").trim();
}

// Aplica os dois cortes de uma vez, na saída do agente.
export function semRepeticao(resposta: string, anterior?: string | null): string {
  const semEco = semEcoDaAnterior(resposta, anterior);
  return semRepeticaoInterna(semEco.split(/\n\s*\n/)).join("\n\n").trim();
}
