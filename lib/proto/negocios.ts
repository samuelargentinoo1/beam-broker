import type { Atividade, ItemMeuDia, Negocio } from "./tipos";
import { CORRETORES, IMOVEIS, semente } from "./base";
import { CONTATOS, contatoPorNome } from "./contatos";

// Cada pipeline tem etapas próprias — é o que muda ao trocar o seletor no topo
// do kanban. Venda e locação não têm a mesma régua, e captação nem começa no
// mesmo lugar.
export const PIPELINES: Record<Negocio["pipeline"], string[]> = {
  Venda: ["Novo", "Qualificado", "Em atendimento", "Visita", "Proposta", "Fechado"],
  Locação: ["Novo", "Qualificado", "Visita", "Cadastro", "Análise", "Fechado"],
  Lançamento: ["Interesse", "Simulação", "Reserva", "Contrato", "Assinado", "Fechado"],
  Captação: ["Contato", "Visita técnica", "Autorização", "Fotos", "Publicado", "Fechado"],
};

export const MOTIVOS_PERDA = [
  "Sem crédito",
  "Achou mais barato",
  "Sumiu",
  "Comprou com concorrente",
  "Preço alto",
  "Desistiu",
  "Imóvel indisponível",
];

function montarNegocios(): Negocio[] {
  const r = semente(4242);
  const lista: Negocio[] = [];
  const etapasVenda = PIPELINES.Venda;

  // Negócios com nome — citados nas telas e no roteiro de demonstração.
  type Fixo = {
    nome: string;
    etapa: string;
    valor: number;
    imovelCod: string;
    diasParado: number;
    corretorId: string;
    proximaAtividade: string | null;
    probabilidade: number;
  };
  const fixos: Fixo[] = [
    { nome: "Fernanda Martins", etapa: "Visita", valor: 465000, imovelCod: "AP-0455", diasParado: 2, corretorId: "c2", proximaAtividade: "Visita hoje 14h", probabilidade: 0.55 },
    { nome: "Camila Barros", etapa: "Proposta", valor: 690000, imovelCod: "CA-0118", diasParado: 4, corretorId: "c2", proximaAtividade: "Retorno da proposta 30/07", probabilidade: 0.75 },
    { nome: "Larissa Teixeira", etapa: "Proposta", valor: 880000, imovelCod: "CA-0118", diasParado: 1, corretorId: "c1", proximaAtividade: "Assinatura 02/08", probabilidade: 0.8 },
    { nome: "Rodrigo Camargo", etapa: "Visita", valor: 268000, imovelCod: "ST-0090", diasParado: 0, corretorId: "c2", proximaAtividade: "Visita hoje 14h", probabilidade: 0.5 },
    { nome: "Beatriz Campos", etapa: "Em atendimento", valor: 335000, imovelCod: "AP-0302", diasParado: 9, corretorId: "c2", proximaAtividade: null, probabilidade: 0.3 },
    { nome: "Gustavo Rocha", etapa: "Em atendimento", valor: 298000, imovelCod: "AP-0302", diasParado: 14, corretorId: "c2", proximaAtividade: null, probabilidade: 0.2 },
    { nome: "Thiago Nunes", etapa: "Qualificado", valor: 2300, imovelCod: "AP-0212", diasParado: 1, corretorId: "c2", proximaAtividade: "Enviar 3 opções", probabilidade: 0.45 },
    { nome: "Juliana Souza", etapa: "Novo", valor: 1800, imovelCod: "AP-0163", diasParado: 4, corretorId: "c2", proximaAtividade: null, probabilidade: 0.1 },
  ];

  fixos.forEach((f, i) => {
    const ct = contatoPorNome(f.nome);
    const im = IMOVEIS.find((x) => x.codigo === f.imovelCod);
    lista.push({
      id: `ng${i + 1}`,
      contatoId: ct.id,
      titulo: `${ct.nome} — ${im?.codigo ?? "sem imóvel"}`,
      valor: f.valor,
      imovelId: im?.id ?? null,
      etapa: f.etapa,
      pipeline: ct.finalidade === "LOCACAO" ? "Locação" : "Venda",
      diasParado: f.diasParado,
      corretorId: f.corretorId,
      proximaAtividade: f.proximaAtividade,
      travadoPor: null,
      travadoAte: null,
      probabilidade: f.probabilidade,
    });
  });

  // A trava: dois corretores brigando pelo mesmo lead é o problema que ela evita.
  lista.push({
    id: "ng9",
    contatoId: contatoPorNome("Eduardo Pires").id,
    titulo: "Eduardo Pires — AP-0771",
    valor: 520000,
    imovelId: IMOVEIS.find((x) => x.codigo === "AP-0771")?.id ?? null,
    etapa: "Em atendimento",
    pipeline: "Venda",
    diasParado: 6,
    corretorId: "c1",
    proximaAtividade: "Ligar 29/07 10h",
    travadoPor: "Marcos",
    travadoAte: "12/08",
    probabilidade: 0.4,
  });

  const usados = new Set(lista.map((n) => n.contatoId));
  const candidatos = CONTATOS.filter((c) => !usados.has(c.id) && c.estagio !== "Perdido");

  for (let i = 0; i < 33; i++) {
    const ct = candidatos[Math.floor(r() * candidatos.length)]!;
    if (usados.has(ct.id)) continue;
    usados.add(ct.id);
    const loc = ct.finalidade === "LOCACAO";
    const im = IMOVEIS[Math.floor(r() * IMOVEIS.length)]!;
    const etapa = etapasVenda[Math.floor(r() * 5)]!;
    const parado = Math.floor(r() * 34);
    lista.push({
      id: `ng${lista.length + 1}`,
      contatoId: ct.id,
      titulo: `${ct.nome} — ${im.codigo}`,
      valor: loc ? ct.tetoValor ?? 2000 : ct.tetoValor ?? 380000,
      imovelId: im.id,
      etapa: loc ? PIPELINES.Locação[Math.floor(r() * 5)]! : etapa,
      pipeline: loc ? "Locação" : "Venda",
      diasParado: parado,
      corretorId: ct.corretorId,
      // ~35% sem próxima atividade — é o que acende a borda vermelha no card.
      proximaAtividade: r() > 0.35 ? ["Ligar amanhã", "Enviar opções", "Confirmar visita", "Retorno da proposta"][Math.floor(r() * 4)]! : null,
      travadoPor: null,
      travadoAte: null,
      probabilidade: [0.1, 0.2, 0.35, 0.5, 0.7][Math.floor(r() * 5)]!,
    });
  }
  // Lançamento e Captação: pipelines menores, mas o seletor não pode abrir vazio.
  const lancamento: Array<[string, string, number, string]> = [
    ["Residencial Aurora — unid. 402", "Interesse", 389000, "c1"],
    ["Residencial Aurora — unid. 1104", "Simulação", 452000, "c2"],
    ["Residencial Aurora — unid. 205", "Reserva", 378000, "c5"],
    ["Vista Damha — unid. 71", "Simulação", 612000, "c1"],
    ["Vista Damha — unid. 33", "Contrato", 598000, "c2"],
    ["Residencial Aurora — unid. 802", "Interesse", 401000, "c4"],
    ["Vista Damha — unid. 12", "Assinado", 640000, "c1"],
  ];
  lancamento.forEach(([titulo, etapa, valor, corretorId], k) => {
    lista.push({
      id: `nl${k + 1}`,
      contatoId: candidatos[k % candidatos.length]!.id,
      titulo,
      valor,
      imovelId: null,
      etapa,
      pipeline: "Lançamento",
      diasParado: Math.floor(r() * 20),
      corretorId,
      proximaAtividade: r() > 0.3 ? "Follow-up da simulação" : null,
      travadoPor: null,
      travadoAte: null,
      probabilidade: [0.2, 0.35, 0.6, 0.75, 0.9][Math.min(4, k)]!,
    });
  });

  // Captação: o negócio é o IMÓVEL entrando na carteira, não o comprador.
  const captacao: Array<[string, string, number, string]> = [
    ["Casa Jd. São Paulo — Helena Castilho", "Contato", 0, "c5"],
    ["Apto Vila Xavier — Sérgio Maia", "Visita técnica", 0, "c1"],
    ["Sobrado Damha — Família Bergamo", "Autorização", 0, "c2"],
    ["Apto Centro — Elaine Cordeiro", "Fotos", 0, "c5"],
    ["Casa Vila Harmonia — Otávio Rangel", "Fotos", 0, "c4"],
    ["Apto Bosque — Nelson Peixoto", "Publicado", 0, "c1"],
    ["Terreno Damha — WT Investimentos", "Visita técnica", 0, "c3"],
  ];
  captacao.forEach(([titulo, etapa, valor, corretorId], k) => {
    lista.push({
      id: `nc${k + 1}`,
      contatoId: candidatos[(k + 9) % candidatos.length]!.id,
      titulo,
      valor,
      imovelId: null,
      etapa,
      pipeline: "Captação",
      diasParado: Math.floor(r() * 26),
      corretorId,
      proximaAtividade: r() > 0.4 ? "Cobrar documentação do proprietário" : null,
      travadoPor: null,
      travadoAte: null,
      probabilidade: 0.5,
    });
  });

  return lista;
}

