// Checklist de ativação de primeiro uso — passos na ordem que faz o produto
// funcionar, marcados como concluídos a partir de dados REAIS (por imobiliária).

import { prisma } from "@/lib/db";
import type { Imobiliaria } from "@prisma/client";
import { temModulo, type Modulo } from "@/lib/planos";

export type PassoAtivacao = {
  chave: string;
  titulo: string;
  descricao: string;
  href: string;
  feito: boolean;
  // Passo que só existe com o módulo contratado. Um checklist com passos
  // impossíveis nunca chega a 100% e o cliente para de olhar.
  modulo?: Modulo;
};

export type Ativacao = {
  passos: PassoAtivacao[];
  concluidos: number;
  total: number;
  completo: boolean;
  dispensado: boolean;
};

export async function statusAtivacao(imobiliaria: Imobiliaria): Promise<Ativacao> {
  const id = imobiliaria.id;
  const comComercial = temModulo(imobiliaria.modulos, "COMERCIAL");

  // Não consulta o que não vai aparecer.
  const zero = Promise.resolve(0);
  const [qImoveis, qLeads] = await Promise.all([
    prisma.imovel.count({ where: { imobiliariaId: id } }),
    comComercial ? prisma.lead.count({ where: { imobiliariaId: id } }) : zero,
  ]);

  const passos: PassoAtivacao[] = [
    {
      chave: "whatsapp",
      titulo: "Conecte o WhatsApp",
      descricao: "Cole o token da instância uazapi e teste a conexão.",
      href: "/configuracoes",
      feito: Boolean(imobiliaria.uazapiToken),
    },
    {
      chave: "imovel",
      titulo: "Cadastre o 1º imóvel",
      descricao: "A base da carteira — depois dele vêm os contratos.",
      href: "/imoveis/novo",
      feito: qImoveis > 0,
    },
    {
      chave: "lead",
      titulo: "Atenda o 1º lead",
      descricao: "A IA qualifica quem chega perguntando de imóvel e agenda a visita.",
      href: "/meu-dia",
      feito: qLeads > 0,
      modulo: "COMERCIAL",
    },
  ];

  // Só entram os passos executáveis com os módulos contratados.
  const visiveis = passos.filter((p) => !p.modulo || temModulo(imobiliaria.modulos, p.modulo));
  const concluidos = visiveis.filter((p) => p.feito).length;
  return {
    passos: visiveis,
    concluidos,
    total: visiveis.length,
    completo: concluidos === visiveis.length,
    dispensado: imobiliaria.onboardingDispensado,
  };
}
