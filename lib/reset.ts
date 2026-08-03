// Reset de dados da imobiliária (limpeza dos dados de mock/teste). Apaga TUDO
// que é operacional do tenant — conversas, CRM, carteira, financeiro, GED,
// logs — mas PRESERVA a própria imobiliária (com suas configurações: tokens,
// WhatsApp, regras, sites de referência) e os usuários (login).
//
// Ordem respeita as chaves estrangeiras (filhos antes dos pais). Escopado
// SEMPRE por imobiliariaId.

import { prisma } from "@/lib/db";

export type ResumoReset = Record<string, number>;

// ─── Reset de UM contato (comando /reset no WhatsApp) ───────────────────────
//
// Apaga o rastro de atendimento e de CRM daquele número: conversas, mensagens,
// memória, leads, qualificação e propostas. É o que permite refazer o mesmo
// atendimento do zero para ajustar a IA.
//
// O QUE NÃO APAGA, de propósito: Pessoa, contratos, faturas e imóveis. Isso é
// carteira da imobiliária, cadastrada fora da conversa — apagar por causa de
// uma mensagem de WhatsApp destruiria dado real e irrecuperável. A resposta ao
// cliente diz exatamente isso, para ninguém achar que apagou mais do que
// apagou.

// Telefone chega em formatos diferentes (com DDI, com máscara, do JID). Compara
// pelos últimos 8 dígitos, como o resto do sistema já faz.
function sufixo(telefone: string): string {
  return telefone.replace(/\D/g, "").slice(-8);
}

export async function limparDadosDoContato(
  imobiliariaId: number,
  telefone: string
): Promise<ResumoReset> {
  const alvo = sufixo(telefone);
  const r: ResumoReset = {};
  if (alvo.length < 8) return r;

  // Filtra em JS pelo sufixo: `endsWith` no banco erraria com máscara
  // ("(16) 99999-0000") e com DDI variando.
  const conversas = await prisma.conversa.findMany({
    where: { imobiliariaId, contatoTelefone: { not: null } },
    select: { id: true, contatoTelefone: true },
  });
  const conversaIds = conversas
    .filter((c) => sufixo(c.contatoTelefone!) === alvo)
    .map((c) => c.id);

  const leads = await prisma.lead.findMany({
    where: { imobiliariaId, telefone: { not: null } },
    select: { id: true, telefone: true },
  });
  const leadIds = leads.filter((l) => sufixo(l.telefone!) === alvo).map((l) => l.id);

  const del = async (nome: string, fn: () => Promise<{ count: number }>) => {
    r[nome] = (await fn()).count;
  };

  if (leadIds.length > 0) {
    // Filhos antes dos pais. QualificacaoMcmv cai por cascade com o lead.
    await del("propostas", () => prisma.proposta.deleteMany({ where: { leadId: { in: leadIds } } }));
    await del("propostasCompra", () =>
      prisma.propostaCompra.deleteMany({ where: { leadId: { in: leadIds } } })
    );
    await del("qualificacoes", () =>
      prisma.qualificacaoMcmv.deleteMany({ where: { leadId: { in: leadIds } } })
    );
    await del("leads", () => prisma.lead.deleteMany({ where: { id: { in: leadIds } } }));
  }

  if (conversaIds.length > 0) {
    await del("mensagens", () =>
      prisma.mensagem.deleteMany({ where: { conversaId: { in: conversaIds } } })
    );
    // A memória de longo prazo mora na própria Conversa, então some com ela.
    await del("conversas", () => prisma.conversa.deleteMany({ where: { id: { in: conversaIds } } }));
  }

  return r;
}

// O comando é escrito, não adivinhado: exige a barra. Sem ela, um cliente que
// escreve "reset" numa frase apagaria o próprio atendimento sem querer.
export function ehComandoReset(texto: string): boolean {
  return /^\s*\/reset(ar)?\s*$/i.test(texto);
}

// O resumo usa a chave do Prisma ("propostasCompra"), que não serve para ler em
// voz alta. Aqui vira [singular, plural] — sem isso a mensagem sai "1 conversas".
const NOME_HUMANO: Record<string, [string, string]> = {
  mensagens: ["mensagem", "mensagens"],
  conversas: ["conversa", "conversas"],
  leads: ["lead", "leads"],
  qualificacoes: ["qualificação", "qualificações"],
  propostas: ["proposta de locação", "propostas de locação"],
  propostasCompra: ["proposta de compra", "propostas de compra"],
};

