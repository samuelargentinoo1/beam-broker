import { redirect } from "next/navigation";
import { PageHeader, Card, Field, inputClass, SubmitButton } from "@/components/ui";
import { exigirOperador } from "@/lib/operador";
import { provisionarCliente } from "@/lib/provisionar";
import { LISTA_PRODUTOS } from "@/lib/planos";
import { brl } from "@/lib/cmv";

export const dynamic = "force-dynamic";

export default async function NovoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  await exigirOperador();
  const { erro } = await searchParams;

  async function acao(formData: FormData) {
    "use server";
    const r = await provisionarCliente(formData);
    if (!r.ok) redirect(`/admin/clientes/novo?erro=${encodeURIComponent(r.erro)}`);
    // A senha temporária trafega uma única vez até a tela de detalhe e não é
    // persistida em lugar nenhum. Se o admin fechar a aba, redefine e gera outra.
    redirect(
      `/admin/clientes/${r.imobiliariaId}?novo=1&email=${encodeURIComponent(r.email)}&senha=${encodeURIComponent(r.senhaTemporaria)}`
    );
  }

  return (
    <>
      <PageHeader
        kicker="operação"
        title="Novo cliente"
        subtitle="Cria a imobiliária, o primeiro login e vincula o plano numa transação só."
        breadcrumb={[{ label: "Painel do dono", href: "/admin" }, { label: "Novo cliente" }]}
      />

      {erro && (
        <Card className="mb-5 !border-[#4A2028] !bg-[#1F1215]">
          <p className="m-0 text-sm text-[#FFA5B6]">{erro}</p>
        </Card>
      )}

      <form action={acao} className="flex flex-col gap-5">
        <Card>
          <p className="label-caps m-0 mb-4 !text-[9px] text-[#7A828F]">imobiliária</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Field label="Nome">
              <input name="nome" required className={inputClass} placeholder="Imobiliária Central" />
            </Field>
            <Field label="CNPJ">
              <input name="cnpj" className={inputClass} placeholder="00.000.000/0001-00" />
            </Field>
            <Field label="Município">
              <input name="municipio" className={inputClass} placeholder="São José do Rio Preto" />
            </Field>
            <Field label="UF">
              <input name="uf" maxLength={2} className={inputClass} placeholder="SP" />
            </Field>
            <Field label="Telefone">
              <input name="telefone" className={inputClass} placeholder="(17) 99999-0000" />
            </Field>
          </div>
        </Card>

        <Card>
          <p className="label-caps m-0 mb-4 !text-[9px] text-[#7A828F]">primeiro acesso</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Field label="Nome do responsável">
              <input name="nomeUsuario" required className={inputClass} placeholder="Maria Silva" />
            </Field>
            <Field label="E-mail de login">
              <input
                name="email"
                type="email"
                required
                className={inputClass}
                placeholder="maria@imobiliaria.com.br"
              />
            </Field>
          </div>
          <p className="mt-3 mb-0 text-[12px] leading-relaxed text-[#7A828F]">
            A senha temporária é gerada agora e mostrada uma única vez na próxima tela. O usuário é
            obrigado a trocá-la no primeiro login.
          </p>
        </Card>

        <Card>
          <p className="label-caps m-0 mb-4 !text-[9px] text-[#7A828F]">plano</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {LISTA_PRODUTOS.map((p, i) => (
              <label
                key={p.chave}
                className="flex items-start gap-3 rounded-[16px] border border-[#1E222B] p-3.5 cursor-pointer transition-colors hover:border-[#39414F] has-[:checked]:border-[#34C46A] has-[:checked]:bg-[rgba(52,196,106,.04)]"
              >
                <input
                  type="radio"
                  name="produto"
                  value={p.chave}
                  defaultChecked={i === LISTA_PRODUTOS.length - 1}
                  className="mt-1 accent-[#34C46A]"
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-[#F4F5F7]">{p.nome}</span>
                  <span className="block text-[11px] text-[#7A828F]">{p.promessa}</span>
                  <span className="block mt-1.5 text-[12px] tabular-nums text-[#9AA2AF]">
                    {brl(p.mensalidadeCentavos / 100)}/mês
                    {p.porContratoAtivoCentavos > 0 &&
                      ` + ${brl(p.porContratoAtivoCentavos / 100)}/contrato`}
                    {p.porLeadAtendidoCentavos > 0 && ` + ${brl(p.porLeadAtendidoCentavos / 100)}/lead`}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {/* Captação é ADD-ON, não módulo: acoplável sobre qualquer produto com
              operação de carteira, nunca sobre Recepção. A validação real está
              em provisionarCliente (addonPermitido) — aqui é só o pedido. */}
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[16px] border border-[#1E222B] p-3.5 transition-colors hover:border-[#39414F] has-[:checked]:border-[#34C46A] has-[:checked]:bg-[rgba(52,196,106,.04)]">
            <input type="checkbox" name="addonCaptacao" value="1" className="mt-1 accent-[#34C46A]" />
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-[#F4F5F7]">Captação (add-on)</span>
              <span className="block text-[11px] text-[#7A828F]">
                Liga a IA de captação de imóveis. Exige um plano com carteira — não pode ser
                vendido sobre Recepção.
              </span>
            </span>
          </label>

          <div className="mt-4 max-w-[220px]">
            <Field label="Dias de trial">
              <input
                name="diasTrial"
                type="number"
                defaultValue={14}
                min={0}
                max={90}
                className={inputClass}
              />
            </Field>
          </div>
          <p className="mt-2 mb-0 text-[12px] text-[#7A828F]">
            Zero dias = assinatura já ativa, sem período de teste.
          </p>
        </Card>

        <div className="flex justify-center">
          <SubmitButton>Criar cliente e gerar acesso</SubmitButton>
        </div>
      </form>
    </>
  );
}
