"use client";

// Chrome do app no design "flutuante": dock inferior (ícone + nome sempre
// visível, rola na horizontal quando não cabe) + barra superior (avatar ·
// busca · sino). A navegação fica sempre visível — não some no scroll.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { gruposVisiveis } from "@/lib/navegacao";

export type Notificacao = { glifo: string; titulo: string; detalhe: string; href: string };

// O dock é montado a partir dos MÓDULOS contratados (lib/navegacao.ts). Saíram
// daqui, de propósito: /importar (virou botão em Imóveis — ação em massa não é
// aba), /pesquisa (é a busca do header, com ⌘K) e /auditoria (virou seção em
// Configurações — conferência eventual não é destino).
export function Dock({ sair, modulos }: { sair: () => Promise<void>; modulos: string[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // Grupos vazios são descartados ANTES de inserir os separadores — filtrar o
  // array cru deixaria separador órfão e buraco visual no dock.
  const grupos = gruposVisiveis(modulos);

  const ehAtivo = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // Centraliza o item ativo dentro do dock quando a rota muda — assim, mesmo
  // com o dock rolado (telas estreitas), o usuário sempre vê em que módulo está.
  // Rola só o container horizontalmente, nunca a página.
  useEffect(() => {
    const nav = navRef.current;
    const ativo = nav?.querySelector<HTMLElement>("a.on");
    if (!nav || !ativo) return;
    const alvo = ativo.offsetLeft - nav.clientWidth / 2 + ativo.clientWidth / 2;
    nav.scrollTo({ left: Math.max(0, alvo), behavior: "smooth" });
  }, [pathname]);

  return (
    <nav className="dock" ref={navRef}>
      {grupos.map((grupo, gi) => (
        <Fragment key={grupo[0]!.grupo}>
          {gi > 0 && <span className="sep" />}
          {grupo.map((item) => (
            <Link key={item.href} href={item.href} className={ehAtivo(item.href) ? "on" : ""}>
              <span className="ic-glifo" aria-hidden>{item.glifo}</span>
              <span className="rot">{item.label}</span>
            </Link>
          ))}
        </Fragment>
      ))}
      <span className="sep" />
      {/* O CTA aponta para o que o cliente PODE criar: o cadastro de imóvel é a
          criação principal. */}
      <Link href="/imoveis/novo" className="cta">
        <span className="ic-glifo" aria-hidden>＋</span>
        <span className="rot">Novo</span>
      </Link>
      <form action={sair} style={{ display: "contents" }}>
        <button type="submit" className="out">
          <span className="ic-glifo" aria-hidden>⏻</span>
          <span className="rot">Sair</span>
        </button>
      </form>
    </nav>
  );
}

export function BarraSuperior({
  nomeUsuario,
  emailUsuario,
  nomeImobiliaria,
  notificacoes,
}: {
  nomeUsuario: string;
  emailUsuario: string;
  nomeImobiliaria: string;
  notificacoes: Notificacao[];
}) {
  const [aberto, setAberto] = useState<"perfil" | "sino" | null>(null);
  const [busca, setBusca] = useState("");
  const [teclaAtalho, setTeclaAtalho] = useState("⌘K");
  const buscaRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => setAberto(null), [pathname]);

  // ⌘K / Ctrl+K foca a busca de qualquer lugar do app
  useEffect(() => {
    const ehMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
    setTeclaAtalho(ehMac ? "⌘K" : "Ctrl K");
    const onKey = (e: KeyboardEvent) => {
      // Não sequestra o atalho quando o usuário está digitando em um campo.
      const alvo = e.target as HTMLElement | null;
      const digitando =
        !!alvo &&
        (alvo.tagName === "INPUT" ||
          alvo.tagName === "TEXTAREA" ||
          alvo.isContentEditable);
      if (digitando) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        buscaRef.current?.focus();
        buscaRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const iniciais =
    nomeUsuario
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?";

  return (
    <>
      {aberto && (
        <div
          className="fixed inset-0 z-[55] cursor-default"
          onClick={() => setAberto(null)}
        />
      )}
      <div className="hbar">
        {/* Avatar */}
        <div className="relative">
          <button
            type="button"
            className="ic av"
            onClick={() => setAberto(aberto === "perfil" ? null : "perfil")}
          >
            {iniciais}
            {aberto !== "perfil" && <span className="tt">{emailUsuario}</span>}
          </button>
          {aberto === "perfil" && (
            <div className="hbar-menu left-0 w-60">
              <div className="px-4 py-3 border-b border-[#1E222B] bg-[#07080B]">
                <p className="m-0 text-[13px] font-semibold text-[#F4F5F7] truncate">{nomeUsuario}</p>
                <p className="m-0 text-[11.5px] text-[#7A828F] truncate">{emailUsuario}</p>
                <p className="label-caps m-0 mt-1 !text-[8px] tracking-[.12em] text-[#8CF0B0] truncate">
                  {nomeImobiliaria}
                </p>
              </div>
              <Link
                href="/configuracoes"
                className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] !text-[#C9CFD8] hover:bg-[#07080B] transition-colors"
              >
                <span aria-hidden className="text-[#7A828F]">⚙</span> Configurações
              </Link>
            </div>
          )}
        </div>

        <span className="sep" />

        {/* Busca */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (busca.trim()) router.push(`/pesquisa?q=${encodeURIComponent(busca.trim())}`);
          }}
          style={{ display: "contents" }}
        >
          <label className="search">
            <span className="lupa" aria-hidden>⌕</span>
            <input
              ref={buscaRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar contratos, pessoas, imóveis…"
            />
            <kbd className="kbd-atalho" aria-hidden>{teclaAtalho}</kbd>
          </label>
        </form>

        <span className="sep" />

        {/* Sino */}
        <div className="relative">
          <button
            type="button"
            className="ic"
            onClick={() => setAberto(aberto === "sino" ? null : "sino")}
          >
            🔔
            {notificacoes.length > 0 && <span className="bell-dot" />}
            {aberto !== "sino" && <span className="tt">Notificações</span>}
          </button>
          {aberto === "sino" && (
            <div className="hbar-menu right-0 w-80">
              <p className="label-caps m-0 px-4 py-3 !text-[8.5px] tracking-[.12em] text-[#9AA2AF] border-b border-[#1E222B] bg-[#07080B]">
                Notificações
              </p>
              {notificacoes.length === 0 ? (
                <p className="m-0 px-4 py-6 text-[13px] text-[#7A828F] text-center">
                  Tudo em dia por aqui.
                </p>
              ) : (
                notificacoes.map((n, i) => (
                  <Link
                    key={i}
                    href={n.href}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-[#07080B] transition-colors border-b border-[#1E222B] last:border-0"
                  >
                    <span
                      aria-hidden
                      className="grid place-items-center w-7 h-7 shrink-0 rounded-lg bg-[rgba(52,196,106,.08)] text-[#8CF0B0] text-[12px]"
                    >
                      {n.glifo}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-[#C9CFD8]">{n.titulo}</span>
                      <span className="block text-[11.5px] text-[#7A828F] mt-0.5">{n.detalhe}</span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
