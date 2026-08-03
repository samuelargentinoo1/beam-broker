// O áudio da IA chegava com cara de arquivo encaminhado porque saía como
// type "audio" (arquivo anexado) em vez de "ptt" (nota de voz). Este teste
// trava o payload.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enviarWhatsAppAudio, enviarWhatsAppDocumento } from "@/lib/whatsapp";

const original = globalThis.fetch;
let chamadas: { url: string; corpo: Record<string, unknown> }[] = [];

function mockarFetch(ok: (tipo: unknown) => boolean) {
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body ?? "{}"));
    chamadas.push({ url: String(url), corpo });
    return { ok: ok(corpo.type), status: ok(corpo.type) ? 200 : 400, text: async () => "recusado" } as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  chamadas = [];
  process.env.UAZAPI_TOKEN = "token-de-teste";
  process.env.UAZAPI_URL = "https://uaz.test";
});
afterEach(() => {
  globalThis.fetch = original;
  delete process.env.UAZAPI_TOKEN;
  delete process.env.UAZAPI_URL;
});

describe("o áudio sai como NOTA DE VOZ", () => {
  it("tenta ptt primeiro — é o que desenha a bolha de voz, não o player de arquivo", async () => {
    mockarFetch((tipo) => tipo === "ptt");
    const r = await enviarWhatsAppAudio("5516999990000", Buffer.from("fake-mp3"));
    expect(r.enviado).toBe(true);
    expect(chamadas[0]!.corpo.type).toBe("ptt");
    expect(chamadas[0]!.corpo.ptt).toBe(true);
    expect(String(chamadas[0]!.corpo.file)).toMatch(/^data:audio\/mpeg;base64,/);
    // Deu certo de primeira: não insiste com o formato antigo.
    expect(chamadas).toHaveLength(1);
  });

  it("servidor que não conhece ptt ainda recebe o áudio como arquivo", async () => {
    // A doc da uazapi varia por versão. Melhor o áudio sair como arquivo do que
    // não sair.
    mockarFetch((tipo) => tipo === "audio");
    const r = await enviarWhatsAppAudio("5516999990000", Buffer.from("fake-mp3"));
    expect(r.enviado).toBe(true);
    expect(chamadas.map((c) => c.corpo.type)).toEqual(["ptt", "audio"]);
    expect(r.detalhe).toContain("audio");
  });

  it("credencial recusada aborta na hora, sem tentar o outro tipo", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, text: async () => "sem auth" }) as Response) as unknown as typeof fetch;
    const r = await enviarWhatsAppAudio("5516999990000", Buffer.from("x"));
    expect(r.enviado).toBe(false);
    expect(r.detalhe).toContain("401");
  });
});

describe("o book vai como documento", () => {
  it("manda PDF com nome de arquivo, para a pessoa guardar e reabrir", async () => {
    mockarFetch(() => true);
    const r = await enviarWhatsAppDocumento(
      "5516999990000",
      "https://blob.test/aurora.pdf",
      "Residencial Aurora.pdf"
    );
    expect(r.enviado).toBe(true);
    expect(chamadas[0]!.corpo.type).toBe("document");
    expect(chamadas[0]!.corpo.docName).toBe("Residencial Aurora.pdf");
    expect(chamadas[0]!.corpo.mimetype).toBe("application/pdf");
    // URL pública, não base64: quem baixa é a uazapi.
    expect(chamadas[0]!.corpo.file).toBe("https://blob.test/aurora.pdf");
  });
});
