-- Operador do SaaS como ENTIDADE PRÓPRIA.
-- Antes o dono era um Usuario com flag superadmin; como Usuario.imobiliariaId é
-- obrigatório, isso o obrigava a ser funcionário de alguma imobiliária (que
-- entrava na lista de clientes, no MRR e na cota de IA de um tenant real).

-- CreateTable
CREATE TABLE "Operador" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "sessaoVersao" INTEGER NOT NULL DEFAULT 0,
    "totpSecret" TEXT,
    "ultimoAcessoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Operador_email_key" ON "Operador"("email");

-- CreateTable
CREATE TABLE "AcaoOperador" (
    "id" SERIAL NOT NULL,
    "operadorId" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "imobiliariaId" INTEGER,
    "detalhe" TEXT,
    "ip" TEXT,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcaoOperador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcaoOperador_operadorId_em_idx" ON "AcaoOperador"("operadorId", "em");
CREATE INDEX "AcaoOperador_imobiliariaId_em_idx" ON "AcaoOperador"("imobiliariaId", "em");

-- AddForeignKey
ALTER TABLE "AcaoOperador" ADD CONSTRAINT "AcaoOperador_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "Operador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Limpeza dos artefatos do modelo antigo ────────────────────────────────────
-- O tenant técnico "Plataforma" (ehPlataforma) e o usuário-dono criado dentro
-- dele deixam de existir: o dono agora é um Operador, fora do multi-tenant.
-- A remoção é GUARDADA — só apaga o tenant que não tem nenhum dado de carteira,
-- para nunca encostar num cliente de verdade.

CREATE TEMPORARY TABLE "_plataformas_vazias" AS
SELECT i."id"
FROM "Imobiliaria" i
WHERE i."ehPlataforma" = true
  AND NOT EXISTS (SELECT 1 FROM "Pessoa"     x WHERE x."imobiliariaId" = i."id")
  AND NOT EXISTS (SELECT 1 FROM "Imovel"     x WHERE x."imobiliariaId" = i."id")
  AND NOT EXISTS (SELECT 1 FROM "Contrato"   x WHERE x."imobiliariaId" = i."id")
  AND NOT EXISTS (SELECT 1 FROM "Fatura"     x WHERE x."imobiliariaId" = i."id")
  AND NOT EXISTS (SELECT 1 FROM "Lead"       x WHERE x."imobiliariaId" = i."id")
  AND NOT EXISTS (SELECT 1 FROM "Conversa"   x WHERE x."imobiliariaId" = i."id")
  AND NOT EXISTS (SELECT 1 FROM "Documento"  x WHERE x."imobiliariaId" = i."id")
  AND NOT EXISTS (SELECT 1 FROM "Lancamento" x WHERE x."imobiliariaId" = i."id");

DELETE FROM "TokenEmail" WHERE "usuarioId" IN
  (SELECT u."id" FROM "Usuario" u WHERE u."imobiliariaId" IN (SELECT "id" FROM "_plataformas_vazias"));
DELETE FROM "Usuario"      WHERE "imobiliariaId" IN (SELECT "id" FROM "_plataformas_vazias");
DELETE FROM "LogAuditoria" WHERE "imobiliariaId" IN (SELECT "id" FROM "_plataformas_vazias");
DELETE FROM "UsoIA"        WHERE "imobiliariaId" IN (SELECT "id" FROM "_plataformas_vazias");
DELETE FROM "Imobiliaria"  WHERE "id" IN (SELECT "id" FROM "_plataformas_vazias");

DROP TABLE "_plataformas_vazias";

-- AlterTable
ALTER TABLE "Imobiliaria" DROP COLUMN "ehPlataforma";

-- AlterTable
ALTER TABLE "Usuario" DROP COLUMN "superadmin";
