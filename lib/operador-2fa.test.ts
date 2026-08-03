// Critérios de aceite do S2: sem 2FA confirmado não se entra; código de
// recuperação vale uma única vez; código errado é rejeitado.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { prisma } from "@/lib/db";
import { hashSenha } from "@/lib/senha";
import { gerarCodigoTotp } from "@/lib/totp";
import {
  confirmarAtivacaoTotp,
  prepararAtivacaoTotp,
  totpAtivo,
  totpObrigatorio,
  verificarSegundoFator,
  codigosRecuperacaoRestantes,
} from "@/lib/operador";

const uniq = process.pid;
const EMAIL = `op2fa${uniq}@plataforma.test`;
let operadorId: number;

beforeEach(async () => {
  await prisma.codigoRecuperacao.deleteMany({ where: { operador: { email: EMAIL } } });
  await prisma.operador.deleteMany({ where: { email: EMAIL } });
  const op = await prisma.operador.create({
    data: { nome: "Dono", email: EMAIL, senhaHash: hashSenha("SenhaForte#2026") },
  });
  operadorId = op.id;
});

afterAll(async () => {
  await prisma.codigoRecuperacao.deleteMany({ where: { operador: { email: EMAIL } } });
  await prisma.operador.deleteMany({ where: { email: EMAIL } });
});

describe("ativação do 2FA", () => {
  it("segredo gerado mas não confirmado NÃO vale como segundo fator", async () => {
    await prepararAtivacaoTotp(operadorId);
    const op = await prisma.operador.findUniqueOrThrow({ where: { id: operadorId } });
    expect(op.totpSecret).not.toBeNull(); // pendente
    expect(op.totpAtivadoEm).toBeNull();
    expect(totpAtivo(op)).toBe(false); // ainda não passa da tela de login
  });

  it("reaproveita o segredo pendente entre recargas da tela", async () => {
    const a = await prepararAtivacaoTotp(operadorId);
    const b = await prepararAtivacaoTotp(operadorId);
    expect(b.segredo).toBe(a.segredo);
    expect(a.uri).toContain(`secret=${a.segredo}`);
  });

  it("confirma com o código certo, ativa e devolve 8 códigos de recuperação", async () => {
    const { segredo } = await prepararAtivacaoTotp(operadorId);
    const codigos = await confirmarAtivacaoTotp(operadorId, gerarCodigoTotp(segredo));
    expect(codigos).toHaveLength(8);

    const op = await prisma.operador.findUniqueOrThrow({ where: { id: operadorId } });
    expect(totpAtivo(op)).toBe(true);
    expect(await codigosRecuperacaoRestantes(operadorId)).toBe(8);
  });

  it("não ativa com código errado", async () => {
    await prepararAtivacaoTotp(operadorId);
    expect(await confirmarAtivacaoTotp(operadorId, "000000")).toBeNull();
    const op = await prisma.operador.findUniqueOrThrow({ where: { id: operadorId } });
    expect(totpAtivo(op)).toBe(false);
    expect(await codigosRecuperacaoRestantes(operadorId)).toBe(0);
  });

  it("não reativa quem já tem 2FA ativo", async () => {
    const { segredo } = await prepararAtivacaoTotp(operadorId);
    await confirmarAtivacaoTotp(operadorId, gerarCodigoTotp(segredo));
    await expect(prepararAtivacaoTotp(operadorId)).rejects.toThrow();
  });
});

describe("segundo fator no login", () => {
  async function ativar() {
    const { segredo } = await prepararAtivacaoTotp(operadorId);
    const codigos = await confirmarAtivacaoTotp(operadorId, gerarCodigoTotp(segredo));
    return { segredo, codigos: codigos! };
  }

  it("aceita o código atual do app", async () => {
    const { segredo } = await ativar();
    expect(await verificarSegundoFator(operadorId, gerarCodigoTotp(segredo))).toBe(true);
  });

  it("rejeita código errado", async () => {
    await ativar();
    expect(await verificarSegundoFator(operadorId, "000000")).toBe(false);
    expect(await verificarSegundoFator(operadorId, "")).toBe(false);
  });

  it("código de recuperação funciona UMA vez e é invalidado", async () => {
    const { codigos } = await ativar();
    const codigo = codigos[0]!;

    expect(await verificarSegundoFator(operadorId, codigo)).toBe(true);
    expect(await codigosRecuperacaoRestantes(operadorId)).toBe(7);

    // Segunda tentativa com o MESMO código: recusada.
    expect(await verificarSegundoFator(operadorId, codigo)).toBe(false);
    expect(await codigosRecuperacaoRestantes(operadorId)).toBe(7);

    // Os outros continuam válidos.
    expect(await verificarSegundoFator(operadorId, codigos[1]!)).toBe(true);
    expect(await codigosRecuperacaoRestantes(operadorId)).toBe(6);
  });

  it("aceita o código de recuperação digitado sem hífen e em minúsculas", async () => {
    const { codigos } = await ativar();
    const solto = codigos[2]!.replace("-", "").toLowerCase();
    expect(await verificarSegundoFator(operadorId, solto)).toBe(true);
  });

  it("código de recuperação de OUTRO operador não serve", async () => {
    const { codigos } = await ativar();
    const outro = await prisma.operador.create({
      data: { nome: "Outro", email: `outro${uniq}@plataforma.test`, senhaHash: hashSenha("x") },
    });
    const { segredo } = await prepararAtivacaoTotp(outro.id);
    await confirmarAtivacaoTotp(outro.id, gerarCodigoTotp(segredo));

    expect(await verificarSegundoFator(outro.id, codigos[3]!)).toBe(false);
    await prisma.operador.delete({ where: { id: outro.id } });
  });

  it("operador sem 2FA algum não passa pelo segundo fator", async () => {
    expect(await verificarSegundoFator(operadorId, "000000")).toBe(false);
  });
});

describe("obrigatoriedade", () => {
  it("em produção o 2FA é exigido mesmo com TOTP_OBRIGATORIO=false", () => {
    const antes = process.env.NODE_ENV;
    const antesFlag = process.env.TOTP_OBRIGATORIO;
    try {
      vi.stubEnv("NODE_ENV", "production");
      process.env.TOTP_OBRIGATORIO = "false";
      expect(totpObrigatorio()).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      if (antesFlag === undefined) delete process.env.TOTP_OBRIGATORIO;
      else process.env.TOTP_OBRIGATORIO = antesFlag;
      expect(process.env.NODE_ENV).toBe(antes);
    }
  });

  it("fora de produção a env permite pular", () => {
    const antesFlag = process.env.TOTP_OBRIGATORIO;
    try {
      process.env.TOTP_OBRIGATORIO = "false";
      expect(totpObrigatorio()).toBe(false);
      delete process.env.TOTP_OBRIGATORIO;
      expect(totpObrigatorio()).toBe(true); // padrão: exigido
    } finally {
      if (antesFlag === undefined) delete process.env.TOTP_OBRIGATORIO;
      else process.env.TOTP_OBRIGATORIO = antesFlag;
    }
  });
});
