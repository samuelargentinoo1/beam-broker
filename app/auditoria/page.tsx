import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { Badge, PageHeader, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const { imobiliaria } = await exigirSessao();
  // Estritamente o tenant da sessão. Antes o OR incluía { imobiliariaId: null },
  // e log sem dono NÃO é log de todo mundo: são ações de plataforma (painel do
  // dono: provisionamento, troca de plano, redefinição de senha) e ações que
  // esqueceram de informar o tenant — todas apareciam para qualquer cliente.
  const logs = await prisma.logAuditoria.findMany({
    where: { imobiliariaId: imobiliaria.id },
    orderBy: { criadoEm: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        kicker="Operação"
        title="Auditoria"
        subtitle="Trilha das ações críticas do sistema (últimos 200 eventos)"
      />
      <Table head={["Data/hora", "Ação", "Entidade", "Detalhes"]}>
        {logs.length === 0 && (
          <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[#7A828F]">Nenhum evento registrado ainda.</td></tr>
        )}
        {logs.map((l) => (
          <tr key={l.id} className="hover:bg-[#07080B]">
            <td className="px-4 py-3 text-[#9AA2AF] whitespace-nowrap">
              {new Date(l.criadoEm).toLocaleString("pt-BR")}
            </td>
            <td className="px-4 py-3"><Badge tone="blue">{l.acao}</Badge></td>
            <td className="px-4 py-3">
              {l.entidade}{l.entidadeId ? ` #${l.entidadeId}` : ""}
            </td>
            <td className="px-4 py-3 text-[#B4BBC5]">{l.detalhes ?? "—"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
