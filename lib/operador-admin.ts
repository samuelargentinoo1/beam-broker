"use server";

// Gestão de acessos pelo PRÓPRIO sistema: consulta os cadastrados e promove,
// desvincula ou desativa sem ninguém precisar rodar script contra o banco.
//
// Tudo aqui é cross-tenant e sensível: exigirOperador() é a primeira linha de
// cada função, e toda ação vai para AcaoOperador (a trilha do dono).

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { hashSenha } from "@/lib/senha";
import { exigirOperador, registrarAcao } from "@/lib/operador";

// Senha temporária legível ao telefone, sem caracteres ambíguos.
function senhaTemporaria(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const num = "23456789";
  const b = randomBytes(12);
  let s = "";
  for (let i = 0; i < 4; i++) s += abc[b[i]! % abc.length];
  s += "-";
  for (let i = 4; i < 8; i++) s += num[b[i]! % num.length];
  return s;
}

export async function listarOperadores() {
  await exigirOperador();
  const operadores = await prisma.operador.findMany({ orderBy: { id: "asc" } });
  const restantes = await prisma.codigoRecuperacao.groupBy({
    by: ["operadorId"],
    where: { usadoEm: null },
    _count: true,
  });
  const porOperador = new Map(restantes.map((r) => [r.operadorId, r._count]));
  return operadores.map((o) => ({
    id: o.id,
    nome: o.nome,
    email: o.email,
    ativo: o.ativo,
    doisFatores: !!o.totpAtivadoEm,
    ultimoAcessoEm: o.ultimoAcessoEm,
    codigosRestantes: porOperador.get(o.id) ?? 0,
  }));
}

// Todos os logins de CLIENTE cadastrados, com a imobiliária de cada um. É o
// "banco de dados dos cadastrados" que a tela mostra.
export async function listarUsuariosCadastrados(busca?: string) {
  await exigirOperador();
  const termo = busca?.trim();
  const usuarios = await prisma.usuario.findMany({
    where: termo
      ? {
          OR: [
            { email: { contains: termo, mode: "insensitive" } },
            { nome: { contains: termo, mode: "insensitive" } },
            { imobiliaria: { nome: { contains: termo, mode: "insensitive" } } },
          ],
        }
      : undefined,
    include: { imobiliaria: { select: { id: true, nome: true } } },
    orderBy: { id: "asc" },
    take: 200,
  });
  const emailsOperadores = new Set(
    (await prisma.operador.findMany({ select: { email: true } })).map((o) => o.email)
  );
  return usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    precisaTrocarSenha: u.precisaTrocarSenha,
    imobiliariaId: u.imobiliaria.id,
    imobiliariaNome: u.imobiliaria.nome,
    tambemOperador: emailsOperadores.has(u.email),
  }));
}

export type Resultado = { ok: true; senha?: string } | { ok: false; erro: string };

// Promove um e-mail a operador do SaaS. Devolve a senha temporária UMA vez.
export async function promoverAOperador(formData: FormData): Promise<Resultado> {
  await exigirOperador();
  // Tolera a troca de vírgula por ponto, erro comum ao digitar e-mail.
  const email = String(formData.get("email") ?? "").trim().toLowerCase().replace(/,/g, ".");
  const nome = String(formData.get("nome") ?? "").trim() || "Dono";
  if (!email.includes("@")) return { ok: false, erro: `E-mail inválido: ${email}` };

  const existente = await prisma.operador.findUnique({ where: { email } });
  if (existente) {
    if (!existente.ativo) {
      await prisma.operador.update({ where: { id: existente.id }, data: { ativo: true } });
      await registrarAcao("OPERADOR_REATIVADO", undefined, email);
      revalidatePath("/admin/acessos");
      return { ok: true };
    }
    return { ok: false, erro: `${email} já é operador.` };
  }

  const senha = senhaTemporaria();
  await prisma.operador.create({ data: { nome, email, senhaHash: hashSenha(senha) } });
  await registrarAcao("OPERADOR_CRIADO", undefined, email);
  revalidatePath("/admin/acessos");
  return { ok: true, senha };
}

