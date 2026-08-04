import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SEM_BANCO } from "@/lib/sem-banco";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import {
  ROTULO_ATIVIDADE,
  brl,
  diasEntre,
  quando,
  type TipoAtividade,
} from "@/lib/negocios";
import {
  acaoAnotar,
  acaoConcluirAtividade,
  acaoCriarAtividade,
  acaoCriarCampo,
  acaoDefinirResultado,
  acaoMoverFase,
  acaoSalvarCampos,
  acaoSalvarNegocio,
} from "@/lib/acoes-negocios";
import { inputClass } from "@/components/ui";
import NovaAtividadeModal from "@/components/negocio-atividade-modal";
import NegocioNota from "@/components/negocio-nota";
import NegocioTimeline, { type EventoTimeline } from "@/components/negocio-timeline";

export const dynamic = "force-dynamic";

export default async function NegocioPage({ params }: { params: Promise<{ id: string }> }) {
  if (SEM_BANCO) redirect("/negocios");

  const { imobiliaria, usuario } = await exigirSessao();
  const { id } = await params;

  const negocio = await prisma.negocio.findFirst({
    where: { id: Number(id), imobiliariaId: imobiliaria.id },
    include: {
      funil: { include: { fases: { orderBy: { ordem: "asc" } } } },
      fase: true,
      responsavel: { select: { id: true, nome: true } },
      contato: { select: { id: true, nome: true, telefone: true, email: true } },
      atividades: { orderBy: { quando: "asc" }, include: { responsavel: { select: { nome: true } } } },
      eventos: { orderBy: { em: "desc" }, include: { autor: { select: { nome: true } } } },
      campos: true,
    },
  });
  if (!negocio) notFound();

  const [equipe, camposDefinidos] = await Promise.all([
    prisma.usuario.findMany({
      where: { imobiliariaId: imobiliaria.id },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    prisma.campoPersonalizado.findMany({
      where: { imobiliariaId: imobiliaria.id },
      orderBy: { ordem: "asc" },
    }),
  ]);

  const agora = new Date();
  const pendentes = negocio.atividades.filter((a) => a.status === "PENDENTE");
  // "Dias sem interação" mede o silêncio: conta do último evento até hoje. Sem
  // nenhum evento, cai para a idade do próprio negócio.
  const ultimoEvento = negocio.eventos[0]?.em ?? negocio.criadoEm;

  const eventos: EventoTimeline[] = negocio.eventos.map((e) => ({
    id: e.id,
    tipo: e.tipo,
    titulo: e.titulo,
    detalhe: e.detalhe,
    autorNome: e.autor?.nome ?? null,
    quando: quando(e.em, agora),
  }));

  const valoresPreenchidos = new Map(negocio.campos.map((c) => [c.campoId, c.valor]));
  const quantosPreenchidos = camposDefinidos.filter((c) =>
    (valoresPreenchidos.get(c.id) ?? "").trim() !== ""
  ).length;

  const dataPrevistaInput = negocio.dataPrevista
    ? negocio.dataPrevista.toISOString().slice(0, 10)
    : "";

  async function moverPara(faseId: number) {
    "use server";
    await acaoMoverFase(Number(id), faseId);
  }
  async function marcarResultado(resultado: string) {
    "use server";
    await acaoDefinirResultado(Number(id), resultado);
  }
  async function concluir(atividadeId: number) {
    "use server";
    await acaoConcluirAtividade(atividadeId);
  }

  return (
    <div>
      {/* Trilha das fases + desfecho. As fases ficam clicáveis: mover o negócio
          é a ação mais frequente desta tela, não pode exigir voltar ao quadro. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href="/negocios"
          className="rounded-full border border-[#2A303B] px-3 py-1.5 text-[12px] text-[#9AA2AF] no-underline hover:border-[#34C46A]"
        >
          ← {negocio.funil.nome}
        </Link>

        <div className="flex flex-wrap items-center gap-1">
          {negocio.funil.fases.map((f) => (
            <form key={f.id} action={moverPara.bind(null, f.id)}>
              <button
                type="submit"
                className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                  f.id === negocio.faseId
                    ? "border-[#34C46A] bg-[#34C46A] font-medium text-[#06210F]"
                    : "border-[#2A303B] text-[#9AA2AF] hover:border-[#34C46A] hover:text-[#8CF0B0]"
                }`}
              >
                {f.nome}
              </button>
            </form>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <form action={marcarResultado.bind(null, "GANHO")}>
            <button
              type="submit"
              className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                negocio.resultado === "GANHO"
                  ? "border-[#34C46A] bg-[rgba(52,196,106,.1)] font-medium text-[#34C46A]"
                  : "border-[#2A303B] text-[#9AA2AF] hover:border-[#34C46A] hover:text-[#34C46A]"
              }`}
            >
              ★ Ganhou
            </button>
          </form>
          <form action={marcarResultado.bind(null, "PERDIDO")}>
            <button
              type="submit"
              className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                negocio.resultado === "PERDIDO"
                  ? "border-[#FF5C7A] bg-[rgba(255,92,122,.1)] font-medium text-[#FF5C7A]"
                  : "border-[#2A303B] text-[#9AA2AF] hover:border-[#FF5C7A] hover:text-[#FF5C7A]"
              }`}
            >
              ✕ Perdeu
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_260px]">
        {/* ── Coluna 1: o negócio e os campos personalizados ── */}
        <div className="space-y-4">
          <section className="rounded-[16px] border border-[#1E222B] bg-[#12141A] p-4">
            <form action={acaoSalvarNegocio}>
              <input type="hidden" name="negocioId" value={negocio.id} />

              <input
                name="titulo"
                defaultValue={negocio.titulo}
                className="w-full border-0 bg-transparent p-0 text-[15px] font-semibold text-[#F4F5F7] outline-none focus:bg-[#14171D]"
              />
              <p className="m-0 mb-4 text-[11.5px] text-[#7A828F]">
                Criado em{" "}
                {negocio.criadoEm.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
              </p>

              <label className="block">
                <span className="label-caps mb-1 block !text-[9px] tracking-[.12em] text-[#7A828F]">
                  valor
                </span>
                <input
                  name="valor"
                  inputMode="decimal"
                  defaultValue={negocio.valor ? Number(negocio.valor).toFixed(2).replace(".", ",") : ""}
                  placeholder="Sem valor"
                  className={inputClass}
                />
              </label>

              <label className="mt-3 block">
                <span className="label-caps mb-1 block !text-[9px] tracking-[.12em] text-[#7A828F]">
                  data prevista
                </span>
                <input
                  type="date"
                  name="dataPrevista"
                  defaultValue={dataPrevistaInput}
                  className={inputClass}
                />
              </label>

              <label className="mt-3 block">
                <span className="label-caps mb-1 block !text-[9px] tracking-[.12em] text-[#7A828F]">
                  responsável
                </span>
                <select
                  name="responsavelId"
                  defaultValue={negocio.responsavelId ?? ""}
                  className={inputClass}
                >
                  <option value="">Não atribuído</option>
                  {equipe.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="mt-4 w-full rounded-[10px] border border-[#2A303B] py-2 text-[12.5px] text-[#C9CFD8] hover:border-[#34C46A] hover:text-[#8CF0B0]"
              >
                Salvar
              </button>
            </form>
          </section>

          {/* Quiz Raio-X = campos personalizados da imobiliária. */}
          <section className="rounded-[16px] border border-[#1E222B] bg-[#12141A] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="m-0 text-[13px] font-medium text-[#F4F5F7]">Quiz Raio-X</p>
              <span className="text-[11px] text-[#7A828F]">
                {camposDefinidos.length === 0
                  ? "—"
                  : `${quantosPreenchidos}/${camposDefinidos.length}`}
              </span>
            </div>

            {camposDefinidos.length === 0 ? (
              <p className="m-0 mb-3 text-[12px] leading-relaxed text-[#7A828F]">
                Nenhum campo preenchido. Crie as perguntas que a equipe precisa responder em todo
                negócio.
              </p>
            ) : (
              <form action={acaoSalvarCampos}>
                <input type="hidden" name="negocioId" value={negocio.id} />
                <div className="space-y-3">
                  {camposDefinidos.map((c) => (
                    <label key={c.id} className="block">
                      <span className="label-caps mb-1 block !text-[9px] tracking-[.12em] text-[#7A828F]">
                        {c.nome}
                      </span>
                      <input
                        name={`campo_${c.id}`}
                        defaultValue={valoresPreenchidos.get(c.id) ?? ""}
                        className={inputClass}
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  className="mt-3 w-full rounded-[10px] border border-[#2A303B] py-2 text-[12.5px] text-[#C9CFD8] hover:border-[#34C46A] hover:text-[#8CF0B0]"
                >
                  Salvar respostas
                </button>
              </form>
            )}

            <form action={acaoCriarCampo} className="mt-3 flex gap-1.5 border-t border-[#1A1E26] pt-3">
              <input type="hidden" name="negocioId" value={negocio.id} />
              <input
                name="nome"
                required
                placeholder="Nova pergunta"
                className="input-ds !h-9 !text-[12px]"
              />
              <button
                type="submit"
                className="shrink-0 rounded-[9px] border border-[#2A303B] px-3 text-[12px] text-[#9AA2AF] hover:border-[#34C46A] hover:text-[#8CF0B0]"
              >
                ＋
              </button>
            </form>
          </section>
        </div>

        {/* ── Coluna 2: o dia a dia do negócio ── */}
        <div className="space-y-4">
          <section className="grid grid-cols-4 gap-px overflow-hidden rounded-[16px] border border-[#1E222B] bg-[#1E222B]">
            {[
              { n: diasEntre(negocio.criadoEm, agora), r: "Dias aberto" },
              { n: diasEntre(negocio.faseDesde, agora), r: "Dias na fase" },
              { n: negocio.eventos.length, r: "Interações" },
              { n: diasEntre(ultimoEvento, agora), r: "Dias sem interação" },
            ].map((s) => (
              <div key={s.r} className="bg-[#12141A] px-3 py-3.5 text-center">
                <p className="m-0 text-[19px] font-semibold tabular-nums text-[#F4F5F7]">{s.n}</p>
                <p className="m-0 mt-0.5 text-[10.5px] leading-tight text-[#7A828F]">{s.r}</p>
              </div>
            ))}
          </section>

          <NegocioNota negocioId={negocio.id} anotar={acaoAnotar} />

          {/* Atividades pendentes. Fica ACIMA do aviso porque, quando existe
              tarefa marcada, é ela que a pessoa veio ver. */}
          {pendentes.length > 0 && (
            <section className="space-y-2">
              {pendentes.map((a) => {
                const atrasada = a.quando < agora;
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 rounded-[14px] border bg-[#12141A] p-3 ${
                      atrasada ? "border-[rgba(255,92,122,.3)]" : "border-[#1E222B]"
                    }`}
                  >
                    <span
                      className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] text-[12px]"
                      style={{ background: "rgba(52,196,106,.1)", color: "#8CF0B0" }}
                      aria-hidden
                    >
                      ◷
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[13px] font-medium text-[#F4F5F7]">
                        {a.titulo}
                      </p>
                      <p
                        className={`m-0 text-[11.5px] ${
                          atrasada ? "font-medium text-[#FF5C7A]" : "text-[#7A828F]"
                        }`}
                      >
                        {ROTULO_ATIVIDADE[(a.tipo as TipoAtividade) ?? "TAREFA"] ?? a.tipo}.{" "}
                        {quando(a.quando, agora)}
                        {a.responsavel ? ` · ${a.responsavel.nome}` : ""}
                      </p>
                    </div>
                    <form action={concluir.bind(null, a.id)}>
                      <button
                        type="submit"
                        title="Marcar como concluída"
                        className="grid h-8 w-8 place-items-center rounded-full text-[14px] text-[#7A828F] transition-colors hover:bg-[rgba(52,196,106,.1)] hover:text-[#34C46A]"
                      >
                        ✓
                      </button>
                    </form>
                  </div>
                );
              })}
            </section>
          )}

          <section className="rounded-[16px] border border-[rgba(245,178,61,.25)] bg-[rgba(245,178,61,.05)] p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="text-[14px]" aria-hidden>
                ⚠
              </span>
              <div>
                <p className="m-0 text-[12px] leading-relaxed text-[#F5B23D]">
                  O risco de esquecer o cliente sem uma atividade agendada é alto. Mantenha pelo
                  menos uma atividade por negócio.
                </p>
                <div className="mt-2">
                  <NovaAtividadeModal
                    negocioId={negocio.id}
                    responsaveis={equipe}
                    responsavelPadrao={negocio.responsavelId ?? usuario.id}
                    criar={acaoCriarAtividade}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[16px] border border-[#1E222B] bg-[#12141A] p-3.5">
            <NegocioTimeline eventos={eventos} />
          </section>
        </div>

        {/* ── Coluna 3: contato. Sem Empresa, Produtos nem Arquivos — só
            pessoa física, por decisão de produto. ── */}
        <div className="space-y-4">
          <section className="rounded-[16px] border border-[#1E222B] bg-[#12141A] p-4">
            <p className="m-0 mb-3 text-[13px] font-medium text-[#F4F5F7]">Contato</p>
            {negocio.contato || negocio.contatoNome ? (
              <div className="flex items-start gap-2.5">
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[rgba(52,196,106,.1)] text-[11px] font-semibold text-[#8CF0B0]">
                  {(negocio.contato?.nome ?? negocio.contatoNome ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="m-0 truncate text-[13px] text-[#F4F5F7]">
                    {negocio.contato?.nome ?? negocio.contatoNome}
                  </p>
                  {(negocio.contato?.telefone ?? negocio.contatoTelefone) && (
                    <p className="m-0 text-[11.5px] text-[#7A828F]">
                      {negocio.contato?.telefone ?? negocio.contatoTelefone}
                    </p>
                  )}
                  {negocio.contato?.email && (
                    <p className="m-0 truncate text-[11.5px] text-[#7A828F]">
                      {negocio.contato.email}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="m-0 text-[12px] text-[#7A828F]">Nenhum contato vinculado.</p>
            )}
          </section>

          <section className="rounded-[16px] border border-[#1E222B] bg-[#12141A] p-4">
            <p className="m-0 mb-2 text-[13px] font-medium text-[#F4F5F7]">Resumo</p>
            <dl className="m-0 space-y-1.5 text-[12px]">
              <div className="flex justify-between gap-2">
                <dt className="text-[#7A828F]">Fase</dt>
                <dd className="m-0 text-right text-[#C9CFD8]">{negocio.fase.nome}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#7A828F]">Valor</dt>
                <dd className="m-0 text-right tabular-nums text-[#C9CFD8]">
                  {negocio.valor ? brl(Number(negocio.valor)) : "Sem valor"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#7A828F]">Situação</dt>
                <dd className="m-0 text-right text-[#C9CFD8]">
                  {negocio.resultado === "ABERTO"
                    ? "Em aberto"
                    : negocio.resultado === "GANHO"
                      ? "Ganho"
                      : "Perdido"}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
