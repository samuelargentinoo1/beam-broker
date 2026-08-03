// Captura de mídia recebida no WhatsApp (#2): quando o cliente manda uma FOTO
// ou DOCUMENTO (RG, comprovante de renda, etc.), guardamos no GED, vinculado à
// pessoa da carteira quando o número é reconhecido. Assim os documentos ficam
// no sistema quando o lead avança / a qualificação precisa deles.
//
// Best-effort: se der pra baixar o arquivo, sobe pro storage (Blob); senão,
// guarda a própria URL. Falha aqui nunca quebra o atendimento.

import { prisma } from "@/lib/db";
import { pessoaPorTelefone } from "@/lib/whatsapp";

function extensaoDe(url: string): string {
  const m = url.split("?")[0].match(/\.(\w{2,5})$/);
  return m ? m[1].toLowerCase() : "";
}

function mimeDe(url: string, tipoMsg: string): string {
  const ext = extensaoDe(url);
  if (ext === "pdf") return "application/pdf";
  if (["jpg", "jpeg"].includes(ext)) return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (/doc/.test(tipoMsg)) return "application/octet-stream";
  return "image/jpeg";
}

// Salva a mídia recebida como Documento no GED, vinculada à pessoa (se o número
// for da carteira). Retorna um rótulo curto pra registrar na conversa.
export async function salvarMidiaRecebida(params: {
  imobiliariaId: number;
  telefone: string;
  mediaUrl?: string | null;
  tipoMsg: string;
  legenda?: string | null;
}): Promise<string> {
  const ehDoc = /doc|file|pdf/.test(params.tipoMsg);
  const rotulo = ehDoc ? "documento" : "foto";
  try {
    const pessoa = await pessoaPorTelefone(params.telefone, params.imobiliariaId);
    const url = params.mediaUrl ?? "";
    let arquivo = url;
    let mimeType = url ? mimeDe(url, params.tipoMsg) : "application/octet-stream";
    let tamanho: number | null = null;

    // tenta baixar e subir pro storage (fica permanente); se falhar, guarda a URL
    if (url && /^https?:\/\//.test(url)) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          tamanho = buf.length;
          mimeType = res.headers.get("content-type") || mimeType;
          const { salvarArquivo } = await import("@/lib/storage");
          const ext = extensaoDe(url) || (ehDoc ? "pdf" : "jpg");
          arquivo = await salvarArquivo(`whatsapp_${Date.now()}.${ext}`, buf, mimeType);
        }
      } catch {
        // mantém a URL original
      }
    }
    if (!arquivo) return rotulo;

    await prisma.documento.create({
      data: {
        imobiliariaId: params.imobiliariaId,
        nome: params.legenda?.trim() || `${ehDoc ? "Documento" : "Foto"} via WhatsApp`,
        categoria: ehDoc ? "DOCUMENTO_WHATSAPP" : "FOTO_WHATSAPP",
        arquivo,
        mimeType,
        tamanho,
        pessoaId: pessoa?.id ?? null,
      },
    });
    return rotulo;
  } catch (e) {
    console.error("salvarMidiaRecebida:", e);
    return rotulo;
  }
}
