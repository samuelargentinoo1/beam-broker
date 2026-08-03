"use client";

import { useMemo, useState } from "react";
import { IMOVEIS, brl, mil, saudeAnuncio } from "@/lib/proto/base";
import type { Imovel } from "@/lib/proto/tipos";
import { Botao, Modal, TopoTela } from "./ui";

const FILTROS = [
  { id: "disponiveis", rotulo: "Disponíveis" },
  { id: "encalhados", rotulo: "Encalhados" },
  { id: "saude", rotulo: "Saúde baixa" },
  { id: "autorizacao", rotulo: "Autorização vencendo" },
  { id: "a", rotulo: "Curva A" },
] as const;

// O encalhado com argumento pronto — é o card que gera a ligação para o dono.
const ENCALHADO = {
  codigo: "AP-0771",
  titulo: "Apto Jd. Aclimação",
  dias: 112,
  views: 340,
  contatos: 3,
  visitas: 0,
  faixaMin: 410000,
  faixaMax: 465000,
  atual: 520000,
  sugerido: 473000,
};

export default function Estoque() {
  const [filtro, setFiltro] = useState<string | null>(null);
  const [aba, setAba] = useState<"carteira" | "lancamento">("carteira");
  const [detalhe, setDetalhe] = useState<Imovel | null>(null);
  const [argumento, setArgumento] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const lista = useMemo(() => {
    const base = IMOVEIS;
    if (!filtro) return base;
    if (filtro === "disponiveis") return base.filter((i) => i.status === "DISPONIVEL");
    if (filtro === "encalhados") return base.filter((i) => i.diasEstoque > 90);
    if (filtro === "saude") return base.filter((i) => saudeAnuncio(i).score < 70);
    if (filtro === "autorizacao") return base.filter((i) => i.autorizacaoVence);
    return base.filter((i) => i.curva === "A");
  }, [filtro]);

  const encalhados = IMOVEIS.filter((i) => i.diasEstoque > 90).length;
  const semSaude = IMOVEIS.filter((i) => saudeAnuncio(i).score < 70).length;

  return (
    <div className="space-y-4 pb-12">
      <TopoTela
        titulo="Estoque"
        legenda={`${IMOVEIS.length} imóveis · ${encalhados} encalhados · ${semSaude} abaixo do mínimo para publicar`}
        direita={
          <div className="flex gap-1.5">
            {(["carteira", "lancamento"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setAba(v)}
                className={`rounded-[10px] border px-3 py-1.5 text-[12.5px] transition-colors ${
                  aba === v
                    ? "border-[#34C46A] bg-[rgba(52,196,106,.08)] font-medium text-[#8CF0B0]"
                    : "border-[#2A303B] bg-[#12141A] text-[#9AA2AF] hover:border-[#34C46A]"
                }`}
              >
                {v === "carteira" ? "Carteira" : "Lançamento"}
              </button>
            ))}
          </div>
        }
      />

      {aviso && (
        <div className="rounded-[12px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.08)] px-3.5 py-2 text-[12.5px] text-[#34C46A]">
          {aviso}
        </div>
      )}

      {aba === "carteira" ? (
        <>
          {/* ── Alerta de encalhado com argumento pronto ── */}
          <section className="rounded-[18px] border border-[rgba(255,92,122,.3)] bg-[rgba(255,92,122,.04)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-[13px] font-semibold text-[#F4F5F7]">
                  {ENCALHADO.titulo} — {ENCALHADO.dias} dias em estoque
                </p>
                <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-[#9AA2AF]">
                  {ENCALHADO.views} visualizações, {ENCALHADO.contatos} contatos,{" "}
                  <b className="text-[#FF5C7A]">{ENCALHADO.visitas} visitas</b>. Imóveis comparáveis no
                  bairro (3 quartos, 90–110m²) estão entre{" "}
                  <b className="text-[#F4F5F7]">{brl(ENCALHADO.faixaMin)}</b> e{" "}
                  <b className="text-[#F4F5F7]">{brl(ENCALHADO.faixaMax)}</b>. Este está a{" "}
                  <b className="text-[#FF5C7A]">{brl(ENCALHADO.atual)}</b>.
                </p>
                <p className="m-0 mt-1.5 text-[12.5px] font-medium text-[#34C46A]">
                  Sugestão: ajuste de{" "}
                  {Math.round((1 - ENCALHADO.sugerido / ENCALHADO.atual) * 100)}% →{" "}
                  {brl(ENCALHADO.sugerido)}
                </p>
              </div>
              <Botao variante="primario" onClick={() => setArgumento(true)}>
                Enviar argumento para o proprietário
              </Botao>
            </div>
          </section>

          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro((x) => (x === f.id ? null : f.id))}
                className="rounded-[10px] border px-3 py-1.5 text-[12.5px] transition-colors"
                style={
                  filtro === f.id
                    ? { borderColor: "#34C46A", background: "rgba(52,196,106,.08)", color: "#8CF0B0" }
                    : { borderColor: "#2A303B", background: "#12141A", color: "#9AA2AF" }
                }
              >
                {f.rotulo}
              </button>
            ))}
            {filtro && (
              <span className="self-center text-[12px] text-[#7A828F]">
                {lista.length} de {IMOVEIS.length}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {lista.map((im) => {
              const s = saudeAnuncio(im);
              const tom = s.score >= 80 ? "#34C46A" : s.score >= 70 ? "#F5B23D" : "#FF5C7A";
              return (
                <article
                  key={im.id}
                  className="overflow-hidden rounded-[16px] border border-[#1E222B] bg-[#12141A] transition-shadow hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,.18)]"
                >
                  <div className="relative h-[110px]" style={{ background: im.cor }}>
                    <button
                      onClick={() => setDetalhe(im)}
                      className="absolute right-2 top-2 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums backdrop-blur"
                      style={{ borderColor: tom, background: "rgba(7,8,11,.93)", color: tom }}
                      title="Ver o que falta no anúncio"
                    >
                      saúde {s.score}
                    </button>
                    {im.diasEstoque > 90 && (
                      <span className="absolute left-2 top-2 rounded bg-[rgba(255,92,122,.92)] px-1.5 py-0.5 text-[10px] font-medium text-[#2A0710]">
                        encalhado
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-medium text-[#F4F5F7]">{im.codigo}</span>
                      <span className="text-[10.5px] text-[#7A828F]">curva {im.curva}</span>
                    </div>
                    <p className="m-0 mt-0.5 truncate text-[11.5px] text-[#9AA2AF]">
                      {im.tipo} {im.quartos}q · {im.area}m² · {im.bairro}
                    </p>
                    <p className="m-0 mt-1 text-[13px] font-semibold tabular-nums text-[#F4F5F7]">
                      {im.finalidade === "VENDA" ? mil(im.preco) : `${brl(im.preco)}/mês`}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#7A828F]">
                      <span className="tabular-nums">{im.diasEstoque}d em estoque</span>
                      {im.autorizacaoVence && (
                        <span className="text-[#F5B23D]">autoriz. {im.autorizacaoVence}</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <EspelhoVendas />
      )}

      {/* ── Saúde do anúncio: a conta aberta ── */}
      <Modal
        aberto={!!detalhe}
        titulo={`Saúde do anúncio — ${detalhe?.codigo ?? ""}`}
        onFechar={() => setDetalhe(null)}
        largura={440}
      >
        {detalhe &&
          (() => {
            const s = saudeAnuncio(detalhe);
            return (
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12.5px] text-[#9AA2AF]">Score do anúncio</span>
                  <span
                    className="text-[26px] font-semibold tabular-nums"
                    style={{ color: s.publicavel ? "#34C46A" : "#FF5C7A" }}
                  >
                    {s.score}
                    <span className="text-[14px] text-[#7A828F]">/100</span>
                  </span>
                </div>

                {s.faltas.length === 0 ? (
                  <p className="m-0 mt-3 text-[12.5px] text-[#34C46A]">
                    Anúncio completo — nada pendente.
                  </p>
                ) : (
                  <ul className="m-0 mt-3 list-none space-y-1 p-0">
                    {s.faltas.map((f) => (
                      <li key={f.rotulo} className="flex items-start justify-between gap-3 text-[12.5px]">
                        <span className="text-[#9AA2AF]">{f.rotulo}</span>
                        <span className="shrink-0 font-medium tabular-nums text-[#FF5C7A]">
                          {f.pontos}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="m-0 mt-3 border-t border-[#1E222B] pt-2.5 text-[12px] text-[#7A828F]">
                  Mínimo para publicar: <b className="text-[#C9CFD8]">70</b>
                </p>

                <div className="mt-4 flex justify-end gap-2">
                  <Botao variante="fantasma" onClick={() => setDetalhe(null)}>
                    Fechar
                  </Botao>
                  <Botao
                    variante="primario"
                    desabilitado={!s.publicavel}
                    title={s.publicavel ? "" : "Resolva as pendências acima para publicar"}
                    onClick={() => {
                      setAviso(`${detalhe.codigo} publicado nos portais.`);
                      setDetalhe(null);
                      setTimeout(() => setAviso(null), 3000);
                    }}
                  >
                    {s.publicavel ? "Publicar nos portais" : "Publicar (bloqueado)"}
                  </Botao>
                </div>
              </div>
            );
          })()}
      </Modal>

      <Modal
        aberto={argumento}
        titulo="Argumento de ajuste de preço"
        onFechar={() => setArgumento(false)}
        largura={520}
      >
        <div className="rounded-[16px] border border-[#1E222B] bg-[#07080B] p-3.5 text-[12.5px] leading-relaxed text-[#9AA2AF]">
          <p className="m-0">Olá! Aqui é a Horizonte Imóveis 🙂</p>
          <p className="m-0 mt-2">
            Seu <b className="text-[#F4F5F7]">{ENCALHADO.titulo}</b> está há{" "}
            <b className="text-[#F4F5F7]">{ENCALHADO.dias} dias</b> anunciado. Nesse período teve{" "}
            {ENCALHADO.views} visualizações, {ENCALHADO.contatos} contatos e{" "}
            <b className="text-[#F4F5F7]">nenhuma visita</b>.
          </p>
          <p className="m-0 mt-2">
            Imóveis parecidos no bairro (3 quartos, 90–110m²) estão anunciados entre{" "}
            {brl(ENCALHADO.faixaMin)} e {brl(ENCALHADO.faixaMax)}. O seu está a{" "}
            {brl(ENCALHADO.atual)} — a diferença explica a ausência de visitas.
          </p>
          <p className="m-0 mt-2">
            Sugerimos ajustar para <b className="text-[#F4F5F7]">{brl(ENCALHADO.sugerido)}</b>.
            Podemos conversar hoje?
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Botao variante="fantasma" onClick={() => setArgumento(false)}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            onClick={() => {
              setArgumento(false);
              setAviso("Argumento enviado ao proprietário do AP-0771.");
              setTimeout(() => setAviso(null), 3000);
            }}
          >
            Enviar pelo WhatsApp
          </Botao>
        </div>
      </Modal>
    </div>
  );
}

// ── Espelho de vendas do lançamento: grade por andar ──
function EspelhoVendas() {
  const andares = 12;
  const porAndar = 4;
  const [sel, setSel] = useState<string | null>(null);

  const status = (a: number, u: number) => {
    const n = (a * 7 + u * 3) % 10;
    return n < 4 ? "disponivel" : n < 7 ? "reservada" : "vendida";
  };
  const TOM: Record<string, { fundo: string; borda: string; cor: string; rotulo: string }> = {
    disponivel: { fundo: "#12141A", borda: "#2A303B", cor: "#C9CFD8", rotulo: "disponível" },
    reservada: { fundo: "rgba(245,178,61,.1)", borda: "rgba(245,178,61,.35)", cor: "#F5B23D", rotulo: "reservada" },
    vendida: { fundo: "rgba(52,196,106,.1)", borda: "rgba(52,196,106,.35)", cor: "#34C46A", rotulo: "vendida" },
  };

  const todas = Array.from({ length: andares }, (_, a) =>
    Array.from({ length: porAndar }, (_, u) => status(a, u))
  ).flat();
  const contar = (s: string) => todas.filter((x) => x === s).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-[12.5px]">
        <span className="text-[13px] font-semibold text-[#F4F5F7]">Residencial Aurora</span>
        {(["disponivel", "reservada", "vendida"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[#9AA2AF]">
            <span
              className="h-3 w-3 rounded-[3px] border"
              style={{ background: TOM[s]!.fundo, borderColor: TOM[s]!.borda }}
            />
            {TOM[s]!.rotulo} <b className="tabular-nums text-[#F4F5F7]">{contar(s)}</b>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-[#1E222B] bg-[#12141A] p-4">
        <div className="space-y-1.5">
          {Array.from({ length: andares }, (_, i) => andares - 1 - i).map((a) => (
            <div key={a} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-[#7A828F]">
                {a + 1}º and.
              </span>
              <div className="flex gap-1.5">
                {Array.from({ length: porAndar }, (_, u) => {
                  const s = status(a, u);
                  const id = `${a + 1}0${u + 1}`;
                  const t = TOM[s]!;
                  return (
                    <button
                      key={u}
                      onClick={() => setSel(sel === id ? null : id)}
                      className="h-9 w-[74px] rounded-[8px] border text-[11.5px] font-medium tabular-nums transition-transform hover:scale-105"
                      style={{
                        background: t.fundo,
                        borderColor: sel === id ? "#34C46A" : t.borda,
                        color: t.cor,
                        outline: sel === id ? "2px solid rgba(52,196,106,.25)" : "none",
                      }}
                      title={`Unidade ${id} — ${t.rotulo}`}
                    >
                      {id}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {sel && (
        <div className="rounded-[16px] border border-[#1E222B] bg-[#12141A] p-4">
          <p className="m-0 text-[13px] font-semibold text-[#F4F5F7]">Unidade {sel}</p>
          <p className="m-0 mt-1 text-[12.5px] text-[#9AA2AF]">
            3 quartos · 78m² · 1 vaga · {brl(389000 + Number(sel.slice(0, -2)) * 8000)} · entrega em
            12/2027
          </p>
        </div>
      )}
    </div>
  );
}
