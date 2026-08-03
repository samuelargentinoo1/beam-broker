// Diagnóstico da instância uazapi — roda no servidor (Vercel), onde a rede
// alcança o servidor uazapi. Usado pela tela de Configurações para o usuário
// verificar a conexão e enviar uma mensagem de teste sem precisar de curl.

import { prisma } from "@/lib/db";
import { numeroWhatsApp } from "@/lib/whatsapp";

export type StatusUazapi = {
  ok: boolean;
  conectado: boolean;
  estado: string; // "conectado" | "desconectado" | "sem_token" | "sem_url" | "erro"
  detalhe: string;
  numero?: string; // número conectado, se a API informar
  servidor?: string; // servidor uazapi que o sistema REALMENTE usou
  origemServidor?: string; // de onde veio: "configuração" | "env UAZAPI_URL" | "padrão"
};

// Servidor uazapi padrão quando nada foi configurado.
const UAZAPI_URL_PADRAO = "https://free.uazapi.com";

// Servidor + token de uma imobiliária. Prioridade do servidor:
// 1) o que a imobiliária salvou em Configurações; 2) env UAZAPI_URL; 3) padrão.
async function credenciaisUazapi(
  imobiliariaId: number
): Promise<{ url: string; token: string | null; origem: string }> {
  const imob = await prisma.imobiliaria.findUnique({
    where: { id: imobiliariaId },
    select: { uazapiToken: true, uazapiUrl: true },
  });
  const urlBruta = imob?.uazapiUrl || process.env.UAZAPI_URL || UAZAPI_URL_PADRAO;
  const origem = imob?.uazapiUrl
    ? "configuração da imobiliária"
    : process.env.UAZAPI_URL
      ? "env UAZAPI_URL"
      : "padrão (free)";
  return {
    url: urlBruta.replace(/\/$/, ""),
    token: imob?.uazapiToken || process.env.UAZAPI_TOKEN || null,
    origem,
  };
}

// Consulta o estado da instância. A uazapi expõe GET /instance/status
// retornando algo como { instance: { status: "connected", ... } } — mas o
// formato varia entre versões, então lemos vários campos de forma tolerante.
export async function statusUazapi(imobiliariaId: number): Promise<StatusUazapi> {
  const { url, token, origem } = await credenciaisUazapi(imobiliariaId);
  if (!token)
    return {
      ok: false,
      conectado: false,
      estado: "sem_token",
      detalhe: "Cole o token da instância uazapi aqui em Configurações e salve.",
      servidor: url,
      origemServidor: origem,
    };

  try {
    // A uazapi autentica por QUERY STRING (?token=... / ?admintoken=...),
    // não por header — como faz o node oficial. Mandamos na query (e no header
    // por garantia). Sem isso, o servidor responde 401 mesmo com token válido.
    const res = await fetch(`${url}/instance/status?token=${encodeURIComponent(token)}`, {
      method: "GET",
      headers: { token, Accept: "application/json" },
      cache: "no-store",
    });
    const txt = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(txt);
    } catch {
      /* resposta não-JSON */
    }
    if (!res.ok) {
      const mascara =
        token.length > 12 ? `${token.slice(0, 8)}…${token.slice(-4)}` : token;
      const auth = res.status === 401 || res.status === 403;
      return {
        ok: false,
        conectado: false,
        estado: "erro",
        servidor: url,
        origemServidor: origem,
        detalhe: auth
          ? `A uazapi (${url}) recusou o token ${mascara} (${res.status}). ` +
            (url.includes("free.uazapi")
              ? `⚠️ O servidor ainda é o FREE. Sua instância está em outro servidor — ` +
                `defina a env UAZAPI_URL e faça REDEPLOY, ou preencha "Servidor uazapi" acima.`
              : `Confira se é o token da instância conectada (não o admin token).`) +
            (txt ? ` Resposta: ${txt.slice(0, 120)}` : "")
          : `A uazapi (${url}) respondeu ${res.status}. ${txt.slice(0, 160)}`,
      };
    }

    // achata campos comuns em diferentes versões da uazapi
    const inst = (data.instance ?? data) as Record<string, unknown>;
    const bruto =
      (inst.status as string) ??
      (inst.state as string) ??
      (inst.connectionStatus as string) ??
      (data.status as string) ??
      "";
    const estadoLower = String(bruto).toLowerCase();
    const conectado =
      estadoLower.includes("connect") && !estadoLower.includes("dis")
        ? true
        : estadoLower === "open" || inst.connected === true || inst.loggedIn === true;
    const numero =
      (inst.owner as string) ??
      (inst.number as string) ??
      (inst.phone as string) ??
      (inst.wid as string) ??
      undefined;

    return {
      ok: true,
      conectado: Boolean(conectado),
      estado: conectado ? "conectado" : "desconectado",
      servidor: url,
      origemServidor: origem,
      detalhe: conectado
        ? "Instância conectada ao WhatsApp — pronto para enviar e receber."
        : `Instância não conectada (estado: ${bruto || "desconhecido"}). Leia o QR Code da instância na uazapi.`,
      numero: numero ? String(numero) : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      conectado: false,
      estado: "erro",
      servidor: url,
      origemServidor: origem,
      detalhe: `Não foi possível falar com ${url}: ${(err as Error).message}. Confira o endereço do servidor uazapi em Configurações.`,
    };
  }
}

