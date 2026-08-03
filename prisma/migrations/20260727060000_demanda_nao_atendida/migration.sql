-- Demanda identificada pela IA cujo módulo o cliente não contratou.
CREATE TABLE "DemandaNaoAtendida" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "modulo" TEXT NOT NULL,
    "conversaId" INTEGER,
    "resumo" TEXT NOT NULL,
    "foraDoHorario" BOOLEAN NOT NULL DEFAULT false,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandaNaoAtendida_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemandaNaoAtendida_imobiliariaId_em_idx" ON "DemandaNaoAtendida"("imobiliariaId", "em");

ALTER TABLE "DemandaNaoAtendida" ADD CONSTRAINT "DemandaNaoAtendida_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
