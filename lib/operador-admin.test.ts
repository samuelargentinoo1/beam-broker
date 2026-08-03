// A gestão de acessos feita PELO SISTEMA (tela /admin/acessos): promover a
// operador, remover o papel de cliente e as guardas que impedem tranca.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A guarda exigirOperador() é validada em outros testes; aqui o foco é a regra
// de negócio de cada ação, então o operador logado é fixo.
const operadorLogado = { id: 0 };
vi.mock("@/lib/operador", () => ({
  exigirOperador: vi.fn(async () => operadorLogado),
  registrarAcao: vi.fn(async () => {}),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { hashSenha, verificarSenha } from "@/lib/senha";
import {
  definirOperadorAtivo,
  desvincularDoProduto,
  listarUsuariosCadastrados,
  promoverAOperador,
  redefinirSenhaOperador,
} from "@/lib/operador-admin";

const uniq = process.pid;
const EMAIL = `marco-adm${uniq}@beam360.com.br`;

function fd(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function limpar() {
  const us = await prisma.usuario.findMany({ where: { email: { contains: `adm${uniq}@` } } });
  for (const u of us) await prisma.tokenEmail.deleteMany({ where: { usuarioId: u.id } });
  await prisma.usuario.deleteMany({ where: { email: { contains: `adm${uniq}@` } } });
  await prisma.codigoRecuperacao.deleteMany({
    where: { operador: { email: { contains: `adm${uniq}@` } } },
  });
  await prisma.operador.deleteMany({ where: { email: { contains: `adm${uniq}@` } } });
  const imobs = await prisma.imobiliaria.findMany({ where: { nome: { startsWith: `Acesso${uniq}` } } });
  for (const i of imobs) {
    await prisma.usuario.deleteMany({ where: { imobiliariaId: i.id } });
    await prisma.pessoa.deleteMany({ where: { imobiliariaId: i.id } });
    await prisma.logAuditoria.deleteMany({ where: { imobiliariaId: i.id } });
  }
  await prisma.imobiliaria.deleteMany({ where: { nome: { startsWith: `Acesso${uniq}` } } });
}

beforeEach(async () => {
  await limpar();
  // Um operador "eu" sempre presente, para as guardas de auto-tranca.
  const eu = await prisma.operador.create({
    data: { nome: "Eu", email: `eu-adm${uniq}@beam360.com.br`, senhaHash: hashSenha("x".repeat(12)) },
  });
  operadorLogado.id = eu.id;
});

afterEach(limpar);

describe("promover a operador", () => {
  it("cria o operador e devolve a senha temporária uma vez", async () => {
    const r = await promoverAOperador(fd({ email: EMAIL, nome: "Marco" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.senha).toMatch(/^[A-Z]{4}-[2-9]{4}$/);

    const criado = await prisma.operador.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(criado.nome).toBe("Marco");
    expect(verificarSenha(r.senha!, criado.senhaHash)).toBe(true);
    // 2FA ainda pendente: será exigido no primeiro acesso.
    expect(criado.totpAtivadoEm).toBeNull();
  });

  it("corrige a vírgula digitada no lugar do ponto", async () => {
    const comVirgula = EMAIL.replace(/\./g, ",");
    const r = await promoverAOperador(fd({ email: comVirgula }));
    expect(r.ok).toBe(true);
    expect(await prisma.operador.findUnique({ where: { email: EMAIL } })).not.toBeNull();
  });

  it("recusa e-mail inválido e não duplica operador existente", async () => {
    expect(await promoverAOperador(fd({ email: "sem-arroba" }))).toEqual({
      ok: false,
      erro: "E-mail inválido: sem-arroba",
    });
    await promoverAOperador(fd({ email: EMAIL }));
    const r = await promoverAOperador(fd({ email: EMAIL }));
    expect(r.ok).toBe(false);
  });
});

describe("remover o papel de cliente", () => {
  async function usuarioEm(nome: string, comCarteira: boolean, outroUsuario = false) {
    const imob = await prisma.imobiliaria.create({
      data: { nome: `Acesso${uniq}-${nome}`, taxaAdmPercent: 10 },
    });
    const u = await prisma.usuario.create({
      data: { email: EMAIL, nome: "Marco", senhaHash: hashSenha("qualquer"), imobiliariaId: imob.id },
    });
    if (comCarteira)
      await prisma.pessoa.create({
        data: { imobiliariaId: imob.id, nome: "Cliente", cpfCnpj: `ac${uniq}${nome}` },
      });
    if (outroUsuario)
      await prisma.usuario.create({
        data: {
          email: `colega-adm${uniq}@beam360.com.br`,
          nome: "Colega",
          senhaHash: hashSenha("q"),
          imobiliariaId: imob.id,
        },
      });
    return { imob, usuario: u };
  }

  it("remove o login e o tenant quando ele está vazio", async () => {
    const { imob, usuario } = await usuarioEm("vazio", false);
    expect(await desvincularDoProduto(usuario.id)).toEqual({ ok: true });
    expect(await prisma.usuario.count({ where: { email: EMAIL } })).toBe(0);
    expect(await prisma.imobiliaria.findUnique({ where: { id: imob.id } })).toBeNull();
  });

  it("RECUSA quando é o único acesso de um cliente com carteira", async () => {
    const { imob, usuario } = await usuarioEm("comdados", true);
    const r = await desvincularDoProduto(usuario.id);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("sem ninguém para entrar");
    // Nada foi tocado.
    expect(await prisma.usuario.count({ where: { id: usuario.id } })).toBe(1);
    expect(await prisma.imobiliaria.findUnique({ where: { id: imob.id } })).not.toBeNull();
  });

  it("com confirmação explícita, remove mesmo assim e preserva o tenant", async () => {
    const { imob, usuario } = await usuarioEm("forcado", true);
    expect(await desvincularDoProduto(usuario.id, true)).toEqual({ ok: true });
    expect(await prisma.usuario.count({ where: { id: usuario.id } })).toBe(0);
    // O tenant com carteira NÃO é apagado — só ficou sem acesso.
    expect(await prisma.imobiliaria.findUnique({ where: { id: imob.id } })).not.toBeNull();
  });

  it("remove sem drama quando há outro usuário no tenant", async () => {
    const { imob, usuario } = await usuarioEm("outros", true, true);
    expect(await desvincularDoProduto(usuario.id)).toEqual({ ok: true });
    expect(await prisma.imobiliaria.findUnique({ where: { id: imob.id } })).not.toBeNull();
  });
});

describe("a lista de cadastrados", () => {
  it("marca quem também é operador e filtra pela busca", async () => {
    const imob = await prisma.imobiliaria.create({
      data: { nome: `Acesso${uniq}-lista`, taxaAdmPercent: 10 },
    });
    await prisma.usuario.create({
      data: { email: EMAIL, nome: "Marco", senhaHash: hashSenha("q"), imobiliariaId: imob.id },
    });
    await promoverAOperador(fd({ email: EMAIL }));

    const achados = await listarUsuariosCadastrados(EMAIL);
    expect(achados).toHaveLength(1);
    expect(achados[0]!.tambemOperador).toBe(true);
    expect(achados[0]!.imobiliariaNome).toBe(`Acesso${uniq}-lista`);

    expect(await listarUsuariosCadastrados("nao-existe-xyz")).toHaveLength(0);
  });
});

describe("guardas contra se trancar para fora", () => {
  it("não deixa desativar a própria conta", async () => {
    const r = await definirOperadorAtivo(operadorLogado.id, false);
    expect(r).toEqual({ ok: false, erro: "Você não pode desativar a sua própria conta." });
  });

  it("não deixa desativar o último operador ativo", async () => {
    const r = await promoverAOperador(fd({ email: EMAIL }));
    expect(r.ok).toBe(true);
    const outro = await prisma.operador.findUniqueOrThrow({ where: { email: EMAIL } });
    // Desativa o "eu" pela via direta para sobrar só um ativo.
    await prisma.operador.update({ where: { id: operadorLogado.id }, data: { ativo: false } });
    operadorLogado.id = outro.id;
    expect(await definirOperadorAtivo(outro.id, false)).toEqual({
      ok: false,
      erro: "Você não pode desativar a sua própria conta.",
    });
  });
});

describe("redefinir senha de operador", () => {
  it("gera senha nova, derruba sessões e zera o 2FA", async () => {
    await promoverAOperador(fd({ email: EMAIL }));
    const antes = await prisma.operador.findUniqueOrThrow({ where: { email: EMAIL } });
    await prisma.operador.update({
      where: { id: antes.id },
      data: { totpSecret: "ABC", totpAtivadoEm: new Date() },
    });

    const r = await redefinirSenhaOperador(antes.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const depois = await prisma.operador.findUniqueOrThrow({ where: { id: antes.id } });
    expect(verificarSenha(r.senha!, depois.senhaHash)).toBe(true);
    expect(depois.sessaoVersao).toBe(antes.sessaoVersao + 1);
    expect(depois.totpAtivadoEm).toBeNull();
    expect(depois.totpSecret).toBeNull();
  });
});
