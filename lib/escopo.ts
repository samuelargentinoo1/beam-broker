// ─── Escopo de tenant: a única porta de entrada para carregar um registro ────
//
// REGRA: nenhuma server action deve fazer prisma.<entidade>.update / delete /
// findUnique por id SEM passar por aqui. Server Action no Next.js é um endpoint
// HTTP POST público — quem tem o id, chama. Carregar por id cru permite que um
// usuário da imobiliária A leia/modifique registros da imobiliária B (IDOR).
// Cada função abaixo carrega o registro FILTRANDO pela imobiliária da sessão; se
// não pertencer ao tenant, lança ErroDeAcesso (mensagem genérica, sem revelar
// que o registro existe — senão vira oráculo de enumeração).
//
// Caminhos de tenant (conforme o schema atual):
//   - direto (imobiliariaId): Pessoa, Imovel, Empreendimento, Lead, Conversa,
//     Documento, Lancamento, PropostaCompra
//   - via imovel:   Ocorrencia, Proposta, MovimentoChave
//   - via contrato: Acordo, Aditivo, Seguro   (contrato -> imovel -> imobiliaria)
//   - Contrato:     via imovel.imobiliariaId
//   - Fatura:       via contrato.imovel.imobiliariaId
//   - Repasse:      via fatura.contrato.imovel.imobiliariaId

import { Prisma } from "@prisma/client";
import type { Imobiliaria } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";

export class ErroDeAcesso extends Error {
  // `entidade` fica só para log interno — a mensagem exposta é sempre genérica.
  constructor(public readonly entidade: string) {
    super("Registro não encontrado");
    this.name = "ErroDeAcesso";
  }
}

type Resultado<T> = { registro: T; imobiliaria: Imobiliaria };

// ─── direto (imobiliariaId) ──────────────────────────────────────────────────

