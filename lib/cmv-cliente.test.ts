// A matemática de CMV que fica dentro de cada cliente: volume real, custo
// medido x simulado, margem e a curva que diz onde a cota precisa cortar.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { PRODUTOS } from "@/lib/planos";
import { cmvDoCliente } from "@/lib/cmv-cliente";

const uniq = process.pid;
let imobId: number;
const criadas: number[] = [];

beforeEach(async () => {
  const i = await prisma.imobiliaria.create({
    data: {
      nome: `Cmv${uniq}-${criadas.length}`,
      taxaAdmPercent: 10,
      modulos: ["COMERCIAL"],
    },
  });
  imobId = i.id;
  criadas.push(i.id);
});

afterAll(async () => {
  await prisma.mensagem.deleteMany({ where: { conversa: { imobiliariaId: { in: criadas } } } });
  await prisma.conversa.deleteMany({ where: { imobiliariaId: { in: criadas } } });
  await prisma.usoIA.deleteMany({ where: { imobiliariaId: { in: criadas } } });
  await prisma.imobiliaria.deleteMany({ where: { id: { in: criadas } } });
});

// A constraint é (imobiliariaId, contatoTelefone, agente): o telefone precisa
// ser único também entre a conversa real e a de simulação do mesmo agente.
async function conversas(agente: "VENDAS" | "ADMINISTRACAO", quantas: number, simulacao = false) {
  for (let n = 0; n < quantas; n++) {
    await prisma.conversa.create({
      data: {
        imobiliariaId: imobId,
        agente,
        simulacao,
        contatoTelefone: `55119${uniq}${agente[0]}${simulacao ? "S" : "R"}${n}`,
      },
    });
  }
}

const base = {
  produto: PRODUTOS.COMERCIAL,
  contratosAtivos: 0,
  leadsAtendidos: 0,
};

describe("volume medido", () => {
  it("conta as conversas reais por agente e ignora as de simulação", async () => {
    await conversas("VENDAS", 3);
    await conversas("ADMINISTRACAO", 2);
    await conversas("VENDAS", 5, true); // ensaio do simulador: não é operação

    const r = await cmvDoCliente({
      imobiliariaId: imobId,
      modulos: ["COMERCIAL"],
      addons: [],
      ...base,
    });

    expect(r.medido.conversasReais).toBe(5);
    expect(r.medido.volume.VENDAS).toBe(3);
    expect(r.medido.volume.ADMINISTRACAO).toBe(2);
    // Agente sem conversa não inventa volume do cenário padrão.
    expect(r.medido.volume.CAPTACAO).toBe(0);
  });

  it("cliente sem uso nenhum tem CMV zero e margem cheia", async () => {
    const r = await cmvDoCliente({
      imobiliariaId: imobId,
      modulos: ["COMERCIAL"],
      addons: [],
      ...base,
    });
    expect(r.medido.custoRealBrl).toBe(0);
    expect(r.consolidado.brlIa).toBe(0);
    // Receita = mensalidade do Comercial (R$ 597), menos a infra rateada.
    expect(r.receitaBrl).toBeCloseTo(597, 2);
    expect(r.margemMedida.margemBrl).toBeCloseTo(597 - r.infra, 2);
  });
});

describe("medido × simulado", () => {
  it("o custo medido vem da telemetria real, convertido a BRL", async () => {
    await conversas("VENDAS", 2);
    await prisma.usoIA.createMany({
      data: [
        { imobiliariaId: imobId, agente: "VENDAS", modelo: "claude-sonnet-5", custoUsd: 0.5 },
        { imobiliariaId: imobId, agente: "VENDAS", modelo: "claude-sonnet-5", custoUsd: 0.25 },
      ],
    });

    const r = await cmvDoCliente({
      imobiliariaId: imobId,
      modulos: ["COMERCIAL"],
      addons: [],
      ...base,
    });
    // 0,75 USD × 5,6 = R$ 4,20
    expect(r.medido.custoRealBrl).toBeCloseTo(4.2, 2);
    expect(r.medido.turnos).toBe(2);
  });

  it("calcula o desvio entre medido e simulado", async () => {
    await conversas("VENDAS", 10);
    const r = await cmvDoCliente({
      imobiliariaId: imobId,
      modulos: ["COMERCIAL"],
      addons: [],
      ...base,
    });
    expect(r.consolidado.brlIa).toBeGreaterThan(0);
    // Sem telemetria, o medido é 0 → desvio de -100% em relação ao simulado.
    expect(r.desvioPct).toBeCloseTo(-100, 0);
  });
});

describe("margem e sensibilidade", () => {
  it("a margem real usa o custo MEDIDO, não o simulado", async () => {
    await conversas("VENDAS", 10);
    await prisma.usoIA.create({
      data: { imobiliariaId: imobId, agente: "VENDAS", modelo: "claude-sonnet-5", custoUsd: 10 },
    });

    const r = await cmvDoCliente({
      imobiliariaId: imobId,
      modulos: ["COMERCIAL"],
      addons: [],
      ...base,
    });
    // 10 USD = R$ 56 medido; a margem real desconta isso, não o simulado.
    expect(r.margemMedida.margemBrl).toBeCloseTo(r.receitaBrl - 56 - r.infra, 2);
    expect(r.margemMedida.margemBrl).not.toBeCloseTo(r.margemSimulada.margemBrl, 2);
  });

  it("a curva mostra o custo subindo e a margem caindo com o volume", async () => {
    await conversas("VENDAS", 20);
    const r = await cmvDoCliente({
      imobiliariaId: imobId,
      modulos: ["COMERCIAL"],
      addons: [],
      ...base,
    });

    expect(r.sensibilidade.map((c) => c.multiplicador)).toEqual([1, 1.5, 2, 3, 5]);
    const hoje = r.sensibilidade[0]!;
    const cinco = r.sensibilidade[4]!;
    expect(cinco.conversas).toBeGreaterThan(hoje.conversas);
    expect(cinco.cmvIaBrl).toBeGreaterThan(hoje.cmvIaBrl);
    expect(cinco.margemBrl).toBeLessThan(hoje.margemBrl);
  });

  it("o uso da cota é medido contra a cota do plano", async () => {
    await prisma.usoIA.create({
      data: { imobiliariaId: imobId, agente: "VENDAS", modelo: "claude-sonnet-5", custoUsd: 53.57 },
    });
    const r = await cmvDoCliente({
      imobiliariaId: imobId,
      modulos: ["COMERCIAL"],
      addons: [],
      ...base,
    });
    // Cota do Comercial = R$ 400; 53,57 USD × 5,6 ≈ R$ 300 → ~75%.
    expect(r.cotaBrl).toBe(400);
    expect(r.usoCotaPct).toBeGreaterThan(70);
    expect(r.usoCotaPct).toBeLessThan(80);
  });
});

describe("respeita o plano do cliente", () => {
  it("só considera os agentes que o plano contratou", async () => {
    await conversas("VENDAS", 5);
    await conversas("ADMINISTRACAO", 5);

    // Cliente Comercial: as conversas de ADMINISTRACAO não entram no CMV dele.
    const r = await cmvDoCliente({
      imobiliariaId: imobId,
      modulos: ["COMERCIAL"],
      addons: [],
      produto: PRODUTOS.COMERCIAL,
      contratosAtivos: 0,
      leadsAtendidos: 0,
    });
    const agentes = r.consolidado.linhas.map((l) => l.agente);
    expect(agentes).toContain("VENDAS");
    expect(agentes).not.toContain("ADMINISTRACAO");
  });
});
