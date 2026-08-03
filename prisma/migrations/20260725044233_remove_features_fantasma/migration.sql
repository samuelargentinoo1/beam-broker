/*
  Warnings:

  - You are about to drop the column `refM2Bairros` on the `Imobiliaria` table. All the data in the column will be lost.
  - You are about to drop the column `refM2Locacao` on the `Imobiliaria` table. All the data in the column will be lost.
  - You are about to drop the column `refM2Venda` on the `Imobiliaria` table. All the data in the column will be lost.
  - You are about to drop the column `sitesReferencia` on the `Imobiliaria` table. All the data in the column will be lost.
  - You are about to drop the column `matricula` on the `Imovel` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Imobiliaria" DROP COLUMN "refM2Bairros",
DROP COLUMN "refM2Locacao",
DROP COLUMN "refM2Venda",
DROP COLUMN "sitesReferencia";

-- AlterTable
ALTER TABLE "Imovel" DROP COLUMN "matricula";
