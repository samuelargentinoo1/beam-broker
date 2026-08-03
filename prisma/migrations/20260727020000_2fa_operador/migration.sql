-- 2FA (TOTP) obrigatório para o operador do SaaS.

-- AlterTable
ALTER TABLE "Operador" ADD COLUMN "totpAtivadoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CodigoRecuperacao" (
    "id" SERIAL NOT NULL,
    "operadorId" INTEGER NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodigoRecuperacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodigoRecuperacao_operadorId_usadoEm_idx" ON "CodigoRecuperacao"("operadorId", "usadoEm");

-- AddForeignKey
ALTER TABLE "CodigoRecuperacao" ADD CONSTRAINT "CodigoRecuperacao_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "Operador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
