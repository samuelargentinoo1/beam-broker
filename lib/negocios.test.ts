// O que precisa ser verdade no CRM de Negócios:
//   - o funil se provisiona sozinho e não duplica ao abrir de novo;
//   - toda mudança de estado deixa rastro na linha do tempo;
//   - mover de fase zera o relógio de "dias na fase";
//   - o quadro só mostra o que está em jogo (ganho/perdido saem).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  FASES_PADRAO,
  PIPELINES,
  anotar,
  carregarQuadro,
  concluirAtividade,
  criarAtividade,
  criarNegocio,
  definirResultado,
  diasEntre,
  garantirFunil,
  moverFase,
  quando,
  totaisPorFase,
} from "@/lib/negocios";

const uniq = process.pid;
let imobId: number;
let funilId: number;
let fases: { id: number; nome: string }[];

beforeAll(async () => {
  const imob = await prisma.imobiliaria.create({ data: { nome: `Crm${uniq}` } });
  imobId = imob.id;
  const f = await garantirFunil(imobId);
  funilId = f.id;
  fases = f.fases.map((x) => ({ id: x.id, nome: x.nome }));
});

afterAll(async () => {
  await prisma.eventoNegocio.deleteMany({ where: { negocio: { imobiliariaId: imobId } } });
  await prisma.atividadeCrm.deleteMany({ where: { negocio: { imobiliariaId: imobId } } });
  await prisma.negocio.deleteMany({ where: { imobiliariaId: imobId } });
  await prisma.faseFunil.deleteMany({ where: { funil: { imobiliariaId: imobId } } });
  await prisma.funil.deleteMany({ where: { imobiliariaId: imobId } });
  await prisma.imobiliaria.delete({ where: { id: imobId } });
});

describe("provisionamento do funil", () => {
  it("cria o funil padrão com as fases na ordem", () => {
    expect(fases.map((f) => f.nome)).toEqual([...FASES_PADRAO]);
  });

  it("abrir de novo não duplica funil nem fases", async () => {
    const antes = await prisma.funil.count({ where: { imobiliariaId: imobId } });
    const outra = await garantirFunil(imobId);
    expect(outra.id).toBe(funilId);
    expect(outra.fases).toHaveLength(FASES_PADRAO.length);
    // Provisiona os quatro pipelines (Venda, Locação, Lançamento, Captação) e
    // rodar de novo não acrescenta nenhum.
    expect(antes).toBe(Object.keys(PIPELINES).length);
    expect(await prisma.funil.count({ where: { imobiliariaId: imobId } })).toBe(antes);
  });
});

describe("criação e linha do tempo", () => {
  it("criar um negócio já registra o evento de abertura", async () => {
    const n = await criarNegocio({
      imobiliariaId: imobId,
      funilId,
      faseId: fases[0]!.id,
      titulo: "Teste de abertura",
      valor: 1000,
    });
    const ev = await prisma.eventoNegocio.findMany({ where: { negocioId: n.id } });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.tipo).toBe("NEGOCIO_CRIADO");
  });

  it("a nota entra na linha do tempo com o texto escrito", async () => {
    const n = await criarNegocio({
      imobiliariaId: imobId,
      funilId,
      faseId: fases[0]!.id,
      titulo: "Teste de nota",
    });
    await anotar(n.id, "cliente pediu retorno na sexta");
    const nota = await prisma.eventoNegocio.findFirst({
      where: { negocioId: n.id, tipo: "NOTA" },
    });
    expect(nota?.detalhe).toBe("cliente pediu retorno na sexta");
  });
});

describe("mover de fase", () => {
  it("grava o de-para e reinicia o relógio da fase", async () => {
    const n = await criarNegocio({
      imobiliariaId: imobId,
      funilId,
      faseId: fases[0]!.id,
      titulo: "Teste de movimento",
    });
    // Envelhece a entrada na fase para provar que moverFase regrava faseDesde.
    const antigo = new Date(Date.now() - 10 * 86_400_000);
    await prisma.negocio.update({ where: { id: n.id }, data: { faseDesde: antigo } });

    await moverFase(n.id, fases[2]!.id);
    const depois = await prisma.negocio.findUniqueOrThrow({ where: { id: n.id } });
    expect(depois.faseId).toBe(fases[2]!.id);
    expect(diasEntre(depois.faseDesde)).toBe(0);

    const ev = await prisma.eventoNegocio.findFirst({
      where: { negocioId: n.id, tipo: "FASE_ALTERADA" },
    });
    expect(ev?.detalhe).toBe(`De ${fases[0]!.nome} para ${fases[2]!.nome}`);
  });

  it("mover para a mesma fase não gera evento", async () => {
    const n = await criarNegocio({
      imobiliariaId: imobId,
      funilId,
      faseId: fases[1]!.id,
      titulo: "Teste sem movimento",
    });
    await moverFase(n.id, fases[1]!.id);
    const quantos = await prisma.eventoNegocio.count({
      where: { negocioId: n.id, tipo: "FASE_ALTERADA" },
    });
    expect(quantos).toBe(0);
  });

  it("recusa fase de outro funil — o card sumiria do quadro", async () => {
    const outro = await prisma.funil.create({
      data: { imobiliariaId: imobId, nome: `Outro${uniq}`, ordem: 9 },
    });
    const faseDeFora = await prisma.faseFunil.create({
      data: { funilId: outro.id, nome: "Fora", ordem: 0 },
    });
    const n = await criarNegocio({
      imobiliariaId: imobId,
      funilId,
      faseId: fases[0]!.id,
      titulo: "Teste de funil cruzado",
    });
    await expect(moverFase(n.id, faseDeFora.id)).rejects.toThrow(/outro funil/i);

    await prisma.faseFunil.delete({ where: { id: faseDeFora.id } });
    await prisma.funil.delete({ where: { id: outro.id } });
  });
});