export async function carregarPessoa<I extends Prisma.PessoaInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.PessoaGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.pessoa.findFirst({
    where: { id, imobiliariaId: imobiliaria.id },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Pessoa");
  return { registro: registro as Prisma.PessoaGetPayload<{ include: I }>, imobiliaria };
}

export async function carregarImovel<I extends Prisma.ImovelInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.ImovelGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.imovel.findFirst({
    where: { id, imobiliariaId: imobiliaria.id },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Imovel");
  return { registro: registro as Prisma.ImovelGetPayload<{ include: I }>, imobiliaria };
}

export async function carregarEmpreendimento<
  I extends Prisma.EmpreendimentoInclude | undefined = undefined,
>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.EmpreendimentoGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.empreendimento.findFirst({
    where: { id, imobiliariaId: imobiliaria.id },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Empreendimento");
  return { registro: registro as Prisma.EmpreendimentoGetPayload<{ include: I }>, imobiliaria };
}

export async function carregarLead<I extends Prisma.LeadInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.LeadGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.lead.findFirst({
    where: { id, imobiliariaId: imobiliaria.id },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Lead");
  return { registro: registro as Prisma.LeadGetPayload<{ include: I }>, imobiliaria };
}

export async function carregarConversa<I extends Prisma.ConversaInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.ConversaGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.conversa.findFirst({
    where: { id, imobiliariaId: imobiliaria.id },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Conversa");
  return { registro: registro as Prisma.ConversaGetPayload<{ include: I }>, imobiliaria };
}

export async function carregarDocumento<I extends Prisma.DocumentoInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.DocumentoGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.documento.findFirst({
    where: { id, imobiliariaId: imobiliaria.id },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Documento");
  return { registro: registro as Prisma.DocumentoGetPayload<{ include: I }>, imobiliaria };
}

export async function carregarPropostaCompra<
  I extends Prisma.PropostaCompraInclude | undefined = undefined,
>(id: number, include?: I): Promise<Resultado<Prisma.PropostaCompraGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.propostaCompra.findFirst({
    where: { id, imobiliariaId: imobiliaria.id },
    include,
  });
  if (!registro) throw new ErroDeAcesso("PropostaCompra");
  return {
    registro: registro as Prisma.PropostaCompraGetPayload<{ include: I }>,
    imobiliaria,
  };
}

// ─── via imovel ──────────────────────────────────────────────────────────────

export async function carregarOcorrencia<
  I extends Prisma.OcorrenciaInclude | undefined = undefined,
>(id: number, include?: I): Promise<Resultado<Prisma.OcorrenciaGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.ocorrencia.findFirst({
    where: { id, imovel: { imobiliariaId: imobiliaria.id } },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Ocorrencia");
  return { registro: registro as Prisma.OcorrenciaGetPayload<{ include: I }>, imobiliaria };
}

export async function carregarProposta<I extends Prisma.PropostaInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.PropostaGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.proposta.findFirst({
    where: { id, imovel: { imobiliariaId: imobiliaria.id } },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Proposta");
  return { registro: registro as Prisma.PropostaGetPayload<{ include: I }>, imobiliaria };
}

export async function carregarMovimentoChave<
  I extends Prisma.MovimentoChaveInclude | undefined = undefined,
>(id: number, include?: I): Promise<Resultado<Prisma.MovimentoChaveGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.movimentoChave.findFirst({
    where: { id, imovel: { imobiliariaId: imobiliaria.id } },
    include,
  });
  if (!registro) throw new ErroDeAcesso("MovimentoChave");
  return {
    registro: registro as Prisma.MovimentoChaveGetPayload<{ include: I }>,
    imobiliaria,
  };
}

// ─── Contrato: imobiliariaId direto (desde o P2.1) ───────────────────────────

export async function carregarContrato<I extends Prisma.ContratoInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.ContratoGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.contrato.findFirst({
    where: { id, imobiliariaId: imobiliaria.id },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Contrato");
  return { registro: registro as Prisma.ContratoGetPayload<{ include: I }>, imobiliaria };
}

// ─── via contrato (contrato -> imovel -> imobiliaria) ────────────────────────

export async function carregarAcordo<I extends Prisma.AcordoInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.AcordoGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.acordo.findFirst({
    where: { id, contrato: { imovel: { imobiliariaId: imobiliaria.id } } },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Acordo");
  return { registro: registro as Prisma.AcordoGetPayload<{ include: I }>, imobiliaria };
}

export async function carregarAditivo<I extends Prisma.AditivoInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.AditivoGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.aditivo.findFirst({
    where: { id, contrato: { imovel: { imobiliariaId: imobiliaria.id } } },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Aditivo");
  return { registro: registro as Prisma.AditivoGetPayload<{ include: I }>, imobiliaria };
}

export async function carregarSeguro<I extends Prisma.SeguroInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.SeguroGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.seguro.findFirst({
    where: { id, contrato: { imovel: { imobiliariaId: imobiliaria.id } } },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Seguro");
  return { registro: registro as Prisma.SeguroGetPayload<{ include: I }>, imobiliaria };
}

// ─── Fatura: imobiliariaId direto (desde o P2.1) ─────────────────────────────

export async function carregarFatura<I extends Prisma.FaturaInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.FaturaGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.fatura.findFirst({
    where: { id, imobiliariaId: imobiliaria.id },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Fatura");
  return { registro: registro as Prisma.FaturaGetPayload<{ include: I }>, imobiliaria };
}

// ─── Repasse: via fatura.imobiliariaId (desde o P2.1) ────────────────────────

export async function carregarRepasse<I extends Prisma.RepasseInclude | undefined = undefined>(
  id: number,
  include?: I,
): Promise<Resultado<Prisma.RepasseGetPayload<{ include: I }>>> {
  const { imobiliaria } = await exigirSessao();
  const registro = await prisma.repasse.findFirst({
    where: { id, fatura: { imobiliariaId: imobiliaria.id } },
    include,
  });
  if (!registro) throw new ErroDeAcesso("Repasse");
  return { registro: registro as Prisma.RepasseGetPayload<{ include: I }>, imobiliaria };
}
