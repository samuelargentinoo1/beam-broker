"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { auditar } from "@/lib/auditoria";
import { analisarCredito } from "@/lib/credito";
import { enviarContratoParaAssinatura } from "@/lib/assinatura";
import { enviarWhatsApp } from "@/lib/whatsapp";
import { emitirCobranca } from "@/lib/gateway";
import { Prisma } from "@prisma/client";
import { calcularEncargosAtraso, calcularMultaRescisao, centavos } from "@/lib/financeiro";
import { diasEmAtraso, proximoNumero } from "@/lib/format";
import {
  carregarContrato,
  carregarImovel,
  carregarLead,
  carregarProposta,
} from "@/lib/escopo";
import type { StatusLead, StatusOcorrencia, TemperaturaLead, TipoAditivo } from "@prisma/client";

// Guardas de escopo de tenant: delegam ao helper único lib/escopo.ts (que filtra
// pela imobiliária da sessão e lança ErroDeAcesso se o registro for de outro
// tenant). Mantidas como wrappers finos para os call-sites deste arquivo.
async function exigirImovelDoTenant(imovelId: number) {
  await carregarImovel(imovelId);
}
async function exigirContratoDoTenant(contratoId: number) {
  const { registro } = await carregarContrato(contratoId, {
    inquilino: true,
    imovel: { include: { imobiliaria: true } },
  });
  return registro;
}

// ─── Leads (CRM de locação) ─────────────────────────────────────────────────

export async function criarLead(formData: FormData) {
  const { imobiliaria } = await exigirSessao();
  const imovelId = Number(formData.get("imovelId")) || null;
  // imóvel de interesse (opcional) tem de ser do próprio tenant
  if (imovelId != null) await exigirImovelDoTenant(imovelId);
  const lead = await prisma.lead.create({
    data: {
      imobiliariaId: imobiliaria.id,
      nome: String(formData.get("nome")),
      telefone: (formData.get("telefone") as string) || null,
      email: (formData.get("email") as string) || null,
      origem: String(formData.get("origem") ?? "SITE"),
      temperatura: (formData.get("temperatura") as TemperaturaLead) ?? "MORNO",
      // Locação e compra são funis separados: o lead nasce sabendo qual é o
      // dele, para as duas coisas não se misturarem na esteira.
      finalidade: formData.get("finalidade") === "COMPRA" ? "COMPRA" : "LOCACAO",
      imovelId,
      observacoes: (formData.get("observacoes") as string) || null,
    },
  });
  // Entra na cadência de follow-up (#7/#3) — vale também para lead cadastrado à
  // mão. Só se tiver telefone (é por onde a Carol reengaja).
  if (lead.telefone) await import("@/lib/followup").then((m) => m.iniciarCadencia(lead.id)).catch(() => {});
  revalidatePath("/meu-dia");
}

export async function moverLead(leadId: number, status: StatusLead) {
  const { imobiliaria } = await exigirSessao();
  // escopo de tenant: só atualiza se o lead for desta imobiliária
  const r = await prisma.lead.updateMany({ where: { id: leadId, imobiliariaId: imobiliaria.id }, data: { status } });
  if (r.count === 0) return;
  revalidatePath("/meu-dia");
}

export async function agendarVisita(formData: FormData) {
  const { imobiliaria } = await exigirSessao();
  const leadId = Number(formData.get("leadId"));
  const r = await prisma.lead.updateMany({
    where: { id: leadId, imobiliariaId: imobiliaria.id },
    data: { visitaEm: new Date(String(formData.get("visitaEm"))), status: "VISITA_AGENDADA" },
  });
  if (r.count === 0) return;
  revalidatePath("/meu-dia");
}

// ─── Propostas + análise de crédito ─────────────────────────────────────────

