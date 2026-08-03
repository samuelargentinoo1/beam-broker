// Motor de follow-up comercial (#7): cadência de 5 pontos de contato para nunca
// deixar um lead esfriar sem tentativa. A Carol reengaja sozinha, com mensagens
// que escalam de tom, até o lead responder ou a cadência esgotar.
//
// Cadência (tempo de SILÊNCIO até cada toque, a partir do último contato):
//   1º toque:  2 horas
//   2º toque:  6 horas
//   3º toque: 24 horas
//   4º toque: 72 horas
//   5º toque:  7 dias
// Só reengaja em HORÁRIO COMERCIAL: se o momento do toque cair fora do horário,
// adia para a próxima abertura (a Carol não chama de madrugada). Responder ao
// cliente que escreve fora do horário continua normal — isto vale só pro toque
// proativo. Rodado pelo cron a cada 15 min (/api/cron/whatsapp).
//
// Estado no Lead: followUpEm (quando disparar o próximo toque) e followUpEtapa
// (quantos toques já foram enviados, 0..5). Cada mensagem RECEBIDA reinicia.

import { prisma } from "@/lib/db";
import { auditar } from "@/lib/auditoria";
import { enviarWhatsApp } from "@/lib/whatsapp";
import { brl } from "@/lib/format";
import type { Lead, Imovel } from "@prisma/client";

// Horas de silêncio até cada toque.
const CADENCIA_HORAS = [2, 6, 24, 72, 24 * 7];
const TOTAL_TOQUES = CADENCIA_HORAS.length;

const hora = 3_600_000;

// ─── Horário comercial (America/Sao_Paulo, UTC-3 fixo — o Brasil não tem DST) ─
const TZ_OFFSET_MS = 3 * hora;

function spParts(d: Date) {
  const sp = new Date(d.getTime() - TZ_OFFSET_MS);
  return { dia: sp.getUTCDay(), hora: sp.getUTCHours(), y: sp.getUTCFullYear(), mo: sp.getUTCMonth(), da: sp.getUTCDate() };
}
// instante UTC de um horário "de parede" de São Paulo
function horarioSP(y: number, mo: number, da: number, h: number): Date {
  return new Date(Date.UTC(y, mo, da, h, 0, 0) + TZ_OFFSET_MS);
}
// janela de atendimento por dia da semana: seg-sex 9-18, sáb 9-12, dom fechado
function janela(dia: number): { abre: number; fecha: number } | null {
  if (dia === 0) return null;
  if (dia === 6) return { abre: 9, fecha: 12 };
  return { abre: 9, fecha: 18 };
}

export function dentroHorarioComercial(d: Date): boolean {
  const p = spParts(d);
  const j = janela(p.dia);
  return Boolean(j && p.hora >= j.abre && p.hora < j.fecha);
}

// Próximo instante dentro do horário comercial (o próprio d, se já estiver).
export function proximoHorarioComercial(d: Date): Date {
  let cur = d;
  for (let i = 0; i < 10; i++) {
    const p = spParts(cur);
    const j = janela(p.dia);
    if (j) {
      if (p.hora < j.abre) return horarioSP(p.y, p.mo, p.da, j.abre);
      if (p.hora < j.fecha) return cur;
    }
    // pula para o próximo dia às 9h (SP)
    const p2 = spParts(cur);
    cur = horarioSP(p2.y, p2.mo, p2.da + 1, 9);
  }
  return cur;
}

// Agenda um toque daqui a `horas`, mas dentro do horário comercial.
function agendarToque(base: Date, horas: number): Date {
  const alvo = new Date(base.getTime() + horas * hora);
  return dentroHorarioComercial(alvo) ? alvo : proximoHorarioComercial(alvo);
}

const daqui = (horas: number) => agendarToque(new Date(), horas);

// Agenda o 1º toque (ou reagenda a partir de agora). Chamada quando a Carol
// registra/atualiza um lead e quando o lead responde.
export async function iniciarCadencia(leadId: number) {
  await prisma.lead.update({
    where: { id: leadId },
    data: { followUpEtapa: 0, followUpEm: daqui(CADENCIA_HORAS[0]) },
  });
}

// Lead respondeu: zera o relógio de silêncio (mantém a cadência viva sem
// disparar toque enquanto a conversa está quente).
export async function resetarCadencia(telefone: string, imobiliariaId: number) {
  await prisma.lead.updateMany({
    where: {
      imobiliariaId,
      telefone,
      status: { in: ["NOVO", "ATENDIMENTO", "VISITA_AGENDADA"] },
    },
    data: { followUpEtapa: 0, followUpEm: daqui(CADENCIA_HORAS[0]) },
  });
}

