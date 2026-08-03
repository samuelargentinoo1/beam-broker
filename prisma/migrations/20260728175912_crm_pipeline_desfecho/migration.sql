-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "motivoPerda" TEXT,
ADD COLUMN     "probabilidade" DECIMAL(4,3) NOT NULL DEFAULT 0.3,
ADD COLUMN     "travadoAte" TIMESTAMP(3),
ADD COLUMN     "travadoPorId" INTEGER;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_travadoPorId_fkey" FOREIGN KEY ("travadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
