// A produção sonora não dá para "olhar" — só ouvindo, e ouvir não cabe em CI.
// O que cabe é medir: nível, pico, duração e determinismo. Se o leito sair alto
// demais o áudio soa amador; se sair clipado, soa quebrado — e nenhum dos dois
// se percebe lendo o código.
import { describe, expect, it } from "vitest";

import { AJUSTES, floatParaPcm, pcmParaFloat, produzir } from "@/lib/audio-producao";
import { cenarioPorHora, geradorAleatorio, leitoDeAmbiente, ruidoRosa } from "@/lib/ambiente";
import { pcmParaMp3 } from "@/lib/mp3";

const TAXA = 32000;

// Voz sintética: uma senoide em nível de fala. Serve para medir o que a
// produção FAZ com a voz, sem depender da MiniMax.
function vozFalsa(segundos: number, amplitude = 0.2): Buffer {
  const n = Math.round(TAXA * segundos);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = Math.sin((2 * Math.PI * 180 * i) / TAXA) * amplitude;
  return floatParaPcm(f);
}

function pico(pcm: Buffer): number {
  const f = pcmParaFloat(pcm);
  let m = 0;
  for (let i = 0; i < f.length; i++) m = Math.max(m, Math.abs(f[i]!));
  return m;
}

// Energia numa faixa de frequência, por DFT direta em algumas raias. Não é FFT
// e não precisa ser: são poucas frequências e o sinal é curto. Serve para
// medir "isto chia?" de forma objetiva.
function energiaNaBanda(x: Float32Array, hzDe: number, hzAte: number): number {
  const n = Math.min(x.length, 8192);
  let total = 0;
  for (let hz = Math.max(20, hzDe); hz < hzAte; hz += Math.max(40, (hzAte - hzDe) / 24)) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * hz) / TAXA;
    for (let i = 0; i < n; i++) {
      re += x[i]! * Math.cos(w * i);
      im += x[i]! * Math.sin(w * i);
    }
    total += (re * re + im * im) / (n * n);
  }
  return total;
}

function rms(pcm: Buffer, de = 0, ate = Infinity): number {
  const f = pcmParaFloat(pcm);
  const fim = Math.min(f.length, ate);
  let s = 0;
  let n = 0;
  for (let i = de; i < fim; i++, n++) s += f[i]! * f[i]!;
  return Math.sqrt(s / Math.max(1, n));
}

describe("ida e volta entre PCM e amostras", () => {
  it("converte sem perder o sinal", () => {
    const f = new Float32Array([0, 0.5, -0.5, 0.999, -0.999]);
    const volta = pcmParaFloat(floatParaPcm(f));
    for (let i = 0; i < f.length; i++) expect(volta[i]!).toBeCloseTo(f[i]!, 3);
  });

  it("TRAVA fora de -1..1 em vez de estourar", () => {
    // Sem a trava, o valor dá a volta e vira estalo — o único defeito de áudio
    // que não passa por humano.
    const f = new Float32Array([2, -2]);
    const volta = pcmParaFloat(floatParaPcm(f));
    expect(volta[0]!).toBeLessThanOrEqual(1);
    expect(volta[1]!).toBeGreaterThanOrEqual(-1);
  });
});

describe("o ruído da sala", () => {
  it("é ROSA, não branco — branco soa rádio fora de estação", () => {
    // Ruído rosa tem mais energia no grave. Comparando a primeira metade das
    // diferenças entre amostras: no rosa elas são menores (menos agudo).
    const rnd = geradorAleatorio("teste");
    const rosa = ruidoRosa(20000, rnd);
    let variacaoRosa = 0;
    for (let i = 1; i < rosa.length; i++) variacaoRosa += Math.abs(rosa[i]! - rosa[i - 1]!);
    let variacaoBranco = 0;
    const r2 = geradorAleatorio("teste");
    let ant = 0;
    for (let i = 0; i < 20000; i++) {
      const v = r2() * 2 - 1;
      variacaoBranco += Math.abs(v - ant);
      ant = v;
    }
    expect(variacaoRosa).toBeLessThan(variacaoBranco);
  });

  it("NÃO CHIA — é rumor grave, não sopro de banda larga", () => {
    // ESTE é o teste que importa. Chiado é ruído contínuo com energia de 2 a
    // 8 kHz, onde o ouvido é mais sensível. Sala de verdade é rumor: quase toda
    // a energia abaixo de 500 Hz. Aqui isso vira número, não opinião.
    const leito = leitoDeAmbiente(TAXA * 3, TAXA, cenarioPorHora(15), geradorAleatorio("x"));
    const grave = energiaNaBanda(leito, 0, 500);
    const agudo = energiaNaBanda(leito, 3000, TAXA / 2);
    expect(agudo / grave).toBeLessThan(0.02);
  });

  it("o leito sai normalizado — quem decide o nível é a mixagem", () => {
    // O nível certo é RELATIVO À VOZ, e a voz só é conhecida na produção.
    const leito = leitoDeAmbiente(TAXA * 2, TAXA, cenarioPorHora(15), geradorAleatorio("y"));
    let s = 0;
    for (let i = 0; i < leito.length; i++) s += leito[i]! * leito[i]!;
    const rms = Math.sqrt(s / leito.length);
    // Os eventos entram DEPOIS da normalização do chão, então o RMS passa de 1.
    expect(rms).toBeGreaterThan(0.5);
    expect(rms).toBeLessThan(6);
  });

  it("SEMPRE tem pelo menos um evento — é ele que faz acreditar num lugar", () => {
    // Com zero eventos sobra só o chão, e chão sozinho é ruído, não ambiente.
    for (const semente of ["a", "b", "c", "d", "e", "f"]) {
      const so = leitoDeAmbiente(TAXA * 2, TAXA, cenarioPorHora(15), geradorAleatorio(semente));
      let picoLeito = 0;
      for (let i = 0; i < so.length; i++) picoLeito = Math.max(picoLeito, Math.abs(so[i]!));
      // Um evento é bem mais alto que o chão normalizado (RMS 1).
      expect(picoLeito).toBeGreaterThan(6);
    }
  });
});

