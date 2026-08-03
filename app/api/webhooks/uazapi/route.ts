import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { roteadorWhatsApp } from "@/lib/conversas";
import { enviarWhatsApp, dividirEmBolhas, baixarMidiaUazapi, enviarPresenca } from "@/lib/whatsapp";

export const maxDuration = 60; // os agentes podem encadear várias ferramentas
export const dynamic = "force-dynamic";

// Comparação de segredos em tempo constante (roda no Node runtime).
function segredosBatem(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Rate limit por imobiliária: janela de 1 minuto, contagem durável (WebhookRate).
// Sem isso, um loop de mensagens da uazapi consome a conta da Anthropic.
async function rateLimitExcedido(imobiliariaId: number, limite = 60): Promise<boolean> {
  const agora = Date.now();
  const janela = new Date(Math.floor(agora / 60000) * 60000);
  try {
    const r = await prisma.webhookRate.upsert({
      where: { imobiliariaId_janela: { imobiliariaId, janela } },
      create: { imobiliariaId, janela, contagem: 1 },
      update: { contagem: { increment: 1 } },
    });
    // limpeza best-effort de janelas antigas (não bloqueia o fluxo)
    prisma.webhookRate
      .deleteMany({ where: { janela: { lt: new Date(agora - 5 * 60000) } } })
      .catch(() => {});
    return r.contagem > limite;
  } catch {
    return false; // nunca bloqueia o atendimento por erro no limiter
  }
}

// Monta o payload de mídia de áudio de uma Mensagem: em produção sobe para o
// Vercel Blob (audioUrl); em dev sem Blob, guarda os bytes (audioDados).
async function dadosAudio(bytes: Buffer, mime: string, seed: string) {
  const { salvarAudio } = await import("@/lib/storage");
  const r = await salvarAudio(bytes, mime, seed).catch(() => null);
  if (!r) return {};
  if (r.url) return { audioUrl: r.url, audioMime: r.mime };
  if (r.dados) return { audioDados: new Uint8Array(r.dados), audioMime: r.mime };
  return {};
}

// Log mínimo (sem corpo) para requisições que falharam autenticação — não
// gravamos o payload de quem não passou pelo segredo do webhook.
async function registrarMinimo(resultado: string) {
  try {
    await prisma.webhookLog.create({
      data: { corpo: "", resultado: resultado.slice(0, 200) },
    });
  } catch {
    /* diagnóstico não pode derrubar o handler */
  }
}

// Webhook da uazapi (https://docs.uazapi.com) — configure a URL
// https://SEU-APP/api/webhooks/uazapi na instância, evento de mensagens.
//
// TUDO que chega é registrado em WebhookLog (visível em Configurações →
// diagnóstico), inclusive o que é ignorado ou dá erro — assim dá para ver
// exatamente o que a uazapi envia. O handler nunca lança: sempre responde 200.

async function registrar(dados: {
  corpo: unknown;
  resultado: string;
  imobiliariaId?: number | null;
  telefone?: string | null;
}) {
  try {
    await prisma.webhookLog.create({
      data: {
        corpo: JSON.stringify(dados.corpo)?.slice(0, 8000) ?? "",
        resultado: dados.resultado.slice(0, 200),
        imobiliariaId: dados.imobiliariaId ?? null,
        telefone: dados.telefone ?? null,
      },
    });
    // Retenção POR IMOBILIÁRIA (últimos ~40 de cada tenant) — antes era global,
    // então uma imobiliária movimentada apagava o diagnóstico das outras.
    const escopo =
      dados.imobiliariaId != null ? { imobiliariaId: dados.imobiliariaId } : { imobiliariaId: null };
    const antigos = await prisma.webhookLog.findMany({
      where: escopo,
      orderBy: { recebidoEm: "desc" },
      skip: 40,
      select: { id: true },
    });
    if (antigos.length)
      await prisma.webhookLog.deleteMany({ where: { id: { in: antigos.map((a) => a.id) } } });
  } catch (e) {
    console.error("webhookLog falhou:", e);
  }
}

export async function POST(req: NextRequest) {
  // 1) TAMANHO: rejeita payloads gigantes antes de ler/parsear o corpo.
  const tamanho = Number(req.headers.get("content-length") ?? 0);
  if (tamanho > 256 * 1024) {
    return NextResponse.json({ ok: false, ignorado: "payload muito grande" }, { status: 413 });
  }

  // 2) AUTENTICAÇÃO DO WEBHOOK.
  // Estratégia: a uazapi NÃO documenta assinatura HMAC do corpo no webhook — ela
  // entrega apenas o token da instância. Por isso a autenticação usa DUAS camadas:
  //   (a) um SEGREDO COMPARTILHADO carregado na URL do webhook (?s=<segredo>),
  //       comparado em tempo constante contra UAZAPI_WEBHOOK_SECRET; e
  //   (b) o TOKEN DA INSTÂNCIA (verificado mais abaixo, contra o tenant).
  // Quando UAZAPI_WEBHOOK_SECRET está definido, uma requisição sem o segredo é
  // rejeitada com 401 SEM processar e SEM gravar o corpo — impede que qualquer um
  // dispare os agentes de IA ou envie WhatsApp pela conta do tenant.
  const segredoConfig = process.env.UAZAPI_WEBHOOK_SECRET;
  let autenticadoPorSegredo = false;
  if (segredoConfig) {
    const apresentado =
      req.nextUrl.searchParams.get("s") ?? req.headers.get("x-webhook-secret") ?? "";
    if (!apresentado || !segredosBatem(apresentado, segredoConfig)) {
      await registrarMinimo("ignorado: segredo do webhook ausente/invalido (401)");
      return NextResponse.json({ error: "não autorizado" }, { status: 401 });
    }
    autenticadoPorSegredo = true;
  }

  const body = await req.json().catch(() => ({}));

  try {
    // A mensagem pode vir em body.message, body.data.message, body.data ou raiz.
    // Alguns servidores mandam uma lista de mensagens.
    const bruto = body?.message ?? body?.data?.message ?? body?.messages ?? body?.data ?? body ?? {};
    const m = Array.isArray(bruto) ? bruto[0] ?? {} : bruto;

    const evento = String(body?.EventType ?? body?.event ?? body?.type ?? "").toLowerCase();

    const fromMe: boolean = Boolean(m.fromMe ?? m.key?.fromMe ?? m.messageInfo?.fromMe ?? false);
    const chatid: string = String(
      m.chatid ?? m.chatId ?? m.key?.remoteJid ?? m.from ?? m.jid ?? m.remoteJid ?? ""
    );
    const ehGrupo = chatid.includes("@g.us") || Boolean(m.isGroup);

    // Texto em muitas variações de formato/versão
    let texto: string | undefined =
      (typeof m.text === "string" && m.text) ||
      (typeof m.body === "string" && m.body) ||
      (typeof m.message === "string" && m.message) ||
      (typeof m.content === "string" && m.content) ||
      (typeof m.caption === "string" && m.caption) ||
      m.text?.message ||
      m.content?.conversation ||
      m.message?.conversation ||
      m.message?.text ||
      m.message?.extendedTextMessage?.text ||
      m.msgContent?.conversation ||
      m.messageInfo?.text ||
      undefined;

    // Mídia recebida (foto/documento/áudio).
    const tipoMsg = String(m.messageType ?? m.type ?? m.mediaType ?? body?.messageType ?? "").toLowerCase();
    const mediaUrl: string | undefined =
      m.mediaUrl ??
      m.image?.url ??
      m.document?.url ??
      m.video?.url ??
      m.audio?.url ??
      m.file?.url ??
      (typeof m.file === "string" && /^https?:\/\//.test(m.file) ? m.file : undefined) ??
      m.content?.url ??
      m.message?.imageMessage?.url ??
      m.message?.documentMessage?.url ??
      m.message?.audioMessage?.url ??
      undefined;
    // Id da mensagem no WhatsApp — necessário para pedir à uazapi o download
    // (descriptografado) da mídia, ex.: baixar a nota de voz para transcrever.
    const messageId = String(
      m.id ?? m.messageid ?? m.messageId ?? m.key?.id ?? m.message?.key?.id ?? m.messageInfo?.id ?? body?.id ?? body?.data?.id ?? ""
    );
    const ehAudio = /(audio|ptt|voice|voz)/.test(tipoMsg) || Boolean(m.audio || m.message?.audioMessage);
    let ehMidia =
      Boolean(mediaUrl) ||
      /(image|photo|document|file|video|sticker)/.test(tipoMsg) ||
      Boolean(m.image || m.document);

    // Número para RESPONDER. O WhatsApp moderno entrega muitas conversas como
    // @lid (um ID interno de ~15 dígitos, NÃO é o telefone). Se responder pra
    // ele, a uazapi acha que é um GRUPO (JID de grupo é um número longo) e dá
    // "failed to get group members". O telefone real (10–13 dígitos) costuma
    // vir em outro campo do próprio remetente (senderPn/wa_chatid/phone).
    const raw = JSON.stringify(body ?? {});
    const candidatosJid = [chatid, m.sender, m.participant, m.author, m.from, m.key?.remoteJid, m.senderPn]
      .map((x) => (x ? String(x) : ""))
      .filter(Boolean);

    // 1) telefone real num JID @s.whatsapp.net entre os candidatos (o remetente)
    const jidComTelefone = candidatosJid.find((j) => /\d{10,13}@s\.whatsapp\.net/.test(j));
    // 2) telefone real (10–13 díg) num campo explícito do payload — evita pegar
    //    um LID de 15 díg e evita o número da própria instância.
    const pnMatch = raw.match(
      /"(?:senderPn|sender_pn|phone|wa_chatid|numberJid)"\s*:\s*"?\+?(\d{10,13})(?:@s\.whatsapp\.net)?/i
    );
    const jidBruto = candidatosJid[0] ?? "";
    const lidDigitos = jidBruto.split("@")[0].split(":")[0].replace(/\D/g, "");

    const telefoneReal =
      jidComTelefone?.match(/(\d{10,13})@s\.whatsapp\.net/)?.[1] ?? pnMatch?.[1];

    // É LID quando não achamos telefone real e o identificador é longo/@lid.
    const ehLid = !telefoneReal && (jidBruto.includes("@lid") || lidDigitos.length >= 14);
    const telefone = (telefoneReal ?? lidDigitos).replace(/\D/g, "");

    // Identifica a imobiliária pelo token da instância (payload ou header)
    const instanceToken: string | undefined =
      body?.token ??
      body?.instance?.token ??
      body?.instanceToken ??
      m.token ??
      req.headers.get("token") ??
      undefined;
    // Id da imobiliária carimbado na URL do webhook (?imob=<id>). Como cada
    // instância uazapi é configurada com a sua própria URL (ver "configurar-
    // webhook"), este é o identificador PRIMÁRIO e mais confiável do tenant —
    // funciona mesmo com vários números/imobiliárias no mesmo servidor uazapi.
    const imobParam = Number(req.nextUrl.searchParams.get("imob"));
    // Identifica a imobiliária APENAS por: 1) ?imob= da URL (primário); 2) token
    // da instância no payload. Os fallbacks antigos ("primeira com token" e
    // "primeira cadastrada") foram REMOVIDOS: eram vazamento entre clientes —
    // mensagem que não casava com nenhum tenant caía na conta de outro. Sem
    // certeza do tenant, NÃO processamos.
    const imobiliaria =
      (imobParam
        ? await prisma.imobiliaria.findUnique({ where: { id: imobParam } })
        : null) ??
      (instanceToken
        ? await prisma.imobiliaria.findUnique({ where: { uazapiToken: instanceToken } })
        : null);

    if (!imobiliaria) {
      await registrar({ corpo: body, resultado: "ignorado: tenant não identificado", telefone });
      return NextResponse.json({ ok: true, ignorado: "tenant não identificado" });
    }

    // 2ª camada: TOKEN DA INSTÂNCIA. Como o tenant é escolhido por ?imob=<id> —
    // um inteiro sequencial que quem chama controla —, toda requisição precisa
    // provar autenticidade de ALGUMA forma; senão qualquer POST anônimo escreve
    // dentro do tenant alheio e faz a IA dele responder para o número do
    // atacante. Vale como prova: (a) o segredo na URL, já validado acima; ou
    // (b) o token da instância batendo com o esperado para ESTE tenant.
    //
    // O token esperado cai no UAZAPI_TOKEN global quando a imobiliária não tem
    // instância própria (ver credenciaisUazapi) — antes, uazapiToken nulo pulava
    // a verificação inteira, que era exatamente o furo.
    if (!autenticadoPorSegredo) {
      const tokenEsperado = imobiliaria.uazapiToken ?? process.env.UAZAPI_TOKEN ?? null;
      const ok =
        !!tokenEsperado && !!instanceToken && segredosBatem(instanceToken, tokenEsperado);
      if (!ok) {
        await registrar({
          corpo: body,
          resultado: tokenEsperado
            ? "ignorado: token da instância não confere (webhook não autenticado)"
            : "ignorado: webhook não autenticado (sem UAZAPI_WEBHOOK_SECRET e sem token de instância para este tenant)",
          imobiliariaId: imobiliaria.id,
          telefone,
        });
        return NextResponse.json({ ok: true, ignorado: "token" });
      }
    }

    // Rate limit por tenant (60 msg/min): protege a conta da Anthropic contra
    // loops de mensagens. Excedeu → ignora e registra.
    if (await rateLimitExcedido(imobiliaria.id)) {
      await registrar({ corpo: body, resultado: "ignorado: rate limit (60/min) excedido", imobiliariaId: imobiliaria.id, telefone });
      return NextResponse.json({ ok: true, ignorado: "rate limit" });
    }

    // Grupos: ignora sempre.
    if (ehGrupo) {
      await registrar({ corpo: body, resultado: `ignorado: grupo (evento ${evento || "?"})`, imobiliariaId: imobiliaria?.id, telefone });
      return NextResponse.json({ ok: true, ignorado: "grupo" });
    }
    // fromMe = mensagem saindo do próprio número do negócio. Pode ser (a) eco da
    // resposta que a NOSSA IA/equipe mandou via API → ignorar; ou (b) um atendente
    // humano digitando pelo celular → ASSUME a conversa (a IA fica quieta só nela).
    if (fromMe) {
      let resultado = "ignorado: fromMe (eco do sistema)";
      try {
        if (imobiliaria && telefone && texto?.trim()) {
          const conversa = await prisma.conversa.findFirst({
            where: { imobiliariaId: imobiliaria.id, contatoTelefone: telefone },
            orderBy: { atualizadaEm: "desc" },
            select: { id: true, iaPausada: true },
          });
          if (conversa) {
            const { ehEcoDoSistema, assumirPorMensagemDoNegocio } = await import("@/lib/atendimento-humano");
            if (!(await ehEcoDoSistema(conversa.id, texto))) {
              await assumirPorMensagemDoNegocio(conversa.id, texto.trim());
              resultado = "equipe assumiu pelo WhatsApp — IA pausada nesta conversa";
            }
          }
        }
      } catch (e) {
        console.error("fromMe handling:", e);
      }
      await registrar({ corpo: body, resultado, imobiliariaId: imobiliaria.id, telefone });
      return NextResponse.json({ ok: true, ignorado: "fromMe" });
    }

    // Áudio recebido (nota de voz): baixa os bytes (para guardar/tocar no painel),
    // transcreve pelo ElevenLabs e trata a transcrição como o texto da mensagem —
    // a IA responde ao que foi falado. Áudio NUNCA vira "documento" no GED.
    let audioClienteBytes: Buffer | null = null;
    let audioClienteMime = "audio/ogg";
    if (ehAudio && telefone) {
      ehMidia = false;
      if (!texto?.trim()) {
        try {
          // A URL de mídia do WhatsApp vem criptografada (E2E): não dá pra baixar
          // direto. Pede à uazapi o binário já descriptografado (pelo id da msg);
          // se não rolar, tenta a URL direta como último recurso.
          const baixado = messageId ? await baixarMidiaUazapi(messageId, imobiliaria.id) : null;
          if (baixado) {
            audioClienteBytes = baixado.buffer;
            audioClienteMime = baixado.mime;
          } else if (mediaUrl) {
            const resp = await fetch(mediaUrl, { signal: AbortSignal.timeout(15000) });
            if (resp.ok) {
              audioClienteBytes = Buffer.from(await resp.arrayBuffer());
              audioClienteMime = resp.headers.get("content-type") || "audio/ogg";
            }
          }
          // Transcreve a nota de voz e trata como o texto da mensagem: a IA
          // "escuta" o que foi falado e responde por cima da transcrição.
          // 1º ElevenLabs (se a imobiliária tem chave); 2º o serviço próprio de
          // transcrição (whisper local, sem chave) como fallback gratuito.
          if (audioClienteBytes && imobiliaria.elevenlabsApiKey) {
            const { transcreverAudio } = await import("@/lib/voz");
            const transcricao = await transcreverAudio(audioClienteBytes, imobiliaria.elevenlabsApiKey, audioClienteMime);
            if (transcricao) texto = transcricao;
          }
          if (audioClienteBytes && !texto?.trim()) {
            const { transcreverPeloServico } = await import("@/lib/comparaveis");
            const t = await transcreverPeloServico(audioClienteBytes, audioClienteMime);
            if (t) texto = t;
          }
        } catch (e) {
          console.error("download/transcrição de áudio:", e);
        }
      }
      // Não deu para transcrever (sem chave/STT ou falhou): não deixa o cliente no
      // vácuo — guarda a nota de voz na conversa e responde pedindo por escrito.
      if (!texto?.trim()) {
        try {
          const conv = await prisma.conversa.findFirst({
            where: { imobiliariaId: imobiliaria.id, contatoTelefone: telefone },
            orderBy: { atualizadaEm: "desc" },
            select: { id: true },
          });
          if (conv) {
            await prisma.mensagem.create({
              data: {
                conversaId: conv.id,
                autor: "CLIENTE",
                texto: "[nota de voz]",
                ...(audioClienteBytes ? await dadosAudio(audioClienteBytes, audioClienteMime, `cli-${conv.id}`) : {}),
              },
            });
            await prisma.conversa.update({ where: { id: conv.id }, data: { atualizadaEm: new Date() } });
          }
        } catch (e) {
          console.error("guardar nota de voz:", e);
        }
        const aviso = "Recebi seu áudio! Mas não consegui ouvir agora. Pode me mandar por escrito?";
        // Destino de resposta (mesma lógica do fluxo principal, calculada inline
        // porque os `destinos` só são montados mais abaixo): telefone real, senão
        // o JID @lid exato de um número não salvo, senão o telefone cru.
        const alvoAudio: string[] = [];
        if (telefoneReal) alvoAudio.push(telefoneReal);
        if (ehLid) alvoAudio.push(jidBruto.includes("@lid") ? jidBruto : `${lidDigitos}@lid`);
        if (!alvoAudio.length) alvoAudio.push(telefone);
        await enviarWhatsApp(telefone, aviso, imobiliaria.id, alvoAudio).catch(() => {});
        await registrar({ corpo: body, resultado: "áudio recebido sem transcrição — pedido texto ao cliente", imobiliariaId: imobiliaria.id, telefone });
        return NextResponse.json({ ok: true, audio: "sem transcricao" });
      }
    }

    // Mídia recebida (foto/documento): guarda no GED vinculada ao contato (#2).
    // Se veio só a mídia (sem legenda), registra e encerra; se veio legenda, a
    // salva e segue pro atendimento normal com o texto da legenda.
    if (ehMidia && telefone) {
      try {
        const { salvarMidiaRecebida } = await import("@/lib/midia-recebida");
        const rotulo = await salvarMidiaRecebida({
          imobiliariaId: imobiliaria.id,
          telefone,
          mediaUrl,
          tipoMsg,
          legenda: texto,
        });
        if (!texto?.trim()) {
          // registra na conversa mais recente do contato que chegou uma mídia
          const conversa = await prisma.conversa.findFirst({
            where: { imobiliariaId: imobiliaria.id, contatoTelefone: telefone },
            orderBy: { atualizadaEm: "desc" },
            select: { id: true },
          });
          if (conversa) {
            await prisma.mensagem.create({
              data: { conversaId: conversa.id, autor: "CLIENTE", texto: `[cliente enviou ${rotulo === "documento" ? "um documento" : "uma foto"}]` },
            });
            // criar mensagem filha não altera atualizadaEm (@updatedAt) — força o
            // toque para a lateral do painel ordenar certo e o resgate de 24h contar.
            await prisma.conversa.update({ where: { id: conversa.id }, data: { atualizadaEm: new Date() } });
          }
          await registrar({ corpo: body, resultado: `mídia recebida (${rotulo}) salva no GED`, imobiliariaId: imobiliaria.id, telefone });
          return NextResponse.json({ ok: true, midia: rotulo });
        }
      } catch (e) {
        console.error("mídia recebida:", e);
      }
    }

    if (!texto?.trim() || !telefone) {
      await registrar({ corpo: body, resultado: `ignorado: sem texto/remetente (evento ${evento || "?"})`, imobiliariaId: imobiliaria?.id, telefone });
      return NextResponse.json({ ok: true, ignorado: "sem texto ou remetente" });
    }

    const nome: string | null = m.senderName ?? m.pushName ?? m.notifyName ?? body?.senderName ?? null;

    // Destinos em ordem de preferência:
    //  - telefone real → manda pelo número (caminho do "Enviar teste").
    //  - número NÃO SALVO chega como LID → responde para o JID @lid EXATO
    //    (a uazapi resolve o chat); nunca o número cru de 15 dígitos, que ela
    //    trataria como grupo.
    const destinos: string[] = [];
    if (telefoneReal) destinos.push(telefoneReal);
    if (ehLid) destinos.push(jidBruto.includes("@lid") ? jidBruto : `${lidDigitos}@lid`);
    if (!destinos.length) destinos.push(telefone);
    const destino = destinos[0];

    // "Digitando...": mostra a presença ao cliente enquanto a IA pensa/responde
    // (a geração pode levar alguns segundos). Best-effort, não bloqueia o fluxo.
    await enviarPresenca(telefone, "composing", imobiliaria.id, destinos, 8000).catch(() => {});

    // A decisão de mandar áudio vem ANTES de a IA escrever. Sorteada depois,
    // a resposta chegava pronta com bullet, link e "R$ 189.900,00" para serem
    // narrados — nenhum pipeline de fala conserta estrutura de texto escrito.
    // Sabendo antes, a IA escreve FALANDO.
    const { sorteioDeAudio } = await import("@/lib/voz");
    const querAudio = sorteioDeAudio({
      pct: imobiliaria.audioPct,
      temChave: !!imobiliaria.minimaxApiKey,
    });

    // Roteia e processa (guarda o destino na conversa para a IA enviar fotos).
    const { resposta, agente, pausada, agrupada, conversaId, soTexto } = await roteadorWhatsApp({
      imobiliaria,
      telefone,
      texto: texto.trim(),
      nome,
      jid: destino,
      paraAudio: querAudio,
    });

    // Nota de voz do cliente: anexa os bytes à mensagem CLIENTE recém-criada
    // (a que carrega a transcrição), para o painel mostrar o player junto do texto.
    if (conversaId && audioClienteBytes) {
      try {
        const ultimaCliente = await prisma.mensagem.findFirst({
          where: { conversaId, autor: "CLIENTE" },
          orderBy: { criadaEm: "desc" },
          select: { id: true },
        });
        if (ultimaCliente)
          await prisma.mensagem.update({
            where: { id: ultimaCliente.id },
            data: await dadosAudio(audioClienteBytes, audioClienteMime, `cli-${ultimaCliente.id}`),
          });
      } catch (e) {
        console.error("anexar áudio do cliente:", e);
      }
    }

    // Mensagem picada: entrou no turno de uma invocação posterior, que responde
    // por todas de uma vez. Sair calado aqui é o que evita as três respostas
    // atropeladas dizendo quase a mesma coisa.
    if (agrupada) {
      await registrar({ corpo: body, resultado: `${agente} · mensagem agrupada no turno seguinte`, imobiliariaId: imobiliaria.id, telefone });
      return NextResponse.json({ ok: true, agente, agrupada: true });
    }

    // Handoff humano (#8): equipe assumiu esta conversa — a IA registrou a
    // mensagem do cliente mas NÃO responde. A equipe cuida pelo painel/WhatsApp.
    if (pausada) {
      await registrar({ corpo: body, resultado: `${agente} · IA pausada (equipe assumiu) — sem resposta automática`, imobiliariaId: imobiliaria.id, telefone });
      return NextResponse.json({ ok: true, agente, pausada: true });
    }

    // Voz: parte das respostas (padrão 40%) vira ÁUDIO, seguindo o contexto —
    // conteúdo sensível (PIX, link, textão) sempre fica em texto. Se decide áudio
    // e o TTS sai, manda a nota de voz e não repete em texto.
    let envio = { enviado: false, provedor: "uazapi", detalhe: "sem conteúdo" } as Awaited<
      ReturnType<typeof enviarWhatsApp>
    >;
    let saiuAudio = false;
    // POR QUE não saiu áudio. Vai para o log de auditoria: a falha aqui é
    // silenciosa por natureza (cai para texto e o cliente nem percebe), e sem
    // registrar o motivo a investigação vira adivinhação — foi o que aconteceu
    // com um voice_id inválido guardado no iasConfig, que derrubava TODO áudio
    // da conversa enquanto o preview da tela continuava funcionando.
    let motivoAudio = "";
    // A FALA é da MiniMax; a transcrição do que o cliente manda continua no
    // ElevenLabs. Sem chave da MiniMax, a resposta sai em texto.
    // O guarda da chave fica aqui fora para o TypeScript enxergar que
    // minimaxApiKey não é null lá dentro; deveMandarAudio confere de novo.
    if (!imobiliaria.minimaxApiKey) motivoAudio = "sem chave MiniMax";
    else if (soTexto) motivoAudio = "conversa em modo só-texto";
    if (imobiliaria.minimaxApiKey) {
      const { limparTagsAudio, gerarAudioDetalhado, textoPodeVirarAudio } = await import(
        "@/lib/voz"
      );
      // O sorteio já foi feito lá em cima. Aqui sobra a rede de segurança:
      // mesmo avisada de que ia virar áudio, a IA pode ter mandado um link — e
      // link não se fala.
      if (querAudio && !soTexto && textoPodeVirarAudio(resposta)) {
        try {
          // "Gravando áudio..." pelo tempo que a gravação REALMENTE levaria.
          // Eram 8 segundos fixos para todo áudio — e isso denuncia a máquina
          // tanto quanto a voz: ninguém leva 8 segundos gravando "tem sim,
          // pode vir ver".
          const { duracaoFalaMs, prosodia } = await import("@/lib/fala");
          const falado = limparTagsAudio(resposta);
          const gravando = duracaoFalaMs(falado, prosodia(falado).speed);
          // Ninguém lê uma mensagem e começa a gravar no mesmo instante: lê,
          // pensa, DEPOIS aperta o botão. Sem essa pausa, o "gravando" nasce
          // junto com a mensagem do cliente e denuncia a automação.
          await new Promise((r) => setTimeout(r, 900 + Math.floor(Math.random() * 1800)));
          await enviarPresenca(telefone, "recording", imobiliaria.id, destinos, gravando).catch(() => {});
          // MESMO caminho do preview da tela de Configurações: sem voz
          // escolhida, o sistema descobre a padrão da conta. Passar um voice_id
          // guardado (o antigo campo por agente) era o que fazia o preview
          // funcionar e a conversa não.
          const r0 = await gerarAudioDetalhado(
            resposta,
            imobiliaria.minimaxApiKey,
            imobiliaria.minimaxVoiceId,
            imobiliaria.minimaxGroupId
          );
          const audio = r0.ok ? r0.dados : null;
          if (!r0.ok) motivoAudio = `MiniMax: ${r0.erro}`;
          if (audio) {
            const { enviarWhatsAppAudio } = await import("@/lib/whatsapp");
            // delay curto: reforça o "gravando áudio" logo antes da entrega.
            const r = await enviarWhatsAppAudio(telefone, audio, imobiliaria.id, destinos, 1500);
            if (!r.enviado) motivoAudio = `uazapi recusou o áudio: ${r.detalhe ?? "sem detalhe"}`;
            if (r.enviado) {
              saiuAudio = true;
              envio = { enviado: true, provedor: "uazapi", detalhe: "áudio" };
              // Anexa o MP3 à mensagem IA recém-criada para o painel tocar o áudio.
              if (conversaId) {
                try {
                  const ultimaIA = await prisma.mensagem.findFirst({
                    where: { conversaId, autor: "IA" },
                    orderBy: { criadaEm: "desc" },
                    select: { id: true },
                  });
                  if (ultimaIA)
                    await prisma.mensagem.update({
                      where: { id: ultimaIA.id },
                      data: await dadosAudio(audio, "audio/mpeg", `ia-${ultimaIA.id}`),
                    });
                } catch (e) {
                  console.error("anexar áudio da IA:", e);
                }
              }
            }
          }
        } catch (e) {
          motivoAudio = `exceção ao gerar/enviar áudio: ${e instanceof Error ? e.message : String(e)}`;
          console.error("envio de áudio da IA:", e);
        }
      } else {
        // Não foi nem tentado. Separar "o conteúdo não permite" de "deu azar no
        // sorteio" e de "fora do horário" é o que evita caçar bug onde não tem.
        const pct = imobiliaria.audioPct ?? 40;
        const { dentroDaJanelaDeAudio } = await import("@/lib/prompt-audio");
        motivoAudio =
          pct <= 0
            ? "porcentagem de áudio está em 0"
            : soTexto
              ? "conversa em modo só-texto"
              : !dentroDaJanelaDeAudio(new Date())
                ? "fora da janela de áudio (8h às 21h)"
                : !textoPodeVirarAudio(resposta)
                  ? "conteúdo não vai por voz (link, PIX ou resposta longa)"
                  : `sorteio (configurado ${pct}%)`;
      }
    }

    // Não saiu áudio → envia a resposta em "bolhas" curtas (texto limpo, sem tags).
    if (!saiuAudio) {
      const { limparTagsAudio } = await import("@/lib/voz");
      const bolhas = dividirEmBolhas(limparTagsAudio(resposta));
      for (let i = 0; i < bolhas.length; i++) {
        // delay ~ tempo de digitação da bolha, com uma variação por bolha: duas
        // bolhas seguidas com a MESMA pausa milimétrica é o mesmo tell da voz
        // com velocidade fixa.
        const base = Math.min(3500, Math.max(800, bolhas[i].length * 40));
        const delayDigitando = Math.round(base * (0.85 + ((bolhas[i].length * 7) % 30) / 100));
        // antes das bolhas seguintes, reforça a presença de "digitando".
        if (i > 0) await enviarPresenca(telefone, "composing", imobiliaria.id, destinos, delayDigitando).catch(() => {});
        envio = await enviarWhatsApp(telefone, bolhas[i], imobiliaria.id, destinos, delayDigitando);
        if (!envio.enviado) break; // se uma falha (auth/destino), as próximas também falham
      }
    }

    // registra também se a RESPOSTA saiu para o WhatsApp (ou por que falhou).
    // "demo" significa que não há credencial uazapi/Meta ativa: a IA respondeu,
    // mas NADA foi enviado ao WhatsApp — mostramos isso claramente.
    // Diagnóstico: todos os JIDs presentes no payload (revela se há telefone
    // real @s.whatsapp.net escondido em algum campo, ou só LID).
    const jidsNoPayload = Array.from(
      new Set(raw.match(/[\w.:+-]+@(?:s\.whatsapp\.net|lid|g\.us)/g) ?? [])
    ).slice(0, 8).join("  ");

    // O diagnóstico do ÁUDIO entra no log sempre: quando sai, e principalmente
    // quando NÃO sai. A falha aqui é silenciosa de propósito (cai para texto,
    // o cliente não vê erro) — e sem o motivo registrado ninguém consegue
    // descobrir se foi sorteio, conteúdo, chave, voz ou a uazapi.
    const audio = saiuAudio ? " · áudio ✓" : ` · áudio não: ${motivoAudio || "motivo não registrado"}`;
    const resultado = !envio.enviado
      ? `processado: ${agente} · FALHA (destino=${destino ?? telefone}) ${envio.detalhe ?? "erro"}${audio} · JIDs=[${jidsNoPayload || "nenhum"}]`
      : envio.provedor === "demo"
        ? `processado: ${agente} · resposta NÃO enviada (modo demo — sem credencial uazapi ativa para esta imobiliária)`
        : `processado: ${agente} · resposta enviada ✓ (${envio.provedor} · ${destino ?? telefone})${audio}`;
    await registrar({ corpo: body, resultado, imobiliariaId: imobiliaria.id, telefone });
    return NextResponse.json({ ok: true, agente, enviado: envio.enviado });
  } catch (err) {
    await registrar({ corpo: body, resultado: `erro: ${(err as Error).message}` });
    console.error("webhook uazapi: erro", err);
    // responde 200 para a uazapi não entrar em retry-storm
    return NextResponse.json({ ok: false, erro: "ver WebhookLog" });
  }
}
