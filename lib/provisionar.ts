"use server";

// Provisionamento de clientes pelo dono do SaaS.
//
// Toda função aqui é CROSS-TENANT por natureza — cria e modifica contas de
// outras imobiliárias. Por isso, exigirOperador() é a PRIMEIRA linha de cada
// uma, sem exceção. Se alguém acrescentar uma função aqui sem essa linha, vira
// o buraco de segurança mais grave do produto inteiro.
//
// As ações vão para AcaoOperador (trilha do dono), NÃO para o LogAuditoria da
// imobiliária: o que o dono faz não pode aparecer para o cliente como se fosse
// a equipe dele.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { hashSenha } from "@/lib/senha";
import { PRODUTOS, addonPermitido, type Addon, type Produto } from "@/lib/planos";
import { exigirOperador, registrarAcao } from "@/lib/operador";

// Senha temporária legível ao telefone. Sem caracteres ambíguos (0/O, 1/l/I),
// porque na prática você vai ditar isso pro cliente numa ligação.
function senhaTemporaria(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const num = "23456789";
  const b = randomBytes(12);
  let s = "";
  for (let i = 0; i < 4; i++) s += abc[b[i] % abc.length];
  s += "-";
  for (let i = 4; i < 8; i++) s += num[b[i] % num.length];
  return s;
}

export type ResultadoProvisionamento =
  | { ok: true; imobiliariaId: number; email: string; senhaTemporaria: string }
  | { ok: false; erro: string };

export async function provisionarCliente(formData: FormData): Promise<ResultadoProvisionamento> {
  await exigirOperador();

  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nomeUsuario = String(formData.get("nomeUsuario") ?? "").trim();
  const chaveProduto = String(formData.get("produto") ?? "") as Produto["chave"];
  const municipio = String(formData.get("municipio") ?? "").trim() || null;
  const uf = String(formData.get("uf") ?? "").trim().toUpperCase() || null;
  const cnpj = String(formData.get("cnpj") ?? "").trim() || null;
  const telefone = String(formData.get("telefone") ?? "").trim() || null;
  const diasTrial = Number(formData.get("diasTrial") ?? 14);
  const querCaptacao = formData.get("addonCaptacao") != null;

  if (!nome) return { ok: false, erro: "Informe o nome da imobiliária." };
  if (!email.includes("@")) return { ok: false, erro: "E-mail inválido." };
  if (!nomeUsuario) return { ok: false, erro: "Informe o nome do responsável." };

  const produto = PRODUTOS[chaveProduto];
  if (!produto) return { ok: false, erro: "Produto inválido." };

  // Add-on é venda SOBRE um produto com operação de carteira; Captação em cima
  // de Recepção não existe (não há carteira para captar).
  if (querCaptacao && !addonPermitido(produto.modulos, "CAPTACAO")) {
    return {
      ok: false,
      erro: `O add-on Captação não pode ser vendido sobre o plano ${produto.nome} — ele não tem operação de carteira. Escolha Comercial, Administração ou Completo.`,
    };
  }
  const addons: Addon[] = Array.from(
    new Set<Addon>([...produto.addons, ...(querCaptacao ? (["CAPTACAO"] as Addon[]) : [])])
  );

  const jaExiste = await prisma.usuario.findUnique({ where: { email } });
  if (jaExiste) return { ok: false, erro: "Já existe um usuário com esse e-mail." };

  const senha = senhaTemporaria();

  // Transação: ou nasce a conta inteira, ou não nasce nada. Imobiliária sem
  // usuário admin é um registro órfão que você vai limpar à mão depois.
  const imobiliaria = await prisma.$transaction(async (tx) => {
    const plano = await tx.plano.upsert({
      where: { nome: produto.nome },
      update: {},
      create: {
        nome: produto.nome,
        mensalidadeCentavos: produto.mensalidadeCentavos,
        setupCentavos: produto.setupCentavos,
        porContratoAtivoCentavos: produto.porContratoAtivoCentavos,
        porLeadAtendidoCentavos: produto.porLeadAtendidoCentavos,
        cotaIaCentavos: produto.cotaIaCentavos,
        multiplicadorExcedenteMilesimos: produto.multiplicadorExcedenteMilesimos,
        aoEstourarCota: produto.aoEstourarCota,
        limiteUsuarios: produto.limiteUsuarios,
        limiteImoveis: produto.limiteImoveis,
        modulos: produto.modulos,
        addons: produto.addons,
      },
    });

    const imob = await tx.imobiliaria.create({
      data: {
        nome,
        cnpj,
        telefone,
        municipio,
        uf,
        planoId: plano.id,
        modulos: produto.modulos,
        addons,
        assinaturaAtiva: diasTrial <= 0,
        trialAte: diasTrial > 0 ? new Date(Date.now() + diasTrial * 86_400_000) : null,
      },
    });

    await tx.usuario.create({
      data: {
        nome: nomeUsuario,
        email,
        senhaHash: hashSenha(senha),
        imobiliariaId: imob.id,
        precisaTrocarSenha: true,
      },
    });

    return imob;
  });

  await registrarAcao("CLIENTE_PROVISIONADO", imobiliaria.id, `${nome} · ${produto.nome}`);

  revalidatePath("/admin");
  return { ok: true, imobiliariaId: imobiliaria.id, email, senhaTemporaria: senha };
}

