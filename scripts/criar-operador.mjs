// Cria (ou atualiza a senha de) um OPERADOR — o dono do SaaS, que acessa /admin.
// Não existe cadastro público de operador: esta é a via oficial, junto com o
// bootstrap por ambiente (OPERADOR_EMAIL/OPERADOR_SENHA) para quem só tem painel.
//
// Uso:
//   node scripts/criar-operador.mjs                      (pergunta e-mail e senha)
//   node scripts/criar-operador.mjs email@dominio.com     (pergunta só a senha)
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* segue com o ambiente do processo */
  }
}

function hashSenha(senha) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(senha, salt, 64).toString("hex")}`;
}

const prisma = new PrismaClient();
const rl = createInterface({ input: stdin, output: stdout });

try {
  const email = (process.argv[2] ?? (await rl.question("E-mail do operador: "))).trim().toLowerCase();
  if (!email.includes("@")) throw new Error("E-mail inválido.");

  const nome = (await rl.question("Nome (padrão: Dono): ")).trim() || "Dono";
  const senha = (await rl.question("Senha (mínimo 10 caracteres): ")).trim();
  if (senha.length < 10) throw new Error("Senha muito curta (mínimo 10 caracteres).");

  const existente = await prisma.operador.findUnique({ where: { email } });
  if (existente) {
    await prisma.operador.update({
      where: { id: existente.id },
      data: {
        senhaHash: hashSenha(senha),
        ativo: true,
        // Derruba as sessões abertas desse operador.
        sessaoVersao: { increment: 1 },
      },
    });
    console.log(`✔ Senha do operador ${email} redefinida (sessões anteriores invalidadas).`);
  } else {
    await prisma.operador.create({ data: { nome, email, senhaHash: hashSenha(senha) } });
    console.log(`✔ Operador ${email} criado. Entre em /admin/entrar.`);
  }
  console.log("Lembre-se: OPERADOR_SECRET (32+ caracteres) precisa estar no ambiente.");
} catch (e) {
  console.error(`✖ ${e.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await prisma.$disconnect();
}
