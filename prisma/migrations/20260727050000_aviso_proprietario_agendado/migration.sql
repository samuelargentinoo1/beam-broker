-- Aviso ao proprietário pedido fora do horário comercial fica agendado.
ALTER TABLE "Ocorrencia"
  ADD COLUMN "avisoAgendadoPara" TIMESTAMP(3),
  ADD COLUMN "avisoTexto" TEXT;
