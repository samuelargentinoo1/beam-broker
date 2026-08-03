// Storage de arquivos do GED.
// Na Vercel o filesystem é efêmero — com BLOB_READ_WRITE_TOKEN configurado
// (Vercel Blob), os arquivos vão para o Blob e o campo `arquivo` guarda a URL.
// Sem o token (dev local), salva em uploads/ e guarda o nome do arquivo.

function blobConfigurado(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

// Em PRODUÇÃO, mídia (fotos, documentos, áudio) NÃO pode ir para o Postgres nem
// para o filesystem efêmero — exige Vercel Blob. Chamado antes de qualquer upload.
export function exigirBlobEmProducao(): void {
  if (!blobConfigurado() && process.env.NODE_ENV === "production") {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN ausente — mídia (fotos/documentos/áudio) exige Vercel Blob em produção."
    );
  }
}

// Salva um áudio (nota de voz do cliente ou fala da IA). Com Blob configurado,
// vai PRIVADO para o Blob e o painel serve via /api/mensagem-audio (autenticado).
// Sem Blob (dev), devolve os bytes para guardar no banco.
export async function salvarAudio(
  conteudo: Buffer,
  mimeType: string,
  seed: string
): Promise<{ url: string | null; dados: Buffer | null; mime: string }> {
  exigirBlobEmProducao();
  if (blobConfigurado()) {
    const ext = /mpeg|mp3/.test(mimeType) ? "mp3" : "ogg";
    const { put } = await import("@vercel/blob");
    const blob = await put(`audios/${seed}.${ext}`, conteudo, {
      access: "private",
      contentType: mimeType,
      addRandomSuffix: true,
    });
    return { url: blob.url, dados: null, mime: mimeType };
  }
  return { url: null, dados: conteudo, mime: mimeType };
}

export async function salvarArquivo(
  nomeOriginal: string,
  conteudo: Buffer,
  mimeType: string,
  opts?: { publico?: boolean }
): Promise<string> {
  // Documentos do GED (RG, comprovante de renda, contratos de terceiros) são
  // dado pessoal sensível (LGPD): vão PRIVADOS por padrão e só são servidos pela
  // rota autenticada /api/documentos/[id]. Fotos de imóvel passam `publico: true`
  // (a uazapi baixa a URL para enviar no WhatsApp).
  exigirBlobEmProducao();
  const publico = opts?.publico ?? false;
  const nomeSeguro = `${Date.now()}-${nomeOriginal.replace(/[^\w.\-]/g, "_")}`;

  if (blobConfigurado()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`documentos/${nomeSeguro}`, conteudo, {
      access: publico ? "public" : "private",
      contentType: mimeType,
    });
    return blob.url; // URL completa
  }

  const { writeFile, mkdir } = await import("fs/promises");
  const path = await import("path");
  const dir = path.join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, nomeSeguro), conteudo);
  return nomeSeguro; // basename local
}

// Salva uma FOTO de imóvel e devolve a URL pública. Com Vercel Blob configurado,
// usa o Blob (público); SEM Blob, guarda os bytes no banco e serve por
// /api/foto/<token> (URL pública do próprio sistema, com token não-enumerável) —
// assim funciona sem depender de variável externa. `base` é a origem pública.
export async function salvarFotoImovel(
  imovelId: number,
  conteudo: Buffer,
  mimeType: string,
  ordem: number,
  base: string,
  legenda?: string
): Promise<string> {
  const { prisma } = await import("@/lib/db");
  exigirBlobEmProducao();
  if (blobConfigurado()) {
    // Foto PÚBLICA (a uazapi baixa a URL para enviar no WhatsApp).
    const url = await salvarArquivo(`imovel-${imovelId}.jpg`, conteudo, mimeType, { publico: true });
    await prisma.fotoImovel.create({ data: { imovelId, url, ordem, legenda: legenda ?? null } });
    return url;
  }
  // sem Blob: bytes no banco, URL apontando para a rota pública deste sistema.
  // Servida por TOKEN aleatório (não pelo id sequencial) — senão dava para varrer
  // a carteira inteira de todos os tenants incrementando o id em /api/foto/<id>.
  const foto = await prisma.fotoImovel.create({
    data: { imovelId, url: "", dados: new Uint8Array(conteudo), mimeType, ordem, legenda: legenda ?? null },
  });
  const url = `${base.replace(/\/$/, "")}/api/foto/${foto.token}`;
  await prisma.fotoImovel.update({ where: { id: foto.id }, data: { url } });
  return url;
}

export async function removerArquivo(referencia: string): Promise<void> {
  if (referencia.startsWith("http")) {
    const { del } = await import("@vercel/blob");
    await del(referencia).catch(() => {});
    return;
  }
  const { unlink } = await import("fs/promises");
  const path = await import("path");
  await unlink(path.join(process.cwd(), "uploads", path.basename(referencia))).catch(() => {});
}
