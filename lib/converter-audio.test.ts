// A amostra natural para clonar uma voz é uma nota de voz do WhatsApp — e nota
// de voz do WhatsApp é OGG/Opus, que é justamente o formato que a MiniMax NÃO
// aceita (ela quer mp3, m4a ou wav). Sem esta conversão, o arquivo mais fácil
// de conseguir é o único que não serve.
import { describe, expect, it } from "vitest";

import { jaServeParaClonagem, ogaParaWav } from "@/lib/converter-audio";
import { lerOggOpus } from "@/lib/ogg";
import { pcmParaWav } from "@/lib/wav";
import { nomeDaVozClonada } from "@/lib/clonagem-voz";

describe("o que já serve não é reconvertido", () => {
  it("mp3, m4a e wav passam direto", () => {
    // Reconverter só degradaria a amostra — e é a amostra que define a
    // qualidade do clone.
    expect(jaServeParaClonagem("voz.mp3", "audio/mpeg")).toBe(true);
    expect(jaServeParaClonagem("voz.m4a", "audio/mp4")).toBe(true);
    expect(jaServeParaClonagem("voz.wav", "audio/wav")).toBe(true);
  });

  it("nota de voz do WhatsApp precisa de conversão", () => {
    expect(jaServeParaClonagem("PTT-2026.ogg", "audio/ogg; codecs=opus")).toBe(false);
    expect(jaServeParaClonagem("audio.oga", "audio/ogg")).toBe(false);
  });
});

describe("o cabeçalho WAV", () => {
  it("tem os campos que um decodificador espera", () => {
    const pcm = Buffer.alloc(3200); // 100 ms a 16 kHz mono
    const wav = pcmParaWav(pcm, 16000, 1);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(16000); // taxa
    expect(wav.readUInt16LE(34)).toBe(16); // bits por amostra
    expect(wav.readUInt32LE(40)).toBe(pcm.length); // tamanho do bloco de dados
    expect(wav.length).toBe(44 + pcm.length);
  });
});

describe("o leitor de OGG", () => {
  it("recusa com mensagem clara o que não é OGG", () => {
    expect(() => lerOggOpus(Buffer.from("isto não é um arquivo de áudio"))).toThrow();
  });

  it("lê os cabeçalhos de um OGG/Opus montado à mão", () => {
    // Página com OpusHead: mono, pré-skip 312, taxa original 48 kHz.
    const opusHead = Buffer.alloc(19);
    opusHead.write("OpusHead", 0);
    opusHead[8] = 1; // versão
    opusHead[9] = 1; // canais
    opusHead.writeUInt16LE(312, 10);
    opusHead.writeUInt32LE(48000, 12);

    const pagina = (dados: Buffer, seq: number) => {
      const cab = Buffer.alloc(27 + 1);
      cab.write("OggS", 0);
      cab.writeUInt32LE(seq, 18);
      cab[26] = 1; // um segmento
      cab[27] = dados.length; // do tamanho dos dados
      return Buffer.concat([cab, dados]);
    };

    const arquivo = Buffer.concat([
      pagina(opusHead, 0),
      pagina(Buffer.concat([Buffer.from("OpusTags"), Buffer.alloc(4)]), 1),
      pagina(Buffer.from([0xfc, 0x01, 0x02, 0x03]), 2), // um "pacote" de áudio
    ]);

    const r = lerOggOpus(arquivo);
    expect(r.canais).toBe(1);
    expect(r.preSkip).toBe(312);
    expect(r.taxaOriginal).toBe(48000);
    // Os dois cabeçalhos NÃO entram como áudio — mandá-los ao decodificador
    // produziria estouro no começo do arquivo.
    expect(r.pacotes).toHaveLength(1);
  });

  it("áudio vazio falha em vez de gerar um WAV mudo", async () => {
    // Um WAV silencioso subiria para a MiniMax e viraria um clone inútil, sem
    // ninguém entender por quê.
    await expect(ogaParaWav(Buffer.from("OggS não é áudio de verdade"))).rejects.toThrow();
  });
});

describe("o nome da voz clonada", () => {
  it("segue as regras da MiniMax e separa por imobiliária", () => {
    // Começa com letra, tem letra e número, mínimo de 8 caracteres — e inclui o
    // id do tenant para duas imobiliárias na mesma conta nunca colidirem.
    const a = nomeDaVozClonada(7, new Date("2026-07-28T12:00:00Z"));
    const b = nomeDaVozClonada(9, new Date("2026-07-28T12:00:00Z"));
    expect(a).toMatch(/^[a-z][a-z0-9]{7,}$/);
    expect(a).not.toBe(b);
    expect(a).toContain("7");
  });
});
