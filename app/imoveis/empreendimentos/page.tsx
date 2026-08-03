import Link from "next/link";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { brl, dataBr } from "@/lib/format";
import { TOM_SITUACAO, analisarEntrega, valorM2 } from "@/lib/empreendimentos";
import { Badge, ButtonLink, EmptyState, PageHeader, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EmpreendimentosPage() {
  const { imobiliaria } = await exigirSessao();
  const empreendimentos = await prisma.empreendimento.findMany({
    where: { imobiliariaId: imobiliaria.id },
    include: { _count: { select: { imoveis: true } } },
    orderBy: [{ entregaReal: "asc" }, { nome: "asc" }],
  });

  const atrasados = empreendimentos.filter(
    (e) => analisarEntrega(e).situacao === "ATRASADA"
  ).length;

  return (
    <div>
      <PageHeader
        kicker="Carteira"
        title="Empreendimentos"
        breadcrumb={[{ label: "Imóveis", href: "/imoveis" }, { label: "Empreendimentos" }]}
        subtitle={
          empreendimentos.length === 0
            ? "Prédios na planta e em obras, com construtora, entrega e enquadramento MCMV"
            : `${empreendimentos.length} empreendimento(s)${atrasados > 0 ? ` · ${atrasados} com entrega atrasada` : ""}`
        }
        action={<ButtonLink href="/imoveis/empreendimentos/novo">+ Novo empreendimento</ButtonLink>}
      />

      {empreendimentos.length === 0 ? (
        <EmptyState
          glifo="▥"
          titulo="Cadastre seu primeiro empreendimento"
          descricao="Um empreendimento agrupa as unidades de um mesmo prédio: construtora, datas de entrega, metragem, preço de avaliação e as faixas do Minha Casa Minha Vida ficam registrados uma vez só."
          acaoHref="/imoveis/empreendimentos/novo"
          acaoLabel="+ Cadastrar empreendimento"
        />
      ) : (
        <Table
          head={["Empreendimento", "Construtora", "Localização", "m²", "Avaliação", "MCMV", "Unidades", "Entrega"]}
        >
          {empreendimentos.map((e) => {
            const entrega = analisarEntrega(e);
            const m2 = valorM2(e.precoAvaliacao ? Number(e.precoAvaliacao) : null, e.metragemM2);
            return (
              <tr key={e.id}>
                <td className="px-[18px] py-3 font-medium">
                  <Link href={`/imoveis/empreendimentos/${e.id}`} className="text-[#34C46A] hover:underline">
                    {e.nome}
                  </Link>
                </td>
                <td className="px-[18px] py-3">{e.construtora}</td>
                <td className="px-[18px] py-3">
                  {e.bairro ? `${e.bairro} · ` : ""}
                  {e.cidade}/{e.uf}
                  {e.pontoReferencia && (
                    <span className="block text-[11.5px] text-[#7A828F]">{e.pontoReferencia}</span>
                  )}
                </td>
                <td className="px-[18px] py-3 tabular-nums">
                  {e.metragemM2 ? `${e.metragemM2.toLocaleString("pt-BR")} m²` : "—"}
                  {m2 && <span className="block text-[11.5px] text-[#7A828F]">{brl(m2)}/m²</span>}
                </td>
                <td className="px-[18px] py-3 tabular-nums">{brl(e.precoAvaliacao)}</td>
                <td className="px-[18px] py-3">
                  {e.faixasMcmv.length === 0 ? (
                    <span className="text-[#7A828F]">fora</span>
                  ) : (
                    <span className="tabular-nums">{e.faixasMcmv.join(", ")}</span>
                  )}
                </td>
                <td className="px-[18px] py-3 tabular-nums">{e._count.imoveis}</td>
                <td className="px-[18px] py-3">
                  <Badge tone={TOM_SITUACAO[entrega.situacao]}>{entrega.rotulo}</Badge>
                  {entrega.referencia && (
                    <span className="mt-1 block text-[11.5px] text-[#7A828F]">
                      {dataBr(entrega.referencia)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
