// Rotinas de sistema (cron) — NÃO é "use server": estas funções operam em
// escopo global/por-imobiliária e são chamadas apenas pelo servidor (cron via
// lib/proativo.ts), NUNCA expostas como Server Action ao cliente. Manter fora do
// arquivo de actions é o que impede um usuário qualquer de disparar cobrança/
// geração de faturas de todos os tenants.

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditar } from "@/lib/auditoria";
import { centavos } from "@/lib/financeiro";
import { competenciaAtual, dataVencimento, partesBrasilia } from "@/lib/format";
import { emitirCobranca } from "@/lib/gateway";
import { exigirSessao } from "@/lib/sessao";

// Gera as faturas da competência atual para os contratos ativos sem fatura no
// mês e emite a cobrança no gateway. Robusto: uma falha em um contrato (ex.:
// Asaas fora) NÃO aborta os demais — a fatura fica sem gateway e é reprocessada
// no próximo ciclo. A marcação de "cobrada" das manutenções é atômica com a
// criação da fatura (não fica marcada sem fatura).
// uso interno/cron — NÃO exponha na UI. Sem imobiliariaId roda para TODOS os
// tenants (só o cron faz isso). A UI deve usar gerarFaturasDoMesDaSessao().
export async function gerarFaturasDoMes(imobiliariaId?: number) {
  const competencia = competenciaAtual();
  const contratos = await prisma.contrato.findMany({
    where: {
      status: "ATIVO",
      faturas: { none: { competencia } },
      ...(imobiliariaId ? { imovel: { imobiliariaId } } : {}),
    },
    include: { imovel: { include: { imobiliaria: true } }, inquilino: true },
  });
  // Elimina o N+1: busca TODAS as manutenções pendentes do inquilino dos imóveis
  // destes contratos numa query só e agrupa em memória (antes era 1 query por
  // contrato dentro do loop).
  const imovelIds = [...new Set(contratos.map((c) => c.imovelId))];
  const manutencoesTodas = imovelIds.length
    ? await prisma.ocorrencia.findMany({
        where: {
          imovelId: { in: imovelIds },
          responsavelCusto: "INQUILINO",
          status: "CONCLUIDA",
          cobradaEm: null,
          custo: { gt: 0 },
        },
      })
    : [];
  const porImovel = new Map<number, typeof manutencoesTodas>();
  for (const o of manutencoesTodas) {
    const arr = porImovel.get(o.imovelId) ?? [];
    arr.push(o);
    porImovel.set(o.imovelId, arr);
  }
  const { ano, mes } = partesBrasilia();
  let geradas = 0;
  for (const ct of contratos) {
    try {
      const manutencoesInquilino = porImovel.get(ct.imovelId) ?? [];
      const custosInquilino = manutencoesInquilino.reduce(
        (s, o) => s.plus(o.custo ?? 0),
        new Prisma.Decimal(0)
      );
      const encargos = centavos(
        new Prisma.Decimal(ct.imovel.valorCondominio ?? 0)
          .plus(ct.imovel.valorIptuMensal ?? 0)
          .plus(custosInquilino)
      );
      const seguroFianca = centavos(ct.valorAluguel.times(ct.seguroFiancaPercent).div(100));

      // fatura + marcação das manutenções na MESMA transação (BUG-8)
      const [fatura] = await prisma.$transaction([
        prisma.fatura.create({
          data: {
            imobiliariaId: ct.imobiliariaId,
            contratoId: ct.id,
            competencia,
            vencimento: dataVencimento(ano, mes, ct.diaVencimento),
            valorAluguel: ct.valorAluguel,
            valorEncargos: encargos,
            valorSeguroFianca: seguroFianca,
            valorTotal: centavos(ct.valorAluguel.plus(encargos).plus(seguroFianca)),
          },
        }),
        ...(manutencoesInquilino.length
          ? [prisma.ocorrencia.updateMany({
              where: { id: { in: manutencoesInquilino.map((o) => o.id) } },
              data: { cobradaEm: new Date() },
            })]
          : []),
      ]);
      geradas++;

      // Cobrança no gateway é best-effort: se falhar, a fatura fica sem gateway
      // (reprocessável) e o loop segue para os próximos contratos (BUG-3).
      try {
        const cobranca = await emitirCobranca(fatura, ct.inquilino, ct.imovel.imobiliaria.asaasApiKey);
        await prisma.fatura.update({ where: { id: fatura.id }, data: cobranca });
      } catch (e) {
        console.error(`emitirCobranca falhou p/ fatura ${fatura.id} (${ct.codigo}):`, e);
      }
    } catch (e) {
      console.error(`gerarFaturasDoMes: contrato ${ct.codigo} falhou, seguindo:`, e);
    }
  }
  revalidatePath("/faturas");
  return geradas;
}

