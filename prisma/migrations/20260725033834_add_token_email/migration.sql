-- CreateEnum
CREATE TYPE "TipoTokenEmail" AS ENUM ('VERIFICACAO', 'RESET_SENHA');

-- CreateTable
CREATE TABLE "TokenEmail" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" "TipoTokenEmail" NOT NULL,
    "token" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenEmail_token_key" ON "TokenEmail"("token");

-- CreateIndex
CREATE INDEX "TokenEmail_usuarioId_idx" ON "TokenEmail"("usuarioId");

-- AddForeignKey
ALTER TABLE "TokenEmail" ADD CONSTRAINT "TokenEmail_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
