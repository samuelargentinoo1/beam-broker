import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import QRCode from "qrcode";
import {
  COOKIE_OPERADOR,
  COOKIE_PRE_OPERADOR,
  criarTokenOperador,
  criarTokenPreOperador,
  operadorConfigurado,
  validarTokenPreOperador,
} from "@/lib/operador-auth";
import {
  autenticarOperador,
  bootstrapOperadorPorEnv,
  confirmarAtivacaoTotp,
  getOperador,
  prepararAtivacaoTotp,
  totpAtivo,
  totpObrigatorio,
  verificarSegundoFator,
} from "@/lib/operador";
import { prisma } from "@/lib/db";
import {
  ipDaRequisicao,
  loginBloqueado,
  registrarFalhaLogin,
  limparTentativasLogin,
} from "@/lib/login-seguranca";

export const dynamic = "force-dynamic";

// Login do OPERADOR em dois passos: senha → código. Não existe cadastro público
// de operador — a conta nasce por scripts/criar-operador.mjs ou pelo bootstrap
// por ambiente. A conta vê dado financeiro e pessoal de TODOS os clientes, então
// senha sozinha não basta.

const COOKIE_CODIGOS = "operador_codigos_novos";

async function abrirSessao(operadorId: number, sessaoVersao: number) {
  const token = await criarTokenOperador(operadorId, sessaoVersao);
  if (!token) redirect("/admin/entrar?erro=config");
  const jar = await cookies();
  const https = (await headers()).get("x-forwarded-proto")?.includes("https") ?? false;
  jar.set(COOKIE_OPERADOR, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    maxAge: 8 * 60 * 60,
    path: "/",
  });
  jar.delete(COOKIE_PRE_OPERADOR);
}

// ── Passo 1: e-mail e senha ────────────────────────────────────────────────
async function entrar(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const hdrs = await headers();
  const ip = ipDaRequisicao(hdrs);

  if (await loginBloqueado(email, ip)) redirect("/admin/entrar?erro=bloqueado");

  // Sem OPERADOR_SECRET nenhum token pode ser emitido: a senha até pode estar
  // certa, mas o login não tem como funcionar. Dizer "e-mail ou senha
  // incorretos" aqui manda o dono caçar o problema no lugar errado.
  if (!operadorConfigurado()) redirect("/admin/entrar?erro=config");

  const operador = await autenticarOperador(email, senha);
  if (!operador) {
    await registrarFalhaLogin(email, ip);
    // Distingue "ainda não existe operador nenhum" de "credencial errada": o
    // primeiro é configuração pendente, o segundo é engano de digitação.
    const nenhum = (await prisma.operador.count()) === 0;
    redirect(`/admin/entrar?erro=${nenhum ? "semoperador" : "1"}`);
  }
  await limparTentativasLogin(email, ip);

  // Senha certa ainda não é sessão: emite só a pré-autenticação.
  const pre = await criarTokenPreOperador(operador.id);
  if (!pre) redirect("/admin/entrar?erro=config");
  const https = hdrs.get("x-forwarded-proto")?.includes("https") ?? false;
  (await cookies()).set(COOKIE_PRE_OPERADOR, pre, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    maxAge: 5 * 60,
    path: "/",
  });

  if (totpAtivo(operador)) redirect("/admin/entrar?etapa=codigo");
  // Sem 2FA: em produção a ativação é obrigatória antes de liberar o acesso.
  if (totpObrigatorio()) redirect("/admin/entrar?etapa=ativar");
  await abrirSessao(operador.id, operador.sessaoVersao);
  redirect("/admin");
}

