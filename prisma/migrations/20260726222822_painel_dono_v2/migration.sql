-- AlterTable
ALTER TABLE "Imobiliaria" ADD COLUMN     "assinaturaAtiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bloqueadaEm" TIMESTAMP(3),
ADD COLUMN     "modulos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "planoId" INTEGER,
ADD COLUMN     "trialAte" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "precisaTrocarSenha" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "superadmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Plano" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "mensalidadeCentavos" INTEGER NOT NULL DEFAULT 0,
    "setupCentavos" INTEGER NOT NULL DEFAULT 0,
    "porContratoAtivoCentavos" INTEGER NOT NULL DEFAULT 0,
    "porLeadAtendidoCentavos" INTEGER NOT NULL DEFAULT 0,
    "cotaIaCentavos" INTEGER NOT NULL DEFAULT 0,
    "multiplicadorExcedenteMilesimos" INTEGER NOT NULL DEFAULT 0,
    "aoEstourarCota" TEXT NOT NULL DEFAULT 'AVISAR',
    "limiteUsuarios" INTEGER NOT NULL DEFAULT 0,
    "limiteImoveis" INTEGER NOT NULL DEFAULT 0,
    "modulos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plano_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plano_nome_key" ON "Plano"("nome");

-- AddForeignKey
ALTER TABLE "Imobiliaria" ADD CONSTRAINT "Imobiliaria_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE SET NULL ON UPDATE CASCADE;