// Texto do toque, no tom da Carol (objetiva, sem emoji, sem travessão), escalando
// a cada etapa e adaptado a locação/compra e a ter (ou não) um imóvel de interesse.
function mensagemToque(lead: Lead & { imovel: Imovel | null }, etapa: number): string {
  const nome = lead.nome.split(" ")[0];
  const compra = lead.finalidade === "COMPRA";
  const acao = compra ? "comprar" : "alugar";
  const im = lead.imovel;
  const valor = im ? (compra ? im.valorVenda : im.valorSugerido) : null;
  const refImovel = im
    ? `o ${im.tipo.toLowerCase()} em ${im.endereco}${valor ? ` (${brl(valor)}${compra ? "" : "/mês"})` : ""}`
    : null;

  switch (etapa) {
    case 1:
      return refImovel
        ? `Oi ${nome}, aqui é a Carol. ${refImovel} que você viu segue disponível. Quer que eu agende uma visita?`
        : `Oi ${nome}, aqui é a Carol. Consegui separar umas opções pra você ${acao}. Me diz o bairro e a faixa de valor que já te mando.`;
    case 2:
      return refImovel
        ? `${nome}, ainda dá pra visitar ${refImovel}. Tenho horários essa semana. Qual dia fica melhor pra você?`
        : `${nome}, seguem aparecendo opções boas pra ${acao}. Me passa o que procura (tipo, bairro, valor) que eu já filtro pra você.`;
    case 3:
      return `${nome}, ainda está procurando imóvel pra ${acao}? Se sim, me conta o que mudou que eu ajusto as opções.`;
    case 4:
      return refImovel
        ? `${nome}, ${refImovel} costuma sair rápido. Se ainda tiver interesse, me avisa que eu seguro uma visita pra você.`
        : `${nome}, não quero te tomar tempo à toa. Se ainda faz sentido ${acao}, me responde aqui que eu retomo com as melhores opções.`;
    default:
      return `${nome}, vou encerrar seu atendimento por enquanto pra não ficar te enchendo. Quando quiser voltar a procurar, é só me chamar por aqui que eu retomo na hora.`;
  }
}

// Registra a mensagem proativa na conversa do lead e envia pelo WhatsApp.
async function enviarToque(lead: Lead & { imovel: Imovel | null }, texto: string) {
  const agente = lead.finalidade === "COMPRA" ? "COMPRA_VENDA" : "VENDAS";
  const conversa = await prisma.conversa.findFirst({
    where: { imobiliariaId: lead.imobiliariaId, contatoTelefone: lead.telefone! },
    orderBy: { atualizadaEm: "desc" },
  });
  const conv =
    conversa ??
    (await prisma.conversa.create({
      data: {
        imobiliariaId: lead.imobiliariaId,
        agente,
        contatoTelefone: lead.telefone!,
        contatoNome: lead.nome,
      },
    }));
  await prisma.mensagem.create({ data: { conversaId: conv.id, autor: "IA", texto } });
  const destinos = conv.contatoJid ? [conv.contatoJid, lead.telefone!] : [lead.telefone!];
  return enviarWhatsApp(lead.telefone!, texto, lead.imobiliariaId, destinos);
}

