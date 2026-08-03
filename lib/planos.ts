// Os 2 produtos e o add-on. Definidos como DADOS, não como if espalhado pelo código.
//
// Regra: nada no sistema pergunta "qual o plano?". Tudo pergunta "esse módulo
// está ativo?". Plano é uma embalagem comercial de módulos; se amanhã você criar
// o terceiro produto, ele é uma linha aqui, não uma refatoração.
//
// MÓDULO × ADD-ON são coisas separadas, de propósito:
//   módulo = o que define o produto (COMERCIAL) e libera abas
//   add-on = venda adicional, acoplável sobre qualquer produto (CAPTACAO)
// Misturar os dois destrói a distinção comercial. Captação não cria aba nenhuma
// (o imóvel captado cai em Imóveis, que é base) e NUNCA vem inclusa num produto.

import type { Agente } from "@/lib/cmv";

export type Modulo = "COMERCIAL";
export type Addon = "CAPTACAO";

export type Produto = {
  chave: "RECEPCAO" | "COMERCIAL";
  nome: string;
  promessa: string;
  modulos: Modulo[];
  addons: Addon[];

  // Preços em CENTAVOS. Nunca Float para dinheiro.
  mensalidadeCentavos: number;
  setupCentavos: number;
  porContratoAtivoCentavos: number;
  porLeadAtendidoCentavos: number;

  limiteUsuarios: number; // 0 = ilimitado
  limiteImoveis: number;

  // Cota de CMV de IA incluída, em centavos. Acima disso, cobra excedente.
  cotaIaCentavos: number;
  multiplicadorExcedenteMilesimos: number;
  aoEstourarCota: "AVISAR" | "COBRAR_EXCEDENTE" | "BLOQUEAR_IA";
};

export const PRODUTOS: Record<Produto["chave"], Produto> = {
  RECEPCAO: {
    chave: "RECEPCAO",
    nome: "Recepção",
    promessa: "Ninguém fica sem resposta",
    modulos: [],
    addons: [],
    mensalidadeCentavos: 29700,
    setupCentavos: 0,
    porContratoAtivoCentavos: 0,
    porLeadAtendidoCentavos: 0,
    limiteUsuarios: 3,
    limiteImoveis: 0,
    cotaIaCentavos: 6000,
    multiplicadorExcedenteMilesimos: 3000,
    aoEstourarCota: "COBRAR_EXCEDENTE",
  },
  COMERCIAL: {
    chave: "COMERCIAL",
    nome: "Comercial",
    promessa: "Nenhum lead se perde",
    modulos: ["COMERCIAL"],
    addons: [],
    mensalidadeCentavos: 59700,
    setupCentavos: 90000,
    porContratoAtivoCentavos: 0,
    porLeadAtendidoCentavos: 190,
    limiteUsuarios: 0,
    limiteImoveis: 0,
    cotaIaCentavos: 40000,
    multiplicadorExcedenteMilesimos: 2500,
    aoEstourarCota: "COBRAR_EXCEDENTE",
  },
};

export const LISTA_PRODUTOS = Object.values(PRODUTOS);

export function temModulo(modulos: string[], m: Modulo): boolean {
  return modulos.includes(m);
}

export function temAddon(addons: string[], a: Addon): boolean {
  return addons.includes(a);
}

// Agentes que a Recepção pode acionar, dados os módulos e add-ons ativos.
// Usado em lib/agentes.ts para montar o enum de direcionar_atendimento e para
// filtrar toolsPorAgente — cliente com menos módulos manda prompt menor e
// custa menos. Preço e CMV andam juntos sem esforço.
export function agentesAtivos(modulos: string[], addons: string[] = []): Agente[] {
  const a: Agente[] = ["RECEPCAO", "AJUDA_CORRETOR"];
  if (modulos.includes("COMERCIAL")) a.push("VENDAS", "COMPRA_VENDA");
  if (addons.includes("CAPTACAO")) a.push("CAPTACAO");
  return a;
}

// Captação sobre Recepção não faz sentido: não há operação de carteira.
export function addonPermitido(modulos: string[], addon: Addon): boolean {
  if (addon === "CAPTACAO") return modulos.length > 0;
  return true;
}

// Cobrança do mês, dado o plano e os medidores. Retorna tudo em centavos.
export function calcularFatura(params: {
  produto: Produto;
  contratosAtivos: number;
  leadsAtendidos: number;
  cmvIaCentavos: number;
}) {
  const { produto: p } = params;
  const fixo = p.mensalidadeCentavos;
  const porContrato = p.porContratoAtivoCentavos * params.contratosAtivos;
  const porLead = p.porLeadAtendidoCentavos * params.leadsAtendidos;

  const acimaDaCota = Math.max(0, params.cmvIaCentavos - p.cotaIaCentavos);
  const excedente =
    p.aoEstourarCota === "COBRAR_EXCEDENTE"
      ? Math.round((acimaDaCota * p.multiplicadorExcedenteMilesimos) / 1000)
      : 0;

  const total = fixo + porContrato + porLead + excedente;
  return {
    fixo,
    porContrato,
    porLead,
    excedente,
    total,
    cmv: params.cmvIaCentavos,
    margem: total - params.cmvIaCentavos,
  };
}
