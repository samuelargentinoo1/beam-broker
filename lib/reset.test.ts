// /reset apaga o rastro de UM contato e avisa o que apagou. O que ele NÃO
// apaga é tão importante quanto: carteira e contratos são dado real da
// imobiliária, e não podem sumir por causa de uma mensagem de WhatsApp.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { ehComandoReset, limparDadosDoContato, mensagemDeReset } from "@/lib/reset";

const uniq = `Rst${process.pid}`;
const TEL = "5516999990001";
const OUTRO = "5516988887777";

let imobId = 0;

beforeEach(async () => {
  await prisma.mensagem.deleteMany({ where: { conversa: { imobiliaria: { nome: { startsWith: uniq } } } } });
  await prisma.conversa.deleteMany({ where: { imobiliaria: { nome: { startsWith: uniq } } } });
  await prisma.lead.deleteMany({ where: { imobiliaria: { nome: { startsWith: uniq } } } });
  await prisma.imovel.deleteMany({ where: { imobiliaria: { nome: { startsWith: uniq } } } });
  await prisma.pessoa.deleteMany({ where: { imobiliaria: { nome: { startsWith: uniq } } } });
  await prisma.imobiliaria.deleteMany({ where: { nome: { startsWith: uniq } } });
  const i = await prisma.imobiliaria.create({ data: { nome: `${uniq}-A`, taxaAdmPercent: 10 } });
  imobId = i.id;
});

afterAll(async () => {
  await prisma.mensagem.deleteMany({ where: { conversa: { imobiliaria: { nome: { startsWith: uniq } } } } });
  await prisma.conversa.deleteMany({ where: { imobiliaria: { nome: { startsWith: uniq } } } });
  await prisma.lead.deleteMany({ where: { imobiliaria: { nome: { startsWith: uniq } } } });
  await prisma.imovel.deleteMany({ where: { imobiliaria: { nome: { startsWith: uniq } } } });
  await prisma.pessoa.deleteMany({ where: { imobiliaria: { nome: { startsWith: uniq } } } });
  await prisma.imobiliaria.deleteMany({ where: { nome: { startsWith: uniq } } });
});

describe("o comando é escrito, não adivinhado", () => {
  it("reconhece /reset e /resetar, com espaço e maiúscula", () => {
    expect(ehComandoReset("/reset")).toBe(true);
    expect(ehComandoReset("  /RESET  ")).toBe(true);
    expect(ehComandoReset("/resetar")).toBe(true);
  });

  it("NÃO dispara sem a barra nem dentro de frase", () => {
    // Sem isto, um cliente que escreve "quero resetar minha senha" apagaria o
    // próprio atendimento sem querer.
    expect(ehComandoReset("reset")).toBe(false);
    expect(ehComandoReset("quero resetar minha senha")).toBe(false);
    expect(ehComandoReset("manda /reset pra mim")).toBe(false);
    expect(ehComandoReset("")).toBe(false);
  });
});

