"use client";

// Linha do tempo do negócio. O filtro é client-side de propósito: os eventos já
// vieram todos no HTML e trocar de aba não deve custar ida ao servidor.

import { useState } from "react";
import { FILTROS_TIMELINE, type ChaveFiltro } from "@/lib/negocios";

export type EventoTimeline = {
  id: number;
  tipo: string;
  titulo: string;
  detalhe: string | null;
  autorNome: string | null;
  quando: string; // já formatado no servidor (evita divergir de fuso no cliente)
};

const GLIFO: Record<string, { icone: string; cor: string; fundo: string }> = {
  NEGOCIO_CRIADO: { icone: "▦", cor: "#8CF0B0", fundo: "rgba(52,196,106,.1)" },
  FASE_ALTERADA: { icone: "◉", cor: "#8CF0B0", fundo: "rgba(52,196,106,.1)" },
  NOTA: { icone: "✎", cor: "#9AA2AF", fundo: "#171B22" },
  ATIVIDADE_CONCLUIDA: { icone: "✓", cor: "#34C46A", fundo: "rgba(52,196,106,.1)" },
  EMAIL: { icone: "✉", cor: "#5B8DFF", fundo: "rgba(91,141,255,.1)" },
  GANHO: { icone: "★", cor: "#34C46A", fundo: "rgba(52,196,106,.1)" },
  PERDIDO: { icone: "✕", cor: "#FF5C7A", fundo: "rgba(255,92,122,.1)" },
};

const ABAS: { chave: ChaveFiltro; rotulo: string }[] = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "notas", rotulo: "Notas" },
  { chave: "atividades", rotulo: "Atividades" },
];

export default function NegocioTimeline({ eventos }: { eventos: EventoTimeline[] }) {
  const [aba, setAba] = useState<ChaveFiltro>("todas");

  const permitidos = FILTROS_TIMELINE[aba];
  const visiveis = permitidos == null ? eventos : eventos.filter((e) => permitidos.includes(e.tipo as never));

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <p className="m-0 text-[13px] font-medium text-[#F4F5F7]">Linha do tempo</p>
      </div>

      <div className="mb-3 flex gap-1 border-b border-[#1A1E26]">
        {ABAS.map((a) => (
          <button
            key={a.chave}
            type="button"
            onClick={() => setAba(a.chave)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-[12px] transition-colors ${
              aba === a.chave
                ? "border-[#34C46A] font-medium text-[#8CF0B0]"
                : "border-transparent text-[#7A828F] hover:text-[#9AA2AF]"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <p className="m-0 rounded-[12px] border border-dashed border-[#2A303B] px-3 py-6 text-center text-[12px] text-[#7A828F]">
          Nada registrado neste filtro ainda.
        </p>
      ) : (
        <ol className="m-0 list-none space-y-2 p-0">
          {visiveis.map((e) => {
            const g = GLIFO[e.tipo] ?? GLIFO.NOTA!;
            return (
              <li
                key={e.id}
                className="rounded-[14px] border border-[#1E222B] bg-[#12141A] p-3"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11px]"
                    style={{ background: g.fundo, color: g.cor }}
                    aria-hidden
                  >
                    {g.icone}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="m-0 text-[12.5px] font-medium text-[#F4F5F7]">{e.titulo}</p>
                      <span className="shrink-0 text-[11px] text-[#7A828F]">{e.quando}</span>
                    </div>
                    {e.detalhe && (
                      <p className="m-0 mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-[#9AA2AF]">
                        {e.detalhe}
                      </p>
                    )}
                    {e.autorNome && (
                      <p className="m-0 mt-1.5 text-[11px] text-[#7A828F]">por {e.autorNome}</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
