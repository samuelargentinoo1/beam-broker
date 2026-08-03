// Prepara o ambiente de DESENVOLVIMENTO antes de dev/start:
// 1. cria o .env a partir do .env.example se não existir (apenas local)
// 2. gera o Prisma Client (obrigatório para compilar/rodar)
// 3. aplica as migrations versionadas no banco local (prisma migrate deploy)
// 4. roda o seed de demonstração se o banco estiver vazio
//
// Em PRODUÇÃO o schema é aplicado pelo `build` (prisma migrate deploy && next
// build) usando a DIRECT_URL — este script não toca no banco de produção e NUNCA
// roda `prisma db push` (que causaria drift com as migrations).
import { existsSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";

if (!process.env.DATABASE_URL && !existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log("→ .env criado a partir do .env.example — configure o DATABASE_URL do Neon nele.");
}

// Carrega o .env no processo (sem sobrescrever variáveis já definidas no ambiente).
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

// migrate deploy precisa da conexão SEM pooler. Neon via integração da Vercel
// expõe a URL direta em outras variáveis; usa DIRECT_URL como padrão.
const directUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;
const env = { ...process.env, ...(directUrl ? { DIRECT_URL: directUrl } : {}) };

const run = (cmd) => execSync(cmd, { stdio: "inherit", env });
const tenta = (cmd) => {
  try {
    run(cmd);
    return true;
  } catch {
    return false;
  }
};

// Em produção (Vercel/NODE_ENV) NÃO tocamos no banco por aqui: o build já rodou
// `prisma migrate deploy`. Este script cuida só do fluxo de desenvolvimento.
const naVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";
const emProducao = naVercel || process.env.NODE_ENV === "production";
const permiteSeed = !emProducao && process.env.SEED_DEMO !== "0";

// 1) O Prisma Client é obrigatório para o `next build`/`next dev` — gera sempre
//    (generate é offline).
run("npx prisma generate");

if (!emProducao) {
  // 2) Aplica as migrations versionadas no banco local. Best-effort: se o banco
  //    estiver indisponível, não derruba o dev.
  if (!tenta("npx prisma migrate deploy")) {
    console.warn(
      "→ prisma migrate deploy não aplicou agora (banco indisponível?). " +
        "Rode `npm run db:migrate` para criar/aplicar migrations em desenvolvimento."
    );
  }

  // 3) Seed de demonstração só em desenvolvimento e com banco vazio/acessível.
  if (permiteSeed) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      try {
        const pessoas = await prisma.pessoa.count();
        if (pessoas === 0) {
          console.log("→ banco vazio, rodando seed de demonstração…");
          tenta("npx prisma db seed");
        }
      } finally {
        await prisma.$disconnect();
      }
    } catch {
      // banco indisponível no momento — ignora
    }
  }
}
console.log("→ preparo concluído.");
