"use client";

import { useRef, useState } from "react";

// Único controle de voz que sobrou na tela: ouvir. Não há voz para escolher nem
// modelo para selecionar — o sistema pergunta à conta MiniMax quais vozes
// existem e usa a padrão em português. Escolher voice_id à mão era a origem do
// problema: um ID errado a MiniMax recusa sem dizer por quê.
export default function TestarVoz() {
  const [tocando, setTocando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function ouvir() {
    if (tocando) {
      audioRef.current?.pause();
      setTocando(false);
      return;
    }
    setTocando(true);
    setErro(null);
    try {
      const res = await fetch("/api/voz/preview");
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { erro?: string };
        setErro(d.erro ?? "Não consegui gerar a amostra.");
        setTocando(false);
        return;
      }
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      audioRef.current = audio;
      audio.onended = () => setTocando(false);
      audio.onerror = () => setTocando(false);
      await audio.play();
    } catch {
      setErro("Falha ao tocar a amostra.");
      setTocando(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={ouvir}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#34C46A] border border-[rgba(52,196,106,.3)] rounded-full px-3 py-1.5 hover:bg-[rgba(52,196,106,.06)] cursor-pointer transition-colors"
      >
        {tocando ? "■ parar" : "▶ ouvir a voz da Carol"}
      </button>
      {erro && <p className="text-[11px] text-[#F5B23D] mt-1">{erro}</p>}
    </div>
  );
}
