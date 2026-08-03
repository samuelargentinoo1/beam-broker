// PCM → WAV. Quarenta e quatro bytes de cabeçalho e pronto.
//
// A MiniMax aceita mp3, m4a e wav para clonagem. WAV é o formato certo aqui
// porque a amostra vai servir de referência para copiar um timbre: recomprimir
// em MP3 antes de mandar jogaria fora detalhe que o clonador usa.

export function pcmParaWav(pcm: Buffer, taxa: number, canais = 1): Buffer {
  const cabecalho = Buffer.alloc(44);
  const bytesPorAmostra = 2;
  const blocoAlinhamento = canais * bytesPorAmostra;

  cabecalho.write("RIFF", 0);
  cabecalho.writeUInt32LE(36 + pcm.length, 4); // tamanho total menos os 8 primeiros
  cabecalho.write("WAVE", 8);
  cabecalho.write("fmt ", 12);
  cabecalho.writeUInt32LE(16, 16); // tamanho do bloco fmt
  cabecalho.writeUInt16LE(1, 20); // 1 = PCM sem compressão
  cabecalho.writeUInt16LE(canais, 22);
  cabecalho.writeUInt32LE(taxa, 24);
  cabecalho.writeUInt32LE(taxa * blocoAlinhamento, 28); // bytes por segundo
  cabecalho.writeUInt16LE(blocoAlinhamento, 32);
  cabecalho.writeUInt16LE(8 * bytesPorAmostra, 34); // bits por amostra
  cabecalho.write("data", 36);
  cabecalho.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([cabecalho, pcm]);
}
