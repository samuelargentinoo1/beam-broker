import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { solicitarResetSenha } from "@/lib/conta";
import { emailConfigurado } from "@/lib/email";
import { cadastroBloqueado, ipDaRequisicao, registrarCadastro } from "@/lib/login-seguranca";

async function solicitar(formData: FormData) {
  "use server";
  const ip = ipDaRequisicao(await headers());
  // reusa o limite por IP para não virar um oráculo/spam de e-mails
  if (!(await cadastroBloqueado(ip))) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    await solicitarResetSenha(email); // não revela se o e-mail existe
    await registrarCadastro(ip);
  }
  redirect("/recuperar-senha?enviado=1");
}

export default async function RecuperarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string }>;
}) {
  const { enviado } = await searchParams;
  const semProvedor = !emailConfigurado();
  return (
    <div className="min-h-screen flex items-center justify-center p-6 box-border bg-[#07080B] text-[#F4F5F7]">
      <div className="w-full max-w-[392px] sobe">
        <div className="bg-[#12141A] border border-[#1E222B] rounded-2xl p-9 box-border shadow-[0_10px_30px_-18px_rgba(0,0,0,.18)]">
          <h1 className="m-0 mb-1 text-[22px] font-[480] tracking-[-0.03em] text-center">
            Recuperar senha
          </h1>
          <p className="text-[12px] text-[#9AA2AF] text-center mb-5">
            Informe seu e-mail e enviaremos um link para redefinir a senha.
          </p>

          {enviado && (
            <p className="text-[12.5px] text-[#34C46A] bg-[rgba(52,196,106,.07)] border border-[rgba(52,196,106,.2)] rounded-[10px] px-3 py-2 mb-4">
              Se este e-mail estiver cadastrado, enviamos o link de redefinição.
            </p>
          )}
          {semProvedor && (
            <p className="text-[12px] text-[#F5B23D] bg-[rgba(245,178,61,.08)] border border-[rgba(245,178,61,.25)] rounded-[10px] px-3 py-2 mb-4">
              Envio de e-mail ainda não configurado neste ambiente. Fale com o
              administrador para redefinir a senha.
            </p>
          )}

          <form action={solicitar} className="flex flex-col gap-[15px]">
            <label className="block">
              <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">E-mail</span>
              <input name="email" type="email" required className="input-ds mt-1.5" />
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 box-border w-full font-semibold text-sm px-5 py-[11px] rounded-lg bg-[#34C46A] text-[#06210F] cursor-pointer transition-colors hover:bg-[#8CF0B0]"
            >
              Enviar link
            </button>
          </form>
        </div>
        <p className="mt-3.5 mb-0 text-[11px] text-[#7A828F] text-center">
          <Link href="/login" className="font-semibold">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
