// Baixa de pagamento de fatura — usada tanto pela ação manual (tela de
// faturas) quanto pelo webhook do gateway (baixa automática).
//
// Aplica as regras financeiras DO CONTRATO: multa/juros configuráveis,
// modelo de remuneração (percentual ou primeiro aluguel) e seguro-fiança
// (repassado à seguradora, fora do repasse ao proprietário).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditar } from "@/lib/auditoria";
import {
  calcularEncargosAtraso,
  calcularRemuneracao,
  calcularRepasse,
  centavos,
} from "@/lib/financeiro";
import { diasEmAtraso } from "@/lib/format";

export async function baixarFatura(params: {
  faturaId: number;
  formaPagamento: string;
  valorPago?: number; // se ausente, calcula total + multa/juros do dia
}) {
  const fatura = await prisma.fatura.findUniqueOrThrow({
    where: { id: params.faturaId },
    include: { contrato: { include: { imovel: true } } },
  });
  if (fatura.status === "PAGA" || fatura.status === "CANCELADA") return fatura;
  const contrato = fatura.contrato;

  const atraso = diasEmAtraso(fatura.vencimento);
  const { multa, juros } = calcularEncargosAtraso(
    fatura.valorTotal,
    atraso,
    contrato.multaPercent,
    contrato.jurosMesPercent
  );
  const valorPago =
    params.valorPago != null
      ? centavos(params.valorPago)
      : centavos(fatura.valorTotal.plus(multa).plus(juros));

  // Remuneração da imobiliária (só sobre faturas de aluguel)
  let taxaAdm = new Prisma.Decimal(0);
  if (fatura.categoria === "ALUGUEL") {
    const faturasPagasAntes = await prisma.fatura.count({
      where: { contratoId: contrato.id, categoria: "ALUGUEL", status: "PAGA" },
    });
    taxaAdm = calcularRemuneracao({
      modeloRemuneracao: contrato.modeloRemuneracao,
      valorAluguel: fatura.valorAluguel,
      taxaAdmPercent: contrato.taxaAdmPercent,
      ehPrimeiraFatura: faturasPagasAntes === 0,
    });
  }

  // Manutenções por conta do proprietário, concluídas e ainda não cobradas,
  // são abatidas deste repasse.
  const manutencoesProprietario = await prisma.ocorrencia.findMany({
    where: {
      imovelId: contrato.imovelId,
      responsavelCusto: "PROPRIETARIO",
      status: "CONCLUIDA",
      cobradaEm: null,
      custo: { gt: 0 },
    },
  });
  const descontos = centavos(
    manutencoesProprietario.reduce((s, o) => s.plus(o.custo ?? 0), new Prisma.Decimal(0))
  );

  const { repasse } = calcularRepasse({
    valorPago,
    taxaAdm,
    descontos,
    seguroFianca: fatura.valorSeguroFianca,
  });

  // Idempotência sob concorrência (ex.: Asaas manda PAYMENT_RECEIVED e
  // PAYMENT_CONFIRMED quase juntos): a PRIMEIRA operação é uma baixa condicional
  // que trava a linha; só quem mudou o status de fato (count===1) cria o repasse.
  // A execução perdedora sai limpa, sem P2002 e sem repasse/lançamento duplicado.
  let jaBaixada = false;
  const atualizada = await prisma.$transaction(async (tx) => {
    const lock = await tx.fatura.updateMany({
      where: { id: fatura.id, status: { notIn: ["PAGA", "CANCELADA"] } },
      data: {
        status: "PAGA",
        pagaEm: new Date(),
        valorMulta: multa,
        valorJuros: juros,
        valorPago,
        formaPagamento: params.formaPagamento,
      },
    });
    if (lock.count === 0) {
      jaBaixada = true;
      return null;
    }
    await tx.repasse.create({
      data: {
        faturaId: fatura.id,
        valorBase: valorPago,
        valorTaxaAdm: taxaAdm,
        valorDescontos: centavos(descontos.plus(fatura.valorSeguroFianca)),
        valorRepasse: repasse,
      },
    });
    if (taxaAdm.gt(0)) {
      await tx.lancamento.create({
        data: {
          imobiliariaId: contrato.imovel.imobiliariaId,
          tipo: "RECEITA",
          categoria:
            contrato.modeloRemuneracao === "PRIMEIRO_ALUGUEL"
              ? "Taxa de intermediação (1º aluguel)"
              : "Taxa de administração",
          descricao: `${contrato.codigo} — ${fatura.competencia}`,
          valor: taxaAdm,
        },
      });
    }
    if (manutencoesProprietario.length > 0) {
      await tx.ocorrencia.updateMany({
        where: { id: { in: manutencoesProprietario.map((o) => o.id) } },
        data: { cobradaEm: new Date() },
      });
    }
    return tx.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
  });

  // Corrida perdida: a fatura já foi baixada por outra execução — devolve o
  // estado atual sem duplicar auditoria/aviso.
  if (jaBaixada || !atualizada) {
    return prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
  }

  await auditar(
    "FATURA_PAGA",
    "Fatura",
    fatura.id,
    `${contrato.codigo} ${fatura.competencia}: R$ ${valorPago.toFixed(2)} via ${params.formaPagamento}` +
      (taxaAdm.gt(0) ? ` · remuneração R$ ${taxaAdm.toFixed(2)}` : "") +
      (fatura.valorSeguroFianca.gt(0) ? ` · seguro-fiança R$ ${fatura.valorSeguroFianca.toFixed(2)}` : "") +
      (descontos.gt(0) ? ` · manutenções R$ ${descontos.toFixed(2)}` : ""),
    contrato.imovel.imobiliariaId
  );

  // Proativo: avisa o proprietário que o aluguel entrou e o repasse está agendado
  const { avisarAluguelRecebido } = await import("@/lib/proativo");
  await avisarAluguelRecebido(fatura.id).catch((e) => console.error("Erro no aviso proativo:", e));

  return atualizada;
}
