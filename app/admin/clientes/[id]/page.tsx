import { notFound } from "next/navigation";
import { PageHeader, Card, StatCard, Badge, Table, Field, inputClass, SubmitButton } from "@/components/ui";
import { BotaoCopiar } from "@/components/copiar";
import { brlDeCentavos } from "@/lib/admin";
import { exigirOperador } from "@/lib/operador";
import { prisma } from "@/lib/db";
import { cmvDoMes, competenciaAtual } from "@/lib/uso-ia";
import { LISTA_PRODUTOS, PRODUTOS, calcularFatura, type Produto } from "@/lib/planos";
import {
  trocarProduto,
  definirAssinatura,
  definirAddon,
  bloquearCliente,
  estenderTrial,
  redefinirSenhaAdmin,
} from "@/lib/provisionar";
import { addonPermitido, temAddon } from "@/lib/planos";
import { demandaPorModulo, assuntoDoModulo } from "@/lib/demanda";
import { cmvDoCliente } from "@/lib/cmv-cliente";
import { brl } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ novo?: string; email?: string; senha?: string }>;
}) {
  await exigirOperador();
  const { id } = await params;
  const { novo, email, senha } = await searchParams;
  const imobiliariaId = Number(id);

  const imob = await prisma.imobiliaria.findUnique({
    where: { id: imobiliariaId },
    include: {
      plano: true,
      usuarios: { orderBy: { id: "asc" } },
      _count: { select: { imoveis: true, pessoas: true, leads: true } },
    },
  });
  if (!imob) notFound();

  const competencia = competenciaAtual();
  const [uso, contratosAtivos, leadsMes] = await Promise.all([
    cmvDoMes(imobiliariaId, competencia),
    prisma.contrato.count({ where: { imobiliariaId, status: "ATIVO" } }),
    prisma.lead.count({
      where: {
        imobiliariaId,
        criadoEm: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
  ]);

  const chaveAtual =
    (LISTA_PRODUTOS.find((p) => p.nome === imob.plano?.nome)?.chave ?? "COMERCIAL") as Produto["chave"];
  const produto = PRODUTOS[chaveAtual];

  const fatura = calcularFatura({
    produto,
    contratosAtivos,
    leadsAtendidos: leadsMes,
    cmvIaCentavos: uso.centavosBrl,
  });

  const emTrial = imob.trialAte ? imob.trialAte > new Date() : false;
  const demandas = await demandaPorModulo(imobiliariaId, 90);
  // Toda a matemática de CMV deste cliente: medido x simulado, margem e a
  // sensibilidade que diz onde a cota do plano dele deveria cortar.
  const cmv = await cmvDoCliente({
    imobiliariaId,
    modulos: imob.modulos,
    addons: imob.addons,
    produto,
    contratosAtivos,
    leadsAtendidos: leadsMes,
  });
  const captacaoAtiva = temAddon(imob.addons, "CAPTACAO");
  const captacaoDisponivel = addonPermitido(imob.modulos, "CAPTACAO");
  const usoCota = produto.cotaIaCentavos > 0 ? (uso.centavosBrl / produto.cotaIaCentavos) * 100 : null;

  async function acaoTrocarPlano(formData: FormData) {
    "use server";
    await trocarProduto(imobiliariaId, String(formData.get("produto")) as Produto["chave"]);
  }
  async function acaoAtivar() {
    "use server";
    await definirAssinatura(imobiliariaId, true);
  }
  async function acaoSuspender() {
    "use server";
    await definirAssinatura(imobiliariaId, false);
  }
  async function acaoBloquear() {
    "use server";
    await bloquearCliente(imobiliariaId, "bloqueio manual pelo painel");
  }
  async function acaoEstender() {
    "use server";
    await estenderTrial(imobiliariaId, 7);
  }
  async function acaoAlternarCaptacao(formData: FormData) {
    "use server";
    await definirAddon(imobiliariaId, "CAPTACAO", formData.get("ativar") === "1");
  }

  return (
    <>
      <PageHeader
        kicker={`cliente #${imob.id}`}
        title={imob.nome}
        subtitle={[imob.municipio, imob.uf].filter(Boolean).join(" · ") || undefined}
        breadcrumb={[{ label: "Painel do dono", href: "/admin" }, { label: imob.nome }]}
      />

      {novo === "1" && senha && (
        <Card className="mb-5 !border-[#BBF7D0] !bg-[#F0FDF4]">
          <p className="label-caps m-0 mb-2 !text-[9px] text-[#15803D]">acesso criado — anote agora</p>
          <p className="m-0 mb-3 text-sm text-[#8CF0B0]">
            Esta senha não é armazenada e não aparece de novo. Se perder, redefina abaixo.
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <span className="label-caps block !text-[9px] text-[#15803D]">e-mail</span>
              <span className="text-[15px] text-[#8CF0B0]">{email}</span>
            </div>
            <div>
              <span className="label-caps block !text-[9px] text-[#15803D]">senha temporária</span>
              <span className="text-[17px] font-medium tracking-wide tabular-nums text-[#8CF0B0]">{senha}</span>
            </div>
            <BotaoCopiar texto={`${email} / ${senha}`} rotulo="Copiar e-mail e senha" />
          </div>
        </Card>
      )}

      {imob.bloqueadaEm && (
        <Card className="mb-5 !border-[#4A2028] !bg-[#1F1215]">
          <p className="m-0 text-sm text-[#FFA5B6]">
            Conta bloqueada em {imob.bloqueadaEm.toLocaleDateString("pt-BR")}. A IA não responde e o
            acesso ao painel está suspenso.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <StatCard label="Fatura do mês" value={brlDeCentavos(fatura.total)} hint={produto.nome} />
        <StatCard label="CMV de IA" value={brlDeCentavos(fatura.cmv)} hint={`${uso.mensagens} mensagens`} />
        <StatCard
          label="Margem"
          value={brlDeCentavos(fatura.margem)}
          hint={fatura.total > 0 ? `${((fatura.margem / fatura.total) * 100).toFixed(0)}%` : "—"}
          tone={fatura.margem < 0 ? "bad" : fatura.margem / Math.max(fatura.total, 1) < 0.5 ? "warn" : "good"}
        />
        <StatCard
          label="Uso da cota"
          value={usoCota != null ? `${usoCota.toFixed(0)}%` : "sem cota"}
          hint={usoCota != null ? `de ${brlDeCentavos(produto.cotaIaCentavos)}` : undefined}
          tone={usoCota != null && usoCota >= 100 ? "bad" : usoCota != null && usoCota >= 80 ? "warn" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Card>
          <p className="label-caps m-0 mb-3 !text-[9px] text-[#7A828F]">composição da fatura</p>
          <Table head={["Item", "Base", "Valor"]}>
            <tr>
              <td>Mensalidade</td>
              <td className="text-[#7A828F]">fixa</td>
              <td className="tabular-nums">{brlDeCentavos(fatura.fixo)}</td>
            </tr>
            {produto.porContratoAtivoCentavos > 0 && (
              <tr>
                <td>Contratos administrados</td>
                <td className="tabular-nums text-[#7A828F]">
                  {contratosAtivos} × {brlDeCentavos(produto.porContratoAtivoCentavos)}
                </td>
                <td className="tabular-nums">{brlDeCentavos(fatura.porContrato)}</td>
              </tr>
            )}
            {produto.porLeadAtendidoCentavos > 0 && (
              <tr>
                <td>Leads atendidos</td>
                <td className="tabular-nums text-[#7A828F]">
                  {leadsMes} × {brlDeCentavos(produto.porLeadAtendidoCentavos)}
                </td>
                <td className="tabular-nums">{brlDeCentavos(fatura.porLead)}</td>
              </tr>
            )}
            {fatura.excedente > 0 && (
              <tr>
                <td>Excedente de IA</td>
                <td className="tabular-nums text-[#7A828F]">
                  acima de {brlDeCentavos(produto.cotaIaCentavos)}
                </td>
                <td className="tabular-nums">{brlDeCentavos(fatura.excedente)}</td>
              </tr>
            )}
            <tr>
              <td className="font-medium text-[#F4F5F7]">Total</td>
              <td />
              <td className="tabular-nums font-medium">{brlDeCentavos(fatura.total)}</td>
            </tr>
          </Table>
        </Card>

        <Card>
          <p className="label-caps m-0 mb-3 !text-[9px] text-[#7A828F]">plano e assinatura</p>
          <form action={acaoTrocarPlano} className="flex flex-col gap-3">
            <Field label="Produto">
              <select name="produto" defaultValue={chaveAtual} className={inputClass}>
                {LISTA_PRODUTOS.map((p) => (
                  <option key={p.chave} value={p.chave}>
                    {p.nome} — {brlDeCentavos(p.mensalidadeCentavos)}/mês
                  </option>
                ))}
              </select>
            </Field>
            <SubmitButton>Alterar plano</SubmitButton>
          </form>

          <div className="mt-4 flex flex-wrap gap-2 items-center">
            {imob.assinaturaAtiva && <Badge tone="green">assinatura ativa</Badge>}
            {emTrial && <Badge tone="amber">trial até {imob.trialAte!.toLocaleDateString("pt-BR")}</Badge>}
            {!imob.assinaturaAtiva && !emTrial && <Badge tone="red">sem assinatura</Badge>}
            {imob.modulos.map((m) => (
              <Badge key={m} tone="blue">{m}</Badge>
            ))}
            {imob.addons.map((a) => (
              <Badge key={a} tone="amber">add-on {a}</Badge>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!imob.assinaturaAtiva && (
              <form action={acaoAtivar}><SubmitButton>Ativar assinatura</SubmitButton></form>
            )}
            {imob.assinaturaAtiva && (
              <form action={acaoSuspender}><SubmitButton>Suspender</SubmitButton></form>
            )}
            <form action={acaoEstender}><SubmitButton>+7 dias de trial</SubmitButton></form>
            {!imob.bloqueadaEm && (
              <form action={acaoBloquear}><SubmitButton>Bloquear conta</SubmitButton></form>
            )}
          </div>

          {/* Captação é add-on: acoplável sobre qualquer produto com carteira,
              nunca sobre Recepção (que não tem operação para captar). */}
          <div className="mt-4 border-t border-[#1E222B] pt-4">
            <p className="label-caps m-0 mb-2 !text-[9px] text-[#7A828F]">add-ons</p>
            {captacaoAtiva ? (
              <form action={acaoAlternarCaptacao} className="flex items-center gap-3">
                <input type="hidden" name="ativar" value="0" />
                <span className="text-[13px] text-[#C9CFD8]">Captação · contratada</span>
                <SubmitButton>Remover</SubmitButton>
              </form>
            ) : captacaoDisponivel ? (
              <form action={acaoAlternarCaptacao} className="flex items-center gap-3">
                <input type="hidden" name="ativar" value="1" />
                <span className="text-[13px] text-[#C9CFD8]">Captação</span>
                <SubmitButton>Contratar</SubmitButton>
              </form>
            ) : (
              <p className="m-0 text-[12px] text-[#7A828F]">
                Captação exige um plano com carteira (Comercial, Administração ou Completo).
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card className="mb-5">
        <p className="label-caps m-0 mb-3 !text-[9px] text-[#7A828F]">usuários</p>
        <Table head={["Nome", "E-mail", "Situação", ""]}>
          {imob.usuarios.map((u) => {
            async function acaoRedefinir() {
              "use server";
              await redefinirSenhaAdmin(u.id);
            }
            return (
              <tr key={u.id}>
                <td className="font-medium text-[#F4F5F7]">{u.nome}</td>
                <td className="text-[#9AA2AF]">{u.email}</td>
                <td>
                  {u.precisaTrocarSenha ? (
                    <Badge tone="amber">senha provisória</Badge>
                  ) : (
                    <Badge tone="green">ativo</Badge>
                  )}
                </td>
                <td>
                  <form action={acaoRedefinir}>
                    <SubmitButton>Redefinir senha</SubmitButton>
                  </form>
                </td>
              </tr>
            );
          })}
        </Table>
        <p className="mt-3 mb-0 text-[12px] text-[#7A828F]">
          Redefinir senha derruba as sessões abertas do usuário e gera uma senha provisória — que
          aparece nos logs de auditoria como ação sua, não do cliente.
        </p>
      </Card>

      {/* ── CMV deste cliente ─────────────────────────────────────────── */}
      <Card className="mb-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="label-caps m-0 !text-[9px] text-[#7A828F]">
            controle de CMV · mês corrente
          </p>
          <a href="/admin/calculadora" className="text-[12px] text-[#34C46A] hover:underline">
            abrir a calculadora completa →
          </a>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <StatCard
            label="Custo de IA medido"
            value={brl(cmv.medido.custoRealBrl)}
            hint={`${cmv.medido.turnos} turnos · ${cmv.medido.conversasReais} conversas`}
          />
          <StatCard
            label="Custo simulado"
            value={brl(cmv.consolidado.brlIa)}
            hint={
              cmv.desvioPct == null
                ? "sem base para comparar"
                : `${cmv.desvioPct > 0 ? "+" : ""}${cmv.desvioPct.toFixed(0)}% vs. medido`
            }
            tone={cmv.desvioPct != null && Math.abs(cmv.desvioPct) > 25 ? "warn" : "default"}
          />
          <StatCard
            label="Margem real"
            value={brl(cmv.margemMedida.margemBrl)}
            hint={
              cmv.margemMedida.margemPct == null
                ? "—"
                : `${cmv.margemMedida.margemPct.toFixed(0)}% da receita`
            }
            tone={
              cmv.margemMedida.margemBrl < 0
                ? "bad"
                : (cmv.margemMedida.margemPct ?? 100) < 45
                  ? "warn"
                  : "good"
            }
          />
          <StatCard
            label="Folga até o prejuízo"
            value={
              cmv.margemMedida.folgaConversas != null
                ? `${cmv.margemMedida.folgaConversas.toLocaleString("pt-BR")} conversas`
                : "—"
            }
            hint={`custo marginal ${brl(cmv.margemMedida.custoMarginalBrl)}/conversa`}
          />
        </div>

        {cmv.desvioPct != null && Math.abs(cmv.desvioPct) > 25 && (
          <p className="mb-4 rounded-[12px] bg-[rgba(245,178,61,.06)] px-4 py-3 text-[12.5px] leading-relaxed text-[#F5B23D]">
            O medido e o simulado divergem {Math.abs(cmv.desvioPct).toFixed(0)}%. Acima de 25% os
            parâmetros de PERFIS_PADRAO (lib/cmv.ts) estão desatualizados para este perfil de uso —
            ou há consumo de IA que não veio das conversas (retry, teste, webhook em loop).
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <p className="label-caps m-0 mb-2 !text-[9px] text-[#7A828F]">custo por agente</p>
            <Table head={["Agente", "Conversas", "Por conversa", "CMV"]}>
              {cmv.consolidado.linhas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[13px] text-[#7A828F]">
                    Sem conversas neste mês.
                  </td>
                </tr>
              )}
              {cmv.consolidado.linhas.map((l) => (
                <tr key={l.agente}>
                  <td className="font-medium text-[#F4F5F7]">{l.rotulo}</td>
                  <td className="tabular-nums">{l.conversas}</td>
                  <td className="tabular-nums">{brl(l.brlPorConversa)}</td>
                  <td className="tabular-nums font-medium">{brl(l.brlIa)}</td>
                </tr>
              ))}
            </Table>
          </div>

          <div>
            <p className="label-caps m-0 mb-2 !text-[9px] text-[#7A828F]">
              e se este cliente crescer
            </p>
            <Table head={["Volume", "Conversas", "CMV", "Margem"]}>
              {cmv.sensibilidade.map((c) => (
                <tr key={c.multiplicador} className={c.multiplicador === 1 ? "bg-[#14171D]" : ""}>
                  <td className="font-medium text-[#F4F5F7]">
                    {c.multiplicador === 1 ? "hoje" : `${c.multiplicador}×`}
                  </td>
                  <td className="tabular-nums">{c.conversas.toLocaleString("pt-BR")}</td>
                  <td className="tabular-nums">{brl(c.cmvIaBrl)}</td>
                  <td
                    className="tabular-nums font-medium"
                    style={{ color: c.margemBrl < 0 ? "#DC2626" : "#34C46A" }}
                  >
                    {brl(c.margemBrl)} ({c.margemPct?.toFixed(0)}%)
                  </td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 mb-0 text-[12px] leading-relaxed text-[#7A828F]">
              A linha que fica vermelha é onde a cota deste plano precisa cortar. Cota atual:{" "}
              {brl(cmv.cotaBrl)}
              {cmv.usoCotaPct != null && ` · ${cmv.usoCotaPct.toFixed(0)}% usada`}.
            </p>
          </div>
        </div>
      </Card>

      {demandas.length > 0 && (
        <Card className="mb-5">
          <p className="label-caps m-0 mb-3 !text-[9px] text-[#7A828F]">
            demanda represada · últimos 90 dias
          </p>
          <Table head={["Módulo", "Assunto procurado", "Pessoas"]}>
            {demandas.map((d) => (
              <tr key={d.modulo}>
                <td className="font-medium text-[#F4F5F7]">{d.modulo}</td>
                <td className="text-[#9AA2AF]">{assuntoDoModulo(d.modulo)}</td>
                <td className="tabular-nums font-medium">{d.total}</td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 mb-0 text-[12px] leading-relaxed text-[#7A828F]">
            Pessoas que procuraram este cliente por algo que o plano dele não atende. É o
            número dele, não o seu argumento — use na conversa de upgrade.
          </p>
        </Card>
      )}

      <Card>
        <p className="label-caps m-0 mb-3 !text-[9px] text-[#7A828F]">carteira</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-[13px]">
          <div><span className="block text-[#7A828F]">Imóveis</span><span className="tabular-nums text-[#F4F5F7]">{imob._count.imoveis}</span></div>
          <div><span className="block text-[#7A828F]">Contratos ativos</span><span className="tabular-nums text-[#F4F5F7]">{contratosAtivos}</span></div>
          <div><span className="block text-[#7A828F]">Pessoas</span><span className="tabular-nums text-[#F4F5F7]">{imob._count.pessoas}</span></div>
          <div><span className="block text-[#7A828F]">Leads no mês</span><span className="tabular-nums text-[#F4F5F7]">{leadsMes}</span></div>
        </div>
      </Card>
    </>
  );
}
