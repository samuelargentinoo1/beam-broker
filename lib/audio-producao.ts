// A etapa que faltava entre a MiniMax e o WhatsApp.
//
// O que o TTS devolve é uma voz no VÁCUO: silêncio digital absoluto atrás,
// nível perfeitamente constante, começo e fim cirúrgicos. Nenhuma nota de voz
// de WhatsApp no mundo é assim. Toda gravação de celular tem chão de ruído, tem
// a sala atrás, tem o dedo apertando gravar antes da primeira palavra, e tem o
// nível subindo e caindo conforme a pessoa mexe o telefone.
//
// É isso que o ouvido usa para decidir "gente" ou "robô" — antes mesmo de
// julgar a voz. Este arquivo produz essas quatro coisas.
//
// Tudo é aritmética sobre amostras: nenhum ffmpeg, nenhuma dependência nativa,
// nenhum arquivo de áudio embarcado.

import { cenarioPorHora, geradorAleatorio, leitoDeAmbiente, respirada } from "@/lib/ambiente";
import { horaEmSaoPaulo } from "@/lib/prompt-audio";

// ─── Ajustes ────────────────────────────────────────────────────────────────
//
// Todos os níveis num lugar só, com nome. Ruído demais soa amador, e a diferença
// entre "tem uma sala atrás" e "que barulho é esse" são 4 dB.

export const AJUSTES = {
  // Silêncio de sala antes da primeira palavra: o dedo aperta gravar, respira,
  // e só então fala.
  cabecaMs: [220, 520] as [number, number],
  // E depois da última: a pessoa não solta o botão instantaneamente.
  caudaMs: [320, 800] as [number, number],
  // Deriva de proximidade DENTRO do áudio, em dB. Ninguém segura o telefone
  // parado.
  derivaDb: 2,
  // Variação de nível ENTRE áudios, em dB.
  entreAudiosDb: 2,
  // Microfone de celular: nada abaixo de 120 Hz (não capta) nem acima de
  // 7,5 kHz (o codec come).
  passaAltaHz: 120,
  passaBaixaHz: 7500,
  // Quão forte o AGC do celular achata a dinâmica. 0 = sem compressão.
  compressao: 0.45,
  // Chance de a respiração inicial entrar.
  chanceRespiro: 0.7,
};

export type Camadas = {
  ambiente?: boolean;
  microfone?: boolean;
  respiro?: boolean;
};

const TODAS: Required<Camadas> = { ambiente: true, microfone: true, respiro: true };

// ─── Conversões ─────────────────────────────────────────────────────────────

// A MiniMax devolve PCM little-endian de 16 bits. Vira Float32 em -1..1 para
// todo o processamento acontecer sem estourar a precisão de inteiro.
export function pcmParaFloat(pcm: Buffer): Float32Array {
  const n = Math.floor(pcm.length / 2);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = pcm.readInt16LE(i * 2) / 32768;
  return f;
}

export function floatParaPcm(f: Float32Array): Buffer {
  const b = Buffer.alloc(f.length * 2);
  for (let i = 0; i < f.length; i++) {
    // Trava em -1..1 ANTES de converter: passar disso vira estalo, e estalo é o
    // único defeito que não soa humano.
    const v = Math.max(-1, Math.min(1, f[i]!));
    b.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  return b;
}

// ─── Filtros ────────────────────────────────────────────────────────────────
//
// Um polo cada. Não é filtro de estúdio — e não precisa ser: o objetivo é
// imitar um microfone ruim, não construir um bom.

function passaAlta(x: Float32Array, hz: number, taxa: number): Float32Array {
  const rc = 1 / (2 * Math.PI * hz);
  const dt = 1 / taxa;
  const alfa = rc / (rc + dt);
  const y = new Float32Array(x.length);
  let anteriorX = 0;
  let anteriorY = 0;
  for (let i = 0; i < x.length; i++) {
    y[i] = alfa * (anteriorY + x[i]! - anteriorX);
    anteriorX = x[i]!;
    anteriorY = y[i]!;
  }
  return y;
}

function passaBaixa(x: Float32Array, hz: number, taxa: number): Float32Array {
  const rc = 1 / (2 * Math.PI * hz);
  const dt = 1 / taxa;
  const alfa = dt / (rc + dt);
  const y = new Float32Array(x.length);
  let anterior = 0;
  for (let i = 0; i < x.length; i++) {
    anterior = anterior + alfa * (x[i]! - anterior);
    y[i] = anterior;
  }
  return y;
}

// AGC de celular: puxa o que está baixo para cima e segura o que está alto.
// É o que faz toda nota de voz ter mais ou menos o mesmo volume, independente
// de quem gravou.
function comprimir(x: Float32Array, intensidade: number): Float32Array {
  if (intensidade <= 0) return x;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    const s = Math.sign(v);
    const a = Math.abs(v);
    // Curva suave: quanto mais alto, mais achatado.
    y[i] = s * (a * (1 - intensidade) + Math.tanh(a * 2.2) * intensidade * 0.75);
  }
  return y;
}

function rmsDe(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, x.length));
}

