import type { Conversa } from "./tipos";
import { contatoPorNome } from "./contatos";

export const CONVERSAS: Conversa[] = [
  // ── A conversa que vende o produto: a IA qualifica do zero, uma pergunta por
  // vez. O lead trava na renda, a IA RECUA, volta a falar de imóvel, e retoma o
  // assunto duas mensagens depois. É esse recuo que parece gente. ──
  {
    id: "cv1",
    contatoId: contatoPorNome("Thiago Nunes").id,
    canal: "WhatsApp",
    atendente: "ia",
    corretorId: "c2",
    minutosDesdeUltima: 4,
    naoLidas: 0,
    irritado: false,
    slaEstourado: false,
    semResposta: false,
    resumoIa: [
      "Casal com 1 filho e um cachorro, procurando 2 quartos para alugar no Bosque, até R$ 2.500.",
      "Travou quando perguntei a renda — recuei e voltei ao assunto depois de mostrar imóvel; ele informou R$ 7.400.",
      "Pronto para visita. Dois imóveis batem: AP-0212 (R$ 2.300, aceita pet) e AP-0219 (R$ 2.450).",
    ],
    alerta: null,
    mensagens: [
      { autor: "cliente", texto: "Oi, vi um apartamento de vocês no Viva Real, o de 2 quartos no Bosque", hora: "09:12", diaLabel: "Ontem" },
      { autor: "ia", texto: "Oi, Thiago! Tudo bem? Sou a Carol, da Horizonte 🙂 Esse do Bosque ainda está disponível, sim. É o de 62m², R$ 2.300 mais condomínio.", hora: "09:12" },
      { autor: "ia", texto: "Me conta uma coisa: é pra morar sozinho ou com mais gente?", hora: "09:13" },
      { autor: "cliente", texto: "com minha esposa e meu filho de 4 anos", hora: "09:20" },
      { autor: "cliente", texto: "ah e a gente tem um cachorro, isso é problema?", hora: "09:20" },
      { autor: "ia", texto: "Nesse não é problema nenhum — o condomínio aceita pet 🐶 Inclusive tenho mais um na mesma região que também aceita, o de 58m² por R$ 2.450.", hora: "09:21" },
      { autor: "ia", texto: "Pra eu te mandar só o que faz sentido: qual é a renda somada de vocês dois?", hora: "09:22" },
      { autor: "cliente", texto: "prefiro não falar isso agora", hora: "09:41" },
      // O recuo: a IA não insiste. Devolve valor e segue.
      { autor: "ia", texto: "Sem problema, Thiago, não precisa 🙂 Vamos pelo imóvel então.", hora: "09:41" },
      { autor: "ia", texto: "Esse do Bosque tem uma vaga coberta, sacada e fica a 400m do parque — bom pra quem tem criança e cachorro. Te mando o vídeo?", hora: "09:42" },
      { autor: "cliente", texto: "manda sim", hora: "09:58" },
      { autor: "ia", texto: "🎥 Vídeo do AP-0212 — 2 quartos, Bosque\nR$ 2.300 + R$ 480 de condomínio + R$ 90 de IPTU", hora: "09:58" },
      { autor: "cliente", texto: "gostei bastante, é bem o que a gente quer", hora: "10:14" },
      // Duas mensagens depois, retoma — agora com contexto que justifica a pergunta.
      { autor: "ia", texto: "Que bom! Pra agendar a visita e já deixar a documentação encaminhada, o proprietário costuma pedir comprovação de renda de 3x o aluguel. Só pra eu te dizer se passa tranquilo: dá pra me falar a faixa?", hora: "10:15" },
      { autor: "cliente", texto: "ah entendi, assim faz sentido. juntos dá uns 7.400", hora: "10:22" },
      { autor: "ia", texto: "Passa com folga 👌 Com R$ 7.400 os dois imóveis cabem tranquilo.", hora: "10:22" },
      { autor: "ia", texto: "Consigo te encaixar uma visita nos dois na quinta às 18h ou no sábado de manhã. Qual fica melhor?", hora: "10:23" },
      { autor: "cliente", texto: "sábado de manhã é melhor pra gente", hora: "10:31" },
      { autor: "ia", texto: "Fechado! Sábado às 10h, começando pelo do Bosque. Vou passar seu contato pro Ana Julia, que faz a visita com vocês. Qualquer coisa antes disso é só me chamar aqui 🙂", hora: "10:31" },
      { autor: "cliente", texto: "perfeito, obrigado!", hora: "10:33" },
    ],
  },

  // ── Alerta vermelho: promessa quebrada ──
  {
    id: "cv2",
    contatoId: contatoPorNome("Fernanda Martins").id,
    canal: "WhatsApp",
    atendente: "corretor",
    corretorId: "c2",
    minutosDesdeUltima: 940,
    naoLidas: 2,
    irritado: true,
    slaEstourado: true,
    semResposta: true,
    resumoIa: [
      "Casal com 2 filhos, R$ 14.200 de renda e R$ 38k de FGTS. Quer 3 quartos no Jardim Aclimação, urgência de 3 meses.",
      "Já visitou o AP-0455 e gostou. Pediu o vídeo do quarto e da área de serviço.",
      "Você prometeu enviar o vídeo ontem às 20h e não enviou. Ela cobrou duas vezes.",
    ],
    alerta: "Você prometeu enviar o vídeo ontem às 20h e não enviou.",
    mensagens: [
      { autor: "cliente", texto: "Ana, adorei o apartamento hoje! Meu marido não pôde ir, consegue me mandar um vídeo do quarto e da área de serviço pra eu mostrar pra ele?", hora: "17:42", diaLabel: "Anteontem" },
      { autor: "corretor", texto: "Claro, Fernanda! Passo lá amanhã de manhã e te mando ainda no fim do dia, até às 20h 👍", hora: "17:50" },
      { autor: "cliente", texto: "combinado, obrigada!", hora: "17:51" },
      { autor: "cliente", texto: "Oi Ana, conseguiu gravar?", hora: "21:14", diaLabel: "Ontem" },
      { autor: "cliente", texto: "Bom dia. Meu marido perguntou de novo do vídeo. A gente tá com pressa porque nosso contrato vence em outubro, se não der me avisa que a gente vê outra coisa", hora: "08:26", diaLabel: "Hoje" },
    ],
  },

  // ── SLA estourado, IA ainda segurando ──
  {
    id: "cv3",
    contatoId: contatoPorNome("Juliana Souza").id,
    canal: "WhatsApp",
    atendente: "ia",
    corretorId: "c2",
    minutosDesdeUltima: 5760,
    naoLidas: 0,
    irritado: false,
    slaEstourado: true,
    semResposta: true,
    resumoIa: [
      "Entrou pelo OLX procurando locação até R$ 1.800. Não informou renda nem região.",
      "Respondeu 2 de 6 mensagens. Abriu o link do imóvel 3 vezes, mas não voltou a falar.",
      "Reengajei ontem às 19h sem resposta. Score 34 — qualificação incompleta.",
    ],
    alerta: null,
    mensagens: [
      { autor: "cliente", texto: "oi, esse apartamento de 1800 ainda ta disponivel?", hora: "14:03", diaLabel: "24/07" },
      { autor: "ia", texto: "Oi, Juliana! Está sim 🙂 É o AP-0163, 2 quartos no Jardim São Paulo, R$ 2.100 já com condomínio. Quer que eu te mande as fotos?", hora: "14:03" },
      { autor: "cliente", texto: "pode mandar", hora: "14:31" },
      { autor: "ia", texto: "📷 6 fotos — AP-0163, Jardim São Paulo\n2 quartos · 55m² · 1 vaga", hora: "14:31" },
      { autor: "ia", texto: "Você procura por essa região mesmo ou tem flexibilidade de bairro?", hora: "16:02" },
      { autor: "ia", texto: "Oi, Juliana! Passando pra saber se ainda está procurando 🙂 Chegaram duas opções novas na sua faixa.", hora: "19:00", diaLabel: "Ontem" },
    ],
  },

  // ── Negociação quente com o corretor ──
  {
    id: "cv4",
    contatoId: contatoPorNome("Camila Barros").id,
    canal: "WhatsApp",
    atendente: "corretor",
    corretorId: "c2",
    minutosDesdeUltima: 1380,
    naoLidas: 0,
    irritado: false,
    slaEstourado: false,
    semResposta: true,
    resumoIa: [
      "Casal sem filhos, renda de R$ 18.500 e FGTS de R$ 52k. Proposta de R$ 690k na Casa Vila Nova.",
      "Proposta enviada há 4 dias. Ela prometeu retorno ontem e não deu.",
      "Segunda opção de interesse: AP-0455 no Aclimação, R$ 465k.",
    ],
    alerta: null,
    mensagens: [
      { autor: "corretor", texto: "Camila, boa tarde! Enviei a proposta formal de R$ 690.000 pro proprietário. Ele tem 5 dias pra responder, mas costuma dar retorno antes.", hora: "15:20", diaLabel: "24/07" },
      { autor: "cliente", texto: "Ótimo Ana! Vamos aguardar então", hora: "15:44" },
      { autor: "corretor", texto: "Oi Camila! O proprietário topou R$ 690k mas pediu 60 dias pra desocupar. Consegue me dar um retorno até amanhã?", hora: "11:02", diaLabel: "Anteontem" },
      { autor: "cliente", texto: "Vou conversar com meu marido hoje à noite e te falo amanhã sem falta", hora: "18:30" },
    ],
  },

  // ── Cliente irritado ──
  {
    id: "cv5",
    contatoId: contatoPorNome("Gustavo Rocha").id,
    canal: "WhatsApp",
    atendente: "corretor",
    corretorId: "c2",
    minutosDesdeUltima: 2880,
    naoLidas: 1,
    irritado: true,
    slaEstourado: false,
    semResposta: true,
    resumoIa: [
      "Solteiro, renda de R$ 6.200, sem FGTS. Procura 2 quartos até R$ 300k na Vila Melhado.",
      "Visitou um imóvel que já estava reservado — perdeu a viagem e reclamou.",
      "O AP-0302 baixou 7% e agora cabe no orçamento dele. É o gancho para retomar.",
    ],
    alerta: "Cliente visitou imóvel já reservado. Reclamação não respondida há 2 dias.",
    mensagens: [
      { autor: "cliente", texto: "fui lá no apartamento hoje como combinamos", hora: "16:10", diaLabel: "26/07" },
      { autor: "cliente", texto: "e o porteiro falou que ja tava reservado faz uma semana. sai do trabalho mais cedo pra isso", hora: "16:11" },
      { autor: "cliente", texto: "achei bem falta de respeito sinceramente", hora: "16:12" },
    ],
  },

  // ── IA atendendo, lead novo, resposta em segundos ──
  {
    id: "cv6",
    contatoId: contatoPorNome("Mariana Duarte").id,
    canal: "WhatsApp",
    atendente: "ia",
    corretorId: "c2",
    minutosDesdeUltima: 12,
    naoLidas: 0,
    irritado: false,
    slaEstourado: false,
    semResposta: false,
    resumoIa: [
      "Lead do Zap, entrou hoje às 08:41. A IA respondeu em 47 segundos.",
      "Procura 2 quartos para compra até R$ 380k. Ainda não informou renda nem FGTS.",
      "Qualificação em andamento — 2 de 5 perguntas respondidas.",
    ],
    alerta: null,
    mensagens: [
      { autor: "cliente", texto: "Bom dia, tenho interesse no anúncio do apartamento", hora: "08:41", diaLabel: "Hoje" },
      { autor: "ia", texto: "Bom dia, Mariana! Sou a Carol, da Horizonte 🙂 Esse apartamento está disponível sim. Você procura pra comprar ou alugar?", hora: "08:42" },
      { autor: "cliente", texto: "comprar", hora: "08:51" },
      { autor: "ia", texto: "Perfeito! E você já tem uma faixa de valor em mente?", hora: "08:51" },
      { autor: "cliente", texto: "até uns 380 mil", hora: "09:03" },
      { autor: "ia", texto: "Anotado 👌 Tenho 4 opções nessa faixa. Antes de te mandar, me diz: quantos quartos você precisa?", hora: "09:04" },
    ],
  },
];

export const conversaPorId = (id: string) => CONVERSAS.find((c) => c.id === id)!;
