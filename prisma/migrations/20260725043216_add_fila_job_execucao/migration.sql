-- CreateEnum
CREATE TYPE "StatusJob" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO');

-- AlterTable
ALTER TABLE "Fatura" ADD COLUMN     "ultimaCobrancaEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FilaJob" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "status" "StatusJob" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMP(3),

    CONSTRAINT "FilaJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecucaoJob" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "imobiliariaId" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "resultado" TEXT,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadoEm" TIMESTAMP(3),

    CONSTRAINT "ExecucaoJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FilaJob_status_criadoEm_idx" ON "FilaJob"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "ExecucaoJob_imobiliariaId_iniciadoEm_idx" ON "ExecucaoJob"("imobiliariaId", "iniciadoEm");
