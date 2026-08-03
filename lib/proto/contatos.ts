import type { Contato, FatorScore } from "./tipos";
import { BAIRROS, CORRETORES, IMOVEIS, imovelPorCodigo, semente } from "./base";

const NOMES = [
  "Fernanda Martins","Rodrigo Camargo","Juliana Souza","Paulo Mendes","Camila Barros","Thiago Nunes",
  "Beatriz Campos","Gustavo Rocha","Larissa Teixeira","Eduardo Pires","Mariana Duarte","Felipe Antunes",
  "Vanessa Correia","Bruno Salgado","Patrícia Amaral","Leonardo Vieira","Carolina Freitas","Rodrigo Bastos",
  "Aline Machado","Marcelo Tavares","Renata Guimarães","Diego Fontoura","Sabrina Lopes","Vinícius Cardoso",
  "Tatiane Ribeiro","André Peixoto","Cristina Vasques","Hugo Bittencourt","Débora Antunes","Sérgio Maia",
  "Elaine Cordeiro","Otávio Rangel","Simone Drummond","Fábio Queiroz","Natália Bergamo","Caio Sampaio",
  "Isabela Monteiro","Murilo Assunção","Letícia Paiva","Rogério Bandeira","Helena Castilho","Wagner Portela",
  "Adriana Sicsú","Nelson Peixoto","Bianca Rezende","Otávio Mesquita","Kelly Fagundes","Ronaldo Vilela",
  "Priscila Tavares","Anderson Muniz","Regina Toledo","Alexandre Prado","Milena Barcelos","Joaquim Neves",
  "Talita Ferrari","Emerson Braga","Luciana Dantas","Fabrício Menezes","Sônia Bragança","Everton Aguiar",
  "Rafaela Coelho","Cláudio Bessa","Manuela Farias","Nilson Trindade","Aline Rezende","Gilberto Amaro",
  "Cecília Prates","Wesley Marinho","Denise Aragão","Ivan Bonfim","Josiane Melo","Rubens Caldeira",
  "Marta Siqueira","Osvaldo Pinto","Viviane Lacerda","Célio Barreto","Suzana Vilar","Nestor Aguiar",
  "Iara Bonifácio","Douglas Peçanha","Rosana Vidigal","Elias Tramontina","Neusa Portela","Ademir Fontes",
  "Lorena Bittar","Cássio Vidal","Márcia Sanches","Fernando Bulhões","Tereza Gadelha","Ubiratan Melo",
  "Silvana Corte","Ariel Nogueira","Bento Ramires","Cíntia Valadares","Danilo Arruda","Estela Junqueira",
  "Fabiano Cerqueira","Gisele Damasceno","Heitor Sampaio","Ivete Marques","Jonas Belmonte","Kátia Rovere",
  "Luan Bezerra","Michele Tanaka","Nádia Peluso","Orlando Cruz","Paola Bertoldi","Quintino Nascimento",
  "Roberta Sampaio","Saulo Trevisan","Tânia Bandeira","Ulisses Meireles","Valéria Cotrim","Wilson Villagio",
  "Ximena Torres","Yuri Camargo","Zilda Fontenele","Alberto Nunes","Bruna Sartori","Cleber Andrade",
];

// Tons de avatar calibrados para fundo escuro: todos acima de 4.5:1 sobre #12141A.
const TONS = ["#7FA6FF","#C4A2FF","#5EDB8E","#F5B23D","#FF8FA3","#4FD8E8","#FF8FC7","#B0A0FF"];
const ORIGENS: Contato["origem"][] = ["Zap","Viva Real","OLX","Marketplace","Site","Instagram","Meta","Google","Indicação"];
const ESTAGIOS: Contato["estagio"][] = ["Novo","Qualificado","Em atendimento","Visita","Proposta","Fechado","Perdido"];

const iniciaisDe = (n: string) => {
  const p = n.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[p.length - 1]?.[0] ?? "")).toUpperCase();
};

// O score é a soma dos fatores — sempre. Nunca um número solto: é o que faz o
// corretor confiar nele, e é o que o popover mostra.
const somar = (f: FatorScore[]) => Math.max(0, Math.min(100, f.reduce((s, x) => s + x.pontos, 0)));

