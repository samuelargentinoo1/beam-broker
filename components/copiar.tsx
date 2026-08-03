"use client";

import { useState } from "react";

export function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
      className="text-xs font-medium text-[#34C46A] border border-[rgba(52,196,106,.35)] rounded px-2 py-1 hover:bg-[rgba(52,196,106,.06)] cursor-pointer"
    >
      {copiado ? "✓ Copiado" : rotulo}
    </button>
  );
}
