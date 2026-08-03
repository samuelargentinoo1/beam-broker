"use client";

import { useRef, useState } from "react";

const MAX_FOTOS = 20;
const MAX_LADO = 1600; // px — redimensiona o maior lado para caber sem pesar
const QUALIDADE = 0.82; // JPEG

// Upload de fotos do imóvel com COMPRESSÃO no navegador: redimensiona e recomprime
// cada imagem antes de enviar, para caber até 20 fotos sem estourar o limite de
// tamanho da requisição (Server Action / Vercel). As fotos comprimidas vão para
// um input file oculto com name="fotos" — a action recebe igual a antes.
export default function UploadFotos() {
  const [fotos, setFotos] = useState<{ file: File; url: string }[]>([]);
  const [processando, setProcessando] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  async function comprimir(file: File): Promise<File> {
    try {
      const bitmap = await createImageBitmap(file);
      const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * escala);
      const h = Math.round(bitmap.height * escala);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", QUALIDADE));
      if (!blob) return file;
      const nome = file.name.replace(/\.\w+$/, "") + ".jpg";
      return new File([blob], nome, { type: "image/jpeg" });
    } catch {
      return file; // se algo falhar, sobe a original
    }
  }

  // Sincroniza o input oculto (name="fotos") com a lista atual de arquivos.
  function sincronizar(lista: { file: File; url: string }[]) {
    if (!hiddenRef.current) return;
    const dt = new DataTransfer();
    lista.forEach((f) => dt.items.add(f.file));
    hiddenRef.current.files = dt.files;
  }

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const novos = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!novos.length) return;
    setProcessando(true);
    try {
      const espaco = Math.max(0, MAX_FOTOS - fotos.length);
      const comprimidas = await Promise.all(novos.slice(0, espaco).map(async (f) => {
        const c = await comprimir(f);
        return { file: c, url: URL.createObjectURL(c) };
      }));
      const lista = [...fotos, ...comprimidas].slice(0, MAX_FOTOS);
      setFotos(lista);
      sincronizar(lista);
    } finally {
      setProcessando(false);
      if (pickerRef.current) pickerRef.current.value = ""; // permite re-selecionar
    }
  }

  function remover(idx: number) {
    const lista = fotos.filter((_, i) => i !== idx);
    setFotos(lista);
    sincronizar(lista);
  }

  return (
    <div>
      {/* input real que a action lê (comprimido, sincronizado via DataTransfer) */}
      <input ref={hiddenRef} type="file" name="fotos" multiple accept="image/*" className="hidden" tabIndex={-1} />

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => pickerRef.current?.click()}
          disabled={fotos.length >= MAX_FOTOS || processando}
          className="rounded-full bg-[#34C46A] px-4 py-2 text-[13px] font-medium text-[#06210F] hover:bg-[#8CF0B0] disabled:opacity-40 cursor-pointer transition-colors"
        >
          {processando ? "Processando…" : "Escolher fotos"}
        </button>
        <span className="text-[12px] text-[#9AA2AF]">{fotos.length}/{MAX_FOTOS} fotos</span>
      </div>
      <input ref={pickerRef} type="file" accept="image/*" multiple onChange={aoEscolher} className="hidden" />

      {fotos.length > 0 && (
        <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
          {fotos.map((f, i) => (
            <div key={i} className="relative group aspect-square overflow-hidden rounded-lg border border-[#1E222B]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={`foto ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remover(i)}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white text-xs leading-none hover:bg-black/80 cursor-pointer"
                title="Remover"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[#7A828F] mt-2">
        Até {MAX_FOTOS} fotos. Elas são otimizadas no seu navegador antes de subir, então pode mandar várias sem travar.
      </p>
    </div>
  );
}
