-- ── Voz: MiniMax gera a FALA, ElevenLabs continua na TRANSCRIÇÃO ────────────
ALTER TABLE "Imobiliaria" ADD COLUMN "minimaxApiKey" TEXT;
ALTER TABLE "Imobiliaria" ADD COLUMN "minimaxGroupId" TEXT;
ALTER TABLE "Imobiliaria" ADD COLUMN "minimaxVoiceId" TEXT;
-- O percentual nunca foi de um provedor específico: é quanto da conversa vira voz.
ALTER TABLE "Imobiliaria" RENAME COLUMN "elevenlabsAudioPct" TO "audioPct";

-- ── Produto: é por quarto e banheiro que o comprador filtra de verdade ──────
ALTER TABLE "Imovel" ADD COLUMN "quartos" INTEGER;
ALTER TABLE "Imovel" ADD COLUMN "banheiros" INTEGER;
ALTER TABLE "Imovel" ADD COLUMN "suites" INTEGER;
ALTER TABLE "Imovel" ADD COLUMN "vagas" INTEGER;

ALTER TABLE "Empreendimento" ADD COLUMN "quartos" INTEGER;
ALTER TABLE "Empreendimento" ADD COLUMN "banheiros" INTEGER;
ALTER TABLE "Empreendimento" ADD COLUMN "suites" INTEGER;
ALTER TABLE "Empreendimento" ADD COLUMN "vagas" INTEGER;

-- ── Book de venda em PDF, um por empreendimento ─────────────────────────────
-- URL pública: quem baixa o arquivo para mandar no WhatsApp é a uazapi.
ALTER TABLE "Empreendimento" ADD COLUMN "bookUrl" TEXT;
ALTER TABLE "Empreendimento" ADD COLUMN "bookNome" TEXT;

-- ── Qualificação: preferência de produto e parcelamento da entrada ──────────
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "quartosDesejados" INTEGER;
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "banheirosDesejados" INTEGER;
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "localizacaoDesejada" TEXT;
-- Sem entrada, quer parcelar? Só empreendimento não entregue parcela entrada.
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "querParcelarEntrada" BOOLEAN;
