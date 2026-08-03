// Trilha de auditoria das ações críticas do sistema.
import { prisma } from "@/lib/db";

export async function auditar(
  acao: string,
  entidade: string,
  entidadeId?: number,
  detalhes?: string,
  imobiliariaId?: number,
  usuarioId?: number
) {
  // Preenche o tenant/autor a partir da sessão quando o chamador não informou.
  // Sem isto a maioria das chamadas gravava imobiliariaId NULL — e um log sem
  // dono não pertence a ninguém, então não pode aparecer na trilha de nenhum
  // cliente (a tela /auditoria filtra estritamente pelo tenant da sessão).
  // Contextos sem request (webhook, cron, script) seguem sem tenant.
  if (imobiliariaId == null || usuarioId == null) {
    try {
      const { getSessao } = await import("@/lib/sessao");
      const sessao = await getSessao();
      if (sessao) {
        imobiliariaId = imobiliariaId ?? sessao.imobiliaria.id;
        usuarioId = usuarioId ?? sessao.usuario.id;
      }
    } catch {
      /* fora de um request (cron/webhook): grava sem tenant */
    }
  }

  await prisma.logAuditoria
    .create({ data: { acao, entidade, entidadeId, detalhes, imobiliariaId, usuarioId } })
    .catch(() => {}); // auditoria nunca derruba a operação principal
}
