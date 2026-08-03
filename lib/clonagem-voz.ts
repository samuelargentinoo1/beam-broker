// Clonagem de voz na MiniMax: a amostra de alguém real vira a voz da Carol.
//
// É o maior salto de realismo que existe — nenhuma voz de catálogo chega perto
// de uma pessoa de verdade. E é também o ponto com mais responsabilidade do
// sistema inteiro: a voz de alguém passa a vender imóvel em nome da
// imobiliária. Por isso a tela exige a confirmação de que a pessoa autorizou, e
// a própria MiniMax pede consentimento nos termos dela.
//
// O fluxo tem DOIS passos na API:
//   1. POST /v1/files/upload  (purpose=voice_clone)  → file_id
//   2. POST /v1/voice_clone   (file_id + voice_id)   → a voz passa a existir
//
// Os dois passos falham com a mesma cara ("invalid params"), e a primeira
// versão deste arquivo devolvia a mesma frase para os dois — o que transformou
// o conserto em adivinhação. Agora cada passo carrega o próprio rótulo, e o
// erro leva junto o que foi enviado: tamanho, formato, duração, file_id e
// voice_id. Uma falha tem que bastar para saber onde mexer.

import { jaServeParaClonagem, ogaParaWav } from "@/lib/converter-audio";
import { explicarErro, grupoDaChave } from "@/lib/voz";

const MINIMAX = "https://api.minimax.io/v1";

// Limites da MiniMax para a amostra.
export const MIN_SEGUNDOS = 10;
export const MAX_SEGUNDOS = 300;
export const MAX_BYTES = 20 * 1024 * 1024;

// Acima do mínimo, mas ainda pouco. Dez segundos e pouco passam raspando: se a
// MiniMax medir a duração de um jeito ligeiramente diferente do nosso — sem o
// pré-skip do Opus, por exemplo — cai abaixo do mínimo e é recusada. E mesmo
// quando passa, amostra curta rende clone pobre.
export const SEGUNDOS_CONFORTAVEIS = 15;

export type ResultadoClonagem =
  | { ok: true; voiceId: string; aviso?: string }
  | { ok: false; erro: string };

// O voice_id é escolhido POR NÓS e vira o nome permanente da voz na conta.
// Regras da MiniMax: começa com letra, tem letra e número, no mínimo 8
// caracteres. Inclui o id da imobiliária para nunca colidir entre tenants na
// mesma conta.
//
// O carimbo vai até os SEGUNDOS, não só a data: duas tentativas no mesmo dia
// gerariam o mesmo identificador, e id repetido é recusado. Como uma tentativa
// pode ter criado a voz antes de falhar mais adiante, repetir o nome troca um
// erro por outro — e some a pista do primeiro.
export function nomeDaVozClonada(imobiliariaId: number, agora = new Date()): string {
  const carimbo = agora.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `carol${imobiliariaId}v${carimbo}`;
}

// O GroupId digitado manda; em branco, usa o que vem dentro da própria chave.
// É a mesma regra de lib/voz.ts — quando divergiam, a fala funcionava e a
// clonagem chamava sem o parâmetro, o que é impossível de perceber pelo erro.
function url(caminho: string, groupId: string | null): string {
  const base = `${MINIMAX}/${caminho}`;
  return groupId ? `${base}?GroupId=${encodeURIComponent(groupId)}` : base;
}

type Passo = "upload" | "clone";
const ROTULO: Record<Passo, string> = {
  upload: "ao enviar o arquivo",
  clone: "ao clonar a voz",
};

