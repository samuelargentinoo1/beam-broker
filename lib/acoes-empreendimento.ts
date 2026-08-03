"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { carregarEmpreendimento } from "@/lib/escopo";
import { auditar } from "@/lib/auditoria";
import { normalizarFaixas } from "@/lib/empreendimentos";

function num(v: FormDataEntryValue | null): number | null {
  const n = Number(v);
  return v !== null && String(v).trim() !== "" && !Number.isNaN(n) ? n : null;
}

function inteiro(v: FormDataEntryValue | null): number | null {
  const n = num(v);
  return n == null ? null : Math.max(0, Math.trunc(n));
}

function texto(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

// Data vinda de <input type="date"> chega como "2027-03-01". Fixa ao meio-dia
// UTC para o dia exibido em Brasília ser o mesmo que foi digitado — sem isto,
// meia-noite UTC "volta um dia" na formatação pt-BR.
function data(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [a, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!, 12, 0, 0));
}

// Campos comuns a criar e editar. Ficam juntos para os dois caminhos nunca
// divergirem (um aceitando um campo que o outro ignora em silêncio).
function camposDoFormulario(formData: FormData) {
  return {
    nome: String(formData.get("nome") ?? "").trim(),
    construtora: String(formData.get("construtora") ?? "").trim(),
    endereco: texto(formData.get("endereco")),
    bairro: texto(formData.get("bairro")),
    cidade: String(formData.get("cidade") ?? "").trim(),
    uf: String(formData.get("uf") ?? "").trim().toUpperCase(),
    cep: texto(formData.get("cep")),
    pontoReferencia: texto(formData.get("pontoReferencia")),
    quartos: inteiro(formData.get("quartos")),
    banheiros: inteiro(formData.get("banheiros")),
    suites: inteiro(formData.get("suites")),
    vagas: inteiro(formData.get("vagas")),
    metragemM2: num(formData.get("metragemM2")),
    precoAvaliacao: num(formData.get("precoAvaliacao")),
    faixasMcmv: normalizarFaixas(formData.getAll("faixasMcmv")),
    obraIniciadaEm: data(formData.get("obraIniciadaEm")),
    prazoObraMeses: num(formData.get("prazoObraMeses")),
    toleranciaMeses: num(formData.get("toleranciaMeses")) ?? 6,
    entregaPrevista: data(formData.get("entregaPrevista")),
    observacoes: texto(formData.get("observacoes")),
  };
}

export async function criarEmpreendimento(formData: FormData) {
  const { imobiliaria } = await exigirSessao();
  const dados = camposDoFormulario(formData);

  let novoId: number | null = null;
  let erro = "";
  try {
    if (!dados.nome) throw new Error("informe o nome do empreendimento");
    if (!dados.construtora) throw new Error("informe a construtora");
    if (!dados.cidade || !dados.uf) throw new Error("informe cidade e UF");
    const criado = await prisma.empreendimento.create({
      data: { imobiliariaId: imobiliaria.id, ...dados },
    });
    novoId = criado.id;
    await auditar("EMPREENDIMENTO_CRIADO", "Empreendimento", criado.id, `${criado.nome} — ${criado.construtora}`);
  } catch (e) {
    // Mesmo tratamento do cadastro de imóvel: o motivo real volta para o
    // formulário em vez da tela genérica de erro do servidor.
    console.error("criarEmpreendimento falhou:", e);
    const bruto = String((e as Error)?.message ?? e);
    erro = /Unique constraint/i.test(bruto)
      ? "já existe um empreendimento com esse nome"
      : bruto.replace(/\s+/g, " ").slice(0, 300);
  }

  if (novoId) {
    revalidatePath("/imoveis/empreendimentos");
    redirect(`/imoveis/empreendimentos/${novoId}`);
  }
  redirect(`/imoveis/empreendimentos/novo?erro=${encodeURIComponent(erro || "erro desconhecido")}`);
}

export async function atualizarEmpreendimento(formData: FormData) {
  const id = Number(formData.get("id"));
  // Escopo: carrega FILTRANDO pela imobiliária da sessão (server action é
  // endpoint público — quem tem o id, chama).
  await carregarEmpreendimento(id);
  const dados = camposDoFormulario(formData);

  let erro = "";
  try {
    if (!dados.nome) throw new Error("informe o nome do empreendimento");
    if (!dados.construtora) throw new Error("informe a construtora");
    if (!dados.cidade || !dados.uf) throw new Error("informe cidade e UF");
    await prisma.empreendimento.update({ where: { id }, data: dados });
    await auditar("EMPREENDIMENTO_ATUALIZADO", "Empreendimento", id, dados.nome);
  } catch (e) {
    console.error("atualizarEmpreendimento falhou:", e);
    const bruto = String((e as Error)?.message ?? e);
    erro = /Unique constraint/i.test(bruto)
      ? "já existe um empreendimento com esse nome"
      : bruto.replace(/\s+/g, " ").slice(0, 300);
  }

  revalidatePath(`/imoveis/empreendimentos/${id}`);
  revalidatePath("/imoveis/empreendimentos");
  if (erro) redirect(`/imoveis/empreendimentos/${id}?erro=${encodeURIComponent(erro)}`);
  redirect(`/imoveis/empreendimentos/${id}?ok=1`);
}