export async function criarProposta(formData: FormData) {
  const imovelId = Number(formData.get("imovelId"));
  await exigirImovelDoTenant(imovelId); // valida sessão + tenant do imóvel
  const leadId = Number(formData.get("leadId")) || null;
  // lead (opcional) tem de ser do próprio tenant — senão criarProposta viraria
  // um vetor para mover o status de leads de outra imobiliária.
  if (leadId != null) await carregarLead(leadId);
  const valorProposto = Number(formData.get("valorProposto"));
  if (!Number.isFinite(valorProposto) || valorProposto <= 0) throw new Error("Valor proposto inválido.");
  const rendaMensal = Number(formData.get("rendaMensal")) || null;
  const cpfCnpj = String(formData.get("cpfCnpj"));

  const credito = analisarCredito({
    cpfCnpj,
    rendaMensal,
    valorAluguel: valorProposto,
    garantia: (formData.get("garantia") as string) || null,
  });

  const proposta = await prisma.proposta.create({
    data: {
      leadId,
      imovelId,
      nome: String(formData.get("nome")),
      cpfCnpj,
      rendaMensal,
      valorProposto,
      prazoMeses: Number(formData.get("prazoMeses")) || 30,
      garantia: (formData.get("garantia") as string) || null,
      scoreCredito: credito.score,
      resultadoCredito: credito.resultado,
      status: credito.resultado === "REPROVADO" ? "RECUSADA" : "EM_ANALISE",
    },
  });
  if (leadId) {
    await prisma.lead.update({ where: { id: leadId }, data: { status: "PROPOSTA" } });
  }
  await auditar("PROPOSTA_CRIADA", "Proposta", proposta.id, `${proposta.nome} — ${credito.resultado} (score ${credito.score})`);
  revalidatePath("/propostas");
  revalidatePath("/meu-dia");
  redirect("/propostas");
}

export async function decidirProposta(propostaId: number, aprovar: boolean) {
  // escopo de tenant: carrega a proposta (via imovel.imobiliaria da sessão)
  const { registro: proposta } = await carregarProposta(propostaId);
  await prisma.proposta.update({
    where: { id: proposta.id },
    data: { status: aprovar ? "APROVADA" : "RECUSADA" },
  });
  await auditar(aprovar ? "PROPOSTA_APROVADA" : "PROPOSTA_RECUSADA", "Proposta", proposta.id);
  revalidatePath("/propostas");
}

