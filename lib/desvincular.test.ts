// O dono do SaaS não pode carregar um login de cliente junto. Estes testes
// travam as duas metades da regra: a limpeza automática quando é seguro, e a
// RECUSA de mexer quando removê-lo deixaria um cliente real sem acesso.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { prisma } from "@/lib/db";
import { hashSenha } from "@/lib/senha";
import { autenticarOperador } from "@/lib/operador";

const uniq = process.pid;
const EMAIL = `dono-desv${uniq}@beam360.test`;
const SENHA = "SenhaDoDono#2026";

async function limpar() {
  const us = await prisma.usuario.findMany({ where: { email: EMAIL } });
  for (const u of us) await prisma.tokenEmail.deleteMany({ where: { usuarioId: u.id } });
  await prisma.usuario.deleteMany({ where: { email: EMAIL } });
  await prisma.operador.deleteMany({ where: { email: EMAIL } });
  const imobs = await prisma.imobiliaria.findMany({ where: { nome: { startsWith: `Desv${uniq}` } } });
  for (const i of imobs) {
    await prisma.usuario.deleteMany({ where: { imobiliariaId: i.id } });
    await prisma.imovel.deleteMany({ where: { imobiliariaId: i.id } });
    await prisma.pessoa.deleteMany({ where: { imobiliariaId: i.id } });
    await prisma.logAuditoria.deleteMany({ where: { imobiliariaId: i.id } });
  }
  await prisma.imobiliaria.deleteMany({ where: { nome: { startsWith: `Desv${uniq}` } } });
}

afterEach(limpar);

async function criarOperador() {
  return prisma.operador.create({
    data: { nome: "Dono", email: EMAIL, senhaHash: hashSenha(SENHA) },
  });
}

describe("o dono deixa de ser usuário do produto", () => {
  it("remove o login de cliente e o tenant quando ele está vazio", async () => {
    await criarOperador();
    const imob = await prisma.imobiliaria.create({
      data: { nome: `Desv${uniq}-vazio`, taxaAdmPercent: 10 },
    });
    await prisma.usuario.create({
      data: { email: EMAIL, nome: "Marco", senhaHash: hashSenha("qualquer"), imobiliariaId: imob.id },
    });

    const op = await autenticarOperador(EMAIL, SENHA);
    expect(op).not.toBeNull();

    // Sobrou só o operador: nenhum usuário do produto, nenhum tenant órfão.
    expect(await prisma.usuario.count({ where: { email: EMAIL } })).toBe(0);
    expect(await prisma.imobiliaria.findUnique({ where: { id: imob.id } })).toBeNull();
  });

  it("NÃO remove quando o tenant tem carteira (não deixa cliente sem acesso)", async () => {
    await criarOperador();
    const imob = await prisma.imobiliaria.create({
      data: { nome: `Desv${uniq}-comdados`, taxaAdmPercent: 10 },
    });
    await prisma.usuario.create({
      data: { email: EMAIL, nome: "Marco", senhaHash: hashSenha("qualquer"), imobiliariaId: imob.id },
    });
    await prisma.pessoa.create({
      data: { imobiliariaId: imob.id, nome: "Cliente real", cpfCnpj: `desv${uniq}` },
    });

    await autenticarOperador(EMAIL, SENHA);

    // Preservado: a remoção aqui exige decisão explícita (script com --forcar).
    expect(await prisma.usuario.count({ where: { email: EMAIL } })).toBe(1);
    expect(await prisma.imobiliaria.findUnique({ where: { id: imob.id } })).not.toBeNull();
  });

  it("NÃO remove quando o tenant tem outros usuários", async () => {
    await criarOperador();
    const imob = await prisma.imobiliaria.create({
      data: { nome: `Desv${uniq}-outros`, taxaAdmPercent: 10 },
    });
    await prisma.usuario.create({
      data: { email: EMAIL, nome: "Marco", senhaHash: hashSenha("qualquer"), imobiliariaId: imob.id },
    });
    await prisma.usuario.create({
      data: {
        email: `colega${uniq}@beam360.test`,
        nome: "Colega",
        senhaHash: hashSenha("qualquer"),
        imobiliariaId: imob.id,
      },
    });

    await autenticarOperador(EMAIL, SENHA);
    expect(await prisma.usuario.count({ where: { email: EMAIL } })).toBe(1);

    await prisma.usuario.deleteMany({ where: { imobiliariaId: imob.id } });
  });

  it("é inofensivo quando o dono nunca teve login de cliente", async () => {
    await criarOperador();
    const op = await autenticarOperador(EMAIL, SENHA);
    expect(op).not.toBeNull();
    expect(await prisma.usuario.count({ where: { email: EMAIL } })).toBe(0);
  });
});
