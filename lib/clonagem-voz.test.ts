// A clonagem tem dois passos na MiniMax (subir o arquivo, depois clonar) e os
// dois respondem "invalid params" do mesmo jeito. A primeira versão devolvia a
// MESMA frase para os dois, e por isso a primeira falha real não disse nada —
// virou tentativa e erro. Estes testes travam as três coisas que fazem a
// próxima falha ser útil: o tipo do file_id, a unicidade do voice_id e o passo
// nomeado na mensagem.
import { afterEach, describe, expect, it, vi } from "vitest";

import { clonarVoz, nomeDaVozClonada } from "@/lib/clonagem-voz";

const CHAVE = "sk-api-chave-de-teste";
const AMOSTRA = {
  dados: Buffer.alloc(64512), // 63 KB redondos
  nomeArquivo: "voz.mp3", // já serve: pula a conversão (que precisa de WASM)
  mime: "audio/mpeg",
  apiKey: CHAVE,
  imobiliariaId: 3,
};

type Resposta = { corpo: unknown; status?: number };

// Encadeia as respostas na ordem em que as chamadas acontecem e guarda o que
// foi enviado, para os testes olharem o corpo real da requisição.
function fingirMinimax(respostas: Resposta[]) {
  const chamadas: { url: string; corpo: string | null }[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const corpo = typeof init?.body === "string" ? init.body : null;
      chamadas.push({ url: String(url), corpo });
      const r = respostas[i++] ?? { corpo: {} };
      return {
        ok: (r.status ?? 200) < 400,
        status: r.status ?? 200,
        text: async () => JSON.stringify(r.corpo),
      } as Response;
    })
  );
  return chamadas;
}

const OK_UPLOAD = (fileId: number | string): Resposta => ({
  corpo: { file: { file_id: fileId }, base_resp: { status_code: 0, status_msg: "success" } },
});
const OK_CLONE: Resposta = { corpo: { base_resp: { status_code: 0, status_msg: "success" } } };
const RECUSA = (cod: number, msg: string): Resposta => ({
  corpo: { base_resp: { status_code: cod, status_msg: msg } },
});

afterEach(() => vi.unstubAllGlobals());

describe("o file_id volta para a MiniMax do jeito que veio", () => {
  it("número continua número — não vira texto entre aspas", async () => {
    // Campo declarado como int64 recebendo "12345" entre aspas é o suspeito
    // número um do "invalid params". O cliente oficial da MiniMax devolve o
    // valor cru, sem converter.
    const chamadas = fingirMinimax([OK_UPLOAD(295818983104515), OK_CLONE]);
    const r = await clonarVoz(AMOSTRA);
    expect(r.ok).toBe(true);
    const enviado = JSON.parse(chamadas[1]!.corpo!);
    expect(enviado.file_id).toBe(295818983104515);
    expect(typeof enviado.file_id).toBe("number");
    expect(chamadas[1]!.corpo).toContain('"file_id":295818983104515');
  });

  it("texto continua texto — se a MiniMax mudar, seguimos ela", async () => {
    const chamadas = fingirMinimax([OK_UPLOAD("abc123"), OK_CLONE]);
    await clonarVoz(AMOSTRA);
    expect(JSON.parse(chamadas[1]!.corpo!).file_id).toBe("abc123");
  });
});

describe("cada tentativa é uma voz nova", () => {
  it("duas tentativas no mesmo dia não repetem o voice_id", async () => {
    // Se a primeira tentativa chegou a criar a voz antes de falhar, repetir o
    // nome na segunda troca um erro por outro — e esconde o primeiro.
    const manha = nomeDaVozClonada(3, new Date("2026-07-28T11:08:23Z"));
    const tarde = nomeDaVozClonada(3, new Date("2026-07-28T14:31:02Z"));
    expect(manha).not.toBe(tarde);
    expect(manha).toMatch(/^[a-z][a-z0-9]{7,}$/); // regra da MiniMax
  });

  it("o voice_id enviado é o do carimbo de agora", async () => {
    const chamadas = fingirMinimax([OK_UPLOAD(1), OK_CLONE]);
    const agora = new Date("2026-07-28T14:31:02Z");
    const r = await clonarVoz({ ...AMOSTRA, agora });
    expect(r.ok && r.voiceId).toBe(nomeDaVozClonada(3, agora));
    expect(JSON.parse(chamadas[1]!.corpo!).voice_id).toBe(nomeDaVozClonada(3, agora));
  });
});

describe("o erro diz QUAL passo falhou", () => {
  it("recusa no upload aponta o envio do arquivo", async () => {
    fingirMinimax([RECUSA(2013, "invalid params")]);
    const r = await clonarVoz(AMOSTRA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("ao enviar o arquivo");
    expect(r.erro).not.toContain("ao clonar a voz");
  });

  it("recusa na clonagem aponta a clonagem, com file_id e voice_id", async () => {
    fingirMinimax([OK_UPLOAD(777), RECUSA(2013, "invalid params")]);
    const r = await clonarVoz({ ...AMOSTRA, agora: new Date("2026-07-28T14:31:02Z") });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("ao clonar a voz");
    expect(r.erro).toContain("file_id 777");
    expect(r.erro).toContain(nomeDaVozClonada(3, new Date("2026-07-28T14:31:02Z")));
  });

  it("o 2013 é traduzido como erro de integração, não de credencial", async () => {
    // Já mandou gente caçar problema na chave que estava certa. 2013 só
    // acontece DEPOIS de a autenticação passar.
    fingirMinimax([OK_UPLOAD(1), RECUSA(2013, "invalid params")]);
    const r = await clonarVoz(AMOSTRA);
    if (r.ok) throw new Error("deveria ter falhado");
    expect(r.erro).toContain("erro de integração");
  });

  it("todo erro carrega o que foi enviado", async () => {
    fingirMinimax([RECUSA(2013, "invalid params")]);
    const r = await clonarVoz(AMOSTRA);
    if (r.ok) throw new Error("deveria ter falhado");
    expect(r.erro).toContain("63 KB");
    expect(r.erro).toContain("audio/mpeg");
  });
});

describe("o GroupId segue a mesma regra da fala", () => {
  it("em branco, usa o grupo de dentro da própria chave", async () => {
    // Quando as duas regras divergiam, a fala funcionava e a clonagem chamava
    // sem o parâmetro — impossível de perceber pela mensagem de erro.
    const carga = Buffer.from(JSON.stringify({ GroupID: "1949" })).toString("base64url");
    const chamadas = fingirMinimax([OK_UPLOAD(1), OK_CLONE]);
    await clonarVoz({ ...AMOSTRA, apiKey: `eyJhbGciOiJIUzI1NiJ9.${carga}.assinatura` });
    expect(chamadas[0]!.url).toContain("GroupId=1949");
    expect(chamadas[1]!.url).toContain("GroupId=1949");
  });

  it("preenchido, o digitado manda", async () => {
    const chamadas = fingirMinimax([OK_UPLOAD(1), OK_CLONE]);
    await clonarVoz({ ...AMOSTRA, groupId: " 42 " });
    expect(chamadas[0]!.url).toContain("GroupId=42");
  });
});

describe("amostra curta", () => {
  it("passa, mas volta com aviso quando dá para melhorar", async () => {
    // Só sabemos a duração quando convertemos (nota de voz). Para mp3 que veio
    // pronto não há o que avisar — e avisar por suposição seria pior.
    fingirMinimax([OK_UPLOAD(1), OK_CLONE]);
    const r = await clonarVoz(AMOSTRA);
    expect(r.ok && r.aviso).toBeUndefined();
  });
});
