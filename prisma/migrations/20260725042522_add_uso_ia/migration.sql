-- AlterTable
ALTER TABLE "Imobiliaria" ADD COLUMN     "iaCotaMensalUsd" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "UsoIA" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "agente" "AgenteIA" NOT NULL,
    "modelo" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "custoUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsoIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsoIA_imobiliariaId_criadoEm_idx" ON "UsoIA"("imobiliariaId", "criadoEm");

-- AddForeignKey
ALTER TABLE "UsoIA" ADD CONSTRAINT "UsoIA_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
