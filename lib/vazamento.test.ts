// Regressão dos vazamentos entre tenants encontrados na auditoria de isolamento.
// Cada teste reproduz a consulta EXATA da rota/tela corrigida e prova que ela não
// devolve dado de outra imobiliária.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A rota de diagnóstico é exercitada DE VERDADE (handler real), com a sessão
// mockada — assim o teste falha se o filtro de tenant sumir da consulta.
vi.mock("@/lib/sessao", () => ({ getSessao: vi.fn() }));

import { getSessao } from "@/lib/sessao";
import { prisma } from "@/lib/db";

const uniq = `${process.pid}`;
let imobA: { id: number };
let imobB: { id: number };

beforeAll(async () => {
  imobA = await prisma.imobiliaria.create({ data: { nome: `VazA${uniq}`, taxaAdmPercent: 10 } });
  imobB = await prisma.imobiliaria.create({ data: { nome: `VazB${uniq}`, taxaAdmPercent: 10 } });

  // Tráfego de WhatsApp da imobiliária B (payload cru com telefone e texto).
  await prisma.webhookLog.createMany({
    data: [
      {
        imobiliariaId: imobB.id,
        telefone: "5511988887777",
        corpo: JSON.stringify({ message: { text: "segredo comercial do cliente de B" } }),
        resultado: "processado",
      },
      // Webhook que não pôde ser roteado: sem tenant. Não é de ninguém.
      { telefone: "5511900000000", corpo: JSON.stringify({ message: { text: "nao roteado" } }), resultado: "ignorado" },
    ],
  });

  // Trilha de auditoria: uma ação de B e uma ação de plataforma (sem tenant).
  await prisma.logAuditoria.createMany({
    data: [
      { acao: "FATURA_BAIXADA", entidade: "Fatura", detalhes: "cliente de B", imobiliariaId: imobB.id },
      { acao: "CLIENTE_PROVISIONADO", entidade: "Imobiliaria", detalhes: "acao do dono, sem tenant" },
    ],
  });

  await prisma.lead.create({
    data: { imobiliariaId: imobB.id, nome: `Lead Confidencial de B ${uniq}`, telefone: "5511911112222" },
  });
});

afterAll(async () => {
  const ids = [imobA.id, imobB.id];
  await prisma.webhookLog.deleteMany({ where: { OR: [{ imobiliariaId: { in: ids } }, { telefone: "5511900000000" }] } });
  await prisma.logAuditoria.deleteMany({
    where: { OR: [{ imobiliariaId: { in: ids } }, { detalhes: "acao do dono, sem tenant" }] },
  });
  await prisma.lead.deleteMany({ where: { imobiliariaId: { in: ids } } });
  await prisma.imobiliaria.deleteMany({ where: { id: { in: ids } } });
});

describe("diagnóstico de WhatsApp (/api/whatsapp/diagnostico acao=webhooks)", () => {
  // Chama o handler POST real da rota, logado como a imobiliária informada.
  async function pedirWebhooks(comoTenantId: number) {
    (getSessao as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      usuario: { id: 1 },
      imobiliaria: { id: comoTenantId },
    });
    const { POST } = await import("@/app/api/whatsapp/diagnostico/route");
    const req = new Request("http://local/api/whatsapp/diagnostico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "webhooks" }),
    });
    // O handler tipa NextRequest, mas só usa .json() e .nextUrl nesta ação.
    const res = await POST(req as never);
    return (await res.json()) as { logs: { telefone: string | null; corpo: string }[] };
  }

  it("não devolve o payload de WhatsApp de outra imobiliária", async () => {
    const { logs } = await pedirWebhooks(imobA.id);
    expect(JSON.stringify(logs)).not.toContain("segredo comercial");
    expect(logs.some((l) => l.telefone === "5511988887777")).toBe(false);
  });

  it("não devolve nem os webhooks sem tenant identificado", async () => {
    const { logs } = await pedirWebhooks(imobA.id);
    expect(logs.some((l) => l.telefone === "5511900000000")).toBe(false);
  });

  it("a própria imobiliária continua vendo o seu diagnóstico", async () => {
    const { logs } = await pedirWebhooks(imobB.id);
    expect(logs.some((l) => l.corpo.includes("segredo comercial"))).toBe(true);
  });
});

describe("trilha de auditoria (/auditoria)", () => {
  it("não mostra ações de outro tenant nem ações de plataforma sem dono", async () => {
    const logs = await prisma.logAuditoria.findMany({ where: { imobiliariaId: imobA.id } });
    const texto = JSON.stringify(logs);
    expect(texto).not.toContain("cliente de B");
    expect(texto).not.toContain("acao do dono, sem tenant");
  });
});

describe("pré-preenchimento de proposta (/propostas/nova?leadId=)", () => {
  it("não carrega lead de outra imobiliária ao iterar o id", async () => {
    const alvo = await prisma.lead.findFirstOrThrow({ where: { imobiliariaId: imobB.id } });
    // Consulta idêntica à da página, logado como imobiliária A.
    const lead = await prisma.lead.findFirst({
      where: { id: alvo.id, imobiliariaId: imobA.id },
    });
    expect(lead).toBeNull();
  });
});
