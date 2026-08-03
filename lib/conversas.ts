// Processamento unificado de mensagens recebidas (painel e WhatsApp):
// registra a mensagem, executa o agente de IA, registra a resposta e
// mantém a memória de longo prazo do contato.

import type { AgenteIA, Conversa, Imobiliaria, PerfilConversa } from "@prisma/client";
import { prisma } from "@/lib/db";
import { executarAgente } from "@/lib/agentes";
import { pessoaPorTelefone } from "@/lib/whatsapp";

// Roteador de mensagens de WhatsApp recebidas (usado pelos webhooks uazapi e
// Meta): decide o agente, garante a conversa e processa a mensagem.
//  - número da carteira (locatário/proprietário) → IA de ADMINISTRAÇÃO
//  - desconhecido falando de anunciar o próprio imóvel → IA de CAPTAÇÃO
//  - demais desconhecidos → IA de VENDAS
export async function roteadorWhatsApp(params: {
  imobiliaria: Imobiliaria;
  telefone: string;
  texto: string;
  nome?: string | null;
  // JID exato para responder (ex.: ...@s.whatsapp.net ou ...@lid). Guardado na
  // conversa para a IA enviar texto e FOTOS ao destino certo.
  jid?: string | null;
  // A resposta JÁ foi sorteada para virar áudio. Chega aqui para a IA escrever
  // FALANDO — decidir depois de escrever produzia texto com bullet e link sendo
  // narrado em voz alta.
  paraAudio?: boolean;
}): Promise<{
  resposta: string;
  agente: AgenteIA;
  pausada?: boolean;
  // A mensagem foi absorvida pelo turno de uma invocação posterior: esta aqui
  // não responde (é o agrupamento das mensagens picadas).
  agrupada?: boolean;
  conversaId?: number;
  // Resposta que NUNCA pode virar nota de voz. Recibo de operação destrutiva
  // (/reset) tem de ficar legível e conferível, não sussurrado em áudio.
  soTexto?: boolean;
}> {
  const { imobiliaria, telefone, texto, nome, jid, paraAudio } = params;

  // O lead respondeu: reinicia o relógio da cadência de follow-up (#7) — a Carol
  // só reengaja após novo silêncio, nunca por cima de uma conversa quente.
  await import("@/lib/followup")
    .then((m) => m.resetarCadencia(telefone, imobiliaria.id))
    .catch(() => {});

  // Corretor da equipe? Mensagem vinda de um número de corretor cadastrado é
  // atendida pela IA "Ajuda Corretor" (consulta interna da carteira), não pelo
  // fluxo de cliente. Comparamos pelos últimos 8 dígitos (ignora DDI/DDD/format).
  const sufixoTel = telefone.replace(/\D/g, "").slice(-8);
  const ehCorretor =
    sufixoTel.length >= 8 &&
    (imobiliaria.telefonesCorretores ?? "")
      .split(/[\n,;]+/)
      .map((t) => t.replace(/\D/g, ""))
      .some((t) => t.length >= 8 && t.slice(-8) === sufixoTel);

  const pessoa = ehCorretor ? null : await pessoaPorTelefone(telefone, imobiliaria.id);
  let conversa: Conversa;

  if (ehCorretor) {
    conversa = await prisma.conversa.upsert({
      where: {
        imobiliariaId_contatoTelefone_agente: {
          imobiliariaId: imobiliaria.id,
          contatoTelefone: telefone,
          agente: "AJUDA_CORRETOR",
        },
      },
      create: {
        imobiliariaId: imobiliaria.id,
        agente: "AJUDA_CORRETOR",
        contatoTelefone: telefone,
        contatoNome: nome ?? "Corretor",
        contatoJid: jid ?? null,
      },
      update: { ...(jid ? { contatoJid: jid } : {}) },
    });
  } else if (pessoa) {
    const perfil: PerfilConversa = pessoa.contratos.length > 0 ? "LOCATARIO" : "PROPRIETARIO";
    conversa = await prisma.conversa.upsert({
      where: { pessoaId_perfil: { pessoaId: pessoa.id, perfil } },
      create: {
        imobiliariaId: imobiliaria.id,
        agente: "ADMINISTRACAO",
        pessoaId: pessoa.id,
        perfil,
        contatoTelefone: telefone,
        contatoJid: jid ?? null,
      },
      update: { ...(jid ? { contatoJid: jid } : {}) },
    });
  } else {
    // Continua a conversa mais recente deste contato (qualquer área) — assim o
    // encaminhamento feito pela RECEPÇÃO (que troca o agente) persiste nas
    // próximas mensagens. Se não houver, começa pela RECEPÇÃO (triagem).
    const existente = await prisma.conversa.findFirst({
      where: { imobiliariaId: imobiliaria.id, contatoTelefone: telefone },
      orderBy: { atualizadaEm: "desc" },
    });
    if (existente) {
      conversa = await prisma.conversa.update({
        where: { id: existente.id },
        data: {
          ...(nome ? { contatoNome: nome } : {}),
          ...(jid ? { contatoJid: jid } : {}),
        },
      });
    } else {
      conversa = await prisma.conversa.create({
        data: {
          imobiliariaId: imobiliaria.id,
          agente: "RECEPCAO",
          contatoTelefone: telefone,
          contatoNome: nome ?? null,
          contatoJid: jid ?? null,
        },
      });
    }
  }

  // Handoff humano (#8): se a equipe assumiu ESTA conversa, a IA fica quieta.
  // Registra a mensagem do cliente (para a equipe ver no painel) e não responde.
  if (conversa.iaPausada) {
    await prisma.mensagem.create({ data: { conversaId: conversa.id, autor: "CLIENTE", texto } });
    await prisma.conversa.update({ where: { id: conversa.id }, data: { atualizadaEm: new Date() } });
    return { resposta: "", agente: conversa.agente, pausada: true };
  }

  const { ehComandoReset } = await import("@/lib/reset");
  const eraReset = ehComandoReset(texto);
  // Agrupa só no WhatsApp: é lá que a pessoa manda três mensagens picadas. No
  // simulador do painel, esperar 6 segundos por turno só atrapalharia o ajuste.
  const resposta = await processarMensagem(conversa, texto, {
    agrupar: !eraReset,
    // /reset devolve recibo de operação destrutiva: nunca em áudio.
    paraAudio: paraAudio && !eraReset,
  });
  if (resposta === TURNO_AGRUPADO) {
    return { resposta: "", agente: conversa.agente, agrupada: true };
  }
  const atual = await prisma.conversa.findUnique({ where: { id: conversa.id }, select: { agente: true } });
  // Depois de um /reset a conversa não existe mais: devolver o id faria o
  // webhook procurar mensagem em conversa apagada.
  return {
    resposta,
    agente: atual?.agente ?? conversa.agente,
    conversaId: atual ? conversa.id : undefined,
    soTexto: eraReset,
  };
}