// RMS dos trechos COM FALA, ignorando as pausas.
//
// Medir a frase inteira subestima a voz: uma resposta típica tem 30% de
// silêncio entre palavras, e o RMS geral cai junto. Como o ganho é calculado
// para bater num alvo, esse RMS baixo virava ganho ALTO — e o ambiente subia
// junto com a voz. Era metade do chiado que se ouvia.
//
// Aqui o sinal é dividido em quadros de 20 ms e só a metade mais alta entra na
// conta. É a mesma ideia de um medidor de loudness, na versão barata.
function rmsDaFala(x: Float32Array, taxa: number): number {
  const quadro = Math.max(1, Math.round(taxa * 0.02));
  const niveis: number[] = [];
  for (let i = 0; i < x.length; i += quadro) {
    let s = 0;
    let n = 0;
    for (let j = i; j < Math.min(x.length, i + quadro); j++, n++) s += x[j]! * x[j]!;
    if (n > 0) niveis.push(Math.sqrt(s / n));
  }
  if (niveis.length === 0) return 0;
  niveis.sort((a, b) => b - a);
  const metade = niveis.slice(0, Math.max(1, Math.ceil(niveis.length / 2)));
  return metade.reduce((a, b) => a + b, 0) / metade.length;
}

// ─── A produção ─────────────────────────────────────────────────────────────

export type Producao = {
  pcm: Buffer;
  taxa: number;
  cenario: string;
  duracaoMs: number;
};

/**
 * Recebe o PCM cru da MiniMax e devolve algo que soa gravado num telefone,
 * numa sala, por uma pessoa.
 *
 * `semente` é o texto do áudio: a mesma mensagem produz sempre a mesma
 * gravação (reenviar não muda o cenário), mensagens diferentes soam diferentes.
 */
export function produzir(
  pcmCru: Buffer,
  taxa: number,
  semente: string,
  camadas: Camadas = {},
  agora = new Date()
): Producao {
  const usar = { ...TODAS, ...camadas };
  const rnd = geradorAleatorio(semente);
  const voz = pcmParaFloat(pcmCru);

  const cenario = cenarioPorHora(horaEmSaoPaulo(agora));
  const msParaAmostras = (ms: number) => Math.round((ms * taxa) / 1000);
  const entre = ([a, b]: [number, number]) => a + rnd() * (b - a);

  const cabeca = usar.ambiente ? msParaAmostras(entre(AJUSTES.cabecaMs)) : 0;
  const cauda = usar.ambiente ? msParaAmostras(entre(AJUSTES.caudaMs)) : 0;

  // Respiração antes da fala, dentro da cabeça de silêncio.
  const respiro =
    usar.respiro && rnd() < AJUSTES.chanceRespiro ? respirada(taxa, rnd) : new Float32Array(0);

  const total = cabeca + voz.length + cauda;
  const mistura = new Float32Array(total);

  // 1. A voz, com deriva de proximidade.
  const periodo = taxa * (4 + rnd() * 6);
  const fase = rnd() * Math.PI * 2;
  const derivaMax = Math.pow(10, AJUSTES.derivaDb / 20) - 1;
  for (let i = 0; i < voz.length; i++) {
    const prox = 1 + derivaMax * Math.sin((i / periodo) * 2 * Math.PI + fase);
    mistura[cabeca + i] = voz[i]! * prox;
  }

  // 2. A respirada, encaixada para TERMINAR pouco antes da primeira palavra.
  if (respiro.length > 0) {
    const inicio = Math.max(0, cabeca - respiro.length - msParaAmostras(60));
    for (let i = 0; i < respiro.length && inicio + i < total; i++) {
      mistura[inicio + i] += respiro[i]! * 0.35;
    }
  }

  // 3. Caráter de microfone de celular — SÓ na voz, antes de somar a sala. A
  //    sala já é ruído filtrado; filtrar de novo a deixaria abafada demais.
  let saida: Float32Array = mistura;
  if (usar.microfone) {
    saida = passaAlta(saida, AJUSTES.passaAltaHz, taxa);
    saida = passaBaixa(saida, AJUSTES.passaBaixaHz, taxa);
    saida = comprimir(saida, AJUSTES.compressao);
  }

  // 4. Normaliza a VOZ — antes de somar o ambiente.
  //
  // A ordem importa e estava errada: normalizando tudo junto no fim, o ganho
  // saía de um RMS que incluía as pausas da fala. RMS baixo, ganho alto, e o
  // ambiente subia junto. O nível escrito na constante não era o que saía.
  //
  // Agora a voz é medida nos trechos COM FALA e ajustada sozinha; o ambiente
  // entra depois, num nível relativo a ela. O que está na constante é o que sai.
  const alvoVoz = 0.14 * Math.pow(10, ((rnd() * 2 - 1) * AJUSTES.entreAudiosDb) / 20);
  const nivelVoz = rmsDaFala(saida, taxa) || 1;
  const ganhoVoz = alvoVoz / nivelVoz;
  for (let i = 0; i < total; i++) saida[i] = saida[i]! * ganhoVoz;

  // 5. A sala, no nível do cenário ABAIXO da voz. Começa ANTES da fala e
  //    continua DEPOIS — é a cabeça e a cauda.
  if (usar.ambiente) {
    const leito = leitoDeAmbiente(total, taxa, cenario, rnd);
    const nivelLeito = alvoVoz * Math.pow(10, cenario.leitoDb / 20);
    for (let i = 0; i < total; i++) saida[i] = saida[i]! + leito[i]! * nivelLeito;
  }

  // 6. Teto de segurança: preferir um áudio baixo a um áudio estourado.
  const pico = saida.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (pico > 0.97) {
    const corte = 0.97 / pico;
    for (let i = 0; i < total; i++) saida[i] = saida[i]! * corte;
  }

  return {
    pcm: floatParaPcm(saida),
    taxa,
    cenario: cenario.nome,
    duracaoMs: Math.round((total / taxa) * 1000),
  };
}
