"use server";

// Server actions do CRM de Negócios.
//
// Toda ação começa por exigirSessao() e AMARRA a operação à imobiliária da
// sessão. O id que chega do formulário é do cliente — nunca é ele que decide de
// quem é o negócio. Sem essa checagem, trocar o número no HTML mexeria no
// negócio de outra imobiliária.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import {
  anotar,
  concluirAtividade,
  criarAtividade,
  criarNegocio,
  definirResultado,
  moverFase,
  MOTIVOS_PERDA,
  reabrirAtividade,
  salvarCampos,
  TIPOS_ATIVIDADE,
  type TipoAtividade,
} from "@/lib/negocios";

// Confere que o negócio é DESTA imobiliária e devolve a sessão junto.
async function negocioDaSessao(negocioId: number) {
  const { imobiliaria, usuario } = await exigirSessao();
  const negocio = await prisma.negocio.findFirst({
    where: { id: negocioId, imobiliariaId: imobiliaria.id },
    select: { id: true, funilId: true },
  });
  if (!negocio) redirect("/negocios");
  return { imobiliaria, usuario, negocio };
}

function atualizar(negocioId?: number) {
  revalidatePath("/negocios");
  if (negocioId) revalidatePath(`/negocios/${negocioId}`);
}

export async function acaoCriarNegocio(formData: FormData) {
  const { imobiliaria, usuario } = await exigirSessao();
  const titulo = String(formData.get("titulo") ?? "").trim();
  const faseId = Number(formData.get("faseId"));
  const funilId = Number(formData.get("funilId"));
  if (!titulo || !faseId || !funilId) return;

  // A fase precisa ser de um funil desta imobiliária.
  const fase = await prisma.faseFunil.findFirst({
    where: { id: faseId, funilId, funil: { imobiliariaId: imobiliaria.id } },
    select: { id: true },
  });
  if (!fase) return;

  const bruto = String(formData.get("valor") ?? "").trim();
  const valor = bruto === "" ? null : Number(bruto.replace(/\./g, "").replace(",", "."));

  await criarNegocio({
    imobiliariaId: imobiliaria.id,
    funilId,
    faseId,
    titulo,
    valor: valor != null && Number.isFinite(valor) ? valor : null,
    contatoNome: String(formData.get("contatoNome") ?? "").trim() || null,
    contatoTelefone: String(formData.get("contatoTelefone") ?? "").trim() || null,
    responsavelId: usuario.id,
    autorId: usuario.id,
  });
  atualizar();
}

export async function acaoMoverFase(negocioId: number, faseId: number) {
  const { usuario, negocio } = await negocioDaSessao(negocioId);
  await moverFase(negocio.id, faseId, usuario.id);
  atualizar(negocioId);
}

export async function acaoDefinirResultado(
  negocioId: number,
  resultado: string,
  motivoPerda: string | null = null
) {
  if (resultado !== "GANHO" && resultado !== "PERDIDO" && resultado !== "ABERTO") return;
  // Motivo só é aceito se estiver na lista fixa — texto livre vindo do cliente
  // arruinaria o agrupamento do gráfico de perdas.
  const motivo =
    resultado === "PERDIDO" && (MOTIVOS_PERDA as readonly string[]).includes(motivoPerda ?? "")
      ? motivoPerda
      : null;
  if (resultado === "PERDIDO" && !motivo) return;
  const { usuario, negocio } = await negocioDaSessao(negocioId);
  await definirResultado(negocio.id, resultado, usuario.id, motivo);
  atualizar(negocioId);
}

export async function acaoSalvarNegocio(formData: FormData) {
  const negocioId = Number(formData.get("negocioId"));
  const { negocio } = await negocioDaSessao(negocioId);

  const bruto = String(formData.get("valor") ?? "").trim();
  const valor = bruto === "" ? null : Number(bruto.replace(/\./g, "").replace(",", "."));
  const dataPrevista = String(formData.get("dataPrevista") ?? "").trim();
  const responsavel = String(formData.get("responsavelId") ?? "").trim();

  await prisma.negocio.update({
    where: { id: negocio.id },
    data: {
      titulo: String(formData.get("titulo") ?? "").trim() || undefined,
      valor: valor != null && Number.isFinite(valor) ? valor : null,
      dataPrevista: dataPrevista ? new Date(`${dataPrevista}T12:00:00`) : null,
      responsavelId: responsavel ? Number(responsavel) : null,
    },
  });
  atualizar(negocioId);
}

