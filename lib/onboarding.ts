// Roteiros de onboarding por rota — tour REAL ancorado no DOM.
// Cada passo aponta para um elemento marcado com data-tour="alvo" na página
// (spotlight + balão), com título e descrição fiéis ao que a tela faz.
// Passos sem `alvo` são centrados (introdução/CTA).
//
// Ciente de estado: quando a imobiliária ainda não tem dados (`temDados=false`),
// o componente usa `descricaoVazio`/`cta` no lugar de narrar registros de exemplo.

export type PassoTour = {
  alvo?: string; // valor de data-tour="..." na página
  titulo: string;
  descricao: string;
  descricaoVazio?: string; // usado quando a carteira ainda está vazia
  cta?: { label: string; href: string };
};

export type Tour = { tela: string; passos: PassoTour[] };

const TOURS: Record<string, Tour> = {
  "/": {
    tela: "Dashboard",
    passos: [
      {
        alvo: "kpis",
        titulo: "Os indicadores da carteira",
        descricao:
          "Contratos ativos, vacância, inadimplência e repasses pendentes — a leitura rápida da operação, calculada a partir dos seus dados reais.",
        descricaoVazio:
          "Aqui ficam contratos ativos, vacância, inadimplência e repasses. Os números começam a aparecer assim que você cadastra imóveis e contratos.",
      },
      {
        alvo: "a-vencer",
        titulo: "Contratos a vencer",
        descricao:
          "Renovações e reajustes aparecem aqui com 90 dias de antecedência, para você agir antes do vencimento.",
      },
      {
        alvo: "acoes-rapidas",
        titulo: "Ações rápidas",
        descricao:
          "Atalhos para o fluxo do dinheiro: gerar faturas, confirmar repasses, ver inadimplência e abrir o atendimento por IA.",
      },
    ],
  },

  "/imoveis": {
    tela: "Imóveis",
    passos: [
      {
        titulo: "A carteira de imóveis",
        descricao:
          "Cada imóvel tem código, proprietário e status (disponível, alugado, em reforma). Clique no código para ver o detalhe.",
        descricaoVazio:
          "Ainda não há imóveis. Cadastre o primeiro — ele é a base para criar contratos e gerar faturas.",
        cta: { label: "Cadastrar imóvel", href: "/imoveis/novo" },
      },
    ],
  },

  "/contratos": {
    tela: "Contratos",
    passos: [
      {
        titulo: "Os contratos de locação",
        descricao:
          "Cada contrato liga um imóvel a um inquilino e guarda aluguel, taxa de administração, reajuste e vigência. Contratos perto do fim são sinalizados.",
        descricaoVazio:
          "Um contrato precisa de um imóvel disponível e de uma pessoa (inquilino). A partir dele o sistema gera faturas e repasses.",
        cta: { label: "Novo contrato", href: "/contratos/novo" },
      },
    ],
  },

  "/faturas": {
    tela: "Faturas",
    passos: [
      {
        titulo: "Faturas do mês",
        descricao:
          "“Gerar faturas do mês” emite aluguel, encargos e (quando houver) o seguro-fiança dos contratos ativos. Ao registrar o pagamento, multa e juros entram automaticamente e o repasse é criado.",
        descricaoVazio:
          "As faturas nascem dos contratos ativos. Crie um contrato e depois use “Gerar faturas do mês”.",
      },
    ],
  },

  "/repasses": {
    tela: "Repasses",
    passos: [
      {
        titulo: "Repasse ao proprietário",
        descricao:
          "Quando o aluguel é pago, o sistema desconta a taxa de administração e as manutenções e gera o repasse. Confirme a transferência para avisar o proprietário.",
      },
    ],
  },

  "/inadimplencia": {
    tela: "Inadimplência",
    passos: [
      {
        titulo: "Régua de cobrança",
        descricao:
          "Faturas em atraso aparecem com o aging (dias de atraso) e o valor já atualizado com multa e juros, para você cobrar com o cálculo pronto.",
      },
    ],
  },

  "/propostas": {
    tela: "Propostas",
    passos: [
      {
        titulo: "Propostas de locação",
        descricao:
          "Registre a proposta com prazo e garantia. Ao aprovar, o sistema pode converter a proposta em contrato e marcar o imóvel como alugado.",
      },
    ],
  },

  "/chaves": {
    tela: "Chaves",
    passos: [
      {
        titulo: "Controle de chaves",
        descricao:
          "Registre retirada e devolução de chaves por pessoa e imóvel. Devoluções atrasadas ficam sinalizadas.",
      },
    ],
  },

  "/ocorrencias": {
    tela: "Ocorrências",
    passos: [
      {
        titulo: "Ocorrências e manutenções",
        descricao:
          "Abra um chamado, defina o responsável pelo custo (inquilino ou proprietário) e o valor. Ao concluir, o custo entra sozinho no financeiro — na fatura do inquilino ou como desconto no repasse.",
      },
    ],
  },

  "/documentos": {
    tela: "Documentos",
    passos: [
      {
        titulo: "Documentos (GED)",
        descricao:
          "Arquive documentos por imóvel/contrato. Documentos com validade são avisados quando estão perto de vencer.",
      },
    ],
  },

  "/fiscal": {
    tela: "Fiscal",
    passos: [
      {
        titulo: "Obrigações fiscais",
        descricao:
          "Gere a DIMOB e o informe anual de rendimentos de aluguéis de cada proprietário, a partir dos pagamentos registrados no ano.",
      },
    ],
  },

  "/auditoria": {
    tela: "Auditoria",
    passos: [
      {
        titulo: "Trilha de auditoria",
        descricao:
          "Todas as ações relevantes ficam registradas — inclusive o que as IAs cadastram e alteram — para você acompanhar quem fez o quê e quando.",
      },
    ],
  },

  "/configuracoes": {
    tela: "Configurações",
    passos: [
      {
        titulo: "Regras da imobiliária",
        descricao:
          "Defina remuneração (taxa % ou 1º aluguel), multa/juros e seguro-fiança — os padrões dos novos contratos. Aqui também conecta o WhatsApp e testa a conexão.",
      },
    ],
  },
};

