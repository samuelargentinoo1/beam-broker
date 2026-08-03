// Números por extenso para a FALA. Não é enfeite: é o que impede o TTS de
// soletrar.
//
// "R$ 350.000,00" sai como "erre cifrão trezentos ponto zero zero zero vírgula
// zero zero" na boca de qualquer motor de voz. Nenhum humano fala assim, e
// nenhuma quantidade de instrução no prompt garante que a IA vá escrever por
// extenso toda vez — por isso a conversão é MECÂNICA, no pipeline, e não uma
// regra que se pede e se torce para ser obedecida.
//
// Idempotente de propósito: rodar duas vezes no mesmo texto não duplica nada,
// porque depois da primeira passada não sobra dígito nenhum para converter.

// ─── Extenso de um número ───────────────────────────────────────────────────

const ATE_19 = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito",
  "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis",
  "dezessete", "dezoito", "dezenove",
];
const DEZENAS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta",
  "oitenta", "noventa",
];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

function ate999(n: number): string {
  if (n < 20) return ATE_19[n]!;
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? DEZENAS[d]! : `${DEZENAS[d]} e ${ATE_19[u]}`;
  }
  // "cem" exato; "cento e ..." para 101-199.
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  return resto === 0 ? CENTENAS[c]! : `${CENTENAS[c]} e ${ate999(resto)}`;
}

// A regra do "e" antes do último bloco: entra quando o resto é menor que cem ou
// é centena redonda. "mil e quinhentos", mas "mil duzentos e trinta".
function juntar(maior: string, resto: number, textoResto: string): string {
  if (resto === 0) return maior;
  const liga = resto < 100 || resto % 100 === 0;
  return `${maior}${liga ? " e " : " "}${textoResto}`;
}

