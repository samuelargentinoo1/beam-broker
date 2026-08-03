-- Empreendimentos: o prédio na planta/em obras que AGRUPA unidades.
-- A informação que importa aqui é de obra e de enquadramento (construtora,
-- entrega, MCMV) — a unidade herda tudo isso em vez de repetir no cadastro.
CREATE TABLE "Empreendimento" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "construtora" TEXT NOT NULL,
    "endereco" TEXT,
    "bairro" TEXT,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "cep" TEXT,
    "pontoReferencia" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "metragemM2" DOUBLE PRECISION,
    "precoAvaliacao" DECIMAL(14,2),
    "faixasMcmv" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    -- Três datas distintas: a promessa da construtora, a que gera direito
    -- (início + prazo) e a que só existe depois de entregue.
    "obraIniciadaEm" TIMESTAMP(3),
    "prazoObraMeses" INTEGER,
    "toleranciaMeses" INTEGER NOT NULL DEFAULT 6,
    "entregaPrevista" TIMESTAMP(3),
    "entregaReal" TIMESTAMP(3),
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empreendimento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Empreendimento_imobiliariaId_nome_key" ON "Empreendimento"("imobiliariaId", "nome");
CREATE INDEX "Empreendimento_imobiliariaId_construtora_idx" ON "Empreendimento"("imobiliariaId", "construtora");

ALTER TABLE "Empreendimento" ADD CONSTRAINT "Empreendimento_imobiliariaId_fkey"
    FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A unidade aponta para o empreendimento (opcional: imóvel de terceiro/usado
-- continua existindo sem empreendimento nenhum).
ALTER TABLE "Imovel" ADD COLUMN "empreendimentoId" INTEGER;
ALTER TABLE "Imovel" ADD COLUMN "unidade" TEXT;

CREATE INDEX "Imovel_empreendimentoId_idx" ON "Imovel"("empreendimentoId");

ALTER TABLE "Imovel" ADD CONSTRAINT "Imovel_empreendimentoId_fkey"
    FOREIGN KEY ("empreendimentoId") REFERENCES "Empreendimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
