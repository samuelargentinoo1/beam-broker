import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { criarImovel } from "@/lib/actions";
import { Card, Field, PageHeader, SubmitButton, inputClass } from "@/components/ui";
import EnderecoCep from "@/components/endereco-cep";
import UploadFotos from "@/components/upload-fotos";

export const dynamic = "force-dynamic";

export default async function NovoImovelPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { imobiliaria } = await exigirSessao();
  const [proprietarios, empreendimentos] = await Promise.all([
    prisma.pessoa.findMany({ where: { imobiliariaId: imobiliaria.id }, orderBy: { nome: "asc" } }),
    prisma.empreendimento.findMany({
      where: { imobiliariaId: imobiliaria.id },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, construtora: true },
    }),
  ]);
  const { erro } = await searchParams;

  return (
    <div>
      <PageHeader kicker="Carteira" title="Novo imóvel" subtitle="Cadastro de imóvel na carteira" />
      {erro && (
        <div className="max-w-[660px] mx-auto mb-4 rounded-2xl border border-[rgba(220,38,38,.3)] bg-[rgba(220,38,38,.06)] px-4 py-3 text-[13px] text-[#B91C1C]">
          Não deu pra cadastrar: {erro}
        </div>
      )}
      <Card className="p-6 max-w-[660px] mx-auto">
        <form action={criarImovel} className="grid grid-cols-2 gap-4">
          <Field label="Tipo">
            <select name="tipo" className={inputClass} required>
              <option>Apartamento</option>
              <option>Casa</option>
              <option>Sala comercial</option>
              <option>Terreno</option>
            </select>
          </Field>
          <Field label="Proprietário">
            <select name="proprietarioId" className={inputClass} required>
              {proprietarios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Field>
          <EnderecoCep cidadePadrao={imobiliaria.municipio ?? ""} ufPadrao={imobiliaria.uf ?? ""} />

          <Field label="Finalidade">
            <select name="finalidade" className={inputClass} defaultValue="LOCACAO">
              <option value="LOCACAO">Locação</option>
              <option value="VENDA">Venda</option>
              <option value="AMBOS">Locação e venda</option>
            </select>
          </Field>
          <div />
          <Field label="Aluguel sugerido (R$)">
            <input name="valorSugerido" type="number" step="0.01" className={inputClass} />
          </Field>
          <Field label="Preço de venda (R$)">
            <input name="valorVenda" type="number" step="0.01" className={inputClass} placeholder="quando à venda" />
          </Field>
          <Field label="Quartos">
            <input name="quartos" type="number" min="0" step="1" className={inputClass} />
          </Field>
          <Field label="Banheiros">
            <input name="banheiros" type="number" min="0" step="1" className={inputClass} />
          </Field>
          <Field label="Suítes">
            <input name="suites" type="number" min="0" step="1" className={inputClass} />
          </Field>
          <Field label="Vagas de garagem">
            <input name="vagas" type="number" min="0" step="1" className={inputClass} />
          </Field>
          <Field label="Área (m²)">
            <input name="areaM2" type="number" step="0.01" className={inputClass} placeholder="para estimar por R$/m²" />
          </Field>
          <div />
          <Field label="Condomínio (R$/mês)">
            <input name="valorCondominio" type="number" step="0.01" className={inputClass} />
          </Field>
          <Field label="IPTU (R$/mês)">
            <input name="valorIptuMensal" type="number" step="0.01" className={inputClass} />
          </Field>

          {empreendimentos.length > 0 && (
            <>
              <div className="col-span-2 border-t border-[#1E222B] pt-4">
                <p className="label-caps m-0 !text-[9px] tracking-[.1em] text-[#9AA2AF]">
                  Empreendimento (opcional)
                </p>
                <p className="m-0 mt-1 text-[12px] text-[#7A828F]">
                  Se for unidade de um prédio já cadastrado, o imóvel herda construtora, entrega e
                  faixas do MCMV de lá.
                </p>
              </div>
              <Field label="Empreendimento">
                <select name="empreendimentoId" className={inputClass} defaultValue="">
                  <option value="">— imóvel avulso</option>
                  {empreendimentos.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome} · {e.construtora}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unidade">
                <input name="unidade" className={inputClass} placeholder="Torre B — 402" />
              </Field>
            </>
          )}

          <div className="col-span-2 border-t border-[#1E222B] pt-4">
            <Field label="Fotos do imóvel (a IA envia no WhatsApp para os interessados)">
              <UploadFotos />
            </Field>
          </div>

          <div className="col-span-2 pt-2">
            <SubmitButton>Cadastrar imóvel</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
