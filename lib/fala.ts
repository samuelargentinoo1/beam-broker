// Humanização da fala. Duas frentes, e a primeira pesa mais que qualquer
// ajuste de voz:
//
//   1. O TEXTO. Nenhum TTS conserta texto escrito para ser LIDO. "R$ 189.900,00"
//      vira "erre cifrão cento e oitenta e nove ponto novecentos vírgula zero
//      zero" na boca de qualquer motor. Aqui o texto é reescrito para ser
//      FALADO antes de chegar na MiniMax.
//
//   2. A PROSÓDIA. Velocidade e tom fixos são a marca registrada de robô: gente
//      acelera numa pergunta curta, desacelera num valor, sobe o tom quando dá
//      notícia boa. Aqui cada mensagem ganha o ritmo do que ela diz.
//
// Nada disso aparece no texto que o cliente LÊ — só no áudio.

// ─── Números ────────────────────────────────────────────────────────────────
//
// Toda a conversão de dígito para palavra vive em lib/numero-extenso.ts. Havia
// uma segunda cópia aqui: duas fontes da mesma verdade é como as duas divergem
// e uma delas passa a errar sozinha.

import { numeroPorExtenso } from "@/lib/numero-extenso";
export { extenso, numeroPorExtenso } from "@/lib/numero-extenso";

// ─── Siglas do ramo ─────────────────────────────────────────────────────────
//
// Sigla soletrada errado destrói a ilusão na hora. "FGTS" lido como palavra é
// o tipo de coisa que ninguém perdoa.

const SIGLAS: [RegExp, string][] = [
  [/\bMCMV\b/g, "Minha Casa Minha Vida"],
  [/\bFGTS\b/g, "efe gê tê esse"],
  [/\bIPTU\b/g, "i pê tê u"],
  [/\bITBI\b/g, "i tê bê i"],
  [/\bCPF\b/g, "cê pê efe"],
  [/\bCNPJ\b/g, "cê ene pê jota"],
  [/\bRG\b/g, "erre gê"],
  [/\bCEP\b/g, "cep"],
  [/\bIR\b/g, "imposto de renda"],
  [/\bCNH\b/g, "cê ene agá"],
  [/\bSFH\b/g, "esse efe agá"],
  [/\bapto\.?\b/gi, "apartamento"],
  [/\bqto\.?\b/gi, "quarto"],
  [/\bcond\.?\b/gi, "condomínio"],
  [/\bpróx\.?\b/gi, "próximo"],
  [/\bAv\.\s/g, "Avenida "],
  [/\bR\.\s/g, "Rua "],
  [/\bDr\.\s/g, "doutor "],
  [/\bDra\.\s/g, "doutora "],
];

export function falarSiglas(texto: string): string {
  return SIGLAS.reduce((t, [de, para]) => t.replace(de, para), texto);
}

// ─── Oralidade ──────────────────────────────────────────────────────────────
//
// Ninguém fala "está" e "para o" numa conversa de WhatsApp. Só as trocas
// SEGURAS: "para" também é verbo ("ele para"), então a substituição exige a
// preposição colada ao artigo.

// CUIDADO com \b no fim de palavra acentuada: o \b do JavaScript é ASCII, então
// "á" não conta como letra e `\bestá\b` NUNCA casa. Onde a palavra termina em
// acento, o limite tem de ser escrito à mão.
const FIM = "(?=$|[\\s,.!?;:])";

