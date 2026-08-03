// Módulo fiscal: DIMOB e informe de rendimentos.
//
// A DIMOB (Declaração de Informações sobre Atividades Imobiliárias) é
// obrigatória para administradoras: registro R02 de locação, por contrato,
// com os valores mensais de rendimento (aluguel pago ao locador) e comissão
// (taxa de administração) do ano-calendário.
//
// O arquivo gerado segue a estrutura de registros do layout oficial
// (DIMOB|R01|R02|T9). Antes da entrega, valide no programa gerador da
// Receita Federal — campos de identificação da declarante vêm das envs
// DECLARANTE_*.

import { prisma } from "@/lib/db";
import { round2 } from "@/lib/financeiro";

export type MovimentoContrato = {
  contratoId: number;
  codigo: string;
  locador: { nome: string; cpfCnpj: string };
  locatario: { nome: string; cpfCnpj: string };
  endereco: string;
  // índice 0-11 = jan-dez
  rendimentoMensal: number[];
  comissaoMensal: number[];
  totalRendimento: number;
  totalComissao: number;
};

export async function movimentosDoAno(ano: number, imobiliariaId?: number): Promise<MovimentoContrato[]> {
  const faturas = await prisma.fatura.findMany({
    where: {
      status: "PAGA",
      pagaEm: { gte: new Date(ano, 0, 1), lt: new Date(ano + 1, 0, 1) },
      ...(imobiliariaId ? { contrato: { imovel: { imobiliariaId } } } : {}),
    },
    include: {
      repasse: true,
      contrato: { include: { inquilino: true, imovel: { include: { proprietario: true } } } },
    },
  });

  const porContrato = new Map<number, MovimentoContrato>();
  for (const f of faturas) {
    const ct = f.contrato;
    let mov = porContrato.get(ct.id);
    if (!mov) {
      mov = {
        contratoId: ct.id,
        codigo: ct.codigo,
        locador: { nome: ct.imovel.proprietario.nome, cpfCnpj: ct.imovel.proprietario.cpfCnpj },
        locatario: { nome: ct.inquilino.nome, cpfCnpj: ct.inquilino.cpfCnpj },
        endereco: `${ct.imovel.endereco}, ${ct.imovel.cidade}/${ct.imovel.uf}`,
        rendimentoMensal: Array(12).fill(0),
        comissaoMensal: Array(12).fill(0),
        totalRendimento: 0,
        totalComissao: 0,
      };
      porContrato.set(ct.id, mov);
    }
    const mes = new Date(f.pagaEm!).getMonth();
    // Decimal (exato, 2 casas) -> number no ponto de uso; a aritmética com round2
    // é a MESMA de antes, então o DIMOB gerado segue byte a byte idêntico.
    const rendimento = Number(f.valorPago ?? f.valorTotal);
    const comissao = Number(f.repasse?.valorTaxaAdm ?? 0);
    mov.rendimentoMensal[mes] = round2(mov.rendimentoMensal[mes] + rendimento);
    mov.comissaoMensal[mes] = round2(mov.comissaoMensal[mes] + comissao);
    mov.totalRendimento = round2(mov.totalRendimento + rendimento);
    mov.totalComissao = round2(mov.totalComissao + comissao);
  }
  return [...porContrato.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

// ─── Geração do arquivo DIMOB ───────────────────────────────────────────────

const num = (v: number, tam: number) =>
  Math.round(v * 100).toString().padStart(tam, "0").slice(-tam); // centavos, zeros à esquerda
const texto = (s: string, tam: number) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().padEnd(tam, " ").slice(0, tam);
const docNum = (s: string, tam: number) => s.replace(/\D/g, "").padStart(tam, "0").slice(-tam);

export async function gerarDimob(ano: number, imobiliariaId?: number): Promise<string> {
  const imob = imobiliariaId
    ? await prisma.imobiliaria.findUnique({ where: { id: imobiliariaId } })
    : null;
  const declarante = {
    cnpj: imob?.cnpj ?? process.env.DECLARANTE_CNPJ ?? "00000000000000",
    nome: imob?.nome ?? process.env.DECLARANTE_NOME ?? "ADMINISTRADORA DEMO LTDA",
    municipio: imob?.municipio ?? process.env.DECLARANTE_MUNICIPIO ?? "ARARAQUARA",
    uf: imob?.uf ?? process.env.DECLARANTE_UF ?? "SP",
  };
  const movimentos = await movimentosDoAno(ano, imobiliariaId);

  const linhas: string[] = [];
  // Registro de abertura
  linhas.push(`DIMOB${" ".repeat(3)}${docNum(declarante.cnpj, 14)}${ano}`);
  // R01 — dados da declarante
  linhas.push(
    ["R01", docNum(declarante.cnpj, 14), String(ano), texto(declarante.nome, 60), texto(declarante.municipio, 40), texto(declarante.uf, 2)].join("")
  );
  // R02 — um registro de locação por contrato, com 12 pares (rendimento, comissão)
  let seq = 0;
  for (const mov of movimentos) {
    seq++;
    const meses = mov.rendimentoMensal
      .map((r, i) => num(r, 14) + num(mov.comissaoMensal[i], 14))
      .join("");
    linhas.push(
      [
        "R02",
        docNum(declarante.cnpj, 14),
        String(ano),
        String(seq).padStart(5, "0"),
        docNum(mov.locador.cpfCnpj, 14),
        texto(mov.locador.nome, 60),
        docNum(mov.locatario.cpfCnpj, 14),
        texto(mov.locatario.nome, 60),
        meses,
        texto(mov.endereco, 120),
      ].join("")
    );
  }
  // Trailer
  linhas.push(`T9${String(linhas.length + 1).padStart(9, "0")}`);
  return linhas.join("\r\n") + "\r\n";
}

// ─── Informe de rendimentos por proprietário ────────────────────────────────

export async function informeProprietario(proprietarioId: number, ano: number, imobiliariaId?: number) {
  const movimentos = await movimentosDoAno(ano, imobiliariaId);
  const proprietario = await prisma.pessoa.findUniqueOrThrow({ where: { id: proprietarioId } });
  const doProprietario = movimentos.filter(
    (m) => m.locador.cpfCnpj === proprietario.cpfCnpj
  );
  const rendimentoMensal = Array(12).fill(0);
  const comissaoMensal = Array(12).fill(0);
  for (const m of doProprietario) {
    m.rendimentoMensal.forEach((v, i) => (rendimentoMensal[i] = round2(rendimentoMensal[i] + v)));
    m.comissaoMensal.forEach((v, i) => (comissaoMensal[i] = round2(comissaoMensal[i] + v)));
  }
  return {
    proprietario,
    ano,
    contratos: doProprietario,
    rendimentoMensal,
    comissaoMensal,
    liquidoMensal: rendimentoMensal.map((v, i) => round2(v - comissaoMensal[i])),
    totalRendimento: round2(rendimentoMensal.reduce((a, b) => a + b, 0)),
    totalComissao: round2(comissaoMensal.reduce((a, b) => a + b, 0)),
  };
}