describe("o que o reset apaga", () => {
  async function montarCenario() {
    const conversa = await prisma.conversa.create({
      data: { imobiliariaId: imobId, agente: "COMPRA_VENDA", contatoTelefone: TEL },
    });
    await prisma.mensagem.createMany({
      data: [
        { conversaId: conversa.id, autor: "CLIENTE", texto: "oi" },
        { conversaId: conversa.id, autor: "IA", texto: "oi, aqui é a Carol" },
      ],
    });
    const lead = await prisma.lead.create({
      data: {
        imobiliariaId: imobId,
        nome: "Comprador",
        // Formato COM máscara de propósito: o telefone chega diferente em cada
        // canal, e o reset tem de achar mesmo assim.
        telefone: "(16) 99999-0001",
        finalidade: "COMPRA",
        qualificacao: { create: { rendaBrutaMensal: 6000, primeiroImovel: true } },
      },
    });
    return { conversa, lead };
  }

  it("apaga conversa, mensagens, lead e qualificação daquele número", async () => {
    await montarCenario();
    const r = await limparDadosDoContato(imobId, TEL);

    expect(r.conversas).toBe(1);
    expect(r.mensagens).toBe(2);
    expect(r.leads).toBe(1);
    expect(r.qualificacoes).toBe(1);
    expect(await prisma.conversa.count({ where: { imobiliariaId: imobId } })).toBe(0);
    expect(await prisma.lead.count({ where: { imobiliariaId: imobId } })).toBe(0);
  });

  it("acha o contato mesmo com DDI e máscara diferentes", async () => {
    await montarCenario();
    // Mesmo número, escrito de outro jeito: compara pelos últimos 8 dígitos.
    const r = await limparDadosDoContato(imobId, "+55 (16) 9 9999-0001");
    expect(r.conversas).toBe(1);
    expect(r.leads).toBe(1);
  });

  it("NÃO apaga carteira: pessoa, imóvel e contrato ficam de pé", async () => {
    const dono = await prisma.pessoa.create({
      data: { imobiliariaId: imobId, nome: "Proprietário", cpfCnpj: `${process.pid}11`, tipo: "FISICA" },
    });
    await prisma.imovel.create({
      data: {
        imobiliariaId: imobId,
        codigo: "AP-0001",
        tipo: "Apartamento",
        endereco: "Rua A, 1",
        cidade: "Araraquara",
        uf: "SP",
        proprietarioId: dono.id,
      },
    });
    await montarCenario();

    await limparDadosDoContato(imobId, TEL);

    expect(await prisma.pessoa.count({ where: { imobiliariaId: imobId } })).toBe(1);
    expect(await prisma.imovel.count({ where: { imobiliariaId: imobId } })).toBe(1);
  });

  it("não encosta em outro contato da mesma imobiliária", async () => {
    await montarCenario();
    const outra = await prisma.conversa.create({
      data: { imobiliariaId: imobId, agente: "VENDAS", contatoTelefone: OUTRO },
    });
    await prisma.lead.create({
      data: { imobiliariaId: imobId, nome: "Outro", telefone: OUTRO, finalidade: "LOCACAO" },
    });

    await limparDadosDoContato(imobId, TEL);

    expect(await prisma.conversa.findUnique({ where: { id: outra.id } })).not.toBeNull();
    expect(await prisma.lead.count({ where: { imobiliariaId: imobId } })).toBe(1);
  });

  it("não vaza para outra imobiliária com o MESMO número", async () => {
    // O mesmo telefone pode falar com duas imobiliárias. /reset numa não pode
    // apagar o atendimento da outra.
    const b = await prisma.imobiliaria.create({ data: { nome: `${uniq}-B`, taxaAdmPercent: 10 } });
    await montarCenario();
    const daB = await prisma.conversa.create({
      data: { imobiliariaId: b.id, agente: "VENDAS", contatoTelefone: TEL },
    });

    await limparDadosDoContato(imobId, TEL);

    expect(await prisma.conversa.findUnique({ where: { id: daB.id } })).not.toBeNull();
    await prisma.conversa.delete({ where: { id: daB.id } });
    await prisma.imobiliaria.delete({ where: { id: b.id } });
  });

  it("telefone curto demais não apaga nada (evita casar por acaso)", async () => {
    await montarCenario();
    const r = await limparDadosDoContato(imobId, "123");
    expect(r).toEqual({});
    expect(await prisma.conversa.count({ where: { imobiliariaId: imobId } })).toBe(1);
  });
});

describe("o aviso que sai no WhatsApp", () => {
  it("diz o que apagou e o que ficou", () => {
    const m = mensagemDeReset({ leads: 1, mensagens: 12, conversas: 2, qualificacoes: 0 });
    expect(m).toContain("Apaguei 1 lead, 12 mensagens, 2 conversas.");
    expect(m).not.toContain("qualificacoes"); // zero não entra na lista
    // A parte que evita pânico: o contrato não sumiu.
    expect(m).toContain("contratos e faturas continuam intactos");
  });

  it("concorda o singular com o número — nada de '1 conversas'", () => {
    const um = mensagemDeReset({ conversas: 1, mensagens: 1, qualificacoes: 1, propostasCompra: 1 });
    expect(um).toContain("1 conversa,");
    expect(um).toContain("1 mensagem,");
    expect(um).toContain("1 qualificação,");
    expect(um).toContain("1 proposta de compra");
    expect(um).not.toContain("1 conversas");
    expect(um).not.toContain("1 mensagens");
  });

  it("troca a chave do banco por nome que se lê em voz alta", () => {
    const m = mensagemDeReset({ propostasCompra: 3, propostas: 2 });
    expect(m).toContain("3 propostas de compra");
    expect(m).toContain("2 propostas de locação");
    expect(m).not.toContain("propostasCompra");
  });

  it("sem nada para apagar, não finge que apagou", () => {
    expect(mensagemDeReset({})).toContain("Não havia nada para apagar");
  });
});