// Núcleo reutilizável: cria o contrato a partir de uma proposta APROVADA
// (cadastra/reaproveita o inquilino, gera o contrato, marca o imóvel como
// alugado e semeia a memória da IA). NÃO faz redirect/revalidate — por isso
// pode ser chamado tanto pela action da UI quanto pela IA. Retorna o contrato.
// Interno (não exportado): não é Server Action. Só é chamado por converterProposta
// (que já valida o tenant). Evita virar um endpoint RPC de conversão sem escopo.
async function criarContratoDaProposta(propostaId: number) {
  const proposta = await prisma.proposta.findUniqueOrThrow({
    where: { id: propostaId },
    include: { imovel: { include: { imobiliaria: true } }, lead: true },
  });
  // Idempotência: se já foi convertida, devolve o contrato existente — nunca
  // cria um segundo contrato para a mesma proposta.
  if (proposta.contratoId)
    return prisma.contrato.findUniqueOrThrow({ where: { id: proposta.contratoId } });
  if (proposta.status !== "APROVADA") throw new Error("Proposta precisa estar aprovada");
  const imobiliaria = proposta.imovel.imobiliaria;
  const lead = proposta.lead;

  let inquilino = await prisma.pessoa.findUnique({
    where: { imobiliariaId_cpfCnpj: { imobiliariaId: imobiliaria.id, cpfCnpj: proposta.cpfCnpj } },
  });
  if (!inquilino) {
    inquilino = await prisma.pessoa.create({
      data: {
        imobiliariaId: imobiliaria.id,
        nome: proposta.nome,
        cpfCnpj: proposta.cpfCnpj,
        telefone: lead?.telefone ?? null,
        email: lead?.email ?? null,
      },
    });
  }

  const inicio = new Date();
  const fim = new Date();
  fim.setMonth(fim.getMonth() + proposta.prazoMeses);
  const ehSeguroFianca = /seguro[- ]?fian/i.test(proposta.garantia ?? "");
  const dadosContrato = {
    imobiliariaId: imobiliaria.id,
    imovelId: proposta.imovelId,
    inquilinoId: inquilino.id,
    inicio,
    fim,
    valorAluguel: proposta.valorProposto,
    modeloRemuneracao: imobiliaria.modeloRemuneracao,
    taxaAdmPercent: imobiliaria.taxaAdmPercent,
    multaPercent: imobiliaria.multaPercent,
    jurosMesPercent: imobiliaria.jurosMesPercent,
    seguroFiancaPercent: ehSeguroFianca ? imobiliaria.seguroFiancaPercent : 0,
    garantia: proposta.garantia,
  };

  // Cria o contrato e vira o estado (imóvel ALUGADO, proposta CONVERTIDA, lead
  // FECHADO) numa ÚNICA transação — nada de contrato órfão. Uma trava otimista
  // (updateMany só quando status ainda é APROVADA) garante que apenas UMA
  // execução converte, mesmo sob concorrência. Retry ao colidir o código único.
  let contrato: Awaited<ReturnType<typeof prisma.contrato.create>> | null = null;
  for (let tentativa = 0; tentativa < 6 && !contrato; tentativa++) {
    const todos = await prisma.contrato.findMany({
      where: { imobiliariaId: imobiliaria.id },
      select: { codigo: true },
    });
    const codigo = `CT-${String(proximoNumero(todos.map((c) => c.codigo), "CT")).padStart(4, "0")}`;
    let perdeuTrava = false;
    try {
      contrato = await prisma.$transaction(async (tx) => {
        const trava = await tx.proposta.updateMany({
          where: { id: propostaId, status: "APROVADA" },
          data: { status: "CONVERTIDA" },
        });
        if (trava.count === 0) {
          perdeuTrava = true;
          return null;
        }
        const ct = await tx.contrato.create({ data: { codigo, ...dadosContrato } });
        await tx.proposta.update({ where: { id: propostaId }, data: { contratoId: ct.id } });
        await tx.imovel.update({ where: { id: proposta.imovelId }, data: { status: "ALUGADO" } });
        if (proposta.leadId)
          await tx.lead.update({ where: { id: proposta.leadId }, data: { status: "FECHADO" } });
        return ct;
      });
    } catch (e) {
      const err = e as { code?: string; meta?: { target?: unknown } };
      if (err.code === "P2002" && String(err.meta?.target).includes("codigo")) continue; // código colidiu: tenta o próximo
      throw e;
    }
    if (perdeuTrava) {
      // outra execução converteu em paralelo: devolve o contrato dela.
      const p = await prisma.proposta.findUnique({ where: { id: propostaId } });
      if (p?.contratoId) return prisma.contrato.findUniqueOrThrow({ where: { id: p.contratoId } });
      throw new Error("Proposta já convertida, mas contrato não localizado.");
    }
  }
  if (!contrato) throw new Error("Não foi possível gerar um código de contrato único. Tente de novo.");

  // Handoff: o histórico da negociação vira memória da IA de administração
  // (não crítico — não pode derrubar a conversão já concluída).
  const memoria =
    `Contexto da negociação (proposta #${proposta.id}): ${proposta.nome} alugou o ` +
    `${proposta.imovel.codigo} (${proposta.imovel.endereco}) por R$ ${proposta.valorProposto.toFixed(2)}/mês, ` +
    `prazo ${proposta.prazoMeses} meses, garantia ${proposta.garantia ?? "a definir"}. ` +
    `Análise de crédito: ${proposta.resultadoCredito ?? "n/d"} (score ${proposta.scoreCredito ?? "n/d"}).` +
    (lead?.observacoes ? ` Observações do atendimento: ${lead.observacoes}` : "") +
    (ehSeguroFianca ? ` Fatura mensal inclui seguro-fiança de ${imobiliaria.seguroFiancaPercent}% do aluguel.` : "");
  // Descobre o canal de WhatsApp do cliente (telefone + JID de resposta, que
  // pode ser @lid) reaproveitando a conversa de vendas/lead — assim as próximas
  // mensagens da Carol (link de assinatura, 2ª via) chegam ao contato certo.
  const telCliente = lead?.telefone ?? inquilino.telefone ?? null;
  let jidCliente: string | null = null;
  if (telCliente) {
    const convLead = await prisma.conversa.findFirst({
      where: { imobiliariaId: imobiliaria.id, contatoTelefone: telCliente },
      orderBy: { atualizadaEm: "desc" },
      select: { contatoJid: true },
    });
    jidCliente = convLead?.contatoJid ?? null;
  }
  await prisma.conversa
    .upsert({
      where: { pessoaId_perfil: { pessoaId: inquilino.id, perfil: "LOCATARIO" } },
      create: {
        imobiliariaId: imobiliaria.id,
        agente: "ADMINISTRACAO",
        pessoaId: inquilino.id,
        perfil: "LOCATARIO",
        contatoTelefone: telCliente,
        contatoJid: jidCliente,
        memoria,
      },
      update: {
        memoria,
        ...(telCliente ? { contatoTelefone: telCliente } : {}),
        ...(jidCliente ? { contatoJid: jidCliente } : {}),
      },
    })
    .catch(() => {});
  await auditar("PROPOSTA_CONVERTIDA", "Contrato", contrato.id, `Proposta #${propostaId} → ${contrato.codigo}`);
  return contrato;
}

