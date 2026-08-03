// Operador do SaaS (dono): sessão, autenticação e trilha de ações.
// Independente de lib/sessao.ts — não há Usuario nem imobiliária envolvidos.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Operador } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashSenha, verificarSenha } from "@/lib/senha";
import { COOKIE_OPERADOR, validarTokenOperador, operadorConfigurado } from "@/lib/operador-auth";
import {
  gerarSegredoTotp,
  gerarCodigosRecuperacao,
  normalizarCodigoRecuperacao,
  uriOtpauth,
  validarCodigoTotp,
} from "@/lib/totp";

export { operadorConfigurado };

// cache() deduplica por request.
export const getOperador = cache(async (): Promise<Operador | null> => {
  const jar = await cookies();
  const token = await validarTokenOperador(jar.get(COOKIE_OPERADOR)?.value);
  if (!token) return null;
  const operador = await prisma.operador.findUnique({ where: { id: token.operadorId } });
  if (!operador || !operador.ativo) return null;
  // Revogação de sessão (troca de senha, "sair de todos os dispositivos").
  if (operador.sessaoVersao !== token.sessaoVersao) return null;
  return operador;
});

export async function exigirOperador(): Promise<Operador> {
  const operador = await getOperador();
  if (!operador) redirect("/admin/entrar");
  return operador;
}

export function ipDaRequisicaoOperador(h: Headers): string {
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "desconhecido";
}

// Trilha do dono. NUNCA grava em LogAuditoria: ação do operador não pode
// aparecer na auditoria da imobiliária como se fosse a equipe dela.
export async function registrarAcao(
  acao: string,
  imobiliariaId?: number,
  detalhe?: string
): Promise<void> {
  try {
    const operador = await getOperador();
    if (!operador) return;
    let ip: string | undefined;
    try {
      ip = ipDaRequisicaoOperador(await headers());
    } catch {
      /* fora de um request */
    }
    await prisma.acaoOperador.create({
      data: { operadorId: operador.id, acao, imobiliariaId, detalhe, ip },
    });
  } catch {
    /* trilha não pode derrubar a operação */
  }
}

// Autentica por e-mail + senha. Devolve null quando não confere (o chamador
// aplica rate limit e responde sempre a mesma mensagem genérica).
export async function autenticarOperador(
  email: string,
  senha: string
): Promise<Operador | null> {
  const alvo = email.trim().toLowerCase();
  const operador = await prisma.operador.findUnique({ where: { email: alvo } });
  // Tempo constante: sempre roda a verificação, mesmo sem o operador existir.
  const hashDummy = "00".repeat(16) + ":" + "00".repeat(64);
  const ok = operador
    ? verificarSenha(senha, operador.senhaHash)
    : (verificarSenha(senha, hashDummy), false);
  if (!operador || !ok || !operador.ativo) return null;
  await prisma.operador
    .update({ where: { id: operador.id }, data: { ultimoAcessoEm: new Date() } })
    .catch(() => {});
  await desvincularDoProduto(alvo).catch(() => {});
  return operador;
}

// O dono não é usuário de imobiliária nenhuma. Se o mesmo e-mail carrega um
// Usuario do produto (sobra de um cadastro ou do bootstrap antigo), ele aparece
// na lista de usuários de um cliente e conta como usuário do plano.
//
// A remoção é CONSERVADORA: só acontece quando o tenant está vazio e sem outro
// usuário — ou seja, quando aquela conta era só o "endereço" do dono. Um cliente
// de verdade nunca fica sem acesso por causa disto; para esse caso existe o
// scripts/promover-operador.mjs, que reporta e pede confirmação explícita.
async function desvincularDoProduto(email: string): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario) return;
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

  if (outros > 0 || carteira > 0) {
    console.warn(
      `[operador] ${email} também é usuário da imobiliária #${imobiliariaId}, que tem ` +
        `${carteira} registro(s) e ${outros} outro(s) usuário(s). NÃO removi automaticamente — ` +
        `rode: node scripts/promover-operador.mjs ${email}`
    );
    return;
  }

  await prisma.tokenEmail.deleteMany({ where: { usuarioId: usuario.id } });
  await prisma.usuario.delete({ where: { id: usuario.id } });
  await prisma.logAuditoria.deleteMany({ where: { imobiliariaId } });
  await prisma.usoIA.deleteMany({ where: { imobiliariaId } });
  await prisma.demandaNaoAtendida.deleteMany({ where: { imobiliariaId } });
  await prisma.imobiliaria.delete({ where: { id: imobiliariaId } });
  console.warn(
    `[operador] ${email} deixou de ser usuário do produto; a imobiliária #${imobiliariaId} ` +
      `(vazia, sem outros usuários) foi removida.`
  );
}

// ─── 2FA (TOTP) ─────────────────────────────────────────────────────────────

// Em PRODUÇÃO o 2FA é sempre exigido — a env não desliga. TOTP_OBRIGATORIO=false
// só vale em desenvolvimento, para não travar quem está mexendo no código.
export function totpObrigatorio(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return process.env.TOTP_OBRIGATORIO !== "false";
}

// O operador já tem segundo fator VALENDO? Segredo sem totpAtivadoEm é ativação
// pendente (gerada, não confirmada) e não conta.
export function totpAtivo(operador: Pick<Operador, "totpSecret" | "totpAtivadoEm">): boolean {
  return !!operador.totpSecret && !!operador.totpAtivadoEm;
}

