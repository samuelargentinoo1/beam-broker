// Torna um e-mail EXCLUSIVAMENTE operador do SaaS (dono) — e tira dele
// qualquer papel de cliente.
//
// O dono não é usuário de imobiliária nenhuma. Se o mesmo e-mail também tem um
// Usuario (login do produto), ele aparece na lista de usuários de um cliente,
// conta como usuário do plano e vê as telas do produto. Este script separa as
// duas coisas: garante o Operador e remove o Usuario correspondente.
//
// Uso:
//   node scripts/promover-operador.mjs marco@beam360.com
//   node scripts/promover-operador.mjs marco@beam360.com --forcar
//
// GUARDA: se o Usuario for o ÚNICO de uma imobiliária que TEM carteira (imóveis,
// contratos, pessoas...), remover deixaria aquele cliente sem ninguém para
// logar. Nesse caso o script RECUSA e explica — só prossegue com --forcar.
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
  return (() => {
    const salt = randomBytes(16).toString("hex");
    return `${salt}:${scryptSync(senha, salt, 64).toString("hex")}`;
  })();
}

const prisma = new PrismaClient();
const rl = createInterface({ input: stdin, output: stdout });

try {
  const bruto = process.argv[2] ?? (await rl.question("E-mail do dono: "));
  const forcar = process.argv.includes("--forcar");
  // Tolera o erro de digitação mais comum: vírgula no lugar do ponto.
  const email = bruto.trim().toLowerCase().replace(/,/g, ".");
  if (!email.includes("@")) throw new Error(`E-mail inválido: ${bruto}`);
  if (email !== bruto.trim().toLowerCase()) console.log(`→ interpretando como: ${email}`);

  // ── 1. Garante o Operador ────────────────────────────────────────────────
  let operador = await prisma.operador.findUnique({ where: { email } });
  if (operador) {
    if (!operador.ativo) {
      operador = await prisma.operador.update({ where: { id: operador.id }, data: { ativo: true } });
      console.log(`✔ Operador ${email} reativado.`);
    } else {
      console.log(`✔ Operador ${email} já existe (id ${operador.id}).`);
    }
  } else {
    // Aceita a senha por ambiente (SENHA_NOVA=... node scripts/...) para o
    // script rodar sem terminal interativo; senão, pergunta.
    const senha = (
      process.env.SENHA_NOVA ?? (await rl.question("Senha do operador (mínimo 10 caracteres): "))
    ).trim();
    if (senha.length < 10) throw new Error("Senha muito curta (mínimo 10 caracteres).");
    operador = await prisma.operador.create({
      data: { nome: "Dono", email, senhaHash: hashSenha(senha) },
    });
    console.log(`✔ Operador ${email} criado (id ${operador.id}).`);
  }
  console.log(
    operador.totpAtivadoEm
      ? "  2FA já ativado."
      : "  2FA ainda NÃO ativado — será exigido no primeiro acesso a /admin/entrar."
  );

  // ── 2. Remove o papel de cliente ─────────────────────────────────────────
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    include: { imobiliaria: true },
  });

  if (!usuario) {
    console.log("✔ Nada a remover: este e-mail não é usuário de nenhuma imobiliária.");
  } else {
    const imobId = usuario.imobiliariaId;
    const [outrosUsuarios, imoveis, pessoas, contratos, faturas, leads, conversas, documentos, lancamentos] =
      await Promise.all([
        prisma.usuario.count({ where: { imobiliariaId: imobId, id: { not: usuario.id } } }),
        prisma.imovel.count({ where: { imobiliariaId: imobId } }),
        prisma.pessoa.count({ where: { imobiliariaId: imobId } }),
        prisma.contrato.count({ where: { imobiliariaId: imobId } }),
        prisma.fatura.count({ where: { imobiliariaId: imobId } }),
        prisma.lead.count({ where: { imobiliariaId: imobId } }),
        prisma.conversa.count({ where: { imobiliariaId: imobId } }),
        prisma.documento.count({ where: { imobiliariaId: imobId } }),
        prisma.lancamento.count({ where: { imobiliariaId: imobId } }),
      ]);
    const carteira = imoveis + pessoas + contratos + faturas + leads + conversas + documentos + lancamentos;

    console.log(`\n  Este e-mail também é usuário da imobiliária #${imobId} "${usuario.imobiliaria.nome}":`);
    console.log(`    outros usuários: ${outrosUsuarios} · registros de carteira: ${carteira}`);
    console.log(
      `    (imóveis ${imoveis} · pessoas ${pessoas} · contratos ${contratos} · faturas ${faturas} · leads ${leads} · conversas ${conversas} · documentos ${documentos} · lançamentos ${lancamentos})`
    );

    if (carteira > 0 && outrosUsuarios === 0 && !forcar) {
      console.log(
        `\n✖ RECUSADO: remover este usuário deixaria a imobiliária "${usuario.imobiliaria.nome}" ` +
          `sem NINGUÉM para entrar, e ela tem ${carteira} registro(s) de carteira.\n` +
          `  Opções: (a) crie outro usuário para ela em /admin/clientes/${imobId} e rode de novo;\n` +
          `          (b) rode com --forcar se essa conta é só de teste e pode ficar sem acesso.`
      );
    } else {
      await prisma.tokenEmail.deleteMany({ where: { usuarioId: usuario.id } });
      await prisma.usuario.delete({ where: { id: usuario.id } });
      console.log(`✔ Usuario ${email} removido da imobiliária #${imobId}.`);

      // Limpeza: imobiliária que ficou sem usuários E sem carteira era só o
      // "endereço" dessa conta — não é cliente de verdade.
      if (outrosUsuarios === 0 && carteira === 0) {
        await prisma.logAuditoria.deleteMany({ where: { imobiliariaId: imobId } });
        await prisma.usoIA.deleteMany({ where: { imobiliariaId: imobId } });
        await prisma.demandaNaoAtendida.deleteMany({ where: { imobiliariaId: imobId } });
        await prisma.imobiliaria.delete({ where: { id: imobId } });
        console.log(`✔ Imobiliária #${imobId} "${usuario.imobiliaria.nome}" removida (vazia e sem usuários).`);
      } else if (outrosUsuarios === 0) {
        console.log(
          `⚠ A imobiliária #${imobId} ficou SEM usuários (mas tem carteira). ` +
            `Crie um acesso para ela em /admin/clientes/${imobId} quando for usar.`
        );
      }
    }
  }

  // ── 3. Estado final ──────────────────────────────────────────────────────
  const aindaUsuario = await prisma.usuario.count({ where: { email } });
  console.log(`\nEstado final de ${email}:`);
  console.log(`  operador do SaaS: sim (entre em /admin/entrar)`);
  console.log(`  usuário de imobiliária: ${aindaUsuario > 0 ? "SIM — ainda existe" : "não"}`);
} catch (e) {
  console.error(`✖ ${e.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await prisma.$disconnect();
}
