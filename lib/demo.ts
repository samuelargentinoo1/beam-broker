// Modo demo — ÚNICA fonte da verdade. Antes o sistema "adivinhava" demo pela
// AUSÊNCIA de credencial, o que em produção virava contrato "assinado" que
// ninguém assinou, cobrança que não existe e IA respondendo texto fixo — sem
// nada gritar. Agora demo é EXPLÍCITO: só com DEMO=1. Sem DEMO e sem credencial,
// o adaptador LANÇA erro claro dizendo qual variável está faltando.
export function modoDemoAtivo(): boolean {
  return process.env.DEMO === "1";
}

// Erro de credencial ausente fora do modo demo — mensagem clara para o operador.
export function exigirCredencial(nomeEnv: string, o_que: string): never {
  throw new Error(
    `${nomeEnv} não configurada e DEMO!=1 — ${o_que} exige a credencial real. ` +
      `Configure ${nomeEnv} ou rode com DEMO=1 para o modo de demonstração.`
  );
}
