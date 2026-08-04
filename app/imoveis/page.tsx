import Link from "next/link";
import { SEM_BANCO } from "@/lib/sem-banco";
import { redirect as _redirDemo } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { brl } from "@/lib/format";
import { Badge, ButtonLink, EmptyState, PageHeader, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

const statusTone = {
  DISPONIVEL: "blue",
  ALUGADO: "green",
  EM_REFORMA: "amber",
  INATIVO: "slate",
} as const;

const statusLabel = {
  DISPONIVEL: "Disponível",
  ALUGADO: "Alugado",
  EM_REFORMA: "Em reforma",
  INATIVO: "Inativo",
} as const;

export default async function ImoveisPage() {
  // Vitrine sem banco: esta tela lê o Postgres. Manda para a fila do dia.
  if (SEM_BANCO) _redirDemo("/meu-dia");

  const { imobiliaria } = await exigirSessao();
  const imoveis = await prisma.imovel.findMany({
    where: { imobiliariaId: imobiliaria.id },
    include: {
      proprietario: true,
      contratos: { where: { status: "ATIVO" } },
      // primeira foto (capa) — só a URL http(s) serve como imagem
      fotos: { orderBy: { ordem: "asc" }, take: 1, select: { url: true, ordem: true } },
      empreendimento: { select: { id: true, nome: true } },
    },
    orderBy: { codigo: "asc" },
  });
  const vagos = imoveis.filter((i) => i.status === "DISPONIVEL").length;

  return (
    <div>
      <PageHeader
        kicker="Carteira"
        title="Imóveis"
        subtitle={`${imoveis.length} imóveis na carteira · ${vagos} disponíveis`}
        action={
          // Importar saiu do dock: ação em massa não é destino de navegação, é
          // um botão dentro da entidade que ela afeta.
          <span className="flex flex-wrap items-center justify-center gap-2">
            <ButtonLink href="/imoveis/empreendimentos">Empreendimentos</ButtonLink>
            <ButtonLink href="/importar">Importar planilha</ButtonLink>
            <ButtonLink href="/imoveis/novo">+ Novo imóvel</ButtonLink>
          </span>
        }
      />
      {imoveis.length === 0 ? (
        <EmptyState
          glifo="⌂"
          titulo="Cadastre seu primeiro imóvel"
          descricao="Os imóveis são a base da carteira — depois deles você cria contratos, gera faturas e faz os repasses aos proprietários."
          acaoHref="/imoveis/novo"
          acaoLabel="+ Cadastrar imóvel"
        />
      ) : (
      <Table head={["Foto", "Código", "Tipo", "Endereço", "Proprietário", "Aluguel", "Status"]}>
        {imoveis.map((im) => {
          const capa = im.fotos[0]?.url;
          const temImagem = capa && /^https?:\/\//.test(capa);
          return (
          <tr key={im.id} className="hover:bg-[#07080B]">
            <td className="px-4 py-3">
              <Link href={`/imoveis/${im.id}`} className="block">
                <div className="h-14 w-20 rounded-xl overflow-hidden bg-[#1A1E26] border border-[#2A303B] shadow-sm ring-1 ring-white/[.03] flex items-center justify-center">
                  {temImagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={capa} alt={`Foto do imóvel ${im.codigo}`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[#C4C8CE] text-lg">⌂</span>
                  )}
                </div>
              </Link>
            </td>
            <td className="px-4 py-3 font-medium">
              <Link href={`/imoveis/${im.id}`} className="text-[#34C46A] hover:underline">
                {im.codigo}
              </Link>
            </td>
            <td className="px-4 py-3">{im.tipo}</td>
            <td className="px-4 py-3">
              {im.endereco}
              <span className="text-[#7A828F]"> · {im.bairro ?? im.cidade}</span>
              {im.empreendimento && (
                <Link
                  href={`/imoveis/empreendimentos/${im.empreendimento.id}`}
                  className="block text-[11.5px] !text-[#9AA2AF] hover:!text-[#34C46A]"
                >
                  {im.empreendimento.nome}
                  {im.unidade ? ` — ${im.unidade}` : ""}
                </Link>
              )}
            </td>
            <td className="px-4 py-3">{im.proprietario.nome}</td>
            <td className="px-4 py-3">
              {im.contratos[0] ? brl(im.contratos[0].valorAluguel) : brl(im.valorSugerido)}
              {!im.contratos[0] && <span className="text-[#7A828F] text-xs"> (sugerido)</span>}
            </td>
            <td className="px-4 py-3">
              <Badge tone={statusTone[im.status]}>{statusLabel[im.status]}</Badge>
            </td>
          </tr>
          );
        })}
      </Table>
      )}
    </div>
  );
}
