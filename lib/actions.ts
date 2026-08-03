"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { aplicarReajuste } from "@/lib/financeiro";
import { proximoNumero } from "@/lib/format";
import { baixarFatura } from "@/lib/baixa";
import { exigirSessao } from "@/lib/sessao";
import {
  carregarContrato,
  carregarDocumento,
  carregarEmpreendimento,
  carregarFatura,
  carregarImovel,
  carregarPessoa,
  carregarRepasse,
} from "@/lib/escopo";
import type { IndiceReajuste, TipoPessoa } from "@prisma/client";

// ─── Pessoas ────────────────────────────────────────────────────────────────

export async function criarPessoa(formData: FormData) {
  const { imobiliaria } = await exigirSessao();
  await prisma.pessoa.create({
    data: {
      imobiliariaId: imobiliaria.id,
      tipo: (formData.get("tipo") as TipoPessoa) ?? "FISICA",
      nome: String(formData.get("nome")),
      cpfCnpj: String(formData.get("cpfCnpj")),
      email: (formData.get("email") as string) || null,
      telefone: (formData.get("telefone") as string) || null,
      banco: (formData.get("banco") as string) || null,
      agencia: (formData.get("agencia") as string) || null,
      conta: (formData.get("conta") as string) || null,
      chavePix: (formData.get("chavePix") as string) || null,
    },
  });
  revalidatePath("/contatos");
  redirect("/contatos");
}

// ─── Imóveis ────────────────────────────────────────────────────────────────

export async function criarImovel(formData: FormData) {
  const { imobiliaria } = await exigirSessao();

  let ok = false;
  let erro = "";
  try {
    const prefixo =
      { Apartamento: "AP", Casa: "CS", "Sala comercial": "SL", Terreno: "TR" }[
        String(formData.get("tipo"))
      ] ?? "IM";
    // sequência por imobiliária (código é único por tenant), a partir do maior existente
    const existentes = await prisma.imovel.findMany({
      where: { imobiliariaId: imobiliaria.id, codigo: { startsWith: `${prefixo}-` } },
      select: { codigo: true },
    });
    const numero = proximoNumero(existentes.map((e) => e.codigo), prefixo);
    // Escopo: o proprietário informado no formulário tem de ser DESTA imobiliária
    // — senão o imóvel ficaria vinculado a uma Pessoa de outro tenant (IDOR).
    const proprietarioId = Number(formData.get("proprietarioId"));
    await carregarPessoa(proprietarioId); // lança ErroDeAcesso se não for do tenant
    // Mesmo cuidado com o empreendimento: id vindo do formulário tem de ser
    // deste tenant, senão a unidade ficaria pendurada no prédio de outro.
    const empreendimentoId = numOrNull(formData.get("empreendimentoId"));
    if (empreendimentoId != null) await carregarEmpreendimento(empreendimentoId);
    const novoImovel = await prisma.imovel.create({
      data: {
        imobiliariaId: imobiliaria.id,
        codigo: `${prefixo}-${String(numero).padStart(4, "0")}`,
        tipo: String(formData.get("tipo")),
        endereco: String(formData.get("endereco")),
        bairro: (formData.get("bairro") as string) || null,
        cidade: String(formData.get("cidade")),
        uf: String(formData.get("uf")).toUpperCase(),
        cep: (formData.get("cep") as string) || null,
        finalidade: (["LOCACAO", "VENDA", "AMBOS"].includes(String(formData.get("finalidade")))
          ? String(formData.get("finalidade"))
          : "LOCACAO"),
        valorSugerido: numOrNull(formData.get("valorSugerido")),
        valorVenda: numOrNull(formData.get("valorVenda")),
        areaM2: numOrNull(formData.get("areaM2")),
        // Produto: é por quarto e banheiro que o comprador filtra de verdade.
        quartos: intOrNull(formData.get("quartos")),
        banheiros: intOrNull(formData.get("banheiros")),
        suites: intOrNull(formData.get("suites")),
        vagas: intOrNull(formData.get("vagas")),
        valorCondominio: numOrNull(formData.get("valorCondominio")),
        valorIptuMensal: numOrNull(formData.get("valorIptuMensal")),
        empreendimentoId,
        unidade: (formData.get("unidade") as string) || null,
        proprietarioId,
      },
    });
    // Coordenadas (do CEP quando houver, senão geocodifica): SEMPRE best-effort,
    // num update separado com catch — nunca derruba o cadastro se algo falhar.
    const lat = numOrNull(formData.get("latitude"));
    const lon = numOrNull(formData.get("longitude"));
    if (lat != null && lon != null)
      await prisma.imovel.update({ where: { id: novoImovel.id }, data: { latitude: lat, longitude: lon } }).catch(() => {});
    else await import("@/lib/geo").then((m) => m.geocodificarImovel(novoImovel.id)).catch(() => {});

    // Fotos anexadas no cadastro: guarda (Blob ou banco) e vincula ao imóvel — a
    // mesma base que a IA usa para enviar as fotos no WhatsApp.
    const fotos = formData.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
    if (fotos.length) {
      const { salvarFotoImovel } = await import("@/lib/storage");
      const { headers } = await import("next/headers");
      const h = await headers();
      const base = process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
      let ordem = 0;
      for (const arq of fotos) {
        try {
          await salvarFotoImovel(novoImovel.id, Buffer.from(await arq.arrayBuffer()), arq.type || "image/jpeg", ordem++, base);
        } catch (e) {
          console.error("falha ao salvar foto do imóvel:", e);
        }
      }
    }
    ok = true;
  } catch (e) {
    // Em vez da tela genérica de "server error", mostramos o motivo real no
    // formulário — assim dá pra ver e corrigir na hora (ex.: coluna ausente).
    console.error("criarImovel falhou:", e);
    erro = String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 300);
  }

  if (ok) {
    revalidatePath("/imoveis");
    redirect("/imoveis");
  }
  redirect(`/imoveis/novo?erro=${encodeURIComponent(erro || "erro desconhecido no cadastro")}`);
}

