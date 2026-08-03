"use client";

import { useState } from "react";
import {
  CONVERSAO_CASA,
  CONVERSAO_SETOR,
  DIAGNOSTICO,
  FUNIL,
  MOTIVOS_PERDA_DADOS,
  VELOCIDADE_ETAPAS,
  gargalo,
} from "@/lib/proto/metricas";
import { CORRETORES, brl } from "@/lib/proto/base";
import { Avatar, Bloco, Botao, Modal, TopoTela } from "./ui";

export default function DadosComerciais() {
  const g = gargalo();
  const etapaGargalo = FUNIL[g.i]!;
  const anterior = FUNIL[g.i - 1]!;
  const perdaPct = Math.round((1 - g.passagem) * 100);
  const [aplicado, setAplicado] = useState(false);
  const [verDiagnostico, setVerDiagnostico] = useState(false);

  const maxFunil = FUNIL[0]!.qtd;
  const vantagem = ((CONVERSAO_CASA / CONVERSAO_SETOR - 1) * 100).toFixed(0);

  // Nota composta: conversão, velocidade e execução, cada eixo normalizado.
  const ranking = [...CORRETORES]
    .map((c) => {
      const conv = c.conversao / 6;
      const vel = 1 - Math.min(1, c.tempoResposta / 120);
      const exec = c.execucaoPrazo / 100;
      return { c, nota: Math.round((conv * 0.45 + vel * 0.25 + exec * 0.3) * 100) };
    })
    .sort((a, b) => b.nota - a.nota);

  return (
    <div className="space-y-4 pb-12">
      <TopoTela
        titulo="Dados comerciais"
        direita={<span className="text-[12.5px] text-[#7A828F]">Julho/2026 · comparado a junho</span>}
      />

      {/* ── Diagnóstico semanal ── */}
      <section className="rounded-[18px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.05)] p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[rgba(52,196,106,.12)] text-[16px]">
            💬
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="m-0 text-[13px] font-semibold text-[#F4F5F7]">Diagnóstico semanal</p>
              <span className="text-[11px] text-[#7A828F]">
                chegou no seu WhatsApp · {DIAGNOSTICO.quando}
              </span>
            </div>
            <p className="m-0 mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[#C9CFD8]">
              {DIAGNOSTICO.texto}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Botao variante={aplicado ? "sucesso" : "primario"} pequeno onClick={() => setAplicado(true)}>
                {aplicado ? "✓ 8 negócios redistribuídos" : "Redistribuir 8 negócios do Ricardo"}
              </Botao>
              <Botao pequeno variante="fantasma" onClick={() => setVerDiagnostico(true)}>
                Ver quais negócios
              </Botao>
            </div>
          </div>
        </div>
      </section>

      {/* ── Funil ── */}
      <Bloco
        titulo="Funil do mês"
        acao={<span className="text-[11.5px] text-[#7A828F]">taxa de passagem entre etapas</span>}
      >
        <div className="space-y-1.5">
          {FUNIL.map((f, i) => {
            const passagem = i === 0 ? 1 : f.qtd / FUNIL[i - 1]!.qtd;
            const ehGargalo = i === g.i;
            return (
              <div key={f.etapa} className="flex items-center gap-3">
                <span className="w-[132px] shrink-0 text-[12px] text-[#9AA2AF]">{f.etapa}</span>
                <div className="relative h-7 flex-1 overflow-hidden rounded-[7px] bg-[#1A1E26]">
                  <div
                    className="h-full rounded-[7px] transition-all"
                    style={{
                      width: `${(f.qtd / maxFunil) * 100}%`,
                      background: ehGargalo ? "rgba(255,92,122,.7)" : "rgba(52,196,106,.55)",
                    }}
                  />
                  <span className="absolute inset-y-0 left-2.5 flex items-center text-[12px] font-medium tabular-nums text-[#F4F5F7]">
                    {f.qtd.toLocaleString("pt-BR")}
                  </span>
                </div>
                <span
                  className="w-[68px] shrink-0 text-right text-[12px] tabular-nums"
                  style={{
                    color: ehGargalo ? "#FF5C7A" : "#7A828F",
                    fontWeight: ehGargalo ? 600 : 400,
                  }}
                >
                  {i === 0 ? "—" : `${Math.round(passagem * 100)}%`}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3.5 rounded-[14px] border border-[rgba(255,92,122,.3)] bg-[rgba(255,92,122,.06)] px-3.5 py-3">
          <p className="m-0 text-[12.5px] font-semibold text-[#FF5C7A]">
            Maior gargalo: {perdaPct}% dos leads qualificados nunca viram um imóvel.
          </p>
          <p className="m-0 mt-1 text-[12px] leading-relaxed text-[#9AA2AF]">
            São {(anterior.qtd - etapaGargalo.qtd).toLocaleString("pt-BR")} pessoas paradas nesta
            passagem. Causa provável: o tempo médio de primeiro contato do corretor é de{" "}
            <b className="text-[#F4F5F7]">4h12</b> — acima da janela em que o lead ainda responde.
          </p>
        </div>
      </Bloco>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Comparativo com o mercado">
          <div className="flex items-end gap-6">
            <div>
              <p className="m-0 text-[11px] text-[#7A828F]">Sua conversão</p>
              <p className="m-0 text-[30px] font-semibold leading-none tabular-nums text-[#34C46A]">
                {CONVERSAO_CASA.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}%
              </p>
            </div>
            <div>
              <p className="m-0 text-[11px] text-[#7A828F]">Média do setor</p>
              <p className="m-0 text-[30px] font-semibold leading-none tabular-nums text-[#7A828F]">
                {CONVERSAO_SETOR.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%
              </p>
            </div>
          </div>
          <p className="m-0 mt-3 text-[12px] leading-relaxed text-[#9AA2AF]">
            Você converte <b className="text-[#34C46A]">{vantagem}% acima</b> da média do setor. A
            diferença vem do tempo de resposta da IA nos leads de portal, que entram em menos de 1
            minuto.
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1A1E26]">
            <div className="h-full bg-[#34C46A]" style={{ width: `${(CONVERSAO_CASA / 4) * 100}%` }} />
          </div>
        </Bloco>

        <Bloco titulo="Motivos de perda">
          <div className="space-y-1.5">
            {MOTIVOS_PERDA_DADOS.map((m, i) => (
              <div key={m.motivo} className="flex items-center gap-2.5">
                <span className="w-[140px] shrink-0 text-[12px] text-[#9AA2AF]">{m.motivo}</span>
                <div className="h-5 flex-1 overflow-hidden rounded-[6px] bg-[#1A1E26]">
                  <div
                    className="h-full rounded-[6px]"
                    style={{
                      width: `${(m.pct / 34) * 100}%`,
                      background: i === 0 ? "rgba(255,92,122,.75)" : "rgba(122,130,143,.45)",
                    }}
                  />
                </div>
                <span className="w-[62px] shrink-0 text-right text-[12px] tabular-nums text-[#7A828F]">
                  {m.pct}% · {m.qtd}
                </span>
              </div>
            ))}
          </div>
          <p className="m-0 mt-3 text-[12px] leading-relaxed text-[#9AA2AF]">
            <b className="text-[#FF5C7A]">Sem crédito lidera com 34%</b> — são 61 negócios perdidos
            depois de já terem consumido visita e proposta. Qualificar crédito antes da visita é o
            maior ganho disponível.
          </p>
        </Bloco>
      </div>

      <Bloco
        titulo="Velocidade do funil"
        acao={<span className="text-[11.5px] text-[#7A828F]">dias médios em cada etapa</span>}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-3">
          {VELOCIDADE_ETAPAS.filter((v) => v.atual > 0).map((v) => {
            const delta = v.atual - v.anterior;
            const piorou = delta > 0.05;
            return (
              <div
                key={v.etapa}
                className="flex items-baseline justify-between gap-2 border-b border-[#1A1E26] py-1.5"
              >
                <span className="text-[12px] text-[#9AA2AF]">{v.etapa}</span>
                <span className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium tabular-nums text-[#F4F5F7]">
                    {v.atual.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}d
                  </span>
                  <span
                    className="text-[11px] tabular-nums"
                    style={{ color: piorou ? "#FF5C7A" : "#34C46A" }}
                    title={`mês anterior: ${v.anterior}d`}
                  >
                    {piorou ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </Bloco>

      <Bloco titulo="Ranking de corretores" densa>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[#1E222B] text-left text-[10.5px] uppercase tracking-wider text-[#7A828F]">
                <th className="px-4 py-2 font-medium">Corretor</th>
                <th className="px-3 py-2 text-right font-medium">Nota</th>
                <th className="px-3 py-2 text-right font-medium">Conversão</th>
                <th className="px-3 py-2 text-right font-medium">1ª resposta</th>
                <th className="px-3 py-2 text-right font-medium">Execução</th>
                <th className="px-3 py-2 text-right font-medium">Abertos</th>
                <th className="px-3 py-2 text-right font-medium">Atrasadas</th>
                <th className="px-4 py-2 text-right font-medium">VGV mês</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(({ c, nota }, i) => {
                const cor = (v: number, bom: number, medio: number) =>
                  v >= bom ? "#34C46A" : v >= medio ? "#F5B23D" : "#FF5C7A";
                return (
                  <tr key={c.id} className="border-b border-[#1A1E26] last:border-0 hover:bg-[#07080B]">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-3 text-[11px] tabular-nums text-[#7A828F]">{i + 1}</span>
                        <Avatar iniciais={c.iniciais} cor={c.cor} tam={22} />
                        <span className="text-[#F4F5F7]">{c.nome}</span>
                        {c.perfil === "novato" && (
                          <span className="rounded bg-[rgba(52,196,106,.1)] px-1 py-px text-[9.5px] text-[#8CF0B0]">
                            novato
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-semibold tabular-nums"
                      style={{ color: cor(nota, 60, 40) }}
                    >
                      {nota}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#9AA2AF]">
                      {c.conversao.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}%
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums"
                      style={{ color: cor(120 - c.tempoResposta, 105, 75) }}
                    >
                      {c.tempoResposta < 60
                        ? `${c.tempoResposta}min`
                        : `${Math.floor(c.tempoResposta / 60)}h${String(c.tempoResposta % 60).padStart(2, "0")}`}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums"
                      style={{ color: cor(c.execucaoPrazo, 80, 60) }}
                    >
                      {c.execucaoPrazo}%
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#9AA2AF]">
                      {c.negociosAbertos}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums"
                      style={{
                        color: cor(12 - c.atividadesAtrasadas, 11, 6),
                        fontWeight: c.atividadesAtrasadas > 5 ? 600 : 400,
                      }}
                    >
                      {c.atividadesAtrasadas}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#9AA2AF]">
                      {brl(c.vgvMes)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Bloco>

      <Modal
        aberto={verDiagnostico}
        titulo="Negócios sugeridos para redistribuição"
        onFechar={() => setVerDiagnostico(false)}
        largura={520}
      >
        <p className="m-0 text-[12.5px] leading-relaxed text-[#9AA2AF]">
          Os 8 negócios do Ricardo com maior valor parado e sem próxima atividade agendada. A
          sugestão é dividir entre Marcos (nota 78) e Diego, que estão com folga de carteira.
        </p>
        <ul className="mt-3 list-none space-y-1.5 p-0">
          {(
            [
              ["Wilson Villagio — AP-0512", 520000, 22],
              ["Adriana Sicsú — CA-0118", 498000, 19],
              ["Nelson Peixoto — AP-0771", 465000, 17],
              ["Bianca Rezende — CS-0311", 412000, 15],
              ["Anderson Muniz — AP-0302", 398000, 14],
              ["Regina Toledo — ST-0090", 268000, 12],
              ["Milena Barcelos — AP-0233", 355000, 11],
              ["Joaquim Neves — CA-0450", 610000, 9],
            ] as [string, number, number][]
          ).map(([t, v, d]) => (
            <li
              key={t}
              className="flex items-center justify-between gap-3 rounded-[12px] border border-[#1E222B] bg-[#07080B] px-3 py-2 text-[12px]"
            >
              <span className="text-[#C9CFD8]">{t}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="tabular-nums text-[#9AA2AF]">{brl(v)}</span>
                <span className="tabular-nums text-[#FF5C7A]">{d}d parado</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Botao variante="fantasma" onClick={() => setVerDiagnostico(false)}>
            Fechar
          </Botao>
          <Botao
            variante="primario"
            onClick={() => {
              setAplicado(true);
              setVerDiagnostico(false);
            }}
          >
            Redistribuir os 8
          </Botao>
        </div>
      </Modal>
    </div>
  );
}
