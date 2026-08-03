// Handoff humano por conversa (#8): quando a equipe assume UMA conversa, a IA
// fica quieta só nela (as demais seguem no automático) até ser reativada.
//
// Duas formas de "assumir":
//  a) pelo painel — a equipe manda uma resposta pela tela (registrarRespostaEquipe);
//  b) pelo próprio WhatsApp — o atendente responde do celular do negócio; o
//     webhook recebe um fromMe que NÃO é eco da nossa IA e pausa a conversa.
// Em ambos os casos grava a mensagem como ATENDENTE e marca iaPausada=true.

import { prisma } from "@/lib/db";
import { dividirEmBolhas } from "@/lib/whatsapp";

// Normaliza um texto para comparar eco (a uazapi reentrega o que enviamos).
function normalizar(t: string): string {
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}

// Uma mensagem fromMe é eco de algo que o SISTEMA mandou (IA ou resposta da
// equipe pelo painel) quando bate com uma das últimas mensagens não-cliente da
// conversa. Se não bate, foi um humano digitando pelo celular do negócio.
export async function ehEcoDoSistema(conversaId: number, texto: string): Promise<boolean> {
  const alvo = normalizar(texto);
  if (!alvo) return true; // sem texto: trata como eco (nada a fazer)
  const recentes = await prisma.mensagem.findMany({
    where: { conversaId, autor: { in: ["IA", "ATENDENTE"] } },
    orderBy: { criadaEm: "desc" },
    take: 12,
    select: { texto: true },
  });
  return recentes.some((m) => {
    const n = normalizar(m.texto);
    if (n === alvo) return true;
    // A mensagem que ENVIAMOS foi quebrada nas MESMAS bolhas do envio real; o eco
    // de qualquer bolha (mesmo curta, tipo "Fechado!") é reconhecido comparando
    // com cada bolha de fato — sem o falso positivo que pausava a IA à toa.
    const bolhas = dividirEmBolhas(m.texto).map(normalizar);
    if (bolhas.includes(alvo)) return true;
    // fallback: trecho longo dentro da mensagem (cobre variações de formatação).
    return alvo.length >= 12 && n.includes(alvo);
  });
}

// Registra a resposta enviada pela EQUIPE (painel) e pausa a IA nesta conversa.
export async function registrarRespostaEquipe(conversaId: number, texto: string) {
  await prisma.mensagem.create({
    data: { conversaId, autor: "ATENDENTE", texto },
  });
  await prisma.conversa.update({ where: { id: conversaId }, data: { iaPausada: true } });
}

// Um fromMe que não é eco = atendente humano assumiu pelo celular do negócio.
export async function assumirPorMensagemDoNegocio(conversaId: number, texto: string) {
  await prisma.mensagem.create({
    data: { conversaId, autor: "ATENDENTE", texto },
  });
  await prisma.conversa.update({ where: { id: conversaId }, data: { iaPausada: true } });
}

export async function pausarIA(conversaId: number) {
  await prisma.conversa.update({ where: { id: conversaId }, data: { iaPausada: true } });
}

export async function reativarIA(conversaId: number) {
  await prisma.conversa.update({ where: { id: conversaId }, data: { iaPausada: false } });
}

// Rede de segurança (#4): reativa a IA em conversas que a equipe assumiu mas
// "esqueceu" — o cliente mandou a última mensagem e ninguém respondeu há mais de
// 24h. Assim o lead não fica no vácuo. O normal é reativar na mão pelo painel;
// isto é só o resgate automático. Retorna quantas conversas foram reativadas.
export async function reativarConversasEsquecidas(horas = 24): Promise<number> {
  const limite = new Date(Date.now() - horas * 3_600_000);
  const pausadas = await prisma.conversa.findMany({
    where: { iaPausada: true, atualizadaEm: { lt: limite } },
    select: { id: true },
  });
  let reativadas = 0;
  for (const c of pausadas) {
    // Última mensagem foi do CLIENTE (está esperando resposta)?
    const ultima = await prisma.mensagem.findFirst({
      where: { conversaId: c.id },
      orderBy: { criadaEm: "desc" },
      select: { autor: true, criadaEm: true },
    });
    if (ultima && ultima.autor === "CLIENTE" && ultima.criadaEm < limite) {
      await prisma.conversa.update({ where: { id: c.id }, data: { iaPausada: false } });
      reativadas++;
    }
  }
  return reativadas;
}
