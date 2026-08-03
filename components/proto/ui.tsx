"use client";

// UI compartilhada das telas de gestão comercial, na identidade do sistema:
// fundo #07080B, cartão branco com borda #1E222B, azul #34C46A.
//
// Estas telas são PROTÓTIPO: os dados vivem em memória (lib/proto), não no
// banco. Por isso tudo aqui é client component com estado local.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Contato } from "@/lib/proto/tipos";
import { corDoScore } from "@/lib/proto/contatos";

// Tons sobre fundo escuro. Os fundos são mais opacos que na versão clara: um
// tingimento de 8% some no #07080B, enquanto no branco já era visível.
//
// "azul" usa o azul da Beam (--blue #1D5CF5), e não o verde: verde é a cor da
// marca E do sucesso — se informação também fosse verde, o quadro inteiro vira
// uma cor só e nada se destaca.
export const TOM = {
  verde: { texto: "#34C46A", fundo: "rgba(52,196,106,.14)", borda: "rgba(52,196,106,.38)" },
  ambar: { texto: "#F5B23D", fundo: "rgba(245,178,61,.14)", borda: "rgba(245,178,61,.38)" },
  vermelho: { texto: "#FF5C7A", fundo: "rgba(255,92,122,.14)", borda: "rgba(255,92,122,.38)" },
  azul: { texto: "#7FA6FF", fundo: "rgba(29,92,245,.18)", borda: "rgba(29,92,245,.45)" },
  roxo: { texto: "#B98CFF", fundo: "rgba(185,140,255,.14)", borda: "rgba(185,140,255,.38)" },
  neutro: { texto: "#9AA2AF", fundo: "#171B22", borda: "#2A303B" },
} as const;

export type TomChave = keyof typeof TOM;

export function Inicial({ c, tam = 38 }: { c: Contato; tam?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{ width: tam, height: tam, background: `${c.cor}1A`, color: c.cor, fontSize: tam * 0.34 }}
    >
      {c.iniciais}
    </span>
  );
}

export function Avatar({ iniciais, cor, tam = 22 }: { iniciais: string; cor: string; tam?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{ width: tam, height: tam, background: `${cor}1A`, color: cor, fontSize: tam * 0.38 }}
      title={iniciais}
    >
      {iniciais}
    </span>
  );
}

