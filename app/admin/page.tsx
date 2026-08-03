import Link from "next/link";
import { PageHeader, StatCard, Table, Badge, ButtonLink } from "@/components/ui";
import { brlDeCentavos } from "@/lib/admin";
import { exigirOperador } from "@/lib/operador";
import { prisma } from "@/lib/db";
import { demandaDoMesPorImobiliaria } from "@/lib/demanda";

export const dynamic = "force-dynamic";

// Painel do dono: lista TODAS as imobiliárias da plataforma. A tela por cliente
// fica em /admin/clientes/[id]; o provisionamento em /admin/clientes/novo; a
// calculadora de CMV em /admin/calculadora.
//
// Toda imobiliária aqui é cliente de verdade: o dono é um Operador, entidade
// separada, então não existe mais tenant "interno" para filtrar.
export default async function AdminPage() {
  await exigirOperador();

  const imobiliarias = await prisma.imobiliaria.findMany({
    include: {
      plano: true,
      _count: { select: { usuarios: true, imoveis: true, contratos: true } },
    },
    orderBy: { id: "asc" },
  });

  const demandaPorImob = await demandaDoMesPorImobiliaria();
  const agora = new Date();
  const emTrial = (i: (typeof imobiliarias)[number]) =>
    !i.assinaturaAtiva && !i.bloqueadaEm && i.trialAte != null && i.trialAte > agora;

  const ativas = imobiliarias.filter((i) => i.assinaturaAtiva).length;
  const trials = imobiliarias.filter(emTrial).length;
  const bloqueadas = imobiliarias.filter((i) => i.bloqueadaEm).length;
  const mrrCentavos = imobiliarias.reduce(
    (s, i) => s + (i.assinaturaAtiva ? i.plano?.mensalidadeCentavos ?? 0 : 0),
    0
  );

  return (
    <div>
      <PageHeader
        kicker="painel do dono"
        title="Clientes"
        subtitle="Todas as imobiliárias da plataforma — assinatura, plano e carteira."
        action={<ButtonLink href="/admin/clientes/novo">Novo cliente</ButtonLink>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <StatCard label="Clientes" value={String(imobiliarias.length)} hint={`${trials} em trial`} />
        <StatCard label="Assinaturas ativas" value={String(ativas)} tone={ativas > 0 ? "good" : "default"} />
        <StatCard label="Bloqueadas" value={String(bloqueadas)} tone={bloqueadas > 0 ? "bad" : "default"} />
        <StatCard label="MRR" value={brlDeCentavos(mrrCentavos)} hint="mensalidades ativas" />
      </div>

      <Table head={["#", "Imobiliária", "Plano", "Situação", "Imóveis", "Contratos", "Usuários", "Demanda represada"]}>
        {imobiliarias.length === 0 && (
          <tr>
            <td colSpan={8} className="px-4 py-8 text-center text-sm text-[#7A828F]">
              Nenhuma imobiliária ainda. Comece em “Novo cliente”.
            </td>
          </tr>
        )}
        {imobiliarias.map((i) => (
          <tr key={i.id} className="hover:bg-[#07080B]">
            <td className="px-4 py-3 tabular-nums text-[#7A828F]">{i.id}</td>
            <td className="px-4 py-3">
              <Link href={`/admin/clientes/${i.id}`} className="font-medium text-[#8CF0B0] hover:underline">
                {i.nome}
              </Link>
              <span className="block text-[11px] text-[#7A828F]">
                {[i.municipio, i.uf].filter(Boolean).join(" · ") || "—"}
              </span>
            </td>
            <td className="px-4 py-3 text-[#9AA2AF]">{i.plano?.nome ?? "—"}</td>
            <td className="px-4 py-3">
              {i.bloqueadaEm ? (
                <Badge tone="red">bloqueada</Badge>
              ) : i.assinaturaAtiva ? (
                <Badge tone="green">ativa</Badge>
              ) : emTrial(i) ? (
                <Badge tone="amber">trial</Badge>
              ) : (
                <Badge tone="slate">sem assinatura</Badge>
              )}
            </td>
            <td className="px-4 py-3 tabular-nums">{i._count.imoveis}</td>
            <td className="px-4 py-3 tabular-nums">{i._count.contratos}</td>
            <td className="px-4 py-3 tabular-nums">{i._count.usuarios}</td>
            {/* Quem está pronto para upgrade aparece de relance. */}
            <td className="px-4 py-3 tabular-nums">
              {demandaPorImob.get(i.id) ? (
                <span className="font-medium text-[#F5B23D]">{demandaPorImob.get(i.id)}</span>
              ) : (
                <span className="text-[#39414F]">—</span>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <div className="mt-4">
        <Link href="/admin/calculadora" className="text-[13px] text-[#34C46A] hover:underline">
          → Calculadora de CMV (simular custo de IA antes de fechar preço)
        </Link>
      </div>
    </div>
  );
}
