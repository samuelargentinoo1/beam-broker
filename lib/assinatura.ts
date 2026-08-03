// Assinatura digital de contratos.
// Com ZAPSIGN_API_TOKEN, cria o documento na ZapSign (assinatura pelo
// celular, validade jurídica, com opção de selfie/reconhecimento facial).
// Sem token, modo demo: gera um link simulado e o webhook local conclui.

import { prisma } from "@/lib/db";
import { modoDemoAtivo, exigirCredencial } from "@/lib/demo";

const ZAPSIGN_BASE = process.env.ZAPSIGN_BASE_URL ?? "https://api.zapsign.com.br/api/v1";

// Retorna os links de assinatura por signatário (quando provedor real), para
// o chamador avisar cada parte no WhatsApp. No modo demo só há o link do 1º.
export type LinksAssinatura = { inquilinoUrl?: string | null; proprietarioUrl?: string | null };

export async function enviarContratoParaAssinatura(
  contratoId: number,
  urlDocumento: string
): Promise<LinksAssinatura> {
  const contrato = await prisma.contrato.findUniqueOrThrow({
    where: { id: contratoId },
    include: {
      inquilino: true,
      imovel: { include: { proprietario: true, imobiliaria: true } },
    },
  });

  // Token da ZapSign desta imobiliária (Configurações); se vazio, env global.
  const zapToken = contrato.imovel.imobiliaria.zapsignApiToken || process.env.ZAPSIGN_API_TOKEN;

  if (zapToken) {
    const res = await fetch(`${ZAPSIGN_BASE}/docs/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${zapToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `Contrato de locação ${contrato.codigo}`,
        url_pdf: urlDocumento,
        signers: [
          {
            name: contrato.inquilino.nome,
            email: contrato.inquilino.email,
            phone_number: contrato.inquilino.telefone?.replace(/\D/g, ""),
            auth_mode: "assinaturaTela-selfie", // validação com selfie
          },
          {
            name: contrato.imovel.proprietario.nome,
            email: contrato.imovel.proprietario.email,
            phone_number: contrato.imovel.proprietario.telefone?.replace(/\D/g, ""),
            auth_mode: "assinaturaTela",
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`ZapSign: ${res.status} ${await res.text()}`);
    const doc = await res.json();
    const inquilinoUrl = doc.signers?.[0]?.sign_url ?? null;
    const proprietarioUrl = doc.signers?.[1]?.sign_url ?? null;
    await prisma.contrato.update({
      where: { id: contratoId },
      data: {
        assinaturaStatus: "PENDENTE",
        assinaturaId: doc.token,
        assinaturaLink: inquilinoUrl,
        assinaturaLinkProprietario: proprietarioUrl,
      },
    });
    return { inquilinoUrl, proprietarioUrl };
  }

  // Sem token ZapSign: só simula assinatura em modo demo EXPLÍCITO. Em produção
  // sem DEMO=1, lança erro — nunca marca um contrato como "em assinatura" via um
  // link falso que ninguém vai assinar de verdade.
  if (!modoDemoAtivo()) exigirCredencial("ZAPSIGN_API_TOKEN", "enviar contrato para assinatura");
  const token = `demo_sign_${contratoId}_${contrato.codigo.toLowerCase()}`;
  await prisma.contrato.update({
    where: { id: contratoId },
    data: {
      assinaturaStatus: "PENDENTE",
      assinaturaId: token,
      assinaturaLink: `https://assinatura.demo/d/${token}`,
    },
  });
  return { inquilinoUrl: `https://assinatura.demo/d/${token}`, proprietarioUrl: null };
}

export async function concluirAssinatura(assinaturaId: string) {
  const contrato = await prisma.contrato.findUnique({ where: { assinaturaId } });
  if (!contrato) return null;
  return prisma.contrato.update({
    where: { id: contrato.id },
    data: { assinaturaStatus: "ASSINADO", assinadoEm: new Date() },
  });
}
