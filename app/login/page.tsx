import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { COOKIE_SESSAO, criarToken } from "@/lib/auth";
import { verificarSenha } from "@/lib/senha";
import {
  HASH_DUMMY,
  ipDaRequisicao,
  loginBloqueado,
  registrarFalhaLogin,
  limparTentativasLogin,
} from "@/lib/login-seguranca";

async function entrar(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const hdrs = await headers();
  const ip = ipDaRequisicao(hdrs);

  // Rate limit: bloqueia brute force por e-mail (5/15min) e por IP (20/15min)
  // ANTES de consultar o banco de usuários.
  if (await loginBloqueado(email, ip)) {
    redirect("/login?erro=bloqueado");
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  // Tempo constante: sempre roda verificarSenha (contra um hash dummy quando o
  // usuário não existe), para não vazar por timing quais e-mails são cadastrados.
  const senhaOk = usuario
    ? verificarSenha(senha, usuario.senhaHash)
    : (verificarSenha(senha, HASH_DUMMY), false);

  if (!usuario || !senhaOk) {
    await registrarFalhaLogin(email, ip);
    redirect("/login?erro=1");
  }

  // E-mail não verificado (só quando há provedor de e-mail configurado): bloqueia
  // o acesso até confirmar. Sem provedor, emailVerificadoEm é preenchido no cadastro.
  const { emailConfigurado } = await import("@/lib/email");
  if (emailConfigurado() && !usuario.emailVerificadoEm) {
    redirect("/login?erro=naoverificado");
  }

  await limparTentativasLogin(email, ip); // sucesso: zera o contador
  const https = hdrs.get("x-forwarded-proto")?.includes("https") ?? false;
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, await criarToken(usuario.id, usuario.sessaoVersao), {
    httpOnly: true,
    // sameSite "lax" sempre: o app não é embedado em iframe de terceiro; "none"
    // enfraqueceria a proteção contra CSRF.
    sameSite: "lax",
    secure: https,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    erro?: string;
    novo?: string;
    verifique?: string;
    verificado?: string;
    redefinido?: string;
  }>;
}) {
  const { erro, novo, verifique, verificado, redefinido } = await searchParams;
  const msgErro =
    erro === "bloqueado"
      ? "Muitas tentativas. Aguarde alguns minutos e tente de novo."
      : erro === "naoverificado"
        ? "Confirme seu e-mail antes de entrar. Reenviamos o link se necessário."
        : erro
          ? "E-mail ou senha incorretos."
          : null;
  const msgOk =
    novo
      ? "Imobiliária cadastrada! Entre com o e-mail e senha que você criou."
      : verifique
        ? "Conta criada! Enviamos um link de confirmação para o seu e-mail."
        : verificado
          ? "E-mail confirmado! Já pode entrar."
          : redefinido
            ? "Senha redefinida! Entre com a nova senha."
            : null;
  return (
    <div className="min-h-screen flex items-center justify-center p-6 box-border bg-[#07080B] text-[#F4F5F7]">
      <div className="w-full max-w-[392px] sobe">
        <div className="bg-[#12141A] border border-[#1E222B] rounded-2xl p-9 box-border shadow-[0_10px_30px_-18px_rgba(0,0,0,.18)]">
          <div className="flex flex-col items-center gap-1.5 mb-[26px]">
            <div className="grid place-items-center w-[52px] h-[52px] rounded-[13px] bg-[#34C46A] text-[#06210F] text-2xl font-bold">
              ⌂
            </div>
            <h1 className="m-0 mt-3.5 text-[26px] font-[480] tracking-[-0.03em] text-center">
              Administrativo
            </h1>
            <p className="label-caps m-0 !text-[8.5px] tracking-[.2em] text-[#7A828F] text-center">
              ERP de locação de imóveis
            </p>
          </div>

          {msgErro && (
            <p className="text-[12.5px] text-[#FF5C7A] bg-[rgba(255,92,122,.06)] border border-[rgba(255,92,122,.2)] rounded-[10px] px-3 py-2 mb-4">
              {msgErro}
            </p>
          )}
          {msgOk && (
            <p className="text-[12.5px] text-[#34C46A] bg-[rgba(52,196,106,.07)] border border-[rgba(52,196,106,.2)] rounded-[10px] px-3 py-2 mb-4">
              {msgOk}
            </p>
          )}

          <form action={entrar} className="flex flex-col gap-[15px]">
            <label className="block">
              <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">E-mail</span>
              <input name="email" type="email" required defaultValue="admin@demo.com" className="input-ds mt-1.5" />
            </label>
            <label className="block">
              <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">Senha</span>
              <input name="senha" type="password" required placeholder="admin123 (demo)" className="input-ds mt-1.5" />
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 box-border w-full font-semibold text-sm px-5 py-[11px] rounded-lg bg-[#34C46A] text-[#06210F] cursor-pointer transition-colors hover:bg-[#8CF0B0]"
            >
              Entrar
            </button>
          </form>

          <div className="flex items-center justify-center gap-2 mt-5">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#34C46A]" />
            <span className="label-caps !text-[8px] tracking-[.12em] text-[#7A828F]">
              3 agentes IA operando a carteira
            </span>
          </div>
        </div>

        <p className="mt-3.5 mb-0 text-[11px] text-[#7A828F] text-center leading-[1.6]">
          <Link href="/recuperar-senha" className="font-semibold">
            Esqueci minha senha
          </Link>
          <br />
          Sua imobiliária ainda não usa o sistema?{" "}
          <Link href="/cadastro" className="font-semibold">
            Criar conta
          </Link>
          <br />
          Demo: admin@demo.com / admin123
        </p>
      </div>
    </div>
  );
}
