// Motor de custo de IA. Módulo PURO: sem prisma, sem env, sem side effect.
// Roda no servidor (para projeção) e no cliente (para o simulador interativo).
//
// Os valores padrão abaixo foram MEDIDOS neste repositório, não estimados:
//   - system prompt de VENDAS: 4.116 chars ≈ 1.143 tokens
//   - system prompt de RECEPCAO: 1.440 chars ≈ 400 tokens
//   - system prompt de AJUDA_CORRETOR: 1.118 chars ≈ 310 tokens
//   - 20 tools definidas, média de 662 chars ≈ 184 tokens cada
//   - histórico slice(-40) de mensagens de WhatsApp ≈ 1.200 tokens
//
// Quando a telemetria real (tabela UsoIA) tiver 30 dias, calibre estes números
// com a média medida e o simulador vira previsão em vez de estimativa.

export type Modelo = "sonnet" | "haiku";

export type PrecoModelo = {
  entrada: number; // USD por milhão de tokens
  saida: number;
  cacheEscrita: number;
  cacheLeitura: number;
};

export const PRECOS: Record<Modelo, PrecoModelo> = {
  sonnet: { entrada: 3, saida: 15, cacheEscrita: 3.75, cacheLeitura: 0.3 },
  haiku: { entrada: 1, saida: 5, cacheEscrita: 1.25, cacheLeitura: 0.1 },
};

export type Agente =
  | "RECEPCAO"
  | "CAPTACAO"
  | "VENDAS"
  | "ADMINISTRACAO"
  | "COMPRA_VENDA"
  | "AJUDA_CORRETOR";

export type PerfilAgente = {
  agente: Agente;
  rotulo: string;
  modelo: Modelo;

  // Parte estável do system prompt: instruções, tom, regras genéricas.
  // É o que fica cacheável depois da reestruturação do prompt P3.2.
  promptEstavelTokens: number;

  // Parte variável: nome da IA, dados da imobiliária, contexto do cliente,
  // memória de longo prazo. Nunca cacheável — muda a cada conversa.
  promptVariavelTokens: number;

  // Schemas das ferramentas desse agente. Cacheável junto com o prompt estável.
  ferramentas: number;

  // Histórico de mensagens anexado a cada chamada.
  historicoTokens: number;

  // Tokens gerados pelo modelo por chamada.
  saidaTokens: number;

  // Quantas ferramentas o agente encadeia, em média, por turno do cliente.
  // Cada encadeamento é UMA chamada extra à API com o contexto inteiro de novo.
  toolCallsPorTurno: number;

  // Turnos (mensagens do cliente) numa conversa típica desse agente.
  turnosPorConversa: number;
};

const TOKENS_POR_TOOL = 184;

// Custo em tokens de um par tool_use + tool_result. Resultado de busca de
// imóveis é grande; direcionamento de atendimento é minúsculo.
const DELTA_TOOL = 320;