// O score só aparece junto do "porquê". Clicar abre a conta inteira — sem isso
// o corretor não confia no número.
export function Score({ c, compacto = false }: { c: Contato; compacto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const t = TOM[corDoScore(c.score) as TomChave];

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  return (
    <div className="relative inline-flex" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums transition-opacity hover:opacity-75"
        style={{ background: t.fundo, borderColor: t.borda, color: t.texto }}
        title="Ver como o score foi calculado"
      >
        {compacto ? c.score : `score ${c.score}`}
        <span className="opacity-55">ⓘ</span>
      </button>

      {aberto && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-[330px] rounded-[16px] border border-[#2A303B] bg-[#12141A] p-3.5 shadow-[0_18px_44px_-14px_rgba(0,0,0,.22)]">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[12px] text-[#9AA2AF]">Como chegamos em {c.score}</span>
            <span className="text-[17px] font-semibold tabular-nums" style={{ color: t.texto }}>
              {c.score}
            </span>
          </div>
          <ul className="m-0 list-none space-y-1 p-0">
            {c.fatores.map((f) => (
              <li key={f.rotulo} className="flex items-start justify-between gap-3 text-[12px]">
                <span className="text-[#9AA2AF]">{f.rotulo}</span>
                <span
                  className="shrink-0 font-medium tabular-nums"
                  style={{ color: f.pontos >= 0 ? "#34C46A" : "#FF5C7A" }}
                >
                  {f.pontos >= 0 ? "+" : ""}
                  {f.pontos}
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2.5 border-t border-[#1E222B] pt-2 text-[11px] leading-relaxed text-[#7A828F]">
            O score é a soma dos fatores acima, limitada entre 0 e 100. Recalculado a cada interação.
          </p>
        </div>
      )}
    </div>
  );
}

export function Chip({
  children,
  tom = "neutro",
  onClick,
  ativo,
}: {
  children: ReactNode;
  tom?: TomChave;
  onClick?: () => void;
  ativo?: boolean;
}) {
  const t = ativo ? TOM.azul : TOM[tom];
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-[3px] text-[11.5px] ${
        onClick ? "cursor-pointer transition-opacity hover:opacity-75" : ""
      }`}
      style={{ background: t.fundo, borderColor: ativo ? "#34C46A" : t.borda, color: t.texto }}
    >
      {children}
    </Tag>
  );
}

export function Botao({
  children,
  onClick,
  variante = "normal",
  pequeno = false,
  desabilitado = false,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: "normal" | "primario" | "perigo" | "sucesso" | "fantasma";
  pequeno?: boolean;
  desabilitado?: boolean;
  title?: string;
}) {
  const v: Record<string, string> = {
    normal: "border-[#2A303B] bg-[#12141A] text-[#C9CFD8] hover:border-[#34C46A] hover:text-[#8CF0B0]",
    primario:
      "border-[#34C46A] bg-gradient-to-b from-[#6FE39A] to-[#34C46A] text-[#06210F] shadow-[0_6px_16px_-6px_rgba(52,196,106,.5),inset_0_1px_1px_rgba(255,255,255,.45)] hover:from-[#85EFAB] hover:to-[#45D479]",
    perigo: "border-[rgba(255,92,122,.35)] bg-[rgba(255,92,122,.07)] text-[#FF5C7A] hover:bg-[rgba(255,92,122,.14)]",
    sucesso: "border-[rgba(52,196,106,.35)] bg-[rgba(52,196,106,.07)] text-[#34C46A] hover:bg-[rgba(52,196,106,.14)]",
    fantasma: "border-transparent text-[#9AA2AF] hover:bg-[#171B22] hover:text-[#C9CFD8]",
  };
  return (
    <button
      type="button"
      title={title}
      disabled={desabilitado}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[10px] border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        pequeno ? "px-2.5 py-1 text-[12px]" : "px-3.5 py-1.5 text-[12.5px]"
      } ${v[variante]}`}
    >
      {children}
    </button>
  );
}

export function Modal({
  aberto,
  titulo,
  onFechar,
  children,
  largura = 480,
}: {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  largura?: number;
}) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(0,0,0,.42)] p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div
        className="max-h-[88vh] overflow-y-auto rounded-[22px] border border-[#1E222B] bg-[#12141A] shadow-[0_28px_70px_-18px_rgba(0,0,0,.3)]"
        style={{ width: largura, maxWidth: "100%" }}
      >
        <div className="flex items-center justify-between border-b border-[#1E222B] px-5 py-3.5">
          <h3 className="m-0 text-[15px] font-semibold text-[#F4F5F7]">{titulo}</h3>
          <button
            onClick={onFechar}
            className="grid h-7 w-7 place-items-center rounded-full text-[#7A828F] hover:bg-[#171B22] hover:text-[#C9CFD8]"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Bloco({
  titulo,
  acao,
  children,
  densa = false,
}: {
  titulo?: string;
  acao?: ReactNode;
  children: ReactNode;
  densa?: boolean;
}) {
  return (
    <section className="rounded-[18px] border border-[#1E222B] bg-[#12141A]">
      {titulo && (
        <header className="flex items-center justify-between gap-3 border-b border-[#1E222B] px-4 py-2.5">
          <h2 className="m-0 text-[13px] font-semibold text-[#F4F5F7]">{titulo}</h2>
          {acao}
        </header>
      )}
      <div className={densa ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function Aviso({ children, tom = "verde" }: { children: ReactNode; tom?: TomChave }) {
  const t = TOM[tom];
  return (
    <div
      className="mb-3 rounded-[12px] border px-3.5 py-2 text-[12.5px]"
      style={{ background: t.fundo, borderColor: t.borda, color: t.texto }}
    >
      {children}
    </div>
  );
}

export function Nada({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-[14px] border border-dashed border-[#2A303B] px-4 py-8 text-center text-[12.5px] text-[#7A828F]">
      {children}
    </p>
  );
}

// Cabeçalho das telas de gestão: alinhado à esquerda e denso, diferente do
// PageHeader centrado do resto do sistema — estas telas são de trabalho diário,
// não de consulta pontual.
export function TopoTela({
  titulo,
  legenda,
  direita,
}: {
  titulo: string;
  legenda?: string;
  direita?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="m-0 text-[21px] font-semibold tracking-tight text-[#F4F5F7]">{titulo}</h1>
        {legenda && <span className="text-[12.5px] text-[#7A828F]">{legenda}</span>}
      </div>
      {direita}
    </div>
  );
}
