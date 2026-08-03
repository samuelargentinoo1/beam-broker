"use client";

// "Nova atividade" — três campos e só: nome, quando e responsável.
//
// O formulário longo do CRM de referência (tipo, duração, dia inteiro,
// observações, relacionados, concluída) é o motivo de ninguém agendar nada.
// Aqui o caminho curto é o padrão; o tipo fica num seletor discreto porque a
// linha do tempo precisa dele para rotular a atividade.

import { useEffect, useRef, useState } from "react";
import { ROTULO_ATIVIDADE, TIPOS_ATIVIDADE } from "@/lib/negocios";

export default function NovaAtividadeModal({
  negocioId,
  responsaveis,
  responsavelPadrao,
  criar,
}: {
  negocioId: number;
  responsaveis: { id: number; nome: string }[];
  responsavelPadrao: number;
  criar: (formData: FormData) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);

  // <dialog> nativo: dá foco preso, Esc e fundo escurecido sem biblioteca.
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  const hoje = new Date();
  const dataPadrao = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(
    hoje.getDate()
  ).padStart(2, "0")}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-[12.5px] font-medium text-[#8CF0B0] hover:underline"
      >
        Criar nova atividade
      </button>

      <dialog
        ref={dialogo}
        onClose={() => setAberto(false)}
        onClick={(e) => {
          // Clique fora do painel fecha — o alvo só é o <dialog> quando o
          // clique caiu no backdrop.
          if (e.target === dialogo.current) setAberto(false);
        }}
        className="m-auto w-[min(440px,92vw)] rounded-[20px] border border-[#1E222B] p-0 shadow-[0_24px_60px_-12px_rgba(0,0,0,.24)] backdrop:bg-[rgba(0,0,0,.32)]"
      >
        <form action={async (fd) => { await criar(fd); setAberto(false); }} className="p-6">
          <input type="hidden" name="negocioId" value={negocioId} />

          <div className="mb-5 flex items-center justify-between">
            <h2 className="m-0 text-[16px] font-semibold text-[#F4F5F7]">Nova atividade</h2>
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="grid h-7 w-7 place-items-center rounded-full text-[15px] text-[#7A828F] hover:bg-[#171B22]"
            >
              ✕
            </button>
          </div>

          <label className="block">
            <span className="label-caps mb-1.5 block !text-[9px] tracking-[.12em] text-[#9AA2AF]">
              nome da tarefa
            </span>
            <input
              name="titulo"
              required
              autoFocus
              placeholder="Ligar para confirmar a visita"
              className="input-ds"
            />
          </label>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label-caps mb-1.5 block !text-[9px] tracking-[.12em] text-[#9AA2AF]">
                data
              </span>
              <input type="date" name="data" required defaultValue={dataPadrao} className="input-ds" />
            </label>
            <label className="block">
              <span className="label-caps mb-1.5 block !text-[9px] tracking-[.12em] text-[#9AA2AF]">
                horário
              </span>
              <input type="time" name="hora" required defaultValue="09:00" className="input-ds" />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="label-caps mb-1.5 block !text-[9px] tracking-[.12em] text-[#9AA2AF]">
              responsável
            </span>
            <select name="responsavelId" defaultValue={responsavelPadrao} className="input-ds">
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block">
            <span className="label-caps mb-1.5 block !text-[9px] tracking-[.12em] text-[#9AA2AF]">
              tipo
            </span>
            <select name="tipo" defaultValue="TAREFA" className="input-ds">
              {TIPOS_ATIVIDADE.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_ATIVIDADE[t]}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded-[10px] border border-[#2A303B] px-4 py-2 text-[13px] text-[#9AA2AF]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-[10px] bg-[#34C46A] px-5 py-2 text-[13px] font-medium text-[#06210F]"
            >
              Salvar
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
