// Testes de isolamento de tenant: cada função de carregamento deve RECUSAR um
// registro de OUTRA imobiliária (ErroDeAcesso). Usa o banco de teste (2
// imobiliárias) com exigirSessao mockado.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mocka a sessão: assim os testes controlam "quem está logado" sem cookies.
vi.mock("@/lib/sessao", () => ({ exigirSessao: vi.fn() }));

import { exigirSessao } from "@/lib/sessao";
import { prisma } from "@/lib/db";
import {
  ErroDeAcesso,
  carregarContrato,
  carregarFatura,
  carregarImovel,
  carregarOcorrencia,
  carregarPessoa,
  carregarRepasse,
} from "@/lib/escopo";

type Imob = { id: number };
let imobA: Imob;
let imobB: Imob;
const ref: Record<string, number> = {};

function logadoComo(imob: Imob) {
  (exigirSessao as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    imobiliaria: imob,
    usuario: { id: 1 },
  });
}

beforeAll(async () => {
  const uniq = Date.now();
  imobA = await prisma.imobiliaria.create({ data: { nome: `A${uniq}`, taxaAdmPercent: 10 } });
  imobB = await prisma.imobiliaria.create({ data: { nome: `B${uniq}`, taxaAdmPercent: 10 } });

  const prop = await prisma.pessoa.create({ data: { imobiliariaId: imobA.id, nome: "P", cpfCnpj: `p${uniq}` } });
  const inq = await prisma.pessoa.create({ data: { imobiliariaId: imobA.id, nome: "I", cpfCnpj: `i${uniq}` } });
  ref.pessoa = prop.id;
  const imovel = await prisma.imovel.create({
    data: { imobiliariaId: imobA.id, codigo: "AP-0001", tipo: "Apartamento", endereco: "R X", cidade: "C", uf: "SP", proprietarioId: prop.id },
  });
  ref.imovel = imovel.id;
  const contrato = await prisma.contrato.create({
    data: { imobiliariaId: imobA.id, codigo: "CT-0001", imovelId: imovel.id, inquilinoId: inq.id, inicio: new Date(), fim: new Date(), valorAluguel: 1000 },
  });
  ref.contrato = contrato.id;
  const fatura = await prisma.fatura.create({
    data: { imobiliariaId: imobA.id, contratoId: contrato.id, competencia: "2026-07", vencimento: new Date(), valorAluguel: 1000, valorTotal: 1000 },
  });
  ref.fatura = fatura.id;
  const repasse = await prisma.repasse.create({
    data: { faturaId: fatura.id, valorBase: 1000, valorTaxaAdm: 100, valorRepasse: 900 },
  });
  ref.repasse = repasse.id;
  const oc = await prisma.ocorrencia.create({ data: { imovelId: imovel.id, titulo: "vazamento" } });
  ref.ocorrencia = oc.id;
});

afterAll(async () => {
  await prisma.repasse.deleteMany({ where: { fatura: { imobiliariaId: imobA.id } } });
  await prisma.fatura.deleteMany({ where: { imobiliariaId: imobA.id } });
  await prisma.ocorrencia.deleteMany({ where: { imovel: { imobiliariaId: imobA.id } } });
  await prisma.contrato.deleteMany({ where: { imobiliariaId: imobA.id } });
  await prisma.imovel.deleteMany({ where: { imobiliariaId: imobA.id } });
  await prisma.pessoa.deleteMany({ where: { imobiliariaId: imobA.id } });
  await prisma.imobiliaria.deleteMany({ where: { id: { in: [imobA.id, imobB.id] } } });
  await prisma.$disconnect();
});

describe("escopo de tenant — próprio tenant carrega", () => {
  it("carrega registros do próprio tenant", async () => {
    logadoComo(imobA);
    expect((await carregarPessoa(ref.pessoa)).registro.id).toBe(ref.pessoa);
    expect((await carregarImovel(ref.imovel)).registro.id).toBe(ref.imovel);
    expect((await carregarContrato(ref.contrato)).registro.id).toBe(ref.contrato);
    expect((await carregarFatura(ref.fatura)).registro.id).toBe(ref.fatura);
    expect((await carregarRepasse(ref.repasse)).registro.id).toBe(ref.repasse);
    expect((await carregarOcorrencia(ref.ocorrencia)).registro.id).toBe(ref.ocorrencia);
  });
});

describe("escopo de tenant — outro tenant é RECUSADO", () => {
  it("todas as funções lançam ErroDeAcesso para registro de outra imobiliária", async () => {
    logadoComo(imobB); // logado como B, tentando ler registros de A
    await expect(carregarPessoa(ref.pessoa)).rejects.toBeInstanceOf(ErroDeAcesso);
    await expect(carregarImovel(ref.imovel)).rejects.toBeInstanceOf(ErroDeAcesso);
    await expect(carregarContrato(ref.contrato)).rejects.toBeInstanceOf(ErroDeAcesso);
    await expect(carregarFatura(ref.fatura)).rejects.toBeInstanceOf(ErroDeAcesso);
    await expect(carregarRepasse(ref.repasse)).rejects.toBeInstanceOf(ErroDeAcesso);
    await expect(carregarOcorrencia(ref.ocorrencia)).rejects.toBeInstanceOf(ErroDeAcesso);
  });

  it("a mensagem do erro é genérica (não vira oráculo de enumeração)", async () => {
    logadoComo(imobB);
    await expect(carregarContrato(ref.contrato)).rejects.toThrowError("Registro não encontrado");
  });
});