export const PERFIS_PADRAO: Record<Agente, PerfilAgente> = {
  RECEPCAO: {
    agente: "RECEPCAO",
    rotulo: "Recepção",
    modelo: "haiku",
    promptEstavelTokens: 340,
    promptVariavelTokens: 120,
    ferramentas: 1 * TOKENS_POR_TOOL,
    historicoTokens: 400,
    saidaTokens: 120,
    toolCallsPorTurno: 0.4,
    turnosPorConversa: 3,
  },
  ADMINISTRACAO: {
    agente: "ADMINISTRACAO",
    rotulo: "Administração",
    modelo: "haiku",
    promptEstavelTokens: 700,
    promptVariavelTokens: 260,
    ferramentas: 3 * TOKENS_POR_TOOL,
    historicoTokens: 700,
    saidaTokens: 220,
    toolCallsPorTurno: 0.9,
    turnosPorConversa: 5,
  },
  AJUDA_CORRETOR: {
    agente: "AJUDA_CORRETOR",
    rotulo: "Ajuda Corretor",
    modelo: "haiku",
    promptEstavelTokens: 280,
    promptVariavelTokens: 140,
    ferramentas: 3 * TOKENS_POR_TOOL,
    historicoTokens: 600,
    saidaTokens: 260,
    toolCallsPorTurno: 1.1,
    turnosPorConversa: 4,
  },
  CAPTACAO: {
    agente: "CAPTACAO",
    rotulo: "Captação",
    modelo: "sonnet",
    promptEstavelTokens: 900,
    promptVariavelTokens: 300,
    ferramentas: 6 * TOKENS_POR_TOOL,
    historicoTokens: 1100,
    saidaTokens: 280,
    toolCallsPorTurno: 0.8,
    turnosPorConversa: 14,
  },
  VENDAS: {
    agente: "VENDAS",
    rotulo: "Vendas (locação)",
    modelo: "sonnet",
    promptEstavelTokens: 1000,
    promptVariavelTokens: 340,
    ferramentas: 7 * TOKENS_POR_TOOL,
    historicoTokens: 1200,
    saidaTokens: 300,
    toolCallsPorTurno: 0.9,
    turnosPorConversa: 18,
  },
  COMPRA_VENDA: {
    agente: "COMPRA_VENDA",
    rotulo: "Compra e venda",
    modelo: "sonnet",
    promptEstavelTokens: 1000,
    promptVariavelTokens: 340,
    ferramentas: 6 * TOKENS_POR_TOOL,
    historicoTokens: 1200,
    saidaTokens: 320,
    toolCallsPorTurno: 0.9,
    turnosPorConversa: 22,
  },
};

// ─── Cenário de simulação ───────────────────────────────────────────────────

export type Cenario = {
  cachingAtivo: boolean;

  // Fração dos turnos em que o cache ainda está quente (TTL de 5 min).
  // Cliente respondendo rápido no WhatsApp: alto. Cliente que some por 1h: baixo.
  taxaAcertoCache: number; // 0..1

  usdBrl: number;

  // Volume mensal de CONVERSAS por agente
  volume: Record<Agente, number>;

  // Voz: percentual de respostas convertidas em áudio (ElevenLabs) e
  // percentual de mensagens recebidas que chegam como áudio (transcrição).
  pctRespostaEmAudio: number; // 0..1
  pctEntradaEmAudio: number; // 0..1
  charsPorRespostaAudio: number;
  usdPorMilCharsTts: number;
  usdPorMinutoTranscricao: number;
  minutosPorAudioRecebido: number;
};

export const CENARIO_PADRAO: Cenario = {
  cachingAtivo: true,
  taxaAcertoCache: 0.75,
  usdBrl: 5.6,
  volume: {
    RECEPCAO: 320,
    ADMINISTRACAO: 260,
    AJUDA_CORRETOR: 90,
    CAPTACAO: 40,
    VENDAS: 130,
    COMPRA_VENDA: 45,
  },
  pctRespostaEmAudio: 0.4,
  pctEntradaEmAudio: 0.25,
  charsPorRespostaAudio: 210,
  usdPorMilCharsTts: 0.11,
  usdPorMinutoTranscricao: 0.006,
  minutosPorAudioRecebido: 0.5,
};

// ─── Cálculo por conversa ───────────────────────────────────────────────────

export type CustoConversa = {
  chamadas: number;
  tokensEntradaCrus: number;
  tokensCacheEscrita: number;
  tokensCacheLeitura: number;
  tokensSaida: number;
  usdIa: number;
  usdVoz: number;
  usdTotal: number;
};

