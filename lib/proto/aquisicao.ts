// Dados de aquisição: portais, criativos e a conta de ROI que ninguém tem hoje.

import { CONTATOS } from "./contatos";
import { IMOVEIS, semente } from "./base";

export type LeadPortal = {
  id: string;
  portal: "Zap" | "Viva Real" | "OLX" | "Marketplace";
  contatoId: string;
  imovelCodigo: string;
  chegouHa: string;
  segundosAteResposta: number;
  respondidoPor: "ia" | "corretor";
  qualificado: boolean;
};

// Cada portal com sua cor. Tons CLAROS: a sigla fica sobre um fundo tingido
// escuro, então a cor precisa ser o elemento luminoso — o inverso do tema claro.
export const COR_PORTAL: Record<string, { fundo: string; cor: string; sigla: string }> = {
  Zap: { fundo: "rgba(29,92,245,.18)", cor: "#7FA6FF", sigla: "ZAP" },
  "Viva Real": { fundo: "rgba(52,196,106,.16)", cor: "#5EDB8E", sigla: "VR" },
  OLX: { fundo: "rgba(185,140,255,.16)", cor: "#C4A2FF", sigla: "OLX" },
  Marketplace: { fundo: "rgba(245,178,61,.16)", cor: "#F5B23D", sigla: "MKT" },
};

function montarLeads(): LeadPortal[] {
  const r = semente(9911);
  const portais: LeadPortal["portal"][] = ["Zap", "Viva Real", "OLX", "Marketplace"];
  const quando = ["agora", "2 min", "14 min", "38 min", "1h", "2h", "3h", "5h", "hoje 08:41", "ontem 19:02"];
  return Array.from({ length: 26 }, (_, i) => {
    const ia = r() > 0.18;
    return {
      id: `lp${i + 1}`,
      portal: portais[Math.floor(r() * 4)]!,
      contatoId: CONTATOS[10 + Math.floor(r() * 100)]!.id,
      imovelCodigo: IMOVEIS[Math.floor(r() * IMOVEIS.length)]!.codigo,
      chegouHa: quando[Math.min(quando.length - 1, Math.floor(i / 3))]!,
      // O argumento da tela: a IA responde em segundos, o corretor em horas.
      segundosAteResposta: ia ? 18 + Math.floor(r() * 42) : 900 + Math.floor(r() * 14000),
      respondidoPor: ia ? "ia" : "corretor",
      qualificado: r() > 0.45,
    };
  });
}

export const LEADS_PORTAIS = montarLeads();

// ── ROI por portal: a conta que decide renovação de contrato ──
export const ROI_PORTAIS = [
  { portal: "Zap", custoMes: 4200, leads: 312, qualificados: 128, visitas: 41, vendas: 9 },
  { portal: "Viva Real", custoMes: 3800, leads: 268, qualificados: 111, visitas: 36, vendas: 7 },
  // O caro e ruim: 5 vezes o custo por venda do melhor. É a linha que justifica
  // a tela inteira.
  { portal: "Marketplace", custoMes: 5600, leads: 190, qualificados: 34, visitas: 7, vendas: 1 },
  { portal: "OLX", custoMes: 1400, leads: 141, qualificados: 52, visitas: 18, vendas: 4 },
].map((p) => ({ ...p, custoVenda: p.vendas ? Math.round(p.custoMes / p.vendas) : Infinity }));

export const ANUNCIOS_DOENTES = [
  {
    imovel: "Apto 302 · Centro",
    codigo: "AP-0302",
    sintoma: "847 impressões, 0 contatos",
    diagnostico: "Preço 18% acima dos comparáveis do bairro",
    acao: "Sugerir ajuste para R$ 365k",
    tom: "vermelho" as const,
  },
  {
    imovel: "Casa Vila Nova",
    codigo: "CA-0118",
    sintoma: "34 contatos, 0 visitas",
    diagnostico: "Fotos não correspondem ao imóvel — cliente desiste ao ver o endereço",
    acao: "Refazer o ensaio fotográfico",
    tom: "ambar" as const,
  },
];

// ── Criativos: ordenados por QUALIDADE do lead, não por volume ──
export type Criativo = {
  id: string;
  nome: string;
  canal: "Meta" | "Google" | "TikTok";
  cor: string;
  verba: number;
  leads: number;
  scoreMedio: number;
  vendas: number;
};