// Envia uma mensagem de teste pelo número da instância (mesma rota do envio real).
export async function enviarTesteUazapi(
  imobiliariaId: number,
  telefoneDestino: string
): Promise<{ ok: boolean; detalhe: string }> {
  const { url, token } = await credenciaisUazapi(imobiliariaId);
  if (!token) return { ok: false, detalhe: "Token da instância não configurado." };
  const numero = numeroWhatsApp(telefoneDestino);
  if (numero.replace(/\D/g, "").length < 12)
    return { ok: false, detalhe: "Número inválido. Use DDD + número (ex.: 17 99117-0597)." };

  try {
    const res = await fetch(`${url}/send/text?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({
        number: numero,
        text: "✅ Teste do sistema Administrativo — a integração com o WhatsApp está funcionando.",
      }),
    });
    const txt = await res.text();
    if (!res.ok)
      return {
        ok: false,
        detalhe: `A uazapi recusou o envio (${res.status}): ${txt.slice(0, 180)}`,
      };
    return {
      ok: true,
      detalhe: `Mensagem enviada para ${numero}. Confira o WhatsApp do número.`,
    };
  } catch (err) {
    return { ok: false, detalhe: `Falha de rede ao enviar: ${(err as Error).message}` };
  }
}

// ── Criar instância + gerar QR Code ─────────────────────────────────────────
// Usa o ADMIN token do servidor (transitório, não é salvo) para criar uma
// instância nova; salva o token da instância na imobiliária e pede o QR Code.

export type ResultadoCriarInstancia = {
  ok: boolean;
  detalhe: string;
  qrcode?: string; // data URL (base64) do QR Code para escanear
  paircode?: string; // código de pareamento alternativo ao QR
  instanciaMascarada?: string;
};

function extrai(obj: unknown, chaves: string[]): string | undefined {
  const alvos: Record<string, unknown>[] = [];
  if (obj && typeof obj === "object") {
    alvos.push(obj as Record<string, unknown>);
    const inst = (obj as Record<string, unknown>).instance;
    if (inst && typeof inst === "object") alvos.push(inst as Record<string, unknown>);
  }
  for (const alvo of alvos)
    for (const k of chaves) {
      const v = alvo[k];
      if (typeof v === "string" && v) return v;
    }
  return undefined;
}

export async function criarInstanciaUazapi(
  imobiliariaId: number,
  entrada: { serverUrl: string; adminToken: string; nome: string }
): Promise<ResultadoCriarInstancia> {
  const url = (entrada.serverUrl || process.env.UAZAPI_URL || UAZAPI_URL_PADRAO).replace(/\/$/, "");
  const admin = entrada.adminToken.trim();
  const nome = entrada.nome.trim() || "administrativo";
  if (!admin) return { ok: false, detalhe: "Informe o Admin Token do servidor uazapi." };

  try {
    // 1) cria a instância (auth por admintoken na query e no header)
    const initRes = await fetch(`${url}/instance/init?admintoken=${encodeURIComponent(admin)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", admintoken: admin },
      body: JSON.stringify({ name: nome }),
    });
    const initTxt = await initRes.text();
    let initData: unknown = {};
    try {
      initData = JSON.parse(initTxt);
    } catch {
      /* não-JSON */
    }
    if (!initRes.ok)
      return {
        ok: false,
        detalhe: `Falha ao criar a instância (${initRes.status}): ${initTxt.slice(0, 160)}. Confira o Admin Token e o servidor.`,
      };

    const instanceToken = extrai(initData, ["token", "apikey", "hash", "instanceToken"]);
    if (!instanceToken)
      return {
        ok: false,
        detalhe: `Instância criada, mas não veio o token na resposta: ${initTxt.slice(0, 200)}`,
      };

    // salva o token da instância + servidor na imobiliária (não salva o admin token)
    await prisma.imobiliaria.update({
      where: { id: imobiliariaId },
      data: { uazapiToken: instanceToken, uazapiUrl: url },
    });

    // 2) conecta a instância → devolve QR Code (base64) e/ou pair code
    const connRes = await fetch(`${url}/instance/connect?token=${encodeURIComponent(instanceToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({}),
    });
    const connTxt = await connRes.text();
    let connData: unknown = {};
    try {
      connData = JSON.parse(connTxt);
    } catch {
      /* não-JSON */
    }
    const mascara =
      instanceToken.length > 12
        ? `${instanceToken.slice(0, 6)}…${instanceToken.slice(-4)}`
        : instanceToken;

    if (!connRes.ok)
      return {
        ok: true,
        detalhe: `Instância criada (token ${mascara}) e salva. O QR ainda não veio (${connRes.status}) — clique em Verificar conexão em instantes.`,
        instanciaMascarada: mascara,
      };

    let qr = extrai(connData, ["qrcode", "qr", "base64", "qrCode"]);
    const paircode = extrai(connData, ["paircode", "paircode", "pairingCode"]);
    if (qr && !qr.startsWith("data:") && qr.length > 100) qr = `data:image/png;base64,${qr}`;

    return {
      ok: true,
      detalhe: qr
        ? `Instância criada e token salvo. Escaneie o QR Code abaixo com o WhatsApp (Aparelhos conectados).`
        : `Instância criada e token salvo (${mascara}). ${paircode ? `Use o código de pareamento: ${paircode}` : "Clique em Verificar conexão para o status."}`,
      qrcode: qr,
      paircode,
      instanciaMascarada: mascara,
    };
  } catch (err) {
    return { ok: false, detalhe: `Não foi possível falar com ${url}: ${(err as Error).message}` };
  }
}

// Configura o webhook da instância apontando para o próprio sistema — roda no
// servidor (Vercel), que alcança a uazapi. Tenta os formatos conhecidos do
// uazapiGO e devolve a resposta bruta para diagnóstico.
export async function configurarWebhookUazapi(
  imobiliariaId: number,
  webhookUrl: string
): Promise<{ ok: boolean; detalhe: string }> {
  const { url, token } = await credenciaisUazapi(imobiliariaId);
  if (!token) return { ok: false, detalhe: "Salve o token da instância em Configurações antes." };
  if (!webhookUrl || !/^https?:\/\//.test(webhookUrl))
    return { ok: false, detalhe: "URL do sistema inválida (defina APP_URL na Vercel)." };

  // Corpo abrangente: habilita o webhook para mensagens recebidas.
  const corpo = {
    url: webhookUrl,
    enabled: true,
    events: ["messages", "messages_update"],
    excludeMessages: ["wasSentByApi"],
    addUrlTypesMessages: false,
  };

  // Endpoints candidatos do uazapiGO (variam por versão) — tenta em ordem.
  const tentativas = [
    { ep: "/webhook", corpo },
    { ep: "/instance/updateWebhook", corpo },
    { ep: "/webhook", corpo: { ...corpo, action: "add" } },
  ];

  let ultimo = "";
  for (const t of tentativas) {
    try {
      const res = await fetch(`${url}${t.ep}?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify(t.corpo),
      });
      const txt = await res.text();
      ultimo = `${t.ep} → ${res.status} ${txt.slice(0, 140)}`;
      if (res.ok)
        return {
          ok: true,
          detalhe: `Webhook configurado para ${webhookUrl} (via ${t.ep}). Mande um "oi" de outro número para testar.`,
        };
    } catch (err) {
      ultimo = `${t.ep} → falha: ${(err as Error).message}`;
    }
  }
  return {
    ok: false,
    detalhe: `Não consegui configurar automaticamente. Última resposta: ${ultimo}. ` +
      `Dá para configurar no painel da uazapi (botão "Configurar Webhook") com a URL ${webhookUrl} e evento de mensagens.`,
  };
}