export async function clonarVoz(opcoes: {
  dados: Buffer;
  nomeArquivo: string;
  mime: string;
  apiKey: string;
  groupId?: string | null;
  imobiliariaId: number;
  agora?: Date;
}): Promise<ResultadoClonagem> {
  const { dados, nomeArquivo, mime, apiKey, imobiliariaId } = opcoes;

  const grupoDoToken = grupoDaChave(apiKey);
  const grupo = (opcoes.groupId || "").trim() || grupoDoToken;

  if (dados.length > MAX_BYTES)
    return { ok: false, erro: `O arquivo tem mais de ${MAX_BYTES / 1024 / 1024} MB.` };

  // ── Converte, se precisar ────────────────────────────────────────────────
  // A amostra natural é uma nota de voz do WhatsApp, que vem em OGG/Opus — e a
  // MiniMax só aceita mp3, m4a e wav.
  let arquivo = dados;
  let nome = nomeArquivo;
  let tipo = mime;
  let duracao: number | null = null;
  if (!jaServeParaClonagem(nomeArquivo, mime)) {
    try {
      const convertido = await ogaParaWav(dados);
      duracao = convertido.duracaoSegundos;
      if (convertido.duracaoSegundos < MIN_SEGUNDOS)
        return {
          ok: false,
          erro: `A amostra tem ${convertido.duracaoSegundos.toFixed(1)} segundos. A MiniMax exige pelo menos ${MIN_SEGUNDOS} — grave uns 30 segundos, que também sai um clone melhor.`,
        };
      if (convertido.duracaoSegundos > MAX_SEGUNDOS)
        return { ok: false, erro: `A amostra passa de ${MAX_SEGUNDOS / 60} minutos.` };
      arquivo = convertido.wav;
      nome = "amostra.wav";
      tipo = "audio/wav";
    } catch (e) {
      return {
        ok: false,
        erro: `Não consegui ler esse áudio (${e instanceof Error ? e.message : String(e)}). Mande um mp3, m4a, wav ou uma nota de voz do WhatsApp.`,
      };
    }
  }

  // O que a MiniMax recebeu, em uma linha — vai junto de todo erro dos dois
  // passos. Sem isto, "invalid params" não diz se o problema é o arquivo, a
  // duração ou o identificador.
  const doArquivo = `${(arquivo.length / 1024).toFixed(0)} KB, ${tipo}${
    duracao !== null ? `, ${duracao.toFixed(1)} s` : ""
  }`;

  const falhou = (passo: Passo, motivo: string, extra = ""): { ok: false; erro: string } => ({
    ok: false,
    erro: `Falhou ${ROTULO[passo]}. ${motivo} (amostra: ${doArquivo}${extra})`,
  });

  // ── 1. Sobe o arquivo ────────────────────────────────────────────────────
  // O file_id vem como NÚMERO no JSON da MiniMax, e é assim que ele tem que
  // voltar no passo 2 — o cliente oficial deles devolve o valor cru, sem
  // converter. Guardar como texto e mandar "12345" entre aspas é candidato a
  // "invalid params" em campo declarado como int64. Preservamos o tipo.
  let fileId: number | string;
  try {
    const form = new FormData();
    form.append("purpose", "voice_clone");
    form.append("file", new Blob([new Uint8Array(arquivo)], { type: tipo }), nome);
    const res = await fetch(url("files/upload", grupo), {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    const cru = await res.text();
    if (!res.ok) {
      console.error("[clonagem] upload HTTP", res.status, cru.slice(0, 500));
      return falhou("upload", `A MiniMax respondeu HTTP ${res.status}.`);
    }
    let d: {
      file?: { file_id?: number | string };
      base_resp?: { status_code?: number; status_msg?: string };
    };
    try {
      d = JSON.parse(cru);
    } catch {
      console.error("[clonagem] upload devolveu algo que não é JSON:", cru.slice(0, 500));
      return falhou("upload", "A MiniMax devolveu uma resposta que não dá para ler.");
    }
    if (d.base_resp && d.base_resp.status_code !== 0) {
      console.error("[clonagem] upload recusado:", cru.slice(0, 500));
      return falhou(
        "upload",
        explicarErro(
          d.base_resp.status_code,
          d.base_resp.status_msg || "sem detalhe",
          grupo,
          grupoDoToken
        )
      );
    }
    const id = d.file?.file_id;
    if (id === undefined || id === null) {
      console.error("[clonagem] upload sem file_id:", cru.slice(0, 500));
      return falhou("upload", "A MiniMax aceitou o arquivo mas não devolveu o identificador.");
    }
    fileId = id;
  } catch (e) {
    console.error("[clonagem] upload falhou:", e);
    return falhou("upload", "Não consegui enviar o arquivo (rede ou tempo esgotado).");
  }

  // ── 2. Clona ─────────────────────────────────────────────────────────────
  const voiceId = nomeDaVozClonada(imobiliariaId, opcoes.agora);
  const corpo = { file_id: fileId, voice_id: voiceId };
  const identificadores = `; file_id ${fileId} (${typeof fileId}); voice_id ${voiceId}`;
  try {
    // O corpo inteiro no log: é pequeno, não tem áudio dentro e é a única prova
    // do que foi realmente enviado quando a MiniMax responde "invalid params".
    console.info("[clonagem] voice_clone ←", JSON.stringify(corpo));
    const res = await fetch(url("voice_clone", grupo), {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(120000), // clonagem é lenta
    });
    const cru = await res.text();
    if (!res.ok) {
      console.error("[clonagem] voice_clone HTTP", res.status, cru.slice(0, 500));
      return falhou("clone", `A MiniMax respondeu HTTP ${res.status}.`, identificadores);
    }
    let d: { base_resp?: { status_code?: number; status_msg?: string } };
    try {
      d = JSON.parse(cru);
    } catch {
      console.error("[clonagem] voice_clone devolveu algo que não é JSON:", cru.slice(0, 500));
      return falhou(
        "clone",
        "A MiniMax devolveu uma resposta que não dá para ler.",
        identificadores
      );
    }
    if (d.base_resp && d.base_resp.status_code !== 0) {
      console.error("[clonagem] voice_clone recusado:", cru.slice(0, 500));
      return falhou(
        "clone",
        explicarErro(
          d.base_resp.status_code,
          d.base_resp.status_msg || "sem detalhe",
          grupo,
          grupoDoToken
        ),
        identificadores
      );
    }
    // Passou, mas a amostra era curta: avisa sem transformar em erro — a voz
    // existe e já dá para ouvir.
    const aviso =
      duracao !== null && duracao < SEGUNDOS_CONFORTAVEIS
        ? `A amostra tinha só ${duracao.toFixed(1)} segundos. Com uns 30 segundos o clone fica bem mais parecido — vale refazer.`
        : undefined;
    return { ok: true, voiceId, aviso };
  } catch (e) {
    console.error("[clonagem] voice_clone falhou:", e);
    return falhou("clone", "Não consegui concluir a clonagem (rede ou tempo esgotado).", identificadores);
  }
}