// Worker da cadência (rodado pelo cron a cada 15 min). Dispara os toques
// vencidos DENTRO do horário comercial, avança a etapa e reprograma o próximo;
// ao esgotar os 5 toques, marca PERDIDO.
export async function processarFollowUps(): Promise<number> {
  const agora = new Date();
  const leads = await prisma.lead.findMany({
    where: {
      status: { in: ["NOVO", "ATENDIMENTO", "VISITA_AGENDADA"] },
      telefone: { not: null },
      // Lead com retomada agendada tem followUpEm nulo de propósito: quem manda
      // nele é retomarEm.
      OR: [{ followUpEm: { not: null, lte: agora } }, { retomarEm: { not: null, lte: agora } }],
    },
    include: { imovel: true },
    take: 60,
  });

  let enviados = 0;
  for (const lead of leads) {
    // Fora do horário comercial: adia o toque para a próxima abertura (não chama
    // de madrugada) e não avança a etapa.
    if (!dentroHorarioComercial(agora)) {
      await prisma.lead.update({ where: { id: lead.id }, data: { followUpEm: proximoHorarioComercial(agora) } });
      continue;
    }

    // Retomada agendada (hoje: nome restrito aguardando quitação). Enquanto a
    // data não chega, a Carol NÃO toca no assunto — insistir com quem não pode
    // financiar só queima o contato. Na data, ela volta uma vez e a cadência
    // normal recomeça do zero.
    if (lead.retomarEm) {
      if (lead.retomarEm.getTime() > agora.getTime()) continue;
      const quandoDisse = lead.retomarEm.toLocaleDateString("pt-BR");
      const texto =
        `Oi ${lead.nome.split(" ")[0]}, aqui é a Carol. Você tinha me falado que ia resolver ` +
        `aquela pendência do nome até ${quandoDisse}. Conseguiu? Se já estiver limpo, a gente retoma de onde parou.`;
      const envio = await enviarToque(lead, texto).catch(() => null);
      if (envio?.enviado === false) continue; // tenta de novo no próximo ciclo
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          retomarEm: null,
          retomarMotivo: null,
          followUpEtapa: 0,
          followUpEm: daqui(CADENCIA_HORAS[0]!),
        },
      });
      await auditar("LEAD_RETOMADO", "Lead", lead.id, `retomada agendada (${quandoDisse})`);
      enviados++;
      continue;
    }

    // Respeita o handoff humano (#8): se a equipe assumiu a conversa desse lead,
    // a IA fica quieta e NÃO manda follow-up (retoma quando reativarem a IA).
    const conversa = await prisma.conversa.findFirst({
      where: { imobiliariaId: lead.imobiliariaId, contatoTelefone: lead.telefone! },
      orderBy: { atualizadaEm: "desc" },
      select: { iaPausada: true },
    });
    if (conversa?.iaPausada) continue;

    const etapa = lead.followUpEtapa + 1; // toque que vamos enviar agora
    if (etapa > TOTAL_TOQUES) {
      // segurança (normalmente já vira PERDIDO no 5º toque abaixo)
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "PERDIDO", followUpEm: null } });
      await auditar("LEAD_PERDIDO_SEM_RESPOSTA", "Lead", lead.id, `sem resposta após ${TOTAL_TOQUES} toques`);
      continue;
    }
    const texto = mensagemToque(lead, etapa);
    const envio = await enviarToque(lead, texto).catch(() => null);

    // Falha REAL de envio (provedor ativo mas não entregou): NÃO avança a etapa,
    // tenta de novo em ~2h (dentro do horário comercial). Modo demo conta como
    // enviado, para a cadência progredir nos testes sem loop.
    const falhaReal = !envio || (!envio.enviado && envio.provedor !== "demo");
    if (falhaReal) {
      await prisma.lead.update({ where: { id: lead.id }, data: { followUpEm: agendarToque(agora, 2) } });
      continue;
    }

    if (etapa >= TOTAL_TOQUES) {
      // último toque (despedida) entregue: encerra a cadência marcando PERDIDO
      // agora — não deixa o lead parado mais 7 dias.
      await prisma.lead.update({
        where: { id: lead.id },
        data: { followUpEtapa: etapa, status: "PERDIDO", followUpEm: null },
      });
      await auditar("FOLLOWUP_LEAD_IA", "Lead", lead.id, `toque ${etapa}/${TOTAL_TOQUES} (último) para ${lead.nome}`);
      await auditar("LEAD_PERDIDO_SEM_RESPOSTA", "Lead", lead.id, `sem resposta após ${TOTAL_TOQUES} toques`);
    } else {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { followUpEtapa: etapa, followUpEm: agendarToque(agora, CADENCIA_HORAS[etapa]) },
      });
      await auditar("FOLLOWUP_LEAD_IA", "Lead", lead.id, `toque ${etapa}/${TOTAL_TOQUES} para ${lead.nome}`);
    }
    enviados++;
  }
  return enviados;
}

// ─── Avisos ao proprietário agendados fora do horário comercial (M4) ────────
// Despachado pelo cron de 15 min. Só envia o que já venceu e ainda não foi
// avisado — a marcação de proprietarioAvisadoEm mantém a idempotência.
export async function enviarAvisosProprietarioAgendados(): Promise<number> {
  const agora = new Date();
  if (!dentroHorarioComercial(agora)) return 0;

  const pendentes = await prisma.ocorrencia.findMany({
    where: {
      avisoAgendadoPara: { lte: agora },
      proprietarioAvisadoEm: null,
      avisoTexto: { not: null },
    },
    include: { imovel: { include: { proprietario: true } } },
    take: 50,
  });

  let enviados = 0;
  for (const oc of pendentes) {
    const telefone = oc.imovel.proprietario?.telefone;
    if (!telefone) continue;
    try {
      const { enviarWhatsApp } = await import("@/lib/whatsapp");
      await enviarWhatsApp(telefone, oc.avisoTexto!, oc.imovel.imobiliariaId);
      await prisma.ocorrencia.update({
        where: { id: oc.id },
        data: { proprietarioAvisadoEm: new Date(), avisoAgendadoPara: null },
      });
      enviados++;
    } catch (e) {
      console.error("aviso ao proprietário falhou:", e);
    }
  }
  return enviados;
}