// Reconecta a instância JÁ salva (sem criar outra): gera um QR/pair novo para
// revincular o número quando ele cai. Usa o token da instância guardado.
export async function reconectarUazapi(
  imobiliariaId: number
): Promise<ResultadoCriarInstancia> {
  const { url, token } = await credenciaisUazapi(imobiliariaId);
  if (!token)
    return { ok: false, detalhe: "Nenhuma instância salva. Crie uma instância primeiro." };

  // SEGURANÇA: só reconecta se estiver DESCONECTADO. Se já está conectado, não
  // chama /instance/connect (poderia gerar novo QR e derrubar a sessão ativa).
  const st = await statusUazapi(imobiliariaId);
  if (st.conectado)
    return {
      ok: true,
      detalhe: `A instância já está conectada${st.numero ? ` (${st.numero})` : ""} — não gerei QR para não derrubar a sessão. ✅`,
    };

  try {
    const res = await fetch(`${url}/instance/connect?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({}),
    });
    const txt = await res.text();
    let data: unknown = {};
    try {
      data = JSON.parse(txt);
    } catch {
      /* não-JSON */
    }
    if (!res.ok)
      return {
        ok: false,
        detalhe: `A uazapi respondeu ${res.status} ao reconectar: ${txt.slice(0, 160)}. ` +
          `Se a instância foi apagada (servidor free apaga em 1h), crie uma nova.`,
      };
    // já conectado?
    const estado = String(
      extrai(data, ["status", "state", "connectionStatus"]) ?? ""
    ).toLowerCase();
    if (estado.includes("connect") && !estado.includes("dis"))
      return { ok: true, detalhe: "A instância já está conectada. ✅" };

    let qr = extrai(data, ["qrcode", "qr", "base64", "qrCode"]);
    const paircode = extrai(data, ["paircode", "pairingCode"]);
    if (qr && !qr.startsWith("data:") && qr.length > 100) qr = `data:image/png;base64,${qr}`;
    return {
      ok: true,
      detalhe: qr
        ? "Escaneie o QR Code abaixo com o WhatsApp (Aparelhos conectados) para reconectar o número."
        : paircode
          ? `Use o código de pareamento no WhatsApp: ${paircode}`
          : "Pedido de reconexão enviado. Clique em Verificar conexão em instantes.",
      qrcode: qr,
      paircode,
    };
  } catch (err) {
    return { ok: false, detalhe: `Falha ao reconectar em ${url}: ${(err as Error).message}` };
  }
}