type Escrito = Partial<Contato> & { nome: string; fatores: FatorScore[] };

// ── Casos escritos à mão: aparecem nominalmente nas telas ──
const ESCRITOS: Escrito[] = [
  {
    nome: "Fernanda Martins",
    fatores: [
      { rotulo: "Urgência alta — contrato vence em 3 meses", pontos: 25 },
      { rotulo: "Renda compatível com o portfólio", pontos: 20 },
      { rotulo: "FGTS disponível (R$ 38k)", pontos: 15 },
      { rotulo: "Respondeu 8 de 9 mensagens", pontos: 22 },
      { rotulo: "Visitou 2 imóveis da carteira", pontos: 12 },
      { rotulo: "Não retornou o último contato", pontos: -3 },
    ],
    perfilFamiliar: "Casal, 2 filhos",
    renda: 14200, fgts: 38000, entrada: 95000,
    finalidade: "VENDA", quartosDesejados: 3, bairrosDesejados: ["Jardim Aclimação","Vila Harmonia"],
    tetoValor: 500000, urgenciaMeses: 3, origem: "Meta",
    estagio: "Visita", corretorId: "c2", criadoDiasAtras: 47, ultimaInteracaoDiasAtras: 1,
    respondidas: 8, enviadas: 9, imoveisCompativeis: ["AP-0455","CA-0118","AP-0771"],
  },
  {
    nome: "Rodrigo Camargo",
    fatores: [
      { rotulo: "Visita agendada para hoje", pontos: 28 },
      { rotulo: "Investidor — decide rápido", pontos: 14 },
      { rotulo: "Renda compatível", pontos: 16 },
      { rotulo: "Sem FGTS disponível", pontos: -6 },
      { rotulo: "Respondeu 5 de 7 mensagens", pontos: 16 },
    ],
    perfilFamiliar: "Solteiro, investidor",
    renda: 9800, fgts: 0, entrada: 70000,
    finalidade: "VENDA", quartosDesejados: 1, bairrosDesejados: ["Centro"],
    tetoValor: 280000, urgenciaMeses: 6, origem: "Zap",
    estagio: "Visita", corretorId: "c2", criadoDiasAtras: 22, ultimaInteracaoDiasAtras: 0,
    respondidas: 5, enviadas: 7, imoveisCompativeis: ["ST-0090"],
  },
  {
    nome: "Juliana Souza",
    fatores: [
      { rotulo: "Não informou renda", pontos: -12 },
      { rotulo: "Região indefinida", pontos: -8 },
      { rotulo: "Sem resposta há 4 dias", pontos: -10 },
      { rotulo: "Abriu o link do imóvel 3 vezes", pontos: 10 },
      { rotulo: "Faixa de aluguel declarada", pontos: 8 },
      { rotulo: "Lead novo (menos de 15 dias)", pontos: 12 },
    ],
    perfilFamiliar: "Não informado",
    renda: null, fgts: null, entrada: null,
    finalidade: "LOCACAO", quartosDesejados: null, bairrosDesejados: [],
    tetoValor: 1800, urgenciaMeses: null, origem: "OLX",
    estagio: "Novo", corretorId: "c2", criadoDiasAtras: 11, ultimaInteracaoDiasAtras: 4,
    respondidas: 2, enviadas: 6, imoveisCompativeis: ["AP-0163"],
  },
  {
    nome: "Camila Barros",
    fatores: [
      { rotulo: "Prometeu retorno ontem e não deu", pontos: -14 },
      { rotulo: "Renda alta para a faixa buscada", pontos: 22 },
      { rotulo: "FGTS disponível (R$ 52k)", pontos: 15 },
      { rotulo: "Respondeu 11 de 12 mensagens", pontos: 24 },
      { rotulo: "Já fez proposta em outro imóvel", pontos: 18 },
    ],
    perfilFamiliar: "Casal, sem filhos",
    renda: 18500, fgts: 52000, entrada: 140000,
    finalidade: "VENDA", quartosDesejados: 3, bairrosDesejados: ["Parque Residencial Damha","Jardim Botânico"],
    tetoValor: 720000, urgenciaMeses: 2, origem: "Indicação",
    estagio: "Proposta", corretorId: "c2", criadoDiasAtras: 63, ultimaInteracaoDiasAtras: 1,
    respondidas: 11, enviadas: 12, imoveisCompativeis: ["CA-0118","AP-0455"],
  },
  {
    nome: "Thiago Nunes",
    fatores: [
      { rotulo: "Match novo com 2 imóveis", pontos: 20 },
      { rotulo: "Renda compatível", pontos: 18 },
      { rotulo: "Aceita pet — reduz o estoque elegível", pontos: -4 },
      { rotulo: "Respondeu 6 de 6 mensagens", pontos: 24 },
      { rotulo: "Urgência média (6 meses)", pontos: 10 },
    ],
    perfilFamiliar: "Casal, 1 filho, 1 cachorro",
    renda: 7400, fgts: 0, entrada: null,
    finalidade: "LOCACAO", quartosDesejados: 2, bairrosDesejados: ["Bosque"],
    tetoValor: 2500, urgenciaMeses: 6, origem: "Viva Real",
    estagio: "Qualificado", corretorId: "c2", criadoDiasAtras: 8, ultimaInteracaoDiasAtras: 0,
    respondidas: 6, enviadas: 6, imoveisCompativeis: ["AP-0212","AP-0219"],
  },
  {
    nome: "Beatriz Campos",
    fatores: [
      { rotulo: "Sem resposta há 3 dias", pontos: -12 },
      { rotulo: "Estava em negociação avançada", pontos: 20 },
      { rotulo: "Renda compatível", pontos: 18 },
      { rotulo: "FGTS disponível", pontos: 15 },
      { rotulo: "Respondeu 9 de 13 mensagens", pontos: 14 },
    ],
    perfilFamiliar: "Mãe solo, 1 filho",
    renda: 8900, fgts: 24000, entrada: 45000,
    finalidade: "VENDA", quartosDesejados: 2, bairrosDesejados: ["Vila Xavier","Centro"],
    tetoValor: 340000, urgenciaMeses: 4, origem: "Zap",
    estagio: "Em atendimento", corretorId: "c2", criadoDiasAtras: 34, ultimaInteracaoDiasAtras: 3,
    respondidas: 9, enviadas: 13, imoveisCompativeis: ["ST-0090","AP-0302"],
  },
  {
    nome: "Gustavo Rocha",
    fatores: [
      { rotulo: "Baixa de preço em imóvel que ele viu", pontos: 22 },
      { rotulo: "Renda no limite da faixa", pontos: 8 },
      { rotulo: "Sem FGTS", pontos: -6 },
      { rotulo: "Respondeu 4 de 9 mensagens", pontos: 8 },
      { rotulo: "Sumiu por 21 dias e voltou", pontos: 12 },
    ],
    perfilFamiliar: "Solteiro",
    renda: 6200, fgts: 0, entrada: 30000,
    finalidade: "VENDA", quartosDesejados: 2, bairrosDesejados: ["Vila Melhado"],
    tetoValor: 300000, urgenciaMeses: 9, origem: "Instagram",
    estagio: "Em atendimento", corretorId: "c2", criadoDiasAtras: 78, ultimaInteracaoDiasAtras: 2,
    respondidas: 4, enviadas: 9, imoveisCompativeis: ["AP-0302"],
  },
  {
    nome: "Larissa Teixeira",
    fatores: [
      { rotulo: "Proposta enviada aguardando resposta", pontos: 26 },
      { rotulo: "Renda alta", pontos: 22 },
      { rotulo: "FGTS disponível", pontos: 15 },
      { rotulo: "Respondeu 14 de 15 mensagens", pontos: 25 },
    ],
    perfilFamiliar: "Casal, 3 filhos",
    renda: 22000, fgts: 61000, entrada: 180000,
    finalidade: "VENDA", quartosDesejados: 4, bairrosDesejados: ["Parque Residencial Damha"],
    tetoValor: 950000, urgenciaMeses: 2, origem: "Indicação",
    estagio: "Proposta", corretorId: "c1", criadoDiasAtras: 41, ultimaInteracaoDiasAtras: 1,
    respondidas: 14, enviadas: 15, imoveisCompativeis: ["CA-0118"],
  },
];

