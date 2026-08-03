"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Foto = { id: number; url: string; ordem: number };

// Carrossel de fotos do imóvel: navegação manual (setas, bolinhas, miniaturas,
// arrastar e teclado) com transição de slide bem suave.
export default function CarrosselFotos({
  fotos,
  codigo,
  removerFoto,
}: {
  fotos: Foto[];
  codigo: string;
  removerFoto: (formData: FormData) => Promise<void>;
}) {
  const [i, setI] = useState(0);
  const total = fotos.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const arraste = useRef<{ x0: number; dx: number } | null>(null);
  const [dragPx, setDragPx] = useState(0);

  const ir = useCallback(
    (n: number) => setI(() => (total ? (n + total) % total : 0)),
    [total]
  );

  useEffect(() => {
    if (i > total - 1) setI(Math.max(0, total - 1));
  }, [total, i]);

  // teclado (quando o carrossel está em foco na página)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") ir(i - 1);
      if (e.key === "ArrowRight") ir(i + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, ir]);

  if (total === 0) return null;

  // arrastar (mouse/touch) para trocar de foto
  function onDown(e: React.PointerEvent) {
    arraste.current = { x0: e.clientX, dx: 0 };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!arraste.current) return;
    arraste.current.dx = e.clientX - arraste.current.x0;
    setDragPx(arraste.current.dx);
  }
  function onUp() {
    if (!arraste.current) return;
    const dx = arraste.current.dx;
    const largura = trackRef.current?.clientWidth ?? 1;
    if (Math.abs(dx) > largura * 0.15) ir(dx < 0 ? i + 1 : i - 1);
    arraste.current = null;
    setDragPx(0);
  }

  return (
    <div className="mb-4 select-none">
      {/* palco */}
      <div className="relative rounded-[22px] overflow-hidden border border-[#1E222B] bg-[#0B0F14] aspect-[16/10] shadow-sm">
        <div
          ref={trackRef}
          className="flex h-full touch-pan-y"
          style={{
            transform: `translateX(calc(${-i * 100}% + ${dragPx}px))`,
            transition: arraste.current ? "none" : "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {fotos.map((f, idx) => (
            <div key={f.id} className="min-w-full h-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt={`Foto ${idx + 1} do ${codigo}`}
                draggable={false}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>

        {/* contador */}
        <div className="absolute top-3 left-3 text-[11px] font-medium text-white bg-black/45 backdrop-blur px-2.5 py-1 rounded-full">
          {i + 1} / {total}
        </div>

        {/* remover a foto atual */}
        <form action={removerFoto} className="absolute top-3 right-3">
          <input type="hidden" name="fotoId" value={fotos[i]?.id} />
          <button
            type="submit"
            title="Remover esta foto"
            className="h-8 w-8 rounded-full bg-black/45 hover:bg-red-600/80 backdrop-blur text-white text-[15px] leading-none cursor-pointer transition-colors"
          >
            ×
          </button>
        </form>

        {/* setas */}
        {total > 1 && (
          <>
            <button
              onClick={() => ir(i - 1)}
              aria-label="Foto anterior"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-[#12141A]/85 hover:bg-[#12141A] text-[#F4F5F7] shadow-md backdrop-blur flex items-center justify-center cursor-pointer transition-all hover:scale-105"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button
              onClick={() => ir(i + 1)}
              aria-label="Próxima foto"
              className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-[#12141A]/85 hover:bg-[#12141A] text-[#F4F5F7] shadow-md backdrop-blur flex items-center justify-center cursor-pointer transition-all hover:scale-105"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </>
        )}

        {/* bolinhas */}
        {total > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {fotos.map((f, idx) => (
              <button
                key={f.id}
                onClick={() => ir(idx)}
                aria-label={`Ir para a foto ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  idx === i ? "w-5 bg-[#12141A]" : "w-1.5 bg-[#12141A]/50 hover:bg-[#12141A]/80"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* miniaturas */}
      {total > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {fotos.map((f, idx) => (
            <button
              key={f.id}
              onClick={() => ir(idx)}
              className={`shrink-0 h-14 w-20 rounded-lg overflow-hidden border transition-all cursor-pointer ${
                idx === i ? "border-[#34C46A] ring-2 ring-[#34C46A]/30" : "border-[#1E222B] opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="" draggable={false} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