const ORAL: [RegExp, string][] = [
  [/\bpara os\b/gi, "pros"],
  [/\bpara as\b/gi, "pras"],
  [/\bpara o\b/gi, "pro"],
  [/\bpara a\b/gi, "pra"],
  [/\bpara você/gi, "pra você"],
  [/\bpara mim\b/gi, "pra mim"],
  [/\bpara te\b/gi, "pra te"],
  // "para" + infinitivo é sempre preposição ("para ver", "para agendar"), nunca
  // o verbo parar. Aí a troca é segura.
  [/\bpara (?=\w+[aei]r\b)/gi, "pra "],
  [/\bdá para\b/gi, "dá pra"],
  [new RegExp(`\\bestá${FIM}`, "gi"), "tá"],
  [new RegExp(`\\bestão${FIM}`, "gi"), "tão"],
  [/\bestou\b/gi, "tô"],
  [/\bestamos\b/gi, "tamos"],
  [/\bvamos\b/gi, "vamo"],
  [new RegExp(`\\bnão é${FIM}`, "gi"), "né"],
];

export function oralidade(texto: string): string {
  return ORAL.reduce((t, [de, para]) => t.replace(de, para), texto);
}

// ─── Respiração ─────────────────────────────────────────────────────────────
//
// A MiniMax respeita pontuação. Frase sem ponto final sai emendada na próxima,
// e é isso que dá o efeito de locutor lendo lista.

export function respiracao(texto: string): string {
  return texto
    // Emoji vira silêncio, não descrição lida em voz alta.
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    // Risada escrita não se fala — ela vira emoção (ver prosodia).
    .replace(/\b(k{2,}|(?:ha){2,}|rs+)\b/gi, "")
    // Reticências viram pausa curta, não três pontos lidos.
    .replace(/\.{3,}/g, ",")
    // Travessão vira pausa.
    .replace(/\s*[—–-]\s+/g, ", ")
    // Parêntese com FRASE dentro vira pausa. Parêntese de UMA palavra é
    // preservado: é a sintaxe de interjeição do speech-2.8 — "(laughs)",
    // "(breath)" —, e transformá-la em vírgula faria a voz SOLETRAR a palavra.
    .replace(/\s*\(([^)]*\s[^)]*)\)/g, ", $1,")
    // Quebra de linha é pausa de frase, não espaço.
    .replace(/\n+/g, ". ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .trim();
}

// ─── Marcadores de fala ─────────────────────────────────────────────────────
//
// Ninguém começa a falar direto no assunto. "Olha,", "Então,", "Pois é," são o
// que separa FALA de texto lido em voz alta — e não existem no texto escrito,
// porque quem escreve já corta isso naturalmente. Por isso entram aqui, só no
// caminho do áudio: o que o cliente LÊ continua enxuto e objetivo.
//
// A escolha é determinística pelo texto: a mesma frase abre sempre igual, mas
// frases diferentes abrem diferente. Um único marcador repetido em todo áudio
// seria o mesmo tell da velocidade fixa.

const ABERTURAS_BOA = ["Olha só,", "Ó,", "Então,", "Pois é,"];
const ABERTURAS_RUIM = ["Poxa,", "Olha,", "Então,", "Pois é,"];
const ABERTURAS_GERAL = ["Olha,", "Então,", "Ah,", "Olha só,"];

// Já começa como fala? Então não empilha marcador em cima de marcador.
const JA_TEM_ABERTURA =
  /^(oi|olá|ola|opa|e aí|bom dia|boa tarde|boa noite|olha|então|entao|ah|poxa|pois é|ó|claro|perfeito|beleza|isso)\b/i;

function escolha<T>(lista: T[], semente: string, deslocamento = 0): T {
  let h = 0;
  for (let i = 0; i < semente.length; i++) h = (h * 33 + semente.charCodeAt(i)) | 0;
  return lista[(Math.abs(h) + deslocamento) % lista.length]!;
}

function sorteioEstavel(semente: string, porcento: number, deslocamento: number): boolean {
  let h = deslocamento;
  for (let i = 0; i < semente.length; i++) h = (h * 17 + semente.charCodeAt(i)) | 0;
  return Math.abs(h) % 100 < porcento;
}

