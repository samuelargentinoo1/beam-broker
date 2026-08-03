import { exigirSessao } from "@/lib/sessao";
import { criarEmpreendimento } from "@/lib/acoes-empreendimento";
import { Card, PageHeader, SubmitButton } from "@/components/ui";
import CamposEmpreendimento from "@/components/campos-empreendimento";

export const dynamic = "force-dynamic";

export default async function NovoEmpreendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { imobiliaria } = await exigirSessao();
  const { erro } = await searchParams;

  return (
    <div>
      <PageHeader
        kicker="Carteira"
        title="Novo empreendimento"
        breadcrumb={[
          { label: "Imóveis", href: "/imoveis" },
          { label: "Empreendimentos", href: "/imoveis/empreendimentos" },
          { label: "Novo" },
        ]}
        subtitle="Construtora, entrega, metragem e enquadramento MCMV — as unidades herdam tudo isso"
      />
      {erro && (
        <div className="mx-auto mb-4 max-w-[660px] rounded-2xl border border-[rgba(220,38,38,.3)] bg-[rgba(220,38,38,.06)] px-4 py-3 text-[13px] text-[#B91C1C]">
          Não deu pra cadastrar: {erro}
        </div>
      )}
      <Card className="mx-auto max-w-[660px] p-6">
        <form action={criarEmpreendimento} className="grid grid-cols-2 gap-4">
          <CamposEmpreendimento
            valores={{ cidade: imobiliaria.municipio, uf: imobiliaria.uf, toleranciaMeses: 6 }}
          />
          <div className="col-span-2 pt-2">
            <SubmitButton>Cadastrar empreendimento</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
