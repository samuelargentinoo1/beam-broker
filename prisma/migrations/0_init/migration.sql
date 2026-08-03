-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ModeloRemuneracao" AS ENUM ('PERCENTUAL', 'PRIMEIRO_ALUGUEL');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "StatusImovel" AS ENUM ('DISPONIVEL', 'ALUGADO', 'EM_REFORMA', 'INATIVO');

-- CreateEnum
CREATE TYPE "StatusContrato" AS ENUM ('ATIVO', 'ENCERRADO', 'RESCINDIDO');

-- CreateEnum
CREATE TYPE "IndiceReajuste" AS ENUM ('IGPM', 'IPCA', 'IVAR', 'NENHUM');

-- CreateEnum
CREATE TYPE "StatusAssinatura" AS ENUM ('NAO_ENVIADO', 'PENDENTE', 'ASSINADO');

-- CreateEnum
CREATE TYPE "StatusFatura" AS ENUM ('ABERTA', 'PAGA', 'ATRASADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusRepasse" AS ENUM ('PENDENTE', 'PAGO');

-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "StatusLead" AS ENUM ('NOVO', 'ATENDIMENTO', 'VISITA_AGENDADA', 'PROPOSTA', 'FECHADO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "TemperaturaLead" AS ENUM ('FRIO', 'MORNO', 'QUENTE');

-- CreateEnum
CREATE TYPE "StatusProposta" AS ENUM ('EM_ANALISE', 'APROVADA', 'RECUSADA', 'CONVERTIDA');

-- CreateEnum
CREATE TYPE "StatusPropostaCompra" AS ENUM ('EM_ANALISE', 'CONTRAPROPOSTA', 'ACEITA', 'RECUSADA');

-- CreateEnum
CREATE TYPE "StatusOcorrencia" AS ENUM ('ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "ResponsavelCusto" AS ENUM ('PROPRIETARIO', 'INQUILINO', 'IMOBILIARIA');

-- CreateEnum
CREATE TYPE "TipoAditivo" AS ENUM ('RENOVACAO', 'VALOR', 'GARANTIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "PerfilConversa" AS ENUM ('LOCATARIO', 'PROPRIETARIO');

-- CreateEnum
CREATE TYPE "AgenteIA" AS ENUM ('RECEPCAO', 'ADMINISTRACAO', 'CAPTACAO', 'VENDAS', 'COMPRA_VENDA', 'AJUDA_CORRETOR');

-- CreateEnum
CREATE TYPE "AutorMensagem" AS ENUM ('CLIENTE', 'IA', 'ATENDENTE');

-- CreateTable
CREATE TABLE "Imobiliaria" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "modeloRemuneracao" "ModeloRemuneracao" NOT NULL DEFAULT 'PERCENTUAL',
    "taxaAdmPercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "multaPercent" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "jurosMesPercent" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "seguroFiancaPercent" DOUBLE PRECISION NOT NULL DEFAULT 11,
    "comissaoVendaPercent" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "uazapiToken" TEXT,
    "uazapiUrl" TEXT,
    "whatsappPhoneNumberId" TEXT,
    "asaasApiKey" TEXT,
    "zapsignApiToken" TEXT,
    "elevenlabsApiKey" TEXT,
    "elevenlabsVoiceId" TEXT,
    "elevenlabsAudioPct" INTEGER NOT NULL DEFAULT 40,
    "iasConfig" TEXT,
    "sitesReferencia" TEXT,
    "refM2Venda" DOUBLE PRECISION,
    "refM2Locacao" DOUBLE PRECISION,
    "refM2Bairros" TEXT,
    "telefonesCorretores" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "regrasRevisadas" BOOLEAN NOT NULL DEFAULT false,
    "onboardingDispensado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Imobiliaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" SERIAL NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provedor" TEXT NOT NULL DEFAULT 'uazapi',
    "imobiliariaId" INTEGER,
    "telefone" TEXT,
    "resultado" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'ADMIN',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pessoa" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "tipo" "TipoPessoa" NOT NULL DEFAULT 'FISICA',
    "nome" TEXT NOT NULL,
    "cpfCnpj" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "chavePix" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Imovel" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "bairro" TEXT,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "cep" TEXT,
    "status" "StatusImovel" NOT NULL DEFAULT 'DISPONIVEL',
    "finalidade" TEXT NOT NULL DEFAULT 'LOCACAO',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "valorSugerido" DOUBLE PRECISION,
    "valorVenda" DOUBLE PRECISION,
    "areaM2" DOUBLE PRECISION,
    "valorCondominio" DOUBLE PRECISION,
    "valorIptuMensal" DOUBLE PRECISION,
    "matricula" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proprietarioId" INTEGER NOT NULL,

    CONSTRAINT "Imovel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FotoImovel" (
    "id" SERIAL NOT NULL,
    "imovelId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "dados" BYTEA,
    "mimeType" TEXT,
    "legenda" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FotoImovel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrato" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "imovelId" INTEGER NOT NULL,
    "inquilinoId" INTEGER NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "valorAluguel" DOUBLE PRECISION NOT NULL,
    "diaVencimento" INTEGER NOT NULL DEFAULT 5,
    "modeloRemuneracao" "ModeloRemuneracao" NOT NULL DEFAULT 'PERCENTUAL',
    "taxaAdmPercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "multaPercent" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "jurosMesPercent" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "seguroFiancaPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "indiceReajuste" "IndiceReajuste" NOT NULL DEFAULT 'IGPM',
    "garantia" TEXT,
    "status" "StatusContrato" NOT NULL DEFAULT 'ATIVO',
    "encerradoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assinaturaStatus" "StatusAssinatura" NOT NULL DEFAULT 'NAO_ENVIADO',
    "assinaturaId" TEXT,
    "assinaturaLink" TEXT,
    "assinaturaLinkProprietario" TEXT,
    "assinadoEm" TIMESTAMP(3),

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reajuste" (
    "id" SERIAL NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "indice" TEXT NOT NULL,
    "percentual" DOUBLE PRECISION NOT NULL,
    "valorAnterior" DOUBLE PRECISION NOT NULL,
    "valorNovo" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Reajuste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fatura" (
    "id" SERIAL NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "competencia" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valorAluguel" DOUBLE PRECISION NOT NULL,
    "valorEncargos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorSeguroFianca" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorMulta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorJuros" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotal" DOUBLE PRECISION NOT NULL,
    "status" "StatusFatura" NOT NULL DEFAULT 'ABERTA',
    "pagaEm" TIMESTAMP(3),
    "valorPago" DOUBLE PRECISION,
    "formaPagamento" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gatewayId" TEXT,
    "pixCopiaECola" TEXT,
    "linhaDigitavel" TEXT,
    "linkPagamento" TEXT,
    "categoria" TEXT NOT NULL DEFAULT 'ALUGUEL',
    "acordoId" INTEGER,

    CONSTRAINT "Fatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repasse" (
    "id" SERIAL NOT NULL,
    "faturaId" INTEGER NOT NULL,
    "valorBase" DOUBLE PRECISION NOT NULL,
    "valorTaxaAdm" DOUBLE PRECISION NOT NULL,
    "valorDescontos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorRepasse" DOUBLE PRECISION NOT NULL,
    "status" "StatusRepasse" NOT NULL DEFAULT 'PENDENTE',
    "pagoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repasse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vistoria" (
    "id" SERIAL NOT NULL,
    "imovelId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "laudo" TEXT,

    CONSTRAINT "Vistoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "validade" TIMESTAMP(3),
    "arquivo" TEXT,
    "mimeType" TEXT,
    "tamanho" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pessoaId" INTEGER,
    "imovelId" INTEGER,
    "contratoId" INTEGER,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'SITE',
    "status" "StatusLead" NOT NULL DEFAULT 'NOVO',
    "temperatura" "TemperaturaLead" NOT NULL DEFAULT 'MORNO',
    "finalidade" TEXT NOT NULL DEFAULT 'LOCACAO',
    "imovelId" INTEGER,
    "visitaEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "followUpEm" TIMESTAMP(3),
    "followUpEtapa" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposta" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER,
    "imovelId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "cpfCnpj" TEXT NOT NULL,
    "rendaMensal" DOUBLE PRECISION,
    "valorProposto" DOUBLE PRECISION NOT NULL,
    "prazoMeses" INTEGER NOT NULL DEFAULT 30,
    "garantia" TEXT,
    "scoreCredito" INTEGER,
    "resultadoCredito" TEXT,
    "status" "StatusProposta" NOT NULL DEFAULT 'EM_ANALISE',
    "contratoId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropostaCompra" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "imovelId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "cpfCnpj" TEXT,
    "telefone" TEXT,
    "valorOfertado" DOUBLE PRECISION NOT NULL,
    "formaPagamento" TEXT,
    "entrada" DOUBLE PRECISION,
    "status" "StatusPropostaCompra" NOT NULL DEFAULT 'EM_ANALISE',
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropostaCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ocorrencia" (
    "id" SERIAL NOT NULL,
    "imovelId" INTEGER NOT NULL,
    "contratoId" INTEGER,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "StatusOcorrencia" NOT NULL DEFAULT 'ABERTA',
    "custo" DOUBLE PRECISION,
    "responsavelCusto" "ResponsavelCusto",
    "cobradaEm" TIMESTAMP(3),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" TIMESTAMP(3),

    CONSTRAINT "Ocorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoChave" (
    "id" SERIAL NOT NULL,
    "imovelId" INTEGER NOT NULL,
    "retiradaPor" TEXT NOT NULL,
    "telefone" TEXT,
    "retiradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "devolucaoPrevista" TIMESTAMP(3),
    "devolvidaEm" TIMESTAMP(3),
    "observacoes" TEXT,

    CONSTRAINT "MovimentoChave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seguro" (
    "id" SERIAL NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "seguradora" TEXT NOT NULL,
    "apolice" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "valor" DOUBLE PRECISION,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Seguro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aditivo" (
    "id" SERIAL NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "tipo" "TipoAditivo" NOT NULL,
    "descricao" TEXT NOT NULL,
    "novoValor" DOUBLE PRECISION,
    "novoFim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aditivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acordo" (
    "id" SERIAL NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "valorOriginal" DOUBLE PRECISION NOT NULL,
    "valorAcordado" DOUBLE PRECISION NOT NULL,
    "parcelas" INTEGER NOT NULL,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Acordo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAuditoria" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" INTEGER,
    "detalhes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversa" (
    "id" SERIAL NOT NULL,
    "imobiliariaId" INTEGER NOT NULL,
    "agente" "AgenteIA" NOT NULL DEFAULT 'ADMINISTRACAO',
    "pessoaId" INTEGER,
    "perfil" "PerfilConversa",
    "contatoNome" TEXT,
    "contatoTelefone" TEXT,
    "contatoJid" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "iaPausada" BOOLEAN NOT NULL DEFAULT false,
    "memoria" TEXT,
    "memoriaMensagens" INTEGER NOT NULL DEFAULT 0,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" SERIAL NOT NULL,
    "conversaId" INTEGER NOT NULL,
    "autor" "AutorMensagem" NOT NULL,
    "texto" TEXT NOT NULL,
    "audioDados" BYTEA,
    "audioMime" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Imobiliaria_uazapiToken_key" ON "Imobiliaria"("uazapiToken");

-- CreateIndex
CREATE UNIQUE INDEX "Imobiliaria_whatsappPhoneNumberId_key" ON "Imobiliaria"("whatsappPhoneNumberId");

-- CreateIndex
CREATE INDEX "WebhookLog_recebidoEm_idx" ON "WebhookLog"("recebidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_imobiliariaId_cpfCnpj_key" ON "Pessoa"("imobiliariaId", "cpfCnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Imovel_imobiliariaId_codigo_key" ON "Imovel"("imobiliariaId", "codigo");

-- CreateIndex
CREATE INDEX "FotoImovel_imovelId_idx" ON "FotoImovel"("imovelId");

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_codigo_key" ON "Contrato"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_assinaturaId_key" ON "Contrato"("assinaturaId");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_gatewayId_key" ON "Fatura"("gatewayId");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_contratoId_competencia_key" ON "Fatura"("contratoId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "Repasse_faturaId_key" ON "Repasse"("faturaId");

-- CreateIndex
CREATE INDEX "PropostaCompra_imobiliariaId_idx" ON "PropostaCompra"("imobiliariaId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversa_pessoaId_perfil_key" ON "Conversa"("pessoaId", "perfil");

-- CreateIndex
CREATE UNIQUE INDEX "Conversa_imobiliariaId_contatoTelefone_agente_key" ON "Conversa"("imobiliariaId", "contatoTelefone", "agente");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Imovel" ADD CONSTRAINT "Imovel_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Imovel" ADD CONSTRAINT "Imovel_proprietarioId_fkey" FOREIGN KEY ("proprietarioId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FotoImovel" ADD CONSTRAINT "FotoImovel_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_inquilinoId_fkey" FOREIGN KEY ("inquilinoId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reajuste" ADD CONSTRAINT "Reajuste_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_acordoId_fkey" FOREIGN KEY ("acordoId") REFERENCES "Acordo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repasse" ADD CONSTRAINT "Repasse_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Fatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vistoria" ADD CONSTRAINT "Vistoria_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposta" ADD CONSTRAINT "Proposta_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposta" ADD CONSTRAINT "Proposta_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaCompra" ADD CONSTRAINT "PropostaCompra_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaCompra" ADD CONSTRAINT "PropostaCompra_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ocorrencia" ADD CONSTRAINT "Ocorrencia_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ocorrencia" ADD CONSTRAINT "Ocorrencia_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoChave" ADD CONSTRAINT "MovimentoChave_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seguro" ADD CONSTRAINT "Seguro_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aditivo" ADD CONSTRAINT "Aditivo_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acordo" ADD CONSTRAINT "Acordo_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAuditoria" ADD CONSTRAINT "LogAuditoria_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_imobiliariaId_fkey" FOREIGN KEY ("imobiliariaId") REFERENCES "Imobiliaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

