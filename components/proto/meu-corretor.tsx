"use client";

import { useState } from "react";
import { IMOVEIS, brl, mil } from "@/lib/proto/base";
import { Bloco, TopoTela } from "./ui";

type Msg = { autor: "cliente" | "ia"; texto: string; hora: string; imoveis?: string[] };

const CONVERSAS: Record<"a" | "b", { titulo: string; legenda: string; msgs: Msg[] }> = {
  a: {
    titulo: "Busca comum",
    legenda: "o cliente diz o que quer, a IA responde com opções",
    msgs: [
      { autor: "cliente", texto: "quero um apê de 2 quartos perto do Bosque, até 2500 de aluguel, aceita pet", hora: "09:12" },
      { autor: "ia", texto: "Oi! Sou a Carol, da Horizonte 🙂 Achei 3 opções que batem certinho — todas aceitam pet:", hora: "09:12" },
      { autor: "ia", texto: "", hora: "09:12", imoveis: ["AP-0212", "AP-0219", "AP-0163"] },
      { autor: "ia", texto: "Quer que eu agende uma visita em alguma delas?", hora: "09:12" },
      { autor: "cliente", texto: "a primeira parece boa, sábado de manhã dá?", hora: "09:18" },
      { autor: "ia", texto: "Dá sim! Sábado às 10h com a Ana Julia. Confirmo? 👍", hora: "09:18" },
    ],
  },
  b: {
    // A conta invertida: o cliente diz a PARCELA, não o preço do imóvel.
    titulo: "Busca pela parcela",
    legenda: "o cliente diz quanto cabe no bolso — a IA inverte a conta",
    msgs: [
      { autor: "cliente", texto: "quero um apartamento onde a parcela caiba em 2500 por mês", hora: "14:02" },
      { autor: "ia", texto: "Boa forma de começar 🙂 Fiz a conta ao contrário pra você:", hora: "14:02" },
      {
        autor: "ia",
        texto:
          "Com R$ 2.500 de parcela em 30 anos, você consegue financiar cerca de R$ 310 mil.\nCom uma entrada de R$ 60 mil, dá pra buscar até R$ 370 mil.",
        hora: "14:02",
      },
      { autor: "ia", texto: "Separei 4 opções nessa faixa:", hora: "14:03", imoveis: ["ST-0090", "AP-0302", "AP-0163", "AP-0219"] },
      { autor: "cliente", texto: "nossa, ninguém tinha me explicado assim. tenho uns 60 mil de entrada mesmo", hora: "14:09" },
      { autor: "ia", texto: "Então a faixa de R$ 370 mil está valendo 👌 Quer que eu já veja a aprovação do crédito com um banco parceiro?", hora: "14:09" },
    ],
  },
};