// ─── Contratos ──────────────────────────────────────────────────────────────

export async function criarContrato(formData: FormData) {
  const imovelId = Number(formData.get("imovelId"));
  const inquilinoId = Number(formData.get("inquilinoId"));
  // Escopo de tenant: imóvel e inquilino têm de ser DESTA imobiliária (o helper
  // lança ErroDeAcesso se não forem).
  const { registro: imovel, imobiliaria } = await carregarImovel(imovelId);
  const { registro: inquilino } = await carregarPessoa(inquilinoId);
  const valorAluguel = Number(formData.get("valorAluguel"));
  const diaVencimento = Number(formData.get("diaVencimento"));
  if (!Number.isFinite(valorAluguel) || valorAluguel <= 0) throw new Error("Valor de aluguel inválido.");
  const garantia = (formData.get("garantia") as string) || null;
  const ehSeguroFianca = /seguro[- ]?fian/i.test(garantia ?? "");
  // código do contrato é único POR IMOBILIÁRIA — gera a partir do maior existente
  // DESTE tenant (não do count) para que apagar um contrato não colida no próximo.
  const todosContratos = await prisma.contrato.findMany({
    where: { imobiliariaId: imobiliaria.id },
    select: { codigo: true },
  });
  const numeroCt = proximoNumero(todosContratos.map((c) => c.codigo), "CT");
  const contrato = await prisma.contrato.create({
    data: {
      imobiliariaId: imobiliaria.id,
      codigo: `CT-${String(numeroCt).padStart(4, "0")}`,
      imovelId: imovel.id,
      inquilinoId: inquilino.id,
      inicio: new Date(String(formData.get("inicio"))),
      fim: new Date(String(formData.get("fim"))),
      valorAluguel,
      diaVencimento,
      // regras financeiras: herdam a configuração da imobiliária
      modeloRemuneracao: imobiliaria.modeloRemuneracao,
      taxaAdmPercent: Number(formData.get("taxaAdmPercent")) || imobiliaria.taxaAdmPercent,
      multaPercent: Number(formData.get("multaPercent")) || imobiliaria.multaPercent,
      jurosMesPercent: Number(formData.get("jurosMesPercent")) || imobiliaria.jurosMesPercent,
      seguroFiancaPercent: ehSeguroFianca ? imobiliaria.seguroFiancaPercent : 0,
      indiceReajuste: (formData.get("indiceReajuste") as IndiceReajuste) ?? "IGPM",
      garantia,
    },
  });
  await prisma.imovel.update({ where: { id: imovel.id }, data: { status: "ALUGADO" } });

  // Handoff humano → IA: contexto da negociação vira memória da conversa do
  // inquilino, para a IA de administração tocar dali pra frente.
  const contexto = (formData.get("contextoIA") as string)?.trim();
  if (contexto) {
    await prisma.conversa.upsert({
      where: { pessoaId_perfil: { pessoaId: contrato.inquilinoId, perfil: "LOCATARIO" } },
      create: {
        imobiliariaId: imobiliaria.id,
        agente: "ADMINISTRACAO",
        pessoaId: contrato.inquilinoId,
        perfil: "LOCATARIO",
        memoria: `Contexto registrado pela equipe no fechamento do contrato ${contrato.codigo}: ${contexto}`,
      },
      update: {
        memoria: `Contexto registrado pela equipe no fechamento do contrato ${contrato.codigo}: ${contexto}`,
      },
    });
  }
  revalidatePath("/contratos");
  redirect(`/contratos/${contrato.id}`);
}