// Modelo de um TURNO: o cliente manda uma mensagem, o agente responde. Se ele
// encadeia N ferramentas, são N+1 chamadas à API — e cada chamada reenvia o
// contexto inteiro MAIS os resultados acumulados das ferramentas anteriores.
//
//   chamada 0:  base
//   chamada 1:  base + 1×delta
//   chamada k:  base + k×delta
//
// Total do turno = (N+1)·base + delta·N(N+1)/2
//
// É essa progressão quadrática que faz uma mensagem com 3 ferramentas custar
// muito mais que 4× uma mensagem simples. E é exatamente onde o cache paga.
function custoTurno(p: PerfilAgente, c: Cenario, cacheQuente: boolean) {
  const n = p.toolCallsPorTurno;
  const chamadas = 1 + n;

  const cacheavel = p.promptEstavelTokens + p.ferramentas;
  const naoCacheavel = p.promptVariavelTokens + p.historicoTokens;

  const acumuladoFerramentas = DELTA_TOOL * ((n * (n + 1)) / 2);

  let entradaCrus = 0;
  let cacheEscrita = 0;
  let cacheLeitura = 0;

  if (c.cachingAtivo) {
    if (cacheQuente) {
      cacheLeitura = cacheavel * chamadas;
    } else {
      // Primeira chamada grava o cache; as seguintes já leem.
      cacheEscrita = cacheavel;
      cacheLeitura = cacheavel * Math.max(0, chamadas - 1);
    }
    entradaCrus = naoCacheavel * chamadas + acumuladoFerramentas;
  } else {
    entradaCrus = (cacheavel + naoCacheavel) * chamadas + acumuladoFerramentas;
  }

  return {
    chamadas,
    entradaCrus,
    cacheEscrita,
    cacheLeitura,
    saida: p.saidaTokens * chamadas,
  };
}

export function custoPorConversa(
  p: PerfilAgente,
  c: Cenario,
  perfis: Record<Agente, PerfilAgente> = PERFIS_PADRAO
): CustoConversa {
  void perfis;
  const preco = PRECOS[p.modelo];

  const turnosQuentes = p.turnosPorConversa * c.taxaAcertoCache;
  const turnosFrios = p.turnosPorConversa - turnosQuentes;

  const q = custoTurno(p, c, true);
  const f = custoTurno(p, c, false);

  const entradaCrus = q.entradaCrus * turnosQuentes + f.entradaCrus * turnosFrios;
  const cacheEscrita = q.cacheEscrita * turnosQuentes + f.cacheEscrita * turnosFrios;
  const cacheLeitura = q.cacheLeitura * turnosQuentes + f.cacheLeitura * turnosFrios;
  const saida = q.saida * turnosQuentes + f.saida * turnosFrios;
  const chamadas = q.chamadas * p.turnosPorConversa;

  const usdIa =
    (entradaCrus * preco.entrada +
      saida * preco.saida +
      cacheEscrita * preco.cacheEscrita +
      cacheLeitura * preco.cacheLeitura) /
    1_000_000;

  // Voz: só entra no seu CMV se a chave for sua. Hoje a chave de voz é por
  // imobiliária, então este número é informativo — mostra o que o CLIENTE gasta.
  const respostas = p.turnosPorConversa;
  const charsTts = respostas * c.pctRespostaEmAudio * c.charsPorRespostaAudio;
  const minutosStt = p.turnosPorConversa * c.pctEntradaEmAudio * c.minutosPorAudioRecebido;
  const usdVoz =
    (charsTts / 1000) * c.usdPorMilCharsTts + minutosStt * c.usdPorMinutoTranscricao;

  return {
    chamadas,
    tokensEntradaCrus: entradaCrus,
    tokensCacheEscrita: cacheEscrita,
    tokensCacheLeitura: cacheLeitura,
    tokensSaida: saida,
    usdIa,
    usdVoz,
    usdTotal: usdIa + usdVoz,
  };
}

// ─── Consolidado mensal ─────────────────────────────────────────────────────

export type LinhaAgente = {
  agente: Agente;
  rotulo: string;
  modelo: Modelo;
  conversas: number;
  chamadas: number;
  tokens: number;
  brlPorConversa: number;
  brlIa: number;
  brlVoz: number;
};