function contar(chave: string, n: number): string {
  const [um, varios] = NOME_HUMANO[chave] ?? [chave, chave];
  return `${n} ${n === 1 ? um : varios}`;
}

// Resposta enviada ao WhatsApp. Diz o que apagou e o que NÃO apagou — um
// "pronto, apaguei tudo" genérico faz a pessoa achar que perdeu o contrato.
export function mensagemDeReset(resumo: ResumoReset): string {
  const partes = Object.entries(resumo)
    .filter(([, n]) => n > 0)
    .map(([nome, n]) => contar(nome, n));
  const apagado =
    partes.length === 0 ? "Não havia nada para apagar deste contato." : `Apaguei ${partes.join(", ")}.`;
  return (
    `${apagado} O atendimento recomeça do zero a partir da próxima mensagem.\n\n` +
    `Cadastro de pessoas, imóveis, contratos e faturas continuam intactos.`
  );
}

export async function limparDadosImobiliaria(imobiliariaId: number): Promise<ResumoReset> {
  const r: ResumoReset = {};
  const del = async (nome: string, fn: () => Promise<{ count: number }>) => {
    r[nome] = (await fn()).count;
  };

  // Atendimento
  await del("mensagens", () => prisma.mensagem.deleteMany({ where: { conversa: { imobiliariaId } } }));
  await del("conversas", () => prisma.conversa.deleteMany({ where: { imobiliariaId } }));

  // Financeiro dos contratos (repasse → fatura → encargos do contrato)
  await del("repasses", () => prisma.repasse.deleteMany({ where: { fatura: { contrato: { imovel: { imobiliariaId } } } } }));
  await del("faturas", () => prisma.fatura.deleteMany({ where: { contrato: { imovel: { imobiliariaId } } } }));
  await del("reajustes", () => prisma.reajuste.deleteMany({ where: { contrato: { imovel: { imobiliariaId } } } }));
  await del("aditivos", () => prisma.aditivo.deleteMany({ where: { contrato: { imovel: { imobiliariaId } } } }));
  await del("seguros", () => prisma.seguro.deleteMany({ where: { contrato: { imovel: { imobiliariaId } } } }));
  await del("acordos", () => prisma.acordo.deleteMany({ where: { contrato: { imovel: { imobiliariaId } } } }));

  // Operação ligada a imóvel/contrato
  await del("ocorrencias", () => prisma.ocorrencia.deleteMany({ where: { imovel: { imobiliariaId } } }));
  await del("chaves", () => prisma.movimentoChave.deleteMany({ where: { imovel: { imobiliariaId } } }));
  await del("vistorias", () => prisma.vistoria.deleteMany({ where: { imovel: { imobiliariaId } } }));
  await del("fotos", () => prisma.fotoImovel.deleteMany({ where: { imovel: { imobiliariaId } } }));

  // GED
  await del("documentos", () => prisma.documento.deleteMany({ where: { imobiliariaId } }));

  // Contratos (agora sem dependentes)
  await del("contratos", () => prisma.contrato.deleteMany({ where: { imovel: { imobiliariaId } } }));

  // CRM
  await del("propostas", () => prisma.proposta.deleteMany({ where: { imovel: { imobiliariaId } } }));
  await del("propostasCompra", () => prisma.propostaCompra.deleteMany({ where: { imobiliariaId } }));
  await del("leads", () => prisma.lead.deleteMany({ where: { imobiliariaId } }));

  // Carteira
  await del("imoveis", () => prisma.imovel.deleteMany({ where: { imobiliariaId } }));
  await del("pessoas", () => prisma.pessoa.deleteMany({ where: { imobiliariaId } }));

  // Financeiro geral + logs
  await del("lancamentos", () => prisma.lancamento.deleteMany({ where: { imobiliariaId } }));
  await del("webhookLogs", () => prisma.webhookLog.deleteMany({ where: { imobiliariaId } }));
  await del("auditoria", () => prisma.logAuditoria.deleteMany({ where: { imobiliariaId } }));

  return r;
}
