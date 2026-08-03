import { FAIXAS_MCMV } from "@/lib/empreendimentos";
import { Field, inputClass } from "@/components/ui";

// Campos do empreendimento — os mesmos no cadastro e na edição, de propósito:
// dois formulários separados divergem, e aí um aceita um campo que o outro
// ignora em silêncio.
export type ValoresEmpreendimento = {
  nome?: string | null;
  construtora?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  pontoReferencia?: string | null;
  quartos?: number | null;
  banheiros?: number | null;
  suites?: number | null;
  vagas?: number | null;
  metragemM2?: number | null;
  precoAvaliacao?: number | null;
  faixasMcmv?: number[];
  obraIniciadaEm?: Date | null;
  prazoObraMeses?: number | null;
  toleranciaMeses?: number | null;
  entregaPrevista?: Date | null;
  observacoes?: string | null;
};

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const v = (x: string | number | null | undefined) => (x === null || x === undefined ? "" : String(x));

function Secao({ titulo, dica }: { titulo: string; dica?: string }) {
  return (
    <div className="col-span-2 mt-2 border-t border-[#1E222B] pt-4 first:mt-0 first:border-0 first:pt-0">
      <p className="label-caps m-0 !text-[9px] tracking-[.1em] text-[#9AA2AF]">{titulo}</p>
      {dica && <p className="m-0 mt-1 text-[12px] leading-relaxed text-[#7A828F]">{dica}</p>}
    </div>
  );
}

export default function CamposEmpreendimento({ valores = {} }: { valores?: ValoresEmpreendimento }) {
  const faixas = valores.faixasMcmv ?? [];
  return (
    <>
      <Secao titulo="Identificação" />
      <Field label="Nome do empreendimento">
        <input name="nome" required className={inputClass} defaultValue={v(valores.nome)} placeholder="Residencial Aurora" />
      </Field>
      <Field label="Construtora">
        <input name="construtora" required className={inputClass} defaultValue={v(valores.construtora)} />
      </Field>

      <Secao
        titulo="Localização"
        dica="O ponto de referência é como o cliente acha a obra — terreno sem número não localiza ninguém."
      />
      <div className="col-span-2">
        <Field label="Endereço">
          <input name="endereco" className={inputClass} defaultValue={v(valores.endereco)} placeholder="Av. Brasil, 1200" />
        </Field>
      </div>
      <Field label="Bairro">
        <input name="bairro" className={inputClass} defaultValue={v(valores.bairro)} />
      </Field>
      <Field label="CEP">
        <input name="cep" className={inputClass} defaultValue={v(valores.cep)} placeholder="00000-000" inputMode="numeric" />
      </Field>
      <Field label="Cidade">
        <input name="cidade" required className={inputClass} defaultValue={v(valores.cidade)} />
      </Field>
      <Field label="UF">
        <input name="uf" required maxLength={2} className={inputClass} defaultValue={v(valores.uf)} />
      </Field>
      <div className="col-span-2">
        <Field label="Ponto de referência">
          <input
            name="pontoReferencia"
            className={inputClass}
            defaultValue={v(valores.pontoReferencia)}
            placeholder="Em frente ao shopping, ao lado do posto"
          />
        </Field>
      </div>

      <Secao titulo="Produto" dica="Da unidade padrão. É por aqui que o comprador filtra." />
      <Field label="Quartos">
        <input name="quartos" type="number" min="0" step="1" className={inputClass} defaultValue={v(valores.quartos)} />
      </Field>
      <Field label="Banheiros">
        <input name="banheiros" type="number" min="0" step="1" className={inputClass} defaultValue={v(valores.banheiros)} />
      </Field>
      <Field label="Suítes">
        <input name="suites" type="number" min="0" step="1" className={inputClass} defaultValue={v(valores.suites)} />
      </Field>
      <Field label="Vagas de garagem">
        <input name="vagas" type="number" min="0" step="1" className={inputClass} defaultValue={v(valores.vagas)} />
      </Field>

      <Secao titulo="Metragem e preço" dica="Da unidade padrão. O R$/m² é calculado a partir dos dois." />
      <Field label="Metragem (m²)">
        <input name="metragemM2" type="number" step="0.01" min="0" className={inputClass} defaultValue={v(valores.metragemM2)} />
      </Field>
      <Field label="Preço de avaliação (R$)">
        <input
          name="precoAvaliacao"
          type="number"
          step="0.01"
          min="0"
          className={inputClass}
          defaultValue={v(valores.precoAvaliacao)}
        />
      </Field>

      <Secao
        titulo="Minha Casa Minha Vida"
        dica="A faixa é definida pela renda do comprador; o imóvel só define o teto. Marque as faixas que o empreendimento atende."
      />
      <div className="col-span-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {FAIXAS_MCMV.map((f) => (
          <label
            key={f.faixa}
            className="flex cursor-pointer items-start gap-2 rounded-[12px] border border-[#1E222B] bg-[#12141A] px-3 py-2.5 text-[12px] transition-colors hover:border-[#39414F]"
          >
            <input
              type="checkbox"
              name="faixasMcmv"
              value={f.faixa}
              defaultChecked={faixas.includes(f.faixa)}
              className="mt-[3px] accent-[#34C46A]"
            />
            <span>
              <span className="block font-medium text-[#F4F5F7]">{f.rotulo}</span>
              <span className="block text-[11px] text-[#7A828F]">
                renda até {f.rendaAte.toLocaleString("pt-BR")} · imóvel até{" "}
                {(f.tetoImovel / 1000).toLocaleString("pt-BR")} mil
              </span>
            </span>
          </label>
        ))}
      </div>

      <Secao
        titulo="Entrega"
        dica="Previsão é o que a construtora promete. Contratual é início da obra + prazo — é ela que gera direito. A real só existe depois de entregue, e fica em botão separado."
      />
      <Field label="Previsão da construtora">
        <input name="entregaPrevista" type="date" className={inputClass} defaultValue={iso(valores.entregaPrevista)} />
      </Field>
      <div />
      <Field label="Obra iniciada em (ou assinatura do contrato)">
        <input name="obraIniciadaEm" type="date" className={inputClass} defaultValue={iso(valores.obraIniciadaEm)} />
      </Field>
      <Field label="Prazo contratual (meses)">
        <input name="prazoObraMeses" type="number" min="0" step="1" className={inputClass} defaultValue={v(valores.prazoObraMeses)} placeholder="36" />
      </Field>
      <Field label="Tolerância de atraso (meses)">
        <input
          name="toleranciaMeses"
          type="number"
          min="0"
          max="12"
          step="1"
          className={inputClass}
          defaultValue={v(valores.toleranciaMeses ?? 6)}
        />
      </Field>
      <div />

      <div className="col-span-2">
        <Field label="Observações">
          <textarea name="observacoes" rows={3} className={inputClass} defaultValue={v(valores.observacoes)} />
        </Field>
      </div>
    </>
  );
}
