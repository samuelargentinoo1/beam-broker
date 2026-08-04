// Vitrine sem banco: o produto roda com o Postgres desligado.
//
// Serve para publicar o FRONT e navegar pelas 13 telas comerciais sem
// provisionar banco nenhum. Essas telas já guardam os dados em memória
// (lib/proto), então o que falta é destravar o que depende do Prisma: sessão,
// navegação e as telas do ERP legado.
//
// NÃO confundir com lib/demo.ts, que trata do modo demo das INTEGRAÇÕES
// (Asaas, ZapSign, uazapi) — aquilo é sobre credencial de terceiro, isto é
// sobre a ausência do banco.
//
// Liga sozinho quando não há DATABASE_URL. Em qualquer ambiente com banco
// configurado nada aqui é alcançado.

import type { Imobiliaria, Usuario } from "@prisma/client";

export const SEM_BANCO = !process.env.DATABASE_URL;

// Sessão sintética. Isto NÃO é um furo de autenticação: sem banco não existe
// dado real para proteger — tudo o que a tela mostra é fixture de lib/proto.
// Com DATABASE_URL presente, este caminho fica inalcançável.
export const IMOBILIARIA_DEMO = {
  id: 1,
  nome: "Horizonte Imóveis",
  municipio: "Araraquara",
  uf: "SP",
  modulos: ["COMERCIAL"],
  addons: ["CAPTACAO"],
  assinaturaAtiva: true,
  bloqueadaEm: null,
  trialAte: null,
  planoId: null,
  regrasRevisadas: true,
  onboardingDispensado: true,
} as unknown as Imobiliaria;

export const USUARIO_DEMO = {
  id: 1,
  imobiliariaId: 1,
  nome: "Ana Julia Ferraz",
  email: "demo@beambroker.com.br",
  papel: "ADMIN",
  sessaoVersao: 0,
  precisaTrocarSenha: false,
  emailVerificadoEm: new Date(0),
} as unknown as Usuario;

export const SESSAO_DEMO = { usuario: USUARIO_DEMO, imobiliaria: IMOBILIARIA_DEMO };

// Telas do ERP legado que leem o banco. Na vitrine elas saem do caminho em vez
// de quebrar: some do dock e a rota explica por quê.
export const ROTAS_QUE_EXIGEM_BANCO = ["/", "/imoveis", "/configuracoes", "/pesquisa"];
