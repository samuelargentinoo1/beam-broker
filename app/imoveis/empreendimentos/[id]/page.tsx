import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { brl, dataBr } from "@/lib/format";
import {
  COMPROMETIMENTO_MAX,
  FAIXAS_MCMV,
  TOM_SITUACAO,
  analisarEntrega,
  faixa,
  faixasPeloPreco,
  valorM2,
} from "@/lib/empreendimentos";
import {
  atualizarEmpreendimento,
  registrarEntregaReal,
  salvarBookEmpreendimento,
  vincularUnidade,
} from "@/lib/acoes-empreendimento";
import { Badge, Card, Empty, PageHeader, SubmitButton, Table, inputClass } from "@/components/ui";
import CamposEmpreendimento from "@/components/campos-empreendimento";

export const dynamic = "force-dynamic";

function Linha({ rotulo, valor, dica }: { rotulo: string; valor: React.ReactNode; dica?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#1A1E26] py-2.5 last:border-0">
      <span className="text-[12.5px] text-[#9AA2AF]">
        {rotulo}
        {dica && <span className="block text-[11px] text-[#7A828F]">{dica}</span>}
      </span>
      <span className="text-right text-[13.5px] font-medium tabular-nums text-[#F4F5F7]">{valor}</span>
    </div>
  );
}