describe("o cenário muda com a hora", () => {
  it("tarde tem mais movimento que fim de dia", () => {
    // Escritório às 15h tem gente; às 20h esvaziou.
    expect(cenarioPorHora(15).leitoDb).toBeGreaterThan(cenarioPorHora(20).leitoDb);
    expect(cenarioPorHora(15).eventosMax).toBeGreaterThanOrEqual(cenarioPorHora(20).eventosMax);
  });

  it("cada faixa do dia tem nome próprio", () => {
    const nomes = new Set([cenarioPorHora(9), cenarioPorHora(15), cenarioPorHora(20)].map((c) => c.nome));
    expect(nomes.size).toBe(3);
  });
});

describe("a produção", () => {
  const VOZ = vozFalsa(2);

  it("acrescenta cabeça e cauda — o dedo aperta gravar antes de falar", () => {
    const p = produzir(VOZ, TAXA, "semente");
    expect(p.pcm.length).toBeGreaterThan(VOZ.length);
    const acrescimoMs = ((p.pcm.length - VOZ.length) / 2 / TAXA) * 1000;
    expect(acrescimoMs).toBeGreaterThanOrEqual(AJUSTES.cabecaMs[0] + AJUSTES.caudaMs[0] - 1);
    expect(acrescimoMs).toBeLessThanOrEqual(AJUSTES.cabecaMs[1] + AJUSTES.caudaMs[1] + 1);
  });

  it("NÃO deixa o áudio estourar", () => {
    // Um áudio clipado é o único jeito de soar pior que TTS puro.
    for (const amp of [0.1, 0.3, 0.6, 0.9]) {
      expect(pico(produzir(vozFalsa(1, amp), TAXA, `a${amp}`).pcm)).toBeLessThanOrEqual(1);
    }
  });

  it("o começo tem SOM — é a sala, não silêncio digital", () => {
    // Silêncio absoluto atrás da voz é o que mais denuncia TTS.
    const p = produzir(VOZ, TAXA, "sala");
    const nivelCabeca = rms(p.pcm, 0, Math.round(TAXA * 0.15));
    expect(nivelCabeca).toBeGreaterThan(0);
  });

  it("sem a camada de ambiente, o começo é silêncio de verdade", () => {
    const p = produzir(VOZ, TAXA, "sala", { ambiente: false, respiro: false });
    expect(p.pcm.length).toBe(VOZ.length);
  });

  it("a MESMA mensagem produz sempre a MESMA gravação", () => {
    // Reenviar não pode mudar o cenário: seria outra sala na mesma conversa.
    const a = produzir(VOZ, TAXA, "igual");
    const b = produzir(VOZ, TAXA, "igual");
    expect(a.pcm.equals(b.pcm)).toBe(true);
  });

  it("mensagens diferentes soam diferentes", () => {
    // Um mesmo fundo em todo áudio vira assinatura reconhecível na 3ª nota.
    const a = produzir(VOZ, TAXA, "uma coisa");
    const b = produzir(VOZ, TAXA, "outra coisa");
    expect(a.pcm.equals(b.pcm)).toBe(false);
  });

  it("o nível varia de um áudio para o outro", () => {
    const niveis = ["a", "b", "c", "d"].map((s) => rms(produzir(VOZ, TAXA, s).pcm));
    expect(new Set(niveis.map((n) => n.toFixed(4))).size).toBeGreaterThan(1);
  });

  it("as camadas podem ser ligadas e desligadas para comparação", () => {
    const completo = produzir(VOZ, TAXA, "z");
    const soVoz = produzir(VOZ, TAXA, "z", { ambiente: false, microfone: false, respiro: false });
    expect(completo.pcm.equals(soVoz.pcm)).toBe(false);
    expect(soVoz.pcm.length).toBe(VOZ.length);
  });

  it("registra em que cenário gravou", () => {
    const p = produzir(VOZ, TAXA, "z", {}, new Date(Date.UTC(2026, 6, 28, 18, 0, 0)));
    expect(p.cenario).toContain("tarde");
  });
});

describe("o MP3 final", () => {
  it("sai com cabeçalho de MP3 válido e tamanho plausível", () => {
    const p = produzir(vozFalsa(2), TAXA, "mp3");
    const mp3 = pcmParaMp3(p.pcm, TAXA);
    // 0xFF 0xFB é o sync word de um quadro MPEG-1 Layer III.
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1]! & 0xf0).toBe(0xf0);
    // ~64 kbps por 2 s dá algo na casa dos 16 KB. Folga larga de propósito.
    expect(mp3.length).toBeGreaterThan(8_000);
    expect(mp3.length).toBeLessThan(40_000);
  });
});
