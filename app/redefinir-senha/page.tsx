import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashSenha } from "@/lib/senha";
import { senhaForte } from "@/lib/login-seguranca";
import { consumirToken } from "@/lib/conta";
import { revogarSessoes } from "@/lib/sessao";

async function redefinir(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const senha = String(formData.get("senha") ?? "");
  if (!senhaForte(senha)) redirect(`/redefinir-senha?token=${encodeURIComponent(token)}&erro=senha`);

  const usuarioId = await consumirToken(token, "RESET_SENHA");
  if (!usuarioId) redirect("/redefinir-senha?erro=token");

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { senhaHash: hashSenha(senha), emailVerificadoEm: new Date() },
  });
  // troca de senha invalida todas as sessões existentes
  await revogarSessoes(usuarioId);
  redirect("/login?redefinido=1");
}

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; erro?: string }>;
}) {
  const { token, erro } = await searchParams;
  const msgErro =
    erro === "senha"
      ? "A senha precisa ter pelo menos 10 caracteres."
      : erro === "token"
        ? "Link inválido ou expirado. Solicite um novo."
        : null;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#07080B] text-[#F4F5F7]">
        <div className="w-full max-w-[392px] text-center">
          <p className="text-[13px] text-[#9AA2AF]">Link inválido.</p>
          <Link href="/recuperar-senha" className="font-semibold text-[13px]">
            Solicitar novo link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 box-border bg-[#07080B] text-[#F4F5F7]">
      <div className="w-full max-w-[392px] sobe">
        <div className="bg-[#12141A] border border-[#1E222B] rounded-2xl p-9 box-border shadow-[0_10px_30px_-18px_rgba(0,0,0,.18)]">
          <h1 className="m-0 mb-4 text-[22px] font-[480] tracking-[-0.03em] text-center">
            Nova senha
          </h1>
          {msgErro && (
            <p className="text-[12.5px] text-[#FF5C7A] bg-[rgba(255,92,122,.06)] border border-[rgba(255,92,122,.2)] rounded-[10px] px-3 py-2 mb-4">
              {msgErro}
            </p>
          )}
          <form action={redefinir} className="flex flex-col gap-[15px]">
            <input type="hidden" name="token" value={token} />
            <label className="block">
              <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">
                Nova senha (mín. 10 caracteres)
              </span>
              <input name="senha" type="password" required minLength={10} className="input-ds mt-1.5" />
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 box-border w-full font-semibold text-sm px-5 py-[11px] rounded-lg bg-[#34C46A] text-[#06210F] cursor-pointer transition-colors hover:bg-[#8CF0B0]"
            >
              Redefinir senha
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
