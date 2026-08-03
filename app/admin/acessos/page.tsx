import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader, Card, Table, Badge, Field, inputClass, SubmitButton } from "@/components/ui";
import { BotaoCopiar } from "@/components/copiar";
import { exigirOperador } from "@/lib/operador";
import {
  listarOperadores,
  listarUsuariosCadastrados,
  promoverAOperador,
  desvincularDoProduto,
  definirOperadorAtivo,
  redefinirSenhaOperador,
} from "@/lib/operador-admin";

export const dynamic = "force-dynamic";

// Senha temporária vai por cookie httpOnly curto, não pela URL (que ficaria no
// histórico do navegador). É lida uma vez e apagada.
const COOKIE_SENHA = "acesso_senha_nova";

async function guardarSenha(senha: string) {
  (await cookies()).set(COOKIE_SENHA, senha, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 5 * 60,
    path: "/",
  });
}

export default async function AcessosPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; erro?: string; ok?: string }>;
}) {
  const eu = await exigirOperador();
  const { busca, erro, ok } = await searchParams;

  const [operadores, usuarios] = await Promise.all([
    listarOperadores(),
    listarUsuariosCadastrados(busca),
  ]);

  const jar = await cookies();
  const senhaNova = jar.get(COOKIE_SENHA)?.value;

  async function acaoPromover(formData: FormData) {
    "use server";
    const r = await promoverAOperador(formData);
    if (!r.ok) redirect(`/admin/acessos?erro=${encodeURIComponent(r.erro)}`);
    if (r.senha) await guardarSenha(r.senha);
    redirect("/admin/acessos?ok=promovido");
  }

  async function acaoDesvincular(formData: FormData) {
    "use server";
    const id = Number(formData.get("usuarioId"));
    const forcar = formData.get("forcar") === "1";
    const r = await desvincularDoProduto(id, forcar);
    if (!r.ok) redirect(`/admin/acessos?erro=${encodeURIComponent(r.erro)}`);
    redirect("/admin/acessos?ok=desvinculado");
  }

  async function acaoAlternarAtivo(formData: FormData) {
    "use server";
    const r = await definirOperadorAtivo(
      Number(formData.get("operadorId")),
      formData.get("ativar") === "1"
    );
    if (!r.ok) redirect(`/admin/acessos?erro=${encodeURIComponent(r.erro)}`);
    redirect("/admin/acessos?ok=atualizado");
  }

  async function acaoRedefinirSenha(formData: FormData) {
    "use server";
    const r = await redefinirSenhaOperador(Number(formData.get("operadorId")));
    if (!r.ok) redirect(`/admin/acessos?erro=${encodeURIComponent(r.erro)}`);
    if (r.senha) await guardarSenha(r.senha);
    redirect("/admin/acessos?ok=senha");
  }

  async function acaoLimparSenha() {
    "use server";
    (await cookies()).delete(COOKIE_SENHA);
    redirect("/admin/acessos");
  }

  return (
    <>
      <PageHeader
        kicker="operação"
        title="Acessos"
        subtitle="Quem é dono da plataforma e quem é usuário de cliente — direto do banco."
        breadcrumb={[{ label: "Painel do dono", href: "/admin" }, { label: "Acessos" }]}
      />

      {erro && (
        <Card className="mb-5 !border-[#4A2028] !bg-[#1F1215]">
          <p className="m-0 text-sm text-[#FFA5B6]">{erro}</p>
        </Card>
      )}
      {ok && !senhaNova && (
        <Card className="mb-5 !border-[#BBF7D0] !bg-[#F0FDF4]">
          <p className="m-0 text-sm text-[#8CF0B0]">
            {ok === "desvinculado"
              ? "Login de cliente removido. Esse e-mail agora é só operador."
              : "Alteração aplicada."}
          </p>
        </Card>
      )}
      {senhaNova && (
        <Card className="mb-5 !border-[#BBF7D0] !bg-[#F0FDF4]">
          <p className="label-caps m-0 mb-2 !text-[9px] text-[#15803D]">senha temporária — anote agora</p>
          <p className="m-0 mb-3 text-sm text-[#8CF0B0]">
            Não é armazenada e não aparece de novo. No primeiro acesso o 2FA será exigido.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-[17px] font-medium tracking-wide tabular-nums text-[#8CF0B0]">
              {senhaNova}
            </span>
            <BotaoCopiar texto={senhaNova} rotulo="Copiar senha" />
            <form action={acaoLimparSenha}>
              <SubmitButton>Anotei</SubmitButton>
            </form>
          </div>
        </Card>
      )}

      {/* ── Operadores (donos) ─────────────────────────────────────────── */}
      <Card className="mb-5">
        <p className="label-caps m-0 mb-3 !text-[9px] text-[#7A828F]">
          operadores da plataforma · {operadores.length}
        </p>
        <Table head={["Nome", "E-mail", "2FA", "Último acesso", "Situação", ""]}>
          {operadores.map((o) => (
            <tr key={o.id}>
              <td className="font-medium text-[#F4F5F7]">
                {o.nome}
                {o.id === eu.id && <span className="ml-2 text-[11px] text-[#7A828F]">(você)</span>}
              </td>
              <td className="text-[#9AA2AF]">{o.email}</td>
              <td>
                {o.doisFatores ? (
                  <Badge tone="green">ativo · {o.codigosRestantes} códigos</Badge>
                ) : (
                  <Badge tone="amber">pendente</Badge>
                )}
              </td>
              <td className="text-[12px] text-[#7A828F]">
                {o.ultimoAcessoEm ? o.ultimoAcessoEm.toLocaleString("pt-BR") : "nunca"}
              </td>
              <td>{o.ativo ? <Badge tone="green">ativo</Badge> : <Badge tone="slate">inativo</Badge>}</td>
              <td>
                <div className="flex gap-2">
                  <form action={acaoRedefinirSenha}>
                    <input type="hidden" name="operadorId" value={o.id} />
                    <SubmitButton>Redefinir senha</SubmitButton>
                  </form>
                  {o.id !== eu.id && (
                    <form action={acaoAlternarAtivo}>
                      <input type="hidden" name="operadorId" value={o.id} />
                      <input type="hidden" name="ativar" value={o.ativo ? "0" : "1"} />
                      <SubmitButton>{o.ativo ? "Desativar" : "Reativar"}</SubmitButton>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>

        <form action={acaoPromover} className="mt-5 flex flex-wrap items-end gap-3 border-t border-[#1E222B] pt-4">
          <div className="min-w-[260px] flex-1">
            <Field label="Tornar um e-mail operador da plataforma">
              <input name="email" type="email" required className={inputClass} placeholder="voce@suaempresa.com.br" />
            </Field>
          </div>
          <div className="min-w-[160px]">
            <Field label="Nome">
              <input name="nome" className={inputClass} placeholder="Dono" />
            </Field>
          </div>
          <SubmitButton>Tornar operador</SubmitButton>
        </form>
        <p className="mt-2 mb-0 text-[12px] text-[#7A828F]">
          Operador vê todos os clientes. Ele não é usuário de imobiliária nenhuma — se o mesmo
          e-mail tiver login de cliente, remova abaixo.
        </p>
      </Card>

      {/* ── Usuários cadastrados (clientes) ─────────────────────────────── */}
      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <p className="label-caps m-0 !text-[9px] text-[#7A828F]">
            usuários cadastrados · {usuarios.length}
            {busca ? ` (filtrando por "${busca}")` : ""}
          </p>
          <form className="flex items-end gap-2">
            <input
              name="busca"
              defaultValue={busca ?? ""}
              className={inputClass}
              placeholder="buscar por e-mail, nome ou imobiliária"
            />
            <SubmitButton>Buscar</SubmitButton>
          </form>
        </div>

        <Table head={["Nome", "E-mail", "Imobiliária", "Papel", ""]}>
          {usuarios.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#7A828F]">
                Nenhum usuário encontrado.
              </td>
            </tr>
          )}
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td className="font-medium text-[#F4F5F7]">{u.nome}</td>
              <td className="text-[#9AA2AF]">
                {u.email}
                {u.tambemOperador && (
                  <span className="ml-2">
                    <Badge tone="amber">também é operador</Badge>
                  </span>
                )}
              </td>
              <td className="text-[#9AA2AF]">
                #{u.imobiliariaId} {u.imobiliariaNome}
              </td>
              <td className="text-[12px] text-[#7A828F]">
                {u.papel}
                {u.precisaTrocarSenha && " · senha provisória"}
              </td>
              <td>
                <form action={acaoDesvincular} className="flex items-center gap-2">
                  <input type="hidden" name="usuarioId" value={u.id} />
                  <SubmitButton>Remover do produto</SubmitButton>
                </form>
              </td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 mb-0 text-[12px] leading-relaxed text-[#7A828F]">
          &quot;Remover do produto&quot; apaga o login de cliente daquele e-mail — é o que separa o dono
          da carteira. Se ele for o único acesso de uma imobiliária que tem dados, a remoção é
          recusada para não trancar o cliente para fora; crie outro acesso antes.
        </p>
      </Card>
    </>
  );
}