function montar(): Contato[] {
  const r = semente(77123);
  const lista: Contato[] = [];

  ESCRITOS.forEach((e, i) => {
    const fatores = e.fatores;
    lista.push({
      id: `ct${i + 1}`,
      nome: e.nome,
      iniciais: iniciaisDe(e.nome),
      cor: TONS[i % TONS.length]!,
      telefone: `(16) 9${8000 + Math.floor(r() * 1999)}-${1000 + Math.floor(r() * 8999)}`,
      score: somar(fatores),
      fatores,
      resumo: "",
      perfilFamiliar: e.perfilFamiliar ?? "Não informado",
      renda: e.renda ?? null,
      fgts: e.fgts ?? null,
      entrada: e.entrada ?? null,
      finalidade: e.finalidade ?? "VENDA",
      quartosDesejados: e.quartosDesejados ?? null,
      bairrosDesejados: e.bairrosDesejados ?? [],
      tetoValor: e.tetoValor ?? null,
      urgenciaMeses: e.urgenciaMeses ?? null,
      origem: (e.origem as Contato["origem"]) ?? "Site",
      estagio: e.estagio ?? "Novo",
      corretorId: e.corretorId ?? "c2",
      criadoDiasAtras: e.criadoDiasAtras ?? 10,
      ultimaInteracaoDiasAtras: e.ultimaInteracaoDiasAtras ?? 1,
      respondidas: e.respondidas ?? 0,
      enviadas: e.enviadas ?? 0,
      imoveisCompativeis: e.imoveisCompativeis ?? [],
    });
  });

  for (let i = ESCRITOS.length; i < 120; i++) {
    const nome = NOMES[i % NOMES.length]!;
    const venda = r() > 0.45;
    const renda = r() > 0.14 ? Math.round((3200 + r() * 22000) / 100) * 100 : null;
    const fgts = venda && r() > 0.45 ? Math.round((8000 + r() * 70000) / 1000) * 1000 : 0;
    const enviadas = 2 + Math.floor(r() * 14);
    const respondidas = Math.floor(enviadas * (0.15 + r() * 0.85));
    const urgencia = r() > 0.2 ? 1 + Math.floor(r() * 11) : null;
    const semResposta = Math.floor(r() * 26);

    const fatores: FatorScore[] = [];
    if (urgencia != null && urgencia <= 3) fatores.push({ rotulo: `Urgência alta (${urgencia} meses)`, pontos: 25 });
    else if (urgencia != null && urgencia <= 6) fatores.push({ rotulo: `Urgência média (${urgencia} meses)`, pontos: 12 });
    else fatores.push({ rotulo: "Sem prazo definido", pontos: -6 });

    if (renda == null) fatores.push({ rotulo: "Não informou renda", pontos: -12 });
    else if (renda > 12000) fatores.push({ rotulo: "Renda compatível com o portfólio", pontos: 20 });
    else if (renda > 6000) fatores.push({ rotulo: "Renda na faixa média", pontos: 12 });
    else fatores.push({ rotulo: "Renda abaixo da faixa buscada", pontos: -8 });

    if (fgts > 0) fatores.push({ rotulo: `FGTS disponível (${Math.round(fgts / 1000)}k)`, pontos: 15 });
    else if (venda) fatores.push({ rotulo: "Sem FGTS", pontos: -6 });

    const taxa = respondidas / enviadas;
    fatores.push({
      rotulo: `Respondeu ${respondidas} de ${enviadas} mensagens`,
      pontos: Math.round(taxa * 26),
    });
    if (semResposta > 7) fatores.push({ rotulo: `Sem resposta há ${semResposta} dias`, pontos: -14 });

    lista.push({
      id: `ct${i + 1}`,
      nome,
      iniciais: iniciaisDe(nome),
      cor: TONS[i % TONS.length]!,
      telefone: `(16) 9${8000 + Math.floor(r() * 1999)}-${1000 + Math.floor(r() * 8999)}`,
      score: somar(fatores),
      fatores,
      resumo: "",
      perfilFamiliar: ["Solteiro","Casal, sem filhos","Casal, 1 filho","Casal, 2 filhos","Mãe solo, 1 filho","Investidor"][Math.floor(r() * 6)]!,
      renda,
      fgts: venda ? fgts : null,
      entrada: venda && r() > 0.4 ? Math.round((20000 + r() * 160000) / 1000) * 1000 : null,
      finalidade: venda ? "VENDA" : "LOCACAO",
      quartosDesejados: r() > 0.12 ? 1 + Math.floor(r() * 4) : null,
      bairrosDesejados: r() > 0.18 ? [BAIRROS[Math.floor(r() * BAIRROS.length)]!] : [],
      tetoValor: venda ? Math.round((240000 + r() * 800000) / 5000) * 5000 : Math.round((1100 + r() * 4200) / 50) * 50,
      urgenciaMeses: urgencia,
      origem: ORIGENS[Math.floor(r() * ORIGENS.length)]!,
      estagio: ESTAGIOS[Math.floor(r() * ESTAGIOS.length)]!,
      corretorId: CORRETORES[Math.floor(r() * CORRETORES.length)]!.id,
      criadoDiasAtras: Math.floor(r() * 190),
      ultimaInteracaoDiasAtras: semResposta,
      respondidas,
      enviadas,
      imoveisCompativeis: [],
    });
  }

  // O resumo de uma linha é derivado, não digitado — assim nunca diverge dos campos.
  for (const c of lista) c.resumo = resumir(c);
  return lista;
}

