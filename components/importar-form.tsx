"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importarCarteira } from "@/lib/importar";

type Resultado = { ok: boolean; criados: number; fotosCriadas?: number; erros: string[] };

export default function ImportarForm() {
  const [res, setRes] = useState<Resultado | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      action={(fd) =>
        start(async () => {
          const r = await importarCarteira(fd);
          setRes(r as Resultado);
          router.refresh();
        })
      }
      className="space-y-4"
    >
      <div>
        <label className="block text-[13px] font-medium text-[#C9CFD8] mb-1.5">Arquivo CSV da planilha</label>
        <input
          type="file"
          name="arquivo"
          accept=".csv,text/csv"
          className="block w-full text-sm text-[#C9CFD8] file:mr-3 file:rounded-full file:border-0 file:bg-[#34C46A] file:px-4 file:py-2 file:text-[#06210F] file:cursor-pointer file:text-[13px] file:font-medium hover:file:bg-[#8CF0B0]"
        />
        <p className="text-[11px] text-[#7A828F] mt-1.5">
          Exporte sua planilha (Excel/Google Sheets) como <b>CSV</b>. Aceita separador vírgula ou ponto-e-vírgula.
        </p>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-[#7A828F]">
        <span className="h-px flex-1 bg-[#1E222B]" /> ou cole o conteúdo <span className="h-px flex-1 bg-[#1E222B]" />
      </div>

      <textarea
        name="csv"
        rows={5}
        placeholder="proprietario,cpf,telefone,pix,tipo,endereco,bairro,cidade,uf,finalidade,aluguel,venda,fotos"
        className="w-full rounded-xl border border-[#1E222B] px-3 py-2.5 text-[13px] font-mono focus:outline-none focus:border-[rgba(52,196,106,.45)]"
      />

      <button
        type="submit"
        disabled={pending}
        className="bg-[#34C46A] text-[#06210F] text-[13.5px] font-[520] px-5 py-2.5 rounded-full hover:bg-[#8CF0B0] disabled:opacity-50 cursor-pointer transition-colors"
      >
        {pending ? "Importando…" : "Importar carteira"}
      </button>

      {res && (
        <div
          className={`rounded-xl px-4 py-3 text-[13px] border ${
            res.ok
              ? "text-[#34C46A] bg-[rgba(52,196,106,.08)] border-[rgba(52,196,106,.25)]"
              : "text-[#FF5C7A] bg-[rgba(255,92,122,.06)] border-[rgba(255,92,122,.25)]"
          }`}
        >
          <p className="font-semibold">
            {res.ok
              ? `✓ ${res.criados} imóvel(is) importado(s)${res.fotosCriadas ? ` · ${res.fotosCriadas} foto(s)` : ""}.`
              : "Não foi possível importar."}
          </p>
          {res.erros?.length > 0 && (
            <ul className="mt-1.5 list-disc pl-5 space-y-0.5 text-[#F5B23D]">
              {res.erros.slice(0, 12).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {res.erros.length > 12 && <li>… e mais {res.erros.length - 12} aviso(s).</li>}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
