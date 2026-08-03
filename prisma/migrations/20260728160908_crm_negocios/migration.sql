-- CreateEnum
CREATE TYPE "ResultadoNegocio" AS ENUM ('ABERTO', 'GANHO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "StatusAtividade" AS ENUM ('PENDENTE', 'CONCLUIDA');

-- DropIndex
DROP INDEX "Conversa_simulacao_atualizadaEm_idx";

-- DropIndex
DROP INDEX "Lead_retomarEm_idx";

-- CreateTable
CREATE TABLE "Funil" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Funil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaseFunil" (
    "id" SERIAL NOT NULL,
    "funilId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FaseFunil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negocio" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "funilId" INTEGER NOT NULL,
    "faseId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "valor" DECIMAL(12,2),
    "dataPrevista" TIMESTAMP(3),
    "responsavelId" INTEGER,
    "contatoId" INTEGER,
    "contatoNome" TEXT,
    "contatoTelefone" TEXT,
    "resultado" "ResultadoNegocio" NOT NULL DEFAULT 'ABERTO',
    "fechadoEm" TIMESTAMP(3),
    "faseDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampoPersonalizado" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'TEXTO',
    "opcoes" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CampoPersonalizado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValorCampoNegocio" (
    "id" SERIAL NOT NULL,
    "negocioId" INTEGER NOT NULL,
    "campoId" INTEGER NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "ValorCampoNegocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtividadeCrm" (
    "id" SERIAL NOT NULL,
    "negocioId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'TAREFA',
    "responsavelId" INTEGER,
    "status" "StatusAtividade" NOT NULL DEFAULT 'PENDENTE',
    "concluidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtividadeCrm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoNegocio" (
    "id" SERIAL NOT NULL,
    "negocioId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalhe" TEXT,
    "autorId" INTEGER,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoNegocio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Funil_imobiliariaId_nome_key" ON "Funil"("imobiliariaId", "nome");

-- CreateIndex
CREATE INDEX "FaseFunil_funilId_ordem_idx" ON "FaseFunil"("funilId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "FaseFunil_funilId_nome_key" ON "FaseFunil"("funilId", "nome");

-- CreateIndex
CREATE INDEX "Negocio_imobiliariaId_funilId_faseId_idx" ON "Negocio"("imobiliariaId", "funilId", "faseId");

-- CreateIndex
CREATE INDEX "Negocio_imobiliariaId_resultado_idx" ON "Negocio"("imobiliariaId", "resultado");

-- CreateIndex
CREATE UNIQUE INDEX "CampoPersonalizado_imobiliariaId_nome_key" ON "CampoPersonalizado"("imobiliariaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "ValorCampoNegocio_negocioId_campoId_key" ON "ValorCampoNegocio"("negocioId", "campoId");

-- CreateIndex
CREATE INDEX "AtividadeCrm_negocioId_status_quando_idx" ON "AtividadeCrm"("negocioId", "status", "quando");

-- CreateIndex
CREATE INDEX "EventoNegocio_negocioId_em_idx" ON "EventoNegocio"("negocioId", "em");

-- AddForeignKey
ALTER TABLE "Funil" ADD CONSTRAINT "Funil_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaseFunil" ADD CONSTRAINT "FaseFunil_funilId_fkey" FOREIGN KEY ("funilId") REFERENCES "Funil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_funilId_fkey" FOREIGN KEY ("funilId") REFERENCES "Funil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_faseId_fkey" FOREIGN KEY ("faseId") REFERENCES "FaseFunil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampoPersonalizado" ADD CONSTRAINT "CampoPersonalizado_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorCampoNegocio" ADD CONSTRAINT "ValorCampoNegocio_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValorCampoNegocio" ADD CONSTRAINT "ValorCampoNegocio_campoId_fkey" FOREIGN KEY ("campoId") REFERENCES "CampoPersonalizado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtividadeCrm" ADD CONSTRAINT "AtividadeCrm_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtividadeCrm" ADD CONSTRAINT "AtividadeCrm_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoNegocio" ADD CONSTRAINT "EventoNegocio_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoNegocio" ADD CONSTRAINT "EventoNegocio_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
