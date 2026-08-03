// No WhatsApp ninguém escreve um parágrafo. Escreve "esse ape tem caucao",
// depois "ou so seguro fianca", depois "?". Sem agrupar, cada uma vira um turno
// da IA e o cliente recebe três respostas atropeladas dizendo quase a mesma
// coisa. Estes testes travam o agrupamento.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agentes", () => ({
  // O agente devolve o que recebeu, para o teste enxergar o que virou "o turno".
  executarAgente: vi.fn(async (p: { mensagem: string; historico: { texto: string }[] }) =>
    `RECEBI[${p.mensagem}] HIST[${p.historico.map((h) => h.texto).join("|")}]`
  ),
  MODELO: "teste",
}));

import { prisma } from "@/lib/db";
import { TURNO_AGRUPADO, processarMensagem } from "@/lib/conversas";

const uniq = `Agr${process.pid}`;
let imobId = 0;
let conversa: Awaited<ReturnType<typeof prisma.conversa.create>>;

async function limpar() {
  await prisma.mensagem.deleteMany({ where: { conversa: { imobiliaria: { nome: { startsWith: uniq } } } } });
  await prisma.conversa.deleteMany({ where: { imobiliaria: { nome: { startsWith: uniq } } } });
  await prisma.imobiliaria.deleteMany({ where: { nome: { startsWith: uniq } } });
}

beforeEach(async () => {
  await limpar();
  const i = await prisma.imobiliaria.create({ data: { nome: `${uniq}-A`, taxaAdmPercent: 10 } });
  imobId = i.id;
  conversa = await prisma.conversa.create({
    data: { imobiliariaId: imobId, agente: "VENDAS", contatoTelefone: "5516999990009" },
  });
});

afterAll(limpar);

describe("mensagens picadas viram UM turno", () => {
  it("três mensagens seguidas geram UMA resposta, com o texto das três", async () => {
    // As duas primeiras esperam a janela, veem que chegou coisa mais nova e
    // saem caladas. A última responde por todas.
    const a = processarMensagem(conversa, "esse ape tem caucao", { agrupar: true });
    await new Promise((r) => setTimeout(r, 50));
    const b = processarMensagem(conversa, "ou so seguro fianca", { agrupar: true });
    await new Promise((r) => setTimeout(r, 50));
    const c = processarMensagem(conversa, "?", { agrupar: true });

    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(ra).toBe(TURNO_AGRUPADO);
    expect(rb).toBe(TURNO_AGRUPADO);
    expect(rc).toContain("esse ape tem caucao");
    expect(rc).toContain("ou so seguro fianca");
    expect(rc).toContain("?");

    // E o cliente recebeu UMA resposta, não três.
    const respostas = await prisma.mensagem.count({
      where: { conversaId: conversa.id, autor: "IA" },
    });
    expect(respostas).toBe(1);
  }, 40_000);

  it("as mensagens do turno NÃO aparecem também no histórico", async () => {
    // Se aparecessem, a IA as veria duas vezes: como pergunta atual e como
    // coisa já dita antes.
    await processarMensagem(conversa, "oi", {});
    const r = await processarMensagem(conversa, "tem caucao", {});
    expect(r).toContain("RECEBI[tem caucao]");
    expect(r).not.toMatch(/HIST\[[^\]]*tem caucao/);
    expect(r).toMatch(/HIST\[[^\]]*oi/);
  }, 20_000);

  it("sem agrupar, responde na hora (é o caso do simulador do painel)", async () => {
    const inicio = Date.now();
    const r = await processarMensagem(conversa, "quanto custa", {});
    expect(r).toContain("quanto custa");
    expect(Date.now() - inicio).toBeLessThan(3000);
  }, 20_000);

  it("mensagem sozinha continua sendo uma resposta só", async () => {
    const r = await processarMensagem(conversa, "quero alugar", { agrupar: true });
    expect(r).toContain("RECEBI[quero alugar]");
    expect(await prisma.mensagem.count({ where: { conversaId: conversa.id, autor: "IA" } })).toBe(1);
  }, 20_000);
});
