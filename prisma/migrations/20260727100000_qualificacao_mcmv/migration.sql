-- Lead de EMPREENDIMENTO: na planta ainda não existe unidade, então o lead
-- aponta para o prédio. É este campo que dispara a qualificação de financiamento.
ALTER TABLE "Lead" ADD COLUMN "empreendimentoId" INTEGER;
CREATE INDEX "Lead_empreendimentoId_idx" ON "Lead"("empreendimentoId");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_empreendimentoId_fkey"
    FOREIGN KEY ("empreendimentoId") REFERENCES "Empreendimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Qualificação de financiamento do comprador. Separada do Lead porque só vale
-- para o funil de compra e porque se preenche aos poucos: cada campo é opcional
-- até a pessoa responder.
CREATE TABLE "QualificacaoMcmv" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "primeiroImovel" BOOLEAN,
    "vinculo" TEXT,
    "tresAnosRegistro" BOOLEAN,
    "dependentes" INTEGER,
    "rendaBrutaMensal" DECIMAL(14,2),
    "dataNascimento" TIMESTAMP(3),
    "temFgts" BOOLEAN,
    "documentosRecebidos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualificacaoMcmv_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QualificacaoMcmv_leadId_key" ON "QualificacaoMcmv"("leadId");

-- Cascade: a qualificação não sobrevive ao lead — é dado dele, não do sistema.
ALTER TABLE "QualificacaoMcmv" ADD CONSTRAINT "QualificacaoMcmv_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
