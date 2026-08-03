"use client";

import { useMemo, useState } from "react";
import { CONTATOS, compativeis } from "@/lib/proto/contatos";
import { IMOVEIS, brl, mil } from "@/lib/proto/base";
import { Bloco, Botao, Inicial, Modal, Score, TopoTela } from "./ui";

type Match = {
  id: string;
  contatoId: string;
  imovelId: string;
  score: number;
  motivos: string[];
  gatilho: "perfil" | "baixa-preco";
  parcela?: number;
};

// A parcela estimada é o que decide se o match é real: cabe no bolso ou não.
const parcelaDe = (preco: number, entrada: number) =>
  Math.round(((preco - entrada) * 0.0091) / 10) * 10;

function montar(): Match[] {
  const alvos = CONTATOS.slice(0, 40).filter((c) => c.renda);
  const ms: Match[] = [];
  for (const c of alvos) {
    const im = compativeis(c)[0];
    if (!im) continue;
    const motivos: string[] = [];
    if (c.tetoValor && im.preco <= c.tetoValor) motivos.push("Bate em orçamento");
    if (c.bairrosDesejados.includes(im.bairro)) motivos.push("região desejada");
    if (c.quartosDesejados && im.quartos >= c.quartosDesejados) motivos.push("nº de quartos");
    if (c.respondidas / Math.max(1, c.enviadas) > 0.6)
      motivos.push(`engajou em ${Math.max(2, Math.round(c.respondidas / 2))} imóveis parecidos`);
    if (motivos.length < 2) continue;

    const parcela = im.finalidade === "VENDA" ? parcelaDe(im.preco, c.entrada ?? 0) : im.preco;
    const cabe = c.renda ? parcela <= c.renda * 0.3 : false;
    ms.push({
      id: `mt${ms.length + 1}`,
      contatoId: c.id,
      imovelId: im.id,
      score: Math.min(98, 55 + motivos.length * 8 + (cabe ? 12 : 0)),
      motivos,
      gatilho: "perfil",
      parcela,
    });
    if (ms.length >= 9) break;
  }

  // Match disparado por BAIXA DE PREÇO — o gatilho que ninguém tem hoje.
  const fernanda = CONTATOS.find((c) => c.nome === "Fernanda Martins");
  const barato = IMOVEIS.find((i) => i.codigo === "AP-0455");
  if (fernanda && barato) {
    ms.unshift({
      id: "mt0",
      contatoId: fernanda.id,
      imovelId: barato.id,
      score: 94,
      motivos: [
        "Imóvel que ela viu em abril baixou 7%",
        "agora cabe no orçamento dela",
        "região e nº de quartos batem",
      ],
      gatilho: "baixa-preco",
      parcela: parcelaDe(barato.preco, fernanda.entrada ?? 0),
    });
  }
  return ms;
}

const MATCHES = montar();

// ── Match reverso: a procura que o estoque não atende. Alimenta a captação. ──
const REVERSO = [
  { bairro: "Jardim São Paulo", perfil: "2 quartos até R$ 2.200", procuras: 47, estoque: 2, tom: "vermelho" },
  { bairro: "Jardim Aclimação", perfil: "3 quartos até R$ 500 mil", procuras: 31, estoque: 3, tom: "vermelho" },
  { bairro: "Bosque", perfil: "2 quartos que aceitem pet", procuras: 24, estoque: 2, tom: "ambar" },
  { bairro: "Centro", perfil: "studio até R$ 280 mil", procuras: 19, estoque: 4, tom: "ambar" },
  { bairro: "Vila Xavier", perfil: "casa 3 quartos com quintal", procuras: 14, estoque: 5, tom: "neutro" },
] as const;

