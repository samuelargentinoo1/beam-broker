"use client";

import { useMemo, useState } from "react";
import { CONTATOS, compativeis } from "@/lib/proto/contatos";
import { PCT_SAFRA_ANTIGA, SAFRA, SEGMENTOS } from "@/lib/proto/aquisicao";
import { brl, mil } from "@/lib/proto/base";
import type { Contato } from "@/lib/proto/tipos";
import { Bloco, Botao, Inicial, Modal, Score, TopoTela } from "./ui";

// Linha do tempo do contato — reconstruída dos campos, para nunca divergir deles.
function historico(c: Contato) {
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul"];
  const mes = (d: number) => meses[Math.max(0, 6 - Math.floor(d / 30))] ?? "jan";
  const linhas = [
    { quando: mes(c.criadoDiasAtras), texto: `Chegou pelo ${c.origem}`, tom: "#8CF0B0" },
    { quando: mes(c.criadoDiasAtras), texto: "A IA qualificou perfil, faixa de valor e região", tom: "#B98CFF" },
  ];
  if (c.enviadas > 6)
    linhas.push({ quando: mes(Math.max(0, c.criadoDiasAtras - 20)), texto: `Trocou ${c.enviadas} mensagens (${c.respondidas} respondidas)`, tom: "#9AA2AF" });
  if (["Visita", "Proposta", "Fechado"].includes(c.estagio))
    linhas.push({ quando: mes(Math.max(0, c.criadoDiasAtras - 35)), texto: "Visitou imóvel da carteira", tom: "#34C46A" });
  if (c.ultimaInteracaoDiasAtras > 14)
    linhas.push({ quando: mes(Math.max(0, c.criadoDiasAtras - 50)), texto: `Sumiu — ${c.ultimaInteracaoDiasAtras} dias sem responder`, tom: "#FF5C7A" });
  if (c.estagio === "Proposta")
    linhas.push({ quando: "jul", texto: "Proposta enviada, aguardando retorno", tom: "#8CF0B0" });
  return linhas;
}

