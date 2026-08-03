"use client";

import { useMemo, useState } from "react";
import { Card, StatCard, Badge, Field, Table } from "@/components/ui";
import {
  PERFIS_PADRAO,
  CENARIO_PADRAO,
  PRECOS,
  consolidarMes,
  analisarMargem,
  curvaSensibilidade,
  brl,
  type Agente,
  type Cenario,
  type PerfilAgente,
  type Modelo,
} from "@/lib/cmv";
import {
  PRODUTOS,
  LISTA_PRODUTOS,
  addonPermitido,
  agentesAtivos,
  type Addon,
  type Produto,
} from "@/lib/planos";

type Props = { medido?: { agente: string; conversas: number; brlPorConversa: number }[] };

function Slider({
  label,
  valor,
  min,
  max,
  passo = 1,
  sufixo = "",
  onChange,
}: {
  label: string;
  valor: number;
  min: number;
  max: number;
  passo?: number;
  sufixo?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">{label}</span>
        <span className="text-[12px] tabular-nums font-medium text-[#F4F5F7]">
          {valor.toLocaleString("pt-BR")}
          {sufixo}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#34C46A] cursor-pointer"
      />
    </div>
  );
}

export default function CalculadoraCliente({ medido }: Props) {
  const [chave, setChave] = useState<Produto["chave"]>("COMERCIAL");
  const [cenario, setCenario] = useState<Cenario>(CENARIO_PADRAO);
  const [perfis, setPerfis] = useState<Record<Agente, PerfilAgente>>(PERFIS_PADRAO);
  const [contratos, setContratos] = useState(120);
  const [leads, setLeads] = useState(200);
  const [infra, setInfra] = useState(35);
  const [avancado, setAvancado] = useState(false);

  const produto = PRODUTOS[chave];

  // Captação é ADD-ON: não vem em nenhum produto, mas acrescenta um agente —
  // logo, muda o CMV. Por isso entra aqui como chave a simular.
  const [comCaptacao, setComCaptacao] = useState(false);
  const captacaoPermitida = addonPermitido(produto.modulos, "CAPTACAO");
  const addonsSimulados: Addon[] = useMemo(
    () =>
      Array.from(
        new Set<Addon>([
          ...produto.addons,
          ...(comCaptacao && captacaoPermitida ? (["CAPTACAO"] as Addon[]) : []),
        ])
      ),
    [produto.addons, comCaptacao, captacaoPermitida]
  );
  const ativos = useMemo(
    () => agentesAtivos(produto.modulos, addonsSimulados),
    [produto.modulos, addonsSimulados]
  );

  const cons = useMemo(
    () => consolidarMes(cenario, perfis, ativos),
    [cenario, perfis, ativos]
  );

  const receitaCentavos =
    produto.mensalidadeCentavos +
    produto.porContratoAtivoCentavos * contratos +
    produto.porLeadAtendidoCentavos * leads;
  const receita = receitaCentavos / 100;

  const margem = analisarMargem(receita, cons, infra);

  const curva = useMemo(
    () => curvaSensibilidade(receita, cenario, perfis, ativos, infra),
    [receita, cenario, perfis, ativos, infra]
  );

  const semCache = useMemo(
    () => consolidarMes({ ...cenario, cachingAtivo: false }, perfis, ativos),
    [cenario, perfis, ativos]
  );

  const setVolume = (a: Agente, v: number) =>
    setCenario((c) => ({ ...c, volume: { ...c.volume, [a]: v } }));

  const setModelo = (a: Agente, m: Modelo) =>
    setPerfis((p) => ({ ...p, [a]: { ...p[a], modelo: m } }));

  const tomMargem = margem.margemPct == null ? "default" : margem.margemPct < 40 ? "bad" : margem.margemPct < 65 ? "warn" : "good";

  return (
    <div className="flex flex-col gap-5">
      {/* Produto */}
      <Card>
        <p className="label-caps m-0 mb-3 !text-[9px] text-[#7A828F]">produto simulado</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {LISTA_PRODUTOS.map((p) => (
            <button
              key={p.chave}
              onClick={() => setChave(p.chave)}
              className={`text-left rounded-[16px] border p-3.5 transition-all ${
                chave === p.chave
                  ? "border-[#34C46A] bg-[rgba(52,196,106,.04)]"
                  : "border-[#1E222B] hover:border-[#39414F]"
              }`}
            >
              <span className="block text-[14px] font-medium text-[#F4F5F7]">{p.nome}</span>
              <span className="block mt-0.5 text-[11px] leading-snug text-[#7A828F]">{p.promessa}</span>
              <span className="block mt-2 text-[12px] tabular-nums text-[#9AA2AF]">
                {brl(p.mensalidadeCentavos / 100)}
                <span className="text-[#39414F]">/mês</span>
              </span>
            </button>
          ))}
        </div>
        <label
          className={`mt-3.5 flex items-center gap-2.5 ${captacaoPermitida ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#34C46A]"
            checked={comCaptacao && captacaoPermitida}
            disabled={!captacaoPermitida}
            onChange={(e) => setComCaptacao(e.target.checked)}
          />
          <span className="text-sm text-[#C9CFD8]">
            add-on Captação
            <span className="ml-1.5 text-[11px] text-[#7A828F]">
              {captacaoPermitida
                ? "acrescenta o agente de captação (muda o CMV)"
                : "indisponível sobre Recepção — não há carteira para captar"}
            </span>
          </span>
        </label>

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {ativos.map((a) => (
            <Badge key={a} tone={perfis[a].modelo === "sonnet" ? "blue" : "slate"}>
              {perfis[a].rotulo} · {perfis[a].modelo}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Resultado */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard label="Receita/mês" value={brl(receita)} hint={`${produto.nome}`} />
        <StatCard label="CMV de IA" value={brl(cons.brlIa)} hint={`${cons.conversas.toLocaleString("pt-BR")} conversas`} />
        <StatCard
          label="Margem"
          value={brl(margem.margemBrl)}
          hint={margem.margemPct == null ? "—" : `${margem.margemPct.toFixed(0)}%`}
          tone={tomMargem}
        />
        <StatCard
          label="Custo por conversa"
          value={brl(margem.custoMarginalBrl)}
          hint={margem.folgaConversas != null ? `folga de ${margem.folgaConversas.toLocaleString("pt-BR")} conversas` : "—"}
        />
      </div>

      {margem.margemPct != null && margem.margemPct < 45 && (
        <Card className="!border-[#4A2028] !bg-[#1F1215]">
          <p className="label-caps m-0 mb-2 !text-[9px] text-[#B91C1C]">margem apertada</p>
          <p className="m-0 text-sm leading-relaxed text-[#FFA5B6]">
            {margem.margemPct < 0
              ? "Este cliente dá prejuízo nesta configuração."
              : `Margem de ${margem.margemPct.toFixed(0)}% não cobre suporte, vendas e inadimplência.`}{" "}
            Caminhos: subir a mensalidade, mover Recepção e Administração para Haiku, ou reduzir a
            cota incluída e cobrar excedente a partir dela.
          </p>
        </Card>
      )}

      {/* Medidores de cobrança */}
      <Card>
        <p className="label-caps m-0 mb-4 !text-[9px] text-[#7A828F]">medidores de cobrança</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Slider
            label="Contratos ativos"
            valor={contratos}
            min={0}
            max={800}
            passo={10}
            onChange={setContratos}
          />
          <Slider label="Leads atendidos/mês" valor={leads} min={0} max={1200} passo={10} onChange={setLeads} />
          <Slider label="Infra rateada" valor={infra} min={0} max={200} passo={5} sufixo=" R$" onChange={setInfra} />
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
          <div>
            <span className="block text-[#7A828F]">Mensalidade</span>
            <span className="tabular-nums text-[#F4F5F7]">{brl(produto.mensalidadeCentavos / 100)}</span>
          </div>
          <div>
            <span className="block text-[#7A828F]">Por contrato</span>
            <span className="tabular-nums text-[#F4F5F7]">
              {produto.porContratoAtivoCentavos
                ? `${brl((produto.porContratoAtivoCentavos * contratos) / 100)}`
                : "—"}
            </span>
          </div>
          <div>
            <span className="block text-[#7A828F]">Por lead</span>
            <span className="tabular-nums text-[#F4F5F7]">
              {produto.porLeadAtendidoCentavos
                ? `${brl((produto.porLeadAtendidoCentavos * leads) / 100)}`
                : "—"}
            </span>
          </div>
          <div>
            <span className="block text-[#7A828F]">Setup (uma vez)</span>
            <span className="tabular-nums text-[#F4F5F7]">{brl(produto.setupCentavos / 100)}</span>
          </div>
        </div>
      </Card>

      {/* Volume por agente */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="label-caps m-0 !text-[9px] text-[#7A828F]">volume de conversas por agente</p>
          <button
            onClick={() => setAvancado((v) => !v)}
            className="text-[12px] text-[#34C46A] hover:underline"
          >
            {avancado ? "ocultar" : "ajuste fino"}
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
          {ativos.map((a) => (
            <div key={a} className="min-w-0">
              <Slider
                label={perfis[a].rotulo}
                valor={cenario.volume[a] ?? 0}
                min={0}
                max={a === "RECEPCAO" ? 2000 : 800}
                passo={5}
                onChange={(v) => setVolume(a, v)}
              />
              {avancado && (
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className="text-[#7A828F]">modelo</span>
                  {(["haiku", "sonnet"] as Modelo[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setModelo(a, m)}
                      className={`rounded-full px-2 py-0.5 transition-colors ${
                        perfis[a].modelo === m
                          ? "bg-[#F4F5F7] text-white"
                          : "bg-[#171B22] text-[#9AA2AF] hover:bg-[#1E222B]"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                  <span className="ml-auto tabular-nums text-[#7A828F]">
                    {perfis[a].turnosPorConversa} turnos · {perfis[a].toolCallsPorTurno} tools/turno
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Cache */}
      <Card>
        <p className="label-caps m-0 mb-4 !text-[9px] text-[#7A828F]">prompt caching</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-end">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={cenario.cachingAtivo}
              onChange={(e) => setCenario((c) => ({ ...c, cachingAtivo: e.target.checked }))}
              className="accent-[#34C46A] w-4 h-4"
            />
            <span className="text-sm text-[#C9CFD8]">Caching ativo</span>
          </label>
          <Slider
            label="Taxa de acerto do cache"
            valor={Math.round(cenario.taxaAcertoCache * 100)}
            min={0}
            max={100}
            sufixo="%"
            onChange={(v) => setCenario((c) => ({ ...c, taxaAcertoCache: v / 100 }))}
          />
          <Slider
            label="Câmbio USD"
            valor={cenario.usdBrl}
            min={4}
            max={8}
            passo={0.05}
            onChange={(v) => setCenario((c) => ({ ...c, usdBrl: v }))}
          />
        </div>
        <div className="mt-4 rounded-[14px] bg-[#14171D] px-4 py-3 text-[13px] leading-relaxed text-[#C9CFD8]">
          Sem caching, este cenário custaria <strong className="tabular-nums">{brl(semCache.brlIa)}</strong> —{" "}
          <strong className="tabular-nums">
            {cons.brlIa > 0 ? `${(((semCache.brlIa - cons.brlIa) / semCache.brlIa) * 100).toFixed(0)}%` : "—"}
          </strong>{" "}
          a mais. A margem cairia de {margem.margemPct?.toFixed(0)}% para{" "}
          {receita > 0 ? (((receita - semCache.brlIa - infra) / receita) * 100).toFixed(0) : "—"}%.
        </div>
      </Card>

      {/* Detalhe por agente */}
      <Card>
        <p className="label-caps m-0 mb-3 !text-[9px] text-[#7A828F]">custo por agente</p>
        <Table head={["Agente", "Modelo", "Conversas", "Chamadas de API", "Por conversa", "CMV", "% do total"]}>
          {cons.linhas.map((l) => (
            <tr key={l.agente}>
              <td className="font-medium text-[#F4F5F7]">{l.rotulo}</td>
              <td>
                <Badge tone={l.modelo === "sonnet" ? "blue" : "slate"}>{l.modelo}</Badge>
              </td>
              <td className="tabular-nums">{l.conversas.toLocaleString("pt-BR")}</td>
              <td className="tabular-nums text-[#9AA2AF]">{Math.round(l.chamadas).toLocaleString("pt-BR")}</td>
              <td className="tabular-nums">{brl(l.brlPorConversa)}</td>
              <td className="tabular-nums font-medium">{brl(l.brlIa)}</td>
              <td className="tabular-nums text-[#9AA2AF]">
                {cons.brlIa > 0 ? `${((l.brlIa / cons.brlIa) * 100).toFixed(0)}%` : "—"}
              </td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 mb-0 text-[12px] leading-relaxed text-[#7A828F]">
          Voz (ElevenLabs) neste cenário: {brl(cons.brlVoz)}/mês. Não entra no seu CMV enquanto a chave for
          por imobiliária — mas é o que o cliente paga, e serve de argumento quando ele reclamar do preço.
        </p>
      </Card>

      {/* Sensibilidade */}
      <Card>
        <p className="label-caps m-0 mb-3 !text-[9px] text-[#7A828F]">
          sensibilidade · e se o volume mudar
        </p>
        <Table head={["Volume", "Conversas", "CMV", "Margem", "%"]}>
          {curva.map((c) => (
            <tr key={c.multiplicador} className={c.multiplicador === 1 ? "bg-[#14171D]" : ""}>
              <td className="font-medium text-[#F4F5F7]">
                {c.multiplicador === 1 ? "atual" : `${c.multiplicador}×`}
              </td>
              <td className="tabular-nums">{c.conversas.toLocaleString("pt-BR")}</td>
              <td className="tabular-nums">{brl(c.cmvIaBrl)}</td>
              <td
                className="tabular-nums font-medium"
                style={{ color: c.margemBrl < 0 ? "#DC2626" : "#34C46A" }}
              >
                {brl(c.margemBrl)}
              </td>
              <td className="tabular-nums" style={{ color: c.margemBrl < 0 ? "#DC2626" : "#9AA2AF" }}>
                {c.margemPct?.toFixed(0)}%
              </td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 mb-0 text-[12px] leading-relaxed text-[#7A828F]">
          A linha onde a margem fica vermelha é o ponto em que a cota do plano precisa cortar e o
          excedente começar a ser cobrado. Esse é o número que define <code>cotaIaCentavos</code> em{" "}
          <code>lib/planos.ts</code>.
        </p>
      </Card>

      {medido && medido.length > 0 && (
        <Card>
          <p className="label-caps m-0 mb-3 !text-[9px] text-[#7A828F]">
            medido × simulado · últimos 30 dias
          </p>
          <Table head={["Agente", "Conversas reais", "Custo real/conversa", "Simulado", "Desvio"]}>
            {medido.map((m) => {
              const sim = cons.linhas.find((l) => l.agente === m.agente);
              const desvio = sim && sim.brlPorConversa > 0
                ? ((m.brlPorConversa - sim.brlPorConversa) / sim.brlPorConversa) * 100
                : null;
              return (
                <tr key={m.agente}>
                  <td className="font-medium text-[#F4F5F7]">{m.agente}</td>
                  <td className="tabular-nums">{m.conversas.toLocaleString("pt-BR")}</td>
                  <td className="tabular-nums">{brl(m.brlPorConversa)}</td>
                  <td className="tabular-nums text-[#9AA2AF]">
                    {sim ? brl(sim.brlPorConversa) : "—"}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ color: desvio != null && Math.abs(desvio) > 25 ? "#DC2626" : "#9AA2AF" }}
                  >
                    {desvio != null ? `${desvio > 0 ? "+" : ""}${desvio.toFixed(0)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </Table>
          <p className="mt-3 mb-0 text-[12px] leading-relaxed text-[#7A828F]">
            Desvio acima de 25% significa que os parâmetros em <code>PERFIS_PADRAO</code> estão
            desatualizados. Calibre com o número real — a partir daí o simulador vira previsão.
          </p>
        </Card>
      )}
    </div>
  );
}
