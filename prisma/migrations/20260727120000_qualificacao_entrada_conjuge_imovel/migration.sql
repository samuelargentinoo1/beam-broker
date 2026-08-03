-- Imóvel no nome do CÔNJUGE também tira o casal do MCMV: no financiamento os
-- dois entram como compradores, então o imóvel dele conta como se fosse dos dois.
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "conjugeImovelProprio" BOOLEAN;

-- Fecham a qualificação: quanto a pessoa tem de entrada e qual parcela ela
-- espera pagar. Sem os dois, apresentar imóvel é chute.
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "entradaDisponivel" DECIMAL(14,2);
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "parcelaDesejada" DECIMAL(14,2);