// ── Passo 2a: confirmar a ativação do 2FA ──────────────────────────────────
async function ativar(formData: FormData) {
  "use server";
  const jar = await cookies();
  const operadorId = await validarTokenPreOperador(jar.get(COOKIE_PRE_OPERADOR)?.value);
  if (!operadorId) redirect("/admin/entrar?erro=expirou");

  const codigos = await confirmarAtivacaoTotp(operadorId, String(formData.get("codigo") ?? ""));
  if (!codigos) redirect("/admin/entrar?etapa=ativar&erro=codigo");

  const operador = await prisma.operador.findUniqueOrThrow({ where: { id: operadorId } });
  await abrirSessao(operador.id, operador.sessaoVersao);

  // Os códigos de recuperação aparecem UMA vez. Vão num cookie httpOnly curto
  // (não na URL, que ficaria no histórico) e são apagados ao serem exibidos.
  const https = (await headers()).get("x-forwarded-proto")?.includes("https") ?? false;
  jar.set(COOKIE_CODIGOS, codigos.join(","), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    maxAge: 10 * 60,
    path: "/",
  });
  redirect("/admin/entrar?etapa=recuperacao");
}

// ── Passo 2b: código do app (ou de recuperação) ────────────────────────────
async function confirmarCodigo(formData: FormData) {
  "use server";
  const jar = await cookies();
  const operadorId = await validarTokenPreOperador(jar.get(COOKIE_PRE_OPERADOR)?.value);
  if (!operadorId) redirect("/admin/entrar?erro=expirou");

  const operador = await prisma.operador.findUniqueOrThrow({ where: { id: operadorId } });
  const hdrs = await headers();
  const ip = ipDaRequisicao(hdrs);
  if (await loginBloqueado(operador.email, ip)) redirect("/admin/entrar?erro=bloqueado");

  const ok = await verificarSegundoFator(operadorId, String(formData.get("codigo") ?? ""));
  if (!ok) {
    // Código errado conta como tentativa: senão o 2FA viraria oráculo infinito.
    await registrarFalhaLogin(operador.email, ip);
    redirect("/admin/entrar?etapa=codigo&erro=codigo");
  }
  await limparTentativasLogin(operador.email, ip);
  await abrirSessao(operador.id, operador.sessaoVersao);
  redirect("/admin");
}

const caixa =
  "rounded-2xl border border-[#1E222B] bg-[#12141A] p-9 shadow-[0_10px_30px_-18px_rgba(0,0,0,.18)]";
const botao =
  "mt-1 inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-[#F4F5F7] px-5 py-[11px] text-sm font-semibold text-white transition-colors hover:bg-[#000]";
const rotulo = "label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]";