// ─── Gestão do plano de um cliente existente ────────────────────────────────

export async function trocarProduto(imobiliariaId: number, chave: Produto["chave"]) {
  await exigirOperador();
  const produto = PRODUTOS[chave];
  if (!produto) throw new Error("Produto inválido");

  const plano = await prisma.plano.upsert({
    where: { nome: produto.nome },
    update: {},
    create: {
      nome: produto.nome,
      mensalidadeCentavos: produto.mensalidadeCentavos,
      setupCentavos: produto.setupCentavos,
      porContratoAtivoCentavos: produto.porContratoAtivoCentavos,
      porLeadAtendidoCentavos: produto.porLeadAtendidoCentavos,
      cotaIaCentavos: produto.cotaIaCentavos,
      multiplicadorExcedenteMilesimos: produto.multiplicadorExcedenteMilesimos,
      aoEstourarCota: produto.aoEstourarCota,
      limiteUsuarios: produto.limiteUsuarios,
      limiteImoveis: produto.limiteImoveis,
      modulos: produto.modulos,
      addons: produto.addons,
    },
  });

  const antes = await prisma.imobiliaria.findUnique({
    where: { id: imobiliariaId },
    include: { plano: true },
  });

  // Add-ons contratados sobrevivem à troca de plano — MENOS os que deixam de
  // fazer sentido no produto novo (Captação sobre Recepção não existe).
  const addonsPreservados = ((antes?.addons ?? []) as Addon[]).filter((a) =>
    addonPermitido(produto.modulos, a)
  );
  const addons = Array.from(new Set<Addon>([...produto.addons, ...addonsPreservados]));

  await prisma.imobiliaria.update({
    where: { id: imobiliariaId },
    data: { planoId: plano.id, modulos: produto.modulos, addons },
  });

  await registrarAcao(
    "PLANO_ALTERADO",
    imobiliariaId,
    `${antes?.plano?.nome ?? "sem plano"} → ${produto.nome}`
  );

  revalidatePath("/admin");
  revalidatePath(`/admin/clientes/${imobiliariaId}`);
}

