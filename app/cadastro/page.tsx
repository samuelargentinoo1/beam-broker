import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { hashSenha } from "@/lib/senha";
import { emailConfigurado } from "@/lib/email";
import { enviarVerificacaoEmail } from "@/lib/conta";
import {
  cadastroBloqueado,
  ipDaRequisicao,
  registrarCadastro,
  senhaForte,
} from "@/lib/login-seguranca";

async function cadastrar(formData: FormData) {
  "use server";
  const ip = ipDaRequisicao(await headers());
  // Rate limit: no máximo N contas por hora por IP (freia criação em massa que
  // consumiria a ANTHROPIC_API_KEY).
  if (await cadastroBloqueado(ip)) redirect("/cadastro?erro=limite");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  // Força de senha: mínimo 10 caracteres.
  if (!senhaForte(senha)) redirect("/cadastro?erro=senha");

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) redirect("/cadastro?erro=email");

  const modeloRemuneracao =
    formData.get("modeloRemuneracao") === "PRIMEIRO_ALUGUEL" ? "PRIMEIRO_ALUGUEL" : "PERCENTUAL";

  const imobiliaria = await prisma.imobiliaria.create({
    data: {
      nome: String(formData.get("nomeImobiliaria")),
      cnpj: (formData.get("cnpj") as string) || null,
      telefone: (formData.get("telefone") as string) || null,
      email,
      modeloRemuneracao,
      taxaAdmPercent: Number(formData.get("taxaAdmPercent")) || 10,
    },
  });
  // Com provedor de e-mail configurado, a conta nasce NÃO verificada e o 1º login
  // exige confirmação. Sem provedor, nasce verificada (não há como confirmar e
  // não podemos travar o acesso).
  const exigeVerificacao = emailConfigurado();
  const usuario = await prisma.usuario.create({
    data: {
      imobiliariaId: imobiliaria.id,
      nome: String(formData.get("nomeUsuario")),
      email,
      senhaHash: hashSenha(senha),
      emailVerificadoEm: exigeVerificacao ? null : new Date(),
      // TODO(trial): quando o campo trialAte existir, nascer com agora + 14 dias.
    },
  });
  await registrarCadastro(ip);
  if (exigeVerificacao) {
    await enviarVerificacaoEmail(usuario.id, email);
    redirect("/login?verifique=1");
  }
  redirect("/login?novo=1");
}

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const msgErro =
    erro === "email"
      ? "Este e-mail já está em uso."
      : erro === "senha"
        ? "A senha precisa ter pelo menos 10 caracteres."
        : erro === "limite"
          ? "Muitas contas criadas deste dispositivo. Tente mais tarde."
          : null;
  return (
    <div className="min-h-screen flex items-center justify-center p-6 box-border bg-[#07080B] text-[#F4F5F7] overflow-y-auto">
      <div className="w-full max-w-[440px] sobe py-6">
        <div className="bg-[#12141A] border border-[#1E222B] rounded-2xl p-9 box-border shadow-[0_10px_30px_-18px_rgba(0,0,0,.18)]">
          <div className="flex flex-col items-center gap-1.5 mb-[26px]">
            <div className="grid place-items-center w-[52px] h-[52px] rounded-[13px] bg-[#34C46A] text-[#06210F] text-2xl font-bold">
              ⌂
            </div>
            <h1 className="m-0 mt-3.5 text-[24px] font-[480] tracking-[-0.03em] text-center">
              Criar conta da imobiliária
            </h1>
            <p className="label-caps m-0 !text-[8.5px] tracking-[.2em] text-[#7A828F] text-center">
              Gestão de locação operada por IA
            </p>
          </div>

          {msgErro && (
            <p className="text-[12.5px] text-[#FF5C7A] bg-[rgba(255,92,122,.06)] border border-[rgba(255,92,122,.2)] rounded-[10px] px-3 py-2 mb-4">
              {msgErro}
            </p>
          )}

          <form action={cadastrar} className="flex flex-col gap-[15px]">
            <label className="block">
              <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">Nome da imobiliária</span>
              <input name="nomeImobiliaria" required className="input-ds mt-1.5" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block min-w-0">
                <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">CNPJ (opcional)</span>
                <input name="cnpj" className="input-ds mt-1.5" />
              </label>
              <label className="block min-w-0">
                <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">Telefone</span>
                <input name="telefone" className="input-ds mt-1.5" />
              </label>
            </div>

            <div className="border-t border-[#1E222B] pt-3.5 flex flex-col gap-[15px]">
              <label className="block">
                <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">
                  Como a imobiliária é remunerada?
                </span>
                <select name="modeloRemuneracao" className="input-ds mt-1.5">
                  <option value="PERCENTUAL">Taxa de administração mensal (%)</option>
                  <option value="PRIMEIRO_ALUGUEL">Fica com o primeiro aluguel (sem taxa mensal)</option>
                </select>
              </label>
              <label className="block">
                <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">
                  Taxa adm (%) — modelo percentual
                </span>
                <input name="taxaAdmPercent" type="number" step="0.5" defaultValue={10} className="input-ds mt-1.5" />
              </label>
              <p className="m-0 -mt-2 text-[11px] text-[#7A828F]">
                Tudo isso pode ser ajustado depois em Configurações — inclusive por contrato.
              </p>
            </div>

            <div className="border-t border-[#1E222B] pt-3.5 flex flex-col gap-[15px]">
              <label className="block">
                <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">Seu nome</span>
                <input name="nomeUsuario" required className="input-ds mt-1.5" />
              </label>
              <label className="block">
                <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">Seu e-mail (será o login)</span>
                <input name="email" type="email" required className="input-ds mt-1.5" />
              </label>
              <label className="block">
                <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">Senha (mín. 10 caracteres)</span>
                <input name="senha" type="password" required minLength={10} className="input-ds mt-1.5" />
              </label>
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 box-border w-full font-semibold text-sm px-5 py-[11px] rounded-lg bg-[#34C46A] text-[#06210F] cursor-pointer transition-colors hover:bg-[#8CF0B0]"
            >
              Criar conta
            </button>
          </form>
        </div>

        <p className="mt-3.5 mb-0 text-[11px] text-[#7A828F] text-center">
          Já tem conta?{" "}
          <Link href="/login" className="font-semibold">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