export const NEGOCIOS: Negocio[] = montarNegocios();

// ── Meu Dia: a fila de prioridade do corretor logado ──
export const MEU_DIA: ItemMeuDia[] = [
  {
    id: "md1",
    contatoId: contatoPorNome("Fernanda Martins").id,
    prioridade: 1,
    motivo: { tipo: "promessa", texto: "Você prometeu enviar o vídeo ontem às 20h e não enviou" },
    acoes: ["conversa", "ligar", "concluir", "adiar"],
    concluido: false,
    adiado: false,
  },
  {
    id: "md2",
    contatoId: contatoPorNome("Rodrigo Camargo").id,
    prioridade: 2,
    motivo: { tipo: "visita", texto: "Visita agendada hoje às 14h · Studio Centro" },
    acoes: ["conversa", "confirmar", "adiar"],
    concluido: false,
    adiado: false,
  },
  {
    id: "md3",
    contatoId: contatoPorNome("Camila Barros").id,
    prioridade: 3,
    motivo: { tipo: "retorno", texto: "Prometeu retorno ontem e não deu · proposta de R$ 690k parada" },
    acoes: ["conversa", "ligar", "concluir", "adiar"],
    concluido: false,
    adiado: false,
  },
  {
    id: "md4",
    contatoId: contatoPorNome("Thiago Nunes").id,
    prioridade: 4,
    motivo: { tipo: "match", texto: "Match novo com 2 imóveis no Bosque que aceitam pet" },
    acoes: ["conversa", "enviar", "adiar"],
    concluido: false,
    adiado: false,
  },
  {
    id: "md5",
    contatoId: contatoPorNome("Beatriz Campos").id,
    prioridade: 5,
    motivo: { tipo: "silencio", texto: "Não responde há 3 dias · estava em negociação avançada" },
    acoes: ["conversa", "ligar", "concluir", "adiar"],
    concluido: false,
    adiado: false,
  },
  {
    id: "md6",
    contatoId: contatoPorNome("Gustavo Rocha").id,
    prioridade: 6,
    motivo: { tipo: "match", texto: "Imóvel que ele viu em abril baixou 7% — agora cabe no orçamento" },
    acoes: ["conversa", "enviar", "adiar"],
    concluido: false,
    adiado: false,
  },
  {
    id: "md7",
    contatoId: contatoPorNome("Juliana Souza").id,
    prioridade: 7,
    motivo: { tipo: "ia", texto: "IA reengajou ontem às 19h · sem resposta há 4 dias" },
    acoes: ["conversa", "ia", "adiar"],
    concluido: false,
    adiado: false,
  },
  {
    id: "md8",
    contatoId: contatoPorNome("Larissa Teixeira").id,
    prioridade: 8,
    motivo: { tipo: "proposta", texto: "Proposta de R$ 880k aguardando assinatura em 02/08" },
    acoes: ["conversa", "concluir", "adiar"],
    concluido: false,
    adiado: false,
  },
  {
    id: "md9",
    contatoId: contatoPorNome("Eduardo Pires").id,
    prioridade: 9,
    motivo: { tipo: "silencio", texto: "Não responde há 6 dias · negócio travado por Marcos até 12/08" },
    acoes: ["conversa", "ligar", "adiar"],
    concluido: false,
    adiado: false,
  },
  {
    id: "md10",
    contatoId: contatoPorNome("Mariana Duarte").id,
    prioridade: 10,
    motivo: { tipo: "match", texto: "Match novo com 1 imóvel na faixa dela" },
    acoes: ["conversa", "enviar", "adiar"],
    concluido: false,
    adiado: false,
  },
  {
    id: "md11",
    contatoId: contatoPorNome("Felipe Antunes").id,
    prioridade: 11,
    motivo: { tipo: "silencio", texto: "Não responde há 9 dias · última interação foi uma visita" },
    acoes: ["conversa", "ligar", "concluir", "adiar"],
    concluido: false,
    adiado: false,
  },
];