// Liga/desliga um add-on de um cliente já existente (toggle na tela de detalhe).
export async function definirAddon(
  imobiliariaId: number,
  addon: Addon,
  ativo: boolean
): Promise<{ ok: boolean; erro?: string }> {
  await exigirOperador();
  const imob = await prisma.imobiliaria.findUniqueOrThrow({ where: { id: imobiliariaId } });

  if (ativo && !addonPermitido(imob.modulos, addon)) {
    return {
      ok: false,
      erro: `O add-on ${addon} exige um plano com operação de carteira (Comercial, Administração ou Completo).`,
    };
  }

  const atuais = new Set(imob.addons as Addon[]);
  if (ativo) atuais.add(addon);
  else atuais.delete(addon);

  await prisma.imobiliaria.update({
    where: { id: imobiliariaId },
    data: { addons: Array.from(atuais) },
  });
  await registrarAcao(ativo ? "ADDON_ATIVADO" : "ADDON_REMOVIDO", imobiliariaId, addon);
  revalidatePath(`/admin/clientes/${imobiliariaId}`);
  return { ok: true };
}

export async function definirAssinatura(imobiliariaId: number, ativa: boolean) {
  await exigirOperador();
  await prisma.imobiliaria.update({
    where: { id: imobiliariaId },
    data: { assinaturaAtiva: ativa, ...(ativa ? { bloqueadaEm: null } : {}) },
  });
  await registrarAcao(ativa ? "ASSINATURA_ATIVADA" : "ASSINATURA_SUSPENSA", imobiliariaId);
  revalidatePath(`/admin/clientes/${imobiliariaId}`);
}

export async function bloquearCliente(imobiliariaId: number, motivo: string) {
  await exigirOperador();
  await prisma.imobiliaria.update({
    where: { id: imobiliariaId },
    data: { bloqueadaEm: new Date() },
  });
  await registrarAcao("CLIENTE_BLOQUEADO", imobiliariaId, motivo);
  revalidatePath(`/admin/clientes/${imobiliariaId}`);
}

export async function estenderTrial(imobiliariaId: number, dias: number) {
  await exigirOperador();
  const imob = await prisma.imobiliaria.findUniqueOrThrow({ where: { id: imobiliariaId } });
  const base = imob.trialAte && imob.trialAte > new Date() ? imob.trialAte : new Date();
  await prisma.imobiliaria.update({
    where: { id: imobiliariaId },
    data: { trialAte: new Date(base.getTime() + dias * 86_400_000) },
  });
  await registrarAcao("TRIAL_ESTENDIDO", imobiliariaId, `+${dias}d`);
  revalidatePath(`/admin/clientes/${imobiliariaId}`);
}

// Redefine a senha do usuário admin e devolve a nova senha temporária uma única
// vez. Não guarde, não logue, não mande por e-mail sem TLS.
export async function redefinirSenhaAdmin(usuarioId: number): Promise<string> {
  await exigirOperador();
  const senha = senhaTemporaria();
  const alvo = await prisma.usuario.update({
    where: { id: usuarioId },
    data: {
      senhaHash: hashSenha(senha),
      precisaTrocarSenha: true,
      sessaoVersao: { increment: 1 }, // derruba sessões abertas
    },
  });
  await registrarAcao("SENHA_REDEFINIDA", alvo.imobiliariaId, `usuário ${alvo.email}`);
  return senha;
}

export async function criarUsuarioNoCliente(imobiliariaId: number, formData: FormData) {
  await exigirOperador();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nome = String(formData.get("nome") ?? "").trim();
  if (!email.includes("@") || !nome) throw new Error("Dados inválidos");

  const imob = await prisma.imobiliaria.findUniqueOrThrow({
    where: { id: imobiliariaId },
    include: { plano: true, _count: { select: { usuarios: true } } },
  });

  const limite = imob.plano?.limiteUsuarios ?? 0;
  if (limite > 0 && imob._count.usuarios >= limite) {
    throw new Error(`Plano ${imob.plano?.nome} permite ${limite} usuários.`);
  }

  const senha = senhaTemporaria();
  await prisma.usuario.create({
    data: {
      nome,
      email,
      senhaHash: hashSenha(senha),
      imobiliariaId,
      precisaTrocarSenha: true,
    },
  });
  revalidatePath(`/admin/clientes/${imobiliariaId}`);
  return senha;
}
