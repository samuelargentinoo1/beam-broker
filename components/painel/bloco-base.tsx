// Bloco BASE do painel — aparece para todo cliente, em qualquer produto.
// Faz as PRÓPRIAS consultas: quem não tem o módulo não paga a latência da
// query que não vai ver.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { resumoDemandaNaoAtendida } from "@/lib/demanda";
import { Kpi } from "@/components/painel/pecas";

export default async function BlocoBase({ imobiliariaId }: { imobiliariaId: number }) {
  const agora = new Date();
  const inicioDia = new Date(agora);
  inicioDia.setHours(0, 0, 0, 0);
  const inicioSemana = new Date(agora.getTime() - 7 * 86_400_000);
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  const [hoje, semana, imoveis, demandas, amostraResposta] = await Promise.all([
    prisma.conversa.count({ where: { imobiliariaId, simulacao: false, atualizadaEm: { gte: inicioDia } } }),
    prisma.conversa.count({ where: { imobiliariaId, simulacao: false, atualizadaEm: { gte: inicioSemana } } }),
    prisma.imovel.count({ where: { imobiliariaId, status: { not: "INATIVO" } } }),
    resumoDemandaNaoAtendida(imobiliariaId, inicioMes),
    // Tempo até a 1ª resposta da IA: pega as conversas recentes e mede a
    // distância entre a 1ª mensagem do cliente e a 1ª resposta da IA.
    prisma.conversa.findMany({
      where: { imobiliariaId, simulacao: false, criadaEm: { gte: inicioSemana } },
      select: {
        mensagens: {
          orderBy: { criadaEm: "asc" },
          take: 6,
          select: { autor: true, criadaEm: true },
        },
      },
      take: 100,
    }),
  ]);

  const tempos: number[] = [];
  for (const c of amostraResposta) {
    const primeiraCliente = c.mensagens.find((m) => m.autor === "CLIENTE");
    if (!primeiraCliente) continue;
    const primeiraIA = c.mensagens.find(
      (m) => m.autor === "IA" && m.criadaEm >= primeiraCliente.criadaEm
    );
    if (primeiraIA) tempos.push(primeiraIA.criadaEm.getTime() - primeiraCliente.criadaEm.getTime());
  }
  const medioMs = tempos.length ? tempos.reduce((s, t) => s + t, 0) / tempos.length : null;
  const tempoMedio =
    medioMs == null
      ? "—"
      : medioMs < 60_000
        ? `${Math.round(medioMs / 1000)}s`
        : `${Math.round(medioMs / 60_000)}min`;

  return (
    <>
      {demandas.total > 0 && (
        <div className="sobe mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[14px] border border-[#1E222B] bg-[#12141A] px-4 py-3">
          <span className="text-[13px] text-[#C9CFD8]">
            <strong className="font-medium text-[#F4F5F7]">{demandas.total}</strong>{" "}
            {demandas.total === 1 ? "pessoa procurou" : "pessoas procuraram"} sobre {demandas.assunto}{" "}
            este mês
            {demandas.foraDoHorario > 0 && <> — {demandas.foraDoHorario} fora do horário comercial</>}. A
            IA encaminhou para a equipe.
          </span>
          <Link href="/conversas" className="text-[12px] text-[#34C46A] hover:underline">
            ver detalhes
          </Link>
        </div>
      )}

      <div className="carta sobe mb-4 overflow-hidden" style={{ animationDelay: "0.08s" }} data-tour="kpis">
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          <Kpi label="Atendimentos hoje" valor={String(hoje)} hint={`${semana} nos últimos 7 dias`} />
          <Kpi
            label="1ª resposta da IA"
            valor={tempoMedio}
            hint={tempos.length ? `média de ${tempos.length} conversas` : "sem conversas na semana"}
          />
          <Kpi label="Imóveis na carteira" valor={String(imoveis)} hint="ativos no cadastro" />
        </div>
      </div>
    </>
  );
}