export default async function EntrarOperadorPage({
  searchParams,
}: {
  searchParams: Promise<{ etapa?: string; erro?: string }>;
}) {
  if (await getOperador()) redirect("/admin");
  await bootstrapOperadorPorEnv();

  const { etapa, erro } = await searchParams;
  const semSegredo = !operadorConfigurado();
  const semOperadorCadastrado = (await prisma.operador.count()) === 0;
  const msg =
    erro === "bloqueado"
      ? "Muitas tentativas. Aguarde alguns minutos."
      : erro === "config" || erro === "semoperador"
        ? null // já explicado no bloco de configuração, sem mensagem duplicada
        : erro === "expirou"
          ? "A sessão de login expirou. Comece de novo."
          : erro === "codigo"
            ? "Código inválido. Tente o código atual do app."
            : erro
              ? "E-mail ou senha incorretos."
              : null;

  const jar = await cookies();
  const preId = await validarTokenPreOperador(jar.get(COOKIE_PRE_OPERADOR)?.value);

  const Aviso = () =>
    msg ? (
      <p className="mb-4 rounded-[10px] border border-[rgba(255,92,122,.2)] bg-[rgba(255,92,122,.06)] px-3 py-2 text-[12.5px] text-[#FF5C7A]">
        {msg}
      </p>
    ) : null;

  // ── Códigos de recuperação (uma única exibição) ──────────────────────────
  if (etapa === "recuperacao") {
    const brutos = jar.get(COOKIE_CODIGOS)?.value;
    const codigos = brutos ? brutos.split(",") : [];
    if (codigos.length === 0) redirect("/admin");
    async function concluir() {
      "use server";
      (await cookies()).delete(COOKIE_CODIGOS);
      redirect("/admin");
    }
    return (
      <div className="mx-auto max-w-[520px]">
        <div className={caixa}>
          <p className="label-caps m-0 !text-[8.5px] tracking-[.2em] text-[#15803D]">
            2FA ativado
          </p>
          <h1 className="m-0 mt-2 mb-3 text-[22px] font-[480] tracking-[-0.03em]">
            Guarde seus códigos de recuperação
          </h1>
          <p className="m-0 mb-5 text-[13px] leading-relaxed text-[#9AA2AF]">
            Eles não aparecem de novo. Cada um serve <strong>uma única vez</strong> e substitui o
            código do app se você perder o celular.
          </p>
          <ul className="m-0 mb-5 grid list-none grid-cols-2 gap-2 p-0">
            {codigos.map((c) => (
              <li
                key={c}
                className="rounded-[10px] bg-[#14171D] px-3 py-2 text-center text-[14px] font-medium tracking-wide tabular-nums text-[#F4F5F7]"
              >
                {c}
              </li>
            ))}
          </ul>
          <form action={concluir}>
            <button type="submit" className={botao}>
              Anotei — ir para o painel
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Ativação do 2FA (QR + confirmação) ───────────────────────────────────
  if (etapa === "ativar" && preId) {
    const { segredo, uri } = await prepararAtivacaoTotp(preId);
    const qr = await QRCode.toString(uri, { type: "svg", margin: 1, width: 190 });
    return (
      <div className="mx-auto max-w-[460px]">
        <div className={caixa}>
          <p className="label-caps m-0 !text-[8.5px] tracking-[.2em] text-[#7A828F]">
            segundo fator obrigatório
          </p>
          <h1 className="m-0 mt-2 mb-3 text-[22px] font-[480] tracking-[-0.03em]">
            Ative o 2FA para entrar
          </h1>
          <p className="m-0 mb-5 text-[13px] leading-relaxed text-[#9AA2AF]">
            Leia o QR no seu app autenticador (Google Authenticator, 1Password, Authy) e digite o
            código de 6 dígitos para confirmar.
          </p>
          <Aviso />
          <div
            className="mx-auto mb-4 w-[190px] [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <details className="mb-4">
            <summary className="cursor-pointer text-[12px] text-[#9AA2AF]">
              Não consigo ler o QR
            </summary>
            <p className="mt-2 break-all rounded-[10px] bg-[#14171D] px-3 py-2 text-[12px] tabular-nums text-[#C9CFD8]">
              {segredo}
            </p>
          </details>
          <form action={ativar} className="flex flex-col gap-[15px]">
            <label className="block">
              <span className={rotulo}>Código do app</span>
              <input
                name="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="input-ds mt-1.5 tracking-[.3em]"
                placeholder="000000"
              />
            </label>
            <button type="submit" className={botao}>
              Confirmar e entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Código do app (login normal com 2FA já ativo) ────────────────────────
  if (etapa === "codigo" && preId) {
    return (
      <div className="mx-auto max-w-[380px]">
        <div className={caixa}>
          <p className="label-caps m-0 !text-[8.5px] tracking-[.2em] text-[#7A828F]">
            verificação em duas etapas
          </p>
          <h1 className="m-0 mt-2 mb-5 text-[22px] font-[480] tracking-[-0.03em]">
            Código do autenticador
          </h1>
          <Aviso />
          <form action={confirmarCodigo} className="flex flex-col gap-[15px]">
            <label className="block">
              <span className={rotulo}>Código de 6 dígitos</span>
              <input
                name="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                className="input-ds mt-1.5 tracking-[.3em]"
                placeholder="000000"
              />
            </label>
            <button type="submit" className={botao}>
              Entrar
            </button>
          </form>
          <p className="mt-4 mb-0 text-[11.5px] leading-relaxed text-[#7A828F]">
            Perdeu o celular? Digite acima um dos seus códigos de recuperação — cada um funciona
            uma única vez.
          </p>
        </div>
      </div>
    );
  }

  // ── Passo 1 ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[380px]">
      <div className={caixa}>
        <p className="label-caps m-0 !text-[8.5px] tracking-[.2em] text-[#7A828F]">área restrita</p>
        <h1 className="m-0 mt-2 mb-6 text-[24px] font-[480] tracking-[-0.03em]">Painel do dono</h1>

        {(semSegredo || semOperadorCadastrado) && (
          <div className="mb-4 rounded-[10px] border border-[rgba(245,178,61,.2)] bg-[rgba(245,178,61,.06)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[#F5B23D]">
            <p className="m-0 mb-2 font-semibold">
              {semSegredo
                ? "O acesso do dono ainda não foi configurado."
                : "Ainda não existe nenhum operador cadastrado."}
            </p>
            <p className="m-0 mb-2">
              No painel da Vercel, em Settings → Environment Variables, defina
              {semSegredo ? " as três variáveis abaixo" : " estas duas"} e faça um novo deploy:
            </p>
            <ul className="m-0 list-none p-0 tabular-nums">
              {semSegredo && (
                <li>
                  <code>OPERADOR_SECRET</code> — 32+ caracteres aleatórios
                </li>
              )}
              <li>
                <code>OPERADOR_EMAIL</code> — o seu e-mail de dono
              </li>
              <li>
                <code>OPERADOR_SENHA</code> — a senha que você vai usar
              </li>
            </ul>
            <p className="m-0 mt-2">
              As duas últimas criam o primeiro operador automaticamente, no primeiro acesso.
            </p>
          </div>
        )}
        <Aviso />

        <form action={entrar} className="flex flex-col gap-[15px]">
          <label className="block">
            <span className={rotulo}>E-mail</span>
            <input name="email" type="email" required className="input-ds mt-1.5" autoComplete="username" />
          </label>
          <label className="block">
            <span className={rotulo}>Senha</span>
            <input
              name="senha"
              type="password"
              required
              className="input-ds mt-1.5"
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className={botao}>
            Continuar
          </button>
        </form>

        {/* Não existe "esqueci minha senha" por e-mail aqui: a conta do dono é
            infraestrutura, e um fluxo de recuperação por e-mail seria a porta
            mais fraca do sistema inteiro. A saída é pelo ambiente. */}
        {!semOperadorCadastrado && (
          <details className="mt-5">
            <summary className="cursor-pointer text-[11.5px] text-[#7A828F]">
              Perdi a senha ou o autenticador
            </summary>
            <div className="mt-2 rounded-[10px] bg-[#14171D] px-3.5 py-3 text-[11.5px] leading-relaxed text-[#9AA2AF]">
              <p className="m-0 mb-2">
                Na Vercel, em Settings → Environment Variables, defina as três e faça um novo
                deploy:
              </p>
              <ul className="m-0 list-none p-0 tabular-nums">
                <li>
                  <code>OPERADOR_EMAIL</code> — o e-mail da sua conta
                </li>
                <li>
                  <code>OPERADOR_SENHA</code> — a nova senha
                </li>
                <li>
                  <code>OPERADOR_RESET=1</code> — libera a troca
                </li>
              </ul>
              <p className="m-0 mt-2">
                A senha passa a valer, o 2FA é zerado (você reativa no próximo acesso) e as sessões
                abertas caem. <strong>Remova o OPERADOR_RESET</strong> assim que entrar — sem ele,
                a senha do ambiente é ignorada e só vale a que você definir na tela.
              </p>
            </div>
          </details>
        )}
      </div>
      <p className="mt-3.5 text-center text-[11px] leading-[1.6] text-[#7A828F]">
        Esta área é do operador da plataforma.
        <br />
        Se você é uma imobiliária, entre em{" "}
        <a href="/login" className="font-semibold">
          /login
        </a>
        .
      </p>
    </div>
  );
}