// uso interno/cron — NÃO exponha na UI. Marca como ATRASADA toda fatura aberta
// com vencimento passado (por tenant se informado; sem id = global/cron). A UI
// deve usar atualizarFaturasAtrasadasDaSessao().
export async function atualizarFaturasAtrasadas(imobiliariaId?: number) {
  await prisma.fatura.updateMany({
    where: {
      status: "ABERTA",
      vencimento: { lt: new Date() },
      ...(imobiliariaId ? { contrato: { imovel: { imobiliariaId } } } : {}),
    },
    data: { status: "ATRASADA" },
  });
}

// uso interno/cron — NÃO exponha na UI. Régua de cobrança: WhatsApp para cada
// fatura em atraso, com valores atualizados, registrando no histórico de
// conversas. A UI deve usar enviarReguaCobrancaDaSessao().
export async function enviarReguaCobranca(imobiliariaId?: number) {
  const { calcularEncargosAtraso } = await import("@/lib/financeiro");
  const { brl, competenciaBr, dataBr, diasEmAtraso } = await import("@/lib/format");
  const { enviarWhatsApp } = await import("@/lib/whatsapp");

  // Idempotência: só cobra faturas nunca cobradas OU cobradas há mais de 5 dias —
  // rodar a régua duas vezes no mesmo dia não manda a cobrança em dobro.
  const corte = new Date(Date.now() - 5 * 24 * 3600 * 1000);
  const atrasadas = await prisma.fatura.findMany({
    where: {
      status: "ATRASADA",
      OR: [{ ultimaCobrancaEm: null }, { ultimaCobrancaEm: { lt: corte } }],
      ...(imobiliariaId ? { contrato: { imovel: { imobiliariaId } } } : {}),
    },
    include: { contrato: { include: { inquilino: true, imovel: true } } },
  });

  let enviadas = 0;
  for (const f of atrasadas) {
    const inquilino = f.contrato.inquilino;
    if (!inquilino.telefone) continue;

    const atraso = diasEmAtraso(f.vencimento);
    const { multa, juros } = calcularEncargosAtraso(
      f.valorTotal, atraso, f.contrato.multaPercent, f.contrato.jurosMesPercent
    );
    const total = centavos(f.valorTotal.plus(multa).plus(juros));
    const texto =
      `Olá, ${inquilino.nome.split(" ")[0]}! Identificamos que o aluguel de ${competenciaBr(f.competencia)} ` +
      `do imóvel ${f.contrato.imovel.endereco} venceu em ${dataBr(f.vencimento)} e está em aberto. ` +
      `Valor atualizado para hoje: ${brl(total)} (${brl(f.valorTotal)} + multa e juros). ` +
      (f.pixCopiaECola ? `Você pode pagar pelo PIX copia-e-cola que enviaremos a seguir. ` : "") +
      `Se o pagamento já foi feito, desconsidere esta mensagem. Qualquer dúvida, é só responder por aqui!`;

    const conversa = await prisma.conversa.upsert({
      where: { pessoaId_perfil: { pessoaId: inquilino.id, perfil: "LOCATARIO" } },
      create: { imobiliariaId: inquilino.imobiliariaId, pessoaId: inquilino.id, perfil: "LOCATARIO" },
      update: {},
    });
    await prisma.mensagem.create({ data: { conversaId: conversa.id, autor: "IA", texto } });
    await enviarWhatsApp(inquilino.telefone, texto, inquilino.imobiliariaId);
    if (f.pixCopiaECola) {
      await prisma.mensagem.create({ data: { conversaId: conversa.id, autor: "IA", texto: f.pixCopiaECola } });
      await enviarWhatsApp(inquilino.telefone, f.pixCopiaECola, inquilino.imobiliariaId);
    }
    // marca a cobrança (idempotência) e registra em auditoria
    await prisma.fatura.update({ where: { id: f.id }, data: { ultimaCobrancaEm: new Date() } });
    await auditar("REGUA_COBRANCA_ENVIADA", "Fatura", f.id, `${f.competencia}: ${brl(total)}`, f.imobiliariaId);
    enviadas++;
  }

  revalidatePath("/inadimplencia");
  revalidatePath("/conversas");
  return enviadas;
}

// ─── Wrappers de UI ──────────────────────────────────────────────────────────
// A UI SEMPRE usa estes: vinculam a rotina à imobiliária da SESSÃO, para que um
// usuário nunca dispare a rotina global de todos os tenants por engano.
export async function gerarFaturasDoMesDaSessao() {
  const { imobiliaria } = await exigirSessao();
  return gerarFaturasDoMes(imobiliaria.id);
}
export async function atualizarFaturasAtrasadasDaSessao() {
  const { imobiliaria } = await exigirSessao();
  return atualizarFaturasAtrasadas(imobiliaria.id);
}
export async function enviarReguaCobrancaDaSessao() {
  const { imobiliaria } = await exigirSessao();
  return enviarReguaCobranca(imobiliaria.id);
}
