// Sessão do usuário logado — carrega usuário + imobiliária (tenant).
// Toda página e server action usa exigirSessao() para escopar os dados.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { COOKIE_SESSAO, validarToken } from "@/lib/auth";
import { SEM_BANCO, SESSAO_DEMO } from "@/lib/sem-banco";
import type { Imobiliaria, Usuario } from "@prisma/client";

export type Sessao = { usuario: Usuario; imobiliaria: Imobiliaria };

// cache() deduplica por request — várias chamadas na mesma página custam 1 query
export const getSessao = cache(async (): Promise<Sessao | null> => {
  // Vitrine sem banco: não há Usuario para consultar; entra direto.
  if (SEM_BANCO) return SESSAO_DEMO;
  const jar = await cookies();
  const token = await validarToken(jar.get(COOKIE_SESSAO)?.value);
  if (!token) return null;
  const usuario = await prisma.usuario.findUnique({
    where: { id: token.usuarioId },
    include: { imobiliaria: true },
  });
  if (!usuario) return null;
  // Revogação de sessão: se a versão do token não bate com a do banco (troca de
  // senha, logout global), o cookie está invalidado.
  if (usuario.sessaoVersao !== token.sessaoVersao) return null;
  const { imobiliaria, ...dados } = usuario;
  return { usuario: dados as Usuario, imobiliaria };
});

export async function exigirSessao(): Promise<Sessao> {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  // Senha provisória (cliente recém-provisionado ou senha redefinida pelo dono):
  // trava o app em /trocar-senha até o usuário definir a própria. A página
  // /trocar-senha usa getSessao() direto (não exigirSessao) para não entrar em
  // laço de redirecionamento.
  if (sessao.usuario.precisaTrocarSenha) redirect("/trocar-senha");
  return sessao;
}

// Revoga TODAS as sessões ativas de um usuário incrementando a versão de sessão.
// Os cookies existentes passam a divergir do banco e são rejeitados por getSessao.
// Chame após troca de senha ou "sair de todos os dispositivos".
export async function revogarSessoes(usuarioId: number): Promise<void> {
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { sessaoVersao: { increment: 1 } },
  });
}