export function resumir(c: Contato): string {
  const p: string[] = [c.perfilFamiliar];
  p.push(c.renda ? `renda ${c.renda.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}` : "não informou renda");
  if (c.fgts) p.push(`FGTS R$ ${Math.round(c.fgts / 1000)}k`);
  else if (c.finalidade === "VENDA") p.push("sem FGTS");
  if (c.quartosDesejados) {
    const onde = c.bairrosDesejados[0] ? ` no ${c.bairrosDesejados[0]}` : "";
    p.push(`${c.quartosDesejados} ${c.quartosDesejados === 1 ? "quarto" : "quartos"}${onde}`);
  } else if (c.bairrosDesejados.length === 0) {
    p.push("região indefinida");
  }
  if (c.finalidade === "LOCACAO" && c.tetoValor) {
    p.push(`locação até ${c.tetoValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`);
  }
  p.push(c.urgenciaMeses ? `urgência ${c.urgenciaMeses} ${c.urgenciaMeses === 1 ? "mês" : "meses"}` : "só pesquisando");
  return p.join(" · ");
}

export const CONTATOS: Contato[] = montar();
export const contatoPorId = (id: string) => CONTATOS.find((c) => c.id === id)!;
export const contatoPorNome = (nome: string) => CONTATOS.find((c) => c.nome === nome)!;

// Compatibilidade: usa a lista escrita à mão quando existe; senão CALCULA por
// finalidade, teto de valor, quartos e bairro. Assim todo contato tem sugestão,
// e as telas de match nunca aparecem vazias.
export const compativeis = (c: Contato) => {
  if (c.imoveisCompativeis.length)
    return c.imoveisCompativeis.map((cod) => imovelPorCodigo(cod)).filter(Boolean);

  const teto = c.tetoValor ?? Infinity;
  const candidatos = IMOVEIS.filter(
    (im) =>
      im.finalidade === c.finalidade &&
      im.status === "DISPONIVEL" &&
      im.preco <= teto * 1.05 &&
      (c.quartosDesejados == null || im.quartos >= c.quartosDesejados)
  );
  // Bairro desejado primeiro; depois o mais barato dentro do teto.
  const pontos = (im: (typeof IMOVEIS)[number]) =>
    (c.bairrosDesejados.includes(im.bairro) ? 100 : 0) + (teto === Infinity ? 0 : (teto - im.preco) / teto);
  return [...candidatos].sort((a, b) => pontos(b) - pontos(a)).slice(0, 3);
};

export const corDoScore = (s: number) =>
  s >= 70 ? "verde" : s >= 45 ? "ambar" : "vermelho";