// A entrega REAL é a única data que ninguém consegue prever — ela só é
// registrada quando a obra é entregue de fato. Por isso fica numa ação própria,
// e não escondida no meio do formulário de cadastro.
export async function registrarEntregaReal(formData: FormData) {
  const id = Number(formData.get("id"));
  await carregarEmpreendimento(id);
  const quando = data(formData.get("entregaReal"));
  await prisma.empreendimento.update({ where: { id }, data: { entregaReal: quando } });
  await auditar(
    quando ? "EMPREENDIMENTO_ENTREGUE" : "EMPREENDIMENTO_ENTREGA_DESFEITA",
    "Empreendimento",
    id,
    quando ? quando.toISOString().slice(0, 10) : "entrega real removida"
  );
  revalidatePath(`/imoveis/empreendimentos/${id}`);
  revalidatePath("/imoveis/empreendimentos");
  redirect(`/imoveis/empreendimentos/${id}?ok=1`);
}

// Book de venda em PDF. Vai para o Blob PÚBLICO porque quem baixa o arquivo
// para mandar no WhatsApp é a uazapi, não o nosso servidor — URL privada faria
// o envio falhar silenciosamente.
export async function salvarBookEmpreendimento(formData: FormData) {
  const id = Number(formData.get("id"));
  await carregarEmpreendimento(id);

  if (formData.get("acao") === "remover") {
    await prisma.empreendimento.update({ where: { id }, data: { bookUrl: null, bookNome: null } });
    await auditar("BOOK_REMOVIDO", "Empreendimento", id);
    revalidatePath(`/imoveis/empreendimentos/${id}`);
    redirect(`/imoveis/empreendimentos/${id}?ok=1`);
  }

  const arquivo = formData.get("book");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    redirect(`/imoveis/empreendimentos/${id}?erro=${encodeURIComponent("escolha um arquivo PDF")}`);
  }
  const pdf = arquivo as File;
  if (pdf.type !== "application/pdf" && !/\.pdf$/i.test(pdf.name)) {
    redirect(`/imoveis/empreendimentos/${id}?erro=${encodeURIComponent("o book precisa ser um PDF")}`);
  }

  let erro = "";
  try {
    const { salvarArquivo } = await import("@/lib/storage");
    const url = await salvarArquivo(
      pdf.name,
      Buffer.from(await pdf.arrayBuffer()),
      "application/pdf",
      { publico: true }
    );
    await prisma.empreendimento.update({
      where: { id },
      data: { bookUrl: url, bookNome: pdf.name },
    });
    await auditar("BOOK_ANEXADO", "Empreendimento", id, pdf.name);
  } catch (e) {
    console.error("salvarBookEmpreendimento falhou:", e);
    erro = String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 300);
  }

  revalidatePath(`/imoveis/empreendimentos/${id}`);
  redirect(`/imoveis/empreendimentos/${id}?${erro ? `erro=${encodeURIComponent(erro)}` : "ok=1"}`);
}

// Vincula (ou desvincula) uma unidade já cadastrada ao empreendimento. Os dois
// registros passam pelo escopo: sem isso, dava para pendurar um imóvel de outro
// tenant no empreendimento deste.
export async function vincularUnidade(formData: FormData) {
  const empreendimentoId = Number(formData.get("empreendimentoId"));
  const { imobiliaria } = await carregarEmpreendimento(empreendimentoId);
  const imovelId = Number(formData.get("imovelId"));
  const imovel = await prisma.imovel.findFirst({
    where: { id: imovelId, imobiliariaId: imobiliaria.id },
  });
  if (imovel) {
    const vincular = formData.get("acao") !== "desvincular";
    await prisma.imovel.update({
      where: { id: imovel.id },
      data: {
        empreendimentoId: vincular ? empreendimentoId : null,
        unidade: vincular ? texto(formData.get("unidade")) : null,
      },
    });
    revalidatePath(`/imoveis/${imovel.id}`);
  }
  revalidatePath(`/imoveis/empreendimentos/${empreendimentoId}`);
  redirect(`/imoveis/empreendimentos/${empreendimentoId}?ok=1`);
}
