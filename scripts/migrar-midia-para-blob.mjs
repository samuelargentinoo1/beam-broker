// Migra a mídia que hoje está no Postgres (FotoImovel.dados e Mensagem.audioDados)
// para o Vercel Blob, grava a URL e zera a coluna BYTEA. Em lotes de 50, com log.
// Script MANUAL — não roda no build/deploy automático.
//
// Uso (apontando para produção):
//   DATABASE_URL="postgresql://...neon..." BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..." \
//     node scripts/migrar-midia-para-blob.mjs
//
// Depois de rodar e CONFERIR, remova as colunas dados/audioDados numa segunda
// migration (passo manual — não é gerado por este script).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const LOTE = 50;

async function migrarFotos(put) {
  let migradas = 0;
  for (;;) {
    const fotos = await prisma.fotoImovel.findMany({
      where: { dados: { not: null } },
      select: { id: true, dados: true, mimeType: true, token: true },
      take: LOTE,
    });
    if (fotos.length === 0) break;
    for (const f of fotos) {
      try {
        const mime = f.mimeType || "image/jpeg";
        const blob = await put(`imoveis/${f.token}.jpg`, Buffer.from(f.dados), {
          access: "public", // foto pública (uazapi baixa a URL para o WhatsApp)
          contentType: mime,
        });
        await prisma.fotoImovel.update({ where: { id: f.id }, data: { url: blob.url, dados: null } });
        migradas++;
      } catch (e) {
        console.warn(`  ! foto ${f.id}:`, String(e?.message ?? e).slice(0, 140));
      }
    }
    console.log(`  … fotos: ${migradas} migradas`);
  }
  return migradas;
}

async function migrarAudios(put) {
  let migrados = 0;
  for (;;) {
    const msgs = await prisma.mensagem.findMany({
      where: { audioDados: { not: null } },
      select: { id: true, audioDados: true, audioMime: true },
      take: LOTE,
    });
    if (msgs.length === 0) break;
    for (const m of msgs) {
      try {
        const mime = m.audioMime || "audio/mpeg";
        const ext = /mpeg|mp3/.test(mime) ? "mp3" : "ogg";
        const blob = await put(`audios/msg-${m.id}.${ext}`, Buffer.from(m.audioDados), {
          access: "private", // áudio privado (servido pela rota autenticada)
          contentType: mime,
          addRandomSuffix: true,
        });
        await prisma.mensagem.update({
          where: { id: m.id },
          data: { audioUrl: blob.url, audioDados: null },
        });
        migrados++;
      } catch (e) {
        console.warn(`  ! áudio msg ${m.id}:`, String(e?.message ?? e).slice(0, 140));
      }
    }
    console.log(`  … áudios: ${migrados} migrados`);
  }
  return migrados;
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN ausente — nada a migrar (dev usa bytes no banco).");
    process.exit(0);
  }
  const { put } = await import("@vercel/blob");
  console.log("→ migrando fotos…");
  const f = await migrarFotos(put);
  console.log("→ migrando áudios…");
  const a = await migrarAudios(put);
  console.log(`→ concluído: ${f} foto(s), ${a} áudio(s). Confira e então remova as colunas BYTEA numa 2ª migration.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("falha:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
