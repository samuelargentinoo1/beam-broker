-- CreateTable
CREATE TABLE "WebhookRate" (
    "imobiliariaId" INTEGER NOT NULL,
    "janela" TIMESTAMP(3) NOT NULL,
    "contagem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WebhookRate_pkey" PRIMARY KEY ("imobiliariaId","janela")
);
