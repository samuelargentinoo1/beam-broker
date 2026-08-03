// A garantia que sustenta o simulador: durante uma simulação NADA sai para o
// mundo. Ninguém recebe mensagem de teste — nem texto, nem foto, nem áudio.
import { describe, expect, it, vi } from "vitest";

import { comSimulacao, emSimulacao, registrarEnvioBloqueado } from "@/lib/simulacao";

describe("contexto de simulação", () => {
  it("está desligado por padrão", () => {
    expect(emSimulacao()).toBe(false);
  });

  it("liga dentro do bloco e desliga ao sair", async () => {
    const dentro = await comSimulacao(async () => emSimulacao());
    expect(dentro.resultado).toBe(true);
    expect(emSimulacao()).toBe(false);
  });

  it("atravessa await e chamadas aninhadas", async () => {
    const profundo = async () => {
      await new Promise((r) => setTimeout(r, 5));
      const maisFundo = async () => emSimulacao();
      return maisFundo();
    };
    const r = await comSimulacao(profundo);
    expect(r.resultado).toBe(true);
  });

  it("coleta os envios interceptados para a tela mostrar", async () => {
    const r = await comSimulacao(async () => {
      registrarEnvioBloqueado("5511999990000", "Você autoriza o reparo?");
      registrarEnvioBloqueado("5511988880000", "(áudio)");
      return "ok";
    });
    expect(r.enviosBloqueados).toHaveLength(2);
    expect(r.enviosBloqueados[0]).toContain("autoriza o reparo");
  });

  it("registrar fora do contexto não quebra nem vaza", () => {
    expect(() => registrarEnvioBloqueado("x", "y")).not.toThrow();
  });

  it("não vaza entre execuções concorrentes", async () => {
    const [a, b] = await Promise.all([
      comSimulacao(async () => {
        registrarEnvioBloqueado("A", "mensagem de A");
        await new Promise((r) => setTimeout(r, 10));
        return emSimulacao();
      }),
      (async () => {
        // Fora do contexto: não pode enxergar a simulação da outra execução.
        await new Promise((r) => setTimeout(r, 5));
        return emSimulacao();
      })(),
    ]);
    expect(a.resultado).toBe(true);
    expect(a.enviosBloqueados).toEqual(["A: mensagem de A"]);
    expect(b).toBe(false);
  });
});

describe("os três canais de WhatsApp ficam bloqueados", () => {
  // Sem credencial de uazapi as funções já não enviariam; o que se prova aqui é
  // que a simulação retorna ANTES de qualquer tentativa de rede, com o motivo.
  it("texto, mídia e áudio devolvem 'bloqueado (simulação)'", async () => {
    vi.stubEnv("UAZAPI_TOKEN", "token-falso-para-o-teste");
    const { enviarWhatsApp, enviarWhatsAppMidia, enviarWhatsAppAudio } = await import(
      "@/lib/whatsapp"
    );

    const r = await comSimulacao(async () => ({
      texto: await enviarWhatsApp("5511999990000", "oi"),
      midia: await enviarWhatsAppMidia("5511999990000", ["https://x/foto.jpg"]),
      audio: await enviarWhatsAppAudio("5511999990000", Buffer.from("abc")),
    }));

    expect(r.resultado.texto.enviado).toBe(false);
    expect(r.resultado.texto.provedor).toBe("simulacao");
    expect(r.resultado.midia.enviadas).toBe(0);
    expect(r.resultado.audio.enviado).toBe(false);
    for (const v of Object.values(r.resultado)) {
      expect(v.detalhe).toContain("simulação");
    }
    // E os três aparecem na lista do que teria saído.
    expect(r.enviosBloqueados).toHaveLength(3);
    vi.unstubAllEnvs();
  });
});
