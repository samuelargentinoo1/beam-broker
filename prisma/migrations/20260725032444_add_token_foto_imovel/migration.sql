-- Adiciona token não-enumerável a FotoImovel (servida por /api/foto/<token>).
-- Data-safe: coluna nullable -> backfill -> reescreve URLs antigas -> NOT NULL + unique.

-- 1) coluna nullable
ALTER TABLE "FotoImovel" ADD COLUMN "token" TEXT;

-- 2) backfill de linhas existentes com valor único e não-enumerável
UPDATE "FotoImovel"
  SET "token" = replace(gen_random_uuid()::text, '-', '')
  WHERE "token" IS NULL;

-- 3) reescreve as URLs de fallback (/api/foto/<id> -> /api/foto/<token>) das fotos
--    guardadas no banco, para não quebrarem ao remover a rota antiga por id.
UPDATE "FotoImovel"
  SET "url" = regexp_replace("url", '/api/foto/[0-9]+$', '/api/foto/' || "token")
  WHERE "url" ~ '/api/foto/[0-9]+$';

-- 4) impõe NOT NULL + unicidade
ALTER TABLE "FotoImovel" ALTER COLUMN "token" SET NOT NULL;
CREATE UNIQUE INDEX "FotoImovel_token_key" ON "FotoImovel"("token");
