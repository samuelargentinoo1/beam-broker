// Testes do DIMOB (declaração à Receita) — estrutura de registros, larguras
// posicionais fixas, totalizador e estabilidade byte a byte. Erro aqui é
// declaração errada à Receita Federal.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { gerarDimob } from "@/lib/fiscal";

const ANO = 2023;
let imobId: number;

beforeAll(async () => {
  const uniq = Date.now();
  const imob = await prisma.imobiliaria.create({
    data: { nome: `Fisc${uniq}`, cnpj: "12345678000199", municipio: "ARARAQUARA", uf: "SP", taxaAdmPercent: 10 },
  });
  imobId = imob.id;
  const prop = await prisma.pessoa.create({ data: { imobiliariaId: imob.id, nome: "PROPRIETARIO UM", cpfCnpj: `1${uniq}` } });
  const inq = await prisma.pessoa.create({ data: { imobiliariaId: imob.id, nome: "INQUILINO UM", cpfCnpj: `2${uniq}` } });
  const imovel = await prisma.imovel.create({
    data: { imobiliariaId: imob.id, codigo: "AP-0001", tipo: "Apartamento", endereco: "RUA A, 100", cidade: "ARARAQUARA", uf: "SP", proprietarioId: prop.id },
  });
  const ct = await prisma.contrato.create({
    data: { imobiliariaId: imob.id, codigo: "CT-0001", imovelId: imovel.id, inquilinoId: inq.id, inicio: new Date(ANO, 0, 1), fim: new Date(ANO + 1, 11, 31), valorAluguel: 1000 },
  });
  // 12 faturas pagas, uma por mês, cada uma com repasse (comissão 100)
  for (let m = 0; m < 12; m++) {
    const f = await prisma.fatura.create({
      data: {
        imobiliariaId: imob.id,
        contratoId: ct.id,
        competencia: `${ANO}-${String(m + 1).padStart(2, "0")}`,
        vencimento: new Date(ANO, m, 5),
        valorAluguel: 1000,
        valorTotal: 1000,
        status: "PAGA",
        pagaEm: new Date(ANO, m, 5),
        valorPago: 1000,
      },
    });
    await prisma.repasse.create({
      data: { faturaId: f.id, valorBase: 1000, valorTaxaAdm: 100, valorRepasse: 900 },
    });
  }
});

afterAll(async () => {
  await prisma.repasse.deleteMany({ where: { fatura: { imobiliariaId: imobId } } });
  await prisma.fatura.deleteMany({ where: { imobiliariaId: imobId } });
  await prisma.contrato.deleteMany({ where: { imobiliariaId: imobId } });
  await prisma.imovel.deleteMany({ where: { imobiliariaId: imobId } });
  await prisma.pessoa.deleteMany({ where: { imobiliariaId: imobId } });
  await prisma.imobiliaria.deleteMany({ where: { id: imobId } });
  await prisma.$disconnect();
});

describe("gerarDimob", () => {
  it("um proprietário, um contrato, 12 meses: estrutura DIMOB/R01/R02/T9", async () => {
    const arquivo = await gerarDimob(ANO, imobId);
    const linhas = arquivo.split("\r\n").filter(Boolean);
    // abertura + R01 + 1 R02 + T9
    expect(linhas[0].startsWith("DIMOB")).toBe(true);
    expect(linhas.filter((l) => l.startsWith("R01")).length).toBe(1);
    expect(linhas.filter((l) => l.startsWith("R02")).length).toBe(1);
    expect(linhas.filter((l) => l.startsWith("T9")).length).toBe(1);
    expect(linhas.length).toBe(4);
  });

  it("larguras posicionais fixas: R01=123, R02=630, T9=11", async () => {
    const linhas = (await gerarDimob(ANO, imobId)).split("\r\n").filter(Boolean);
    expect(linhas.find((l) => l.startsWith("R01"))!.length).toBe(123);
    expect(linhas.find((l) => l.startsWith("R02"))!.length).toBe(630);
    expect(linhas.find((l) => l.startsWith("T9"))!.length).toBe(11);
  });

  it("totalizador T9 = número de linhas do arquivo", async () => {
    const linhas = (await gerarDimob(ANO, imobId)).split("\r\n").filter(Boolean);
    const t9 = linhas.find((l) => l.startsWith("T9"))!;
    expect(t9).toBe(`T9${String(linhas.length).padStart(9, "0")}`);
  });

  it("R02 traz o rendimento mensal em centavos (12 meses de R$ 1.000,00)", async () => {
    const r02 = (await gerarDimob(ANO, imobId)).split("\r\n").find((l) => l.startsWith("R02"))!;
    // 100000 centavos aparece 12 vezes (rendimento de cada mês)
    const ocorrencias = r02.split("00000000100000").length - 1;
    expect(ocorrencias).toBeGreaterThanOrEqual(12);
  });

  it("é estável byte a byte entre execuções", async () => {
    const a = await gerarDimob(ANO, imobId);
    const b = await gerarDimob(ANO, imobId);
    expect(a).toBe(b);
  });
});
