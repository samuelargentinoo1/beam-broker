-- Nome restrito não financia. Só há dois caminhos: outra pessoa entra como
-- titular, ou espera-se a quitação. Insistir na conversa não abre nenhum dos
-- dois — então a escada para aqui e a volta fica agendada.
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "nomeRestrito" BOOLEAN;
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "previsaoQuitacao" TIMESTAMP(3);
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "nomeAlternativo" TEXT;

-- Retomada agendada do lead: enquanto retomarEm está no futuro, a cadência de
-- 5 toques fica muda. Na data, a Carol volta uma vez e a cadência recomeça.
ALTER TABLE "Lead" ADD COLUMN "retomarEm" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "retomarMotivo" TEXT;
CREATE INDEX "Lead_retomarEm_idx" ON "Lead"("retomarEm");
