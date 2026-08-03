// Converte a amostra de voz para um formato que a MiniMax aceita.
//
// O caso real: quem vai clonar a própria voz tem uma nota de voz do WhatsApp à
// mão — e nota de voz do WhatsApp é OGG/Opus, que a MiniMax recusa (ela aceita
// mp3, m4a e wav). Sem esta etapa, o arquivo mais natural do mundo é o único
// que não serve.
//
// Sem ffmpeg: o Opus é decodificado por WebAssembly e o WAV é montado à mão.

import { lerOggOpus } from "@/lib/ogg";
import { pcmParaWav } from "@/lib/wav";

// O Opus SEMPRE decodifica a 48 kHz, independentemente da taxa com que foi
// gravado — é uma característica do codec, não uma escolha nossa.
export const TAXA_OPUS = 48000;

export type Convertido = {
  wav: Buffer;
  taxa: number;
  canais: number;
  duracaoSegundos: number;
};

// Já é um formato aceito? Então passa direto: reconverter só degradaria a
// amostra, e é a amostra que define a qualidade do clone.
export function jaServeParaClonagem(nome: string, mime: string): boolean {
  return /\.(mp3|m4a|wav)$/i.test(nome) || /(mpeg|mp3|m4a|mp4a|wav|x-wav)/i.test(mime);
}

export async function ogaParaWav(dados: Buffer): Promise<Convertido> {
  const { pacotes, canais } = lerOggOpus(dados);

  const { OpusDecoder } = await import("opus-decoder");
  const decoder = new OpusDecoder({ channels: canais });
  await decoder.ready;
  try {
    const { channelData, samplesDecoded } = decoder.decodeFrames(pacotes);
    const esquerda = channelData[0];
    if (!esquerda || samplesDecoded === 0)
      throw new Error("O arquivo não tem áudio decodificável.");

    // Mono: se vier estéreo, mistura os canais. Clonagem quer uma voz, não um
    // campo estéreo.
    const pcm = Buffer.alloc(samplesDecoded * 2);
    const direita = canais > 1 ? channelData[1] : undefined;
    for (let i = 0; i < samplesDecoded; i++) {
      const v = direita ? (esquerda[i]! + direita[i]!) / 2 : esquerda[i]!;
      pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2);
    }

    return {
      wav: pcmParaWav(pcm, TAXA_OPUS, 1),
      taxa: TAXA_OPUS,
      canais: 1,
      duracaoSegundos: samplesDecoded / TAXA_OPUS,
    };
  } finally {
    decoder.free();
  }
}
