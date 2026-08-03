// PCM → MP3, em JavaScript puro.
//
// Depois que a voz passa pela produção sonora (lib/audio-producao.ts) ela é um
// monte de amostras, e o WhatsApp precisa de um arquivo. lamejs resolve isso
// sem ffmpeg e sem binário nativo — o que importa porque a rota roda em
// serverless, onde instalar ffmpeg significaria dezenas de megabytes de bundle.

import { Mp3Encoder } from "@breezystack/lamejs";

// O encoder do MP3 trabalha em quadros de 1152 amostras. Alimentar em blocos
// desse tamanho evita cópia extra e é o que a biblioteca espera.
const QUADRO = 1152;

// 96 e não 64 kbps: em 64, o codificador tratando ruído contínuo de baixo nível
// produz artefato ondulante que soa como… chiado, justamente o que a produção
// tenta evitar. A diferença de tamanho (20 s: 165 KB para 240 KB) é irrelevante
// para o WhatsApp, que reencoda em Opus de qualquer jeito.
export function pcmParaMp3(pcm: Buffer, taxa: number, kbps = 96): Buffer {
  const amostras = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const encoder = new Mp3Encoder(1, taxa, kbps);
  const partes: Buffer[] = [];

  for (let i = 0; i < amostras.length; i += QUADRO) {
    const bloco = encoder.encodeBuffer(amostras.subarray(i, i + QUADRO));
    if (bloco.length > 0) partes.push(Buffer.from(bloco));
  }
  const fim = encoder.flush();
  if (fim.length > 0) partes.push(Buffer.from(fim));

  return Buffer.concat(partes);
}
