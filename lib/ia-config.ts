// Nome de cada IA (por agente), configurável por imobiliária.
// Guardado em Imobiliaria.iasConfig como JSON: { AGENTE: { nome } }.

import type { AgenteIA } from "@prisma/client";

export type ConfigIA = { nome?: string };
export type IasConfig = Partial<Record<AgenteIA, ConfigIA>>;

export const NOME_PADRAO = "Carol";

function parseIasConfig(json?: string | null): IasConfig {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    return o && typeof o === "object" ? (o as IasConfig) : {};
  } catch {
    return {};
  }
}

// Nome que a IA deste agente usa (fallback: Carol).
export function nomeDaIA(iasConfig: string | null | undefined, agente: AgenteIA): string {
  return parseIasConfig(iasConfig)[agente]?.nome?.trim() || NOME_PADRAO;
}

// NÃO existe mais voz por agente. Existia um vozDaIA() aqui, lendo um voice_id
// guardado no iasConfig — e um valor velho e inválido ali derrubava TODO áudio
// da conversa em silêncio, enquanto o preview da tela (que não passa voz)
// continuava funcionando. A voz agora é uma só, descoberta na conta MiniMax.
