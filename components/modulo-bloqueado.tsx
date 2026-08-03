import { Card, PageHeader, ButtonLink } from "@/components/ui";
import type { Modulo } from "@/lib/planos";

// Tela mostrada quando o cliente acessa uma rota de módulo que não contratou.
// RENDERIZA, não redireciona: redirect silencioso confunde ("cliquei e voltei
// pro início"); a tela explicando o que aquilo resolve é o que converte.
//
// Sem preço aqui de propósito — preço é conversa comercial, não autoatendimento.

const TEXTO: Record<Modulo, { titulo: string; oQueFaz: string }> = {
  COMERCIAL: {
    titulo: "Comercial",
    oQueFaz:
      "Atende quem chega perguntando de imóvel: qualifica o interessado, agenda a visita e entrega o lead pronto para o corretor fechar.",
  },
};

export default function ModuloBloqueado({
  modulo,
  imobiliaria,
  numeros,
}: {
  modulo: Modulo;
  imobiliaria: { nome: string };
  // Dados reais desta imobiliária — é o que torna a tela um argumento, e não
  // um anúncio genérico.
  numeros?: { imoveis?: number; pessoas?: number; leads?: number };
}) {
  const t = TEXTO[modulo];
  const linhas: string[] = [];
  if (numeros?.imoveis != null && numeros.imoveis > 0) {
    linhas.push(
      `Você tem ${numeros.imoveis} ${numeros.imoveis === 1 ? "imóvel cadastrado" : "imóveis cadastrados"} e ${numeros.leads ?? 0} ${(numeros.leads ?? 0) === 1 ? "lead registrado" : "leads registrados"} aqui.`
    );
  }

  return (
    <div>
      <PageHeader
        kicker="módulo não contratado"
        title={t.titulo}
        subtitle={`Este módulo não faz parte do plano de ${imobiliaria.nome}.`}
      />
      <Card className="max-w-[640px]">
        <p className="m-0 mb-4 text-[14px] leading-relaxed text-[#C9CFD8]">{t.oQueFaz}</p>
        {linhas.map((l) => (
          <p key={l} className="m-0 mb-4 rounded-[12px] bg-[#14171D] px-4 py-3 text-[13px] text-[#9AA2AF]">
            {l}
          </p>
        ))}
        <p className="m-0 mb-5 text-[13px] leading-relaxed text-[#9AA2AF]">
          Para liberar, fale com a gente — a ativação é imediata e o que já está cadastrado
          continua no lugar.
        </p>
        <ButtonLink href="/configuracoes">Falar sobre o módulo</ButtonLink>
      </Card>
    </div>
  );
}