export async function encerrarContrato(contratoId: number) {
  const { registro: contrato } = await carregarContrato(contratoId);
  await prisma.contrato.update({
    where: { id: contrato.id },
    data: { status: "ENCERRADO", encerradoEm: new Date() },
  });
  await prisma.imovel.update({
    where: { id: contrato.imovelId },
    data: { status: "DISPONIVEL" },
  });
  revalidatePath("/contratos");
  revalidatePath("/imoveis");
}

export async function aplicarReajusteContrato(formData: FormData) {
  const contratoId = Number(formData.get("contratoId"));
  const percentual = Number(formData.get("percentual"));
  if (!Number.isFinite(percentual)) throw new Error("Percentual de reajuste inválido.");
  const { registro: contrato } = await carregarContrato(contratoId);
  const valorNovo = aplicarReajuste(contrato.valorAluguel, percentual);
  await prisma.$transaction([
    prisma.reajuste.create({
      data: {
        contratoId: contrato.id,
        indice: contrato.indiceReajuste,
        percentual,
        valorAnterior: contrato.valorAluguel,
        valorNovo,
      },
    }),
    prisma.contrato.update({
      where: { id: contrato.id },
      data: { valorAluguel: valorNovo },
    }),
  ]);
  revalidatePath(`/contratos/${contrato.id}`);
}

// ─── Documentos (GED) ───────────────────────────────────────────────────────

export async function enviarDocumento(formData: FormData) {
  const arquivo = formData.get("arquivo") as File | null;
  if (!arquivo || arquivo.size === 0) throw new Error("Arquivo obrigatório");
  if (arquivo.size > 25 * 1024 * 1024) throw new Error("Arquivo acima de 25MB");

  // Valida sessão e os vínculos ANTES de subir o arquivo (evita blob órfão e
  // impede vincular o documento a pessoa/imóvel/contrato de outro tenant).
  const { imobiliaria: imob } = await exigirSessao();
  const pessoaId = numOrNull(formData.get("pessoaId"));
  const imovelId = numOrNull(formData.get("imovelId"));
  const contratoId = numOrNull(formData.get("contratoId"));
  if (pessoaId != null) await carregarPessoa(pessoaId);
  if (imovelId != null) await carregarImovel(imovelId);
  if (contratoId != null) await carregarContrato(contratoId);

  const { salvarArquivo } = await import("@/lib/storage");
  const path = await import("path");
  const mimeType = arquivo.type || "application/octet-stream";
  const referencia = await salvarArquivo(
    path.basename(arquivo.name),
    Buffer.from(await arquivo.arrayBuffer()),
    mimeType
  );

  const validade = formData.get("validade") as string;
  await prisma.documento.create({
    data: {
      imobiliariaId: imob.id,
      nome: String(formData.get("nome") || arquivo.name),
      categoria: String(formData.get("categoria")),
      validade: validade ? new Date(validade) : null,
      arquivo: referencia,
      mimeType,
      tamanho: arquivo.size,
      pessoaId,
      imovelId,
      contratoId,
    },
  });
  revalidatePath("/documentos");
}

export async function excluirDocumento(documentoId: number) {
  const { registro: doc } = await carregarDocumento(documentoId);
  await prisma.documento.delete({ where: { id: doc.id } });
  if (doc.arquivo) {
    const { removerArquivo } = await import("@/lib/storage");
    await removerArquivo(doc.arquivo);
  }
  revalidatePath("/documentos");
}

