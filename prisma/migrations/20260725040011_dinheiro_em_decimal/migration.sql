-- P2.3: dinheiro em Decimal. Converte campos monetarios para DECIMAL(14,2) e
-- percentuais para DECIMAL(7,4). USING ROUND garante a conversao determinista
-- dos dados existentes (double precision -> numeric). Lat/long/areaM2 seguem Float.

-- AlterTable
ALTER TABLE "Acordo" ALTER COLUMN "valorOriginal" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorOriginal"::numeric, 2),
ALTER COLUMN "valorAcordado" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorAcordado"::numeric, 2);

-- AlterTable
ALTER TABLE "Aditivo" ALTER COLUMN "novoValor" SET DATA TYPE DECIMAL(14,2) USING ROUND("novoValor"::numeric, 2);

-- AlterTable
ALTER TABLE "Contrato" ALTER COLUMN "valorAluguel" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorAluguel"::numeric, 2),
ALTER COLUMN "taxaAdmPercent" SET DATA TYPE DECIMAL(7,4) USING ROUND("taxaAdmPercent"::numeric, 4),
ALTER COLUMN "multaPercent" SET DATA TYPE DECIMAL(7,4) USING ROUND("multaPercent"::numeric, 4),
ALTER COLUMN "jurosMesPercent" SET DATA TYPE DECIMAL(7,4) USING ROUND("jurosMesPercent"::numeric, 4),
ALTER COLUMN "seguroFiancaPercent" SET DATA TYPE DECIMAL(7,4) USING ROUND("seguroFiancaPercent"::numeric, 4);

-- AlterTable
ALTER TABLE "Fatura" ALTER COLUMN "valorAluguel" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorAluguel"::numeric, 2),
ALTER COLUMN "valorEncargos" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorEncargos"::numeric, 2),
ALTER COLUMN "valorSeguroFianca" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorSeguroFianca"::numeric, 2),
ALTER COLUMN "valorMulta" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorMulta"::numeric, 2),
ALTER COLUMN "valorJuros" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorJuros"::numeric, 2),
ALTER COLUMN "valorTotal" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorTotal"::numeric, 2),
ALTER COLUMN "valorPago" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorPago"::numeric, 2);

-- AlterTable
ALTER TABLE "Imobiliaria" ALTER COLUMN "taxaAdmPercent" SET DATA TYPE DECIMAL(7,4) USING ROUND("taxaAdmPercent"::numeric, 4),
ALTER COLUMN "multaPercent" SET DATA TYPE DECIMAL(7,4) USING ROUND("multaPercent"::numeric, 4),
ALTER COLUMN "jurosMesPercent" SET DATA TYPE DECIMAL(7,4) USING ROUND("jurosMesPercent"::numeric, 4),
ALTER COLUMN "seguroFiancaPercent" SET DATA TYPE DECIMAL(7,4) USING ROUND("seguroFiancaPercent"::numeric, 4),
ALTER COLUMN "comissaoVendaPercent" SET DATA TYPE DECIMAL(7,4) USING ROUND("comissaoVendaPercent"::numeric, 4);

-- AlterTable
ALTER TABLE "Imovel" ALTER COLUMN "valorSugerido" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorSugerido"::numeric, 2),
ALTER COLUMN "valorCondominio" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorCondominio"::numeric, 2),
ALTER COLUMN "valorIptuMensal" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorIptuMensal"::numeric, 2),
ALTER COLUMN "valorVenda" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorVenda"::numeric, 2);

-- AlterTable
ALTER TABLE "Lancamento" ALTER COLUMN "valor" SET DATA TYPE DECIMAL(14,2) USING ROUND("valor"::numeric, 2);

-- AlterTable
ALTER TABLE "Ocorrencia" ALTER COLUMN "custo" SET DATA TYPE DECIMAL(14,2) USING ROUND("custo"::numeric, 2);

-- AlterTable
ALTER TABLE "Proposta" ALTER COLUMN "rendaMensal" SET DATA TYPE DECIMAL(14,2) USING ROUND("rendaMensal"::numeric, 2),
ALTER COLUMN "valorProposto" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorProposto"::numeric, 2);

-- AlterTable
ALTER TABLE "PropostaCompra" ALTER COLUMN "valorOfertado" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorOfertado"::numeric, 2),
ALTER COLUMN "entrada" SET DATA TYPE DECIMAL(14,2) USING ROUND("entrada"::numeric, 2);

-- AlterTable
ALTER TABLE "Reajuste" ALTER COLUMN "percentual" SET DATA TYPE DECIMAL(7,4) USING ROUND("percentual"::numeric, 4),
ALTER COLUMN "valorAnterior" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorAnterior"::numeric, 2),
ALTER COLUMN "valorNovo" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorNovo"::numeric, 2);

-- AlterTable
ALTER TABLE "Repasse" ALTER COLUMN "valorBase" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorBase"::numeric, 2),
ALTER COLUMN "valorTaxaAdm" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorTaxaAdm"::numeric, 2),
ALTER COLUMN "valorDescontos" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorDescontos"::numeric, 2),
ALTER COLUMN "valorRepasse" SET DATA TYPE DECIMAL(14,2) USING ROUND("valorRepasse"::numeric, 2);

-- AlterTable
ALTER TABLE "Seguro" ALTER COLUMN "valor" SET DATA TYPE DECIMAL(14,2) USING ROUND("valor"::numeric, 2);

