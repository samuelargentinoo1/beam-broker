// Ações PROATIVAS das IAs — o sistema fala com o cliente sem esperar pergunta:
//  · proprietário é avisado quando o aluguel entra e quando o repasse é transferido
//  · leads frios recebem follow-up automático da IA de vendas
//  · rotina diária (Vercel Cron): faturas do mês, atrasadas e régua de cobrança
//
// Toda mensagem proativa fica registrada no histórico da conversa do contato.

import { prisma } from "@/lib/db";
import { auditar } from "@/lib/auditoria";
import { enviarWhatsApp } from "@/lib/whatsapp";
import { brl, competenciaBr } from "@/lib/format";
import type { PerfilConversa } from "@prisma/client";

// Registra a mensagem proativa na conversa de administração da pessoa e envia.
async function notificarPessoa(pessoaId: number, perfil: PerfilConversa, texto: string) {
  const pessoa = await prisma.pessoa.findUnique({ where: { id: pessoaId } });
  if (!pessoa) return;
  const conversa = await prisma.conversa.upsert({
    where: { pessoaId_perfil: { pessoaId, perfil } },
    create: { imobiliariaId: pessoa.imobiliariaId, agente: "ADMINISTRACAO", pessoaId, perfil },
    update: {},
  });
  await prisma.mensagem.create({
    data: { conversaId: conversa.id, autor: "IA", texto },
  });
  if (pessoa.telefone) await enviarWhatsApp(pessoa.telefone, texto, pessoa.imobiliariaId);
}

// ─── Avisos automáticos ao proprietário ─────────────────────────────────────

export async function avisarAluguelRecebido(faturaId: number) {
  const fatura = await prisma.fatura.findUnique({
    where: { id: faturaId },
    include: {
      repasse: true,
      contrato: { include: { imovel: { include: { proprietario: true } }, inquilino: true } },
    },
  });
  if (!fatura?.repasse || fatura.categoria !== "ALUGUEL") return;
  const prop = fatura.contrato.imovel.proprietario;
  const primeiroNome = prop.nome.split(" ")[0];
  await notificarPessoa(
    prop.id,
    "PROPRIETARIO",
    `Oi ${primeiroNome}, aqui é a Carol. O aluguel de ${competenciaBr(fatura.competencia)} do imóvel ` +
      `${fatura.contrato.imovel.codigo} (${fatura.contrato.imovel.endereco}) foi pago: ${brl(fatura.valorPago)}. ` +
      `Seu repasse de ${brl(fatura.repasse.valorRepasse)}` +
      (fatura.repasse.valorDescontos.gt(0)
        ? ` (já descontados ${brl(fatura.repasse.valorDescontos)} de manutenções)`
        : "") +
      ` está agendado — aviso assim que a transferência sair.`
  );
}

export async function avisarRepasseTransferido(repasseId: number) {
  const repasse = await prisma.repasse.findUnique({
    where: { id: repasseId },
    include: {
      fatura: { include: { contrato: { include: { imovel: { include: { proprietario: true } } } } } },
    },
  });
  if (!repasse) return;
  const prop = repasse.fatura.contrato.imovel.proprietario;
  await notificarPessoa(
    prop.id,
    "PROPRIETARIO",
    `Oi ${prop.nome.split(" ")[0]}, aqui é a Carol. Seu repasse de ${brl(repasse.valorRepasse)} referente a ` +
      `${competenciaBr(repasse.fatura.competencia)} do imóvel ${repasse.fatura.contrato.imovel.codigo} ` +
      `foi transferido ${prop.chavePix ? `para a sua chave PIX (${prop.chavePix})` : "para a sua conta"}. ` +
      `Qualquer dúvida, é só responder por aqui.`
  );
}

// Follow-up de leads: ver lib/followup.ts (cadência de 5 toques).

// ─── Rotina diária (chamada pelo Vercel Cron) ───────────────────────────────