export async function enviarParaAssinatura(contratoId: number) {
  const { registro: contrato } = await carregarContrato(contratoId);
  const { enviarContratoParaAssinatura } = await import("@/lib/assinatura");
  const base = process.env.APP_URL ?? "http://localhost:3000";
  await enviarContratoParaAssinatura(contrato.id, `${base}/contratos/${contrato.id}/documento`);
  revalidatePath(`/contratos/${contrato.id}`);
}

// ─── Faturas ────────────────────────────────────────────────────────────────
// Obs.: gerarFaturasDoMes / atualizarFaturasAtrasadas / enviarReguaCobranca
// vivem em lib/rotinas.ts (fora do "use server") — são rotinas de cron, não
// devem ser expostas como Server Action ao cliente.

// Baixa manual de pagamento (a baixa automática entra pelo webhook do gateway).
export async function registrarPagamento(formData: FormData) {
  const faturaId = Number(formData.get("faturaId"));
  const formaPagamento = String(formData.get("formaPagamento") ?? "PIX");
  const { registro: fatura } = await carregarFatura(faturaId);
  await baixarFatura({ faturaId: fatura.id, formaPagamento });
  revalidatePath("/faturas");
  revalidatePath("/repasses");
  revalidatePath("/");
}

export async function pagarRepasse(repasseId: number) {
  const { imobiliaria } = await exigirSessao();
  // Idempotência + escopo de tenant: só paga se estiver PENDENTE e for desta
  // imobiliária. Duplo-clique/reenvio não dispara a 2ª transferência PIX.
  const trava = await prisma.repasse.updateMany({
    where: {
      id: repasseId,
      status: "PENDENTE",
      fatura: { contrato: { imovel: { imobiliariaId: imobiliaria.id } } },
    },
    data: { status: "PAGO", pagoEm: new Date() },
  });
  if (trava.count === 0) {
    // já pago, inexistente, ou de outro tenant — não repete nada.
    revalidatePath("/repasses");
    return;
  }
  // Carrega já escopado por tenant (helper), sem findUniqueOrThrow por id cru.
  const { registro: repasse } = await carregarRepasse(repasseId, {
    fatura: {
      include: {
        contrato: { include: { imovel: { include: { imobiliaria: true, proprietario: true } } } },
      },
    },
  });
  const imob = repasse.fatura.contrato.imovel.imobiliaria;
  const prop = repasse.fatura.contrato.imovel.proprietario;
  await prisma.lancamento.create({
    data: {
      imobiliariaId: imob.id,
      tipo: "DESPESA",
      categoria: "Repasse a proprietário",
      descricao: `Repasse ${repasse.fatura.contrato.codigo} — ${repasse.fatura.competencia}`,
      valor: repasse.valorRepasse,
    },
  });
  const { auditar } = await import("@/lib/auditoria");
  await auditar("REPASSE_PAGO", "Repasse", repasseId, `${repasse.fatura.contrato.codigo}: R$ ${repasse.valorRepasse.toFixed(2)}`);

  // Repasse via PIX: com Asaas configurado e chave PIX do proprietário, dispara
  // a transferência PIX real; senão, fica em modo manual (o operador faz o PIX).
  const { transferirRepassePix } = await import("@/lib/gateway");
  const transf = await transferirRepassePix({
    valor: repasse.valorRepasse.toNumber(),
    chavePix: prop.chavePix,
    descricao: `Repasse ${repasse.fatura.contrato.codigo} — ${repasse.fatura.competencia}`,
    apiKey: imob.asaasApiKey,
  }).catch((e) => ({ ok: false as const, modo: "asaas" as const, detalhe: (e as Error).message }));
  await auditar(
    transf.ok ? "REPASSE_TRANSFERIDO_PIX" : "REPASSE_TRANSFERENCIA_MANUAL",
    "Repasse",
    repasseId,
    transf.detalhe
  );

  // Proativo: avisa o proprietário que a transferência saiu
  const { avisarRepasseTransferido } = await import("@/lib/proativo");
  await avisarRepasseTransferido(repasseId).catch((e) => console.error("Erro no aviso proativo:", e));

  revalidatePath("/repasses");
  revalidatePath("/");
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  const n = numOrNull(v);
  return n == null ? null : Math.max(0, Math.trunc(n));
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const n = Number(v);
  return v && !Number.isNaN(n) ? n : null;
}
