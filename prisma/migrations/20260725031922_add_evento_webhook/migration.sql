-- CreateTable
CREATE TABLE "EventoWebhook" (
    "provedor" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "processadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoWebhook_pkey" PRIMARY KEY ("provedor","eventoId")
);
