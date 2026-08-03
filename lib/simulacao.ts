// Contexto de SIMULAÇÃO — usado pelo simulador de IA do painel do dono.
//
// O simulador roda o agente de verdade (mesmo prompt, mesmas ferramentas, mesmo
// modelo) para que o ajuste valha para o produto. Só que uma coisa não pode
// acontecer num teste: mandar mensagem para o WhatsApp de gente real. O
// proprietário de um imóvel receber "você autoriza o reparo?" porque alguém
// estava testando prompt é um estrago que não dá para desfazer.
//
// AsyncLocalStorage carrega a marca por toda a árvore de chamadas sem precisar
// passar um parâmetro por dez funções — inclusive dentro das ferramentas, que
// são chamadas pelo SDK e não recebem o nosso contexto.

import { AsyncLocalStorage } from "node:async_hooks";

type Contexto = { ativo: true; enviosBloqueados: string[] };

const armazenamento = new AsyncLocalStorage<Contexto>();

export function emSimulacao(): boolean {
  return armazenamento.getStore()?.ativo === true;
}

// Registra um envio que FOI BLOQUEADO, para o simulador mostrar na tela o que
// teria saído — a informação importa para o ajuste.
export function registrarEnvioBloqueado(destino: string, texto: string): void {
  const ctx = armazenamento.getStore();
  if (!ctx) return;
  ctx.enviosBloqueados.push(`${destino}: ${texto.slice(0, 300)}`);
}

// Roda `fn` em modo simulação e devolve o resultado junto com os envios que
// foram interceptados.
export async function comSimulacao<T>(
  fn: () => Promise<T>
): Promise<{ resultado: T; enviosBloqueados: string[] }> {
  const ctx: Contexto = { ativo: true, enviosBloqueados: [] };
  const resultado = await armazenamento.run(ctx, fn);
  return { resultado, enviosBloqueados: ctx.enviosBloqueados };
}