// Tira o papel de CLIENTE de um e-mail (o dono não é usuário de imobiliária).
// GUARDA: se for o único usuário de um tenant COM carteira, remover trancaria
// aquele cliente para fora — recusa e explica, a menos que `forcar`.
export async function desvincularDoProduto(
  usuarioId: number,
  forcar = false
): Promise<Resultado> {
  await exigirOperador();
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: { imobiliaria: { select: { id: true, nome: true } } },
  });
  if (!usuario) return { ok: false, erro: "Usuário não encontrado." };

  const imobiliariaId = usuario.imobiliariaId;
  const [outros, imoveis, pessoas, contratos, faturas, leads, conversas, documentos, lancamentos] =
    await Promise.all([
      prisma.usuario.count({ where: { imobiliariaId, id: { not: usuario.id } } }),
      prisma.imovel.count({ where: { imobiliariaId } }),
      prisma.pessoa.count({ where: { imobiliariaId } }),
      prisma.contrato.count({ where: { imobiliariaId } }),
      prisma.fatura.count({ where: { imobiliariaId } }),
      prisma.lead.count({ where: { imobiliariaId } }),
      prisma.conversa.count({ where: { imobiliariaId } }),
      prisma.documento.count({ where: { imobiliariaId } }),
      prisma.lancamento.count({ where: { imobiliariaId } }),
    ]);
  const carteira =
    imoveis + pessoas + contratos + faturas + leads + conversas + documentos + lancamentos;

  if (carteira > 0 && outros === 0 && !forcar) {
    return {
      ok: false,
      erro:
        `Remover deixaria a imobiliária "${usuario.imobiliaria.nome}" sem ninguém para entrar, ` +
        `e ela tem ${carteira} registro(s). Crie outro acesso para ela antes, ou confirme a remoção mesmo assim.`,
    };
  }

  await prisma.tokenEmail.deleteMany({ where: { usuarioId: usuario.id } });
  await prisma.usuario.delete({ where: { id: usuario.id } });

  // Tenant que ficou vazio e sem usuários era só o "endereço" daquela conta.
  if (outros === 0 && carteira === 0) {
    await prisma.logAuditoria.deleteMany({ where: { imobiliariaId } });
    await prisma.usoIA.deleteMany({ where: { imobiliariaId } });
    await prisma.demandaNaoAtendida.deleteMany({ where: { imobiliariaId } });
    await prisma.imobiliaria.delete({ where: { id: imobiliariaId } });
    await registrarAcao(
      "USUARIO_DESVINCULADO",
      undefined,
      `${usuario.email} · imobiliária #${imobiliariaId} "${usuario.imobiliaria.nome}" removida (vazia)`
    );
  } else {
    await registrarAcao(
      "USUARIO_DESVINCULADO",
      imobiliariaId,
      `${usuario.email}${outros === 0 ? " · tenant ficou SEM usuários" : ""}`
    );
  }
  revalidatePath("/admin/acessos");
  return { ok: true };
}

export async function definirOperadorAtivo(operadorId: number, ativo: boolean): Promise<Resultado> {
  const eu = await exigirOperador();
  // Ninguém se tranca para fora: desativar a si mesmo fecharia o painel.
  if (!ativo && eu.id === operadorId)
    return { ok: false, erro: "Você não pode desativar a sua própria conta." };
  if (!ativo && (await prisma.operador.count({ where: { ativo: true } })) <= 1)
    return { ok: false, erro: "Este é o último operador ativo — desativá-lo fecharia o painel." };

  const alvo = await prisma.operador.update({
    where: { id: operadorId },
    // Desativar também derruba as sessões abertas dele.
    data: { ativo, ...(ativo ? {} : { sessaoVersao: { increment: 1 } }) },
  });
  await registrarAcao(ativo ? "OPERADOR_REATIVADO" : "OPERADOR_DESATIVADO", undefined, alvo.email);
  revalidatePath("/admin/acessos");
  return { ok: true };
}

// Redefine a senha de um operador e devolve a nova UMA vez. Derruba as sessões
// abertas e exige a reativação do 2FA.
export async function redefinirSenhaOperador(operadorId: number): Promise<Resultado> {
  await exigirOperador();
  const senha = senhaTemporaria();
  const alvo = await prisma.operador.update({
    where: { id: operadorId },
    data: {
      senhaHash: hashSenha(senha),
      sessaoVersao: { increment: 1 },
      totpSecret: null,
      totpAtivadoEm: null,
    },
  });
  await prisma.codigoRecuperacao.deleteMany({ where: { operadorId } });
  await registrarAcao("OPERADOR_SENHA_REDEFINIDA", undefined, alvo.email);
  revalidatePath("/admin/acessos");
  return { ok: true, senha };
}