export function marcadoresDeFala(texto: string, clima: "boa" | "ruim" | "geral" = "geral"): string {
  const t = texto.trim();
  if (!t) return t;

  let saida = t;
  // Nem todo áudio abre com marcador: sempre abrir seria tão mecânico quanto
  // nunca abrir.
  if (!JA_TEM_ABERTURA.test(t) && sorteioEstavel(t, 75, 1)) {
    const pool =
      clima === "boa" ? ABERTURAS_BOA : clima === "ruim" ? ABERTURAS_RUIM : ABERTURAS_GERAL;
    const abertura = escolha(pool, t);
    saida = `${abertura} ${saida.charAt(0).toLowerCase()}${saida.slice(1)}`;
  }

  // Em texto mais longo, gente respira no meio com um "sabe," ou "então,".
  // Só depois da PRIMEIRA frase — no meio de qualquer frase soa arrastado.
  if (saida.length > 140 && sorteioEstavel(t, 45, 2)) {
    const meio = escolha(["sabe,", "então,", "olha,"], t, 3);
    saida = saida.replace(/([.!?])\s+(?=[A-ZÀ-Ú])/, `$1 ${meio.charAt(0).toUpperCase()}${meio.slice(1)} `);
  }

  return saida;
}

// Fecha a última frase. Sem ponto final, a MiniMax deixa a entonação
// pendurada — soa como se tivesse cortado o áudio no meio.
function fecharFrase(texto: string): string {
  if (!texto) return texto;
  return /[.!?]$/.test(texto) ? texto : `${texto}.`;
}

// ─── O pipeline ─────────────────────────────────────────────────────────────

export function prepararFala(texto: string): string {
  const etapas = [falarSiglas, numeroPorExtenso, oralidade, respiracao];
  const base = etapas.reduce((t, f) => f(t), texto);
  // O marcador entra DEPOIS da limpeza (senão o emoji ainda contaria como
  // abertura) e ANTES do fechamento da frase.
  return fecharFrase(marcadoresDeFala(base, climaDoTexto(texto)));
}

// ─── Prosódia ───────────────────────────────────────────────────────────────

export type Prosodia = { speed: number; pitch: number; emotion: string; vol: number };

// Quanto tempo esse texto leva para ser FALADO. Serve para a bolinha de
// "gravando áudio" durar o tempo de uma gravação de verdade: 8 segundos fixos
// para todo áudio, como era antes, denuncia a máquina tanto quanto a voz —
// ninguém leva 8 segundos para gravar "tem sim, pode vir ver".
//
// Português falado corre a ~15 caracteres por segundo em ritmo de conversa.
const CHARS_POR_SEGUNDO = 15;

export function duracaoFalaMs(texto: string, speed = 1): number {
  const limpo = prepararFala(texto);
  const segundos = limpo.length / (CHARS_POR_SEGUNDO * Math.max(0.5, speed));
  // O meio segundo extra é o gesto de pegar o telefone e começar.
  return Math.round(Math.min(20000, Math.max(1500, segundos * 1000 + 500)));
}

// Ritmo de CONVERSA, não de locução. Nota de voz de WhatsApp brasileiro é
// rápida — 1.0 já soa cerimonioso, e era o 0.95 anterior que dava o ar de
// atendente gravada.
// Ritmo de conversa de WhatsApp brasileiro, que é rápido. A faixa 0,92–1,02 que
// esteve aqui era mais LENTA que o 1,08 anterior — o oposto do "acelerado" que
// se pediu, e parte do que fazia soar arrastado.
//
// A variação é DETERMINÍSTICA pelo texto, não Math.random(). O efeito audível é
// o mesmo — dois áudios seguidos nunca saem na mesma cadência —, mas a mesma
// mensagem reenviada sai idêntica (gente não muda de ritmo ao repetir a mesma
// frase) e o áudio continua testável. Math.random() dentro de corpoMinimax
// tornaria impossível travar qualquer coisa sobre a fala em teste.
const VELOCIDADE_BASE = 1.05;
const AMPLITUDE = 0.05;
// MIN e MAX são pontas apertadas de propósito, não um limite frouxo lá longe:
// sem elas, jitter + modificadores chegavam a 18,4% de espalhamento entre duas
// mensagens — PIOR que os 12,7% que soavam como duas pessoas diferentes. A
// faixa tem a mesma largura de antes (10,9%), só que centrada mais rápido.
const MIN = 1.0;
const MAX = 1.11;