describe("atividades", () => {
  it("concluir a atividade é o que a joga na linha do tempo", async () => {
    const n = await criarNegocio({
      imobiliariaId: imobId,
      funilId,
      faseId: fases[0]!.id,
      titulo: "Teste de atividade",
    });
    const a = await criarAtividade({
      negocioId: n.id,
      titulo: "Ligar para o cliente",
      quando: new Date(),
      tipo: "LIGACAO",
    });
    expect(a.status).toBe("PENDENTE");
    // Enquanto pendente, nada de novo na linha do tempo.
    expect(
      await prisma.eventoNegocio.count({ where: { negocioId: n.id, tipo: "ATIVIDADE_CONCLUIDA" } })
    ).toBe(0);

    await concluirAtividade(a.id);
    const ev = await prisma.eventoNegocio.findFirst({
      where: { negocioId: n.id, tipo: "ATIVIDADE_CONCLUIDA" },
    });
    expect(ev?.detalhe).toBe("Ligar para o cliente (Ligação)");
  });

  it("concluir duas vezes não duplica o evento", async () => {
    const n = await criarNegocio({
      imobiliariaId: imobId,
      funilId,
      faseId: fases[0]!.id,
      titulo: "Teste de dupla conclusão",
    });
    const a = await criarAtividade({ negocioId: n.id, titulo: "X", quando: new Date() });
    await concluirAtividade(a.id);
    await concluirAtividade(a.id);
    expect(
      await prisma.eventoNegocio.count({ where: { negocioId: n.id, tipo: "ATIVIDADE_CONCLUIDA" } })
    ).toBe(1);
  });
});

describe("quadro", () => {
  it("ganho e perdido saem do funil — ele mostra o que está em jogo", async () => {
    const n = await criarNegocio({
      imobiliariaId: imobId,
      funilId,
      faseId: fases[3]!.id,
      titulo: "Teste de desfecho",
      valor: 500,
    });
    expect((await carregarQuadro(imobId, funilId)).some((c) => c.id === n.id)).toBe(true);

    await definirResultado(n.id, "GANHO");
    expect((await carregarQuadro(imobId, funilId)).some((c) => c.id === n.id)).toBe(false);

    const ev = await prisma.eventoNegocio.findFirst({
      where: { negocioId: n.id, tipo: "GANHO" },
    });
    expect(ev).not.toBeNull();
  });

  it("negócio sem valor conta na quantidade mas não soma dinheiro", async () => {
    const fase = fases[4]!.id;
    await criarNegocio({
      imobiliariaId: imobId,
      funilId,
      faseId: fase,
      titulo: "Sem valor",
      valor: null,
    });
    await criarNegocio({
      imobiliariaId: imobId,
      funilId,
      faseId: fase,
      titulo: "Com valor",
      valor: 250,
    });
    const t = totaisPorFase(await carregarQuadro(imobId, funilId), fase);
    expect(t.quantidade).toBe(2);
    expect(t.valor).toBe(250);
  });
});

describe("formatação do quando", () => {
  const base = new Date(2026, 6, 28, 14, 10); // 28/07/2026 14:10

  it("hoje e ontem viram texto relativo", () => {
    expect(quando(new Date(2026, 6, 28, 14, 10), base)).toBe("Hoje, 14:10");
    expect(quando(new Date(2026, 6, 27, 15, 3), base)).toBe("Ontem, 15:03");
  });

  it("mais antigo que ontem vira data curta", () => {
    expect(quando(new Date(2026, 6, 16, 10, 42), base)).toBe("16 Jul, 10:42");
  });
});
