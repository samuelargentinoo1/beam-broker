-- Tri-estado: null é "ainda não perguntei", false é "perguntei e não tem
-- ninguém". Sem essa distinção a IA repergunta para sempre — que é exatamente
-- o comportamento que esta regra existe para matar.
ALTER TABLE "QualificacaoMcmv" ADD COLUMN "temOutroTitular" BOOLEAN;
