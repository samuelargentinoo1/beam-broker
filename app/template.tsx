"use client";

// Remonta a cada navegação: reanima os números marcados com data-cu
// (contagem crescente no formato pt-BR, como no design).
import { useEffect } from "react";

export default function Template({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelectorAll<HTMLElement>("[data-cu]").forEach((el, i) => {
      const final = el.textContent ?? "";
      const m = final.match(/[0-9][0-9.,]*/);
      if (!m || m.index === undefined) return;
      const raw = m[0];
      const dec = raw.indexOf(",") >= 0 ? raw.split(",")[1].length : 0;
      const num = parseFloat(raw.replace(/\./g, "").replace(",", "."));
      if (isNaN(num)) return;
      const pre = final.slice(0, m.index);
      const suf = final.slice(m.index + raw.length);
      const t0 = performance.now();
      const D = 800 + i * 120;
      const fmt = (v: number) =>
        v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / D);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = pre + fmt(num * e) + suf;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, []);

  return <div>{children}</div>;
}