export async function acaoAnotar(formData: FormData) {
  const negocioId = Number(formData.get("negocioId"));
  const { usuario, negocio } = await negocioDaSessao(negocioId);
  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) return;
  const aba = String(formData.get("aba") ?? "nota");
  await anotar(negocio.id, texto, usuario.id, aba === "email" ? "EMAIL" : "NOTA");
  atualizar(negocioId);
}

export async function acaoCriarAtividade(formData: FormData) {
  const negocioId = Number(formData.get("negocioId"));
  const { imobiliaria, usuario, negocio } = await negocioDaSessao(negocioId);

  const titulo = String(formData.get("titulo") ?? "").trim();
  const data = String(formData.get("data") ?? "").trim();
  const hora = String(formData.get("hora") ?? "").trim() || "09:00";
  if (!titulo || !data) return;

  const bruto = String(formData.get("tipo") ?? "TAREFA");
  const tipo = (TIPOS_ATIVIDADE as readonly string[]).includes(bruto)
    ? (bruto as TipoAtividade)
    : "TAREFA";

  // Responsável precisa ser usuário DESTA imobiliária; qualquer outro id vira
  // "sem responsável" em vez de apontar para gente de fora.
  const pedido = Number(formData.get("responsavelId"));
  const responsavel = pedido
    ? await prisma.usuario.findFirst({
        where: { id: pedido, imobiliariaId: imobiliaria.id },
        select: { id: true },
      })
    : null;

  await criarAtividade({
    negocioId: negocio.id,
    titulo,
    quando: new Date(`${data}T${hora}:00`),
    tipo,
    responsavelId: responsavel?.id ?? usuario.id,
  });
  atualizar(negocioId);
}

export async function acaoConcluirAtividade(atividadeId: number) {
  const { imobiliaria, usuario } = await exigirSessao();
  const a = await prisma.atividadeCrm.findFirst({
    where: { id: atividadeId, negocio: { imobiliariaId: imobiliaria.id } },
    select: { id: true, negocioId: true },
  });
  if (!a) return;
  await concluirAtividade(a.id, usuario.id);
  atualizar(a.negocioId);
}

export async function acaoReabrirAtividade(atividadeId: number) {
  const { imobiliaria } = await exigirSessao();
  const a = await prisma.atividadeCrm.findFirst({
    where: { id: atividadeId, negocio: { imobiliariaId: imobiliaria.id } },
    select: { id: true, negocioId: true },
  });
  if (!a) return;
  await reabrirAtividade(a.id);
  atualizar(a.negocioId);
}

export async function acaoSalvarCampos(formData: FormData) {
  const negocioId = Number(formData.get("negocioId"));
  const { imobiliaria, negocio } = await negocioDaSessao(negocioId);

  const campos = await prisma.campoPersonalizado.findMany({
    where: { imobiliariaId: imobiliaria.id },
    select: { id: true },
  });
  const valores: Record<number, string> = {};
  for (const c of campos) {
    const v = formData.get(`campo_${c.id}`);
    if (v != null) valores[c.id] = String(v);
  }
  await salvarCampos(negocio.id, valores);
  atualizar(negocioId);
}

// Criação de campo personalizado direto da tela do negócio (o lápis do
// "Quiz Raio-X") — sem isso o bloco nasce vazio e sem caminho para preencher.
export async function acaoCriarCampo(formData: FormData) {
  const { imobiliaria } = await exigirSessao();
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return;
  const negocioId = Number(formData.get("negocioId"));

  const quantos = await prisma.campoPersonalizado.count({
    where: { imobiliariaId: imobiliaria.id },
  });
  await prisma.campoPersonalizado.upsert({
    where: { imobiliariaId_nome: { imobiliariaId: imobiliaria.id, nome } },
    update: {},
    create: { imobiliariaId: imobiliaria.id, nome, ordem: quantos },
  });
  atualizar(negocioId);
}

export async function acaoExcluirCampo(campoId: number, negocioId: number) {
  const { imobiliaria } = await exigirSessao();
  await prisma.campoPersonalizado.deleteMany({
    where: { id: campoId, imobiliariaId: imobiliaria.id },
  });
  atualizar(negocioId);
}
