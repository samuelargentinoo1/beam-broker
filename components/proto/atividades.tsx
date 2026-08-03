"use client";

import { useMemo, useState } from "react";
import { ATIVIDADES } from "@/lib/proto/negocios";
import { CONTATOS } from "@/lib/proto/contatos";
import { CORRETORES } from "@/lib/proto/base";
import type { Atividade } from "@/lib/proto/tipos";
import { Avatar, Bloco, Botao, Modal, TopoTela } from "./ui";

const GLIFO: Record<Atividade["tipo"], string> = {
  Ligação: "☎",
  Visita: "⌂",
  WhatsApp: "💬",
  Proposta: "◆",
  "E-mail": "✉",
};

const ABAS = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "atrasada", rotulo: "Atrasadas" },
  { id: "proximos", rotulo: "Próximos 7 dias" },
] as const;

export default function Atividades() {
  const [lista, setLista] = useState<Atividade[]>(ATIVIDADES);
  const [aba, setAba] = useState<"hoje" | "atrasada" | "proximos">("hoje");
  const [visao, setVisao] = useState<"corretor" | "gestor">("corretor");
  const [concluindo, setConcluindo] = useState<Atividade | null>(null);
  const [resultado, setResultado] = useState("");
  const [proxTipo, setProxTipo] = useState<Atividade["tipo"]>("Ligação");
  const [proxQuando, setProxQuando] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const daAba = useMemo(() => lista.filter((a) => a.dia === aba), [lista, aba]);
  const contar = (d: string) => lista.filter((a) => a.dia === d && !a.concluida).length;

  const fechar = () => {
    setConcluindo(null);
    setResultado("");
    setProxQuando("");
  };

  const salvar = () => {
    if (!concluindo || !resultado.trim() || !proxQuando.trim()) return;
    const c = CONTATOS.find((x) => x.id === concluindo.contatoId)!;
    setLista((xs) => [
      ...xs.map((a) => (a.id === concluindo.id ? { ...a, concluida: true } : a)),
      {
        id: `at${Date.now()}`,
        tipo: proxTipo,
        contatoId: concluindo.contatoId,
        corretorId: concluindo.corretorId,
        quando: proxQuando,
        dia: "proximos",
        contexto: `Próxima ação definida ao concluir: “${resultado.trim()}”`,
        criadaPelaIa: false,
        concluida: false,
      },
    ]);
    setAviso(`Atividade concluída e próxima ação com ${c.nome.split(" ")[0]} agendada.`);
    setTimeout(() => setAviso(null), 3000);
    fechar();
  };

  return (
    <div className="pb-12">
      <TopoTela
        titulo="Atividades"
        legenda={visao === "corretor" ? "sua agenda" : "cobrança de rotina da equipe"}
        direita={
          <div className="flex gap-1.5">
            {(["corretor", "gestor"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisao(v)}
                className={`rounded-[10px] border px-3 py-1.5 text-[12.5px] transition-colors ${
                  visao === v
                    ? "border-[#34C46A] bg-[rgba(52,196,106,.08)] font-medium text-[#8CF0B0]"
                    : "border-[#2A303B] bg-[#12141A] text-[#9AA2AF] hover:border-[#34C46A]"
                }`}
              >
                {v === "corretor" ? "Minha agenda" : "Visão do gestor"}
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

      {visao === "corretor" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ABAS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={`rounded-[10px] border px-3 py-1.5 text-[12.5px] transition-colors ${
                  aba === a.id
                    ? "border-[#34C46A] bg-[rgba(52,196,106,.08)] font-medium text-[#8CF0B0]"
                    : "border-[#2A303B] bg-[#12141A] text-[#9AA2AF] hover:border-[#34C46A]"
                }`}
              >
                {a.rotulo}
                <span
                  className="ml-1.5 text-[11px] tabular-nums"
                  style={{ color: a.id === "atrasada" && contar(a.id) > 0 ? "#FF5C7A" : undefined }}
                >
                  {contar(a.id)}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {daAba.map((a) => {
              const c = CONTATOS.find((x) => x.id === a.contatoId)!;
              const atrasada = a.dia === "atrasada";
              return (
                <article
                  key={a.id}
                  className="flex items-start gap-3 rounded-[16px] border bg-[#12141A] px-4 py-3"
                  style={{
                    borderColor: atrasada && !a.concluida ? "rgba(255,92,122,.35)" : "#1E222B",
                    opacity: a.concluida ? 0.55 : 1,
                  }}
                >
                  <span
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[14px]"
                    style={{
                      background: atrasada ? "rgba(255,92,122,.08)" : "rgba(52,196,106,.08)",
                      color: atrasada ? "#FF5C7A" : "#8CF0B0",
                    }}
                  >
                    {GLIFO[a.tipo]}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[13.5px] font-medium text-[#F4F5F7]">{c.nome}</span>
                      <span className="text-[11.5px] text-[#7A828F]">{a.tipo}</span>
                      <span
                        className="text-[11.5px] tabular-nums"
                        style={{ color: atrasada ? "#FF5C7A" : "#9AA2AF" }}
                      >
                        {a.quando}
                      </span>
                      {a.criadaPelaIa && (
                        <span className="rounded bg-[rgba(185,140,255,.1)] px-1.5 py-px text-[10px] text-[#B98CFF]">
                          🤖 criada pela IA
                        </span>
                      )}
                      {a.concluida && (
                        <span className="rounded bg-[rgba(52,196,106,.1)] px-1.5 py-px text-[10px] text-[#34C46A]">
                          ✓ concluída
                        </span>
                      )}
                    </div>

                    <p className="m-0 mt-1 text-[12.5px] leading-snug text-[#9AA2AF]">{a.contexto}</p>

                    {a.notaIa && (
                      <p className="m-0 mt-1.5 rounded-[10px] border border-[rgba(185,140,255,.25)] bg-[rgba(185,140,255,.05)] px-2.5 py-1.5 text-[11.5px] text-[#B98CFF]">
                        {a.notaIa}
                      </p>
                    )}
                  </div>

                  {!a.concluida && (
                    <Botao pequeno variante="sucesso" onClick={() => setConcluindo(a)}>
                      Concluir
                    </Botao>
                  )}
                </article>
              );
            })}
            {daAba.length === 0 && (
              <p className="m-0 rounded-[16px] border border-dashed border-[#2A303B] px-4 py-10 text-center text-[12.5px] text-[#7A828F]">
                Nada nesta aba.
              </p>
            )}
          </div>
        </>
      ) : (
        <Bloco titulo="Execução da rotina por corretor" densa>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-[#1E222B] text-left text-[10.5px] uppercase tracking-wider text-[#7A828F]">
                  <th className="px-4 py-2 font-medium">Corretor</th>
                  <th className="px-3 py-2 text-right font-medium">Atrasadas</th>
                  <th className="px-3 py-2 text-right font-medium">Execução no prazo</th>
                  <th className="px-3 py-2 text-right font-medium">Sem próxima ação</th>
                  <th className="px-4 py-2 text-right font-medium">Tempo médio de resposta</th>
                </tr>
              </thead>
              <tbody>
                {CORRETORES.map((c) => {
                  const cel = (v: number, bom: number, medio: number) =>
                    v >= bom ? "#34C46A" : v >= medio ? "#F5B23D" : "#FF5C7A";
                  return (
                    <tr key={c.id} className="border-b border-[#1A1E26] last:border-0 hover:bg-[#07080B]">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar iniciais={c.iniciais} cor={c.cor} tam={22} />
                          <span className="text-[#F4F5F7]">{c.nome}</span>
                        </div>
                      </td>
                      <td
                        className="px-3 py-2.5 text-right font-semibold tabular-nums"
                        style={{ color: cel(12 - c.atividadesAtrasadas, 11, 6) }}
                      >
                        {c.atividadesAtrasadas}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right tabular-nums"
                        style={{ color: cel(c.execucaoPrazo, 80, 60) }}
                      >
                        {c.execucaoPrazo}%
                      </td>
                      <td
                        className="px-3 py-2.5 text-right tabular-nums"
                        style={{ color: cel(15 - c.semProximaAcao, 13, 8) }}
                      >
                        {c.semProximaAcao}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right tabular-nums"
                        style={{ color: cel(120 - c.tempoResposta, 105, 75) }}
                      >
                        {c.tempoResposta < 60
                          ? `${c.tempoResposta}min`
                          : `${Math.floor(c.tempoResposta / 60)}h${String(c.tempoResposta % 60).padStart(2, "0")}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="m-0 border-t border-[#1E222B] px-4 py-2.5 text-[12px] leading-relaxed text-[#9AA2AF]">
            <b className="text-[#FF5C7A]">Ricardo Bastos</b> concentra 12 atividades atrasadas e 15
            negócios sem próxima ação, com 1h36 de tempo médio de resposta. É onde a rotina quebra.
          </p>
        </Bloco>
      )}

      {/* Concluir exige resultado E próxima ação — é isso que impede o funil de
          virar cemitério de negócio sem dono. */}
      <Modal aberto={!!concluindo} titulo="Concluir atividade" onFechar={fechar} largura={480}>
        {concluindo && (
          <div>
            <p className="m-0 text-[13px] text-[#9AA2AF]">
              {concluindo.tipo} com{" "}
              <b className="text-[#F4F5F7]">
                {CONTATOS.find((x) => x.id === concluindo.contatoId)!.nome}
              </b>
            </p>

            <label className="mt-4 block">
              <span className="label-caps mb-1.5 block !text-[9px] tracking-[.12em] text-[#9AA2AF]">
                o que aconteceu
              </span>
              <textarea
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
                rows={3}
                placeholder="Falei com ela, pediu para retornar depois das 18h…"
                className="input-ds !h-auto resize-y py-2.5"
              />
            </label>

            <div className="mt-4 rounded-[14px] border border-[rgba(245,178,61,.3)] bg-[rgba(245,178,61,.05)] p-3">
              <p className="m-0 mb-2 text-[12px] font-medium text-[#F5B23D]">
                Agende a próxima ação para concluir
              </p>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={proxTipo}
                  onChange={(e) => setProxTipo(e.target.value as Atividade["tipo"])}
                  className="input-ds"
                >
                  {(["Ligação", "Visita", "WhatsApp", "Proposta", "E-mail"] as const).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <input
                  value={proxQuando}
                  onChange={(e) => setProxQuando(e.target.value)}
                  placeholder="30/07, 09:00"
                  className="input-ds"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Botao variante="fantasma" onClick={fechar}>
                Cancelar
              </Botao>
              <Botao
                variante="sucesso"
                desabilitado={!resultado.trim() || !proxQuando.trim()}
                onClick={salvar}
              >
                Concluir e agendar
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
