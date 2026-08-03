"use client";

import { CRIATIVOS, JORNADA, JORNADA_RESUMO, RECOMENDACAO_VERBA, cpl, custoVenda } from "@/lib/proto/aquisicao";
import { brl } from "@/lib/proto/base";
import { Bloco, TopoTela } from "./ui";

const CANAL: Record<string, { fundo: string; cor: string }> = {
  Meta: { fundo: "rgba(52,196,106,.1)", cor: "#8CF0B0" },
  Google: { fundo: "rgba(245,178,61,.1)", cor: "#F5B23D" },
  TikTok: { fundo: "rgba(185,140,255,.1)", cor: "#B98CFF" },
  Instagram: { fundo: "rgba(236,72,153,.1)", cor: "#FF7AB8" },
  Site: { fundo: "rgba(52,196,106,.1)", cor: "#34C46A" },
  WhatsApp: { fundo: "rgba(52,196,106,.1)", cor: "#34C46A" },
  Visita: { fundo: "rgba(52,196,106,.1)", cor: "#8CF0B0" },
  Fechamento: { fundo: "rgba(52,196,106,.14)", cor: "#34C46A" },
};

export default function MetricasMarketing() {
  // Ordenado por QUALIDADE do lead, não por volume: é a inversão que a tela defende.
  const ordenados = [...CRIATIVOS].sort((a, b) => b.scoreMedio - a.scoreMedio);
  const maisBarato = [...CRIATIVOS].sort((a, b) => cpl(a) - cpl(b))[0]!;
  const melhorScore = ordenados[0]!;
  const verbaTotal = CRIATIVOS.reduce((s, c) => s + c.verba, 0);

  return (
    <div className="space-y-4 pb-12">
      <TopoTela
        titulo="Métricas de marketing"
        legenda={`${brl(verbaTotal)} investidos · ordenado por qualidade do lead, não por volume`}
      />

      <Bloco titulo="Criativos" densa>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[#1E222B] text-left text-[10.5px] uppercase tracking-wider text-[#7A828F]">
                <th className="px-4 py-2 font-medium">Criativo</th>
                <th className="px-3 py-2 text-right font-medium">Verba</th>
                <th className="px-3 py-2 text-right font-medium">Leads</th>
                <th className="px-3 py-2 text-right font-medium">CPL</th>
                <th className="px-3 py-2 text-right font-medium">Score médio</th>
                <th className="px-3 py-2 text-right font-medium">Vendas</th>
                <th className="px-4 py-2 text-right font-medium">Custo/venda</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((c) => {
                const cv = custoVenda(c);
                const ruim = c.id === maisBarato.id;
                const bom = c.id === melhorScore.id;
                const ca = CANAL[c.canal]!;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-[#1A1E26] last:border-0"
                    style={{ background: ruim ? "rgba(255,92,122,.04)" : undefined }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-8 w-11 shrink-0 rounded-[6px]"
                          style={{ background: c.cor }}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="m-0 text-[12.5px] text-[#F4F5F7]">{c.nome}</p>
                          <span
                            className="mt-0.5 inline-block rounded px-1.5 py-px text-[10px]"
                            style={{ background: ca.fundo, color: ca.cor }}
                          >
                            {c.canal}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#9AA2AF]">{brl(c.verba)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#9AA2AF]">{c.leads}</td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums"
                      style={{ color: ruim ? "#FF5C7A" : "#9AA2AF", fontWeight: ruim ? 600 : 400 }}
                    >
                      {brl(cpl(c))}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className="rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium tabular-nums"
                        style={
                          c.scoreMedio >= 65
                            ? { borderColor: "rgba(52,196,106,.3)", background: "rgba(52,196,106,.08)", color: "#34C46A" }
                            : c.scoreMedio >= 45
                              ? { borderColor: "rgba(245,178,61,.3)", background: "rgba(245,178,61,.08)", color: "#F5B23D" }
                              : { borderColor: "rgba(255,92,122,.3)", background: "rgba(255,92,122,.07)", color: "#FF5C7A" }
                        }
                      >
                        {c.scoreMedio}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums"
                      style={{ color: c.vendas === 0 ? "#FF5C7A" : "#F4F5F7", fontWeight: bom ? 600 : 400 }}
                    >
                      {c.vendas}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#C9CFD8]">
                      {cv ? brl(cv) : <span className="text-[#FF5C7A]">— sem venda</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 border-t border-[#1E222B] px-4 py-2.5 text-[12px] leading-relaxed text-[#9AA2AF]">
          O criativo de <b className="text-[#FF5C7A]">CPL mais barato ({brl(cpl(maisBarato))})</b> trouxe{" "}
          {maisBarato.leads} leads com score médio {maisBarato.scoreMedio} e{" "}
          <b className="text-[#FF5C7A]">nenhuma venda</b>. O de{" "}
          <b className="text-[#34C46A]">CPL {brl(cpl(melhorScore))}</b> trouxe {melhorScore.leads} leads
          com score {melhorScore.scoreMedio} e {melhorScore.vendas} vendas. Otimizar por CPL é comprar
          volume que não fecha.
        </p>
      </Bloco>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Bloco titulo="Jornada reconstruída de um lead">
          <p className="m-0 mb-3 text-[12px] text-[#9AA2AF]">
            <b className="text-[#F4F5F7]">{JORNADA_RESUMO.contato}</b> — o último clique foi
            &ldquo;Google&rdquo;, mas a compra começou no Instagram 23 dias antes.
          </p>
          <ol className="m-0 list-none space-y-0 p-0">
            {JORNADA.map((j, i) => {
              const ca = CANAL[j.canal] ?? CANAL.Site!;
              return (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: ca.cor }}
                    />
                    {i < JORNADA.length - 1 && <span className="w-px flex-1 bg-[#1E222B]" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className="rounded px-1.5 py-px text-[10.5px]"
                        style={{ background: ca.fundo, color: ca.cor }}
                      >
                        {j.canal}
                      </span>
                      <span className="text-[11px] tabular-nums text-[#7A828F]">{j.quando}</span>
                      {j.custo > 0 && (
                        <span className="text-[11px] tabular-nums text-[#9AA2AF]">{brl(j.custo)}</span>
                      )}
                    </div>
                    <p className="m-0 mt-0.5 text-[12.5px] leading-snug text-[#C9CFD8]">{j.oque}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-1 flex flex-wrap gap-5 border-t border-[#1E222B] pt-3 text-[12.5px]">
            <span className="text-[#9AA2AF]">
              Ciclo <b className="text-[#F4F5F7] tabular-nums">{JORNADA_RESUMO.dias} dias</b>
            </span>
            <span className="text-[#9AA2AF]">
              Custo total <b className="text-[#F4F5F7] tabular-nums">{brl(JORNADA_RESUMO.custo)}</b>
            </span>
            <span className="text-[#9AA2AF]">
              Comissão <b className="text-[#34C46A] tabular-nums">{brl(JORNADA_RESUMO.comissao)}</b>
            </span>
            <span className="text-[#9AA2AF]">
              Retorno{" "}
              <b className="text-[#34C46A] tabular-nums">
                {Math.round(JORNADA_RESUMO.comissao / JORNADA_RESUMO.custo)}×
              </b>
            </span>
          </div>
        </Bloco>

        <div className="rounded-[18px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.05)] p-4">
          <p className="m-0 text-[13px] font-semibold text-[#F4F5F7]">
            Se você tivesse mais {brl(RECOMENDACAO_VERBA.valor)} este mês, colocaria em…
          </p>
          <p className="m-0 mt-2 text-[14px] font-semibold text-[#8CF0B0]">
            {RECOMENDACAO_VERBA.onde}
          </p>
          <p className="m-0 mt-2 text-[12px] leading-relaxed text-[#9AA2AF]">
            {RECOMENDACAO_VERBA.motivo}
          </p>
          <p className="m-0 mt-3 rounded-[12px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.08)] px-3 py-2 text-[12px] font-medium text-[#34C46A]">
            Estimativa: {RECOMENDACAO_VERBA.estimativa}
          </p>
        </div>
      </div>
    </div>
  );
}
