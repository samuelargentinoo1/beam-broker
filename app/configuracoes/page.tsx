import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { Card, Field, PageHeader, SubmitButton, inputClass } from "@/components/ui";
import TesteWhatsApp from "@/components/teste-whatsapp";
import StatusWhatsApp from "@/components/status-whatsapp";
import TestarVoz from "@/components/testar-voz";
import ConfigIAs from "@/components/config-ias";
import CampoSegredo from "@/components/campo-segredo";
import { ChecklistAtivacao } from "@/components/checklist-ativacao";
import { statusAtivacao } from "@/lib/ativacao";
import { temModulo } from "@/lib/planos";
import { validarCredencial, type TipoCredencial } from "@/lib/credenciais";
import { grupoDaChave } from "@/lib/voz";
import { janelaLiberada } from "@/lib/prompt-audio";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function salvar(formData: FormData) {
  "use server";
  const { imobiliaria } = await exigirSessao();
  // Segredos: campo em branco MANTÉM o valor salvo (a tela nunca reexibe a chave),
  // então salvar sem digitar de novo não apaga nem vaza o segredo.
  const atual = await prisma.imobiliaria.findUnique({
    where: { id: imobiliaria.id },
    select: { uazapiToken: true, asaasApiKey: true, zapsignApiToken: true, elevenlabsApiKey: true, minimaxApiKey: true },
  });
  // Antes de gravar, confere o FORMATO do que veio. O gerenciador de senhas do
  // navegador preenche campo type="password" sozinho, e a regra "preenchido
  // substitui" gravava a senha do usuário por cima de uma chave que funcionava —
  // calada. Recusar é melhor que perder o segredo bom.
  const problemas: string[] = [];
  const segredo = (
    campo: string,
    salvo: string | null | undefined,
    tipo: TipoCredencial
  ): string | null => {
    const v = ((formData.get(campo) as string) || "").trim();
    const erro = validarCredencial(tipo, v);
    if (erro) {
      problemas.push(erro);
      return salvo || null; // mantém o que já estava lá
    }
    return v || salvo || null;
  };
  try {
    await prisma.imobiliaria.update({
      where: { id: imobiliaria.id },
      data: {
        nome: String(formData.get("nome")),
        cnpj: (formData.get("cnpj") as string) || null,
        telefone: (formData.get("telefone") as string) || null,
        municipio: (formData.get("municipio") as string) || null,
        uf: ((formData.get("uf") as string) || "").toUpperCase() || null,
        // Campos de MÓDULO INATIVO são ignorados mesmo que venham no FormData:
        // o formulário não os mostra, mas um POST manual mostraria. Não se
        // confia no que o formulário mandou.
        ...(temModulo(imobiliaria.modulos, "COMERCIAL")
          ? { comissaoVendaPercent: Number(formData.get("comissaoVendaPercent")) || 6 }
          : {}),
        uazapiToken: segredo("uazapiToken", atual?.uazapiToken, "UAZAPI"),
        uazapiUrl: ((formData.get("uazapiUrl") as string) || "").trim().replace(/\/$/, "") || null,
        elevenlabsApiKey: segredo("elevenlabsApiKey", atual?.elevenlabsApiKey, "ELEVENLABS"),
        minimaxApiKey: segredo("minimaxApiKey", atual?.minimaxApiKey, "MINIMAX"),
        minimaxGroupId: ((formData.get("minimaxGroupId") as string) || "").trim() || null,
        // minimaxVoiceId NÃO entra aqui. Ele guarda a voz CLONADA, gravada pela
        // ação de clonagem — zerá-lo neste save apagaria o clone toda vez que
        // alguém mexesse em qualquer outro campo da tela.
        audioPct: Math.min(100, Math.max(0, Number(formData.get("audioPct")) || 0)),
        iasConfig: ((formData.get("iasConfig") as string) || "").trim() || null,
        telefonesCorretores: ((formData.get("telefonesCorretores") as string) || "").trim() || null,
        regrasRevisadas: true, // marca o passo "definir regras" da ativação
      },
    });
  } catch (err) {
    // token/phoneNumberId são únicos: se já estiverem em uso por outra
    // imobiliária, o Postgres recusa — devolve mensagem amigável em vez de erro.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const campo = (err.meta?.target as string[] | undefined)?.join(", ") ?? "campo único";
      const qual = /uazapi/i.test(campo)
        ? "Esse token de uazapi já está em uso por outra imobiliária."
        : /phone/i.test(campo)
          ? "Esse Phone Number ID já está em uso por outra imobiliária."
          : "Um dado único já está em uso por outra imobiliária.";
      redirect(`/configuracoes?erro=${encodeURIComponent(qual)}`);
    }
    throw err;
  }
  revalidatePath("/configuracoes");
  // Recusar calado seria repetir o bug: a pessoa acharia que salvou.
  if (problemas.length > 0)
    redirect(
      `/configuracoes?erro=${encodeURIComponent(
        `${problemas.join(" ")} O resto foi salvo, e a chave que já estava lá foi mantida.`
      )}`
    );
  redirect("/configuracoes?ok=1");
}