export default function TinderImoveis() {
  const [aba, setAba] = useState<"matches" | "reverso">("matches");
  const [rejeitados, setRejeitados] = useState<string[]>([]);
  const [enviando, setEnviando] = useState<Match | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const fila = useMemo(() => MATCHES.filter((m) => !rejeitados.includes(m.id)), [rejeitados]);

  return (
    <div className="pb-12">
      <TopoTela
        titulo="Tinder Imóveis"
        legenda={`${fila.length} matches pendentes`}
        direita={
          <div className="flex gap-1.5">
            {(["matches", "reverso"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setAba(v)}
                className={`rounded-[10px] border px-3 py-1.5 text-[12.5px] transition-colors ${
                  aba === v
                    ? "border-[#34C46A] bg-[rgba(52,196,106,.08)] font-medium text-[#8CF0B0]"
                    : "border-[#2A303B] bg-[#12141A] text-[#9AA2AF] hover:border-[#34C46A]"
                }`}
              >
                {v === "matches" ? "Matches pendentes" : "Match reverso"}
              </button>
            ))}
          </div>
        }
      />

      {aviso && (
        <div className="mb-3 rounded-[12px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.08)] px-3.5 py-2 text-[12.5px] text-[#34C46A]">
          {aviso}
        </div>
      )}

      {aba === "matches" ? (
        <div className="space-y-2.5">
          {fila.map((m) => {
            const c = CONTATOS.find((x) => x.id === m.contatoId)!;
            const im = IMOVEIS.find((x) => x.id === m.imovelId)!;
            const baixa = m.gatilho === "baixa-preco";
            return (
              <article
                key={m.id}
                className="rounded-[18px] border bg-[#12141A] p-4"
                style={{ borderColor: baixa ? "rgba(52,196,106,.35)" : "#1E222B" }}
              >
                {baixa && (
                  <p className="m-0 mb-2.5 inline-flex items-center gap-1.5 rounded-md border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.08)] px-2 py-0.5 text-[11px] font-medium text-[#34C46A]">
                    ↓ disparado por baixa de preço
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-4">
                  {/* imóvel */}
                  <div className="flex min-w-[220px] flex-1 items-center gap-2.5">
                    <span
                      className="h-14 w-20 shrink-0 rounded-[8px]"
                      style={{ background: im.cor }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="m-0 text-[12.5px] font-medium text-[#F4F5F7]">{im.codigo}</p>
                      <p className="m-0 text-[11.5px] text-[#9AA2AF]">
                        {im.tipo} {im.quartos}q · {im.area}m² · {im.bairro}
                      </p>
                      <p className="m-0 text-[12.5px] font-semibold tabular-nums text-[#F4F5F7]">
                        {im.finalidade === "VENDA" ? mil(im.preco) : `${brl(im.preco)}/mês`}
                      </p>
                    </div>
                  </div>

                  {/* score do match */}
                  <div className="shrink-0 text-center">
                    <div
                      className="grid h-14 w-14 place-items-center rounded-full text-[17px] font-semibold tabular-nums"
                      style={{
                        background: m.score >= 80 ? "rgba(52,196,106,.1)" : "rgba(245,178,61,.1)",
                        color: m.score >= 80 ? "#34C46A" : "#F5B23D",
                      }}
                    >
                      {m.score}
                    </div>
                    <p className="m-0 mt-0.5 text-[10px] text-[#7A828F]">match</p>
                  </div>

                  {/* contato */}
                  <div className="flex min-w-[220px] flex-1 items-center gap-2.5">
                    <Inicial c={c} tam={40} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-medium text-[#F4F5F7]">{c.nome}</span>
                        <Score c={c} compacto />
                      </div>
                      <p className="m-0 truncate text-[11.5px] text-[#7A828F]">{c.resumo}</p>
                    </div>
                  </div>
                </div>

                <p className="m-0 mt-3 text-[12px] leading-relaxed text-[#9AA2AF]">
                  {m.motivos.join(", ")}.
                  {im.finalidade === "VENDA" && c.renda && (
                    <>
                      {" "}
                      Parcela estimada{" "}
                      <b className="text-[#F4F5F7]">{brl(m.parcela ?? 0)}</b> —{" "}
                      {(m.parcela ?? 0) <= c.renda * 0.3 ? (
                        <span className="text-[#34C46A]">cabe na renda declarada</span>
                      ) : (
                        <span className="text-[#F5B23D]">acima de 30% da renda declarada</span>
                      )}
                      .
                    </>
                  )}
                </p>

                <div className="mt-3 flex gap-1.5">
                  <Botao pequeno variante="primario" onClick={() => setEnviando(m)}>
                    Enviar
                  </Botao>
                  <Botao
                    pequeno
                    variante="fantasma"
                    onClick={() => setRejeitados((r) => [...r, m.id])}
                  >
                    Rejeitar
                  </Botao>
                </div>
              </article>
            );
          })}

          {fila.length === 0 && (
            <div className="rounded-[18px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.05)] px-5 py-10 text-center">
              <p className="m-0 text-[15px] font-semibold text-[#34C46A]">Fila de matches zerada</p>
              <div className="mt-4 flex justify-center">
                <Botao onClick={() => setRejeitados([])}>Recarregar matches</Botao>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Bloco
          titulo="Procura sem estoque"
          acao={<span className="text-[11.5px] text-[#7A828F]">últimos 30 dias</span>}
          densa
        >
          <div className="divide-y divide-[#1A1E26]">
            {REVERSO.map((r) => {
              const gap = r.procuras / Math.max(1, r.estoque);
              const tom =
                r.tom === "vermelho" ? "#FF5C7A" : r.tom === "ambar" ? "#F5B23D" : "#9AA2AF";
              return (
                <div key={r.bairro} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-[260px] flex-1">
                    <p className="m-0 text-[12.5px] font-medium text-[#F4F5F7]">
                      {r.bairro} · {r.perfil}
                    </p>
                    <p className="m-0 mt-0.5 text-[11.5px] text-[#9AA2AF]">
                      <b className="tabular-nums" style={{ color: tom }}>
                        {r.procuras} procuras
                      </b>{" "}
                      · você tem <b className="tabular-nums text-[#F4F5F7]">{r.estoque} imóveis</b>
                    </p>
                  </div>
                  <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-[#1A1E26]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, gap * 4)}%`, background: tom }}
                    />
                  </div>
                  <span
                    className="shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium"
                    style={{ borderColor: `${tom}55`, color: tom }}
                  >
                    {gap >= 15 ? "gap crítico" : gap >= 8 ? "gap alto" : "equilibrado"}
                  </span>
                  <Botao
                    pequeno
                    onClick={() => {
                      setAba("matches");
                      setAviso(`Captação priorizada para ${r.bairro} — ${r.perfil}.`);
                      setTimeout(() => setAviso(null), 3200);
                    }}
                  >
                    Priorizar captação
                  </Botao>
                </div>
              );
            })}
          </div>
          <p className="m-0 border-t border-[#1E222B] px-4 py-2.5 text-[12px] leading-relaxed text-[#9AA2AF]">
            Cada linha é demanda que já bateu na porta e você não conseguiu atender. É a lista de
            compras do captador — e a única que nasce do cliente, não do achismo.
          </p>
        </Bloco>
      )}

      <Modal
        aberto={!!enviando}
        titulo="Enviar match pelo WhatsApp"
        onFechar={() => setEnviando(null)}
        largura={520}
      >
        {enviando &&
          (() => {
            const c = CONTATOS.find((x) => x.id === enviando.contatoId)!;
            const im = IMOVEIS.find((x) => x.id === enviando.imovelId)!;
            const baixa = enviando.gatilho === "baixa-preco";
            return (
              <div>
                <div className="mb-3 flex items-center gap-2.5">
                  <Inicial c={c} tam={34} />
                  <div>
                    <p className="m-0 text-[13.5px] font-medium text-[#F4F5F7]">{c.nome}</p>
                    <p className="m-0 text-[11.5px] tabular-nums text-[#7A828F]">{c.telefone}</p>
                  </div>
                </div>

                <div className="rounded-[16px] border border-[#1E222B] bg-[#07080B] p-3.5 text-[12.5px] leading-relaxed text-[#9AA2AF]">
                  <p className="m-0">Oi, {c.nome.split(" ")[0]}! Aqui é a Ana Julia, da Horizonte 🙂</p>
                  {baixa ? (
                    <p className="m-0 mt-2">
                      Lembra do {im.tipo.toLowerCase()} no {im.bairro} que você viu em abril? Ele{" "}
                      <b className="text-[#F4F5F7]">baixou 7%</b> e agora está{" "}
                      <b className="text-[#F4F5F7]">{mil(im.preco)}</b> — entrou na sua faixa.
                    </p>
                  ) : (
                    <p className="m-0 mt-2">
                      Entrou um {im.tipo.toLowerCase()} de {im.quartos} quartos no {im.bairro} por{" "}
                      <b className="text-[#F4F5F7]">
                        {im.finalidade === "VENDA" ? mil(im.preco) : `${brl(im.preco)}/mês`}
                      </b>{" "}
                      que bate com o que você procura.
                    </p>
                  )}
                  {im.finalidade === "VENDA" && (
                    <p className="m-0 mt-2">
                      Com sua entrada, a parcela fica em torno de{" "}
                      <b className="text-[#F4F5F7]">{brl(enviando.parcela ?? 0)}</b>.
                    </p>
                  )}
                  <p className="m-0 mt-2">Quer que eu agende uma visita esta semana?</p>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Botao variante="fantasma" onClick={() => setEnviando(null)}>
                    Cancelar
                  </Botao>
                  <Botao
                    variante="primario"
                    onClick={() => {
                      setRejeitados((r) => [...r, enviando.id]);
                      setEnviando(null);
                      setAviso(`Match enviado para ${c.nome.split(" ")[0]}.`);
                      setTimeout(() => setAviso(null), 3000);
                    }}
                  >
                    Enviar agora
                  </Botao>
                </div>
              </div>
            );
          })()}
      </Modal>
    </div>
  );
}
