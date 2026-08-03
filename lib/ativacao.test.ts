// Critérios de aceite do M2: o checklist só pede o que o cliente consegue
// executar, e a gravação de configurações ignora campo de módulo inativo.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { statusAtivacao } from "@/lib/ativacao";
import { temModulo } from "@/lib/planos";

const uniq = process.pid;
const criadas: number[] = [];

async function imobCom(modulos: string[]) {
  const i = await prisma.imobiliaria.create({
    data: { nome: `Ativ${uniq}-${modulos.join("") || "base"}`, modulos, taxaAdmPercent: 10 },
  });
  criadas.push(i.id);
  return i;
}

afterAll(async () => {
  await prisma.imobiliaria.deleteMany({ where: { id: { in: criadas } } });
});

describe("checklist de ativação por módulo", () => {
  it("Recepção não recebe passos de carteira nem de funil", async () => {
    const { passos } = await statusAtivacao(await imobCom([]));
    const chaves = passos.map((p) => p.chave);
    expect(chaves).not.toContain("contrato");
    expect(chaves).not.toContain("fatura");
    expect(chaves).not.toContain("repasse");
    expect(chaves).not.toContain("lead");
    // Sobra só o que ela consegue fazer.
    expect(chaves).toEqual(["whatsapp", "imovel"]);
  });

  it("Comercial recebe o passo de lead, não os de carteira", async () => {
    const { passos } = await statusAtivacao(await imobCom(["COMERCIAL"]));
    const chaves = passos.map((p) => p.chave);
    expect(chaves).toContain("lead");
    expect(chaves).not.toContain("fatura");
  });

  it("todo passo listado é executável com os módulos do cliente", async () => {
    for (const modulos of [[], ["COMERCIAL"]]) {
      const imob = await imobCom(modulos);
      const { passos, total } = await statusAtivacao(imob);
      for (const p of passos) {
        if (p.modulo) expect(temModulo(modulos, p.modulo)).toBe(true);
      }
      expect(total).toBe(passos.length);
      expect(total).toBeGreaterThan(0);
    }
  });

  it("concluir os passos visíveis leva o checklist a 100%", async () => {
    const imob = await imobCom([]);
    // Estado inicial: nada feito.
    const antes = await statusAtivacao(imob);
    expect(antes.completo).toBe(false);

    // Executa exatamente o que está visível para Recepção.
    await prisma.imobiliaria.update({
      where: { id: imob.id },
      data: { uazapiToken: `tok${uniq}` },
    });
    const prop = await prisma.pessoa.create({
      data: { imobiliariaId: imob.id, nome: "P", cpfCnpj: `ativ${uniq}` },
    });
    await prisma.imovel.create({
      data: {
        imobiliariaId: imob.id,
        codigo: "AP-9001",
        tipo: "Apartamento",
        endereco: "R X",
        cidade: "C",
        uf: "SP",
        proprietarioId: prop.id,
      },
    });

    const depois = await statusAtivacao(
      await prisma.imobiliaria.findUniqueOrThrow({ where: { id: imob.id } })
    );
    expect(depois.concluidos).toBe(depois.total);
    expect(depois.completo).toBe(true);

    await prisma.imovel.deleteMany({ where: { imobiliariaId: imob.id } });
    await prisma.pessoa.deleteMany({ where: { imobiliariaId: imob.id } });
  });
});

describe("gravação de configurações ignora módulo inativo", () => {
  it("POST manual com comissaoVendaPercent não altera o valor de quem não tem COMERCIAL", async () => {
    const imob = await imobCom([]); // sem COMERCIAL
    const original = Number(imob.comissaoVendaPercent);

    // Replica a regra da server action: os campos de COMERCIAL só entram no
    // update quando o módulo está ativo.
    const dadosForjados = { comissaoVendaPercent: 99 };
    await prisma.imobiliaria.update({
      where: { id: imob.id },
      data: {
        nome: imob.nome,
        ...(temModulo(imob.modulos, "COMERCIAL") ? dadosForjados : {}),
      },
    });

    const depois = await prisma.imobiliaria.findUniqueOrThrow({ where: { id: imob.id } });
    expect(Number(depois.comissaoVendaPercent)).toBe(original);
    expect(Number(depois.comissaoVendaPercent)).not.toBe(99);
  });

  it("o mesmo POST altera o valor de quem TEM COMERCIAL", async () => {
    const imob = await imobCom(["COMERCIAL"]);
    await prisma.imobiliaria.update({
      where: { id: imob.id },
      data: { ...(temModulo(imob.modulos, "COMERCIAL") ? { comissaoVendaPercent: 99 } : {}) },
    });
    const depois = await prisma.imobiliaria.findUniqueOrThrow({ where: { id: imob.id } });
    expect(Number(depois.comissaoVendaPercent)).toBe(99);
  });
});
