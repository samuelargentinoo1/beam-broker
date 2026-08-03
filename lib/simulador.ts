"use server";

// Simulador de IA do painel do dono: você faz o papel do cliente e o agente
// segue o curso normal — mesmo prompt, mesmas ferramentas, mesmo modelo. É o
// caminho curto para ajustar a IA sem depender de alguém mandar mensagem real.
//
// O que MUDA em relação ao produto: nenhum WhatsApp sai (lib/simulacao.ts
// bloqueia os três canais) e a conversa nasce marcada como simulacao, ficando
// fora do painel de atendimento do cliente.

import { revalidatePath } from "next/cache";
import type { AgenteIA, PerfilConversa } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirOperador, registrarAcao } from "@/lib/operador";
import { comSimulacao } from "@/lib/simulacao";
import { agentesAtivos } from "@/lib/planos";

// Telefone fictício por conversa de simulação. Precisa existir porque a IA
// identifica o interlocutor pelo número — e precisa ser IMPOSSÍVEL de bater com
// gente real: o prefixo 5500 não é um DDI/DDD válido no Brasil.
function telefoneSimulado(imobiliariaId: number, agente: string): string {
  return `5500${imobiliariaId}${agente.length}00000`;
}

export type TurnoSimulado = {
  resposta: string;
  ferramentas: string[];
  enviosBloqueados: string[];
  custoUsd: number | null;
  erro?: string;
};

// Garante a conversa de simulação daquele agente naquela imobiliária.
async function conversaDaSimulacao(imobiliariaId: number, agente: AgenteIA) {
  const telefone = telefoneSimulado(imobiliariaId, agente);
  const existente = await prisma.conversa.findFirst({
    where: { imobiliariaId, agente, simulacao: true, contatoTelefone: telefone },
  });
  if (existente) return existente;

  // ADMINISTRACAO exige pessoa+perfil (o agente responde com os dados dela).
  // Usa a primeira pessoa da carteira: é o caso real que se quer ensaiar.
  let pessoaId: number | null = null;
  let perfil: PerfilConversa | null = null;
  if (agente === "ADMINISTRACAO") {
    const comContrato = await prisma.contrato.findFirst({
      where: { imobiliariaId, status: "ATIVO" },
      select: { inquilinoId: true },
    });
    if (comContrato) {
      pessoaId = comContrato.inquilinoId;
      perfil = "LOCATARIO";
    }
  }

  return prisma.conversa.create({
    data: {
      imobiliariaId,
      agente,
      simulacao: true,
      contatoNome: "Cliente (simulação)",
      contatoTelefone: telefone,
      canal: "SIMULADOR",
      ...(pessoaId && perfil ? { pessoaId, perfil } : {}),
    },
  });
}

export async function historicoSimulacao(imobiliariaId: number, agente: AgenteIA) {
  await exigirOperador();
  const conversa = await prisma.conversa.findFirst({
    where: {
      imobiliariaId,
      agente,
      simulacao: true,
      contatoTelefone: telefoneSimulado(imobiliariaId, agente),
    },
    include: { mensagens: { orderBy: { criadaEm: "asc" }, take: 120 } },
  });
  return {
    conversaId: conversa?.id ?? null,
    // O agente pode ter mudado sozinho (a Recepção direciona): mostra o atual.
    agenteAtual: conversa?.agente ?? agente,
    mensagens: (conversa?.mensagens ?? []).map((m) => ({
      autor: m.autor,
      texto: m.texto,
      em: m.criadaEm,
    })),
  };
}

// Manda uma mensagem como se fosse o cliente e devolve o que a IA respondeu,
// com as ferramentas que ela chamou e o custo do turno.
export async function enviarComoCliente(formData: FormData): Promise<TurnoSimulado> {
  await exigirOperador();
  const imobiliariaId = Number(formData.get("imobiliariaId"));
  const agente = String(formData.get("agente") ?? "RECEPCAO") as AgenteIA;
  const texto = String(formData.get("mensagem") ?? "").trim();
  if (!texto) return { resposta: "", ferramentas: [], enviosBloqueados: [], custoUsd: null };

  const imob = await prisma.imobiliaria.findUniqueOrThrow({ where: { id: imobiliariaId } });
  const ativos = agentesAtivos(imob.modulos, imob.addons);
  if (!ativos.includes(agente as (typeof ativos)[number])) {
    return {
      resposta: "",
      ferramentas: [],
      enviosBloqueados: [],
      custoUsd: null,
      erro: `O agente ${agente} não existe no plano desta imobiliária (módulos: ${imob.modulos.join(", ") || "nenhum"}). Ajuste o plano ou escolha outro agente.`,
    };
  }

  const conversa = await conversaDaSimulacao(imobiliariaId, agente);
  const antes = new Date();

  let resposta = "";
  let erro: string | undefined;
  let enviosBloqueados: string[] = [];
  try {
    const r = await comSimulacao(async () => {
      const { processarMensagem } = await import("@/lib/conversas");
      return processarMensagem(conversa, texto);
    });
    resposta = r.resultado;
    enviosBloqueados = r.enviosBloqueados;
  } catch (e) {
    erro = (e as Error).message;
  }

  // Custo e ferramentas do turno, direto da telemetria que o produto já grava.
  const usos = await prisma.usoIA.findMany({
    where: { imobiliariaId, criadoEm: { gte: antes } },
    select: { custoUsd: true },
  });
  const custoUsd = usos.length ? usos.reduce((s, u) => s + u.custoUsd, 0) : null;

  const logs = await prisma.logAuditoria.findMany({
    where: { imobiliariaId, criadoEm: { gte: antes } },
    select: { acao: true },
    orderBy: { criadoEm: "asc" },
  });

  revalidatePath("/admin/simulador");
  return { resposta, ferramentas: logs.map((l) => l.acao), enviosBloqueados, custoUsd, erro };
}

// Apaga a conversa de simulação para começar do zero — inclusive a memória de
// longo prazo, que senão contamina o próximo ensaio.
export async function reiniciarSimulacao(formData: FormData): Promise<void> {
  await exigirOperador();
  const imobiliariaId = Number(formData.get("imobiliariaId"));
  const agente = String(formData.get("agente") ?? "RECEPCAO") as AgenteIA;
  const conversas = await prisma.conversa.findMany({
    where: { imobiliariaId, simulacao: true, contatoTelefone: telefoneSimulado(imobiliariaId, agente) },
    select: { id: true },
  });
  const ids = conversas.map((c) => c.id);
  if (ids.length) {
    await prisma.mensagem.deleteMany({ where: { conversaId: { in: ids } } });
    await prisma.conversa.deleteMany({ where: { id: { in: ids } } });
  }
  await registrarAcao("SIMULACAO_REINICIADA", imobiliariaId, agente);
  revalidatePath("/admin/simulador");
}
