import { redirect } from "next/navigation";
import { getSessao } from "@/lib/sessao";
import { prisma } from "@/lib/db";
import { hashSenha, verificarSenha } from "@/lib/senha";
import { PageHeader, Card, Field, inputClass, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

// Troca de senha obrigatória para quem entra com senha provisória (cliente
// recém-provisionado, ou senha redefinida pelo dono). Usa getSessao() direto
// para não colidir com o redirect de exigirSessao().
export default async function TrocarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  const { erro } = await searchParams;

  async function acao(formData: FormData) {
    "use server";
    const s = await getSessao();
    if (!s) redirect("/login");

    const atual = String(formData.get("atual") ?? "");
    const nova = String(formData.get("nova") ?? "");
    const confirmar = String(formData.get("confirmar") ?? "");
    const falha = (m: string) => redirect(`/trocar-senha?erro=${encodeURIComponent(m)}`);

    if (nova.length < 8) falha("A nova senha precisa ter ao menos 8 caracteres.");
    if (nova !== confirmar) falha("A confirmação não confere com a nova senha.");

    const u = await prisma.usuario.findUnique({ where: { id: s.usuario.id } });
    if (!u || !verificarSenha(atual, u.senhaHash)) falha("Senha atual incorreta.");

    // Não incrementa sessaoVersao: mantém a sessão atual válida e só libera o app.
    await prisma.usuario.update({
      where: { id: s.usuario.id },
      data: { senhaHash: hashSenha(nova), precisaTrocarSenha: false },
    });
    redirect("/");
  }

  return (
    <div className="max-w-[480px] mx-auto">
      <PageHeader
        kicker="segurança"
        title="Defina sua senha"
        subtitle="Você entrou com uma senha provisória. Escolha uma senha só sua para continuar."
      />
      {erro && (
        <Card className="mb-5 !border-[#4A2028] !bg-[#1F1215]">
          <p className="m-0 text-sm text-[#FFA5B6]">{erro}</p>
        </Card>
      )}
      <Card>
        <form action={acao} className="flex flex-col gap-4">
          <Field label="Senha provisória (atual)">
            <input name="atual" type="password" required className={inputClass} autoComplete="current-password" />
          </Field>
          <Field label="Nova senha (mín. 8 caracteres)">
            <input name="nova" type="password" required minLength={8} className={inputClass} autoComplete="new-password" />
          </Field>
          <Field label="Confirme a nova senha">
            <input name="confirmar" type="password" required minLength={8} className={inputClass} autoComplete="new-password" />
          </Field>
          <div className="flex justify-center mt-1">
            <SubmitButton>Salvar e entrar</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
