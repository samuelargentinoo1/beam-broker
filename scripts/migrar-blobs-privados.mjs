// Rebaixa para PRIVADO os documentos do GED que foram salvos com acesso público
// (antes do P1.8). Documentos já salvos públicos continuam expostos por URL até
// rodar isto. Script MANUAL — não roda no build/deploy automático.
//
// Uso (apontando para produção):
//   DATABASE_URL="postgresql://...neon..." BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..." \
//     node scripts/migrar-blobs-privados.mjs
//
// Estratégia: o Vercel Blob não muda o acesso de um blob existente in-place —
// então copiamos cada documento para um novo blob PRIVADO, atualizamos a
// referência no banco e apagamos o blob público antigo. Em lotes, com log.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN ausente — nada a fazer (docs locais não usam Blob).");
    process.exit(0);
  }
  const { copy, del } = await import("@vercel/blob");

  const docs = await prisma.documento.findMany({
    where: { arquivo: { startsWith: "http" } },
    select: { id: true, arquivo: true, nome: true },
  });
  console.log(`→ ${docs.length} documento(s) com blob a verificar.`);

  let migrados = 0;
  let jaPrivados = 0;
  let erros = 0;

  for (const doc of docs) {
    const url = doc.arquivo;
    if (!url) continue;
    try {
      // pathname destino: mantém o mesmo caminho lógico (documentos/<nome>)
      const pathname = new URL(url).pathname.replace(/^\//, "");
      // copia para um blob PRIVADO (novo url). Se já for privado, o get abaixo
      // funcionaria — mas copiar é idempotente o suficiente e barato.
      const novo = await copy(url, pathname, { access: "private", addRandomSuffix: true });
      if (novo.url === url) {
        jaPrivados++;
        continue;
      }
      await prisma.documento.update({ where: { id: doc.id }, data: { arquivo: novo.url } });
      await del(url).catch(() => {}); // remove o público antigo
      migrados++;
      if (migrados % 25 === 0) console.log(`  … ${migrados} migrados`);
    } catch (e) {
      erros++;
      console.warn(`  ! doc ${doc.id} (${doc.nome}):`, String(e?.message ?? e).slice(0, 160));
    }
  }

  console.log(`→ concluído: ${migrados} migrado(s), ${jaPrivados} já ok, ${erros} erro(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("falha:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
