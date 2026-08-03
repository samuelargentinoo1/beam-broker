import type { Corretor, Imovel } from "./tipos";

// Gerador determinístico: o protótipo precisa mostrar sempre os mesmos números
// entre recarregamentos, senão nenhuma conversa sobre os dados se sustenta.
export function semente(n: number) {
  let s = n >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const BAIRROS = [
  "Centro",
  "Jardim Aclimação",
  "Vila Xavier",
  "Jardim América",
  "Vila Harmonia",
  "Jardim São Paulo",
  "Vila Furlan",
  "Santa Angelina",
  "Carmo",
  "Vila Melhado",
  "Parque Residencial Damha",
  "Jardim Botânico",
  "Vila Sedenho",
  "Jardim Nova Araraquara",
  "Bosque",
];

export const CORRETORES: Corretor[] = [
  {
    id: "c1",
    nome: "Marcos Tadeu Lima",
    iniciais: "ML",
    cor: "#3B82F6",
    perfil: "estrela",
    conversao: 5.8,
    tempoResposta: 6,
    execucaoPrazo: 94,
    negociosAbertos: 11,
    atividadesAtrasadas: 0,
    semProximaAcao: 1,
    vendasMes: 6,
    vgvMes: 3120000,
  },
  {
    id: "c2",
    nome: "Ana Julia Ferraz",
    iniciais: "AF",
    cor: "#A855F7",
    perfil: "mediano",
    conversao: 3.1,
    tempoResposta: 19,
    execucaoPrazo: 78,
    negociosAbertos: 14,
    atividadesAtrasadas: 3,
    semProximaAcao: 4,
    vendasMes: 3,
    vgvMes: 1340000,
  },
  {
    id: "c3",
    nome: "Ricardo Bastos",
    iniciais: "RB",
    cor: "#F59E0B",
    perfil: "fraco",
    conversao: 1.2,
    tempoResposta: 96,
    execucaoPrazo: 41,
    negociosAbertos: 23,
    atividadesAtrasadas: 12,
    semProximaAcao: 15,
    vendasMes: 1,
    vgvMes: 385000,
  },
  {
    id: "c4",
    nome: "Priscila Nogueira",
    iniciais: "PN",
    cor: "#EF4444",
    perfil: "fraco",
    conversao: 1.6,
    tempoResposta: 62,
    execucaoPrazo: 55,
    negociosAbertos: 17,
    atividadesAtrasadas: 8,
    semProximaAcao: 9,
    vendasMes: 1,
    vgvMes: 298000,
  },
  {
    id: "c5",
    nome: "Diego Fontes",
    iniciais: "DF",
    cor: "#22C55E",
    perfil: "novato",
    conversao: 2.4,
    tempoResposta: 14,
    execucaoPrazo: 86,
    negociosAbertos: 6,
    atividadesAtrasadas: 1,
    semProximaAcao: 2,
    vendasMes: 1,
    vgvMes: 410000,
  },
];

export const EU = CORRETORES[1]!; // o corretor logado no protótipo: a mediana

const TONS = ["#2A3F5F", "#3A2F4F", "#2F4A3F", "#4A3A2F", "#3F2F35", "#2F3A4A"];

const RUAS = [
  "Rua das Palmeiras",
  "Av. Brasil",
  "Rua Padre Duarte",
  "Rua Itália",
  "Av. São Paulo",
  "Rua Gonçalves Dias",
  "Rua Voluntários da Pátria",
  "Av. Bento de Abreu",
  "Rua Carlos Gomes",
  "Rua São Bento",
  "Av. Maria Antonia Camargo",
  "Rua Expedicionários do Brasil",
];

const PROPRIETARIOS = [
  "Carlos Andrade",
  "Márcia Oliveira",
  "WT Investimentos",
  "Helena Castilho",
  "Sérgio Maia",
  "Elaine Cordeiro",
  "Otávio Rangel",
  "Família Bergamo",
  "Nelson Peixoto",
  "Cláudia Vasques",
];

// ── 35 imóveis: venda e locação misturados, com casos doentes plantados ──
function montarImoveis(): Imovel[] {
  const r = semente(20260728);
  const lista: Imovel[] = [];

  // Casos com nome próprio — são citados nas telas e precisam ser estáveis.
  const fixos: Partial<Imovel>[] = [
    {
      codigo: "AP-0302",
      tipo: "Apartamento",
      finalidade: "VENDA",
      bairro: "Centro",
      quartos: 2,
      area: 68,
      preco: 445000,
      diasEstoque: 96,
      visualizacoes: 847,
      contatos: 0,
      visitas: 0,
      fotos: 9,
      descricaoTamanho: 340,
      curva: "B",
    },
    {
      codigo: "CA-0118",
      tipo: "Casa",
      finalidade: "VENDA",
      bairro: "Vila Nova",
      quartos: 3,
      area: 140,
      preco: 498000,
      diasEstoque: 61,
      visualizacoes: 512,
      contatos: 34,
      visitas: 0,
      fotos: 12,
      descricaoTamanho: 410,
      curva: "A",
    },
    {
      codigo: "AP-0771",
      tipo: "Apartamento",
      finalidade: "VENDA",
      bairro: "Jardim Aclimação",
      quartos: 3,
      area: 104,
      preco: 520000,
      diasEstoque: 112,
      visualizacoes: 340,
      contatos: 3,
      visitas: 0,
      fotos: 7,
      descricaoTamanho: 180,
      curva: "A",
    },
    {
      codigo: "AP-0455",
      tipo: "Apartamento",
      finalidade: "VENDA",
      bairro: "Jardim Aclimação",
      quartos: 3,
      area: 96,
      preco: 465000,
      diasEstoque: 24,
      visualizacoes: 620,
      contatos: 41,
      visitas: 9,
      fotos: 18,
      descricaoTamanho: 720,
      curva: "A",
    },
    {
      codigo: "ST-0090",
      tipo: "Studio",
      finalidade: "VENDA",
      bairro: "Centro",
      quartos: 1,
      area: 34,
      preco: 268000,
      diasEstoque: 18,
      visualizacoes: 410,
      contatos: 27,
      visitas: 6,
      fotos: 14,
      descricaoTamanho: 480,
      curva: "B",
    },
    {
      codigo: "AP-0212",
      tipo: "Apartamento",
      finalidade: "LOCACAO",
      bairro: "Bosque",
      quartos: 2,
      area: 62,
      preco: 2300,
      diasEstoque: 12,
      visualizacoes: 388,
      contatos: 22,
      visitas: 7,
      fotos: 16,
      descricaoTamanho: 520,
      curva: "A",
      aceitaPet: true,
    },
    {
      codigo: "AP-0219",
      tipo: "Apartamento",
      finalidade: "LOCACAO",
      bairro: "Bosque",
      quartos: 2,
      area: 58,
      preco: 2450,
      diasEstoque: 31,
      visualizacoes: 295,
      contatos: 14,
      visitas: 4,
      fotos: 13,
      descricaoTamanho: 460,
      curva: "B",
      aceitaPet: true,
    },
    {
      codigo: "AP-0163",
      tipo: "Apartamento",
      finalidade: "LOCACAO",
      bairro: "Jardim São Paulo",
      quartos: 2,
      area: 55,
      preco: 2100,
      diasEstoque: 9,
      visualizacoes: 260,
      contatos: 19,
      visitas: 5,
      fotos: 15,
      descricaoTamanho: 500,
      curva: "A",
    },
    {
      codigo: "AP-0164",
      tipo: "Apartamento",
      finalidade: "LOCACAO",
      bairro: "Jardim São Paulo",
      quartos: 2,
      area: 52,
      preco: 2200,
      diasEstoque: 44,
      visualizacoes: 180,
      contatos: 8,
      visitas: 2,
      fotos: 11,
      descricaoTamanho: 380,
      curva: "B",
    },
  ];

  fixos.forEach((f, i) => {
    lista.push(completar(f, i, r));
  });

  const tipos: Imovel["tipo"][] = ["Apartamento", "Casa", "Studio", "Sobrado", "Cobertura", "Terreno"];
  for (let i = fixos.length; i < 35; i++) {
    const venda = r() > 0.42;
    const tipo = tipos[Math.floor(r() * (venda ? 6 : 4))]!;
    const quartos = tipo === "Studio" ? 1 : 1 + Math.floor(r() * 4);
    const area = tipo === "Studio" ? 28 + Math.floor(r() * 18) : 45 + Math.floor(r() * 180);
    const preco = venda
      ? Math.round((210000 + r() * 990000) / 5000) * 5000
      : Math.round((900 + r() * 5200) / 50) * 50;
    lista.push(
      completar(
        {
          codigo: `${tipo.slice(0, 2).toUpperCase()}-${String(1000 + Math.floor(r() * 8999))}`,
          tipo,
          finalidade: venda ? "VENDA" : "LOCACAO",
          bairro: BAIRROS[Math.floor(r() * BAIRROS.length)]!,
          quartos,
          area,
          preco,
          diasEstoque: Math.floor(r() * 190),
          visualizacoes: 40 + Math.floor(r() * 900),
          contatos: Math.floor(r() * 45),
          visitas: Math.floor(r() * 12),
          fotos: 3 + Math.floor(r() * 20),
          descricaoTamanho: 90 + Math.floor(r() * 700),
          curva: (["A", "B", "C"] as const)[Math.floor(r() * 3)]!,
        },
        i,
        r
      )
    );
  }
  return lista;
}

function completar(f: Partial<Imovel>, i: number, r: () => number): Imovel {
  const venceEm = r();
  return {
    id: `im${i + 1}`,
    codigo: f.codigo ?? `IM-${i}`,
    tipo: f.tipo ?? "Apartamento",
    finalidade: f.finalidade ?? "VENDA",
    bairro: f.bairro ?? "Centro",
    endereco: `${RUAS[Math.floor(r() * RUAS.length)]}, ${100 + Math.floor(r() * 1800)}`,
    quartos: f.quartos ?? 2,
    vagas: Math.floor(r() * 3),
    area: f.area ?? 70,
    preco: f.preco ?? 350000,
    condominio: f.finalidade === "LOCACAO" || (f.preco ?? 0) < 10000 ? 280 + Math.floor(r() * 700) : 380 + Math.floor(r() * 900),
    iptu: 60 + Math.floor(r() * 320),
    diasEstoque: f.diasEstoque ?? Math.floor(r() * 120),
    visualizacoes: f.visualizacoes ?? 200,
    contatos: f.contatos ?? 10,
    visitas: f.visitas ?? 2,
    fotos: f.fotos ?? 12,
    descricaoTamanho: f.descricaoTamanho ?? 300,
    geolocalizado: r() > 0.28,
    tourVirtual: r() > 0.7,
    autorizacaoVence: venceEm > 0.78 ? `${5 + Math.floor(r() * 25)}/08` : null,
    curva: f.curva ?? "B",
    proprietario: PROPRIETARIOS[Math.floor(r() * PROPRIETARIOS.length)]!,
    status: r() > 0.9 ? "RESERVADO" : "DISPONIVEL",
    aceitaPet: f.aceitaPet ?? r() > 0.6,
    cor: TONS[Math.floor(r() * TONS.length)]!,
  };
}

export const IMOVEIS: Imovel[] = montarImoveis();

export const porId = <T extends { id: string }>(lista: T[], id: string | null) =>
  lista.find((x) => x.id === id);

export const imovelPorCodigo = (codigo: string) => IMOVEIS.find((i) => i.codigo === codigo);

// ── Saúde do anúncio: a conta é exposta na tela 8, então mora aqui ──
export function saudeAnuncio(im: Imovel) {
  const faltas: { rotulo: string; pontos: number }[] = [];
  let score = 100;
  if (im.fotos < 12) {
    const p = Math.min(20, (12 - im.fotos) * 5);
    faltas.push({ rotulo: `Faltam ${12 - im.fotos} fotos`, pontos: -p });
    score -= p;
  }
  if (im.descricaoTamanho < 200) {
    faltas.push({ rotulo: "Descrição com menos de 200 caracteres", pontos: -15 });
    score -= 15;
  }
  if (!im.geolocalizado) {
    faltas.push({ rotulo: "Sem geolocalização", pontos: -10 });
    score -= 10;
  }
  if (!im.tourVirtual) {
    faltas.push({ rotulo: "Sem tour virtual", pontos: -8 });
    score -= 8;
  }
  if (im.visualizacoes > 300 && im.contatos === 0) {
    faltas.push({ rotulo: "Muita vitrine e nenhum contato — preço fora da faixa", pontos: -18 });
    score -= 18;
  }
  return { score: Math.max(0, score), faltas, publicavel: score >= 70 };
}

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const brlCheio = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const mil = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 0)}k` : brl(v);
