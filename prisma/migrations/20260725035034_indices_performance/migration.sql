-- P2.2: formaliza os indices de performance no schema.
-- Concilia com o antigo schema-guard (que criava indices em runtime, com nomes
-- customizados, em producao): dropa os ORFAOS nao re-declarados e cria os
-- declarados com IF NOT EXISTS (no-op para os que o guard ja criou com o mesmo
-- nome). No banco local (baseline sem guard) os DROP IF EXISTS sao no-op.

-- Orfaos do guard, agora nao declarados (substituidos por compostos ou de baixa
-- cardinalidade isolada):
DROP INDEX IF EXISTS "Contrato_inquilinoId_idx";
DROP INDEX IF EXISTS "Contrato_status_idx";
DROP INDEX IF EXISTS "Fatura_status_idx";
DROP INDEX IF EXISTS "Repasse_status_idx";
DROP INDEX IF EXISTS "Lancamento_imob_tipo_data_idx";
DROP INDEX IF EXISTS "Conversa_imob_tel_atual_idx";
DROP INDEX IF EXISTS "LogAuditoria_imob_criadoEm_idx";

-- Indices declarados (idempotentes):
CREATE INDEX IF NOT EXISTS "Contrato_imobiliariaId_status_idx" ON "Contrato"("imobiliariaId", "status");
CREATE INDEX IF NOT EXISTS "Contrato_imovelId_idx" ON "Contrato"("imovelId");
CREATE INDEX IF NOT EXISTS "Conversa_imobiliariaId_atualizadaEm_idx" ON "Conversa"("imobiliariaId", "atualizadaEm");
CREATE INDEX IF NOT EXISTS "Documento_imobiliariaId_idx" ON "Documento"("imobiliariaId");
CREATE INDEX IF NOT EXISTS "Fatura_imobiliariaId_status_idx" ON "Fatura"("imobiliariaId", "status");
CREATE INDEX IF NOT EXISTS "Fatura_contratoId_status_idx" ON "Fatura"("contratoId", "status");
CREATE INDEX IF NOT EXISTS "Imovel_imobiliariaId_status_idx" ON "Imovel"("imobiliariaId", "status");
CREATE INDEX IF NOT EXISTS "Imovel_imobiliariaId_finalidade_idx" ON "Imovel"("imobiliariaId", "finalidade");
CREATE INDEX IF NOT EXISTS "Lancamento_imobiliariaId_tipo_data_idx" ON "Lancamento"("imobiliariaId", "tipo", "data");
CREATE INDEX IF NOT EXISTS "Lead_imobiliariaId_status_idx" ON "Lead"("imobiliariaId", "status");
CREATE INDEX IF NOT EXISTS "Lead_followUpEm_idx" ON "Lead"("followUpEm");
CREATE INDEX IF NOT EXISTS "LogAuditoria_imobiliariaId_criadoEm_idx" ON "LogAuditoria"("imobiliariaId", "criadoEm");
CREATE INDEX IF NOT EXISTS "Mensagem_conversaId_criadaEm_idx" ON "Mensagem"("conversaId", "criadaEm");
CREATE INDEX IF NOT EXISTS "Ocorrencia_imovelId_status_idx" ON "Ocorrencia"("imovelId", "status");
CREATE INDEX IF NOT EXISTS "WebhookLog_imobiliariaId_recebidoEm_idx" ON "WebhookLog"("imobiliariaId", "recebidoEm");