// Listas AMPLAS de propósito: a voz foi calibrada para ser expressiva, e
// emoção só aparece quando o gatilho é reconhecido. Lista curta = voz neutra
// quase sempre, que é o oposto do pedido.
const BOA_NOTICIA =
  /\b(aprovad|consegu|achei|acho que|parabéns|saiu|liberad|deu certo|fechou|ótim|perfeito|maravilh|combina|ideal|adorei|show|bacana|legal|ficou bom|boa notícia|tenho sim|tem sim|claro)/i;
const MA_NOTICIA =
  /\b(infelizmente|vendid|alugad|negad|indisponí|não deu|reprovad|não consegu|não temos|sem sucesso|pena|poxa|restri|atrasad|venceu|pendênc|não rolou|acabou)/i;
const TEM_DADO = /\d|reais|metros|por cento/i;
const RISADA = /\b(k{2,}|(?:ha){2,}|rs+)\b/i;

// O clima da mensagem, usado tanto pela emoção da voz quanto pela escolha do
// marcador de fala ("Poxa," não abre notícia boa).
export function climaDoTexto(texto: string): "boa" | "ruim" | "geral" {
  if (MA_NOTICIA.test(texto)) return "ruim";
  if (RISADA.test(texto) || BOA_NOTICIA.test(texto) || /!/.test(texto)) return "boa";
  return "geral";
}

// Variação determinística por texto: a MESMA frase sai sempre igual (teste
// confiável), mas frases diferentes ganham ritmos diferentes. Gente nunca fala
// duas frases exatamente na mesma cadência, e é essa repetição milimétrica que
// o ouvido identifica como máquina.
function jitter(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  const passos = Math.round(AMPLITUDE * 1000); // ±50 milésimos
  return ((Math.abs(h) % (passos * 2 + 1)) - passos) / 1000;
}

export function prosodia(texto: string, emocaoDaTag = "neutral"): Prosodia {
  const t = texto.trim();
  let speed = VELOCIDADE_BASE + jitter(t);
  let emotion = emocaoDaTag;

  // Emoção pelo CONTEÚDO quando a IA não escreveu tag. A tag continua mandando:
  // ela é escolha deliberada de quem redigiu. Gatilhos AMPLOS — a voz deve ser
  // expressiva, e emoção só sai quando alguma coisa a dispara.
  if (emotion === "neutral") {
    const clima = climaDoTexto(t);
    if (clima === "boa") emotion = "happy";
    else if (clima === "ruim") emotion = "sad";
  }

  // Os modificadores valem METADE do que valiam. Medido no código anterior:
  // "Oi! Tudo bem?" saía a 1.166 e "Infelizmente já foi vendido." a 1.035 —
  // 12,7% entre duas bolhas seguidas, o que o ouvido lê como DUAS PESSOAS. Com
  // metade, o ritmo continua vindo do que a frase diz sem trocar de locutor.
  if (t.endsWith("?")) speed += 0.02;
  if (t.length < 60) speed += 0.015;
  if (t.length > 220) speed -= 0.02;
  if (emotion === "happy") speed += 0.02;
  if (emotion === "sad") speed -= 0.04;

  // Valor, metragem, percentual: o cliente precisa ACOMPANHAR.
  if (TEM_DADO.test(t)) speed -= 0.025;

  return {
    speed: Number(Math.min(MAX, Math.max(MIN, speed)).toFixed(3)),
    // pitch SEMPRE zero. O parâmetro da MiniMax é global: ele não faz entonação
    // dentro da frase, ele muda a voz inteira. Subir o tom numa pergunta soava
    // como se outra pessoa tivesse assumido a conversa.
    pitch: 0,
    emotion,
    vol: 1,
  };
}
