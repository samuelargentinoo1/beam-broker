import { exigirSessao } from "@/lib/sessao";
import { Card, PageHeader } from "@/components/ui";
import ImportarForm from "@/components/importar-form";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  await exigirSessao();

  return (
    <div>
      <PageHeader
        kicker="Carteira"
        title="Importar carteira por planilha"
        subtitle="Suba um CSV com seus imóveis (e proprietários) de uma vez — com fotos por URL para a IA já divulgar"
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 max-w-[980px] mx-auto">
        <Card className="p-6">
          <ImportarForm />
        </Card>

        <Card className="p-6 h-fit">
          <p className="text-sm font-semibold text-[#C9CFD8] mb-2">Colunas aceitas</p>
          <p className="text-[12px] text-[#9AA2AF] mb-3">
            A primeira linha é o cabeçalho. A ordem não importa e nomes com acento/maiúsculas são
            reconhecidos. Obrigatórias: <b>proprietário</b>, <b>CPF/CNPJ</b> e <b>endereço</b>.
          </p>
          <ul className="text-[12px] text-[#B4BBC5] space-y-1">
            <li><code className="text-[#8CF0B0]">proprietario</code>, <code className="text-[#8CF0B0]">cpf</code>, <code className="text-[#8CF0B0]">telefone</code>, <code className="text-[#8CF0B0]">pix</code>, <code className="text-[#8CF0B0]">email</code></li>
            <li><code className="text-[#8CF0B0]">tipo</code> (Apartamento/Casa/Sala comercial/Terreno)</li>
            <li><code className="text-[#8CF0B0]">codigo</code> (opcional — gerado se faltar)</li>
            <li><code className="text-[#8CF0B0]">endereco</code>, <code className="text-[#8CF0B0]">bairro</code>, <code className="text-[#8CF0B0]">cidade</code>, <code className="text-[#8CF0B0]">uf</code>, <code className="text-[#8CF0B0]">cep</code></li>
            <li><code className="text-[#8CF0B0]">finalidade</code> (Locação/Venda/Ambos)</li>
            <li><code className="text-[#8CF0B0]">aluguel</code>, <code className="text-[#8CF0B0]">venda</code>, <code className="text-[#8CF0B0]">condominio</code>, <code className="text-[#8CF0B0]">iptu</code></li>
            <li><code className="text-[#8CF0B0]">fotos</code> — URLs separadas por vírgula, ; ou |</li>
          </ul>
          <p className="text-[11px] text-[#7A828F] mt-3">
            Valores em R$ aceitam formato brasileiro (1.500,00) ou internacional (1500.00). As fotos
            precisam de URL pública (http/https) para a IA enviá-las no WhatsApp.
          </p>
        </Card>
      </div>
    </div>
  );
}