// Clonagem de voz. Ação SEPARADA do salvar: envolve subir arquivo, converter e
// duas chamadas à MiniMax que podem levar mais de um minuto — misturar isso com
// o save da tela inteira faria o formulário inteiro esperar por ela.
async function clonarVozDaEquipe(formData: FormData) {
  "use server";
  const { imobiliaria } = await exigirSessao();

  // A voz de uma pessoa passa a vender imóvel em nome da imobiliária. A
  // confirmação fica aqui no servidor, não só como visual na tela: sem ela, a
  // clonagem não acontece.
  if (formData.get("autorizado") !== "sim")
    redirect(
      `/configuracoes?erro=${encodeURIComponent(
        "Confirme que a pessoa autorizou o uso da voz dela antes de clonar."
      )}`
    );

  const arquivo = formData.get("amostra");
  if (!(arquivo instanceof File) || arquivo.size === 0)
    redirect(`/configuracoes?erro=${encodeURIComponent("Escolha um arquivo de áudio.")}`);

  const atual = await prisma.imobiliaria.findUnique({
    where: { id: imobiliaria.id },
    select: { minimaxApiKey: true, minimaxGroupId: true },
  });
  if (!atual?.minimaxApiKey)
    redirect(`/configuracoes?erro=${encodeURIComponent("Salve a API Key da MiniMax primeiro.")}`);

  const { clonarVoz } = await import("@/lib/clonagem-voz");
  const r = await clonarVoz({
    dados: Buffer.from(await arquivo.arrayBuffer()),
    nomeArquivo: arquivo.name,
    mime: arquivo.type,
    apiKey: atual.minimaxApiKey,
    groupId: atual.minimaxGroupId,
    imobiliariaId: imobiliaria.id,
  });
  if (!r.ok) redirect(`/configuracoes?erro=${encodeURIComponent(r.erro)}`);

  await prisma.imobiliaria.update({
    where: { id: imobiliaria.id },
    data: { minimaxVoiceId: r.voiceId },
  });
  await import("@/lib/auditoria").then((m) =>
    m.auditar("CLONAGEM_VOZ", "Imobiliaria", imobiliaria.id, r.voiceId, imobiliaria.id)
  );
  revalidatePath("/configuracoes");
  redirect(
    `/configuracoes?ok=${encodeURIComponent(
      `Voz clonada e já em uso (${r.voiceId}). Ouça no botão "ouvir a voz da Carol".${
        r.aviso ? ` ${r.aviso}` : ""
      }`
    )}`
  );
}

