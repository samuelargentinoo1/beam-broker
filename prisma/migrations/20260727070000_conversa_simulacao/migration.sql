-- Conversa de simulação (simulador de IA do painel do dono).
ALTER TABLE "Conversa" ADD COLUMN "simulacao" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Conversa_simulacao_atualizadaEm_idx" ON "Conversa"("simulacao", "atualizadaEm");