const _CRIATIVOS = [
  // O caso que prova a tese: o CPL mais barato traz o pior lead.
  { id: "cr1", nome: "Carrossel “imóveis a partir de R$ 190 mil”", canal: "Meta", cor: "#2A3F5F", verba: 2790, leads: 310, scoreMedio: 31, vendas: 0 },
  { id: "cr2", nome: "Vídeo tour AP-0455 Aclimação", canal: "Meta", cor: "#3A2F4F", verba: 2350, leads: 50, scoreMedio: 74, vendas: 3 },
  { id: "cr3", nome: "Simulador “quanto cabe no seu bolso”", canal: "Google", cor: "#2F4A3F", verba: 1980, leads: 74, scoreMedio: 68, vendas: 2 },
  { id: "cr4", nome: "Estático “alugue sem fiador”", canal: "Meta", cor: "#4A3A2F", verba: 1240, leads: 118, scoreMedio: 44, vendas: 1 },
  { id: "cr5", nome: "Depoimento de cliente — Damha", canal: "TikTok", cor: "#3F2F35", verba: 860, leads: 41, scoreMedio: 59, vendas: 1 },
  { id: "cr6", nome: "Busca “apartamento Araraquara”", canal: "Google", cor: "#2F3A4A", verba: 1620, leads: 63, scoreMedio: 71, vendas: 2 },
] as const;

export const CRIATIVOS: Criativo[] = _CRIATIVOS.map((c) => ({ ...c }));

export const cpl = (c: Criativo) => Math.round(c.verba / c.leads);
export const custoVenda = (c: Criativo) => (c.vendas ? Math.round(c.verba / c.vendas) : null);

// Jornada reconstruída de um lead — o argumento de que o último clique mente.
export const JORNADA = [
  { quando: "12/06", canal: "Instagram", oque: "Viu o carrossel e clicou no anúncio", custo: 9 },
  { quando: "12/06", canal: "Site", oque: "Navegou por 3 imóveis e saiu sem falar com ninguém", custo: 0 },
  { quando: "18/06", canal: "Google", oque: "Buscou “apartamento 3 quartos Aclimação” e voltou", custo: 47 },
  { quando: "18/06", canal: "Site", oque: "Usou o simulador de financiamento e informou o WhatsApp", custo: 0 },
  { quando: "18/06", canal: "WhatsApp", oque: "A IA qualificou: renda, FGTS e urgência", custo: 0 },
  { quando: "24/06", canal: "Visita", oque: "Visitou o AP-0455 com a Ana Julia", custo: 324 },
  { quando: "05/07", canal: "Fechamento", oque: "Proposta aceita — R$ 465.000", custo: 0 },
];

export const JORNADA_RESUMO = {
  dias: 23,
  custo: 380,
  comissao: 27000,
  contato: "Fernanda Martins",
};

export const RECOMENDACAO_VERBA = {
  valor: 5000,
  onde: "Vídeo tour AP-0455 + Simulador no Google",
  motivo:
    "São os dois criativos com score médio acima de 65 e custo por venda abaixo de R$ 1.000. O carrossel de R$ 190 mil consome 31% da verba, traz o maior volume e não gerou nenhuma venda em 3 meses.",
  estimativa: "2 a 3 vendas adicionais no mês",
};

// ── Segmentos salvos e safra de leads (tela de Contatos) ──
export const SEGMENTOS = [
  { id: "sg1", nome: "Renda acima de 12k com FGTS", filtro: (c: (typeof CONTATOS)[number]) => (c.renda ?? 0) >= 12000 && (c.fgts ?? 0) > 0 },
  { id: "sg2", nome: "Quentes sem contato há 15 dias", filtro: (c: (typeof CONTATOS)[number]) => c.score >= 65 && c.ultimaInteracaoDiasAtras >= 15 },
  { id: "sg3", nome: "Proprietários que não fecharam", filtro: (c: (typeof CONTATOS)[number]) => c.estagio === "Perdido" || (c.estagio === "Proposta" && c.ultimaInteracaoDiasAtras > 10) },
];

// A safra: 41% das vendas do mês vieram de leads com mais de 6 meses. É o número
// que justifica nunca descartar contato.
export const SAFRA = [
  { faixa: "0–30 dias", pctVendas: 18, leads: 312 },
  { faixa: "1–3 meses", pctVendas: 23, leads: 268 },
  { faixa: "3–6 meses", pctVendas: 18, leads: 214 },
  { faixa: "6–12 meses", pctVendas: 27, leads: 301 },
  { faixa: "+12 meses", pctVendas: 14, leads: 189 },
];

export const PCT_SAFRA_ANTIGA = SAFRA.filter((s) => s.faixa.startsWith("6") || s.faixa.startsWith("+"))
  .reduce((s, x) => s + x.pctVendas, 0);
