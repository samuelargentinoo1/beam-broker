// Aplica as migrations versionadas no build de PRODUÇÃO (Vercel).
//
// O schema do Prisma exige `directUrl = env("DIRECT_URL")` — a conexão DIRETA
// (sem pooler), obrigatória para `prisma migrate deploy` (advisory locks não
// funcionam através do PgBouncer/pooler do Neon). Se a DIRECT_URL não estiver
// setada no ambiente, o build inteiro quebra com P1012 antes de subir o site.
//
// Este wrapper torna isso à prova de falha: se DIRECT_URL não existir, ele a
// DERIVA — na ordem: variáveis não-pooled que a integração Neon↔Vercel expõe
// e, por último, a própria DATABASE_URL com o sufixo `-pooler` removido do host
// (a URL direta do Neon é idêntica à do pooler, só sem o `-pooler`).
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

// Em desenvolvimento carrega o .env (sem sobrescrever o ambiente). Na Vercel não
// há .env — as variáveis já vêm do ambiente de build.
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* .env ausente/ilegível: segue com o ambiente do processo */
  }
}

// Deriva a URL direta a partir de uma URL com pooler, tirando o `-pooler` do
// host do Neon (ex.: ep-xxx-pooler.sa-east-1... → ep-xxx.sa-east-1...).
function semPooler(url) {
  if (!url) return undefined;
  return url.includes("-pooler.") ? url.replace("-pooler.", ".") : undefined;
}

const directUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  semPooler(process.env.DATABASE_URL) ??
  process.env.DATABASE_URL;

if (!process.env.DATABASE_URL) {
  console.error(
    "[build] DATABASE_URL ausente — não dá para aplicar as migrations. " +
      "Configure a connection string do Neon no painel."
  );
  process.exit(1);
}

if (!process.env.DIRECT_URL) {
  const origem = semPooler(process.env.DATABASE_URL)
    ? "derivada da DATABASE_URL (sem -pooler)"
    : "= DATABASE_URL (sem pooler detectado)";
  console.log(`[build] DIRECT_URL não setada; usando a ${origem} para as migrations.`);
}

// Log do host (SEM credenciais) que será usado nas migrations, para diagnóstico.
function hostMascarado(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(url inválida)";
  }
}
console.log(`[build] migrate deploy usando host direto: ${hostMascarado(directUrl)}`);

const env = { ...process.env, ...(directUrl ? { DIRECT_URL: directUrl } : {}) };

// Nome da PRIMEIRA migration (baseline com o schema completo). Um banco criado
// por deploy antigo (DDL em runtime / db push) já tem exatamente essas tabelas,
// só não tem o histórico — então esta migration é a que baselinamos.
const BASELINE = "0_init";

// Roda o migrate deploy capturando a saída, para detectar o P3005 (schema já
// existe, sem histórico) e fazer o baseline automático UMA vez. Após o baseline,
// a tabela _prisma_migrations passa a existir e este caminho nunca mais roda.
function migrateDeploy() {
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
}

try {
  const out = execSync("npx prisma migrate deploy", { env, stdio: ["inherit", "pipe", "pipe"] });
  process.stdout.write(out);
} catch (e) {
  const saida = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  process.stdout.write(saida);

  if (saida.includes("P3005")) {
    // Banco já tem o schema (deploy antigo) mas sem histórico de migrations.
    // Baseline: marca SÓ a 0_init como aplicada e deixa o deploy aplicar o resto
    // (as mudanças novas desta versão: tenant, decimal, filas, tokens etc.).
    console.log(
      `\n[build] P3005 — banco com schema pré-existente sem histórico. ` +
        `Fazendo baseline de "${BASELINE}" e aplicando as migrations seguintes...`
    );
    execSync(`npx prisma migrate resolve --applied ${BASELINE}`, { stdio: "inherit", env });
    migrateDeploy();
  } else {
    console.error(
      "\n[build] prisma migrate deploy FALHOU. Causas comuns:\n" +
        "  • P1001 — não conectou no host direto acima (rede/URL do Neon).\n" +
        "  • P3009 — existe uma migration marcada como falha no banco; resolver antes.\n" +
        "Veja a mensagem exata do Prisma logo acima desta linha."
    );
    process.exit(1);
  }
}
