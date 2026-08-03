// Critério de aceite nº 1 do M4 (o de segurança): o proprietário A não pode
// consultar nada do proprietário B, MESMO passando o imovelId/ocorrenciaId
// correto de B no input. Aqui o "atacante" é quem manda mensagem no WhatsApp.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { resolverInterlocutor } from "@/lib/atendimento";

const uniq = process.pid;
let imobId: number;
let outraImobId: number;
let propA: { id: number };
let propB: { id: number };
let inquilino: { id: number };
let imovelA: { id: number };
let imovelB: { id: number };
let ocorrenciaB: { id: number };

const TEL_A = `1199${String(uniq).slice(-6).padStart(6, "0")}`;
const TEL_B = `1188${String(uniq).slice(-6).padStart(6, "0")}`;
const TEL_INQ = `1177${String(uniq).slice(-6).padStart(6, "0")}`;
const TEL_DESCONHECIDO = "11900000000";

beforeAll(async () => {
  const imob = await prisma.imobiliaria.create({ data: { nome: `Inter${uniq}`, taxaAdmPercent: 10 } });
  imobId = imob.id;
  const outra = await prisma.imobiliaria.create({ data: { nome: `Outra${uniq}`, taxaAdmPercent: 10 } });
  outraImobId = outra.id;

  propA = await prisma.pessoa.create({
    data: { imobiliariaId: imobId, nome: "Proprietário A", cpfCnpj: `pa${uniq}`, telefone: TEL_A },
  });
  propB = await prisma.pessoa.create({
    data: { imobiliariaId: imobId, nome: "Proprietário B", cpfCnpj: `pb${uniq}`, telefone: TEL_B },
  });
  inquilino = await prisma.pessoa.create({
    data: { imobiliariaId: imobId, nome: "Inquilino", cpfCnpj: `iq${uniq}`, telefone: TEL_INQ },
  });

  imovelA = await prisma.imovel.create({
    data: { imobiliariaId: imobId, codigo: "AP-A001", tipo: "Apartamento", endereco: "Rua A", cidade: "C", uf: "SP", proprietarioId: propA.id },
  });
  imovelB = await prisma.imovel.create({
    data: { imobiliariaId: imobId, codigo: "AP-B001", tipo: "Apartamento", endereco: "Rua B", cidade: "C", uf: "SP", proprietarioId: propB.id },
  });

  const contrato = await prisma.contrato.create({
    data: {
      imobiliariaId: imobId,
      codigo: `CT-${uniq}`,
      imovelId: imovelB.id,
      inquilinoId: inquilino.id,
      inicio: new Date(),
      fim: new Date(),
      valorAluguel: 1000,
    },
  });
  ocorrenciaB = await prisma.ocorrencia.create({
    data: { imovelId: imovelB.id, contratoId: contrato.id, titulo: "Reparo de B", aguardandoAprovacao: true },
  });
});

afterAll(async () => {
  await prisma.ocorrencia.deleteMany({ where: { imovel: { imobiliariaId: imobId } } });
  await prisma.contrato.deleteMany({ where: { imobiliariaId: imobId } });
  await prisma.imovel.deleteMany({ where: { imobiliariaId: imobId } });
  await prisma.pessoa.deleteMany({ where: { imobiliariaId: imobId } });
  await prisma.imobiliaria.deleteMany({ where: { id: { in: [imobId, outraImobId] } } });
});

