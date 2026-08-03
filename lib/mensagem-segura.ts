// Última barreira antes do texto sair para o cliente final.
//
// Existiu por um motivo concreto: sem ANTHROPIC_API_KEY, a IA respondia a um
// cliente de verdade com "[modo demo: configure a ANTHROPIC_API_KEY para a IA
// operar de verdade]". Nome de variável de ambiente, no WhatsApp de quem quer
// comprar uma casa.
//
// A regra: NADA de infraestrutura chega ao cliente. Nem nome de variável, nem
// "modo demo", nem "cota", nem "plano", nem stack trace. O que o operador
// precisa saber vai para o log e para as telas internas — nunca para a conversa.

// Termos que denunciam vazamento de infraestrutura. Case-insensitive.
const PROIBIDOS = [
  "anthropic",
  "api_key",
  "api key",
  "apikey",
  "modo demo",
  "variável de ambiente",
  "variavel de ambiente",
  "env var",
  "process.env",
  "openai",
  "claude",
  "prisma",
  "stack trace",
  "undefined",
  "null",
  "token de acesso",
  "cota",
  "plano contratado",
  "módulo não contratado",
  "modulo nao contratado",
  "uazapi",
  "elevenlabs",
  "minimax",
  "zapsign",
  "asaas",
  "vercel",
  "localhost",
];

export function contemVazamentoInterno(texto: string): boolean {
  const t = texto.toLowerCase();
  return PROIBIDOS.some((p) => t.includes(p));
}

// Resposta neutra quando não há o que dizer sem expor infraestrutura. Segue o
// tom da Carol: curta, sem emoji e sem travessão.
export const RESPOSTA_NEUTRA =
  "Oi, aqui é a Carol. Recebi sua mensagem, já te respondo por aqui.";

// Tira os trechos entre colchetes que carregam termo interno. É o formato em
// que a nota de diagnóstico costuma aparecer grudada na frase boa, então dá
// para salvar a frase em vez de descartar a mensagem inteira.
function semColchetesInternos(texto: string): string {
  return texto
    .replace(/\[[^\]]*\]/g, (trecho) => (contemVazamentoInterno(trecho) ? "" : trecho))
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Limpa o que dá para limpar; se ainda sobrar termo interno no texto, devolve a
// resposta neutra. Falhar para o lado de dizer pouco é sempre melhor do que
// mandar o nome de uma variável de ambiente para o cliente.
export function paraOCliente(texto: string): string {
  const limpo = semColchetesInternos(texto ?? "");
  if (!limpo) return RESPOSTA_NEUTRA;
  if (contemVazamentoInterno(limpo)) {
    console.error(
      "[VAZAMENTO-BLOQUEADO] resposta com termo interno foi substituída antes de sair:",
      limpo.slice(0, 300)
    );
    return RESPOSTA_NEUTRA;
  }
  return limpo;
}
