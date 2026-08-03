// Hook de inicialização do servidor (roda uma vez, no runtime Node.js, antes de
// atender requisições). O schema do banco é aplicado por migrations versionadas
// (`prisma migrate deploy` no build) — não há mais DDL em runtime aqui.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Verificação de credenciais essenciais em PRODUÇÃO (sem DEMO=1). Faltando
  // qualquer uma, AVISA ALTO no log — mas NÃO derruba o site inteiro. Cada
  // adaptador (cobrança/assinatura/IA/blob) já falha no uso com mensagem clara
  // quando a sua credencial falta, então o resto do app continua no ar.
  //
  // O ÚNICO bloqueio duro de boot fica em lib/auth.ts (AUTH_SECRET): sem ele um
  // cookie de sessão é forjável — é buraco de segurança real, não pode subir.
  // Aqui a gente NÃO relança: um BLOB/CRON/ANTHROPIC ausente não justifica um
  // 500 em todas as rotas (foi o que derrubou o site antes).
  //
  // Credenciais POR IMOBILIÁRIA (asaasApiKey, zapsignApiToken, elevenlabsApiKey)
  // NÃO entram aqui — são opcionais por tenant e falham no uso, com mensagem clara.
  if (process.env.NODE_ENV === "production" && process.env.DEMO !== "1") {
    const essenciais = [
      "ANTHROPIC_API_KEY",
      "DATABASE_URL",
      "AUTH_SECRET",
      "BLOB_READ_WRITE_TOKEN",
      "CRON_SECRET",
    ];
    const faltando = essenciais.filter((k) => !process.env[k]);
    if (faltando.length) {
      console.error(
        `[boot] ATENÇÃO — credenciais essenciais ausentes em produção (e DEMO!=1): ` +
          `${faltando.join(", ")}. O site sobe, mas os recursos que dependem delas ` +
          `vão falhar no uso. Configure-as no painel (ou rode com DEMO=1 para demonstração).`
      );
    }

    // Painel do dono: a chave da sessão de operador sai de OPERADOR_SECRET ou,
    // na falta dela, é DERIVADA do AUTH_SECRET. Só avisa quando nenhuma das
    // duas serve — aí o /admin fica inacessível (fail-closed só nessa área).
    const segOp = process.env.OPERADOR_SECRET;
    const segAuth = process.env.AUTH_SECRET;
    const temChaveOperador =
      (segOp && segOp.length >= 32) || (segAuth && segAuth.length >= 32);
    if (!temChaveOperador) {
      console.error(
        `[boot] Sem chave para a sessão do operador (nem OPERADOR_SECRET nem ` +
          `AUTH_SECRET com 32+ caracteres): o painel do dono (/admin) fica ` +
          `inacessível. Gere com: openssl rand -hex 32`
      );
    }
  }
}
