export type Corretor = {
  id: string;
  nome: string;
  iniciais: string;
  cor: string;
  perfil: "estrela" | "mediano" | "fraco" | "novato";
  conversao: number; // %
  tempoResposta: number; // minutos
  execucaoPrazo: number; // %
  negociosAbertos: number;
  atividadesAtrasadas: number;
  semProximaAcao: number;
  vendasMes: number;
  vgvMes: number;
};

export type Imovel = {
  id: string;
  codigo: string;
  tipo: "Apartamento" | "Casa" | "Studio" | "Sobrado" | "Terreno" | "Cobertura";
  finalidade: "VENDA" | "LOCACAO";
  bairro: string;
  endereco: string;
  quartos: number;
  vagas: number;
  area: number;
  preco: number;
  condominio: number;
  iptu: number;
  diasEstoque: number;
  visualizacoes: number;
  contatos: number;
  visitas: number;
  fotos: number;
  descricaoTamanho: number;
  geolocalizado: boolean;
  tourVirtual: boolean;
  autorizacaoVence: string | null;
  curva: "A" | "B" | "C";
  proprietario: string;
  status: "DISPONIVEL" | "RESERVADO" | "VENDIDO" | "ALUGADO";
  aceitaPet: boolean;
  cor: string; // tom do placeholder da foto
};

export type FatorScore = { rotulo: string; pontos: number };

export type Contato = {
  id: string;
  nome: string;
  iniciais: string;
  cor: string;
  telefone: string;
  score: number;
  fatores: FatorScore[];
  resumo: string;
  perfilFamiliar: string;
  renda: number | null;
  fgts: number | null;
  entrada: number | null;
  finalidade: "VENDA" | "LOCACAO";
  quartosDesejados: number | null;
  bairrosDesejados: string[];
  tetoValor: number | null;
  urgenciaMeses: number | null;
  origem: "Zap" | "Viva Real" | "OLX" | "Marketplace" | "Site" | "Instagram" | "Meta" | "Google" | "Indicação";
  estagio: "Novo" | "Qualificado" | "Em atendimento" | "Visita" | "Proposta" | "Fechado" | "Perdido";
  corretorId: string;
  criadoDiasAtras: number;
  ultimaInteracaoDiasAtras: number;
  respondidas: number;
  enviadas: number;
  imoveisCompativeis: string[];
};

export type MotivoCard =
  | { tipo: "promessa"; texto: string }
  | { tipo: "visita"; texto: string }
  | { tipo: "silencio"; texto: string }
  | { tipo: "match"; texto: string }
  | { tipo: "retorno"; texto: string }
  | { tipo: "ia"; texto: string }
  | { tipo: "proposta"; texto: string };

export type ItemMeuDia = {
  id: string;
  contatoId: string;
  prioridade: number;
  motivo: MotivoCard;
  acoes: string[];
  concluido: boolean;
  adiado: boolean;
};

export type Negocio = {
  id: string;
  contatoId: string;
  titulo: string;
  valor: number;
  imovelId: string | null;
  etapa: string;
  pipeline: "Venda" | "Locação" | "Lançamento" | "Captação";
  diasParado: number;
  corretorId: string;
  proximaAtividade: string | null;
  travadoPor: string | null;
  travadoAte: string | null;
  probabilidade: number;
};

export type Mensagem = {
  id?: string;
  autor: "cliente" | "ia" | "corretor";
  texto: string;
  hora: string;
  diaLabel?: string;
};

export type Conversa = {
  id: string;
  contatoId: string;
  canal: "WhatsApp";
  atendente: "ia" | "corretor";
  corretorId: string;
  minutosDesdeUltima: number;
  naoLidas: number;
  irritado: boolean;
  slaEstourado: boolean;
  semResposta: boolean;
  resumoIa: string[];
  alerta: string | null;
  mensagens: Mensagem[];
};

export type Atividade = {
  id: string;
  tipo: "Ligação" | "Visita" | "WhatsApp" | "Proposta" | "E-mail";
  contatoId: string;
  corretorId: string;
  quando: string;
  dia: "hoje" | "atrasada" | "proximos";
  contexto: string;
  criadaPelaIa: boolean;
  notaIa?: string;
  concluida: boolean;
};
