"use client";

// Quadro do funil de Negócios: colunas por fase, card arrastável entre elas.
//
// Movimentação OTIMISTA, como no quadro de leads: o card troca de coluna na
// hora e a gravação vai depois. Arrastar precisa parecer instantâneo, senão a
// pessoa arrasta de novo achando que não pegou.

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { MOTIVOS_PERDA, brl } from "@/lib/negocios";

export type FaseQuadro = { id: number; nome: string };

export type CardQuadro = {
  id: number;
  titulo: string;
  valor: number | null;
  faseId: number;
  contatoNome: string | null;
  responsavelNome: string | null;
  diasNaFase: number;
  atividadesPendentes: number;
  atividadesAtrasadas: number;
  travadoPor: string | null;
  travadoAte: string | null;
};

// Iniciais para o avatar do responsável — duas letras no máximo.
function iniciais(nome: string | null): string {
  if (!nome) return "—";
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export default function NegociosQuadro({
  fases,
  cards,
  funilId,
  mover,
  criar,
  fechar,
}: {
  fases: FaseQuadro[];
  cards: CardQuadro[];
  funilId: number;
  mover: (negocioId: number, faseId: number) => Promise<void>;
  criar: (formData: FormData) => Promise<void>;
  fechar: (negocioId: number, resultado: string, motivo: string | null) => Promise<void>;
}) {
  const [, iniciar] = useTransition();
  const [otimistas, moverOtimista] = useOptimistic(
    cards,
    (atual: CardQuadro[], { id, faseId }: { id: number; faseId: number }) =>
      atual.map((c) => (c.id === id ? { ...c, faseId, diasNaFase: 0 } : c))
  );
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const [criandoEm, setCriandoEm] = useState<number | null>(null);
  const [fechando, setFechando] = useState<CardQuadro | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  const ehFechado = (faseId: number) =>
    fases.find((f) => f.id === faseId)?.nome.toLowerCase() === "fechado";

  function soltar(faseId: number) {
    const id = arrastando;
    setArrastando(null);
    setAlvo(null);
    if (id == null) return;
    const card = otimistas.find((c) => c.id === id);
    if (!card || card.faseId === faseId) return;

    // Fechar exige desfecho. Sem isso o negócio "some" do funil sem dizer se
    // virou venda ou por que morreu — e o painel do dono fica cego.
    if (ehFechado(faseId)) {
      setFechando(card);
      return;
    }
    iniciar(async () => {
      moverOtimista({ id, faseId });
      await mover(id, faseId);
    });
  }

  function concluir(resultado: "GANHO" | "PERDIDO") {
    if (!fechando) return;
    if (resultado === "PERDIDO" && !motivo) return;
    const id = fechando.id;
    const m = motivo;
    setFechando(null);
    setMotivo(null);
    iniciar(async () => {
      await fechar(id, resultado, m);
    });
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {fases.map((fase) => {
          const daFase = otimistas.filter((c) => c.faseId === fase.id);
          const soma = daFase.reduce((s, c) => s + (c.valor ?? 0), 0);
          const destacado = alvo === fase.id;

          return (
            <section
              key={fase.id}
              onDragOver={(e) => {
                e.preventDefault();
                setAlvo(fase.id);
              }}
              onDragLeave={() => setAlvo((a) => (a === fase.id ? null : a))}
              onDrop={(e) => {
                e.preventDefault();
                soltar(fase.id);
              }}
              className={`w-[268px] shrink-0 rounded-2xl border p-3 transition-colors ${
                destacado
                  ? "border-[#34C46A] bg-[rgba(52,196,106,.05)]"
                  : "border-[#1E222B] bg-[#07080B]"
              }`}
            >
              <header className="mb-3 px-1">
                <p className="m-0 text-[13px] font-medium text-[#F4F5F7]">{fase.nome}</p>
                <div className="mt-1 flex items-center gap-2.5 text-[11.5px] text-[#7A828F]">
                  <span className="tabular-nums">▦ {daFase.length}</span>
                  <span className="tabular-nums">{brl(soma)}</span>
                </div>
              </header>

              <div className="flex min-h-[90px] flex-col gap-2">
                {daFase.map((c) => (
                  <article
                    key={c.id}
                    draggable
                    onDragStart={() => setArrastando(c.id)}
                    onDragEnd={() => {
                      setArrastando(null);
                      setAlvo(null);
                    }}
                    className={`cursor-grab rounded-[14px] border bg-[#12141A] p-3 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition-all active:cursor-grabbing ${
                      arrastando === c.id
                        ? "opacity-40"
                        : "hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,.12)]"
                    }`}
                    style={{
                      // Sem próxima atividade agendada = negócio que vai ser
                      // esquecido. A borda é o único aviso que o corretor vê.
                      borderColor: c.atividadesPendentes === 0 ? "rgba(255,92,122,.45)" : "#1E222B",
                    }}
                    title={c.atividadesPendentes === 0 ? "Sem próxima atividade agendada" : ""}
                  >
                    <Link href={`/negocios/${c.id}`} className="block no-underline">
                      <p className="m-0 text-[13.5px] font-medium leading-tight text-[#F4F5F7]">
                        {c.titulo}
                      </p>
                      {c.contatoNome && (
                        <p className="m-0 mt-0.5 truncate text-[11.5px] text-[#7A828F]">
                          {c.contatoNome}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-3 text-[11.5px] text-[#9AA2AF]">
                        <span className="tabular-nums">
                          {c.valor == null ? (
                            <span className="text-[#7A828F]">Sem valor</span>
                          ) : (
                            brl(c.valor)
                          )}
                        </span>
                        <span className="tabular-nums text-[#7A828F]">
                          ⏱ {c.diasNaFase} {c.diasNaFase === 1 ? "dia" : "dias"}
                        </span>
                      </div>
                    </Link>

                    {c.travadoPor && (
                      <p className="m-0 mt-1.5 inline-flex items-center gap-1 rounded-[7px] border border-[rgba(245,178,61,.35)] bg-[rgba(245,178,61,.09)] px-1.5 py-px text-[10.5px] text-[#F5B23D]">
                        🔒 travado por {c.travadoPor} até {c.travadoAte}
                      </p>
                    )}

                    <div className="mt-2.5 flex items-center gap-1.5 border-t border-[#1A1E26] pt-2">
                      <span
                        className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[rgba(52,196,106,.1)] text-[9.5px] font-semibold text-[#8CF0B0]"
                        title={c.responsavelNome ?? "sem responsável"}
                      >
                        {iniciais(c.responsavelNome)}
                      </span>
                      {/* Atrasada em vermelho: o card tem que gritar o esquecimento. */}
                      <span
                        className={`rounded-[7px] px-1.5 py-0.5 text-[10.5px] tabular-nums ${
                          c.atividadesAtrasadas > 0
                            ? "bg-[rgba(255,92,122,.1)] text-[#FF5C7A]"
                            : c.atividadesPendentes > 0
                              ? "bg-[rgba(52,196,106,.08)] text-[#8CF0B0]"
                              : "bg-[#171B22] text-[#7A828F]"
                        }`}
                        title="atividades pendentes"
                      >
                        ◷ {c.atividadesPendentes}
                      </span>
                      {c.atividadesPendentes === 0 && (
                        <span className="ml-auto text-[10.5px] font-medium text-[#FF5C7A]">
                          sem próxima ação
                        </span>
                      )}
                    </div>
                  </article>
                ))}

                {daFase.length === 0 && (
                  <p className="m-0 rounded-[12px] border border-dashed border-[#2A303B] px-3 py-5 text-center text-[11.5px] text-[#7A828F]">
                    Nenhum resultado encontrado nesta fase
                  </p>
                )}

                {criandoEm === fase.id ? (
                  <form
                    action={async (fd) => {
                      await criar(fd);
                      setCriandoEm(null);
                    }}
                    className="rounded-[14px] border border-[#34C46A] bg-[#12141A] p-2.5"
                  >
                    <input type="hidden" name="funilId" value={funilId} />
                    <input type="hidden" name="faseId" value={fase.id} />
                    <input
                      name="titulo"
                      required
                      autoFocus
                      placeholder="Nome do negócio"
                      className="input-ds !h-9 !text-[12.5px]"
                    />
                    <div className="h-1.5" />
                    <input
                      name="contatoNome"
                      placeholder="Contato (opcional)"
                      className="input-ds !h-9 !text-[12.5px]"
                    />
                    <div className="h-1.5" />
                    <input
                      name="valor"
                      inputMode="decimal"
                      placeholder="Valor (opcional)"
                      className="input-ds !h-9 !text-[12.5px]"
                    />
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="submit"
                        className="flex-1 rounded-[9px] bg-[#34C46A] px-2 py-1.5 text-[12px] font-medium text-[#06210F]"
                      >
                        Adicionar
                      </button>
                      <button
                        type="button"
                        onClick={() => setCriandoEm(null)}
                        className="rounded-[9px] border border-[#2A303B] px-2.5 py-1.5 text-[12px] text-[#9AA2AF]"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCriandoEm(fase.id)}
                    className="rounded-[12px] border border-dashed border-[#2A303B] py-2 text-[12px] text-[#7A828F] transition-colors hover:border-[#34C46A] hover:text-[#8CF0B0]"
                  >
                    ＋ Novo negócio
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Desfecho: ganho ou perda com motivo ── */}
      {fechando && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(0,0,0,.42)] p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setFechando(null);
              setMotivo(null);
            }
          }}
        >
          <div className="w-[460px] max-w-full rounded-[22px] border border-[#1E222B] bg-[#12141A] shadow-[0_28px_70px_-18px_rgba(0,0,0,.3)]">
            <div className="flex items-center justify-between border-b border-[#1E222B] px-5 py-3.5">
              <h3 className="m-0 text-[15px] font-semibold text-[#F4F5F7]">Fechar negócio</h3>
              <button
                onClick={() => {
                  setFechando(null);
                  setMotivo(null);
                }}
                className="grid h-7 w-7 place-items-center rounded-full text-[#7A828F] hover:bg-[#171B22]"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              <p className="m-0 text-[13.5px] font-medium text-[#F4F5F7]">{fechando.titulo}</p>
              <p className="m-0 mt-0.5 text-[12.5px] tabular-nums text-[#9AA2AF]">
                {fechando.valor == null ? "Sem valor" : brl(fechando.valor)}
                {fechando.contatoNome ? ` · ${fechando.contatoNome}` : ""}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => concluir("GANHO")}
                  className="rounded-[16px] border border-[rgba(52,196,106,.35)] bg-[rgba(52,196,106,.07)] px-4 py-4 text-center transition-colors hover:bg-[rgba(52,196,106,.14)]"
                >
                  <p className="m-0 text-[20px]">★</p>
                  <p className="m-0 mt-1 text-[13px] font-semibold text-[#34C46A]">Ganho</p>
                  <p className="m-0 text-[11px] text-[#9AA2AF]">entra no resultado do mês</p>
                </button>
                <div
                  className="rounded-[16px] border px-4 py-4 text-center"
                  style={{
                    borderColor: motivo ? "rgba(255,92,122,.35)" : "#2A303B",
                    background: motivo ? "rgba(255,92,122,.07)" : "transparent",
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
                          ? { borderColor: "#FF5C7A", background: "rgba(255,92,122,.09)", color: "#FF5C7A" }
                          : { borderColor: "#2A303B", color: "#9AA2AF" }
                      }
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setFechando(null);
                    setMotivo(null);
                  }}
                  className="rounded-[10px] px-3.5 py-1.5 text-[12.5px] text-[#9AA2AF] hover:bg-[#171B22]"
                >
                  Cancelar
                </button>
                <button
                  disabled={!motivo}
                  onClick={() => concluir("PERDIDO")}
                  className="rounded-[10px] border border-[rgba(255,92,122,.35)] bg-[rgba(255,92,122,.07)] px-3.5 py-1.5 text-[12.5px] font-medium text-[#FF5C7A] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Registrar perda
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
