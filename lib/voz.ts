// Voz da IA. Dois provedores, cada um no que faz melhor:
//   FALA        → MiniMax (T2A v2), mais natural em português.
//   TRANSCRIÇÃO → ElevenLabs (scribe_v1), com o serviço whisper como fallback.
// Sem chave, o sistema segue só em texto — nunca quebra o atendimento.

import { prepararFala, prosodia } from "@/lib/fala";
import { dentroDaJanelaDeAudio } from "@/lib/prompt-audio";

const XI = "https://api.elevenlabs.io/v1";

// ─── Tags ───────────────────────────────────────────────────────────────────
//
// A IA escreve tags entre COLCHETES ([laughs], [sighs]). Elas nunca aparecem no
// texto que o cliente lê.
//
// No áudio o destino depende do modelo. O speech-2.8-hd suporta interjeições
// NATIVAMENTE, com sintaxe de PARÊNTESES — "(laughs)", não "[laughs]" — e elas
// viram som de verdade. A família speech-02-* lia a tag em voz alta, e por isso
// tudo era removido.
//
// A lista é ALLOWLIST, e curta de propósito: tag não suportada volta a ser
// soletrada pela voz. Na dúvida, remove.
const INTERJEICOES_2_8: Record<string, string> = {
  laughs: "laughs",
  "laughs softly": "chuckle",
  chuckle: "chuckle",
  sighs: "sighs",
  breath: "breath",
  inhale: "inhale",
  exhale: "exhale",
  gasps: "gasps",
  coughs: "coughs",
  "clear-throat": "clear-throat",
};

// O modelo em uso aceita interjeição? Só a família 2.8 em diante.
function suportaInterjeicao(modelo = MODELO_VOZ): boolean {
  return /^speech-2\.[89]|^speech-[3-9]/.test(modelo);
}