// Rotas de detalhe/criação usam um tour genérico curto (sem dados fictícios).
const TOUR_GENERICO: Record<string, Tour> = {
  "/imoveis/novo": {
    tela: "Novo imóvel",
    passos: [
      {
        titulo: "Cadastro do imóvel",
        descricao:
          "Preencha os dados e o proprietário. O código (ex.: AP-0001) é gerado automaticamente e o imóvel entra como Disponível.",
      },
    ],
  },
  "/contratos/novo": {
    tela: "Novo contrato",
    passos: [
      {
        titulo: "Novo contrato de locação",
        descricao:
          "Escolha imóvel e inquilino, defina aluguel, taxa, reajuste e garantia. O campo de contexto permite passar o histórico da negociação para a IA de administração continuar o atendimento.",
      },
    ],
  },
  "/imoveis/[id]": {
    tela: "Detalhe do imóvel",
    passos: [
      {
        titulo: "Ficha do imóvel",
        descricao:
          "Dados do imóvel, proprietário, contratos e histórico. Use a trilha no topo para voltar à lista de imóveis.",
      },
    ],
  },
  "/contratos/[id]": {
    tela: "Detalhe do contrato",
    passos: [
      {
        titulo: "Ficha do contrato",
        descricao:
          "Aqui você reajusta, gera o documento, envia para assinatura, registra seguros/aditivos e encerra o contrato quando necessário.",
      },
    ],
  },
};

export function tourDaRota(pathname: string): (Tour & { key: string }) | null {
  if (TOURS[pathname]) return { ...TOURS[pathname], key: pathname };
  if (TOUR_GENERICO[pathname]) return { ...TOUR_GENERICO[pathname], key: pathname };
  // rotas com segmento dinâmico: /imoveis/123 -> /imoveis/[id]
  for (const key of Object.keys(TOUR_GENERICO)) {
    if (!key.includes("[")) continue;
    const re = new RegExp("^" + key.replace(/\[[^\]]+\]/g, "[^/]+") + "$");
    if (re.test(pathname)) return { ...TOUR_GENERICO[key], key };
  }
  return null;
}
