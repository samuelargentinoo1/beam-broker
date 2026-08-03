-- Módulo × add-on: campos SEPARADOS.
-- Módulo (ADM, COMERCIAL) define o produto e libera abas; add-on (CAPTACAO) é
-- venda adicional acoplável sobre qualquer produto e não cria aba nenhuma.

-- AlterTable
ALTER TABLE "Imobiliaria" ADD COLUMN "addons" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Plano" ADD COLUMN "addons" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Migra os dados existentes: "CAPTACAO" estava indevidamente dentro de modulos
-- (Comercial e Completo vinham com ela embutida). Move para addons, preservando
-- quem já tinha o recurso — ninguém perde Captação nesta migração.
UPDATE "Imobiliaria"
   SET "addons"  = ARRAY['CAPTACAO']::TEXT[],
       "modulos" = array_remove("modulos", 'CAPTACAO')
 WHERE 'CAPTACAO' = ANY("modulos");

UPDATE "Plano"
   SET "addons"  = ARRAY['CAPTACAO']::TEXT[],
       "modulos" = array_remove("modulos", 'CAPTACAO')
 WHERE 'CAPTACAO' = ANY("modulos");