export default function MeuCorretor() {
  const [qual, setQual] = useState<"a" | "b">("b");
  const c = CONVERSAS[qual];

  return (
    <div className="pb-12">
      <TopoTela
        titulo="Meu Corretor"
        legenda="o canal do cliente final — e o lead nascendo dele"
        direita={
          <div className="flex gap-1.5">
            {(["a", "b"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setQual(k)}
                className={`rounded-[10px] border px-3 py-1.5 text-[12.5px] transition-colors ${
                  qual === k
                    ? "border-[#34C46A] bg-[rgba(52,196,106,.08)] font-medium text-[#8CF0B0]"
                    : "border-[#2A303B] bg-[#12141A] text-[#9AA2AF] hover:border-[#34C46A]"
                }`}
              >
                {CONVERSAS[k].titulo}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ── Celular mockado ── */}
        <div className="mx-auto w-full max-w-[380px]">
          <div className="rounded-[38px] border-[10px] border-[#1A1E26] bg-[#1A1E26] shadow-[0_20px_50px_-20px_rgba(0,0,0,.5)]">
            <div data-mock-claro className="overflow-hidden rounded-[28px] bg-[#E9EDF2]">
              {/* topo do zap */}
              <div className="flex items-center gap-2.5 bg-[#075E54] px-3.5 py-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#12141A]/20 text-[13px] font-semibold text-white">
                  H
                </span>
                <div className="min-w-0">
                  <p className="m-0 text-[12.5px] font-medium text-white">Horizonte Imóveis</p>
                  <p className="m-0 text-[10.5px] text-white/70">on-line</p>
                </div>
              </div>

              <div className="max-h-[520px] space-y-2 overflow-y-auto px-3 py-3">
                {c.msgs.map((m, i) => (
                  <div key={i} className={`flex ${m.autor === "cliente" ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[85%] rounded-[12px] px-2.5 py-1.5 text-[12px] leading-relaxed shadow-sm"
                      style={{
                        background: m.autor === "cliente" ? "#DCF8C6" : "#fff",
                        color: "#F4F5F7",
                      }}
                    >
                      {m.texto && <p className="m-0 whitespace-pre-line">{m.texto}</p>}

                      {m.imoveis && (
                        <div className="mt-1 space-y-1.5">
                          {m.imoveis.map((cod) => {
                            const im = IMOVEIS.find((x) => x.codigo === cod);
                            if (!im) return null;
                            return (
                              <div
                                key={cod}
                                className="flex items-center gap-2 rounded-[9px] border border-[#1E222B] bg-[#07080B] p-1.5"
                              >
                                <span
                                  className="h-10 w-14 shrink-0 rounded-[6px]"
                                  style={{ background: im.cor }}
                                />
                                <div className="min-w-0">
                                  <p className="m-0 truncate text-[11px] font-medium text-[#F4F5F7]">
                                    {im.tipo} {im.quartos}q · {im.bairro}
                                  </p>
                                  <p className="m-0 text-[11px] font-semibold tabular-nums text-[#34C46A]">
                                    {im.finalidade === "VENDA" ? mil(im.preco) : `${brl(im.preco)}/mês`}
                                  </p>
                                  <p className="m-0 text-[10px] text-[#7A828F]">
                                    {im.area}m² · {im.vagas} vaga{im.vagas === 1 ? "" : "s"}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <span className="mt-0.5 block text-right text-[9.5px] tabular-nums text-[#7A828F]">
                        {m.hora}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 border-t border-[#D7DDE4] bg-[#12141A] px-3 py-2">
                <div className="flex-1 rounded-full bg-[#F0F2F5] px-3 py-1.5 text-[11.5px] text-[#7A828F]">
                  Mensagem
                </div>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#075E54] text-[12px] text-white">
                  ➤
                </span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-[11.5px] text-[#7A828F]">{c.legenda}</p>
        </div>

        {/* ── Painel interno ── */}
        <div className="space-y-4">
          {qual === "b" && (
            <Bloco titulo="A conta que a IA fez">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Parcela informada", "R$ 2.500", "#F4F5F7"],
                  ["Prazo", "360 meses", "#9AA2AF"],
                  ["Financiamento possível", "R$ 310 mil", "#8CF0B0"],
                  ["Com entrada de R$ 60k", "R$ 370 mil", "#34C46A"],
                ].map(([r, v, cor]) => (
                  <div key={r} className="rounded-[12px] border border-[#1E222B] bg-[#07080B] p-3">
                    <p className="m-0 text-[10.5px] leading-tight text-[#7A828F]">{r}</p>
                    <p
                      className="m-0 mt-1 text-[15px] font-semibold tabular-nums"
                      style={{ color: cor }}
                    >
                      {v}
                    </p>
                  </div>
                ))}
              </div>
              <p className="m-0 mt-3 text-[12px] leading-relaxed text-[#9AA2AF]">
                Nenhum portal do Brasil faz esta inversão. Todos pedem o <b>preço do imóvel</b>; o
                cliente só sabe <b className="text-[#F4F5F7]">quanto cabe no bolso dele</b>. Quem
                responde nessa moeda qualifica sem parecer que está qualificando.
              </p>
            </Bloco>
          )}

          <Bloco titulo="O lead nascendo desta conversa">
            <div className="space-y-2">
              {[
                ["Origem", "Meu Corretor · WhatsApp"],
                ["Perfil captado", qual === "b" ? "Compra · parcela até R$ 2.500 · entrada R$ 60k" : "Locação · 2 quartos · Bosque · aceita pet · até R$ 2.500"],
                ["Faixa calculada", qual === "b" ? "Até R$ 370 mil" : "Até R$ 2.500/mês"],
                ["Score inicial", qual === "b" ? "71 — informou parcela e entrada" : "64 — informou região, faixa e restrição"],
                ["Região", qual === "b" ? "não informada — a IA vai perguntar" : "Bosque"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-b border-[#1A1E26] pb-1.5 text-[12.5px] last:border-0">
                  <span className="text-[#7A828F]">{k}</span>
                  <span className="text-right text-[#C9CFD8]">{v}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-[14px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.05)] p-3">
              <p className="m-0 text-[12px] font-medium text-[#8CF0B0]">
                → Direcionado para Horizonte Imóveis (região Araraquara centro-oeste)
              </p>
              <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-[#9AA2AF]">
                A busca do cliente final vira lead da imobiliária responsável pela região do imóvel
                de interesse. Se nenhuma cobre a região, entra na fila de expansão.
              </p>
            </div>
          </Bloco>
        </div>
      </div>
    </div>
  );
}