// Action da UI: converte, dispara a assinatura digital, manda o link ao cliente
// no WhatsApp (pela Carol) e leva para a ficha do contrato.
export async function converterProposta(propostaId: number) {
  const { imobiliaria } = await exigirSessao();
  // escopo de tenant: garante que a proposta é desta imobiliária antes de gerar
  // o contrato (criarContratoDaProposta é reusada pela IA, então a validação de
  // sessão fica aqui, na porta da UI).
  const dona = await prisma.proposta.findFirst({
    where: { id: propostaId, imovel: { imobiliariaId: imobiliaria.id } },
    select: { id: true },
  });
  if (!dona) redirect("/propostas?erro=" + encodeURIComponent("Proposta não encontrada."));
  const contrato = await criarContratoDaProposta(propostaId);
  // Dispara a assinatura só se ainda não foi enviada (idempotente) e nunca
  // derruba a conversão se faltar e-mail/telefone do inquilino/proprietário.
  if (contrato.assinaturaStatus === "NAO_ENVIADO") {
    try {
      const base = process.env.APP_URL ?? "http://localhost:3000";
      const links = await enviarContratoParaAssinatura(contrato.id, `${base}/contratos/${contrato.id}/documento`);
      // Avisa o INQUILINO e o PROPRIETÁRIO no WhatsApp, cada um com o seu link.
      await enviarLinkAssinaturaAoCliente(contrato.id);
      if (links.proprietarioUrl) await enviarLinkAssinaturaAoProprietario(contrato.id, links.proprietarioUrl);
    } catch (e) {
      await auditar(
        "ASSINATURA_FALHOU",
        "Contrato",
        contrato.id,
        `Falha ao enviar para assinatura: ${(e as Error).message}`
      );
    }
  }
  revalidatePath("/propostas");
  redirect(`/contratos/${contrato.id}`);
}

// Envia o link de assinatura ao inquilino no WhatsApp, no tom da Carol. Só
// envia quando há link REAL (não o link demo) e um destino conhecido; falha
// aqui nunca derruba a conversão (o link segue disponível na ficha).
// interna: o chamador (converterProposta) já validou o tenant.
async function enviarLinkAssinaturaAoCliente(contratoId: number) {
  const contrato = await prisma.contrato.findUniqueOrThrow({
    where: { id: contratoId },
    include: { inquilino: true, imovel: true },
  });
  const link = contrato.assinaturaLink ?? "";
  if (!link || link.includes("assinatura.demo")) return; // sem provedor real
  const tel = contrato.inquilino.telefone;
  if (!tel) return; // sem WhatsApp do cliente

  const imobiliariaId = contrato.imovel.imobiliariaId;
  const conv = await prisma.conversa.findFirst({
    where: { imobiliariaId, contatoTelefone: tel },
    orderBy: { atualizadaEm: "desc" },
    select: { contatoJid: true },
  });
  const destinos = [conv?.contatoJid, tel].filter((d): d is string => Boolean(d));

  const primeiro = contrato.inquilino.nome.split(" ")[0];
  const msg =
    `Oi ${primeiro}, aqui é a Carol. Seu contrato de locação do ${contrato.imovel.codigo} já está pronto.\n\n` +
    `É só assinar por aqui:\n${link}\n\n` +
    `Assim que as duas partes assinarem, está tudo certo. Qualquer dúvida, me chama.`;
  const r = await enviarWhatsApp(tel, msg, imobiliariaId, destinos);
  await auditar(
    r.enviado ? "LINK_ASSINATURA_ENVIADO" : "LINK_ASSINATURA_FALHOU",
    "Contrato",
    contratoId,
    r.detalhe ?? (r.enviado ? "link enviado ao cliente" : "falha ao enviar link")
  );
}