export default function Contatos() {
  const [busca, setBusca] = useState("");
  const [segmento, setSegmento] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Contato | null>(null);
  const [reativar, setReativar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const lista = useMemo(() => {
    let base = CONTATOS;
    const seg = SEGMENTOS.find((s) => s.id === segmento);
    if (seg) base = base.filter(seg.filtro);
    const q = busca.trim().toLowerCase();
    if (q)
      base = base.filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          c.telefone.includes(q) ||
          c.bairrosDesejados.some((b) => b.toLowerCase().includes(q))
      );
    return base;
  }, [busca, segmento]);

  const maxSafra = Math.max(...SAFRA.map((s) => s.pctVendas));

  return (
    <div className="pb-12">
      <TopoTela titulo="Contatos" legenda={`${CONTATOS.length} pessoas na base`} />

      {aviso && (
        <div className="mb-3 rounded-[12px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.08)] px-3.5 py-2 text-[12.5px] text-[#34C46A]">
          {aviso}
        </div>
      )}

      {/* ── Safra: o número que justifica nunca descartar contato ── */}
      <section className="mb-4 rounded-[18px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.05)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[13px] font-semibold text-[#F4F5F7]">Safra de leads</p>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-[#9AA2AF]">
              <b className="text-[20px] align-middle text-[#8CF0B0] tabular-nums">
                {PCT_SAFRA_ANTIGA}%
              </b>{" "}
              das vendas deste mês vieram de leads gerados há{" "}
              <b className="text-[#F4F5F7]">mais de 6 meses</b>. É por isso que descartar base é jogar
              venda fora — o lead não morre, ele hiberna.
            </p>
          </div>
          <div className="flex min-w-[300px] flex-1 items-end gap-2">
            {SAFRA.map((s) => (
              <div key={s.faixa} className="flex-1 text-center">
                <div className="flex h-[70px] items-end justify-center">
                  <div
                    className="w-full rounded-t-[6px]"
                    style={{
                      height: `${(s.pctVendas / maxSafra) * 100}%`,
                      background:
                        s.faixa.startsWith("6") || s.faixa.startsWith("+")
                          ? "#34C46A"
                          : "rgba(52,196,106,.28)",
                    }}
                  />
                </div>
                <p className="m-0 mt-1 text-[11px] font-medium tabular-nums text-[#F4F5F7]">
                  {s.pctVendas}%
                </p>
                <p className="m-0 text-[10px] leading-tight text-[#7A828F]">{s.faixa}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* ── Segmentos salvos ── */}
        <aside className="space-y-3">
          <Bloco titulo="Segmentos salvos" densa>
            <div className="p-2">
              {SEGMENTOS.map((s) => {
                const qtd = CONTATOS.filter(s.filtro).length;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSegmento((x) => (x === s.id ? null : s.id))}
                    className="mb-1 flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left text-[12px] transition-colors"
                    style={
                      segmento === s.id
                        ? { background: "rgba(52,196,106,.08)", color: "#8CF0B0" }
                        : { color: "#9AA2AF" }
                    }
                  >
                    <span className="leading-snug">{s.nome}</span>
                    <span className="shrink-0 tabular-nums text-[11px] opacity-70">{qtd}</span>
                  </button>
                );
              })}
            </div>
          </Bloco>

          {segmento && (
            <Botao variante="primario" onClick={() => setReativar(segmento)}>
              Reativar este segmento
            </Botao>
          )}
        </aside>

        {/* ── Lista ── */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou bairro…"
              className="input-ds max-w-[340px]"
            />
            <span className="text-[12px] text-[#7A828F]">
              {lista.length} {lista.length === 1 ? "contato" : "contatos"}
              {segmento && ` · ${SEGMENTOS.find((s) => s.id === segmento)!.nome}`}
            </span>
            {(segmento || busca) && (
              <Botao
                pequeno
                variante="fantasma"
                onClick={() => {
                  setSegmento(null);
                  setBusca("");
                }}
              >
                limpar
              </Botao>
            )}
          </div>

          <div className="overflow-hidden rounded-[18px] border border-[#1E222B] bg-[#12141A]">
            <div className="max-h-[560px] overflow-y-auto divide-y divide-[#1A1E26]">
              {/* A linha NÃO pode ser <button>: o Score dentro dela também é um
                  botão, e botão aninhado é HTML inválido (quebra a hidratação). */}
              {lista.slice(0, 60).map((c) => (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setAberto(c)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setAberto(c)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#07080B]"
                >
                  <Inicial c={c} tam={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[12.5px] font-medium text-[#F4F5F7]">{c.nome}</span>
                      <Score c={c} compacto />
                      <span className="text-[11px] text-[#7A828F]">{c.origem}</span>
                    </div>
                    <p className="m-0 mt-0.5 truncate text-[11.5px] text-[#7A828F]">{c.resumo}</p>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-[#7A828F]">
                    {c.ultimaInteracaoDiasAtras}d
                  </span>
                </div>
              ))}
              {lista.length === 0 && (
                <p className="m-0 px-4 py-10 text-center text-[12.5px] text-[#7A828F]">
                  Nenhum contato com esses critérios.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Ficha ── */}
      <Modal
        aberto={!!aberto}
        titulo={aberto?.nome ?? ""}
        onFechar={() => setAberto(null)}
        largura={620}
      >
        {aberto && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-2.5">
                <Inicial c={aberto} tam={42} />
                <div>
                  <Score c={aberto} />
                  <p className="m-0 mt-1 text-[11.5px] tabular-nums text-[#7A828F]">
                    {aberto.telefone}
                  </p>
                </div>
              </div>

              <p className="label-caps mb-1 mt-4 block !text-[9px] tracking-[.12em] text-[#7A828F]">
                perfil
              </p>
              <L k="Composição" v={aberto.perfilFamiliar} />
              <L k="Busca" v={aberto.finalidade === "VENDA" ? "Compra" : "Locação"} />
              <L k="Região" v={aberto.bairrosDesejados.join(", ") || "não definida"} />
              <L k="Urgência" v={aberto.urgenciaMeses ? `${aberto.urgenciaMeses} meses` : "sem prazo"} />

              <p className="label-caps mb-1 mt-3 block !text-[9px] tracking-[.12em] text-[#7A828F]">
                financeiro
              </p>
              <L k="Renda" v={aberto.renda ? brl(aberto.renda) : "não informada"} />
              <L k="FGTS" v={aberto.fgts ? brl(aberto.fgts) : "—"} />
              <L k="Teto" v={aberto.tetoValor ? brl(aberto.tetoValor) : "—"} />

              <p className="label-caps mb-1 mt-3 block !text-[9px] tracking-[.12em] text-[#7A828F]">
                imóveis compatíveis
              </p>
              {compativeis(aberto).slice(0, 3).map((im) => (
                <p key={im!.id} className="m-0 text-[11.5px] text-[#9AA2AF]">
                  • {im!.tipo} {im!.quartos}q · {im!.bairro} ·{" "}
                  {im!.finalidade === "VENDA" ? mil(im!.preco) : `${brl(im!.preco)}/mês`}
                </p>
              ))}
            </div>

            <div>
              <p className="label-caps mb-2 block !text-[9px] tracking-[.12em] text-[#7A828F]">
                linha do tempo
              </p>
              <ol className="m-0 list-none p-0">
                {historico(aberto).map((h, i, arr) => (
                  <li key={i} className="flex gap-2.5">
                    <div className="flex flex-col items-center">
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: h.tom }}
                      />
                      {i < arr.length - 1 && <span className="w-px flex-1 bg-[#1E222B]" />}
                    </div>
                    <div className="pb-2.5">
                      <span className="text-[10.5px] uppercase tracking-wider text-[#7A828F]">
                        {h.quando}
                      </span>
                      <p className="m-0 text-[12px] leading-snug text-[#C9CFD8]">{h.texto}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Reativação de base ── */}
      <Modal
        aberto={!!reativar}
        titulo="Reativação de base"
        onFechar={() => setReativar(null)}
        largura={560}
      >
        {reativar &&
          (() => {
            const seg = SEGMENTOS.find((s) => s.id === reativar)!;
            const alvos = CONTATOS.filter(seg.filtro);
            return (
              <div>
                <p className="m-0 text-[12.5px] text-[#9AA2AF]">
                  Segmento <b className="text-[#F4F5F7]">{seg.nome}</b> — {alvos.length} pessoas. A IA
                  personaliza cada mensagem com o que já sabe do contato:
                </p>

                <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto">
                  {alvos.slice(0, 4).map((c) => {
                    const im = compativeis(c)[0];
                    return (
                      <div
                        key={c.id}
                        className="rounded-[14px] border border-[#1E222B] bg-[#07080B] p-3 text-[12px] leading-relaxed text-[#9AA2AF]"
                      >
                        <p className="m-0 mb-1 text-[11.5px] font-medium text-[#F4F5F7]">{c.nome}</p>
                        <p className="m-0">
                          Oi, {c.nome.split(" ")[0]}! Aqui é a Carol, da Horizonte 🙂 Faz um tempo que
                          a gente não conversa
                          {c.bairrosDesejados[0] ? ` sobre o ${c.bairrosDesejados[0]}` : ""}.
                          {im
                            ? ` Entrou um ${im.tipo.toLowerCase()} de ${im.quartos} quartos por ${
                                im.finalidade === "VENDA" ? mil(im.preco) : `${brl(im.preco)}/mês`
                              } que bate com o que você procurava. Quer ver?`
                            : " Apareceu coisa nova na sua faixa. Quer que eu te mande?"}
                        </p>
                      </div>
                    );
                  })}
                  {alvos.length > 4 && (
                    <p className="m-0 text-center text-[11.5px] text-[#7A828F]">
                      + {alvos.length - 4} mensagens personalizadas
                    </p>
                  )}
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Botao variante="fantasma" onClick={() => setReativar(null)}>
                    Cancelar
                  </Botao>
                  <Botao
                    variante="primario"
                    onClick={() => {
                      setReativar(null);
                      setAviso(`${alvos.length} mensagens de reativação na fila da IA.`);
                      setTimeout(() => setAviso(null), 3200);
                    }}
                  >
                    Disparar para {alvos.length} contatos
                  </Botao>
                </div>
              </div>
            );
          })()}
      </Modal>
    </div>
  );
}

function L({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[2px] text-[11.5px]">
      <span className="text-[#7A828F]">{k}</span>
      <span className="text-right tabular-nums text-[#C9CFD8]">{v}</span>
    </div>
  );
}