// Tira as tags do texto EXIBIDO. Sempre remove tudo: o que o cliente lê nunca
// tem colchete. Não mexe em códigos como [AP-0001] (tem maiúscula e número).
export function limparTagsAudio(t: string): string {
  return t
    .replace(/\[[a-zà-ú][a-zà-ú \-]{1,24}\]/gi, (m) => (/[A-Z0-9]/.test(m) ? m : ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Prepara as tags para a FALA: converte as suportadas para a sintaxe do modelo
// e apaga o resto. Com modelo antigo, apaga todas — é o comportamento seguro.
export function tagsParaFala(t: string, modelo = MODELO_VOZ): string {
  const nativo = suportaInterjeicao(modelo);
  return t
    .replace(/\[([a-zà-ú][a-zà-ú \-]{1,24})\]/gi, (m, dentro: string) => {
      if (/[A-Z0-9]/.test(m)) return m; // código de imóvel, não tag
      const equivalente = INTERJEICOES_2_8[dentro.trim().toLowerCase()];
      return nativo && equivalente ? `(${equivalente})` : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// A resposta combina com áudio? Evita mandar por voz coisas sensíveis/longas
// (PIX copia-e-cola, linha digitável, links, textão) — essas ficam em texto.
export function audioAmigavel(t: string): boolean {
  const limpo = t.trim();
  if (!limpo || limpo.length > 350) return false;
  if (/https?:\/\//i.test(limpo)) return false; // links
  if (/\d[\d.\s]{18,}/.test(limpo)) return false; // sequência longa de dígitos (PIX/boleto)
  return true;
}
// A frequência configurada em Configurações ("% das respostas em áudio") vale
// para as respostas que PODEM virar áudio. PIX, link e texto longo saem em
// texto de qualquer jeito — então o percentual é um TETO, não a taxa observada.
//
// Ficava solto dentro do webhook, sem teste: ninguém sabia se o número
// configurado estava sendo respeitado. Aqui é uma função pura, com o sorteio
// injetável, e o teste confere a frequência de verdade.
// Decide a INTENÇÃO de mandar áudio — antes de o texto existir. É o que permite
// avisar a IA para escrever falando, em vez de sortear depois e narrar um texto
// cheio de bullet e link.
export function sorteioDeAudio(opcoes: {
  pct: number | null | undefined;
  temChave: boolean;
  soTexto?: boolean;
  agora?: Date;
  sorteio?: () => number; // 0..1
}): boolean {
  const { pct, temChave, soTexto = false, agora = new Date(), sorteio = Math.random } = opcoes;
  if (!temChave || soTexto) return false;
  // Fora da janela, texto. Áudio de madrugada de número desconhecido é o que
  // mais toma bloqueio.
  if (!dentroDaJanelaDeAudio(agora)) return false;
  // 0 desliga o áudio; null/undefined (imobiliária antiga, sem o campo) cai no
  // padrão do schema. `??` de propósito: `|| 40` transformaria 0 em 40 e o
  // desligamento não funcionaria.
  const alvo = pct ?? 40;
  if (alvo <= 0) return false;
  if (alvo >= 100) return true;
  return sorteio() * 100 < alvo;
}

// Confere o TEXTO já escrito. É a rede de segurança: mesmo avisada de que ia
// virar áudio, a IA pode ter mandado um link — e link não se fala.
export function textoPodeVirarAudio(texto: string): boolean {
  return audioAmigavel(limparTagsAudio(texto));
}

// As duas coisas juntas, para quem tem o texto em mãos (o teste de frequência
// e qualquer chamador que não separe as duas etapas).
export function deveMandarAudio(opcoes: {
  pct: number | null | undefined;
  texto: string;
  temChave: boolean;
  soTexto?: boolean;
  agora?: Date;
  sorteio?: () => number;
}): boolean {
  if (!textoPodeVirarAudio(opcoes.texto)) return false;
  return sorteioDeAudio(opcoes);
}

// ─── Fala: MiniMax (T2A v2) ─────────────────────────────────────────────────
//
// A MiniMax NÃO entende as tags textuais ([laughs], [sighs]) — ela tem um
// parâmetro `emotion`. Então a tag deixa de ser lida junto com a frase e passa
// a ESCOLHER a emoção da voz: a expressividade continua, sem o robô soletrando
// "colchete laughs".

const MINIMAX = "https://api.minimax.io/v1";

// Voz usada quando a imobiliária não escolheu nenhuma. NÃO invente um valor
// aqui: o voice_id de sistema da MiniMax tem formato próprio
// ("Portuguese (Brazilian)_..."), e um ID inexistente é recusado com HTTP 200 —
// o áudio simplesmente não sai, calado. O caminho certo é escolher na tela de
// Configurações, que lista as vozes da própria conta. Esta constante é só uma
// escotilha de operação (env), não um palpite.
const VOZ_PADRAO = (process.env.MINIMAX_VOZ_PADRAO || "").trim();

// speech-02-hd é família LEGADA. O 2.8 tem nuance tonal melhor e — o que mais
// importa aqui — suporte NATIVO a tags de interjeição, que no 02 eram lidas em
// voz alta e por isso tinham de ser removidas.
// HD e não turbo de propósito: os áudios do atendimento são curtos, então a
// latência não é o gargalo e a qualidade compensa.
export const MODELO_VOZ = process.env.MINIMAX_MODELO || "speech-2.8-hd";

// Tag escrita pela IA → emoção da voz. O que não estiver aqui vira "neutral".
// O 2.8 aceita sete: happy, sad, angry, fearful, disgusted, surprised, calm.
const EMOCAO_POR_TAG: Record<string, string> = {
  laughs: "happy",
  "laughs softly": "happy",
  chuckle: "happy",
  excited: "happy",
  sighs: "sad",
  sad: "sad",
  surprised: "surprised",
  gasps: "surprised",
  calm: "calm",
  breath: "calm",
  angry: "angry",
  fearful: "fearful",
  disgusted: "disgusted",
  // Ironia é dita em tom SECO: emoção nenhuma é o efeito desejado.
  sarcastic: "neutral",
};

export function emocaoDoTexto(texto: string): string {
  const achadas = texto.toLowerCase().match(/\[([a-z ]+)\]/g) ?? [];
  for (const bruta of achadas) {
    const chave = bruta.slice(1, -1).trim();
    if (EMOCAO_POR_TAG[chave]) return EMOCAO_POR_TAG[chave]!;
  }
  return "neutral";
}

// Corpo da requisição, isolado para o teste conferir sem bater na API.
//
// Duas transformações acontecem aqui, e as duas são o que separa "atendente
// gravada" de "pessoa mandando áudio" (ver lib/fala.ts):
//   TEXTO    reescrito para ser falado — valor, sigla, medida, oralidade.
//   PROSÓDIA derivada do que a frase diz, em vez de fixa para toda mensagem.
// Produção sonora ligada? Com ela, pedimos PCM à MiniMax e a voz passa por
// lib/audio-producao.ts antes de virar MP3. Desligando, volta ao MP3 direto do
// TTS — escotilha para comparar, ou para desligar rápido se algo soar errado
// em produção.
export const PRODUCAO_ATIVA = process.env.AUDIO_PRODUCAO !== "0";

// 32000 Hz é o padrão documentado. Os aceitos são 16000, 22050, 32000, 44100 e
// 48000 — valor fora dessa lista devolve 2013 e derruba o áudio inteiro.
export const TAXA_AUDIO = 32000;

export function corpoMinimax(
  texto: string,
  voiceId?: string | null,
  modelo = MODELO_VOZ,
  formato: "mp3" | "pcm" = PRODUCAO_ATIVA ? "pcm" : "mp3"
) {
  // A tag é lida ANTES de qualquer coisa: ela escolhe a emoção.
  const emocaoDaTag = emocaoDoTexto(texto);
  // Para a FALA, a interjeição suportada vira "(laughs)" e o resto some. Para a
  // prosódia, o texto limpo — a tag não deve contar como palavra falada.
  const paraFalar = tagsParaFala(texto, modelo);
  const semTag = limparTagsAudio(texto);
  const falado = prepararFala(paraFalar);
  const p = prosodia(semTag, emocaoDaTag);
  return {
    model: modelo,
    text: falado,
    stream: false,
    voice_setting: {
      voice_id: (voiceId || "").trim() || VOZ_PADRAO,
      speed: p.speed,
      vol: p.vol,
      pitch: p.pitch,
      emotion: p.emotion,
    },
    // Com a produção ligada, pedimos PCM: amostras cruas permitem mixar a sala
    // e o caráter de microfone sem precisar decodificar MP3 (o que exigiria
    // ffmpeg ou um decoder wasm). O MP3 é gerado aqui no fim, com lamejs.
    audio_setting: { format: formato, sample_rate: TAXA_AUDIO, bitrate: 64000, channel: 1 },
    language_boost: "Portuguese",
  };
}

// Resposta da MiniMax já traduzida: ou o corpo, ou o MOTIVO em português de
// gente. O motivo importa — sem ele, chave errada, saldo zerado e voice_id
// inexistente produzem exatamente o mesmo sintoma (silêncio).
type RespostaMinimax<T> = { ok: true; dados: T } | { ok: false; erro: string };

// A chave da MiniMax é um JWT e carrega o GroupID DENTRO dela. Ler esse campo
// resolve o erro mais comum da configuração ("1004 token not match group"):
// dá para dizer a qual grupo a chave pertence, em vez de mandar a pessoa
// adivinhar. Só lê a carga — não valida assinatura, e não precisa: aqui é
// diagnóstico, quem autentica é a MiniMax.
export function grupoDaChave(apiKey: string): string | null {
  const partes = (apiKey || "").trim().split(".");
  if (partes.length !== 3) return null; // chave no formato antigo (sk-...)
  try {
    const carga = JSON.parse(Buffer.from(partes[1]!, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    for (const campo of ["GroupID", "GroupId", "group_id", "groupID"]) {
      const v = carga[campo];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return null;
  } catch {
    return null;
  }
}

// Traduz o código da MiniMax para uma instrução do que fazer. "1004 token not
// match group" sozinho não diz a ninguém qual dos dois campos está errado.
export function explicarErro(
  cod: number | undefined,
  msg: string,
  grupoUsado: string | null,
  grupoDoToken: string | null
): string {
  const cru = `MiniMax recusou (${cod}): ${msg}`;
  if (/group/i.test(msg) && !grupoUsado)
    return `A MiniMax pediu o GroupId (${msg}). Copie o número do campo UID em Account → Your Profile e cole no campo GroupId.`;
  if (cod === 1004 || /not match group|token/i.test(msg)) {
    if (grupoDoToken && grupoUsado && grupoDoToken !== grupoUsado)
      return `A chave da MiniMax pertence ao grupo ${grupoDoToken}, mas o GroupId configurado é ${grupoUsado}. Corrija o GroupId (ou deixe em branco, que o sistema usa o da chave).`;
    if (grupoDoToken)
      return `A MiniMax recusou a chave do grupo ${grupoDoToken}. Confira se a chave não foi revogada e se ela é da plataforma global (platform.minimax.io), não da minimaxi.com.`;
    if (/unusable|invalid|expired|revok/i.test(msg))
      return `A chave salva não serve para a MiniMax (${msg}). Gere outra em Access → Create new API key e cole inteira — ela começa com "eyJ".`;
    return `A MiniMax recusou a chave. Confira se copiou a chave inteira e se ela é da plataforma global (platform.minimax.io), não da minimaxi.com. ${cru}`;
  }
  if (/insufficient|balance|quota|arrear/i.test(msg))
    return `A conta MiniMax está sem saldo para gerar áudio. ${cru}`;
  if (/voice/i.test(msg))
    return `A MiniMax não reconheceu a voz escolhida. Recarregue a lista e escolha outra. ${cru}`;
  // 2013 só acontece DEPOIS da autenticação passar: a chave e o saldo estão
  // certos, o que a MiniMax recusou foi o corpo da requisição. Sem dizer isso, o
  // erro genérico manda caçar problema de credencial que não existe — foi
  // exatamente o que aconteceu com o voice_type errado.
  if (cod === 2013)
    return `A MiniMax recusou os parâmetros da requisição (${msg}). Isso é erro de integração — a chave e o saldo estão certos, não adianta mexer neles.`;
  return cru;
}

// A MiniMax devolve HTTP 200 mesmo em erro de negócio: quem manda é base_resp.
// Uma função só para os dois endpoints (fala e catálogo de vozes), para o
// tratamento de erro não divergir entre eles.
async function chamarMinimax<T>(
  caminho: string,
  apiKey: string,
  groupId: string | null | undefined,
  corpo: unknown,
  timeoutMs = 25000
): Promise<RespostaMinimax<T>> {
  const base = `${MINIMAX}/${caminho}`;
  // O GroupId digitado manda. Em branco, usa o que vem dentro da própria chave
  // — na prática o campo vira opcional, e some a causa nº 1 do erro 1004.
  const doToken = grupoDaChave(apiKey);
  const grupo = (groupId || "").trim() || doToken;
  // Sem grupo conhecido, chama SEM o parâmetro em vez de recusar: a chave
  // "sk-api-..." identifica a conta sozinha, e quem decide se o GroupId é
  // exigido é a MiniMax, não um palpite daqui. Se ela reclamar do grupo, a
  // mensagem de erro manda preencher.
  const url = grupo ? `${base}?GroupId=${encodeURIComponent(grupo)}` : base;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.error(`[voz] MiniMax HTTP ${res.status} em ${caminho}`);
      return {
        ok: false,
        erro:
          res.status === 401 || res.status === 403
            ? "A MiniMax recusou a chave (confira a API Key e o GroupId)."
            : `A MiniMax respondeu HTTP ${res.status}.`,
      };
    }
    const d = (await res.json()) as T & {
      base_resp?: { status_code?: number; status_msg?: string };
    };
    if (d.base_resp && d.base_resp.status_code !== 0) {
      const cod = d.base_resp.status_code;
      const msg = d.base_resp.status_msg || "sem detalhe";
      console.error(`[voz] MiniMax recusou: ${cod} ${msg}`);
      return { ok: false, erro: explicarErro(cod, msg, grupo, doToken) };
    }
    return { ok: true, dados: d };
  } catch (e) {
    console.error(`[voz] MiniMax falhou em ${caminho}:`, e);
    return { ok: false, erro: "Não consegui falar com a MiniMax (tempo esgotado ou rede)." };
  }
}

// Pede o PCM cru à MiniMax, SEM produção. Existe para o laboratório de voz:
// comparar camadas exige a mesma voz crua passando por caminhos diferentes, e
// gerar de novo a cada versão daria vozes ligeiramente diferentes (além de
// custar quatro chamadas em vez de uma).
export async function gerarPcmCru(
  texto: string,
  apiKey: string,
  voiceId: string,
  groupId?: string | null,
  modelo = MODELO_VOZ
): Promise<RespostaMinimax<Buffer>> {
  const r = await chamarMinimax<{ data?: { audio?: string } }>(
    "t2a_v2",
    apiKey,
    groupId,
    corpoMinimax(texto, voiceId, modelo, "pcm")
  );
  if (!r.ok) return r;
  const hex = r.dados.data?.audio;
  if (!hex) return { ok: false, erro: "A MiniMax respondeu sem áudio." };
  return { ok: true, dados: Buffer.from(hex, "hex") };
}

// Gera o MP3 da fala em português, devolvendo o MOTIVO quando falha. Use esta
// no que é interativo (o preview da tela de Configurações): quem está
// configurando precisa saber o que a MiniMax recusou.
export async function gerarAudioDetalhado(
  texto: string,
  apiKey: string,
  voiceId?: string | null,
  groupId?: string | null
): Promise<RespostaMinimax<Buffer>> {
  // Ninguém escolhe voz: o sistema pergunta à conta quais existem e usa a
  // padrão em português. É o que evita o voice_id chutado, que a MiniMax
  // recusa sem dizer por quê.
  let escolhida = (voiceId || "").trim();
  if (!escolhida) {
    const padrao = await vozPadraoDaConta(apiKey, groupId);
    if (!padrao.ok) return padrao; // repassa o motivo REAL, sem inventar outro
    escolhida = padrao.dados;
  }
  // Escada de tentativas. O áudio é a coisa mais fácil de quebrar em silêncio
  // deste sistema — um nome de modelo que a conta não tem, ou um parâmetro que
  // aquele modelo não aceita, devolvem 2013 e a fala some sem explicação. Em vez
  // de apostar numa configuração só, a gente desce degrau a degrau até algo
  // funcionar, e registra qual degrau salvou.
  const tentativas: { rotulo: string; corpo: ReturnType<typeof corpoMinimax> }[] = [];
  const completo = corpoMinimax(texto, escolhida);
  tentativas.push({ rotulo: MODELO_VOZ, corpo: completo });

  // Degrau 2: sem `emotion`. A doc da MiniMax lista os modelos que aceitam esse
  // parâmetro e NÃO inclui o 2.8, enquanto o material de lançamento fala em
  // sete emoções. Perder a emoção é muito melhor que perder a fala.
  const { emotion: _semEmocao, ...vozCrua } = completo.voice_setting;
  tentativas.push({
    rotulo: `${MODELO_VOZ} sem emotion`,
    corpo: { ...completo, voice_setting: vozCrua as typeof completo.voice_setting },
  });

  // Degrau 3: o modelo legado, que já funcionou nesta conta. Só entra se o
  // configurado for outro — senão seria repetir o degrau 1.
  const LEGADO = "speech-02-hd";
  if (MODELO_VOZ !== LEGADO) {
    tentativas.push({ rotulo: LEGADO, corpo: corpoMinimax(texto, escolhida, LEGADO) });
  }

  let r = await chamarMinimax<{ data?: { audio?: string } }>(
    "t2a_v2",
    apiKey,
    groupId,
    tentativas[0]!.corpo
  );
  for (let i = 1; i < tentativas.length && !r.ok; i++) {
    // Só desce a escada em erro de PARÂMETRO. Chave errada, saldo zerado e rede
    // fora não melhoram com outro modelo — insistir só atrasa a resposta.
    if (!/2013|invalid param|invalid.*model|model.*not/i.test(r.erro)) break;
    console.warn(`[voz] MiniMax recusou; tentando "${tentativas[i]!.rotulo}"`);
    r = await chamarMinimax<{ data?: { audio?: string } }>(
      "t2a_v2",
      apiKey,
      groupId,
      tentativas[i]!.corpo
    );
    if (r.ok && i > 0) {
      console.warn(
        `[voz] o áudio saiu com "${tentativas[i]!.rotulo}". Se isso se repetir, ajuste ` +
          `MINIMAX_MODELO — a cada mensagem estão sendo gastas ${i + 1} chamadas.`
      );
    }
  }

  if (!r.ok) return r;
  const hex = r.dados.data?.audio;
  if (!hex) return { ok: false, erro: "A MiniMax respondeu sem áudio." };
  const bruto = Buffer.from(hex, "hex"); // vem em hex, não base64

  // Sem produção, o que a MiniMax devolveu JÁ é o MP3 final.
  if (!PRODUCAO_ATIVA) return { ok: true, dados: bruto };

  // Com produção, veio PCM cru: a voz ganha sala, microfone e respiração, e só
  // então vira MP3. É esta etapa que separa "voz no vácuo" de "alguém gravou
  // isso no telefone".
  try {
    const { produzir } = await import("@/lib/audio-producao");
    const { pcmParaMp3 } = await import("@/lib/mp3");
    const produzido = produzir(bruto, TAXA_AUDIO, texto);
    return { ok: true, dados: pcmParaMp3(produzido.pcm, TAXA_AUDIO) };
  } catch (e) {
    // Falhar na produção NÃO pode custar o áudio. Sem MP3 a partir do PCM não
    // há o que enviar, então a saída honesta é dizer o motivo.
    console.error("[voz] produção sonora falhou:", e);
    return {
      ok: false,
      erro: `Falha ao produzir o áudio (${e instanceof Error ? e.message : String(e)}).`,
    };
  }
}

// Mesma coisa, mas engolindo o motivo. Use no webhook: lá, cair para texto sem
// alarde é o comportamento certo — o cliente não pode ver erro de integração.
export async function gerarAudio(
  texto: string,
  apiKey: string,
  voiceId?: string | null,
  groupId?: string | null
): Promise<Buffer | null> {
  const r = await gerarAudioDetalhado(texto, apiKey, voiceId, groupId);
  return r.ok ? r.dados : null;
}

// ─── Catálogo de vozes ──────────────────────────────────────────────────────
//
// A MiniMax EXPÕE catálogo por API (`/v1/get_voice`). Sem isto, a tela de
// Configurações vira um campo de texto onde ninguém sabe o que colar — e um
// voice_id errado não dá erro, dá silêncio.

export type VozMinimax = { id: string; nome: string; detalhe?: string };

// O idioma vem no começo do próprio voice_id ("Portuguese (Brazilian)_...").
function ehPortugues(v: VozMinimax): boolean {
  return /portug|brazil|brasil/i.test(`${v.id} ${v.nome} ${v.detalhe ?? ""}`);
}

// Português primeiro: é a única língua que interessa aqui, e o catálogo da
// MiniMax vem com centenas de vozes de outros idiomas na frente.
export function ordenarVozes(vozes: VozMinimax[]): VozMinimax[] {
  const pt = vozes.filter(ehPortugues);
  const resto = vozes.filter((v) => !ehPortugues(v));
  return [...pt, ...resto];
}

// Vozes treinadas para LOCUÇÃO. São as mais bonitas do catálogo e as piores
// para atendimento: locutor lendo notícia é exatamente o que a gente está
// tentando não parecer.
const DE_LOCUCAO = /narrat|anchor|announc|executive|host|broadcast|documentar|audiobook|present/i;
// Português de PORTUGAL se entrega na primeira sílaba para um cliente daqui.
const PT_PT = /portugal|european|pt-pt|\(portugal\)/i;

// Escolhe a voz padrão da conta, por ordem de prioridade:
//   1. português do BRASIL
//   2. registro conversacional (fora as de locução)
//   3. feminina — é a Carol
// Nunca devolve um ID inventado: se o catálogo vier vazio, devolve null e quem
// chamou mostra o erro.
export function escolherVozPadrao(vozes: VozMinimax[]): VozMinimax | null {
  if (vozes.length === 0) return null;
  const texto = (v: VozMinimax) => `${v.id} ${v.nome} ${v.detalhe ?? ""}`;

  const brasileiras = vozes.filter(
    (v) => /portug|brazil|brasil/i.test(texto(v)) && !PT_PT.test(texto(v))
  );
  const pool = brasileiras.length > 0 ? brasileiras : vozes;

  // Tira as de locução — mas só se sobrar alguma. Melhor uma voz de locutor que
  // voz nenhuma.
  const conversacionais = pool.filter((v) => !DE_LOCUCAO.test(texto(v)));
  const finalistas = conversacionais.length > 0 ? conversacionais : pool;

  return finalistas.find((v) => /female|woman|mulher|feminin/i.test(texto(v))) ?? finalistas[0]!;
}

// A voz padrão da conta, descoberta uma vez e reaproveitada. Sem isto seria uma
// chamada a get_voice por mensagem — e com isto ninguém precisa saber o que é
// um voice_id para o áudio funcionar.
const CACHE_VOZ = new Map<string, { voz: string; ate: number }>();
const CACHE_MS = 60 * 60 * 1000;

// Devolve o MOTIVO quando falha, em vez de um null que o chamador teria de
// interpretar. Interpretar era o problema: o texto inventado ali ("confira a
// API Key e o saldo") mandou caçar credencial durante uma investigação inteira,
// quando o que a MiniMax tinha recusado era um parâmetro da requisição.
export async function vozPadraoDaConta(
  apiKey: string,
  groupId?: string | null,
  agora = Date.now()
): Promise<RespostaMinimax<string>> {
  const emCache = CACHE_VOZ.get(apiKey);
  if (emCache && emCache.ate > agora) return { ok: true, dados: emCache.voz };
  const r = await listarVozes(apiKey, groupId);
  // Falha NÃO entra em cache: a próxima tentativa consulta de novo, senão um
  // erro passageiro (ou já corrigido no deploy) fica preso por uma hora.
  if (!r.ok) return r;
  const voz = escolherVozPadrao(r.dados)?.id;
  if (!voz)
    return { ok: false, erro: "A conta MiniMax respondeu, mas sem nenhuma voz no catálogo." };
  CACHE_VOZ.set(apiKey, { voz, ate: agora + CACHE_MS });
  return { ok: true, dados: voz };
}

// Corpo do get_voice, exportado pelo mesmo motivo que corpoMinimax: para o
// teste conferir sem bater na API.
//
// CUIDADO com o nome: "system_voice" é o campo que vem NA RESPOSTA. No corpo
// ENVIADO, voice_type aceita só all | system | voice_cloning |
// voice_generation | music_generation. Mandar o nome do campo da resposta
// devolvia "2013 invalid params" — e a tela traduzia isso como problema de
// chave e de saldo, mandando caçar o que nunca esteve errado.
// "all" é o valor que a documentação mostra na própria requisição de exemplo;
// "system" também consta da lista de aceitos, mas só como item de enumeração.
// Entre os dois, fica o atestado. A resposta traz vários arrays e aqui só
// lemos system_voice, então pedir "all" não muda o resultado.
export function corpoGetVoice() {
  return { voice_type: "all" };
}

export async function listarVozes(
  apiKey: string,
  groupId?: string | null
): Promise<RespostaMinimax<VozMinimax[]>> {
  const r = await chamarMinimax<{
    system_voice?: { voice_id?: string; voice_name?: string; description?: string[] | string }[];
  }>("get_voice", apiKey, groupId, corpoGetVoice(), 15000);
  if (!r.ok) return r;
  const vozes: VozMinimax[] = (r.dados.system_voice ?? [])
    .filter((v) => v.voice_id)
    .map((v) => ({
      id: v.voice_id!,
      nome: v.voice_name || v.voice_id!,
      detalhe: Array.isArray(v.description) ? v.description.join(", ") : v.description || undefined,
    }));
  return { ok: true, dados: ordenarVozes(vozes) };
}

// Transcreve um áudio (bytes) para texto. Modelo scribe_v1 do ElevenLabs — a
// transcrição continua aqui de propósito, é o que o ElevenLabs faz melhor.
export async function transcreverAudio(
  audio: Buffer,
  apiKey: string,
  mime = "audio/ogg"
): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("model_id", "scribe_v1");
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), "audio");
    const res = await fetch(`${XI}/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { text?: string };
    return (d.text ?? "").trim() || null;
  } catch {
    return null;
  }
}