// ── Atividades ──
export const ATIVIDADES: Atividade[] = [
  { id: "at1", tipo: "Visita", contatoId: contatoPorNome("Rodrigo Camargo").id, corretorId: "c2", quando: "14:00", dia: "hoje", contexto: "Studio Centro · ST-0090 · confirmada por WhatsApp ontem", criadaPelaIa: false, concluida: false },
  { id: "at2", tipo: "WhatsApp", contatoId: contatoPorNome("Fernanda Martins").id, corretorId: "c2", quando: "09:30", dia: "hoje", contexto: "Enviar o vídeo do AP-0455 prometido ontem às 20h", criadaPelaIa: false, concluida: false },
  { id: "at3", tipo: "Ligação", contatoId: contatoPorNome("Camila Barros").id, corretorId: "c2", quando: "11:00", dia: "hoje", contexto: "Cobrar retorno da proposta de R$ 690k enviada há 4 dias", criadaPelaIa: false, concluida: false },
  { id: "at4", tipo: "WhatsApp", contatoId: contatoPorNome("Thiago Nunes").id, corretorId: "c2", quando: "10:15", dia: "hoje", contexto: "Enviar os 2 matches novos no Bosque que aceitam pet", criadaPelaIa: true, notaIa: "A IA criou esta atividade porque 2 imóveis novos bateram no perfil dele hoje de manhã.", concluida: false },
  { id: "at5", tipo: "Ligação", contatoId: contatoPorNome("Beatriz Campos").id, corretorId: "c2", quando: "16:30", dia: "hoje", contexto: "3 dias sem resposta — estava em negociação avançada", criadaPelaIa: false, concluida: true },
  { id: "at6", tipo: "Proposta", contatoId: contatoPorNome("Larissa Teixeira").id, corretorId: "c2", quando: "17:00", dia: "hoje", contexto: "Montar minuta para assinatura em 02/08", criadaPelaIa: false, concluida: true },
  { id: "at7", tipo: "WhatsApp", contatoId: contatoPorNome("Mariana Duarte").id, corretorId: "c2", quando: "08:45", dia: "hoje", contexto: "Primeira resposta — lead entrou pelo Zap às 08:41", criadaPelaIa: true, notaIa: "A IA respondeu em 47 segundos e já qualificou faixa de preço e região.", concluida: true },

  { id: "at8", tipo: "Ligação", contatoId: contatoPorNome("Juliana Souza").id, corretorId: "c2", quando: "ontem, 15:00", dia: "atrasada", contexto: "Retorno prometido há 4 dias", criadaPelaIa: true, notaIa: "A IA reengajou este contato ontem às 19h porque a atividade estava vencida há 26h.", concluida: false },
  { id: "at9", tipo: "WhatsApp", contatoId: contatoPorNome("Gustavo Rocha").id, corretorId: "c2", quando: "26/07, 10:00", dia: "atrasada", contexto: "Avisar sobre a baixa de 7% no AP-0302", criadaPelaIa: false, concluida: false },
  { id: "at10", tipo: "Ligação", contatoId: contatoPorNome("Felipe Antunes").id, corretorId: "c2", quando: "24/07, 09:00", dia: "atrasada", contexto: "Pós-visita — nunca foi feito", criadaPelaIa: false, concluida: false },
  { id: "at11", tipo: "E-mail", contatoId: contatoPorNome("Eduardo Pires").id, corretorId: "c2", quando: "22/07, 14:00", dia: "atrasada", contexto: "Enviar comparativo de financiamento", criadaPelaIa: false, concluida: false },

  { id: "at12", tipo: "Visita", contatoId: contatoPorNome("Fernanda Martins").id, corretorId: "c2", quando: "29/07, 10:00", dia: "proximos", contexto: "Segunda visita ao AP-0455 com o marido", criadaPelaIa: false, concluida: false },
  { id: "at13", tipo: "Ligação", contatoId: contatoPorNome("Camila Barros").id, corretorId: "c2", quando: "30/07, 09:00", dia: "proximos", contexto: "Prazo final do retorno da proposta", criadaPelaIa: false, concluida: false },
  { id: "at14", tipo: "Proposta", contatoId: contatoPorNome("Larissa Teixeira").id, corretorId: "c2", quando: "02/08, 15:00", dia: "proximos", contexto: "Assinatura do contrato", criadaPelaIa: false, concluida: false },
  { id: "at15", tipo: "WhatsApp", contatoId: contatoPorNome("Thiago Nunes").id, corretorId: "c2", quando: "31/07, 11:00", dia: "proximos", contexto: "Follow-up dos matches enviados", criadaPelaIa: true, notaIa: "Agendada automaticamente 3 dias após o envio dos imóveis.", concluida: false },
  { id: "at16", tipo: "Visita", contatoId: contatoPorNome("Beatriz Campos").id, corretorId: "c2", quando: "01/08, 16:00", dia: "proximos", contexto: "Visita ao AP-0302 — se ela responder", criadaPelaIa: false, concluida: false },
];

export const corretorPorId = (id: string) => CORRETORES.find((c) => c.id === id)!;
