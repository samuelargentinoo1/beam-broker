"use client";

import { useMemo, useState } from "react";
import { IMOVEIS, brl, mil } from "@/lib/proto/base";
import { Bloco, Botao, TopoTela } from "./ui";

const IMOVEL = IMOVEIS.find((i) => i.codigo === "AP-0455")!;

// Migração de origem: portal caindo, site subindo. É o argumento de renovação.
const MIGRACAO = [
  { mes: "Fev", portal: 78, site: 22 },
  { mes: "Mar", portal: 71, site: 29 },
  { mes: "Abr", portal: 64, site: 36 },
  { mes: "Mai", portal: 55, site: 45 },
  { mes: "Jun", portal: 47, site: 53 },
  { mes: "Jul", portal: 39, site: 61 },
];

const JORNADA_VIVA = [
  { hora: "14:02:11", evento: "Entrou pelo Google — “apartamento 3 quartos Aclimação”" },
  { hora: "14:02:40", evento: "Viu as 18 fotos do AP-0455" },
  { hora: "14:04:03", evento: "Abriu o mapa e o Street View" },
  { hora: "14:05:22", evento: "Mexeu no simulador: renda R$ 14.000, entrada R$ 95.000" },
  { hora: "14:06:47", evento: "Ajustou o FGTS para R$ 38.000" },
  { hora: "14:07:10", evento: "Informou o WhatsApp para ver o resultado completo" },
];