const MANTER_RECENTES = 8; // mensagens recentes que ficam fora do resumo

// Janela de agrupamento. No WhatsApp ninguém escreve um parágrafo: escreve
// "esse ape tem caucao", depois "ou so seguro fianca", depois "?". Sem esperar,
// cada uma dessas vira UM turno da IA — e o cliente recebe três respostas
// atropeladas, dizendo quase a mesma coisa. Foi exatamente o que aconteceu.
//
// 6 segundos: tempo de digitar a frase seguinte, e folgado dentro do
// maxDuration=60 da rota do webhook.
const JANELA_AGRUPAMENTO_MS = 6000;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Marcador de turno absorvido: esta mensagem entrou no turno de uma invocação
// posterior, então esta aqui não responde nada.
export const TURNO_AGRUPADO = "\u0000agrupado";

export async function processarMensagem(
  conversa: Conversa,
  texto: string,
  opcoes: { agrupar?: boolean; paraAudio?: boolean } = {}
): Promise<string> {
  // /reset — apaga o rastro deste contato e responde no WhatsApp o que foi
  // apagado. Fica ANTES de gravar a mensagem: gravar para apagar em seguida
  // só criaria uma linha órfã. Vale no WhatsApp e no simulador do painel.
  const { ehComandoReset, limparDadosDoContato, mensagemDeReset } = await import("@/lib/reset");
  if (ehComandoReset(texto) && conversa.contatoTelefone) {
    const resumo = await limparDadosDoContato(conversa.imobiliariaId, conversa.contatoTelefone);
    await import("@/lib/auditoria").then((m) =>
      m.auditar("RESET_CONTATO", "Conversa", conversa.id, JSON.stringify(resumo), conversa.imobiliariaId)
    );
    return mensagemDeReset(resumo);
  }

  const minha = await prisma.mensagem.create({
    data: { conversaId: conversa.id, autor: "CLIENTE", texto },
    select: { id: true },
  });

  // ── Agrupamento das mensagens picadas ────────────────────────────────────
  // Espera a janela e checa se chegou mensagem mais nova. Se chegou, QUEM
  // CHEGOU DEPOIS responde por todas — esta invocação sai calada. O id é
  // crescente, então a corrida tem sempre um vencedor único.
  if (opcoes.agrupar) {
    await esperar(JANELA_AGRUPAMENTO_MS);
    const maisNova = await prisma.mensagem.findFirst({
      where: { conversaId: conversa.id, autor: "CLIENTE", id: { gt: minha.id } },
      select: { id: true },
    });
    if (maisNova) return TURNO_AGRUPADO;
  }

  // O turno é TUDO que o cliente mandou desde a última resposta da IA, junto.
  const ultimaRespostaIA = await prisma.mensagem.findFirst({
    where: { conversaId: conversa.id, autor: "IA" },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  const doTurno = await prisma.mensagem.findMany({
    where: {
      conversaId: conversa.id,
      autor: "CLIENTE",
      ...(ultimaRespostaIA ? { id: { gt: ultimaRespostaIA.id } } : {}),
    },
    orderBy: { id: "asc" },
    select: { texto: true },
  });
  const mensagemDoTurno = doTurno.length > 0 ? doTurno.map((m) => m.texto).join("\n") : texto;

  // Só as últimas mensagens e SÓ os campos usados — nunca os bytes de áudio
  // (audioDados), que pesam MB à toa. A IA usa as ~40 mais recentes.
  const recentes = await prisma.mensagem.findMany({
    where: { conversaId: conversa.id },
    orderBy: { criadaEm: "desc" },
    take: 60,
    select: { autor: true, texto: true },
  });
  const historico = recentes.reverse();

  const bruta = await executarAgente({
    conversa,
    // Tira do histórico as mensagens que JÁ estão no turno atual — senão a IA
    // as veria duas vezes e responderia como se tivessem sido ditas antes.
    historico: historico
      .slice(0, Math.max(0, historico.length - Math.max(1, doTurno.length)))
      .map((m) => ({ autor: m.autor, texto: m.texto })),
    mensagem: mensagemDoTurno,
    paraAudio: opcoes.paraAudio,
  });

  // Corte mecânico de repetição: a IA quebra a objeção do lead e reemite a
  // resposta que já tinha dado (na mesma mensagem ou ecoando a anterior).
  // Instrução de prompt reduz; isto elimina, porque acontece DEPOIS do modelo.
  const { semRepeticao } = await import("@/lib/repeticao");
  const ultimaIA = [...historico].reverse().find((m) => m.autor === "IA")?.texto ?? null;

  // ÚLTIMA BARREIRA antes de virar mensagem para o cliente: nada de
  // infraestrutura sai daqui (nome de variável de ambiente, "modo demo",
  // cota, plano, nome de fornecedor). O operador fica sabendo pelo log.
  const { paraOCliente } = await import("@/lib/mensagem-segura");
  const resposta = paraOCliente(semRepeticao(bruta, ultimaIA));

  // Guarda o texto LIMPO (sem tags de emoção do áudio) para o painel; o retorno
  // mantém o texto cru (com tags) para o webhook decidir texto vs. voz.
  const { limparTagsAudio } = await import("@/lib/voz");
  await prisma.mensagem.create({
    data: { conversaId: conversa.id, autor: "IA", texto: limparTagsAudio(resposta) },
  });

  // Memória: quando o histórico cresce, resume o que ficou para trás. Usa o
  // total REAL de mensagens (count barato), não o histórico truncado acima.
  const total = await prisma.mensagem.count({ where: { conversaId: conversa.id } });
  await atualizarMemoria(conversa, total).catch((e) =>
    console.error("Erro ao atualizar memória:", e)
  );

  return resposta;
}

// Resume as mensagens antigas (além das últimas MANTER_RECENTES) num texto
// curto que passa a fazer parte do contexto permanente do contato.
async function atualizarMemoria(conversa: Conversa, totalMensagens: number) {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const naoResumidas = totalMensagens - conversa.memoriaMensagens;
  if (naoResumidas < MANTER_RECENTES + 6) return; // ainda não vale a pena

  const paraResumir = await prisma.mensagem.findMany({
    where: { conversaId: conversa.id },
    orderBy: { criadaEm: "asc" },
    skip: conversa.memoriaMensagens,
    take: naoResumidas - MANTER_RECENTES,
    select: { autor: true, texto: true }, // sem bytes de áudio
  });
  if (paraResumir.length === 0) return;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { MODELO } = await import("@/lib/agentes");
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODELO,
    max_tokens: 600,
    system:
      "Você mantém a memória de longo prazo de um contato de uma administradora de imóveis. " +
      "Combine a memória atual com as novas mensagens e devolva APENAS o novo resumo (máx. 150 palavras): " +
      "fatos sobre a pessoa (nome, documentos, preferências), imóveis/valores discutidos, " +
      "combinados e pendências. Sem preâmbulo.",
    messages: [
      {
        role: "user",
        content:
          `Memória atual:\n${conversa.memoria ?? "(vazia)"}\n\nNovas mensagens:\n` +
          paraResumir.map((m) => `${m.autor}: ${m.texto}`).join("\n"),
      },
    ],
  });
  const resumo = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
  if (!resumo) return;

  await prisma.conversa.update({
    where: { id: conversa.id },
    data: {
      memoria: resumo,
      memoriaMensagens: conversa.memoriaMensagens + paraResumir.length,
    },
  });
}