// Gera (ou regenera) o segredo pendente de confirmação e devolve o que a tela
// precisa para montar o QR. Só mexe enquanto a ativação não foi confirmada.
export async function prepararAtivacaoTotp(
  operadorId: number
): Promise<{ segredo: string; uri: string }> {
  const operador = await prisma.operador.findUniqueOrThrow({ where: { id: operadorId } });
  if (totpAtivo(operador)) throw new Error("2FA já está ativo");
  const segredo = operador.totpSecret ?? gerarSegredoTotp();
  if (!operador.totpSecret) {
    await prisma.operador.update({ where: { id: operadorId }, data: { totpSecret: segredo } });
  }
  return { segredo, uri: uriOtpauth(segredo, operador.email) };
}

// Confirma a ativação com um código do app. Só então o 2FA passa a valer, e os
// 8 códigos de recuperação são gerados — devolvidos UMA única vez.
export async function confirmarAtivacaoTotp(
  operadorId: number,
  codigo: string
): Promise<string[] | null> {
  const operador = await prisma.operador.findUniqueOrThrow({ where: { id: operadorId } });
  if (!operador.totpSecret || totpAtivo(operador)) return null;
  if (!validarCodigoTotp(operador.totpSecret, codigo)) return null;

  const codigos = gerarCodigosRecuperacao();
  await prisma.$transaction([
    prisma.operador.update({ where: { id: operadorId }, data: { totpAtivadoEm: new Date() } }),
    prisma.codigoRecuperacao.deleteMany({ where: { operadorId } }),
    prisma.codigoRecuperacao.createMany({
      data: codigos.map((c) => ({
        operadorId,
        codigoHash: hashSenha(normalizarCodigoRecuperacao(c)),
      })),
    }),
  ]);
  return codigos;
}

// Segundo fator no login: aceita o código do app OU um código de recuperação
// (que é consumido). Devolve false quando nenhum confere.
export async function verificarSegundoFator(
  operadorId: number,
  codigo: string
): Promise<boolean> {
  const operador = await prisma.operador.findUnique({ where: { id: operadorId } });
  if (!operador || !operador.totpSecret) return false;

  if (validarCodigoTotp(operador.totpSecret, codigo)) return true;

  // Código de recuperação: uso único. Compara contra os ainda não usados.
  const normalizado = normalizarCodigoRecuperacao(codigo);
  if (normalizado.length < 8) return false;
  const disponiveis = await prisma.codigoRecuperacao.findMany({
    where: { operadorId, usadoEm: null },
  });
  const acerto = disponiveis.find((c) => verificarSenha(normalizado, c.codigoHash));
  if (!acerto) return false;
  // Marca como usado de forma condicional: se duas requisições correrem juntas,
  // só uma encontra o registro ainda não usado.
  const r = await prisma.codigoRecuperacao.updateMany({
    where: { id: acerto.id, usadoEm: null },
    data: { usadoEm: new Date() },
  });
  return r.count === 1;
}

export async function codigosRecuperacaoRestantes(operadorId: number): Promise<number> {
  return prisma.codigoRecuperacao.count({ where: { operadorId, usadoEm: null } });
}

// Bootstrap do PRIMEIRO operador por variáveis de ambiente. Não é cadastro
// público (não há tela para isso, nunca): é configuração de infraestrutura, o
// equivalente ao scripts/criar-operador.mjs para quem só tem o painel da Vercel
// e não consegue rodar um script contra o banco. Só age quando NÃO existe
// nenhum operador — depois disso, vira no-op.
export async function bootstrapOperadorPorEnv(): Promise<void> {
  const email = process.env.OPERADOR_EMAIL?.trim().toLowerCase();
  const senha = process.env.OPERADOR_SENHA;
  if (!email || !email.includes("@") || !senha || senha.length < 8) return;
  try {
    const existente = await prisma.operador.findUnique({ where: { email } });

    // RESET EXPLÍCITO. Sem isto, trocar OPERADOR_SENHA depois que a conta já
    // existe não faz nada — e quem esqueceu a senha (ou perdeu o autenticador)
    // fica trancado para sempre, porque redefinir exige estar logado.
    // OPERADOR_RESET=1 é a chave de emergência: aplica a senha do ambiente e
    // zera o 2FA para poder reativá-lo. É intencionalmente uma variável à
    // parte, para não reverter sem querer a senha trocada pela tela num
    // redeploy qualquer. Remova-a assim que entrar.
    if (existente) {
      if (process.env.OPERADOR_RESET !== "1") return;
      await prisma.operador.update({
        where: { id: existente.id },
        data: {
          senhaHash: hashSenha(senha),
          ativo: true,
          sessaoVersao: { increment: 1 }, // derruba sessões abertas
          totpSecret: null,
          totpAtivadoEm: null,
        },
      });
      await prisma.codigoRecuperacao.deleteMany({ where: { operadorId: existente.id } });
      console.warn(
        `[operador] OPERADOR_RESET=1 — senha de ${email} redefinida pelo ambiente e 2FA zerado. ` +
          `REMOVA a variável OPERADOR_RESET agora que você já entrou.`
      );
      return;
    }

    await prisma.operador.create({
      data: { nome: "Dono", email, senhaHash: hashSenha(senha) },
    });
    console.warn(`[operador] primeiro operador criado a partir do ambiente: ${email}`);
  } catch {
    /* corrida ou banco indisponível: a tela de entrada explica o que fazer */
  }
}
