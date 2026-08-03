-- Estado civil muda a coleta: casado traz os dados e os documentos do cônjuge,
-- e a renda dele compõe a renda familiar (é o que faz caber na faixa).
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "estadoCivil" TEXT;

-- Renda que não aparece no imposto de renda o banco não enxerga. Perguntar isso
-- na hora evita descobrir na análise, depois de todo o trabalho feito.
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "rendaDeclaradaIr" BOOLEAN;

ALTER TABLE "QualificacaoMcmv" ADD COLUMN "conjugeNome" TEXT;
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "conjugeVinculo" TEXT;
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "conjugeRendaBrutaMensal" DECIMAL(14,2);
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "conjugeDataNascimento" TIMESTAMP(3);
