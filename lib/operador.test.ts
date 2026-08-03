// O dono do SaaS é um Operador — entidade fora do multi-tenant. Estes testes
// travam os critérios de aceite do S1: operador não é usuário de imobiliária,
// a trilha dele é separada da auditoria do cliente, e sem OPERADOR_SECRET o
// painel fecha (mas o produto continua de pé).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { prisma } from "@/lib/db";
import { autenticarOperador, bootstrapOperadorPorEnv } from "@/lib/operador";
import { hashSenha } from "@/lib/senha";

const uniq = process.pid;
const EMAIL = `op${uniq}@plataforma.test`;
const SENHA = "SenhaDoOperador#2026";

beforeEach(async () => {
  await prisma.acaoOperador.deleteMany({ where: { operador: { email: { contains: `${uniq}@` } } } });
  await prisma.operador.deleteMany({ where: { email: { contains: `${uniq}@` } } });
  delete process.env.OPERADOR_EMAIL;
  delete process.env.OPERADOR_SENHA;
  delete process.env.OPERADOR_RESET;
});

afterAll(async () => {
  await prisma.acaoOperador.deleteMany({ where: { operador: { email: { contains: `${uniq}@` } } } });
  await prisma.operador.deleteMany({ where: { email: { contains: `${uniq}@` } } });
});

describe("operador é entidade separada do produto", () => {
  it("não tem vínculo com imobiliária (não aparece como cliente)", async () => {
    const op = await prisma.operador.create({
      data: { nome: "Dono", email: EMAIL, senhaHash: hashSenha(SENHA) },
    });
    // O tipo do Operador não possui imobiliariaId — se alguém reintroduzir o
    // vínculo, esta asserção quebra junto com o tsc.
    expect(op).not.toHaveProperty("imobiliariaId");

    // E nenhuma imobiliária foi criada para hospedá-lo.
    const clientes = await prisma.imobiliaria.count({ where: { nome: { contains: "Plataforma" } } });
    expect(clientes).toBe(0);
  });

  it("autentica com a senha certa e recusa a errada", async () => {
    await prisma.operador.create({
      data: { nome: "Dono", email: EMAIL, senhaHash: hashSenha(SENHA) },
    });
    expect(await autenticarOperador(EMAIL, SENHA)).not.toBeNull();
    expect(await autenticarOperador(EMAIL, "errada")).toBeNull();
    expect(await autenticarOperador("naoexiste@x.test", SENHA)).toBeNull();
  });

  it("operador inativo não entra", async () => {
    await prisma.operador.create({
      data: { nome: "Dono", email: EMAIL, senhaHash: hashSenha(SENHA), ativo: false },
    });
    expect(await autenticarOperador(EMAIL, SENHA)).toBeNull();
  });
});

describe("bootstrap por ambiente", () => {
  it("cria o primeiro operador e depois vira no-op", async () => {
    process.env.OPERADOR_EMAIL = EMAIL;
    process.env.OPERADOR_SENHA = SENHA;

    await bootstrapOperadorPorEnv();
    const criado = await prisma.operador.findUnique({ where: { email: EMAIL } });
    expect(criado).not.toBeNull();
    expect(await autenticarOperador(EMAIL, SENHA)).not.toBeNull();

    // Já existindo operador, não cria outro nem troca a senha.
    process.env.OPERADOR_SENHA = "OutraSenhaQualquer#1";
    await bootstrapOperadorPorEnv();
    expect(await prisma.operador.count({ where: { email: EMAIL } })).toBe(1);
    expect(await autenticarOperador(EMAIL, SENHA)).not.toBeNull();
  });

  it("ignora configuração incompleta", async () => {
    process.env.OPERADOR_EMAIL = EMAIL; // sem senha
    await bootstrapOperadorPorEnv();
    expect(await prisma.operador.findUnique({ where: { email: EMAIL } })).toBeNull();
  });
});