// DESPACHANTE (chamado pelo Vercel Cron diário): NÃO executa as rotinas pesadas
// em sequência (isso estourava o maxDuration=60 com N+1 e chamadas HTTP ao
// gateway para todos os tenants). Em vez disso, ENFILEIRA um job por imobiliária
// ativa e faz aqui só as tarefas globais leves. Um consumidor
// (/api/cron/processar) processa os jobs, um tenant por invocação própria.
export async function executarRotinasDiarias() {
  const resultado: Record<string, number | string> = {};

  // 1. Enfileira um job "rotinas-tenant" por imobiliária ATIVA (com contrato
  //    ativo). Não duplica jobs pendentes do mesmo tenant.
  const ativas = await prisma.imobiliaria.findMany({
    where: { contratos: { some: { status: "ATIVO" } } },
    select: { id: true },
  });
  let enfileirados = 0;
  for (const imob of ativas) {
    const jaPendente = await prisma.filaJob.findFirst({
      where: { tipo: "rotinas-tenant", imobiliariaId: imob.id, status: { in: ["PENDENTE", "PROCESSANDO"] } },
      select: { id: true },
    });
    if (jaPendente) continue;
    await prisma.filaJob.create({ data: { tipo: "rotinas-tenant", imobiliariaId: imob.id } });
    enfileirados++;
  }
  resultado.jobsEnfileirados = enfileirados;

  // 2. Rede de segurança do handoff: reativa IA em conversas esquecidas há 24h+
  //    (global, leve — segue no despachante).
  const { reativarConversasEsquecidas } = await import("@/lib/atendimento-humano");
  resultado.iaReativadaAuto = await reativarConversasEsquecidas(24);

  // 3. Retenção: remove trilha de auditoria com mais de 12 meses.
  try {
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 12);
    const { count } = await prisma.logAuditoria.deleteMany({ where: { criadoEm: { lt: limite } } });
    resultado.auditoriaRemovida = count;
  } catch (e) {
    console.error("retenção de auditoria:", e);
  }

  await auditar("ROTINA_DIARIA_DESPACHO", "Sistema", undefined, JSON.stringify(resultado));
  return resultado;
}

// Processa as rotinas pesadas de UM tenant (chamado pelo consumidor da fila).
// Isolado: uma falha aqui não afeta os outros tenants. Registra ExecucaoJob.
export async function processarRotinasTenant(imobiliariaId: number) {
  const execucao = await prisma.execucaoJob.create({
    data: { tipo: "rotinas-tenant", imobiliariaId },
  });
  const resultado: Record<string, number | string> = {};
  try {
    const { atualizarFaturasAtrasadas, gerarFaturasDoMes, enviarReguaCobranca } = await import("@/lib/rotinas");
    await atualizarFaturasAtrasadas(imobiliariaId);
    resultado.faturasGeradas = await gerarFaturasDoMes(imobiliariaId);
    if (new Date().getDay() === 1) {
      resultado.cobrancasEnviadas = await enviarReguaCobranca(imobiliariaId);
    }
    await prisma.execucaoJob.update({
      where: { id: execucao.id },
      data: { ok: true, resultado: JSON.stringify(resultado), terminadoEm: new Date() },
    });
    return resultado;
  } catch (e) {
    await prisma.execucaoJob.update({
      where: { id: execucao.id },
      data: { ok: false, resultado: JSON.stringify({ erro: (e as Error).message }), terminadoEm: new Date() },
    });
    throw e;
  }
}

// Consumidor da fila: processa até `limite` jobs pendentes, cada um isolado.
// Uma trava otimista (updateMany PENDENTE->PROCESSANDO) evita processamento
// duplicado sob concorrência. Retorna quantos foram processados.
export async function processarFila(limite = 5): Promise<{ processados: number; erros: number }> {
  let processados = 0;
  let erros = 0;
  for (let i = 0; i < limite; i++) {
    const job = await prisma.filaJob.findFirst({
      where: { status: "PENDENTE" },
      orderBy: { criadoEm: "asc" },
    });
    if (!job) break;
    const trava = await prisma.filaJob.updateMany({
      where: { id: job.id, status: "PENDENTE" },
      data: { status: "PROCESSANDO", tentativas: { increment: 1 } },
    });
    if (trava.count === 0) continue; // outro consumidor pegou
    try {
      await processarRotinasTenant(job.imobiliariaId);
      await prisma.filaJob.update({
        where: { id: job.id },
        data: { status: "CONCLUIDO", processadoEm: new Date() },
      });
      processados++;
    } catch (e) {
      erros++;
      // até 3 tentativas: volta para PENDENTE; depois marca ERRO.
      const status = job.tentativas + 1 >= 3 ? "ERRO" : "PENDENTE";
      await prisma.filaJob.update({
        where: { id: job.id },
        data: { status, erro: String((e as Error).message).slice(0, 500) },
      });
    }
  }
  return { processados, erros };
}
