"use client";

// Tour REAL da tela: um spotlight destaca o elemento marcado com data-tour e
// um balão explica o passo, com Anterior / Próximo / Pular. Sem UI falsa —
// o que o usuário vê no tour é a própria tela. Ciente de estado (temDados).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { tourDaRota, type PassoTour } from "@/lib/onboarding";

const PAD = 8; // respiro do recorte ao redor do alvo

export default function Onboarding({ temDados }: { temDados: boolean }) {
  const pathname = usePathname();
  const tour = tourDaRota(pathname);
  const chave = tour?.key ?? "";

  const [ativo, setAtivo] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [visto, setVisto] = useState(true);
  const raf = useRef<number | null>(null);

  const passos = tour?.passos ?? [];
  const passo: PassoTour | undefined = passos[i];
  const chaveVisto = chave ? `onb-visto-${chave}` : "";

  // Só reinicia o estado quando o TOUR da rota muda de fato (não em cada navegação)
  useEffect(() => {
    setAtivo(false);
    setI(0);
    setRect(null);
    if (chaveVisto) setVisto(localStorage.getItem(chaveVisto) === "1");
  }, [chave, chaveVisto]);

  const posicionar = useCallback(() => {
    if (!passo?.alvo) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${passo.alvo}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [passo]);

  // A cada passo: rola o alvo para a vista e recomputa o recorte; acompanha scroll/resize
  useEffect(() => {
    if (!ativo) return;
    const el = passo?.alvo
      ? document.querySelector<HTMLElement>(`[data-tour="${passo.alvo}"]`)
      : null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(posicionar, 320);
    const onMove = () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(posicionar);
    };
    window.addEventListener("resize", onMove);
    const main = document.querySelector("main");
    main?.addEventListener("scroll", onMove, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onMove);
      main?.removeEventListener("scroll", onMove);
    };
  }, [ativo, i, posicionar, passo?.alvo]);

  function iniciar() {
    setI(0);
    setAtivo(true);
  }
  function fechar() {
    setAtivo(false);
    if (chaveVisto) {
      localStorage.setItem(chaveVisto, "1");
      setVisto(true);
    }
  }
  const proximo = () => (i < passos.length - 1 ? setI(i + 1) : fechar());
  const anterior = () => i > 0 && setI(i - 1);

  if (!tour) return null;

  return (
    <>
      {!ativo && (
        <button
          type="button"
          onClick={iniciar}
          className={`onb-launch ${visto ? "visto" : ""}`}
          aria-label="Tour desta tela"
        >
          <span aria-hidden>?</span>
          {!visto && <span className="onb-halo" aria-hidden />}
          <span className="onb-tip">{visto ? "Rever tour desta tela" : "Tour: como usar esta tela"}</span>
        </button>
      )}

      {ativo && passo && (
        <Overlay
          rect={rect}
          passo={passo}
          i={i}
          n={passos.length}
          temDados={temDados}
          onAnterior={anterior}
          onProximo={proximo}
          onFechar={fechar}
        />
      )}
    </>
  );
}

function Overlay({
  rect,
  passo,
  i,
  n,
  temDados,
  onAnterior,
  onProximo,
  onFechar,
}: {
  rect: DOMRect | null;
  passo: PassoTour;
  i: number;
  n: number;
  temDados: boolean;
  onAnterior: () => void;
  onProximo: () => void;
  onFechar: () => void;
}) {
  const descricao = !temDados && passo.descricaoVazio ? passo.descricaoVazio : passo.descricao;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // recorte do spotlight
  const buraco = rect
    ? {
        top: Math.max(8, rect.top - PAD),
        left: Math.max(8, rect.left - PAD),
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // posição do balão: abaixo do alvo se couber, senão acima; centralizado sem alvo
  const abaixo = rect ? rect.bottom + 260 < vh : true;
  const estiloBalao: React.CSSProperties =
    buraco
      ? abaixo
        ? { top: buraco.top + buraco.height + 12, left: buraco.left, maxWidth: 380 }
        : { top: Math.max(90, buraco.top - 12), left: buraco.left, maxWidth: 380, transform: "translateY(-100%)" }
      : { top: "50%", left: "50%", transform: "translate(-50%,-50%)", maxWidth: 420 };

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-label="Tour da tela">
      {/* Escurece a tela; se há recorte, o box com box-shadow gigante cria o "furo" */}
      <div className="absolute inset-0" style={{ background: buraco ? "transparent" : "rgba(17,24,39,.55)" }} onClick={onFechar} />
      {buraco && (
        <div
          className="onb-buraco"
          style={{ position: "absolute", top: buraco.top, left: buraco.left, width: buraco.width, height: buraco.height }}
        />
      )}

      <div className="onb-balao" style={{ position: "absolute", ...estiloBalao }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="label-caps !text-[8px] tracking-[.14em] text-[#7A828F]">
            Passo {i + 1} de {n}
          </span>
          <button type="button" onClick={onFechar} className="text-[#7A828F] hover:text-[#F4F5F7] text-[15px] leading-none cursor-pointer" aria-label="Pular">
            ✕
          </button>
        </div>
        <p className="m-0 text-[15px] font-semibold text-[#F4F5F7]">{passo.titulo}</p>
        <p className="m-0 mt-1 text-[13px] leading-[1.5] text-[#9AA2AF]">{descricao}</p>

        {passo.cta && (
          <Link
            href={passo.cta.href}
            onClick={onFechar}
            className="mt-3 inline-flex items-center rounded-full bg-[#34C46A] !text-[#06210F] text-[13px] font-[520] px-4 py-2 hover:bg-[#8CF0B0] transition-colors"
          >
            {passo.cta.label}
          </Link>
        )}

        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1">
            {Array.from({ length: n }).map((_, k) => (
              <span
                key={k}
                className="h-1.5 rounded-full transition-all"
                style={{ width: k === i ? 18 : 6, background: k === i ? "#34C46A" : "#2A303B" }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button type="button" onClick={onAnterior} className="text-[13px] text-[#9AA2AF] hover:text-[#F4F5F7] px-2 py-1 cursor-pointer">
                Anterior
              </button>
            )}
            <button
              type="button"
              onClick={onProximo}
              className="text-[13px] font-[520] rounded-full bg-[#F4F5F7] text-white px-4 py-1.5 hover:bg-[#C9CFD8] transition-colors cursor-pointer"
            >
              {i < n - 1 ? "Próximo" : "Concluir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
