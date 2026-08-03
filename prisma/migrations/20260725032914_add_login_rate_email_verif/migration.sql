-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "emailVerificadoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TentativaLogin" (
    "id" SERIAL NOT NULL,
    "chave" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaLogin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TentativaLogin_chave_em_idx" ON "TentativaLogin"("chave", "em");