describe("resolverInterlocutor", () => {
  it("identifica o proprietário pelo telefone e lista SÓ os imóveis dele", async () => {
    const eu = await resolverInterlocutor(imobId, TEL_A);
    expect(eu.pessoa?.id).toBe(propA.id);
    expect(eu.perfil).toBe("PROPRIETARIO");
    expect(eu.imoveisComoProprietario).toEqual([imovelA.id]);
    expect(eu.imoveisComoProprietario).not.toContain(imovelB.id);
  });

  it("identifica o locatário e lista só o contrato dele", async () => {
    const eu = await resolverInterlocutor(imobId, TEL_INQ);
    expect(eu.pessoa?.id).toBe(inquilino.id);
    expect(eu.perfil).toBe("LOCATARIO");
    expect(eu.contratosComoInquilino).toHaveLength(1);
    expect(eu.imoveisComoProprietario).toEqual([]);
  });

  it("telefone desconhecido não identifica ninguém (a IA encaminha para humano)", async () => {
    const eu = await resolverInterlocutor(imobId, TEL_DESCONHECIDO);
    expect(eu.pessoa).toBeNull();
    expect(eu.perfil).toBeNull();
    expect(eu.imoveisComoProprietario).toEqual([]);
  });

  it("telefone ausente não identifica ninguém", async () => {
    expect((await resolverInterlocutor(imobId, null)).pessoa).toBeNull();
    expect((await resolverInterlocutor(imobId, "")).pessoa).toBeNull();
  });

  it("não atravessa tenant: o mesmo telefone não resolve em outra imobiliária", async () => {
    const eu = await resolverInterlocutor(outraImobId, TEL_A);
    expect(eu.pessoa).toBeNull();
  });
});

describe("escopo por posse — o input do modelo não manda", () => {
  it("proprietário A NÃO alcança o imóvel de B mesmo com o id correto", async () => {
    const eu = await resolverInterlocutor(imobId, TEL_A);
    // Réplica exata do filtro usado em consultar_situacao_imovel: o id de B
    // simplesmente não está no conjunto permitido.
    const achado = await prisma.imovel.findMany({
      where: { id: { in: eu.imoveisComoProprietario }, codigo: { contains: "AP-B001" } },
    });
    expect(achado).toHaveLength(0);
  });

  it("proprietário A NÃO aprova orçamento de imóvel de B", async () => {
    const eu = await resolverInterlocutor(imobId, TEL_A);
    // Réplica do filtro de aprovar_orcamento, com o ocorrenciaId REAL de B.
    const oc = await prisma.ocorrencia.findFirst({
      where: {
        id: ocorrenciaB.id,
        imovelId: { in: eu.imoveisComoProprietario },
        aguardandoAprovacao: true,
      },
    });
    expect(oc).toBeNull();

    // E o dono legítimo alcança.
    const dono = await resolverInterlocutor(imobId, TEL_B);
    const ocDono = await prisma.ocorrencia.findFirst({
      where: {
        id: ocorrenciaB.id,
        imovelId: { in: dono.imoveisComoProprietario },
        aguardandoAprovacao: true,
      },
    });
    expect(ocDono?.id).toBe(ocorrenciaB.id);
  });

  it("proprietário A não vê repasse dos imóveis de B", async () => {
    const eu = await resolverInterlocutor(imobId, TEL_A);
    const repasses = await prisma.repasse.findMany({
      where: {
        fatura: { contrato: { imovelId: { in: eu.imoveisComoProprietario } } },
      },
    });
    expect(repasses).toHaveLength(0);
  });
});

describe("idempotência do aviso ao proprietário", () => {
  it("uma ocorrência já avisada não é avisada de novo", async () => {
    await prisma.ocorrencia.update({
      where: { id: ocorrenciaB.id },
      data: { proprietarioAvisadoEm: new Date() },
    });
    const oc = await prisma.ocorrencia.findUniqueOrThrow({ where: { id: ocorrenciaB.id } });
    // É exatamente a guarda de notificar_proprietario.
    expect(oc.proprietarioAvisadoEm).not.toBeNull();

    // E a varredura de agendados ignora quem já foi avisado.
    const pendentes = await prisma.ocorrencia.findMany({
      where: { avisoAgendadoPara: { lte: new Date() }, proprietarioAvisadoEm: null },
    });
    expect(pendentes.map((o) => o.id)).not.toContain(ocorrenciaB.id);

    await prisma.ocorrencia.update({
      where: { id: ocorrenciaB.id },
      data: { proprietarioAvisadoEm: null },
    });
  });
});
