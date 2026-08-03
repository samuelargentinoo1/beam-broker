"use client";

// Caixa de registro do negócio: "Nota" (o que eu quero lembrar) e "E-mail"
// (comunicação trocada). São a mesma escrita com destino diferente na linha do
// tempo — por isso uma caixa com duas abas, e não dois formulários.

import { useState } from "react";

export default function NegocioNota({
  negocioId,
  anotar,
}: {
  negocioId: number;
  anotar: (formData: FormData) => Promise<void>;
}) {
  const [aba, setAba] = useState<"nota" | "email">("nota");

  return (
    <div className="rounded-[16px] border border-[#1E222B] bg-[#12141A] p-3.5">
      <div className="mb-3 flex gap-1 border-b border-[#1A1E26]">
        {(
          [
            ["nota", "Nota"],
            ["email", "E-mail registrado"],
          ] as const
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            onClick={() => setAba(chave)}
            className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] transition-colors ${
              aba === chave
                ? "border-[#34C46A] font-medium text-[#8CF0B0]"
                : "border-transparent text-[#7A828F] hover:text-[#9AA2AF]"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <form action={anotar} key={aba}>
        <input type="hidden" name="negocioId" value={negocioId} />
        <input type="hidden" name="aba" value={aba} />
        <textarea
          name="texto"
          required
          rows={3}
          placeholder={
            aba === "nota" ? "Escreva o que aconteceu…" : "Cole ou resuma o e-mail trocado…"
          }
          className="input-ds !h-auto resize-y py-2.5"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            className="rounded-[10px] bg-[#34C46A] px-5 py-1.5 text-[12.5px] font-medium text-[#06210F]"
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
