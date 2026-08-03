import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processarMensagem } from "@/lib/conversas";
import { getSessao } from "@/lib/sessao";
import type { AgenteIA, PerfilConversa } from "@prisma/client";

export const maxDuration = 60; // os agentes podem encadear várias ferramentas

// Painel de atendimento: envia a mensagem do cliente para o agente de IA
// correto e devolve a conversa atualizada. No produto, o mesmo motor é
// acionado pelo webhook do WhatsApp.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    agente?: AgenteIA;
    pessoaId?: number;
    perfil?: PerfilConversa;
    contatoNome?: string;
    contatoTelefone?: string;
    mensagem: string;
  };
  const agente = body.agente ?? "ADMINISTRACAO";
  const mensagem = body.mensagem?.trim();
  if (!mensagem) {
    return NextResponse.json({ error: "mensagem obrigatória" }, { status: 400 });
  }

  const sessao = await getSessao();
  if (!sessao) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const imobiliariaId = sessao.imobiliaria.id;

  // O agente vem do corpo da requisição: não se confia nele. Esconder a aba não
  // impede um POST manual — a checagem do plano tem de estar AQUI.
  const { agentesAtivos } = await import("@/lib/planos");
  const disponiveis = agentesAtivos(sessao.imobiliaria.modulos, sessao.imobiliaria.addons);
  if (!disponiveis.includes(agente as (typeof disponiveis)[number])) {
    return NextResponse.json(
      { error: `O agente ${agente} não faz parte do seu plano.` },
      { status: 403 }
    );
  }

  let conversa;
  if (agente === "ADMINISTRACAO") {
    if (!body.pessoaId || !body.perfil) {
      return NextResponse.json({ error: "pessoaId e perfil obrigatórios" }, { status: 400 });
    }
    // garante que a pessoa é do tenant do usuário logado
    const pessoa = await prisma.pessoa.findFirst({ where: { id: body.pessoaId, imobiliariaId } });
    if (!pessoa) return NextResponse.json({ error: "pessoa não encontrada" }, { status: 404 });
    conversa = await prisma.conversa.upsert({
      where: { pessoaId_perfil: { pessoaId: body.pessoaId, perfil: body.perfil } },
      create: { imobiliariaId, agente, pessoaId: body.pessoaId, perfil: body.perfil },
      update: {},
    });
  } else {
    const telefone = body.contatoTelefone?.trim();
    if (!telefone) {
      return NextResponse.json({ error: "contatoTelefone obrigatório" }, { status: 400 });
    }
    // UMA conversa por contato que SEGUE a IA atual (como no WhatsApp): continua
    // a conversa mais recente deste telefone (qualquer área), para não perder o
    // histórico quando a IA muda de área. Só cria se ainda não existir.
    const existente = await prisma.conversa.findFirst({
      where: { imobiliariaId, contatoTelefone: telefone },
      orderBy: { atualizadaEm: "desc" },
    });
    // Contato NOVO começa na RECEPÇÃO (triagem), igual ao WhatsApp real: assim a
    // IA qualifica e encaminha, e o painel segue sozinho para a área certa. A
    // Ajuda Corretor é acesso direto (não passa por triagem), então respeita a aba.
    const agenteInicial = agente === "AJUDA_CORRETOR" ? "AJUDA_CORRETOR" : "RECEPCAO";
    conversa = existente
      ? await prisma.conversa.update({
          where: { id: existente.id },
          data: { ...(body.contatoNome ? { contatoNome: body.contatoNome } : {}) },
        })
      : await prisma.conversa.create({
          data: { imobiliariaId, agente: agenteInicial, contatoTelefone: telefone, contatoNome: body.contatoNome ?? null },
        });
  }

  // Handoff humano (#8): se a equipe assumiu esta conversa, a IA fica quieta
  // também aqui no painel — registra a mensagem do cliente e NÃO roda o agente.
  if (conversa.iaPausada) {
    await prisma.mensagem.create({ data: { conversaId: conversa.id, autor: "CLIENTE", texto: mensagem } });
  } else {
    await processarMensagem(conversa, mensagem);
  }

  // A IA pode ter mudado a área (direcionar_atendimento) — devolve a atual para
  // o painel seguir a conversa até a aba certa.
  const atual = await prisma.conversa.findUnique({
    where: { id: conversa.id },
    select: { agente: true, iaPausada: true },
  });
  const mensagens = await prisma.mensagem.findMany({
    where: { conversaId: conversa.id },
    orderBy: { criadaEm: "asc" },
    select: MSG_SELECT,
  });

  return NextResponse.json({
    conversaId: conversa.id,
    agente: atual?.agente ?? conversa.agente,
    iaPausada: atual?.iaPausada ?? false,
    mensagens: mensagens.map(comFlagAudio),
  });
}

// Campos leves da mensagem para o painel — NUNCA os bytes do áudio (audioDados),
// que são servidos sob demanda por /api/mensagem-audio/[id]. Expomos só um flag.
const MSG_SELECT = { id: true, autor: true, texto: true, criadaEm: true, audioMime: true } as const;
function comFlagAudio<T extends { audioMime: string | null }>(m: T) {
  const { audioMime, ...resto } = m;
  return { ...resto, audio: Boolean(audioMime) };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const agente = (p.get("agente") ?? "ADMINISTRACAO") as AgenteIA;

  const sessao = await getSessao();
  if (!sessao) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const imobiliariaId = sessao.imobiliaria.id;

  // O agente vem do corpo da requisição: não se confia nele. Esconder a aba não
  // impede um POST manual — a checagem do plano tem de estar AQUI.
  const { agentesAtivos } = await import("@/lib/planos");
  const disponiveis = agentesAtivos(sessao.imobiliaria.modulos, sessao.imobiliaria.addons);
  if (!disponiveis.includes(agente as (typeof disponiveis)[number])) {
    return NextResponse.json(
      { error: `O agente ${agente} não faz parte do seu plano.` },
      { status: 403 }
    );
  }

  let conversa = null;
  if (agente === "ADMINISTRACAO") {
    const pessoaId = Number(p.get("pessoaId"));
    const perfil = p.get("perfil") as PerfilConversa;
    if (!pessoaId || !perfil) {
      return NextResponse.json({ error: "parâmetros inválidos" }, { status: 400 });
    }
    conversa = await prisma.conversa.findFirst({
      where: { pessoaId, perfil, imobiliariaId },
      include: { mensagens: { orderBy: { criadaEm: "asc" }, select: MSG_SELECT } },
    });
  } else {
    const telefone = p.get("contatoTelefone");
    if (!telefone) {
      return NextResponse.json({ error: "parâmetros inválidos" }, { status: 400 });
    }
    // conversa mais recente deste contato, independente da área (segue a IA)
    conversa = await prisma.conversa.findFirst({
      where: { imobiliariaId, contatoTelefone: telefone },
      orderBy: { atualizadaEm: "desc" },
      include: { mensagens: { orderBy: { criadaEm: "asc" }, select: MSG_SELECT } },
    });
  }
  return NextResponse.json({
    conversaId: conversa?.id ?? null,
    agente: conversa?.agente,
    iaPausada: conversa?.iaPausada ?? false,
    mensagens: (conversa?.mensagens ?? []).map(comFlagAudio),
  });
}
