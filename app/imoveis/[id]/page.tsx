import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { criarVistoria } from "@/lib/acoes-locacao";
import { removerArquivo } from "@/lib/storage";
import CarrosselFotos from "@/components/carrossel-fotos";
import UploadFotos from "@/components/upload-fotos";
import { brl, dataBr } from "@/lib/format";
import { TOM_SITUACAO, analisarEntrega } from "@/lib/empreendimentos";
import { Badge, Card, PageHeader, SubmitButton, Table, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

// Adiciona uma ou mais fotos ao imóvel (upload para o Vercel Blob → URL pública
// que a IA usa para enviar pelo WhatsApp).
async function adicionarFotos(formData: FormData) {
  "use server";
  const { imobiliaria } = await exigirSessao();
  const imovelId = Number(formData.get("imovelId"));
  const imovel = await prisma.imovel.findFirst({
    where: { id: imovelId, imobiliariaId: imobiliaria.id },
    include: { fotos: { select: { ordem: true }, orderBy: { ordem: "desc" }, take: 1 } },
  });
  if (!imovel) return;
  let ordem = (imovel.fotos[0]?.ordem ?? -1) + 1;
  const arquivos = formData.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  const { salvarFotoImovel } = await import("@/lib/storage");
  const { headers } = await import("next/headers");
  const h = await headers();
  const base = process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  for (const arq of arquivos) {
    if (!arq.type.startsWith("image/")) continue;
    await salvarFotoImovel(imovelId, Buffer.from(await arq.arrayBuffer()), arq.type || "image/jpeg", ordem++, base);
  }
  revalidatePath(`/imoveis/${imovelId}`);
}

async function removerFoto(formData: FormData) {
  "use server";
  const { imobiliaria } = await exigirSessao();
  const fotoId = Number(formData.get("fotoId"));
  const foto = await prisma.fotoImovel.findFirst({
    where: { id: fotoId, imovel: { imobiliariaId: imobiliaria.id } },
  });
  if (!foto) return;
  await removerArquivo(foto.url).catch(() => {});
  await prisma.fotoImovel.delete({ where: { id: foto.id } });
  revalidatePath(`/imoveis/${foto.imovelId}`);
}

export default async function ImovelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { imobiliaria } = await exigirSessao();
  const imovel = await prisma.imovel.findFirst({
    where: { id: Number(id), imobiliariaId: imobiliaria.id },
    include: {
      proprietario: true,
      contratos: { include: { inquilino: true }, orderBy: { inicio: "desc" } },
      vistorias: { orderBy: { data: "desc" } },
      fotos: { orderBy: { ordem: "asc" }, select: { id: true, url: true, ordem: true } },
      empreendimento: true,
    },
  });
  if (!imovel) notFound();

  // O que a unidade herda do empreendimento — mostrado aqui para o corretor não
  // precisar abrir outra tela na frente do cliente.
  const entrega = imovel.empreendimento ? analisarEntrega(imovel.empreendimento) : null;

  return (
    <div>
      <PageHeader
        kicker="Carteira"
        breadcrumb={[{ label: "Imóveis", href: "/imoveis" }, { label: imovel.codigo }]}
        title={`${imovel.codigo} — ${imovel.tipo}`}
        subtitle={`${imovel.endereco} · ${imovel.bairro ?? ""} · ${imovel.cidade}/${imovel.uf}`}
      />
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-xs text-[#9AA2AF] uppercase font-medium">Proprietário</p>
          <p className="font-semibold mt-1">{imovel.proprietario.nome}</p>
          <p className="text-sm text-[#9AA2AF]">{imovel.proprietario.telefone}</p>
          <p className="text-xs text-[#7A828F] mt-2">
            PIX: {imovel.proprietario.chavePix ?? "não cadastrado"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[#9AA2AF] uppercase font-medium">Valores</p>
          <p className="text-sm mt-1">Aluguel sugerido: <strong>{brl(imovel.valorSugerido)}</strong></p>
          <p className="text-sm">Condomínio: {brl(imovel.valorCondominio)}</p>
          <p className="text-sm">IPTU mensal: {brl(imovel.valorIptuMensal)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[#9AA2AF] uppercase font-medium">Status</p>
          <p className="mt-2">
            <Badge tone={imovel.status === "ALUGADO" ? "green" : imovel.status === "DISPONIVEL" ? "blue" : "amber"}>
              {imovel.status}
            </Badge>
          </p>
        </Card>
      </div>

      {imovel.empreendimento && entrega && (
        <Card className="p-5 mb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="m-0 text-sm font-semibold">
              <Link
                href={`/imoveis/empreendimentos/${imovel.empreendimento.id}`}
                className="text-[#34C46A] hover:underline"
              >
                {imovel.empreendimento.nome}
              </Link>
              {imovel.unidade && <span className="text-[#9AA2AF]"> — {imovel.unidade}</span>}
            </p>
            <Badge tone={TOM_SITUACAO[entrega.situacao]}>{entrega.rotulo}</Badge>
          </div>
          <p className="m-0 mt-1 text-[12.5px] text-[#9AA2AF]">
            {imovel.empreendimento.construtora}
            {imovel.empreendimento.pontoReferencia && ` · ${imovel.empreendimento.pontoReferencia}`}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px] lg:grid-cols-4">
            <span className="text-[#9AA2AF]">
              Previsão da construtora
              <b className="block text-[#F4F5F7]">{dataBr(imovel.empreendimento.entregaPrevista)}</b>
            </span>
            <span className="text-[#9AA2AF]">
              Entrega contratual
              <b className="block text-[#F4F5F7]">{dataBr(entrega.contratual)}</b>
            </span>
            <span className="text-[#9AA2AF]">
              Entrega real
              <b className="block text-[#F4F5F7]">{dataBr(imovel.empreendimento.entregaReal)}</b>
            </span>
            <span className="text-[#9AA2AF]">
              MCMV
              <b className="block text-[#F4F5F7]">
                {imovel.empreendimento.faixasMcmv.length === 0
                  ? "fora do programa"
                  : `Faixa ${imovel.empreendimento.faixasMcmv.join(", ")}`}
              </b>
            </span>
          </div>
        </Card>
      )}

      <h2 className="font-semibold mb-3">Fotos do imóvel</h2>
      <Card className="p-4 mb-6">
        <p className="text-[12.5px] text-[#9AA2AF] mb-3">
          Estas fotos aparecem aqui e a <b>IA de vendas envia em lote no WhatsApp</b> quando o
          interessado pede para ver o imóvel. As imagens já ficam com URL pública automaticamente
          (não precisa configurar mais nada).
        </p>
        {imovel.fotos.length > 0 && (
          <CarrosselFotos
            fotos={imovel.fotos.map((f) => ({ id: f.id, url: f.url, ordem: f.ordem }))}
            codigo={imovel.codigo}
            removerFoto={removerFoto}
          />
        )}
        <form action={adicionarFotos} className="space-y-3">
          <input type="hidden" name="imovelId" value={imovel.id} />
          <UploadFotos />
          <SubmitButton>+ Adicionar fotos</SubmitButton>
        </form>
      </Card>

      <h2 className="font-semibold mb-3">Histórico de contratos</h2>
      <div className="mb-6">
        <Table head={["Contrato", "Inquilino", "Período", "Aluguel", "Status"]}>
          {imovel.contratos.map((ct) => (
            <tr key={ct.id} className="hover:bg-[#07080B]">
              <td className="px-4 py-3">
                <Link href={`/contratos/${ct.id}`} className="text-[#34C46A] hover:underline font-medium">
                  {ct.codigo}
                </Link>
              </td>
              <td className="px-4 py-3">{ct.inquilino.nome}</td>
              <td className="px-4 py-3">{dataBr(ct.inicio)} → {dataBr(ct.fim)}</td>
              <td className="px-4 py-3">{brl(ct.valorAluguel)}</td>
              <td className="px-4 py-3">
                <Badge tone={ct.status === "ATIVO" ? "green" : "slate"}>{ct.status}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      </div>

      <h2 className="font-semibold mb-3">Vistorias</h2>
      <Card className="p-4 mb-4">
        <form action={criarVistoria} className="flex items-end gap-3">
          <input type="hidden" name="imovelId" value={imovel.id} />
          <div>
            <label className="block text-xs text-[#B4BBC5] mb-1">Tipo</label>
            <select name="tipo" className={inputClass}>
              <option value="ENTRADA">Entrada</option>
              <option value="SAIDA">Saída</option>
              <option value="PERIODICA">Periódica</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-[#B4BBC5] mb-1">Laudo / observações</label>
            <input name="laudo" className={inputClass} placeholder="estado geral, pendências…" />
          </div>
          <SubmitButton>+ Registrar vistoria</SubmitButton>
        </form>
      </Card>
      <Table head={["Data", "Tipo", "Laudo"]}>
        {imovel.vistorias.length === 0 && (
          <tr><td colSpan={3} className="px-4 py-6 text-center text-[#9AA2AF] text-sm">Nenhuma vistoria registrada.</td></tr>
        )}
        {imovel.vistorias.map((v) => (
          <tr key={v.id}>
            <td className="px-4 py-3">{dataBr(v.data)}</td>
            <td className="px-4 py-3"><Badge>{v.tipo}</Badge></td>
            <td className="px-4 py-3 text-[#B4BBC5]">{v.laudo}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