describe("trilha do operador é separada da auditoria do cliente", () => {
  it("AcaoOperador registra o alvo sem poluir o LogAuditoria da imobiliária", async () => {
    const op = await prisma.operador.create({
      data: { nome: "Dono", email: EMAIL, senhaHash: hashSenha(SENHA) },
    });
    const cliente = await prisma.imobiliaria.create({
      data: { nome: `ClienteOp${uniq}`, taxaAdmPercent: 10 },
    });
    await prisma.acaoOperador.create({
      data: { operadorId: op.id, acao: "CLIENTE_BLOQUEADO", imobiliariaId: cliente.id, detalhe: "teste" },
    });

    // A trilha do cliente permanece limpa: a ação do dono não aparece lá.
    const logsDoCliente = await prisma.logAuditoria.count({ where: { imobiliariaId: cliente.id } });
    expect(logsDoCliente).toBe(0);

    const acoes = await prisma.acaoOperador.findMany({ where: { operadorId: op.id } });
    expect(acoes).toHaveLength(1);
    expect(acoes[0]!.imobiliariaId).toBe(cliente.id);

    await prisma.acaoOperador.deleteMany({ where: { operadorId: op.id } });
    await prisma.imobiliaria.delete({ where: { id: cliente.id } });
  });
});

describe("fail-closed sem OPERADOR_SECRET", () => {
  it("não emite token quando o segredo não está configurado", async () => {
    // O módulo lê a env no import; sem OPERADOR_SECRET no ambiente de teste,
    // operadorConfigurado() é falso e nenhum token é criado.
    vi.resetModules();
    const semSegredo = await import("@/lib/operador-auth");
    if (!semSegredo.operadorConfigurado()) {
      expect(await semSegredo.criarTokenOperador(1, 0)).toBeNull();
      expect(await semSegredo.validarTokenOperador("1.0.99999999999999.abc")).toBeNull();
    }
  });
});

describe("reset de emergência pelo ambiente", () => {
  it("sem OPERADOR_RESET, a senha do ambiente NÃO sobrescreve a conta existente", async () => {
    await prisma.operador.create({
      data: { nome: "Dono", email: EMAIL, senhaHash: hashSenha("SenhaAntiga#2026") },
    });
    process.env.OPERADOR_EMAIL = EMAIL;
    process.env.OPERADOR_SENHA = "SenhaNovaDoAmbiente#1";

    await bootstrapOperadorPorEnv();

    // A senha da tela continua valendo; a do ambiente é ignorada.
    expect(await autenticarOperador(EMAIL, "SenhaAntiga#2026")).not.toBeNull();
    expect(await autenticarOperador(EMAIL, "SenhaNovaDoAmbiente#1")).toBeNull();
  });

  it("com OPERADOR_RESET=1, aplica a senha do ambiente e zera o 2FA", async () => {
    const op = await prisma.operador.create({
      data: {
        nome: "Dono",
        email: EMAIL,
        senhaHash: hashSenha("SenhaAntiga#2026"),
        totpSecret: "SEGREDOANTIGO",
        totpAtivadoEm: new Date(),
      },
    });
    await prisma.codigoRecuperacao.create({
      data: { operadorId: op.id, codigoHash: hashSenha("ABCDE-FGHJK") },
    });

    process.env.OPERADOR_EMAIL = EMAIL;
    process.env.OPERADOR_SENHA = "SenhaNovaDoAmbiente#1";
    process.env.OPERADOR_RESET = "1";
    try {
      await bootstrapOperadorPorEnv();

      expect(await autenticarOperador(EMAIL, "SenhaNovaDoAmbiente#1")).not.toBeNull();
      expect(await autenticarOperador(EMAIL, "SenhaAntiga#2026")).toBeNull();

      const depois = await prisma.operador.findUniqueOrThrow({ where: { id: op.id } });
      // 2FA zerado: dá para reativar mesmo tendo perdido o autenticador.
      expect(depois.totpSecret).toBeNull();
      expect(depois.totpAtivadoEm).toBeNull();
      // Sessões abertas caem junto.
      expect(depois.sessaoVersao).toBe(op.sessaoVersao + 1);
      expect(await prisma.codigoRecuperacao.count({ where: { operadorId: op.id } })).toBe(0);
    } finally {
      delete process.env.OPERADOR_RESET;
    }
  });

  it("o reset reativa uma conta desativada", async () => {
    await prisma.operador.create({
      data: { nome: "Dono", email: EMAIL, senhaHash: hashSenha("x".repeat(12)), ativo: false },
    });
    process.env.OPERADOR_EMAIL = EMAIL;
    process.env.OPERADOR_SENHA = "SenhaNovaDoAmbiente#1";
    process.env.OPERADOR_RESET = "1";
    try {
      await bootstrapOperadorPorEnv();
      expect(await autenticarOperador(EMAIL, "SenhaNovaDoAmbiente#1")).not.toBeNull();
    } finally {
      delete process.env.OPERADOR_RESET;
    }
  });
});
