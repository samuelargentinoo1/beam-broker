"use client";

// CRM de Negócios da VITRINE (sem banco). Mesma operação do CRM real —
// pipelines com etapas próprias, arrastar entre fases, desfecho obrigatório com
// motivo, trava de lead e previsão ponderada —, só que com os dados em memória.
//
// Com DATABASE_URL configurada, esta tela não é usada: a rota carrega a versão
// com Prisma, que persiste de verdade.

import { useMemo, useState } from "react";
import { MOTIVOS_PERDA, NEGOCIOS, PIPELINES, corretorPorId } from "@/lib/proto/negocios";
import { CONTATOS } from "@/lib/proto/contatos";
import { IMOVEIS, brl } from "@/lib/proto/base";
import type { Negocio } from "@/lib/proto/tipos";
import { Avatar, Botao, Modal, Score, TopoTela } from "./ui";

type Pipeline = Negocio["pipeline"];
const ABAS: Pipeline[] = ["Venda", "Locação", "Lançamento", "Captação"];

export default function NegociosVitrine() {
  const [lista, setLista] = useState<Negocio[]>(NEGOCIOS);
  const [pipeline, setPipeline] = useState<Pipeline>("Venda");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [fechando, setFechando] = useState<Negocio | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const etapas = PIPELINES[pipeline];
  const doPipeline = useMemo(() => lista.filter((n) => n.pipeline === pipeline), [lista, pipeline]);

  const emNegociacao = doPipeline.filter((n) => n.etapa !== "Fechado").reduce((s, n) => s + n.valor, 0);
  const ponderada = doPipeline
    .filter((n) => n.etapa !== "Fechado")
    .reduce((s, n) => s + n.valor * n.probabilidade, 0);

  const soltar = (etapa: string) => {
    const id = arrastando;
    setArrastando(null);
    setAlvo(null);
    if (!id) return;
    const n = lista.find((x) => x.id === id);
    if (!n || n.etapa === etapa) return;
    // Fechar exige desfecho: é esse dado que alimenta os motivos de perda.
    if (etapa === "Fechado") {
      setFechando(n);
      return;
    }
    setLista((xs) => xs.map((x) => (x.id === id ? { ...x, etapa, diasParado: 0 } : x)));
  };

  const concluir = (resultado: "ganho" | "perda") => {
    if (!fechando) return;
    if (resultado === "perda" && !motivo) return;
    setLista((xs) => xs.map((x) => (x.id === fechando.id ? { ...x, etapa: "Fechado", diasParado: 0 } : x)));
    setAviso(
      resultado === "ganho"
        ? `${fechando.titulo} marcado como GANHO — ${brl(fechando.valor)}`
        : `${fechando.titulo} marcado como PERDIDO — motivo: ${motivo}`
    );
    setFechando(null);
    setMotivo(null);
    setTimeout(() => setAviso(null), 3200);
  };

  return (
    <div className="pb-6">
      <TopoTela
        titulo="Negócios"
        direita={
          <div className="flex flex-wrap items-center gap-4 text-[12.5px]">
            <span className="text-[#9AA2AF]">
              Em negociação <b className="ml-1 tabular-nums text-[#F4F5F7]">{brl(emNegociacao)}</b>
            </span>
            <span className="text-[#9AA2AF]">
              Previsão ponderada do mês{" "}
              <b className="ml-1 tabular-nums text-[#34C46A]">{brl(Math.round(ponderada))}</b>
            </span>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {ABAS.map((p) => (
          <button
            key={p}
            onClick={() => setPipeline(p)}
            className={`rounded-[10px] border px-3 py-1.5 text-[12.5px] transition-colors ${
              pipeline === p
                ? "border-[#34C46A] bg-[rgba(52,196,106,.12)] font-medium text-[#8CF0B0]"
                : "border-[#2A303B] bg-[#12141A] text-[#9AA2AF] hover:border-[#34C46A]"
            }`}
          >
            {p}
            <span className="ml-1.5 text-[11px] tabular-nums opacity-60">
              {lista.filter((n) => n.pipeline === p).length}
            </span>
          </button>
        ))}
      </div>

      {aviso && (
        <div className="mb-3 rounded-[12px] border border-[rgba(52,196,106,.38)] bg-[rgba(52,196,106,.14)] px-3.5 py-2 text-[12.5px] text-[#34C46A]">
          {aviso}
        </div>
      )}

      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-2.5">
          {etapas.map((etapa) => {
            const daEtapa = doPipeline.filter((n) => n.etapa === etapa);
            const soma = daEtapa.reduce((s, n) => s + n.valor, 0);
            const destacado = alvo === etapa;

            return (
              <section
                key={etapa}
                onDragOver={(e) => {
                  e.preventDefault();
                  setAlvo(etapa);
                }}
                onDragLeave={() => setAlvo((a) => (a === etapa ? null : a))}
                onDrop={(e) => {
                  e.preventDefault();
                  soltar(etapa);
                }}
                className={`w-[250px] shrink-0 rounded-[16px] border p-2.5 transition-colors ${
                  destacado ? "border-[#34C46A] bg-[rgba(52,196,106,.06)]" : "border-[#1E222B] bg-[#0E1015]"
                }`}
              >
                <header className="mb-2 px-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12.5px] font-medium text-[#F4F5F7]">{etapa}</span>
                    <span className="text-[11px] tabular-nums text-[#7A828F]">{daEtapa.length}</span>
                  </div>
                  <p className="m-0 mt-0.5 text-[11px] tabular-nums text-[#7A828F]">{brl(soma)}</p>
                </header>

                <div className="flex min-h-[80px] flex-col gap-2">
                  {daEtapa.map((n) => {
                    const ct = CONTATOS.find((c) => c.id === n.contatoId)!;
                    const im = IMOVEIS.find((i) => i.id === n.imovelId);
                    const co = corretorPorId(n.corretorId);
                    const semAcao = !n.proximaAtividade && etapa !== "Fechado";

                    return (
                      <article
                        key={n.id}
                        draggable
                        onDragStart={() => setArrastando(n.id)}
                        onDragEnd={() => {
                          setArrastando(null);
                          setAlvo(null);
                        }}
                        className={`cursor-grab rounded-[12px] border bg-[#12141A] p-2.5 transition-all active:cursor-grabbing ${
                          arrastando === n.id ? "opacity-40" : "hover:border-[#2F3947]"
                        }`}
                        style={{ borderColor: semAcao ? "rgba(255,92,122,.45)" : "#1E222B" }}
                        title={semAcao ? "Sem próxima atividade agendada" : n.proximaAtividade ?? ""}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="text-[12.5px] font-medium leading-tight text-[#F4F5F7]">
                            {ct.nome}
                          </span>
                          <Score c={ct} compacto />
                        </div>

                        <p className="m-0 mt-1 text-[12px] font-medium tabular-nums text-[#F4F5F7]">
                          {n.pipeline === "Locação" ? `${brl(n.valor)}/mês` : brl(n.valor)}
                        </p>

                        {im && (
                          <p className="m-0 mt-0.5 truncate text-[11px] text-[#7A828F]">
                            {im.codigo} · {im.bairro}
                          </p>
                        )}

                        {n.travadoPor && (
                          <p className="m-0 mt-1.5 inline-flex items-center gap-1 rounded-[6px] border border-[rgba(245,178,61,.38)] bg-[rgba(245,178,61,.14)] px-1.5 py-px text-[10.5px] text-[#F5B23D]">
                            🔒 travado por {n.travadoPor} até {n.travadoAte}
                          </p>
                        )}

                        <div className="mt-2 flex items-center gap-1.5 border-t border-[#1A1E26] pt-1.5">
                          <Avatar iniciais={co.iniciais} cor={co.cor} tam={19} />
                          <span className="text-[10.5px] tabular-nums text-[#7A828F]">
                            {n.diasParado}d parado
                          </span>
                          {semAcao && (
                            <span className="ml-auto text-[10.5px] font-medium text-[#FF5C7A]">
                              sem próxima ação
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}

                  {daEtapa.length === 0 && (
                    <p className="m-0 rounded-[12px] border border-dashed border-[#2A303B] px-2 py-5 text-center text-[11px] text-[#7A828F]">
                      Arraste um card para cá
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <p className="mt-1 text-[11.5px] text-[#7A828F]">
        Borda vermelha = negócio sem próxima atividade agendada. Arraste para mudar de etapa; soltar em{" "}
        <b className="text-[#9AA2AF]">Fechado</b> exige registrar ganho ou perda.
      </p>

      <Modal
        aberto={!!fechando}
        titulo="Fechar negócio"
        onFechar={() => {
          setFechando(null);
          setMotivo(null);
        }}
        largura={460}
      >
        {fechando && (
          <div>
            <p className="m-0 text-[13.5px] font-medium text-[#F4F5F7]">{fechando.titulo}</p>
            <p className="m-0 mt-0.5 text-[12.5px] tabular-nums text-[#9AA2AF]">
              {fechando.pipeline === "Locação" ? `${brl(fechando.valor)}/mês` : brl(fechando.valor)}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => concluir("ganho")}
                className="rounded-[16px] border border-[rgba(52,196,106,.38)] bg-[rgba(52,196,106,.12)] px-4 py-4 text-center transition-colors hover:bg-[rgba(52,196,106,.2)]"
              >
                <p className="m-0 text-[20px]">★</p>
                <p className="m-0 mt-1 text-[13px] font-semibold text-[#34C46A]">Ganho</p>
                <p className="m-0 text-[11px] text-[#9AA2AF]">
                  entra no VGV de {corretorPorId(fechando.corretorId).nome.split(" ")[0]}
                </p>
              </button>

              <div
                className="rounded-[16px] border px-4 py-4 text-center"
                style={{
                  borderColor: motivo ? "rgba(255,92,122,.38)" : "#2A303B",
                  background: motivo ? "rgba(255,92,122,.12)" : "transparent",
                }}
              >
                <p className="m-0 text-[20px]">✕</p>
                <p className="m-0 mt-1 text-[13px] font-semibold text-[#FF5C7A]">Perda</p>
                <p className="m-0 text-[11px] text-[#9AA2AF]">exige motivo</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="m-0 mb-1.5 text-[10px] font-medium uppercase tracking-[.12em] text-[#7A828F]">
                motivo da perda
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS_PERDA.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMotivo(m)}
                    className="rounded-[10px] border px-2.5 py-1.5 text-[12px] transition-colors"
                    style={
                      motivo === m
                        ? { borderColor: "#FF5C7A", background: "rgba(255,92,122,.14)", color: "#FF5C7A" }
                        : { borderColor: "#2A303B", color: "#9AA2AF" }
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Botao
                variante="fantasma"
                onClick={() => {
                  setFechando(null);
                  setMotivo(null);
                }}
              >
                Cancelar
              </Botao>
              <Botao variante="perigo" desabilitado={!motivo} onClick={() => concluir("perda")}>
                Registrar perda
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