export function extenso(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  n = Math.floor(n);
  if (n < 1000) return ate999(n);
  if (n < 1_000_000) {
    const milhares = Math.floor(n / 1000);
    const resto = n % 1000;
    // "mil", nunca "um mil".
    const cabeca = milhares === 1 ? "mil" : `${ate999(milhares)} mil`;
    return juntar(cabeca, resto, ate999(resto));
  }
  if (n < 1_000_000_000) {
    const milhoes = Math.floor(n / 1_000_000);
    const resto = n % 1_000_000;
    const cabeca = milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`;
    return juntar(cabeca, resto, extenso(resto));
  }
  const bilhoes = Math.floor(n / 1_000_000_000);
  const resto = n % 1_000_000_000;
  const cabeca = bilhoes === 1 ? "um bilhão" : `${ate999(bilhoes)} bilhões`;
  return juntar(cabeca, resto, extenso(resto));
}

// ─── Gênero ─────────────────────────────────────────────────────────────────
//
// "2 vagas" é "duas vagas". Errar isso entrega a máquina em meio segundo.

const FEMININAS =
  /^(suítes?|vagas?|peças?|parcelas?|unidades?|entradas?|chaves?|partes?|fases?|metades?|horas?)$/i;

function ehFeminino(palavra: string): boolean {
  if (FEMININAS.test(palavra)) return true;
  return /(a|as)$/i.test(palavra) && !/(dia|mapa|problema|sistema)$/i.test(palavra);
}

function concordar(texto: string, proxima?: string): string {
  if (!proxima || !ehFeminino(proxima)) return texto;
  return texto.replace(/\bum$/, "uma").replace(/\bdois$/, "duas");
}

// ─── Moeda ──────────────────────────────────────────────────────────────────

function dinheiro(inteiro: number, centavos: number): string {
  const reais = `${extenso(inteiro)} ${inteiro === 1 ? "real" : "reais"}`;
  // Centavo zerado some: ninguém fala "vírgula zero zero" numa conversa.
  if (!centavos) return reais;
  return `${reais} e ${extenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
}

// ─── Hora coloquial ─────────────────────────────────────────────────────────
//
// "13:30" é "uma e meia da tarde", não "treze e trinta". Hora militar em
// conversa soa a despacho de rádio.

const PERIODO = (h: number) => (h < 12 ? "da manhã" : h < 19 ? "da tarde" : "da noite");

function horaColoquial(h24: number, min: number): string {
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const hora = h12 === 1 ? "uma" : extenso(h12);
  const periodo = PERIODO(h24);
  if (min === 0) return `${hora} ${h12 === 1 ? "" : "horas "}${periodo}`.replace(/\s+/g, " ").trim();
  if (min === 30) return `${hora} e meia ${periodo}`;
  if (min === 15) return `${hora} e quinze ${periodo}`;
  return `${hora} e ${extenso(min)} ${periodo}`;
}

// ─── O pipeline de texto ────────────────────────────────────────────────────
//
// A ORDEM importa: moeda antes de número solto (senão "350.000" viraria
// "trezentos e cinquenta mil" sem o "reais"), e medidas antes de número solto
// pelo mesmo motivo.

export function numeroPorExtenso(texto: string): string {
  let t = texto;

  // 1. Moeda com escala escrita: "R$ 350 mil", "R$ 1,2 milhão".
  t = t.replace(
    // "milhão" ANTES de "mil": alternância de regex é ordenada, e `mil` casaria
    // o começo de "milhão", deixando "hão" solto no texto.
    /R\$\s*(\d+(?:[.,]\d+)?)\s*(milh(?:ão|ões)|bilh(?:ão|ões)|mil)/gi,
    (m, num: string, escala: string) => {
      const v = Number(num.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(v)) return m;
      const cabeca = Number.isInteger(v) ? extenso(v) : v.toString().replace(".", " vírgula ");
      const e = escala.toLowerCase();
      return e === "mil" ? `${cabeca} mil reais` : `${cabeca} ${e} de reais`;
    }
  );

  // 2. Moeda numérica: "R$ 350.000,00", "R$ 2.500".
  t = t.replace(/R\$\s*([\d.]+)(?:,(\d{1,2}))?/g, (m, inteiro: string, cent?: string) => {
    const v = Number(inteiro.replace(/\./g, ""));
    if (!Number.isFinite(v)) return m;
    return dinheiro(v, cent ? Number(cent.padEnd(2, "0")) : 0);
  });

  // 3. Área: "70m²", "70 m2".
  // CUIDADO com \b depois de "²": o \b do JavaScript é ASCII, e "²" não conta
  // como letra — `m²\b` nunca casa. O limite tem de ser escrito à mão.
  t = t.replace(
    /(\d+)\s*m(?:²|2)(?![\w²])/gi,
    (_m, n: string) => `${extenso(Number(n))} metros quadrados`
  );

  // 4. Quartos na notação do ramo: "2/4" é dois quartos, não uma fração.
  t = t.replace(/\b(\d)\s*\/\s*4\b/g, (_m, n: string) => `${extenso(Number(n))} quartos`);

  // 5. Percentual, com decimal falado: "9,99%".
  t = t.replace(/(\d+)(?:,(\d+))?\s*%/g, (_m, int: string, dec?: string) => {
    const cabeca = extenso(Number(int));
    if (!dec) return `${cabeca} por cento`;
    return `${cabeca} vírgula ${extenso(Number(dec))} por cento`;
  });

  // 6. Hora: "13:30", "14h30", "9h".
  t = t.replace(/\b(\d{1,2}):(\d{2})\b/g, (m, h: string, min: string) => {
    const H = Number(h);
    const M = Number(min);
    return H <= 23 && M <= 59 ? horaColoquial(H, M) : m;
  });
  t = t.replace(/\b(\d{1,2})h(\d{2})\b/g, (m, h: string, min: string) => {
    const H = Number(h);
    const M = Number(min);
    return H <= 23 && M <= 59 ? horaColoquial(H, M) : m;
  });
  t = t.replace(/\b(\d{1,2})h\b/g, (m, h: string) => {
    const H = Number(h);
    return H <= 23 ? horaColoquial(H, 0) : m;
  });

  // 7. Ordinal: "1º andar".
  const ORDINAIS = [
    "", "primeiro", "segundo", "terceiro", "quarto", "quinto", "sexto",
    "sétimo", "oitavo", "nono", "décimo",
  ];
  // Só os símbolos de ordinal mesmo (º/ª). Aceitar "1o"/"2a" pegaria "2 a 3"
  // de intervalo e viraria "segunda 3", que é pior que não converter.
  // Mesma armadilha do \b: "º" não é letra em ASCII.
  t = t.replace(/(\d+)\s*º(?!\w)/g, (m, n: string) => {
    const v = Number(n);
    return v >= 1 && v <= 10 ? ORDINAIS[v]! : m;
  });
  t = t.replace(/(\d+)\s*ª(?!\w)/g, (m, n: string) => {
    const v = Number(n);
    return v >= 1 && v <= 10 ? ORDINAIS[v]!.replace(/o$/, "a") : m;
  });

  // 8. Distância.
  t = t.replace(/(\d+)\s*km\b/gi, (_m, n: string) => `${extenso(Number(n))} quilômetros`);

  // 9. Número solto, concordando com a palavra seguinte.
  t = t.replace(
    /\b(\d{1,3}(?:\.\d{3})+|\d+)\b([ \t]+)([a-zà-ú]+)?/gi,
    (m, num: string, esp: string, prox?: string) => {
      const v = Number(num.replace(/\./g, ""));
      if (!Number.isFinite(v)) return m;
      return `${concordar(extenso(v), prox)}${esp}${prox ?? ""}`;
    }
  );

  // 10. O que sobrou (número no fim da frase, sem palavra depois).
  t = t.replace(/\b(\d{1,3}(?:\.\d{3})+|\d+)\b/g, (m, num: string) => {
    const v = Number(num.replace(/\./g, ""));
    return Number.isFinite(v) ? extenso(v) : m;
  });

  return t;
}