export type Consolidado = {
  linhas: LinhaAgente[];
  brlIa: number;
  brlVoz: number;
  conversas: number;
  chamadas: number;
  tokens: number;
};

export function consolidarMes(
  c: Cenario,
  perfis: Record<Agente, PerfilAgente> = PERFIS_PADRAO,
  agentesAtivos?: Agente[]
): Consolidado {
  const ativos = agentesAtivos ?? (Object.keys(perfis) as Agente[]);
  const linhas: LinhaAgente[] = [];

  for (const a of ativos) {
    const p = perfis[a];
    const n = c.volume[a] ?? 0;
    if (n <= 0) continue;
    const custo = custoPorConversa(p, c);
    linhas.push({
      agente: a,
      rotulo: p.rotulo,
      modelo: p.modelo,
      conversas: n,
      chamadas: custo.chamadas * n,
      tokens:
        (custo.tokensEntradaCrus +
          custo.tokensCacheEscrita +
          custo.tokensCacheLeitura +
          custo.tokensSaida) *
        n,
      brlPorConversa: custo.usdIa * c.usdBrl,
      brlIa: custo.usdIa * c.usdBrl * n,
      brlVoz: custo.usdVoz * c.usdBrl * n,
    });
  }

  linhas.sort((x, y) => y.brlIa - x.brlIa);

  return {
    linhas,
    brlIa: linhas.reduce((s, l) => s + l.brlIa, 0),
    brlVoz: linhas.reduce((s, l) => s + l.brlVoz, 0),
    conversas: linhas.reduce((s, l) => s + l.conversas, 0),
    chamadas: linhas.reduce((s, l) => s + l.chamadas, 0),
    tokens: linhas.reduce((s, l) => s + l.tokens, 0),
  };
}

// ─── Análise de margem ──────────────────────────────────────────────────────

export type Margem = {
  receitaBrl: number;
  cmvIaBrl: number;
  infraBrl: number;
  margemBrl: number;
  margemPct: number | null;
  // Quantas conversas a mais até a margem zerar
  folgaConversas: number | null;
  // Custo marginal de uma conversa adicional (média ponderada)
  custoMarginalBrl: number;
};

export function analisarMargem(
  receitaBrl: number,
  cons: Consolidado,
  infraPorClienteBrl: number
): Margem {
  const margemBrl = receitaBrl - cons.brlIa - infraPorClienteBrl;
  const custoMarginal = cons.conversas > 0 ? cons.brlIa / cons.conversas : 0;
  return {
    receitaBrl,
    cmvIaBrl: cons.brlIa,
    infraBrl: infraPorClienteBrl,
    margemBrl,
    margemPct: receitaBrl > 0 ? (margemBrl / receitaBrl) * 100 : null,
    folgaConversas: custoMarginal > 0 ? Math.floor(margemBrl / custoMarginal) : null,
    custoMarginalBrl: custoMarginal,
  };
}

// Sensibilidade: o que acontece com a margem se o volume variar.
// Serve para responder "e se esse cliente usar o dobro?" — que é a pergunta
// que decide se a sua cota está bem dimensionada.
export function curvaSensibilidade(
  receitaBrl: number,
  c: Cenario,
  perfis: Record<Agente, PerfilAgente>,
  agentesAtivos: Agente[],
  infraPorClienteBrl: number,
  multiplicadores = [0.5, 0.75, 1, 1.5, 2, 3, 5]
) {
  return multiplicadores.map((m) => {
    const cenario: Cenario = {
      ...c,
      volume: Object.fromEntries(
        Object.entries(c.volume).map(([k, v]) => [k, Math.round(v * m)])
      ) as Record<Agente, number>,
    };
    const cons = consolidarMes(cenario, perfis, agentesAtivos);
    const margem = analisarMargem(receitaBrl, cons, infraPorClienteBrl);
    return { multiplicador: m, conversas: cons.conversas, ...margem };
  });
}

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