// Envia o link de assinatura ao PROPRIETÁRIO (2º signatário) no WhatsApp, no
// tom da Carol. Recebe o link específico do signatário (ZapSign). Falha aqui
// nunca derruba a conversão.
// interna: o chamador (converterProposta) já validou o tenant.
async function enviarLinkAssinaturaAoProprietario(contratoId: number, link: string) {
  if (!link || link.includes("assinatura.demo")) return;
  const contrato = await prisma.contrato.findUniqueOrThrow({
    where: { id: contratoId },
    include: { imovel: { include: { proprietario: true } } },
  });
  const tel = contrato.imovel.proprietario.telefone;
  if (!tel) return;

  const imobiliariaId = contrato.imovel.imobiliariaId;
  const conv = await prisma.conversa.findFirst({
    where: { imobiliariaId, contatoTelefone: tel },
    orderBy: { atualizadaEm: "desc" },
    select: { contatoJid: true },
  });
  const destinos = [conv?.contatoJid, tel].filter((d): d is string => Boolean(d));

  const primeiro = contrato.imovel.proprietario.nome.split(" ")[0];
  const msg =
    `Oi ${primeiro}, aqui é a Carol. Saiu o contrato de locação do seu imóvel ${contrato.imovel.codigo}.\n\n` +
    `Para assinar como proprietário, é só por aqui:\n${link}\n\n` +
    `Assim que as duas partes assinarem, está tudo certo. Qualquer dúvida, me chama.`;
  const r = await enviarWhatsApp(tel, msg, imobiliariaId, destinos);
  await auditar(
    r.enviado ? "LINK_ASSINATURA_PROPRIETARIO_ENVIADO" : "LINK_ASSINATURA_PROPRIETARIO_FALHOU",
    "Contrato",
    contratoId,
    r.detalhe ?? (r.enviado ? "link enviado ao proprietário" : "falha ao enviar link ao proprietário")
  );
}

// ─── Ocorrências / manutenções ──────────────────────────────────────────────

export async function criarOcorrencia(formData: FormData) {
  const imovelId = Number(formData.get("imovelId"));
  await exigirImovelDoTenant(imovelId); // valida sessão + tenant do imóvel
  const contratoAtivo = await prisma.contrato.findFirst({
    where: { imovelId, status: "ATIVO" },
  });
  const custo = Number(formData.get("custo")) || null;
  await prisma.ocorrencia.create({
    data: {
      imovelId,
      contratoId: contratoAtivo?.id ?? null,
      titulo: String(formData.get("titulo")),
      descricao: (formData.get("descricao") as string) || null,
      custo,
      responsavelCusto: custo
        ? ((formData.get("responsavelCusto") as "PROPRIETARIO" | "INQUILINO" | "IMOBILIARIA") ?? "PROPRIETARIO")
        : null,
    },
  });
  revalidatePath("/ocorrencias");
}

export async function atualizarOcorrencia(ocorrenciaId: number, status: StatusOcorrencia) {
  const { imobiliaria } = await exigirSessao();
  const r = await prisma.ocorrencia.updateMany({
    where: { id: ocorrenciaId, imovel: { imobiliariaId: imobiliaria.id } },
    data: { status, concluidaEm: status === "CONCLUIDA" ? new Date() : null },
  });
  if (r.count === 0) throw new Error("Ocorrência não encontrada nesta imobiliária.");
  revalidatePath("/ocorrencias");
}

// ─── Chaves ─────────────────────────────────────────────────────────────────

export async function registrarChave(formData: FormData) {
  const imovelId = Number(formData.get("imovelId"));
  await exigirImovelDoTenant(imovelId); // valida sessão + tenant do imóvel
  const devolucao = formData.get("devolucaoPrevista") as string;
  await prisma.movimentoChave.create({
    data: {
      imovelId,
      retiradaPor: String(formData.get("retiradaPor")),
      telefone: (formData.get("telefone") as string) || null,
      devolucaoPrevista: devolucao ? new Date(devolucao) : null,
      observacoes: (formData.get("observacoes") as string) || null,
    },
  });
  revalidatePath("/chaves");
}