async function resetarDados(formData: FormData) {
  "use server";
  const { imobiliaria } = await exigirSessao();
  const confirmacao = String(formData.get("confirmacao") ?? "").trim().toUpperCase();
  if (confirmacao !== "LIMPAR") {
    redirect(`/configuracoes?erro=${encodeURIComponent('Para limpar, digite exatamente LIMPAR no campo de confirmação.')}`);
  }
  const { limparDadosImobiliaria } = await import("@/lib/reset");
  const resumo = await limparDadosImobiliaria(imobiliaria.id);
  const total = Object.values(resumo).reduce((s, n) => s + n, 0);
  revalidatePath("/configuracoes");
  revalidatePath("/");
  redirect(`/configuracoes?ok=reset&total=${total}`);
}

// Diagnóstico da IA na tela. Existia só como rota de API, então ninguém via —
// e o sintoma chegava ao CLIENTE FINAL como resposta fixa, sem ninguém saber
// por quê. Aqui o motivo real (chave ausente, 401, 429, modelo) aparece em um
// clique, para quem pode resolver.
async function diagnosticarIA() {
  "use server";
  await exigirSessao();
  const { testarIA } = await import("@/lib/agentes");
  const r = await testarIA();
  redirect(`/configuracoes?${r.ok ? "ok" : "erro"}=${encodeURIComponent(r.detalhe)}`);
}

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; total?: string }>;
}) {
  const { imobiliaria, usuario } = await exigirSessao();
  const { ok, erro, total } = await searchParams;
  const ativacao = await statusAtivacao(imobiliaria);
  const comComercial = temModulo(imobiliaria.modulos, "COMERCIAL");
  // Diagnóstico da chave salva, num olhar. A MiniMax emite dois formatos: o JWT
  // ("eyJ...") carrega o GroupID dentro; o "sk-api-..." do console atual não
  // carrega — e aí o GroupId passa a ser obrigatório.
  const grupoMinimaxSalvo = imobiliaria.minimaxApiKey
    ? grupoDaChave(imobiliaria.minimaxApiKey)
    : null;
  const problemaChaveMinimax = imobiliaria.minimaxApiKey
    ? validarCredencial("MINIMAX", imobiliaria.minimaxApiKey)
    : null;
  const janelaDeAudioLiberada = janelaLiberada(new Date());
  const precisaGrupo =
    !!imobiliaria.minimaxApiKey &&
    !problemaChaveMinimax &&
    !grupoMinimaxSalvo &&
    !imobiliaria.minimaxGroupId;
  const ultimosLogs = await prisma.logAuditoria.findMany({
    where: { imobiliariaId: imobiliaria.id },
    orderBy: { criadoEm: "desc" },
    take: 50,
  });

  return (
    <div>
      <PageHeader
        kicker="Operação"
        title="Configurações da imobiliária"
        subtitle={`${imobiliaria.nome} · usuário: ${usuario.nome} (${usuario.email})`}
      />
      {!ativacao.completo && (
        <div className="max-w-[660px] mx-auto">
          <ChecklistAtivacao ativacao={ativacao} />
        </div>
      )}

      {ok && (
        <p className="max-w-[660px] mx-auto mb-4 text-[13px] text-[#34C46A] bg-[rgba(52,196,106,.08)] border border-[rgba(52,196,106,.25)] rounded-xl px-4 py-2.5">
          {/* Quem manda mensagem própria (clonagem, diagnóstico da IA) vê a
              mensagem própria. Antes tudo virava "Configurações salvas." e o
              texto — inclusive o nome da voz clonada — era jogado fora. */}
          {ok === "reset"
            ? `✓ Dados limpos. ${total ?? 0} registro(s) removido(s). Seu login e suas configurações foram mantidos.`
            : ok === "1"
              ? "✓ Configurações salvas."
              : `✓ ${ok}`}
        </p>
      )}
      {erro && (
        <p className="max-w-[660px] mx-auto mb-4 text-[13px] text-[#FF5C7A] bg-[rgba(255,92,122,.06)] border border-[rgba(255,92,122,.25)] rounded-xl px-4 py-2.5">
          ✕ {erro}
        </p>
      )}
      <Card className="p-6 max-w-[660px] mx-auto">
        <form action={salvar} className="grid grid-cols-2 gap-4">
          <Field label="Nome da imobiliária">
            <input name="nome" defaultValue={imobiliaria.nome} required className={inputClass} />
          </Field>
          <Field label="CNPJ">
            <input name="cnpj" defaultValue={imobiliaria.cnpj ?? ""} className={inputClass} />
          </Field>
          <Field label="Telefone">
            <input name="telefone" defaultValue={imobiliaria.telefone ?? ""} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Município (DIMOB)">
              <input name="municipio" defaultValue={imobiliaria.municipio ?? ""} className={inputClass} />
            </Field>
            <Field label="UF">
              <input name="uf" defaultValue={imobiliaria.uf ?? ""} maxLength={2} className={inputClass} />
            </Field>
          </div>

          {comComercial && (
          <div className="col-span-2 border-t border-[#1E222B] pt-4">
            <p className="text-sm font-semibold text-[#C9CFD8] mb-3">💰 Regras financeiras</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Comissão de venda (% sobre o valor da venda)">
                <input name="comissaoVendaPercent" type="number" step="0.5" defaultValue={Number(imobiliaria.comissaoVendaPercent)} className={inputClass} />
              </Field>
            </div>
          </div>
          )}

          <div className="col-span-2 border-t border-[#1E222B] pt-4">
            <p className="text-sm font-semibold text-[#C9CFD8] mb-3">📱 WhatsApp</p>
            <Field label="Servidor uazapi (Server URL do painel)">
              <input
                name="uazapiUrl"
                defaultValue={imobiliaria.uazapiUrl ?? ""}
                className={inputClass}
                placeholder="https://free.uazapi.com"
              />
            </Field>
            <div className="h-3" />
            <Field label="Token da INSTÂNCIA uazapi (não é o Admin Token)">
              <CampoSegredo name="uazapiToken" placeholder={imobiliaria.uazapiToken ? `salvo ••••${imobiliaria.uazapiToken.slice(-4)} — deixe em branco para manter` : "token que aparece na sua instância após conectar o número"} />
            </Field>
            <p className="text-[11px] text-[#7A828F] mt-1 mb-3">
              No painel da uazapi: clique em <b>Nova Instância</b>, conecte seu número pelo QR Code e
              copie o <b>token da instância</b> (não o <i>Admin Token</i> do servidor). Configure o
              webhook da instância para <code>SEU-APP/api/webhooks/uazapi</code> (evento de mensagens).
            </p>
          </div>

          <div className="col-span-2 border-t border-[#1E222B] pt-4">
            <p className="text-sm font-semibold text-[#C9CFD8] mb-1">🔌 Integrações (tokens desta imobiliária)</p>
            <p className="text-[11px] text-[#7A828F] mb-3">
              Cole aqui os tokens da sua conta para o sistema operar com controle total por aqui. Em
              branco, usa a configuração global do servidor (ou o modo demo).
            </p>
            <p className="text-sm font-semibold text-[#C9CFD8] mb-1">🎙️ Voz da IA</p>
            <p className="text-[11px] text-[#7A828F] mb-3">
              São dois serviços, cada um no que faz melhor: a <b>MiniMax</b> gera a fala da Carol e o
              <b> ElevenLabs</b> transcreve os áudios que o cliente manda. Dá para usar só um dos dois.
              Cole só a chave: <b>Pay-as-you-go → Access → Create new API Key</b> (aparece uma vez só).
              O GroupId ao lado fica em branco — preencha só se a MiniMax reclamar, com o número do
              campo <b>UID</b> em <b>Account → Your Profile</b>. A voz o sistema escolhe sozinho.
              Precisa ter saldo em <b>Balance</b>: sem crédito a chave é válida mas a fala não sai. Se
              sua conta for <b>Token Plan / Credits</b>, a chave certa é a de <b>Plan Details</b>, não
              a de Access.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="MiniMax — API Key (fala da IA)">
                <CampoSegredo name="minimaxApiKey" placeholder={imobiliaria.minimaxApiKey ? `salvo ••••${imobiliaria.minimaxApiKey.slice(-4)} — deixe em branco para manter` : "cole a chave da MiniMax"} />
                {/* Diz o que está REALMENTE gravado. Sem isto, uma chave
                    inválida (ex.: preenchida pelo navegador) fica indistinguível
                    de uma boa: os dois casos mostram só bolinhas. */}
                {imobiliaria.minimaxApiKey && (
                  problemaChaveMinimax ? (
                    <p className="text-[11px] text-[#F5B23D] mt-1">{problemaChaveMinimax}</p>
                  ) : grupoMinimaxSalvo ? (
                    <p className="text-[11px] text-[#34C46A] mt-1">
                      Chave salva: grupo {grupoMinimaxSalvo} (veio de dentro da própria chave).
                    </p>
                  ) : (
                    <p className="text-[11px] text-[#34C46A] mt-1">
                      Chave salva no formato <b>sk-</b>. Ela identifica a conta sozinha; o GroupId ao
                      lado só entra se a MiniMax pedir.
                    </p>
                  )
                )}
              </Field>
              <Field label="MiniMax — GroupId (só se pedirem)">
                <input name="minimaxGroupId" defaultValue={imobiliaria.minimaxGroupId ?? ""} className={inputClass} placeholder="deixe em branco e teste primeiro" />
                {precisaGrupo && (
                  <p className="text-[11px] text-[#7A828F] mt-1">
                    Tente sem. Se a MiniMax reclamar do grupo, cole aqui o número do campo <b>UID</b> em
                    Account → Your Profile.
                  </p>
                )}
              </Field>
              <Field label="% das respostas em áudio">
                <input name="audioPct" type="number" min={0} max={100} step={5} defaultValue={imobiliaria.audioPct ?? 40} className={inputClass} />
                <div className="mt-2"><TestarVoz /></div>
                {imobiliaria.minimaxVoiceId && (
                  <p className="text-[11px] text-[#34C46A] mt-2">
                    Usando a voz clonada <b>{imobiliaria.minimaxVoiceId}</b>.
                  </p>
                )}
                {/* Ajustar ruído de fundo sem ouvir lado a lado é chute. */}
                <p className="text-[11px] mt-2">
                  <a href="/api/voz/laboratorio" target="_blank" className="text-[#34C46A] hover:underline">
                    ouvir as camadas do áudio
                  </a>
                  {" · "}
                  <a href="/api/voz/laboratorio?vozes=1" target="_blank" className="text-[#34C46A] hover:underline">
                    comparar as vozes da conta
                  </a>
                </p>
              </Field>
            </div>
            <p className="text-[11px] text-[#7A828F] mt-2">
              A IA sorteia essa porcentagem a cada resposta. É um <b>teto</b>, não a taxa observada:
              PIX, link e resposta longa <b>sempre</b> saem em texto, então na prática vem um pouco
              menos áudio do que o número diz. <b>0 desliga</b> a voz por completo.
              {" "}
              <b>Entre 21h e 8h não sai áudio nenhum</b>, mesmo com 100%: nota de voz de madrugada é
              o que mais toma bloqueio.
            </p>
            {/* Só aparece enquanto a liberação temporária está de pé. Some
                sozinho quando ela expira — aviso que fica para trás vira
                mentira na tela. */}
            {janelaDeAudioLiberada && (
              <p className="text-[11px] text-[#F5B23D] mt-1">
                Janela liberada temporariamente para teste: neste momento o áudio sai em qualquer
                horário. Volta ao padrão 8h–21h sozinho, sem precisar mexer em nada.
              </p>
            )}
            <div className="h-3" />
            <Field label="ElevenLabs — API Key (transcrever o áudio que o cliente manda)">
              <CampoSegredo name="elevenlabsApiKey" placeholder={imobiliaria.elevenlabsApiKey ? `salvo ••••${imobiliaria.elevenlabsApiKey.slice(-4)} — deixe em branco para manter` : "sk_..."} />
            </Field>
            <p className="text-[11px] text-[#7A828F] mt-2">
              Sem esta chave a IA ainda entende áudio, caindo no serviço de transcrição próprio
              quando ele estiver configurado. Na criação da chave habilite <b>Fala para Texto</b>.
            </p>
          </div>

          <div className="col-span-2 border-t border-[#1E222B] pt-4">
            <p className="text-sm font-semibold text-[#C9CFD8] mb-1">🗣️ Nome e voz de cada IA</p>
            <p className="text-[11px] text-[#7A828F] mb-3">
              Personalize como cada IA se chama e a voz dela. Em branco, usa o nome <b>Carol</b> e a voz
              padrão. Clique em ▶ para ouvir uma amostra em português. As vozes são da MiniMax.
            </p>
            <ConfigIAs configAtual={imobiliaria.iasConfig ?? ""} />
          </div>

          <div className="col-span-2 border-t border-[#1E222B] pt-4">
            <p className="text-sm font-semibold text-[#C9CFD8] mb-1">🧭 Ajuda Corretor (números dos corretores)</p>
            <p className="text-[11px] text-[#7A828F] mb-3">
              WhatsApp dos corretores da equipe (um por linha). Mensagem vinda desses números é atendida
              pela IA <b>Ajuda Corretor</b>: o corretor pergunta "quais imóveis temos em Dianópolis?" e a
              Carol lista a carteira, manda fotos e detalhes na hora. Fora dessa lista, o número é tratado
              como cliente normal.
            </p>
            <Field label="Telefones dos corretores (um por linha)">
              <textarea
                name="telefonesCorretores"
                defaultValue={imobiliaria.telefonesCorretores ?? ""}
                rows={3}
                className={`${inputClass} font-mono !text-[12px]`}
                placeholder={"(17) 99999-0001\n(17) 99999-0002"}
              />
            </Field>
          </div>

          <div className="col-span-2 pt-2">
            <SubmitButton>Salvar configurações</SubmitButton>
          </div>
        </form>
      </Card>

      <Card className="p-6 max-w-[660px] mx-auto mt-4">
        <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-[#1E222B]">
          <p className="text-sm font-semibold text-[#C9CFD8]">Status da conexão</p>
          <StatusWhatsApp compacto />
        </div>
        <TesteWhatsApp />
      </Card>

      <Card className="p-6 max-w-[660px] mx-auto mt-4">
        <p className="text-sm font-semibold text-[#C9CFD8] mb-1">A IA está respondendo de verdade?</p>
        <p className="text-[12.5px] text-[#9AA2AF] mb-4 leading-relaxed">
          Faz uma chamada real e diz o motivo exato quando não funciona: chave ausente, chave
          recusada, crédito da conta ou modelo indisponível. Quando a IA não consegue responder, o
          cliente recebe uma mensagem neutra e educada — nunca o motivo técnico —, então este teste
          é o único jeito de você perceber.
        </p>
        <form action={diagnosticarIA}>
          <SubmitButton>Testar a IA agora</SubmitButton>
        </form>
      </Card>

      {/* Auditoria saiu do dock: é conferência eventual, não destino diário.
          Aqui ficam os últimos eventos, com link para a trilha completa. */}
      <Card className="p-6 max-w-[660px] mx-auto mt-4">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-sm font-semibold text-[#F4F5F7] m-0">Auditoria</p>
          <Link href="/auditoria" className="text-[12px] text-[#34C46A] hover:underline">
            ver tudo
          </Link>
        </div>
        {ultimosLogs.length === 0 ? (
          <p className="m-0 text-[12px] text-[#7A828F]">Nenhum evento registrado ainda.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {ultimosLogs.map((l) => (
              <li
                key={l.id}
                className="flex items-baseline gap-3 border-b border-[#1A1E26] py-2 last:border-0"
              >
                <span className="shrink-0 text-[11px] tabular-nums text-[#7A828F]">
                  {l.criadoEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="text-[12.5px] font-medium text-[#C9CFD8]">{l.acao}</span>
                <span className="truncate text-[12px] text-[#7A828F]">{l.detalhes ?? l.entidade}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6 max-w-[660px] mx-auto mt-4">
        <p className="text-sm font-semibold text-[#C9CFD8] mb-1">🎤 Clonar a voz de alguém da equipe</p>
        <p className="text-[12px] text-[#9AA2AF] mb-3">
          É o maior salto de realismo que existe: nenhuma voz de catálogo chega perto de uma pessoa
          de verdade. Mande <b>uns 30 segundos</b> da pessoa falando naturalmente — pode ser uma nota
          de voz do WhatsApp, que o sistema converte sozinho. O mínimo aceito é 10 segundos, mas
          amostra curta rende clone pobre, e 10 e pouco corre o risco de a MiniMax medir diferente e
          recusar. Grave num lugar silencioso: o clone copia o que ouvir, inclusive o barulho de
          fundo.
        </p>
        <p className="text-[12px] text-[#F5B23D] mb-3">
          A voz dessa pessoa vai atender clientes em nome da imobiliária. Só clone com a
          autorização dela, e guarde essa autorização por escrito — a própria MiniMax exige
          consentimento nos termos de uso.
        </p>
        <form action={clonarVozDaEquipe} className="flex flex-wrap items-end gap-3">
          <Field label="Áudio da pessoa (30 s — mp3, m4a, wav ou nota de voz)">
            <input
              type="file"
              name="amostra"
              accept="audio/*,.ogg,.oga,.mp3,.m4a,.wav"
              className="text-[13px]"
            />
          </Field>
          <label className="flex items-center gap-2 text-[12px] text-[#C9CFD8] pb-2">
            <input type="checkbox" name="autorizado" value="sim" />
            A pessoa autorizou o uso da voz dela
          </label>
          <SubmitButton>Clonar voz</SubmitButton>
        </form>
        <p className="text-[11px] text-[#7A828F] mt-2">
          A clonagem leva até dois minutos. Depois dela, a Carol passa a falar com essa voz na hora
          — dá para conferir no <b>▶ ouvir a voz da Carol</b> acima.
        </p>
      </Card>

      <Card className="p-6 max-w-[660px] mx-auto mt-4 border-[rgba(255,92,122,.25)]">
        <p className="text-sm font-semibold text-[#FF5C7A] mb-1">⚠️ Zona de risco — limpar dados</p>
        <p className="text-[12px] text-[#9AA2AF] mb-3">
          Apaga TODOS os dados operacionais desta imobiliária: conversas, mensagens, leads, propostas,
          contratos, faturas, repasses, imóveis, pessoas, documentos e logs. Serve para tirar os dados de
          teste/mock e começar limpo. <b>Mantém</b> o seu login e todas as configurações (tokens, WhatsApp,
          regras, sites de referência). Esta ação é irreversível.
        </p>
        <form action={resetarDados} className="flex items-end gap-2">
          <Field label='Digite LIMPAR para confirmar'>
            <input name="confirmacao" className={inputClass} placeholder="LIMPAR" autoComplete="off" />
          </Field>
          <button
            type="submit"
            className="shrink-0 text-[13px] font-semibold text-[#2A0710] bg-[#FF5C7A] hover:bg-[#9F1239] px-4 py-2.5 rounded-full cursor-pointer transition-colors"
          >
            Limpar dados
          </button>
        </form>
      </Card>
    </div>
  );
}
