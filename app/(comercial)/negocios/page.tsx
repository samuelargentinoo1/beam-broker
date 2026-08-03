import Link from "next/link";
import { exigirSessao } from "@/lib/sessao";
import {
  brl,
  carregarQuadro,
  garantirFunil,
  listarFunis,
  previsaoPonderada,
  type CardNegocio,
} from "@/lib/negocios";
import { acaoCriarNegocio, acaoDefinirResultado, acaoMoverFase } from "@/lib/acoes-negocios";
import { PageHeader } from "@/components/ui";
import NegociosQuadro from "@/components/negocios-quadro";

export const dynamic = "force-dynamic";

export default async function NegociosPage({
  searchParams,
}: {
  searchParams: Promise<{ funil?: string }>;
}) {
  const { imobiliaria } = await exigirSessao();
  // Abrir o módulo já provisiona o funil padrão: um quadro sem colunas não
  // ensina nada e não dá por onde começar.
  await garantirFunil(imobiliaria.id);
  const funis = await listarFunis(imobiliaria.id);

  const { funil: pedido } = await searchParams;
  const funil = funis.find((f) => String(f.id) === pedido) ?? funis[0]!;

  const cards: CardNegocio[] = await carregarQuadro(imobiliaria.id, funil.id);
  const total = cards.reduce((s, c) => s + (c.valor ?? 0), 0);
  const ponderada = previsaoPonderada(cards);

  async function mover(negocioId: number, faseId: number) {
    "use server";
    await acaoMoverFase(negocioId, faseId);
  }

  async function fechar(negocioId: number, resultado: string, motivo: string | null) {
    "use server";
    await acaoDefinirResultado(negocioId, resultado, motivo);
  }

  return (
    <div>
      <PageHeader
        kicker="Comercial"
        title="Negócios"
        subtitle="O funil da equipe — arraste o card para mudar de fase"
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Seletor de funil: só vira lista quando há mais de um, para não
            ocupar espaço com um menu de uma opção só. */}
        <div className="flex items-center gap-2">
          {funis.length > 1 ? (
            funis.map((f) => (
              <Link
                key={f.id}
                href={`/negocios?funil=${f.id}`}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] no-underline transition-colors ${
                  f.id === funil.id
                    ? "border-[#34C46A] bg-[rgba(52,196,106,.07)] text-[#8CF0B0]"
                    : "border-[#2A303B] text-[#9AA2AF] hover:border-[#34C46A]"
                }`}
              >
                {f.nome}
              </Link>
            ))
          ) : (
            <span className="rounded-full border border-[#2A303B] px-3.5 py-1.5 text-[12.5px] text-[#9AA2AF]">
              {funil.nome}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-[#9AA2AF]">
          <span>
            Todos os negócios: <b className="tabular-nums text-[#F4F5F7]">{cards.length}</b>
          </span>
          <span>
            Em negociação <b className="ml-1 tabular-nums text-[#F4F5F7]">{brl(total)}</b>
          </span>
          <span>
            Previsão ponderada do mês{" "}
            <b className="ml-1 tabular-nums text-[#34C46A]">{brl(Math.round(ponderada))}</b>
          </span>
        </div>
      </div>

      <NegociosQuadro
        fases={funil.fases.map((f) => ({ id: f.id, nome: f.nome }))}
        cards={cards}
        funilId={funil.id}
        mover={mover}
        criar={acaoCriarNegocio}
        fechar={fechar}
      />
    </div>
  );
}
