"use client";

import { useMemo, useState } from "react";
import { CONVERSAS } from "@/lib/proto/conversas";
import { CONTATOS, compativeis } from "@/lib/proto/contatos";
import { brl, mil } from "@/lib/proto/base";
import type { Conversa, Mensagem } from "@/lib/proto/tipos";
import { Botao, Chip, Inicial, Nada, Score, TopoTela } from "./ui";

const FILTROS = [
  { id: "minhas", rotulo: "Minhas" },
  { id: "sem-resposta", rotulo: "Sem resposta" },
  { id: "ia", rotulo: "IA atendendo" },
  { id: "irritado", rotulo: "Cliente irritado" },
  { id: "sla", rotulo: "SLA estourado" },
] as const;

const tempo = (min: number) =>
  min < 60 ? `${min}min` : min < 1440 ? `${Math.floor(min / 60)}h` : `${Math.floor(min / 1440)}d`;

export default function Conversas() {
  const [estado, setEstado] = useState<Conversa[]>(CONVERSAS);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState("cv1");
  const [rascunho, setRascunho] = useState("");

  const conversa = estado.find((c) => c.id === selecionada)!;
  const contato = CONTATOS.find((c) => c.id === conversa.contatoId)!;

  const lista = useMemo(() => {
    if (!filtro) return estado;
    return estado.filter((c) =>
      filtro === "minhas"
        ? c.corretorId === "c2"
        : filtro === "sem-resposta"
          ? c.semResposta
          : filtro === "ia"
            ? c.atendente === "ia"
            : filtro === "irritado"
              ? c.irritado
              : c.slaEstourado
    );
  }, [estado, filtro]);

  const trocarAtendente = (para: "ia" | "corretor") =>
    setEstado((xs) => xs.map((c) => (c.id === selecionada ? { ...c, atendente: para } : c)));

  const enviar = () => {
    const texto = rascunho.trim();
    if (!texto) return;
    const nova: Mensagem = {
      id: `m${Date.now()}`,
      autor: "corretor",
      texto,
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };
    setEstado((xs) =>
      xs.map((c) =>
        c.id === selecionada
          ? { ...c, mensagens: [...c.mensagens, nova], minutosDesdeUltima: 0, semResposta: false, naoLidas: 0 }
          : c
      )
    );
    setRascunho("");
  };

  return (
    <div className="pb-6">
      <TopoTela
        titulo="Conversas"
        legenda={`${estado.filter((c) => c.atendente === "ia").length} com a IA · ${
          estado.filter((c) => c.semResposta).length
        } sem resposta`}
      />

      <div className="grid h-[calc(100vh-230px)] min-h-[560px] grid-cols-[288px_minmax(0,1fr)_296px] gap-3">
        {/* ── A caixa ── */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#1E222B] bg-[#12141A]">
          <div className="flex flex-wrap gap-1 border-b border-[#1E222B] p-2.5">
            {FILTROS.map((f) => (
              <Chip
                key={f.id}
                ativo={filtro === f.id}
                onClick={() => setFiltro((x) => (x === f.id ? null : f.id))}
              >
                {f.rotulo}
              </Chip>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {lista.length === 0 && (
              <div className="p-3">
                <Nada>Nenhuma conversa neste filtro.</Nada>
              </div>
            )}
            {lista.map((c) => {
              const ct = CONTATOS.find((x) => x.id === c.contatoId)!;
              const ultima = c.mensagens[c.mensagens.length - 1];
              const ativa = c.id === selecionada;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelecionada(c.id)}
                  className={`flex w-full gap-2.5 border-b border-[#1A1E26] px-3 py-2.5 text-left transition-colors ${
                    ativa ? "bg-[rgba(52,196,106,.06)]" : "hover:bg-[#07080B]"
                  }`}
                >
                  <Inicial c={ct} tam={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12.5px] font-medium text-[#F4F5F7]">{ct.nome}</span>
                      <span className="shrink-0 text-[10.5px] tabular-nums text-[#7A828F]">
                        {tempo(c.minutosDesdeUltima)}
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 truncate text-[11.5px] text-[#7A828F]">
                      {ultima?.autor === "cliente" ? "" : "Você: "}
                      {ultima?.texto}
                    </p>
                    <div className="mt-1 flex items-center gap-1">
                      <span
                        className="rounded px-1 py-px text-[9.5px]"
                        style={
                          c.atendente === "ia"
                            ? { background: "rgba(185,140,255,.12)", color: "#B98CFF" }
                            : { background: "rgba(52,196,106,.1)", color: "#8CF0B0" }
                        }
                      >
                        {c.atendente === "ia" ? "🤖 IA" : "AF Ana Julia"}
                      </span>
                      {c.irritado && (
                        <span className="rounded bg-[rgba(255,92,122,.1)] px-1 py-px text-[9.5px] text-[#FF5C7A]">
                          irritado
                        </span>
                      )}
                      {c.slaEstourado && (
                        <span className="rounded bg-[rgba(245,178,61,.12)] px-1 py-px text-[9.5px] text-[#F5B23D]">
                          SLA
                        </span>
                      )}
                      {c.naoLidas > 0 && (
                        <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-[#34C46A] px-1 text-[9.5px] font-semibold tabular-nums text-[#06210F]">
                          {c.naoLidas}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── O fio ── */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#1E222B] bg-[#12141A]">
          <header className="border-b border-[#1E222B] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Inicial c={contato} tam={32} />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13.5px] font-medium text-[#F4F5F7]">{contato.nome}</p>
                <p className="m-0 text-[11px] tabular-nums text-[#7A828F]">{contato.telefone}</p>
              </div>
              {conversa.atendente === "ia" ? (
                <Botao variante="primario" onClick={() => trocarAtendente("corretor")}>
                  Assumir conversa
                </Botao>
              ) : (
                <Botao onClick={() => trocarAtendente("ia")}>Devolver pra IA</Botao>
              )}
            </div>

            <div className="mt-3 rounded-[14px] border border-[rgba(185,140,255,.25)] bg-[rgba(185,140,255,.06)] px-3 py-2">
              <p className="m-0 mb-1 text-[10px] font-medium uppercase tracking-[.12em] text-[#B98CFF]">
                🤖 Resumo da IA
              </p>
              {conversa.resumoIa.map((l, i) => (
                <p key={i} className="m-0 text-[12px] leading-relaxed text-[#9AA2AF]">
                  {l}
                </p>
              ))}
            </div>

            {conversa.alerta && (
              <div className="mt-2 rounded-[12px] border border-[rgba(255,92,122,.35)] bg-[rgba(255,92,122,.07)] px-3 py-2 text-[12px] font-medium text-[#FF5C7A]">
                ⚠ {conversa.alerta}
              </div>
            )}
          </header>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#07080B] px-4 py-3.5">
            {conversa.mensagens.map((m, i) => (
              <div key={m.id ?? i}>
                {m.diaLabel && (
                  <p className="my-3 text-center text-[10.5px] uppercase tracking-wider text-[#7A828F]">
                    {m.diaLabel}
                  </p>
                )}
                <div className={`flex ${m.autor === "cliente" ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[74%] whitespace-pre-wrap rounded-[16px] px-3 py-2 text-[12.5px] leading-relaxed ${
                      m.autor === "cliente"
                        ? "rounded-tl-[4px] border border-[#1E222B] bg-[#12141A] text-[#C9CFD8]"
                        : m.autor === "ia"
                          ? "rounded-tr-[4px] border border-[rgba(185,140,255,.3)] bg-[rgba(185,140,255,.09)] text-[#C9CFD8]"
                          : "rounded-tr-[4px] bg-[#34C46A] text-[#06210F]"
                    }`}
                  >
                    {m.autor === "ia" && (
                      <p className="m-0 mb-0.5 text-[9.5px] font-medium uppercase tracking-wider text-[#B98CFF]">
                        🤖 Carol · IA
                      </p>
                    )}
                    {m.texto}
                    <span
                      className={`mt-0.5 block text-right text-[9.5px] tabular-nums ${
                        m.autor === "corretor" ? "text-white/70" : "text-[#7A828F]"
                      }`}
                    >
                      {m.hora}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-[#1E222B] p-2.5">
            {conversa.atendente === "ia" ? (
              <div className="flex items-center gap-2 rounded-[12px] border border-[#1E222B] bg-[#07080B] px-3 py-2.5">
                <span className="text-[12px] text-[#7A828F]">
                  🤖 A IA está conduzindo esta conversa. Assuma para digitar.
                </span>
                <div className="ml-auto">
                  <Botao pequeno variante="primario" onClick={() => trocarAtendente("corretor")}>
                    Assumir
                  </Botao>
                </div>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  value={rascunho}
                  onChange={(e) => setRascunho(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviar();
                    }
                  }}
                  rows={1}
                  placeholder="Escreva uma mensagem…"
                  className="input-ds min-h-[38px] flex-1 resize-y !py-2"
                />
                <Botao variante="primario" onClick={enviar} desabilitado={!rascunho.trim()}>
                  Enviar
                </Botao>
              </div>
            )}
          </div>
        </section>

        {/* ── A ficha ── */}
        <section className="min-h-0 overflow-y-auto rounded-[18px] border border-[#1E222B] bg-[#12141A]">
          <div className="border-b border-[#1E222B] px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <Inicial c={contato} tam={36} />
              <div className="min-w-0">
                <p className="m-0 truncate text-[13px] font-medium text-[#F4F5F7]">{contato.nome}</p>
                <p className="m-0 text-[11px] text-[#7A828F]">
                  {contato.origem} · há {contato.criadoDiasAtras} dias
                </p>
              </div>
            </div>
            <div className="mt-2.5">
              <Score c={contato} />
            </div>
          </div>

          <Secao titulo="Perfil">
            <L k="Composição" v={contato.perfilFamiliar} />
            <L k="Busca" v={contato.finalidade === "VENDA" ? "Compra" : "Locação"} />
            <L k="Quartos" v={contato.quartosDesejados ? `${contato.quartosDesejados}+` : "—"} />
            <L k="Região" v={contato.bairrosDesejados.join(", ") || "não definida"} />
            <L k="Urgência" v={contato.urgenciaMeses ? `${contato.urgenciaMeses} meses` : "sem prazo"} />
          </Secao>

          <Secao titulo="Financeiro">
            <L k="Renda" v={contato.renda ? brl(contato.renda) : "não informada"} />
            <L k="FGTS" v={contato.fgts ? brl(contato.fgts) : "—"} />
            <L k="Entrada" v={contato.entrada ? brl(contato.entrada) : "—"} />
            <L k="Teto" v={contato.tetoValor ? brl(contato.tetoValor) : "—"} />
          </Secao>

          <Secao titulo="Imóveis compatíveis">
            <div className="space-y-1.5">
              {compativeis(contato).map((im) => (
                <div key={im!.id} className="flex items-center gap-2">
                  <span className="h-7 w-9 shrink-0 rounded-[5px]" style={{ background: im!.cor }} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-[11.5px] text-[#C9CFD8]">
                      {im!.tipo} {im!.quartos}q · {im!.bairro}
                    </p>
                    <p className="m-0 text-[11px] tabular-nums text-[#7A828F]">
                      {im!.finalidade === "VENDA" ? mil(im!.preco) : `${brl(im!.preco)}/mês`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Secao>

          <Secao titulo="Histórico">
            <L k="Mensagens" v={`${contato.respondidas} de ${contato.enviadas} respondidas`} />
            <L k="Última interação" v={`há ${contato.ultimaInteracaoDiasAtras} dias`} />
            <L k="Etapa" v={contato.estagio} />
          </Secao>
        </section>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#1E222B] px-3.5 py-3">
      <p className="m-0 mb-1.5 text-[10px] font-medium uppercase tracking-[.12em] text-[#7A828F]">
        {titulo}
      </p>
      {children}
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
