-- Intermediação com o proprietário (M4): aprovação de orçamento pelo WhatsApp.

-- AlterTable
ALTER TABLE "Ocorrencia"
  ADD COLUMN "aguardandoAprovacao" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aprovadaEm" TIMESTAMP(3),
  ADD COLUMN "aprovadaPorPessoaId" INTEGER,
  ADD COLUMN "decisaoObservacao" TEXT,
  ADD COLUMN "proprietarioAvisadoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Imobiliaria"
  ADD COLUMN "limiteAprovacaoOrcamentoCentavos" INTEGER NOT NULL DEFAULT 30000;
