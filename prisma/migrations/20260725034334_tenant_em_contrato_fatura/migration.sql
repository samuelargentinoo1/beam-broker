-- P2.1: imobiliariaId direto em Contrato e Fatura + codigo unico POR imobiliaria.
-- Data-safe: coluna nullable -> popula a partir da relacao -> NOT NULL.

-- Contrato.imobiliariaId (a partir do imovel)
ALTER TABLE "Contrato" ADD COLUMN "imobiliariaId" INTEGER;
UPDATE "Contrato" c
  SET "imobiliariaId" = i."imobiliariaId"
  FROM "Imovel" i
  WHERE i."id" = c."imovelId";
ALTER TABLE "Contrato" ALTER COLUMN "imobiliariaId" SET NOT NULL;

-- Fatura.imobiliariaId (a partir do contrato — ja populado acima)
ALTER TABLE "Fatura" ADD COLUMN "imobiliariaId" INTEGER;
UPDATE "Fatura" f
  SET "imobiliariaId" = c."imobiliariaId"
  FROM "Contrato" c
  WHERE c."id" = f."contratoId";
ALTER TABLE "Fatura" ALTER COLUMN "imobiliariaId" SET NOT NULL;

-- codigo passa a ser unico por (imobiliaria, codigo)
DROP INDEX "Contrato_codigo_key";
CREATE UNIQUE INDEX "Contrato_imobiliariaId_codigo_key" ON "Contrato"("imobiliariaId", "codigo");

-- FKs
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