export default async function EmpreendimentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { imobiliaria } = await exigirSessao();
  const { id } = await params;
  const { erro, ok } = await searchParams;

  const emp = await prisma.empreendimento.findFirst({
    where: { id: Number(id), imobiliariaId: imobiliaria.id },
    include: {
      imoveis: {
        orderBy: [{ unidade: "asc" }, { codigo: "asc" }],
        select: { id: true, codigo: true, unidade: true, tipo: true, status: true, valorVenda: true },
      },
    },
  });
  if (!emp) notFound();

  // Unidades ainda soltas: qualquer imóvel do tenant sem empreendimento. É por
  // aqui que uma carteira já cadastrada passa a fazer parte do empreendimento.
  const soltos = await prisma.imovel.findMany({
    where: { imobiliariaId: imobiliaria.id, empreendimentoId: null },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, endereco: true },
    take: 200,
  });

  const entrega = analisarEntrega(emp);
  const preco = emp.precoAvaliacao ? Number(emp.precoAvaliacao) : null;
  const m2 = valorM2(preco, emp.metragemM2);
  // Quem consegue comprar por este preço dentro do MCMV — o teto é do imóvel, a
  // faixa é da renda. As marcadas no cadastro que não cabem no preço viram alerta.
  const cabemNoPreco = faixasPeloPreco(preco);
  const marcadasForaDoTeto = emp.faixasMcmv.filter(
    (n) => preco != null && !cabemNoPreco.some((f) => f.faixa === n)
  );

  return (
    <div>
      <PageHeader
        kicker={emp.construtora}
        title={emp.nome}
        breadcrumb={[
          { label: "Imóveis", href: "/imoveis" },
          { label: "Empreendimentos", href: "/imoveis/empreendimentos" },
          { label: emp.nome },
        ]}
        subtitle={`${emp.bairro ? `${emp.bairro} · ` : ""}${emp.cidade}/${emp.uf}${
          emp.pontoReferencia ? ` — ${emp.pontoReferencia}` : ""
        }`}
        action={<Badge tone={TOM_SITUACAO[entrega.situacao]}>{entrega.rotulo}</Badge>}
      />

      {erro && (
        <div className="mx-auto mb-4 max-w-[900px] rounded-2xl border border-[rgba(220,38,38,.3)] bg-[rgba(220,38,38,.06)] px-4 py-3 text-[13px] text-[#B91C1C]">
          Não deu pra salvar: {erro}
        </div>
      )}
      {ok && !erro && (
        <div className="mx-auto mb-4 max-w-[900px] rounded-2xl border border-[rgba(52,196,106,.25)] bg-[rgba(52,196,106,.06)] px-4 py-3 text-[13px] text-[#34C46A]">
          Salvo.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── As três datas de entrega ───────────────────────────────────── */}
        <Card className="p-5">
          <p className="m-0 mb-1 text-sm font-semibold">Entrega</p>
          <p className="m-0 mb-3 text-[12px] leading-relaxed text-[#7A828F]">
            São três datas diferentes. Prometer a previsão como se fosse a contratual é o que gera
            reclamação depois.
          </p>
          <Linha
            rotulo="Previsão da construtora"
            dica="o que a construtora promete — muda, e costuma mudar para pior"
            valor={dataBr(emp.entregaPrevista)}
          />
          <Linha
            rotulo="Entrega contratual"
            dica={
              emp.obraIniciadaEm && emp.prazoObraMeses
                ? `${dataBr(emp.obraIniciadaEm)} + ${emp.prazoObraMeses} meses`
                : "informe o início da obra e o prazo para calcular"
            }
            valor={dataBr(entrega.contratual)}
          />
          <Linha
            rotulo={`Limite com tolerância (${emp.toleranciaMeses} meses)`}
            dica="passou disto, o atraso é inadimplemento da construtora"
            valor={dataBr(entrega.tolerado)}
          />
          <Linha
            rotulo="Entrega real"
            dica="não dá para prever — só é registrada quando acontece"
            valor={emp.entregaReal ? dataBr(emp.entregaReal) : <span className="text-[#7A828F]">—</span>}
          />

          <form action={registrarEntregaReal} className="mt-4 flex items-end gap-3 border-t border-[#1E222B] pt-4">
            <input type="hidden" name="id" value={emp.id} />
            <label className="block min-w-0 flex-1">
              <span className="label-caps mb-1.5 block !text-[9px] tracking-[.1em] text-[#9AA2AF]">
                Registrar entrega real
              </span>
              <input
                name="entregaReal"
                type="date"
                className={inputClass}
                defaultValue={emp.entregaReal ? new Date(emp.entregaReal).toISOString().slice(0, 10) : ""}
              />
            </label>
            <SubmitButton>Salvar</SubmitButton>
          </form>
        </Card>

        {/* ── Preço, metragem e MCMV ─────────────────────────────────────── */}
        <Card className="p-5">
          <p className="m-0 mb-1 text-sm font-semibold">Preço e enquadramento</p>
          <p className="m-0 mb-3 text-[12px] leading-relaxed text-[#7A828F]">
            A faixa do MCMV é definida pela renda do comprador. O que o imóvel define é o teto — se o
            preço passa do teto, aquele comprador não leva.
          </p>
          <Linha rotulo="Metragem" valor={emp.metragemM2 ? `${emp.metragemM2.toLocaleString("pt-BR")} m²` : "—"} />
          <Linha rotulo="Preço de avaliação" valor={brl(emp.precoAvaliacao)} />
          <Linha rotulo="Valor do m²" valor={m2 ? `${brl(m2)}/m²` : "—"} />

          <p className="mt-4 mb-2 text-[12.5px] font-medium text-[#C9CFD8]">Faixas atendidas</p>
          {emp.faixasMcmv.length === 0 ? (
            <p className="m-0 text-[12.5px] text-[#7A828F]">
              Nenhuma faixa marcada — venda fora do programa (SBPE/SFH).
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {emp.faixasMcmv.map((n) => {
                const f = faixa(n);
                if (!f) return null;
                const foraDoTeto = marcadasForaDoTeto.includes(n);
                return (
                  <li
                    key={n}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-[10px] bg-[#14171D] px-3 py-2 text-[12.5px]"
                  >
                    <span className="font-medium text-[#F4F5F7]">{f.rotulo}</span>
                    <span className="tabular-nums text-[#9AA2AF]">
                      renda até {brl(f.rendaAte)} · parcela até{" "}
                      {brl(f.rendaAte * COMPROMETIMENTO_MAX)} · {f.jurosAnoPct}% a.a.
                    </span>
                    {foraDoTeto && (
                      <span className="w-full text-[11.5px] text-[#F5B23D]">
                        Atenção: o preço de {brl(preco)} passa do teto de {brl(f.tetoImovel)} desta
                        faixa.
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {preco != null && (
            <p className="mt-3 mb-0 text-[11.5px] leading-relaxed text-[#7A828F]">
              Por {brl(preco)}, o teto do programa permite{" "}
              {cabemNoPreco.length === 0
                ? "nenhuma faixa do MCMV"
                : cabemNoPreco.map((f) => f.rotulo).join(", ")}
              . Limite de comprometimento de renda: {Math.round(COMPROMETIMENTO_MAX * 100)}%.
            </p>
          )}
        </Card>
      </div>

      {/* ── Book em PDF ─────────────────────────────────────────────────── */}
      <Card className="mt-5 p-5">
        <p className="m-0 mb-1 text-sm font-semibold">Book de venda (PDF)</p>
        <p className="m-0 mb-3 text-[12px] leading-relaxed text-[#7A828F]">
          É o único material deste empreendimento que a IA pode mandar. Sem book anexado, ela é
          proibida de prometer qualquer material — empreendimento não tem foto.
        </p>
        {emp.bookUrl ? (
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={emp.bookUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-[#34C46A] hover:underline"
            >
              📄 {emp.bookNome ?? "book.pdf"}
            </a>
            <form action={salvarBookEmpreendimento}>
              <input type="hidden" name="id" value={emp.id} />
              <input type="hidden" name="acao" value="remover" />
              <button
                type="submit"
                className="cursor-pointer text-[12px] text-[#7A828F] hover:text-[#FF5C7A]"
              >
                remover
              </button>
            </form>
          </div>
        ) : (
          <p className="m-0 mb-3 text-[12.5px] text-[#7A828F]">Nenhum book anexado.</p>
        )}
        <form action={salvarBookEmpreendimento} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={emp.id} />
          <label className="block min-w-[240px] flex-1">
            <span className="label-caps mb-1.5 block !text-[9px] tracking-[.1em] text-[#9AA2AF]">
              {emp.bookUrl ? "Trocar o book" : "Anexar book"}
            </span>
            <input type="file" name="book" accept="application/pdf,.pdf" className={inputClass} />
          </label>
          <SubmitButton>Salvar book</SubmitButton>
        </form>
      </Card>

      {/* ── Unidades ────────────────────────────────────────────────────── */}
      <Card className="mt-5 p-5">
        <p className="m-0 mb-3 text-sm font-semibold">Unidades ({emp.imoveis.length})</p>
        {emp.imoveis.length === 0 ? (
          <Empty>Nenhuma unidade vinculada ainda.</Empty>
        ) : (
          <Table head={["Unidade", "Código", "Tipo", "Venda", "Status", ""]}>
            {emp.imoveis.map((im) => (
              <tr key={im.id}>
                <td className="px-[18px] py-3">{im.unidade ?? "—"}</td>
                <td className="px-[18px] py-3 font-medium">
                  <Link href={`/imoveis/${im.id}`} className="text-[#34C46A] hover:underline">
                    {im.codigo}
                  </Link>
                </td>
                <td className="px-[18px] py-3">{im.tipo}</td>
                <td className="px-[18px] py-3 tabular-nums">{brl(im.valorVenda)}</td>
                <td className="px-[18px] py-3">{im.status}</td>
                <td className="px-[18px] py-3 text-right">
                  <form action={vincularUnidade}>
                    <input type="hidden" name="empreendimentoId" value={emp.id} />
                    <input type="hidden" name="imovelId" value={im.id} />
                    <input type="hidden" name="acao" value="desvincular" />
                    <button type="submit" className="cursor-pointer text-[12px] text-[#7A828F] hover:text-[#FF5C7A]">
                      desvincular
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        )}

        {soltos.length > 0 && (
          <form action={vincularUnidade} className="mt-4 grid grid-cols-2 items-end gap-3 border-t border-[#1E222B] pt-4 lg:grid-cols-4">
            <input type="hidden" name="empreendimentoId" value={emp.id} />
            <label className="col-span-2 block min-w-0">
              <span className="label-caps mb-1.5 block !text-[9px] tracking-[.1em] text-[#9AA2AF]">
                Vincular imóvel já cadastrado
              </span>
              <select name="imovelId" className={inputClass} required>
                {soltos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.codigo} — {i.endereco}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="label-caps mb-1.5 block !text-[9px] tracking-[.1em] text-[#9AA2AF]">
                Unidade
              </span>
              <input name="unidade" className={inputClass} placeholder="Torre B — 402" />
            </label>
            <SubmitButton>Vincular</SubmitButton>
          </form>
        )}
      </Card>

      {/* ── Edição ──────────────────────────────────────────────────────── */}
      <Card className="mt-5 p-6">
        <p className="m-0 mb-4 text-sm font-semibold">Editar empreendimento</p>
        <form action={atualizarEmpreendimento} className="grid grid-cols-2 gap-4">
          <input type="hidden" name="id" value={emp.id} />
          {/* Decimal vira number só aqui, na borda de apresentação. */}
          <CamposEmpreendimento valores={{ ...emp, precoAvaliacao: preco }} />
          <div className="col-span-2 pt-2">
            <SubmitButton>Salvar alterações</SubmitButton>
          </div>
        </form>
      </Card>

      <p className="mt-4 text-center text-[11.5px] text-[#7A828F]">
        Rendas, tetos e taxas das {FAIXAS_MCMV.length} faixas seguem as regras vigentes do MCMV —
        atualize em <code>lib/empreendimentos.ts</code> quando a portaria mudar.
      </p>
    </div>
  );
}
