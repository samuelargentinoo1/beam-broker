import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESSAO, validarToken } from "@/lib/auth";
import { COOKIE_OPERADOR, validarTokenOperador } from "@/lib/operador-auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Repassa a rota adiante: o layout raiz usa isto para NÃO montar o chrome do
  // cliente em cima do painel do dono (server component não enxerga a URL).
  const cabecalhos = new Headers(req.headers);
  cabecalhos.set("x-pathname", pathname);
  const seguir = () => NextResponse.next({ request: { headers: cabecalhos } });

  // ── Área do OPERADOR (dono do SaaS) ───────────────────────────────────────
  // Universo separado: o cookie de cliente é IGNORADO aqui. Estar logado como
  // imobiliária não dá acesso ao painel do dono — e vice-versa.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (pathname === "/admin/entrar") return seguir();
    const operador = await validarTokenOperador(req.cookies.get(COOKIE_OPERADOR)?.value);
    if (operador) return seguir();
    const url = req.nextUrl.clone();
    url.pathname = "/admin/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ── Produto (cliente) ─────────────────────────────────────────────────────
  // Validação criptográfica no edge (assinatura + expiração). A revogação por
  // sessaoVersao é conferida em getSessao (Node), pois o edge não acessa o banco.
  const token = await validarToken(req.cookies.get(COOKIE_SESSAO)?.value);
  if (token) return seguir();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Protege tudo, exceto login/cadastro, webhooks e cron (serviços externos
  // com autenticação própria) e assets estáticos (inclui /fonts, /onboarding.js,
  // e qualquer arquivo com extensão em public/ — senão viram redirect p/ login).
  matcher: [
    "/((?!login|cadastro|recuperar-senha|redefinir-senha|verificar-email|api/webhooks|api/cron|api/foto|_next/static|_next/image|favicon\\.ico|fonts/|onboarding\\.js|.*\\.(?:js|css|woff2?|png|jpg|jpeg|gif|webp|svg|ico|map)$).*)",
  ],
};
