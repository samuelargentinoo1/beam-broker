// Navegação do produto, derivada dos módulos contratados.
//
// Três regras governam o mapeamento (se uma decisão contrariar uma delas, a
// regra vence):
//   R1. Uma aba pertence ao módulo que pode CRIAR ou AGIR sobre a entidade.
//       Só ler não conta.
//   R2. Ação em massa não é aba, é botão dentro da entidade (/importar).
//   R3. Função não é aba, é ferramenta (busca no header, auditoria em
//       configurações).
//
// Esconder o item do menu NÃO protege a rota — o gating de verdade está no
// layout do route group app/(comercial).

import type { Modulo } from "@/lib/planos";

export type GrupoNav = "base" | "comercial";

export type ItemNav = {
  href: string;
  glifo: string;
  label: string;
  modulo?: Modulo; // undefined = base, sempre visível
  grupo: GrupoNav;
};

export const ITENS_NAV: ItemNav[] = [
  // base — sempre visível
  { href: "/", glifo: "◱", label: "Início", grupo: "base" },
  { href: "/imoveis", glifo: "⌂", label: "Imóveis", grupo: "base" },

  // comercial — qualifica o lead e entrega ao corretor
  // Meu Dia vem primeiro: é a tela que o corretor abre de manhã, e a única que
  // diz o que fazer AGORA. As outras são consulta.
  { href: "/meu-dia", glifo: "◉", label: "Meu Dia", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/dados-comerciais", glifo: "▤", label: "Dados Comerciais", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/negocios", glifo: "◈", label: "Negócios (CRM)", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/atividades", glifo: "◷", label: "Atividades", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/leads-portais", glifo: "⊕", label: "Leads de Portais", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/metricas-marketing", glifo: "▦", label: "Métricas de Marketing", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/meu-captador", glifo: "⚑", label: "Meu Captador", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/meu-corretor", glifo: "⚐", label: "Meu Corretor", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/conversas", glifo: "✆", label: "Conversas", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/contatos", glifo: "☰", label: "Contatos", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/tinder-imoveis", glifo: "♡", label: "Tinder Imóveis", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/estoque", glifo: "▩", label: "Estoque", modulo: "COMERCIAL", grupo: "comercial" },
  { href: "/site", glifo: "⌗", label: "Site", modulo: "COMERCIAL", grupo: "comercial" },
];

export function navVisivel(modulos: string[]): ItemNav[] {
  return ITENS_NAV.filter((i) => !i.modulo || modulos.includes(i.modulo));
}

// Agrupa os itens visíveis preservando a ordem dos grupos e DESCARTANDO grupos
// vazios. É isto que evita separador órfão no dock: o separador é inserido
// entre os grupos que sobraram, nunca no início nem no fim.
export function gruposVisiveis(modulos: string[]): ItemNav[][] {
  const ordem: GrupoNav[] = ["base", "comercial"];
  const visiveis = navVisivel(modulos);
  return ordem
    .map((g) => visiveis.filter((i) => i.grupo === g))
    .filter((grupo) => grupo.length > 0);
}
