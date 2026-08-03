// Envio de mensagens de WhatsApp por imobiliária, via uazapi:
//
//  1. uazapi (https://docs.uazapi.com) — provedor único. Configure a env
//     UAZAPI_URL (ex.: https://SEU-SUBDOMINIO.uazapi.com) e o token da
//     instância de cada imobiliária em Configurações (ou UAZAPI_TOKEN como
//     fallback global de instância única).
//  2. Modo demo — sem credenciais, registra no histórico e loga no console.

import { prisma } from "@/lib/db";
import { modoDemoAtivo } from "@/lib/demo";
import { emSimulacao, registrarEnvioBloqueado } from "@/lib/simulacao";
import { semRepeticaoInterna } from "@/lib/repeticao";

// Normaliza para o formato aceito pelo provedor: DDI+DDD+número (dígitos).
export function numeroWhatsApp(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  return digitos.startsWith("55") ? digitos : `55${digitos}`;
}

// Quebra a resposta da IA em "bolhas" curtas para enviar uma ideia por mensagem
// (efeito humano no WhatsApp). Separa por linha em branco; NUNCA fatia dentro de
// um parágrafo, então códigos longos (PIX copia-e-cola, linha digitável, URL)
// que a IA mantém no próprio parágrafo saem inteiros. Limita a quantidade para
// não virar spam (o excedente é juntado na última bolha).
// maxBolhas 3, não 4: quatro bolhas seguidas no WhatsApp já parecem bot
// despejando texto. O que passar disso é juntado na última.
export function dividirEmBolhas(texto: string, maxBolhas = 3): string[] {
  const partes = (texto ?? "")
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (partes.length <= 1) {
    const t = (texto ?? "").trim();
    return t ? [t] : [];
  }
  // Bolha repetida na MESMA mensagem é o caso mais visível do bug de repetição:
  // o cliente vê a mesma frase duas vezes seguidas.
  const unicas = semRepeticaoInterna(partes);
  if (unicas.length > maxBolhas) {
    const cabeca = unicas.slice(0, maxBolhas - 1);
    const resto = unicas.slice(maxBolhas - 1).join("\n\n");
    return [...cabeca, resto];
  }
  return unicas;
}

// Servidor + token uazapi da imobiliária (com fallback para env e padrão free).
async function credenciaisUazapi(
  imobiliariaId?: number
): Promise<{ url: string; token: string | null }> {
  let url = process.env.UAZAPI_URL || "https://free.uazapi.com";
  let token = process.env.UAZAPI_TOKEN ?? null;
  if (imobiliariaId) {
    const imob = await prisma.imobiliaria.findUnique({
      where: { id: imobiliariaId },
      select: { uazapiToken: true, uazapiUrl: true },
    });
    if (imob?.uazapiUrl) url = imob.uazapiUrl;
    if (imob?.uazapiToken) token = imob.uazapiToken;
  }
  return { url: url.replace(/\/$/, ""), token };
}

// Resolve os destinos (JID @lid / @s.whatsapp.net exato ou número) na ordem de
// preferência, normalizando os que são só número para DDI+DDD+número.
function resolverAlvos(telefone: string, destinos?: string | string[]): string[] {
  const brutos = Array.isArray(destinos) ? destinos : destinos ? [destinos] : [];
  return [
    ...new Set(
      (brutos.length ? brutos : [telefone])
        .map((d) => (d ?? "").toString().trim())
        .filter(Boolean)
        .map((d) => (d.includes("@") ? d : numeroWhatsApp(d)))
    ),
  ];
}

