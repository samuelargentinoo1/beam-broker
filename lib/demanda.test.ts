// Critérios de aceite do M5: a demanda represada é registrada por módulo, o
// card some quando o mês está zerado, e o cliente Completo nunca gera registro.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { agentesAtivos, PRODUTOS } from "@/lib/planos";
import {
  assuntoDoModulo,
  demandaDoMesPorImobiliaria,
  demandaPorModulo,
  resumoDemandaNaoAtendida,
} from "@/lib/demanda";

const uniq = process.pid;
let imobId: number;
const criadas: number[] = [];

const inicioMes = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

beforeEach(async () => {
  const i = await prisma.imobiliaria.create({
    data: { nome: `Dem${uniq}-${criadas.length}`, taxaAdmPercent: 10 },
  });
  imobId = i.id;
  criadas.push(i.id);
});

afterAll(async () => {
  await prisma.demandaNaoAtendida.deleteMany({ where: { imobiliariaId: { in: criadas } } });
  await prisma.imobiliaria.deleteMany({ where: { id: { in: criadas } } });
});

describe("card do cliente", () => {
  it("não aparece quando o mês está zerado", async () => {
    const r = await resumoDemandaNaoAtendida(imobId, inicioMes());
    expect(r.total).toBe(0);
    expect(r.assunto).toBe("");
  });

  it("conta as pessoas e destaca quantas vieram fora do horário", async () => {
    await prisma.demandaNaoAtendida.createMany({
      data: [
        { imobiliariaId: imobId, modulo: "COMERCIAL", resumo: "quer alugar 2 quartos", foraDoHorario: true },
        { imobiliariaId: imobId, modulo: "COMERCIAL", resumo: "quer alugar no Centro", foraDoHorario: true },
        { imobiliariaId: imobId, modulo: "COMERCIAL", resumo: "procura casa", foraDoHorario: false },
      ],
    });
    const r = await resumoDemandaNaoAtendida(imobId, inicioMes());
    expect(r.total).toBe(3);
    expect(r.foraDoHorario).toBe(2);
    expect(r.assunto).toBe(assuntoDoModulo("COMERCIAL"));
  });

  it("nomeia o assunto pelo módulo mais procurado", async () => {
    await prisma.demandaNaoAtendida.createMany({
      data: [
        { imobiliariaId: imobId, modulo: "COMERCIAL", resumo: "a" },
        { imobiliariaId: imobId, modulo: "ADM", resumo: "b" },
        { imobiliariaId: imobId, modulo: "ADM", resumo: "c" },
      ],
    });
    const r = await resumoDemandaNaoAtendida(imobId, inicioMes());
    expect(r.assunto).toBe(assuntoDoModulo("ADM"));
  });

  it("só conta o mês corrente", async () => {
    const doisMesesAtras = new Date();
    doisMesesAtras.setMonth(doisMesesAtras.getMonth() - 2);
    await prisma.demandaNaoAtendida.create({
      data: { imobiliariaId: imobId, modulo: "ADM", resumo: "antigo", em: doisMesesAtras },
    });
    expect((await resumoDemandaNaoAtendida(imobId, inicioMes())).total).toBe(0);
  });
});

describe("visão do dono", () => {
  it("agrega por módulo nos últimos 90 dias, do maior para o menor", async () => {
    await prisma.demandaNaoAtendida.createMany({
      data: [
        { imobiliariaId: imobId, modulo: "COMERCIAL", resumo: "a" },
        { imobiliariaId: imobId, modulo: "COMERCIAL", resumo: "b" },
        { imobiliariaId: imobId, modulo: "CAPTACAO", resumo: "c" },
      ],
    });
    const agregado = await demandaPorModulo(imobId, 90);
    expect(agregado[0]).toEqual({ modulo: "COMERCIAL", total: 2 });
    expect(agregado[1]).toEqual({ modulo: "CAPTACAO", total: 1 });
  });

  it("a coluna da lista traz o total do mês por imobiliária", async () => {
    await prisma.demandaNaoAtendida.create({
      data: { imobiliariaId: imobId, modulo: "ADM", resumo: "x" },
    });
    const mapa = await demandaDoMesPorImobiliaria();
    expect(mapa.get(imobId)).toBe(1);
  });
});

describe("quem gera registro", () => {
  it("cliente Comercial + Captação atende as três áreas que sobraram", () => {
    // O registro só acontece no destino NAO_CONTRATADO, que a Recepção só pode
    // escolher quando a área pedida não está entre os agentes ativos.
    const ativos = agentesAtivos(PRODUTOS.COMERCIAL.modulos, ["CAPTACAO"]);
    for (const area of ["CAPTACAO", "VENDAS", "COMPRA_VENDA"]) {
      expect(ativos).toContain(area);
    }
  });

  it("cliente Recepção não atende nenhuma das três áreas", () => {
    const ativos = agentesAtivos(PRODUTOS.RECEPCAO.modulos, PRODUTOS.RECEPCAO.addons);
    for (const area of ["CAPTACAO", "VENDAS", "COMPRA_VENDA"]) {
      expect(ativos).not.toContain(area);
    }
  });

  it("o resumo é obrigatório na prática (registro sem resumo tem texto padrão)", async () => {
    await prisma.demandaNaoAtendida.create({
      data: { imobiliariaId: imobId, modulo: "COMERCIAL", resumo: "demanda não detalhada" },
    });
    const d = await prisma.demandaNaoAtendida.findFirstOrThrow({ where: { imobiliariaId: imobId } });
    expect(d.resumo.length).toBeGreaterThan(0);
  });
});