export default function Site() {
  const [renda, setRenda] = useState(14000);
  const [entrada, setEntrada] = useState(95000);
  const [fgts, setFgts] = useState(38000);
  const [zap, setZap] = useState("");
  const [liberado, setLiberado] = useState(false);

  // Conta simplificada de financiamento — o que importa é a parcela mudar ao vivo.
  const conta = useMemo(() => {
    const financiado = Math.max(0, IMOVEL.preco - entrada - fgts);
    const meses = 360;
    const jurosMes = 0.0089;
    const parcela = Math.round(
      (financiado * jurosMes) / (1 - Math.pow(1 + jurosMes, -meses))
    );
    const comprometimento = renda > 0 ? parcela / renda : 1;
    return { financiado, parcela, comprometimento, aprova: comprometimento <= 0.3 };
  }, [renda, entrada, fgts]);

  const fmt = (v: number) => v.toLocaleString("pt-BR");

  return (
    <div className="pb-12">
      <TopoTela
        titulo="Site"
        legenda="a página que o cliente vê — e a qualificação acontecendo antes do lead"
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Página pública ── */}
        <div className="overflow-hidden rounded-[18px] border border-[#1E222B] bg-[#12141A]">
          <div className="border-b border-[#1E222B] px-4 py-2 text-[11.5px] text-[#7A828F]">
            horizonteimoveis.com.br/imovel/{IMOVEL.codigo.toLowerCase()}
          </div>

          <div className="grid grid-cols-4 gap-1 p-1">
            <div className="col-span-4 h-[180px] rounded-[10px]" style={{ background: IMOVEL.cor }} />
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[60px] rounded-[8px]"
                style={{ background: IMOVEL.cor, opacity: 0.75 - i * 0.12 }}
              />
            ))}
          </div>

          <div className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="m-0 text-[17px] font-semibold text-[#F4F5F7]">
                {IMOVEL.tipo} {IMOVEL.quartos} quartos · {IMOVEL.bairro}
              </h2>
              <span className="text-[19px] font-semibold tabular-nums text-[#F4F5F7]">
                {mil(IMOVEL.preco)}
              </span>
            </div>
            <p className="m-0 mt-1 text-[12.5px] text-[#9AA2AF]">
              {IMOVEL.endereco} · {IMOVEL.area}m² · {IMOVEL.vagas} vagas · condomínio{" "}
              {brl(IMOVEL.condominio)}
            </p>
            <p className="m-0 mt-3 text-[12.5px] leading-relaxed text-[#C9CFD8]">
              Apartamento reformado no coração do Aclimação, a 300m da praça. Sala ampla com varanda,
              cozinha planejada, suíte com closet e dois quartos com armários. Prédio com portaria
              24h, piscina e salão de festas.
            </p>

            <div className="mt-3 h-[110px] rounded-[12px] border border-[#1E222B] bg-[linear-gradient(135deg,#1A1E26_25%,transparent_25%,transparent_50%,#1A1E26_50%,#1A1E26_75%,transparent_75%)] bg-[length:16px_16px]">
              <div className="grid h-full place-items-center text-[12px] text-[#9AA2AF]">
                mapa · {IMOVEL.bairro}, Araraquara
              </div>
            </div>

            {/* ── O simulador embutido: é aqui que ele se qualifica sozinho ── */}
            <section className="mt-4 rounded-[16px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.04)] p-4">
              <p className="m-0 text-[13px] font-semibold text-[#F4F5F7]">
                Simule seu financiamento
              </p>
              <p className="m-0 mt-0.5 text-[11.5px] text-[#9AA2AF]">
                Mexa nos campos e veja a parcela mudar na hora.
              </p>

              <div className="mt-3 space-y-3">
                {[
                  ["Renda familiar", renda, setRenda, 3000, 40000, 500],
                  ["Entrada", entrada, setEntrada, 0, 300000, 5000],
                  ["FGTS", fgts, setFgts, 0, 150000, 1000],
                ].map(([rot, val, set, min, max, step]) => (
                  <label key={rot as string} className="block">
                    <span className="flex items-baseline justify-between text-[11.5px]">
                      <span className="text-[#9AA2AF]">{rot as string}</span>
                      <b className="tabular-nums text-[#F4F5F7]">R$ {fmt(val as number)}</b>
                    </span>
                    <input
                      type="range"
                      min={min as number}
                      max={max as number}
                      step={step as number}
                      value={val as number}
                      onChange={(e) => (set as (n: number) => void)(Number(e.target.value))}
                      className="mt-1 w-full accent-[#34C46A]"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-3 rounded-[12px] border border-[#1E222B] bg-[#12141A] p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-[#9AA2AF]">Parcela estimada</span>
                  <span className="text-[24px] font-semibold tabular-nums text-[#8CF0B0]">
                    {brl(conta.parcela)}
                  </span>
                </div>
                <p className="m-0 mt-1 text-[11.5px] text-[#7A828F]">
                  Financiando {brl(conta.financiado)} em 360 meses ·{" "}
                  <span style={{ color: conta.aprova ? "#34C46A" : "#FF5C7A" }}>
                    {Math.round(conta.comprometimento * 100)}% da renda
                    {conta.aprova ? " — dentro do limite" : " — acima dos 30% usuais"}
                  </span>
                </p>

                {liberado ? (
                  <div className="mt-3 rounded-[10px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.07)] p-2.5">
                    <p className="m-0 text-[12px] font-medium text-[#34C46A]">
                      Resultado completo liberado ✓
                    </p>
                    <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-[#9AA2AF]">
                      Você pode financiar até <b className="text-[#F4F5F7]">{mil(conta.financiado + entrada + fgts)}</b>.
                      A Carol vai te chamar no WhatsApp com 4 opções nessa faixa.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={zap}
                      onChange={(e) => setZap(e.target.value)}
                      placeholder="(16) 99999-0000"
                      className="input-ds min-w-[160px] flex-1 !h-9 !text-[12.5px]"
                    />
                    <Botao
                      variante="primario"
                      desabilitado={zap.replace(/\D/g, "").length < 10}
                      onClick={() => setLiberado(true)}
                    >
                      Ver resultado completo
                    </Botao>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* ── Painel interno ── */}
        <div className="space-y-4">
          <Bloco titulo="Jornada rastreada ao vivo">
            <ol className="m-0 list-none p-0">
              {JORNADA_VIVA.map((j, i, arr) => (
                <li key={i} className="flex gap-2.5">
                  <div className="flex flex-col items-center">
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: i === arr.length - 1 && liberado ? "#34C46A" : "#34C46A" }}
                    />
                    {i < arr.length - 1 && <span className="w-px flex-1 bg-[#1E222B]" />}
                  </div>
                  <div className="pb-2.5">
                    <span className="text-[10.5px] tabular-nums text-[#7A828F]">{j.hora}</span>
                    <p className="m-0 text-[12px] leading-snug text-[#C9CFD8]">{j.evento}</p>
                  </div>
                </li>
              ))}
              {liberado && (
                <li className="flex gap-2.5">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#34C46A]" />
                  </div>
                  <div>
                    <span className="text-[10.5px] tabular-nums text-[#7A828F]">agora</span>
                    <p className="m-0 text-[12px] font-medium leading-snug text-[#34C46A]">
                      Virou lead qualificado — renda, entrada e FGTS já preenchidos
                    </p>
                  </div>
                </li>
              )}
            </ol>
            <p className="m-0 mt-1 border-t border-[#1E222B] pt-2.5 text-[11.5px] leading-relaxed text-[#9AA2AF]">
              Ele preencheu a própria ficha para ver o resultado. O lead chega no CRM com{" "}
              <b className="text-[#F4F5F7]">score {liberado ? 71 : "—"}</b> em vez de só um telefone.
            </p>
          </Bloco>

          <Bloco titulo="Migração de origem" acao={<span className="text-[11.5px] text-[#7A828F]">% dos leads</span>}>
            <div className="flex items-end gap-1.5">
              {MIGRACAO.map((m) => (
                <div key={m.mes} className="flex-1 text-center">
                  <div className="flex h-[92px] flex-col justify-end overflow-hidden rounded-[6px]">
                    <div style={{ height: `${m.site}%`, background: "#34C46A" }} />
                    <div style={{ height: `${m.portal}%`, background: "#2A303B" }} />
                  </div>
                  <p className="m-0 mt-1 text-[10px] text-[#7A828F]">{m.mes}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-4 text-[11.5px]">
              <span className="flex items-center gap-1.5 text-[#9AA2AF]">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-[#34C46A]" /> site próprio
              </span>
              <span className="flex items-center gap-1.5 text-[#9AA2AF]">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-[#2A303B]" /> portais
              </span>
            </div>
            <p className="m-0 mt-2.5 text-[12px] leading-relaxed text-[#9AA2AF]">
              Em fevereiro, <b className="text-[#F4F5F7]">78%</b> dos leads vinham de portal. Hoje são{" "}
              <b className="text-[#F4F5F7]">39%</b>. Cada ponto que migra é mensalidade de portal que
              deixa de ser obrigatória — e é este gráfico que sustenta a renovação anual.
            </p>
          </Bloco>
        </div>
      </div>
    </div>
  );
}