export async function devolverChave(movimentoId: number) {
  const { imobiliaria } = await exigirSessao();
  const r = await prisma.movimentoChave.updateMany({
    where: { id: movimentoId, imovel: { imobiliariaId: imobiliaria.id } },
    data: { devolvidaEm: new Date() },
  });
  if (r.count === 0) throw new Error("Movimento de chave não encontrado nesta imobiliária.");
  revalidatePath("/chaves");
}

// ─── Vistorias ──────────────────────────────────────────────────────────────

export async function criarVistoria(formData: FormData) {
  const imovelId = Number(formData.get("imovelId"));
  await exigirImovelDoTenant(imovelId); // valida sessão + tenant do imóvel
  await prisma.vistoria.create({
    data: {
      imovelId,
      tipo: String(formData.get("tipo")),
      laudo: (formData.get("laudo") as string) || null,
    },
  });
  revalidatePath(`/imoveis/${imovelId}`);
}

// ─── Seguros ────────────────────────────────────────────────────────────────

export async function criarSeguro(formData: FormData) {
  const contratoId = Number(formData.get("contratoId"));
  await exigirContratoDoTenant(contratoId); // valida sessão + tenant do contrato
  await prisma.seguro.create({
    data: {
      contratoId,
      tipo: String(formData.get("tipo")),
      seguradora: String(formData.get("seguradora")),
      apolice: (formData.get("apolice") as string) || null,
      inicio: new Date(String(formData.get("inicio"))),
      fim: new Date(String(formData.get("fim"))),
      valor: Number(formData.get("valor")) || null,
    },
  });
  revalidatePath(`/contratos/${contratoId}`);
}

// ─── Aditivos / renovação ───────────────────────────────────────────────────

export async function criarAditivo(formData: FormData) {
  const contratoId = Number(formData.get("contratoId"));
  await exigirContratoDoTenant(contratoId); // valida sessão + tenant do contrato
  const tipo = formData.get("tipo") as TipoAditivo;
  const novoValorRaw = Number(formData.get("novoValor"));
  const novoValor = Number.isFinite(novoValorRaw) && novoValorRaw > 0 ? novoValorRaw : null;
  const novoFimStr = formData.get("novoFim") as string;
  const novoFim = novoFimStr ? new Date(novoFimStr) : null;

  const aditivo = await prisma.aditivo.create({
    data: {
      contratoId,
      tipo,
      descricao: String(formData.get("descricao")),
      novoValor,
      novoFim,
    },
  });
  await prisma.contrato.update({
    where: { id: contratoId },
    data: {
      ...(novoFim ? { fim: novoFim } : {}),
      ...(novoValor ? { valorAluguel: novoValor } : {}),
      // aditivo reabre o ciclo de assinatura
      ...(novoFim || novoValor ? { assinaturaStatus: "NAO_ENVIADO" as const, assinaturaId: null, assinaturaLink: null, assinadoEm: null } : {}),
    },
  });
  await auditar("ADITIVO_CRIADO", "Contrato", contratoId, `${tipo}: ${aditivo.descricao}`);
  revalidatePath(`/contratos/${contratoId}`);
}

// ─── Rescisão antecipada ────────────────────────────────────────────────────

export async function rescindirContrato(formData: FormData) {
  const { imobiliaria, usuario } = await exigirSessao();
  const contratoId = Number(formData.get("contratoId"));
  const contrato = await exigirContratoDoTenant(contratoId);
  const hoje = new Date();
  const multaInformada = Number(formData.get("multa"));
  const multa = Number.isFinite(multaInformada) && multaInformada >= 0
    ? centavos(multaInformada)
    : calcularMultaRescisao({
        valorAluguel: contrato.valorAluguel,
        inicio: contrato.inicio,
        fim: contrato.fim,
        dataRescisao: hoje,
      });

  await prisma.contrato.update({
    where: { id: contratoId },
    data: { status: "RESCINDIDO", encerradoEm: hoje },
  });
  await prisma.imovel.update({
    where: { id: contrato.imovelId },
    data: { status: "DISPONIVEL" },
  });

  if (multa.gt(0)) {
    const venc = new Date();
    venc.setDate(venc.getDate() + 5);
    const fatura = await prisma.fatura.create({
      data: {
        imobiliariaId: contrato.imobiliariaId,
        contratoId,
        competencia: `RESC-${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, "0")}`,
        vencimento: venc,
        valorAluguel: 0,
        valorEncargos: multa,
        valorTotal: multa,
        categoria: "RESCISAO",
      },
    });
    // Cobrança best-effort: se o gateway falhar, a rescisão NÃO é desfeita e a
    // fatura de multa fica sem PIX (reprocessável), em vez de derrubar tudo.
    try {
      const cobranca = await emitirCobranca(fatura, contrato.inquilino, contrato.imovel.imobiliaria.asaasApiKey);
      await prisma.fatura.update({ where: { id: fatura.id }, data: cobranca });
    } catch (e) {
      console.error(`rescindirContrato: emitirCobranca falhou p/ fatura ${fatura.id}:`, e);
    }
  }

  await auditar(
    "CONTRATO_RESCINDIDO",
    "Contrato",
    contratoId,
    `Multa rescisória: R$ ${multa.toFixed(2)}`,
    imobiliaria.id,
    usuario.id
  );
  revalidatePath(`/contratos/${contratoId}`);
  revalidatePath("/contratos");
  revalidatePath("/imoveis");
}