// Presença no chat: mostra "digitando..." (composing) ou "gravando áudio"
// (recording) pro cliente enquanto a IA pensa/gera a voz. Best-effort e efêmero:
// tenta os dois formatos de endpoint que os servidores uazapi expõem e nunca
// quebra o fluxo se falhar. Só faz sentido com token uazapi (não no modo demo).
export async function enviarPresenca(
  telefone: string,
  presenca: "composing" | "recording" | "paused",
  imobiliariaId?: number,
  destinos?: string | string[],
  delayMs = 6000
): Promise<void> {
  const { url: uazapiUrl, token: uazToken } = await credenciaisUazapi(imobiliariaId);
  if (!uazToken) return;
  const alvo = resolverAlvos(telefone, destinos)[0];
  if (!alvo) return;
  const corpo = JSON.stringify({ number: alvo, presence: presenca, delay: delayMs });
  // Servidores diferentes expõem caminhos diferentes; o primeiro que aceitar vale.
  for (const caminho of ["/message/presence", "/chat/presence"]) {
    try {
      const res = await fetch(`${uazapiUrl}${caminho}?token=${encodeURIComponent(uazToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: uazToken },
        body: corpo,
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) return;
    } catch {
      /* tenta o próximo caminho / desiste em silêncio */
    }
  }
}

// Baixa (e descriptografa, do lado da uazapi) a mídia de uma mensagem recebida
// pelo id do WhatsApp. A uazapi lida com a criptografia E2E; recebemos o binário
// pronto (base64) ou um link temporário. Usado para transcrever notas de voz.
export async function baixarMidiaUazapi(
  messageId: string,
  imobiliariaId?: number
): Promise<{ buffer: Buffer; mime: string } | null> {
  const { url: uazapiUrl, token: uazToken } = await credenciaisUazapi(imobiliariaId);
  if (!uazToken || !messageId) return null;
  try {
    const res = await fetch(`${uazapiUrl}/message/download?token=${encodeURIComponent(uazToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: uazToken },
      body: JSON.stringify({ id: messageId, return_base64: true, generate_mp3: false, return_link: true }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const mime =
      (d.mimetype as string) ?? (d.mimeType as string) ?? (d.mime as string) ?? "audio/ogg";
    // 1) binário em base64 direto no corpo
    const b64raw =
      (d.base64 as string) ?? (d.fileBase64 as string) ?? (d.file as string) ??
      (d.data as string) ?? (d.media as string) ?? (d.buffer as string) ?? null;
    if (typeof b64raw === "string" && b64raw.length > 100) {
      const b64 = b64raw.includes(",") ? b64raw.split(",").pop()! : b64raw;
      const buffer = Buffer.from(b64, "base64");
      if (buffer.length > 0) return { buffer, mime };
    }
    // 2) link temporário que a uazapi serve (já descriptografado)
    const link =
      (d.fileURL as string) ?? (d.url as string) ?? (d.fileUrl as string) ?? (d.link as string) ?? null;
    if (typeof link === "string" && /^https?:\/\//.test(link)) {
      const r2 = await fetch(link, { signal: AbortSignal.timeout(20000) });
      if (r2.ok) return { buffer: Buffer.from(await r2.arrayBuffer()), mime: r2.headers.get("content-type") || mime };
    }
    return null;
  } catch (e) {
    console.error("baixarMidiaUazapi:", e);
    return null;
  }
}

export async function enviarWhatsApp(
  telefone: string,
  texto: string,
  imobiliariaId?: number,
  // destinos opcionais em ordem de preferência: o JID/chatid EXATO da conversa
  // (ex.: "5517...@s.whatsapp.net" ou "...@lid") e/ou números. Cada candidato
  // que contém "@" vai como está (a uazapi resolve o chat, inclusive @lid de
  // número não salvo); os demais são normalizados para DDI+DDD+número. Tenta um
  // a um e para no primeiro que a uazapi aceitar.
  destinos?: string | string[],
  // atraso (ms) antes da uazapi entregar: durante ele o cliente vê "digitando...".
  delayMs?: number
): Promise<{ enviado: boolean; provedor: string; detalhe?: string }> {
  // SIMULAÇÃO: nada sai para o mundo. Ninguém recebe mensagem de teste.
  if (emSimulacao()) {
    registrarEnvioBloqueado(telefone, texto);
    return { enviado: false, provedor: "simulacao", detalhe: "bloqueado (simulação)" };
  }
  const alvos = resolverAlvos(telefone, destinos);

  // ── uazapi ── (servidor por imobiliária; fallback env UAZAPI_URL / free)
  const { url: uazapiUrl, token: uazToken } = await credenciaisUazapi(imobiliariaId);
  if (uazToken) {
    let ultimo = "";
    for (const alvo of alvos) {
      try {
        const res = await fetch(`${uazapiUrl}/send/text?token=${encodeURIComponent(uazToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: uazToken },
          body: JSON.stringify({ number: alvo, text: texto, ...(delayMs ? { delay: delayMs } : {}) }),
          signal: AbortSignal.timeout(20000),
        });
        if (res.ok)
          return { enviado: true, provedor: "uazapi", detalhe: `enviado via ${uazapiUrl} para ${alvo}` };
        const corpo = (await res.text()).slice(0, 140);
        const alertaFree =
          (res.status === 401 || res.status === 403) && uazapiUrl.includes("free.uazapi")
            ? " — servidor ainda é o FREE; ajuste UAZAPI_URL (+redeploy) ou o campo Servidor"
            : "";
        console.error("uazapi: erro no envio", res.status, alvo, corpo);
        ultimo = `${res.status} em ${uazapiUrl} (destino ${alvo}): ${corpo}${alertaFree}`;
        // auth não melhora tentando outro destino
        if (res.status === 401 || res.status === 403) break;
      } catch (err) {
        console.error("uazapi: falha de rede", alvo, err);
        ultimo = `falha de rede em ${uazapiUrl} (destino ${alvo}): ${(err as Error).message}`;
      }
    }
    return { enviado: false, provedor: "uazapi", detalhe: ultimo || "nenhum destino válido" };
  }

  // Número normalizado (para o log de demo, que não usa JID @lid).
  const numero = numeroWhatsApp(telefone);

  // Sem instância uazapi: em modo demo EXPLÍCITO (DEMO=1) apenas loga e conta
  // como "demo"; em produção sem DEMO, NÃO finge que enviou — devolve não-enviado
  // (o chamador registra o erro; a régua de follow-up não avança sem envio real).
  if (modoDemoAtivo()) {
    console.log(`[whatsapp demo] → ${numero}: ${texto.slice(0, 120)}`);
    return { enviado: true, provedor: "demo", detalhe: "DEMO=1 — nada foi enviado ao WhatsApp" };
  }
  return {
    enviado: false,
    provedor: "nao-configurado",
    detalhe: "sem instância uazapi para esta imobiliária (e DEMO!=1) — nada enviado",
  };
}

// Envia imagens (fotos de imóvel) pela uazapi. Aceita destinos em ordem
// (número real e/ou JID @lid) e uma lista de URLs — envia uma a uma, com a
// legenda na primeira. Retorna quantas saíram.
export async function enviarWhatsAppMidia(
  telefone: string,
  urls: string[],
  imobiliariaId?: number,
  destinos?: string | string[],
  legenda?: string
): Promise<{ enviadas: number; total: number; detalhe?: string }> {
  const lista = urls.filter(Boolean);
  if (!lista.length) return { enviadas: 0, total: 0, detalhe: "sem fotos" };
  if (emSimulacao()) {
    registrarEnvioBloqueado(telefone, `${lista.length} foto(s)${legenda ? ` — ${legenda}` : ""}`);
    return { enviadas: 0, total: lista.length, detalhe: "bloqueado (simulação)" };
  }

  const brutos = Array.isArray(destinos) ? destinos : destinos ? [destinos] : [];
  const alvos: string[] = [
    ...new Set(
      (brutos.length ? brutos : [telefone])
        .map((d) => (d ?? "").toString().trim())
        .filter(Boolean)
        .map((d) => (d.includes("@") ? d : numeroWhatsApp(d)))
    ),
  ];

  const { url: uazapiUrl, token: uazToken } = await credenciaisUazapi(imobiliariaId);
  if (!uazToken) {
    console.log(`[whatsapp demo] → ${alvos[0]}: ${lista.length} foto(s)`);
    return { enviadas: 0, total: lista.length, detalhe: "sem token uazapi — nada enviado (demo)" };
  }

  // descobre um destino que a uazapi aceite (com a 1ª foto) e usa ele nas demais
  let destinoOk: string | null = null;
  let enviadas = 0;
  let ultimo = "";
  for (let i = 0; i < lista.length; i++) {
    const tentarNesta: string[] = destinoOk ? [destinoOk] : alvos;
    let ok = false;
    for (const alvo of tentarNesta) {
      try {
        const res = await fetch(`${uazapiUrl}/send/media?token=${encodeURIComponent(uazToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: uazToken },
          body: JSON.stringify({
            number: alvo,
            type: "image",
            file: lista[i],
            ...(i === 0 && legenda ? { text: legenda } : {}),
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (res.ok) {
          destinoOk = alvo;
          enviadas++;
          ok = true;
          break;
        }
        ultimo = `${res.status} (${alvo}): ${(await res.text()).slice(0, 120)}`;
        if (res.status === 401 || res.status === 403) break;
      } catch (err) {
        ultimo = `rede (${alvo}): ${(err as Error).message}`;
      }
    }
    if (!ok && !destinoOk) break; // nem a primeira saiu — não insiste nas outras
  }
  return {
    enviadas,
    total: lista.length,
    detalhe: enviadas === lista.length ? `enviadas ${enviadas} via ${uazapiUrl}` : `parcial/erro: ${ultimo}`,
  };
}

// Envia um ÁUDIO (voz da IA, gerado no ElevenLabs) pelo WhatsApp. Recebe os
// bytes do MP3 e manda como NOTA DE VOZ pela uazapi (/send/media type "ptt"),
// resolvendo o destino como no envio de texto (número real ou @lid).
export async function enviarWhatsAppAudio(
  telefone: string,
  audio: Buffer,
  imobiliariaId?: number,
  destinos?: string | string[],
  // atraso (ms) antes de entregar: durante ele o cliente vê "gravando áudio".
  delayMs?: number
): Promise<{ enviado: boolean; detalhe?: string }> {
  if (emSimulacao()) {
    registrarEnvioBloqueado(telefone, "(áudio)");
    return { enviado: false, detalhe: "bloqueado (simulação)" };
  }
  const alvos = resolverAlvos(telefone, destinos);
  const { url: uazapiUrl, token: uazToken } = await credenciaisUazapi(imobiliariaId);
  if (!uazToken) return { enviado: false, detalhe: "sem token uazapi (demo)" };

  const dataUri = `data:audio/mpeg;base64,${audio.toString("base64")}`;
  let ultimo = "";
  for (const alvo of alvos) {
    // "ptt" é NOTA DE VOZ (push to talk); "audio" é ARQUIVO de áudio anexado.
    // Com "audio" o WhatsApp desenha um player de arquivo, que soma com número
    // sem foto de perfil e dá a impressão de mensagem encaminhada. A nota de voz
    // é a bolha redonda com a onda, do jeito que uma pessoa manda.
    // A ordem é tentativa-com-queda porque a doc da uazapi varia por versão:
    // se o servidor recusar "ptt", o áudio ainda sai como arquivo.
    for (const tipo of ["ptt", "audio"] as const) {
      try {
        const res = await fetch(`${uazapiUrl}/send/media?token=${encodeURIComponent(uazToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: uazToken },
          body: JSON.stringify({
            number: alvo,
            type: tipo,
            file: dataUri,
            ...(tipo === "ptt" ? { ptt: true } : {}),
            ...(delayMs ? { delay: delayMs } : {}),
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (res.ok) return { enviado: true, detalhe: `${tipo} (${alvo})` };
        ultimo = `${res.status} ${tipo} (${alvo}): ${(await res.text()).slice(0, 120)}`;
        // Credencial ruim não melhora trocando o tipo: aborta tudo.
        if (res.status === 401 || res.status === 403) return { enviado: false, detalhe: ultimo };
      } catch (err) {
        ultimo = `rede ${tipo} (${alvo}): ${(err as Error).message}`;
      }
    }
  }
  return { enviado: false, detalhe: ultimo || "falha ao enviar áudio" };
}

// Envia um DOCUMENTO (hoje: o book do empreendimento em PDF). Diferente das
// fotos, vai como arquivo mesmo — é o formato que a pessoa guarda e reabre.
export async function enviarWhatsAppDocumento(
  telefone: string,
  url: string,
  nomeArquivo: string,
  imobiliariaId?: number,
  destinos?: string | string[]
): Promise<{ enviado: boolean; detalhe?: string }> {
  if (emSimulacao()) {
    registrarEnvioBloqueado(telefone, `(documento: ${nomeArquivo})`);
    return { enviado: false, detalhe: "bloqueado (simulação)" };
  }
  const alvos = resolverAlvos(telefone, destinos);
  const { url: uazapiUrl, token: uazToken } = await credenciaisUazapi(imobiliariaId);
  if (!uazToken) return { enviado: false, detalhe: "sem token uazapi (demo)" };

  let ultimo = "";
  for (const alvo of alvos) {
    try {
      const res = await fetch(`${uazapiUrl}/send/media?token=${encodeURIComponent(uazToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: uazToken },
        body: JSON.stringify({
          number: alvo,
          type: "document",
          file: url,
          docName: nomeArquivo,
          mimetype: "application/pdf",
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (res.ok) return { enviado: true, detalhe: `documento (${alvo})` };
      ultimo = `${res.status} (${alvo}): ${(await res.text()).slice(0, 120)}`;
      if (res.status === 401 || res.status === 403) break;
    } catch (err) {
      ultimo = `rede (${alvo}): ${(err as Error).message}`;
    }
  }
  return { enviado: false, detalhe: ultimo || "falha ao enviar documento" };
}

// Identifica a pessoa pelo telefone. O casamento é feito NO BANCO (não carrega
// toda a base em memória) sobre o telefone normalizado. Usa 10 dígitos (DDD +
// número) como chave primária — evita confundir dois clientes de DDDs diferentes
// com o mesmo número local; cai para 8 dígitos como tolerância (9º dígito etc.).
export async function pessoaPorTelefone(telefone: string, imobiliariaId?: number) {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 8) return null;

  const buscarId = async (suf: string): Promise<number | null> => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM "Pessoa"
       WHERE ($1::int IS NULL OR "imobiliariaId" = $1::int)
         AND regexp_replace(coalesce(telefone, ''), '\\D', '', 'g') LIKE '%' || $2
       ORDER BY id DESC LIMIT 1`,
      imobiliariaId ?? null,
      suf
    );
    return rows[0]?.id ?? null;
  };

  // 1º tenta DDD+número (10 díg); se não achar, tolera pelos 8 finais.
  let id: number | null = null;
  if (digitos.length >= 10) id = await buscarId(digitos.slice(-10));
  if (id == null) id = await buscarId(digitos.slice(-8));
  if (id == null) return null;

  return prisma.pessoa.findUnique({
    where: { id },
    include: {
      contratos: { where: { status: "ATIVO" }, select: { id: true } },
      imoveis: { select: { id: true } },
    },
  });
}
