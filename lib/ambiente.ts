// O som da sala atrás da voz — SINTETIZADO, sem nenhum arquivo de áudio.
//
// Por que sintetizar em vez de embarcar gravações: não tem licenciamento, não
// pesa no repositório, e — o que mais importa — nunca se repete igual. Um mesmo
// arquivo de "ruído de escritório" tocando atrás de todo áudio vira uma
// assinatura reconhecível depois da terceira nota de voz.
//
// Tudo aqui é gerado a partir de uma SEMENTE (o texto do áudio), então a mesma
// mensagem produz o mesmo ambiente — reenviar não muda o cenário — mas
// mensagens diferentes soam diferentes.

// ─── Aleatoriedade com semente ──────────────────────────────────────────────
//
// Math.random() não serve: sem semente, o mesmo áudio sairia diferente a cada
// tentativa e nenhum teste conseguiria travar nada. Este é um mulberry32,
// pequeno e de distribuição boa o bastante para ruído.
export function geradorAleatorio(semente: string): () => number {
  let h = 1779033703 ^ semente.length;
  for (let i = 0; i < semente.length; i++) {
    h = Math.imul(h ^ semente.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Ruído rosa ─────────────────────────────────────────────────────────────
//
// Ruído BRANCO soa como chiado de rádio fora de estação e denuncia na hora.
// Ruído ROSA (energia caindo 3 dB por oitava) é o que uma sala real produz — é
// o som do ar, do prédio, do próprio microfone. Aproximação de Voss-McCartney
// com filtro de Paul Kellet: barato e convincente.
export function ruidoRosa(amostras: number, rnd: () => number): Float32Array {
  const saida = new Float32Array(amostras);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < amostras; i++) {
    const branco = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + branco * 0.0555179;
    b1 = 0.99332 * b1 + branco * 0.0750759;
    b2 = 0.969 * b2 + branco * 0.153852;
    b3 = 0.8665 * b3 + branco * 0.3104856;
    b4 = 0.55 * b4 + branco * 0.5329522;
    b5 = -0.7616 * b5 - branco * 0.016898;
    saida[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + branco * 0.5362) * 0.11;
    b6 = branco * 0.115926;
  }
  return saida;
}

// ─── Filtros ────────────────────────────────────────────────────────────────
//
// O que separa AMBIENTE de CHIADO é a faixa de frequência, não o volume.
//
// Ruído contínuo de banda larga com energia de 2 a 8 kHz é chiado — e é
// exatamente onde o ouvido humano é mais sensível. Uma sala fechada de verdade
// produz RUMOR: ar-condicionado, tráfego longe, o prédio. Quase nada acima de
// 500 Hz. Por isso todo leito passa por passa-baixa forte antes de sair daqui.

export function passaBaixa(x: Float32Array, hz: number, taxa: number): Float32Array {
  const rc = 1 / (2 * Math.PI * hz);
  const dt = 1 / taxa;
  const alfa = dt / (rc + dt);
  const y = new Float32Array(x.length);
  let anterior = 0;
  for (let i = 0; i < x.length; i++) {
    anterior = anterior + alfa * (x[i]! - anterior);
    y[i] = anterior;
  }
  return y;
}

export function passaAlta(x: Float32Array, hz: number, taxa: number): Float32Array {
  const rc = 1 / (2 * Math.PI * hz);
  const dt = 1 / taxa;
  const alfa = rc / (rc + dt);
  const y = new Float32Array(x.length);
  let ax = 0;
  let ay = 0;
  for (let i = 0; i < x.length; i++) {
    y[i] = alfa * (ay + x[i]! - ax);
    ax = x[i]!;
    ay = y[i]!;
  }
  return y;
}

// Dois polos em série: um polo só deixa vazar agudo demais, e é justamente o
// agudo que vira chiado.
function passaBaixaForte(x: Float32Array, hz: number, taxa: number): Float32Array {
  return passaBaixa(passaBaixa(x, hz, taxa), hz, taxa);
}

// Acima disso, ruído contínuo deixa de ser sala e vira chiado.
export const TETO_DO_LEITO_HZ = 450;

// ─── Cenários ───────────────────────────────────────────────────────────────
//
// Escritório de imobiliária, variando pela hora do dia. Quem fala de imóvel às
// 15h está numa sala com gente; às 19h a sala já esvaziou.

export type Cenario = {
  nome: string;
  // Nível do leito, em dB ABAIXO DA VOZ. Relativo e não absoluto: o valor
  // escrito aqui é o que sai de verdade, independentemente de quanta pausa a
  // frase tem (ver a ordem da mixagem em lib/audio-producao.ts).
  leitoDb: number;
  // Quantos eventos reconhecíveis aparecem. Mínimo 1: é o EVENTO que diz "tem
  // um lugar aqui" — o leito sozinho só diz "tem um ruído aqui".
  eventosMin: number;
  eventosMax: number;
  tipos: TipoEvento[];
};

export type TipoEvento = "teclado" | "porta" | "cadeira" | "vozAoLonge" | "telefone" | "papel";

export function cenarioPorHora(hora: number): Cenario {
  // Manhã: escritório enchendo, mais movimento e mais papel.
  if (hora < 12)
    return {
      nome: "manhã no escritório",
      leitoDb: -30,
      eventosMin: 1,
      eventosMax: 3,
      tipos: ["teclado", "papel", "porta", "vozAoLonge"],
    };
  // Tarde: o pico. Telefone tocando, gente falando.
  if (hora < 18)
    return {
      nome: "tarde no escritório",
      leitoDb: -28,
      eventosMin: 2,
      eventosMax: 3,
      tipos: ["teclado", "telefone", "vozAoLonge", "cadeira"],
    };
  // Fim de dia: a sala esvaziou, mas ainda tem alguém.
  return {
    nome: "fim de dia",
    leitoDb: -33,
    eventosMin: 1,
    eventosMax: 2,
    tipos: ["teclado", "cadeira", "porta"],
  };
}

// ─── Eventos ────────────────────────────────────────────────────────────────
//
// São os eventos que dizem "tem um LUGAR aqui". O leito sozinho só diz "tem um
// ruído aqui" — e ruído sem lugar é chiado.
//
// Por que dá para subir os eventos e baixar o leito ao mesmo tempo: evento é
// TRANSIENTE. Um clique de teclado com energia em 2 kHz dura 8 ms e o ouvido lê
// como "teclado". O mesmo conteúdo espectral em ruído CONTÍNUO vira chiado. A
// diferença não é o volume, é a duração.
//
// Por isso cada evento tem faixa própria: teclado e telefone mantêm médio
// (é o que os torna reconhecíveis), porta e cadeira ficam graves, e a voz ao
// longe é abafada como som que atravessou uma parede.

// `ganho` é o PICO do evento em múltiplos do RMS do chão de sala.
//
// Precisa ser relativo, e não absoluto: cada gerador produz amplitude própria
// (um clique curto tem pico alto, um murmúrio longo tem pico baixo), então
// comparar números crus não dizia nada. O resultado era evento ENTERRADO no
// chão — que é como sobra só o chiado.
//
// Referência: ruído rosa normalizado a RMS 1 tem picos por volta de 3 a 4. Para
// um evento ser ouvido como evento, o pico dele precisa passar disso com folga.
type Evento = { amostras: Float32Array; ganho: number };

function envelope(n: number, ataque: number, queda: number): Float32Array {
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    e[i] = i < ataque ? i / ataque : Math.exp(-(i - ataque) / queda);
  }
  return e;
}

function gerarEvento(tipo: TipoEvento, taxa: number, rnd: () => number): Evento {
  const ms = (x: number) => Math.round((x * taxa) / 1000);
  switch (tipo) {
    case "teclado": {
      // Três a cinco cliques secos, espaçados como quem digita.
      const total = ms(700);
      const a = new Float32Array(total);
      const cliques = 3 + Math.floor(rnd() * 3);
      for (let c = 0; c < cliques; c++) {
        const em = Math.floor(rnd() * (total - ms(20)));
        const dur = ms(8);
        const env = envelope(dur, 2, dur / 4);
        for (let i = 0; i < dur; i++) a[em + i] += (rnd() * 2 - 1) * env[i]!;
      }
      // Tira o agudo extremo mas MANTÉM o médio: é o médio que faz o ouvido
      // reconhecer "teclado" em vez de ouvir um estalo qualquer. São 8 ms por
      // clique — transiente curto não vira chiado.
      return { amostras: passaBaixa(a, 4500, taxa), ganho: 9 };
    }
    case "porta": {
      const dur = ms(260);
      const a = new Float32Array(dur);
      const env = envelope(dur, ms(12), dur / 3);
      let anterior = 0;
      for (let i = 0; i < dur; i++) {
        // Passa-baixa forte: porta é grave, e grave ao longe é o que se ouve.
        anterior = anterior * 0.93 + (rnd() * 2 - 1) * 0.07;
        a[i] = anterior * env[i]!;
      }
      // Porta é grave, e grave é o que atravessa parede.
      return { amostras: passaBaixa(a, 700, taxa), ganho: 13 };
    }
    case "cadeira": {
      const dur = ms(400);
      const a = new Float32Array(dur);
      const env = envelope(dur, ms(60), dur / 2);
      let anterior = 0;
      for (let i = 0; i < dur; i++) {
        anterior = anterior * 0.8 + (rnd() * 2 - 1) * 0.2;
        a[i] = anterior * env[i]! * 0.6;
      }
      return { amostras: passaBaixa(a, 900, taxa), ganho: 8 };
    }
    case "vozAoLonge": {
      // Voz abafada: ruído modulado numa cadência de fala, sem nenhuma sílaba
      // reconhecível. Palavra entendível no fundo rouba a atenção.
      const dur = ms(1600);
      const a = new Float32Array(dur);
      // O envelope é calculado UMA vez. Dentro do laço ele alocaria um array de
      // `dur` amostras por amostra — custo quadrático, que num áudio de 1,4 s a
      // 32 kHz são dois bilhões de operações e trava a geração inteira.
      const env = envelope(dur, ms(150), dur);
      for (let i = 0; i < dur; i++) {
        const silaba = 0.45 + 0.55 * Math.sin((i / taxa) * 2 * Math.PI * 4.2);
        a[i] = (rnd() * 2 - 1) * silaba * env[i]!;
      }
      // Passa-baixa em 1,4 kHz: é assim que uma conversa soa ATRAVÉS de uma
      // sala. Sem isso a "voz ao longe" fica sibilante e vira chiado modulado —
      // e continua sem nenhuma sílaba entendível, que é o objetivo.
      return { amostras: passaBaixa(a, 1400, taxa), ganho: 7 };
    }
    case "telefone": {
      // Toque ao longe: dois bipes de tom, bem filtrados.
      const dur = ms(900);
      const a = new Float32Array(dur);
      for (let i = 0; i < dur; i++) {
        const t = i / taxa;
        const ligado = t % 0.5 < 0.22 ? 1 : 0;
        a[i] = Math.sin(2 * Math.PI * 1100 * t) * 0.02 * ligado;
      }
      // Tom puro, sem ruído nenhum: nunca contribui para chiado.
      return { amostras: a, ganho: 10 };
    }
    case "papel": {
      const dur = ms(500);
      const a = new Float32Array(dur);
      const env = envelope(dur, ms(40), dur / 3);
      for (let i = 0; i < dur; i++) a[i] = (rnd() * 2 - 1) * env[i]! * 0.35;
      // Papel tem agudo por natureza, mas dura meio segundo: fica abaixo de
      // 3 kHz para não somar ao chiado.
      return { amostras: passaBaixa(a, 3000, taxa), ganho: 7 };
    }
  }
}

// Monta o leito completo: chão de ruído contínuo + eventos esparsos.
// `duracao` em amostras.
// Devolve o leito com RMS 1 (normalizado). Quem chama decide o nível, porque o
// nível certo é RELATIVO À VOZ — e a voz só é conhecida em audio-producao.ts.
export function leitoDeAmbiente(
  duracao: number,
  taxa: number,
  cenario: Cenario,
  rnd: () => number
): Float32Array {
  // O chão de sala: ruído rosa cortado em 450 Hz com dois polos. É AQUI que o
  // chiado morre — o que passa é rumor de prédio, não sopro de rádio fora de
  // estação.
  const chao = passaBaixaForte(ruidoRosa(duracao, rnd), TETO_DO_LEITO_HZ, taxa);

  let soma = 0;
  for (let i = 0; i < duracao; i++) soma += chao[i]! * chao[i]!;
  const rms = Math.sqrt(soma / Math.max(1, duracao)) || 1;

  // Deriva LENTA de nível: sala real não é constante.
  const periodoDeriva = taxa * (6 + rnd() * 8); // 6 a 14 segundos
  const faseDeriva = rnd() * Math.PI * 2;
  const leito = new Float32Array(duracao);
  for (let i = 0; i < duracao; i++) {
    const deriva = 1 + 0.25 * Math.sin((i / periodoDeriva) * 2 * Math.PI + faseDeriva);
    leito[i] = (chao[i]! / rms) * deriva;
  }

  // Eventos: SEMPRE pelo menos um. São eles que fazem o ouvido acreditar num
  // lugar; o chão sozinho é só ruído. Entram DEPOIS da normalização do chão,
  // com ganho próprio, para poderem ser bem mais altos que ele sem serem
  // achatados junto.
  const faixa = cenario.eventosMax - cenario.eventosMin;
  const quantos = cenario.eventosMin + Math.floor(rnd() * (faixa + 1));
  for (let e = 0; e < quantos; e++) {
    const tipo = cenario.tipos[Math.floor(rnd() * cenario.tipos.length)]!;
    const evento = gerarEvento(tipo, taxa, rnd);
    // Normaliza o PICO do evento antes de aplicar o ganho: sem isso, cada
    // gerador entrava com a amplitude que por acaso produziu, e os mais baixos
    // ficavam inaudíveis debaixo do chão.
    let picoEvento = 0;
    for (let i = 0; i < evento.amostras.length; i++)
      picoEvento = Math.max(picoEvento, Math.abs(evento.amostras[i]!));
    if (picoEvento <= 0) continue;
    const ganho = (evento.ganho / picoEvento) * (0.75 + rnd() * 0.5);
    const inicio = Math.floor(rnd() * Math.max(1, duracao - evento.amostras.length));
    for (let i = 0; i < evento.amostras.length && inicio + i < duracao; i++) {
      leito[inicio + i] += evento.amostras[i]! * ganho;
    }
  }

  return leito;
}

// ─── Respiração ─────────────────────────────────────────────────────────────
//
// Uma inspirada antes de falar. É o detalhe mais barato e mais eficaz do lote:
// o ouvido registra a respiração como prova de corpo, mesmo sem perceber.
export function respirada(taxa: number, rnd: () => number): Float32Array {
  const dur = Math.round(taxa * (0.28 + rnd() * 0.14)); // 280 a 420 ms
  const a = new Float32Array(dur);
  const env = envelope(dur, Math.round(dur * 0.45), dur * 0.35);
  for (let i = 0; i < dur; i++) a[i] = (rnd() * 2 - 1) * env[i]!;
  // FAIXA ESTREITA, 300 a 1200 Hz, com DOIS polos no corte de cima. A versão
  // anterior usava passa-ALTA e produzia um sopro brilhante — chiado, e no pior
  // lugar possível: logo antes da primeira palavra. Um polo só não bastava:
  // atenua 3 kHz em meros 8 dB, e o sopro continuava aparecendo.
  return passaBaixaForte(passaAlta(a, 300, taxa), 1200, taxa);
}
