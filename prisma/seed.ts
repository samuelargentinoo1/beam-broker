import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

async function main() {
  // Imobiliária demo (tenant) + usuário administrador
  const { randomBytes, scryptSync } = await import("crypto");
  const salt = randomBytes(16).toString("hex");
  const senhaHash = `${salt}:${scryptSync("admin123", salt, 64).toString("hex")}`;

  const imob = await prisma.imobiliaria.create({
    data: {
      nome: "Imobiliária Demo",
      cnpj: "00.000.000/0001-00",
      telefone: "(16) 3333-0000",
      email: "admin@demo.com",
      municipio: "Araraquara",
      uf: "SP",
      modeloRemuneracao: "PERCENTUAL",
      taxaAdmPercent: 10,
      multaPercent: 2,
      jurosMesPercent: 1,
      seguroFiancaPercent: 11,
      regrasRevisadas: true,
    },
  });
  await prisma.usuario.create({
    data: {
      imobiliariaId: imob.id,
      nome: "Administrador Demo",
      email: "admin@demo.com",
      senhaHash,
    },
  });

  // Proprietários
  const carlos = await prisma.pessoa.create({
    data: {
      imobiliariaId: imob.id,
      nome: "Carlos Andrade",
      cpfCnpj: "111.222.333-44",
      email: "carlos.andrade@email.com",
      telefone: "(16) 99911-0001",
      banco: "Itaú",
      agencia: "0450",
      conta: "12345-6",
      chavePix: "carlos.andrade@email.com",
    },
  });
  const marcia = await prisma.pessoa.create({
    data: {
      imobiliariaId: imob.id,
      nome: "Márcia Oliveira",
      cpfCnpj: "222.333.444-55",
      email: "marcia.oliveira@email.com",
      telefone: "(16) 99911-0002",
      banco: "Bradesco",
      agencia: "1200",
      conta: "98765-4",
      chavePix: "16999110002",
    },
  });
  const wtInvest = await prisma.pessoa.create({
    data: {
      imobiliariaId: imob.id,
      tipo: "JURIDICA",
      nome: "WT Investimentos Ltda",
      cpfCnpj: "12.345.678/0001-90",
      email: "financeiro@wtinvest.com.br",
      telefone: "(16) 3333-0003",
      banco: "Santander",
      agencia: "3021",
      conta: "55044-1",
      chavePix: "12.345.678/0001-90",
    },
  });

  // Inquilinos
  const juliana = await prisma.pessoa.create({
    data: {
      imobiliariaId: imob.id,
      nome: "Juliana Castro",
      cpfCnpj: "333.444.555-66",
      email: "juliana.castro@email.com",
      telefone: "(16) 99922-0001",
    },
  });
  const roberto = await prisma.pessoa.create({
    data: {
      imobiliariaId: imob.id,
      nome: "Roberto Lima",
      cpfCnpj: "444.555.666-77",
      email: "roberto.lima@email.com",
      telefone: "(16) 99922-0002",
    },
  });
  const padaria = await prisma.pessoa.create({
    data: {
      imobiliariaId: imob.id,
      tipo: "JURIDICA",
      nome: "Padaria Pão Dourado ME",
      cpfCnpj: "98.765.432/0001-10",
      email: "contato@paodourado.com.br",
      telefone: "(16) 99922-0003",
    },
  });

  // Imóveis
  const ap1 = await prisma.imovel.create({
    data: {
      imobiliariaId: imob.id,
      codigo: "AP-0001",
      tipo: "Apartamento",
      endereco: "Rua das Palmeiras, 120 - apto 34",
      bairro: "Centro",
      cidade: "Araraquara",
      uf: "SP",
      cep: "14801-000",
      status: "ALUGADO",
      valorSugerido: 1800,
      valorCondominio: 420,
      valorIptuMensal: 95,
      proprietarioId: carlos.id,
    },
  });
  const cs1 = await prisma.imovel.create({
    data: {
      imobiliariaId: imob.id,
      codigo: "CS-0001",
      tipo: "Casa",
      endereco: "Av. Brasil, 950",
      bairro: "Jardim América",
      cidade: "Araraquara",
      uf: "SP",
      status: "ALUGADO",
      valorSugerido: 2600,
      valorIptuMensal: 140,
      proprietarioId: marcia.id,
    },
  });
  const sl1 = await prisma.imovel.create({
    data: {
      imobiliariaId: imob.id,
      codigo: "SL-0001",
      tipo: "Sala comercial",
      endereco: "Rua Nove de Julho, 77 - sala 12",
      bairro: "Centro",
      cidade: "Araraquara",
      uf: "SP",
      status: "ALUGADO",
      valorSugerido: 3200,
      valorCondominio: 380,
      proprietarioId: wtInvest.id,
    },
  });
  await prisma.imovel.create({
    data: {
      imobiliariaId: imob.id,
      codigo: "AP-0002",
      tipo: "Apartamento",
      endereco: "Rua Itália, 45 - apto 101",
      bairro: "Vila Xavier",
      cidade: "Araraquara",
      uf: "SP",
      status: "DISPONIVEL",
      valorSugerido: 1500,
      valorCondominio: 350,
      proprietarioId: carlos.id,
    },
  });
  await prisma.imovel.create({
    data: {
      imobiliariaId: imob.id,
      codigo: "CS-0002",
      tipo: "Casa",
      endereco: "Rua Padre Duarte, 310",
      bairro: "Carmo",
      cidade: "Araraquara",
      uf: "SP",
      status: "EM_REFORMA",
      valorSugerido: 2200,
      proprietarioId: marcia.id,
    },
  });

  const hoje = new Date();

  // Despesas operacionais da administradora
  await prisma.lancamento.createMany({
    data: [
      {
        imobiliariaId: imob.id,
        tipo: "DESPESA",
        categoria: "Despesa operacional",
        descricao: "Software de assinatura digital (mensalidade)",
        valor: 189.9,
        data: addMonths(hoje, -1),
      },
      {
        imobiliariaId: imob.id,
        tipo: "DESPESA",
        categoria: "Manutenção",
        descricao: "Reparo hidráulico AP-0001",
        valor: 260,
        data: addMonths(hoje, -2),
      },
    ],
  });

  // Vistorias
  await prisma.vistoria.createMany({
    data: [
      { imovelId: ap1.id, tipo: "ENTRADA", data: addMonths(hoje, -10), laudo: "Imóvel em bom estado. Pintura nova." },
      { imovelId: cs1.id, tipo: "PERIODICA", data: addMonths(hoje, -3), laudo: "Infiltração leve na lavanderia — proprietária ciente." },
    ],
  });

  // Conversas de exemplo do módulo de atendimento
  const convJuliana = await prisma.conversa.create({
    data: { imobiliariaId: imob.id, pessoaId: juliana.id, perfil: "LOCATARIO" },
  });
  await prisma.mensagem.createMany({
    data: [
      { conversaId: convJuliana.id, autor: "CLIENTE", texto: "Oi! Vi o anúncio do apartamento na Rua Itália. Ainda está disponível?" },
      { conversaId: convJuliana.id, autor: "IA", texto: "Olá, Juliana! Está sim — AP-0002, 2 quartos na Vila Xavier, R$ 1.500/mês. Quer agendar uma visita?" },
    ],
  });
  const convCarlos = await prisma.conversa.create({
    data: { imobiliariaId: imob.id, pessoaId: carlos.id, perfil: "PROPRIETARIO" },
  });
  await prisma.mensagem.createMany({
    data: [
      { conversaId: convCarlos.id, autor: "CLIENTE", texto: "Boa tarde, quero colocar meu apartamento da Rua das Palmeiras para alugar. Como funciona?" },
      { conversaId: convCarlos.id, autor: "IA", texto: "Boa tarde, Carlos! Ótimo. Faço uma avaliação do imóvel e já te passo o valor sugerido de aluguel. Pode me confirmar a metragem e o número de quartos?" },
    ],
  });

  // ── CRM / operação ──
  await prisma.lead.createMany({
    data: [
      { imobiliariaId: imob.id, nome: "Fernanda Souza", telefone: "(16) 99933-0001", origem: "PORTAL", status: "NOVO", temperatura: "QUENTE" },
      { imobiliariaId: imob.id, nome: "Paulo Mendes", telefone: "(16) 99933-0002", origem: "FACEBOOK", status: "ATENDIMENTO", temperatura: "MORNO" },
      { imobiliariaId: imob.id, nome: "Ricardo Alves", telefone: "(16) 99933-0003", origem: "INDICACAO", status: "VISITA_AGENDADA", temperatura: "QUENTE", visitaEm: addMonths(hoje, 0) },
    ],
  });

  const ap2 = await prisma.imovel.findFirst({ where: { codigo: "AP-0002", imobiliariaId: imob.id } });

  await prisma.movimentoChave.create({
    data: {
      imovelId: ap2?.id ?? ap1.id,
      retiradaPor: "Fernanda Souza (visita)",
      telefone: "(16) 99933-0001",
      devolucaoPrevista: addMonths(hoje, 0),
    },
  });

  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
