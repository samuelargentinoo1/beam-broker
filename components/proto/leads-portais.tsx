"use client";

import { useState } from "react";
import { ANUNCIOS_DOENTES, COR_PORTAL, LEADS_PORTAIS, ROI_PORTAIS } from "@/lib/proto/aquisicao";
import { CONTATOS } from "@/lib/proto/contatos";
import { brl } from "@/lib/proto/base";
import { Bloco, Botao, Inicial, Modal, Score, TopoTela } from "./ui";

const seg = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}min` : `${(s / 3600).toFixed(1)}h`);

export default function LeadsPortais() {
  const [portal, setPortal] = useState<string | null>(null);
  const [argumento, setArgumento] = useState<(typeof ANUNCIOS_DOENTES)[number] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const lista = portal ? LEADS_PORTAIS.filter((l) => l.portal === portal) : LEADS_PORTAIS;
  const abaixoDeUmMinuto = LEADS_PORTAIS.filter((l) => l.segundosAteResposta < 60).length;
  const melhor = [...ROI_PORTAIS].sort((a, b) => a.custoVenda - b.custoVenda)[0]!;
  const pior = [...ROI_PORTAIS].sort((a, b) => b.custoVenda - a.custoVenda)[0]!;

  return (
    <div className="space-y-4 pb-12">
      <TopoTela
        titulo="Leads de portais"
        legenda={`${LEADS_PORTAIS.length} leads no período · ${abaixoDeUmMinuto} respondidos em menos de 1 minuto`}
      />

      {aviso && (
        <div className="rounded-[12px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.08)] px-3.5 py-2 text-[12.5px] text-[#34C46A]">
          {aviso}
        </div>
      )}

      {/* ── ROI: a parte que importa ── */}
      <Bloco
        titulo="Retorno por portal"
        acao={<span className="text-[11.5px] text-[#7A828F]">últimos 3 meses</span>}
        densa
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[#1E222B] text-left text-[10.5px] uppercase tracking-wider text-[#7A828F]">
                <th className="px-4 py-2 font-medium">Portal</th>
                <th className="px-3 py-2 text-right font-medium">Custo/mês</th>
                <th className="px-3 py-2 text-right font-medium">Leads</th>
                <th className="px-3 py-2 text-right font-medium">Qualificados</th>
                <th className="px-3 py-2 text-right font-medium">Visitas</th>
                <th className="px-3 py-2 text-right font-medium">Vendas</th>
                <th className="px-4 py-2 text-right font-medium">Custo/venda</th>
              </tr>
            </thead>
            <tbody>
              {[...ROI_PORTAIS]
                .sort((a, b) => a.custoVenda - b.custoVenda)
                .map((p) => {
                  const ruim = p.portal === pior.portal;
                  const bom = p.portal === melhor.portal;
                  const cp = COR_PORTAL[p.portal]!;
                  return (
                    <tr
                      key={p.portal}
                      className="border-b border-[#1A1E26] last:border-0"
                      style={{ background: ruim ? "rgba(255,92,122,.04)" : undefined }}
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span
                            className="grid h-6 w-9 place-items-center rounded text-[9.5px] font-bold"
                            style={{ background: cp.fundo, color: cp.cor }}
                          >
                            {cp.sigla}
                          </span>
                          <span className="text-[#F4F5F7]">{p.portal}</span>
                          {ruim && (
                            <span className="rounded bg-[rgba(255,92,122,.1)] px-1.5 py-px text-[10px] text-[#FF5C7A]">
                              pior retorno
                            </span>
                          )}
                          {bom && (
                            <span className="rounded bg-[rgba(52,196,106,.1)] px-1.5 py-px text-[10px] text-[#34C46A]">
                              melhor retorno
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#9AA2AF]">
                        {brl(p.custoMes)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#9AA2AF]">{p.leads}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#9AA2AF]">
                        {p.qualificados}
                        <span className="ml-1 text-[10.5px] text-[#7A828F]">
                          {Math.round((p.qualificados / p.leads) * 100)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#9AA2AF]">{p.visitas}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#F4F5F7]">{p.vendas}</td>
                      <td
                        className="px-4 py-2.5 text-right font-semibold tabular-nums"
                        style={{ color: ruim ? "#FF5C7A" : bom ? "#34C46A" : "#C9CFD8" }}
                      >
                        {brl(p.custoVenda)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <p className="m-0 border-t border-[#1E222B] px-4 py-2.5 text-[12px] leading-relaxed text-[#9AA2AF]">
          O <b className="text-[#FF5C7A]">{pior.portal}</b> custa {brl(pior.custoMes)}/mês e sai a{" "}
          <b className="text-[#FF5C7A]">{brl(pior.custoVenda)} por venda</b> — {" "}
          {Math.round(pior.custoVenda / melhor.custoVenda)}× o custo do {melhor.portal}. Só 18% dos
          leads dele chegam a qualificado. Renovar esse contrato é a decisão mais cara do ano.
        </p>
      </Bloco>

      {/* ── Anúncios doentes ── */}
      <div className="grid gap-3 md:grid-cols-2">
        {ANUNCIOS_DOENTES.map((a) => (
          <div
            key={a.codigo}
            className="rounded-[16px] border p-3.5"
            style={{
              borderColor: a.tom === "vermelho" ? "rgba(255,92,122,.3)" : "rgba(245,178,61,.3)",
              background: a.tom === "vermelho" ? "rgba(255,92,122,.04)" : "rgba(245,178,61,.04)",
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="m-0 text-[13px] font-semibold text-[#F4F5F7]">{a.imovel}</p>
              <span className="text-[11px] tabular-nums text-[#7A828F]">{a.codigo}</span>
            </div>
            <p
              className="m-0 mt-1 text-[12.5px] font-medium"
              style={{ color: a.tom === "vermelho" ? "#FF5C7A" : "#F5B23D" }}
            >
              {a.sintoma}
            </p>
            <p className="m-0 mt-1 text-[12px] leading-relaxed text-[#9AA2AF]">{a.diagnostico}</p>
            <div className="mt-2.5">
              <Botao pequeno onClick={() => setArgumento(a)}>
                {a.acao}
              </Botao>
            </div>
          </div>
        ))}
      </div>

      {/* ── Fila de leads ── */}
      <Bloco
        titulo="Leads chegando"
        acao={
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(COR_PORTAL).map((k) => (
              <button
                key={k}
                onClick={() => setPortal((x) => (x === k ? null : k))}
                className="rounded-md border px-2 py-[3px] text-[11.5px] transition-colors"
                style={
                  portal === k
                    ? { borderColor: "#34C46A", background: "rgba(52,196,106,.08)", color: "#8CF0B0" }
                    : { borderColor: "#2A303B", color: "#9AA2AF" }
                }
              >
                {k}
              </button>
            ))}
          </div>
        }
        densa
      >
        <div className="divide-y divide-[#1A1E26]">
          {lista.map((l) => {
            const c = CONTATOS.find((x) => x.id === l.contatoId)!;
            const cp = COR_PORTAL[l.portal]!;
            const rapido = l.segundosAteResposta < 60;
            return (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className="grid h-7 w-10 shrink-0 place-items-center rounded text-[10px] font-bold"
                  style={{ background: cp.fundo, color: cp.cor }}
                >
                  {cp.sigla}
                </span>
                <Inicial c={c} tam={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[12.5px] font-medium text-[#F4F5F7]">{c.nome}</span>
                    <Score c={c} compacto />
                    <span className="text-[11px] text-[#7A828F]">
                      pelo anúncio {l.imovelCodigo} · {l.chegouHa}
                    </span>
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-md border px-2 py-[3px] text-[11.5px] tabular-nums"
                  style={
                    rapido
                      ? { borderColor: "rgba(52,196,106,.35)", background: "rgba(52,196,106,.08)", color: "#34C46A" }
                      : { borderColor: "#2A303B", color: "#7A828F" }
                  }
                  title={rapido ? "Respondido pela IA em menos de 1 minuto" : "Respondido pelo corretor"}
                >
                  {l.respondidoPor === "ia" ? "🤖 " : ""}
                  {seg(l.segundosAteResposta)}
                </span>
              </div>
            );
          })}
        </div>
      </Bloco>

      <Modal
        aberto={!!argumento}
        titulo="Argumento para o proprietário"
        onFechar={() => setArgumento(null)}
        largura={520}
      >
        {argumento && (
          <div>
            <div className="rounded-[16px] border border-[#1E222B] bg-[#07080B] p-3.5 text-[12.5px] leading-relaxed text-[#9AA2AF]">
              <p className="m-0">Olá! Aqui é a Horizonte Imóveis 🙂</p>
              <p className="m-0 mt-2">
                Passando o retrato do seu <b className="text-[#F4F5F7]">{argumento.imovel}</b> nos
                últimos 30 dias: <b className="text-[#F4F5F7]">{argumento.sintoma}</b>.
              </p>
              <p className="m-0 mt-2">{argumento.diagnostico}.</p>
              <p className="m-0 mt-2">
                Nossa recomendação: <b className="text-[#F4F5F7]">{argumento.acao.toLowerCase()}</b>.
                Podemos conversar hoje?
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Botao variante="fantasma" onClick={() => setArgumento(null)}>
                Cancelar
              </Botao>
              <Botao
                variante="primario"
                onClick={() => {
                  setAviso(`Argumento do ${argumento.imovel} enviado ao proprietário.`);
                  setArgumento(null);
                  setTimeout(() => setAviso(null), 3000);
                }}
              >
                Enviar pelo WhatsApp
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