// ─── Acordos de inadimplência ───────────────────────────────────────────────

export async function criarAcordo(formData: FormData) {
  const { imobiliaria, usuario } = await exigirSessao();
  const contratoId = Number(formData.get("contratoId"));
  const parcelas = Math.max(1, Number(formData.get("parcelas")) || 1);
  const descontoPercent = Number(formData.get("descontoPercent")) || 0;

  const contrato = await exigirContratoDoTenant(contratoId);
  const atrasadas = await prisma.fatura.findMany({
    where: { contratoId, status: "ATRASADA" },
  });
  if (atrasadas.length === 0) throw new Error("Contrato sem faturas em atraso");

  // Valor atualizado (com multa e juros de hoje) — soma em Decimal.
  const valorOriginal = centavos(
    atrasadas.reduce((s, f) => {
      const { multa, juros } = calcularEncargosAtraso(
        f.valorTotal, diasEmAtraso(f.vencimento), contrato.multaPercent, contrato.jurosMesPercent
      );
      return s.plus(f.valorTotal).plus(multa).plus(juros);
    }, new Prisma.Decimal(0))
  );
  const valorAcordado = centavos(
    valorOriginal.times(new Prisma.Decimal(1).minus(new Prisma.Decimal(descontoPercent).div(100)))
  );
  const valorParcela = centavos(valorAcordado.div(parcelas));

  const acordo = await prisma.acordo.create({
    data: {
      contratoId,
      valorOriginal,
      valorAcordado,
      parcelas,
      observacoes: descontoPercent > 0 ? `Desconto de ${descontoPercent}% sobre o valor atualizado` : null,
    },
  });

  // Cancela as faturas originais e emite as parcelas do acordo
  await prisma.fatura.updateMany({
    where: { id: { in: atrasadas.map((f) => f.id) } },
    data: { status: "CANCELADA" },
  });
  for (let n = 1; n <= parcelas; n++) {
    const venc = new Date();
    venc.setDate(venc.getDate() + 7 + 30 * (n - 1)); // 1ª parcela em 7 dias, demais mensais
    const valor = n === parcelas
      ? centavos(valorAcordado.minus(valorParcela.times(parcelas - 1))) // ajuste de arredondamento
      : valorParcela;
    const fatura = await prisma.fatura.create({
      data: {
        imobiliariaId: contrato.imobiliariaId,
        contratoId,
        acordoId: acordo.id,
        competencia: `AC${acordo.id}-P${n}`,
        vencimento: venc,
        valorAluguel: valor,
        valorEncargos: 0,
        valorTotal: valor,
        categoria: "ACORDO",
      },
    });
    try {
      const cobranca = await emitirCobranca(fatura, contrato.inquilino, contrato.imovel.imobiliaria.asaasApiKey);
      await prisma.fatura.update({ where: { id: fatura.id }, data: cobranca });
    } catch (e) {
      console.error(`criarAcordo: emitirCobranca falhou p/ fatura ${fatura.id}:`, e);
    }
  }

  await auditar(
    "ACORDO_CRIADO",
    "Acordo",
    acordo.id,
    `${contrato.codigo}: R$ ${valorOriginal.toFixed(2)} → R$ ${valorAcordado.toFixed(2)} em ${parcelas}x`,
    imobiliaria.id,
    usuario.id
  );
  revalidatePath("/inadimplencia");
  revalidatePath("/faturas");
}
