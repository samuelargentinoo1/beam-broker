"use client";

// Selo de status do WhatsApp que carrega SOZINHO e se atualiza sozinho —
// aparece nas Configurações e no Atendimento IA para você saber, de relance,
// se o número está conectado, sem precisar clicar em "Verificar conexão" nem
// reconfigurar nada. Consulta o mesmo diagnóstico do servidor (rota que
// alcança a uazapi mesmo quando o navegador não alcança).

import { useCallback, useEffect, useState } from "react";

type Status = {
  ok: boolean;
  conectado?: boolean;
  detalhe?: string;
  numero?: string;
  servidor?: string;
  estado?: string;
} | null;

export default function StatusWhatsApp({
  compacto = false,
}: {
  compacto?: boolean;
}) {
  const [status, setStatus] = useState<Status>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "status" }),
      });
      setStatus(await res.json());
    } catch {
      setStatus({ ok: false, conectado: false, detalhe: "sem resposta do servidor" });
    } finally {
      setCarregando(false);
    }
  }, []);

  // carrega ao montar e revalida a cada 30s (e ao voltar para a aba)
  useEffect(() => {
    carregar();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") carregar();
    }, 30000);
    const aoFocar = () => document.visibilityState === "visible" && carregar();
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoFocar);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoFocar);
    };
  }, [carregar]);

  const conectado = Boolean(status?.conectado);
  const semToken = status?.estado === "sem_token";

  const cor = carregando
    ? { bg: "bg-[#171B22]", txt: "text-[#9AA2AF]", dot: "bg-[#7A828F]" }
    : conectado
      ? { bg: "bg-[rgba(52,196,106,.1)]", txt: "text-[#34C46A]", dot: "bg-[#34C46A]" }
      : { bg: "bg-[rgba(255,92,122,.08)]", txt: "text-[#FF5C7A]", dot: "bg-[#FF5C7A]" };

  const rotulo = carregando
    ? "Verificando WhatsApp…"
    : semToken
      ? "WhatsApp não configurado"
      : conectado
        ? `WhatsApp conectado${status?.numero ? ` · ${status.numero}` : ""}`
        : "WhatsApp desconectado";

  const selo = (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] font-[520] rounded-full px-3 py-1.5 ${cor.bg} ${cor.txt}`}
      title={status?.detalhe ?? ""}
    >
      <span
        className={`h-2 w-2 rounded-full ${cor.dot} ${carregando || conectado ? "pulse-dot" : ""}`}
      />
      {rotulo}
    </span>
  );

  if (compacto) return selo;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {selo}
      <button
        type="button"
        onClick={carregar}
        className="text-[11.5px] text-[#9AA2AF] hover:text-[#F4F5F7] underline decoration-dotted cursor-pointer"
      >
        atualizar
      </button>
      {!carregando && !conectado && status?.detalhe && (
        <span className="text-[11.5px] text-[#7A828F] basis-full">{status.detalhe}</span>
      )}
    </div>
  );
}
