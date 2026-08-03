"use server";

// Ações da 4ª IA (compra e venda): decisão das propostas de compra pela equipe.
// A venda em si (escritura/financiamento) é conduzida fora do sistema; aqui
// registramos o andamento e avisamos o comprador pelo WhatsApp quando aceita.

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { centavos } from "@/lib/financeiro";
import { carregarPropostaCompra } from "@/lib/escopo";
import { auditar } from "@/lib/auditoria";
import { enviarWhatsApp } from "@/lib/whatsapp";
import { brl } from "@/lib/format";
import type { StatusPropostaCompra } from "@prisma/client";

export async function decidirPropostaCompra(propostaId: number, decisao: StatusPropostaCompra) {
  // escopo de tenant: carrega a proposta de compra (imobiliariaId direto) da sessão
  const { registro: proposta, imobiliaria } = await carregarPropostaCompra(propostaId, {
    imovel: true,
  });
  if (proposta.status === decisao) return; // idempotente: nada muda, não repete efeitos

  // Transição atômica: só segue se ESTE update mudou o status (evita comissão
  // dobrada se a ação for disparada duas vezes ao mesmo tempo).
  const mudou = await prisma.propostaCompra.updateMany({
    where: { id: proposta.id, imobiliariaId: imobiliaria.id, status: { not: decisao } },
    data: { status: decisao },
  });
  if (mudou.count === 0) return;
  await auditar("PROPOSTA_COMPRA_DECIDIDA", "PropostaCompra", proposta.id, `${decisao} — ${proposta.imovel.codigo}`);

  // Aceita: registra a comissão de venda como receita prevista (padrão da
  // imobiliária em Configurações) e marca o imóvel como vendido (INATIVO).
  // Só entra aqui uma vez, pois a proposta não estava ACEITA antes deste update.
  if (decisao === "ACEITA") {
    const pct = imobiliaria.comissaoVendaPercent ?? new Prisma.Decimal(6);
    const comissao = centavos(proposta.valorOfertado.times(new Prisma.Decimal(pct).div(100)));
    await prisma.lancamento.create({
      data: {
        imobiliariaId: imobiliaria.id,
        tipo: "RECEITA",
        categoria: "Comissão de venda",
        descricao: `Venda ${proposta.imovel.codigo} — ${proposta.nome} (${pct}% de ${brl(proposta.valorOfertado)})`,
        valor: comissao,
      },
    });
    await prisma.imovel.update({ where: { id: proposta.imovelId }, data: { status: "INATIVO" } }).catch(() => {});
    await auditar("VENDA_FECHADA", "PropostaCompra", proposta.id, `comissão ${brl(comissao)} (${pct}%)`);
  }

  // Avisa o comprador no WhatsApp quando ACEITA (fecho positivo do funil).
  if (decisao === "ACEITA" && proposta.telefone) {
    const conversa = await prisma.conversa.findFirst({
      where: { imobiliariaId: imobiliaria.id, contatoTelefone: proposta.telefone },
      orderBy: { atualizadaEm: "desc" },
    });
    const destinos = conversa?.contatoJid ? [conversa.contatoJid, proposta.telefone] : [proposta.telefone];
    const msg =
      `Boa notícia! O proprietário aceitou sua proposta de ${brl(proposta.valorOfertado)} no imóvel ${proposta.imovel.codigo}.\n\n` +
      `A equipe já vai te chamar pra alinhar a documentação e os próximos passos.`;
    await enviarWhatsApp(proposta.telefone, msg, imobiliaria.id, destinos).catch(() => {});
  }

  revalidatePath("/propostas");
}
