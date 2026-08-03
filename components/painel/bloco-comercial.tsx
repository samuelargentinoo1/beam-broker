// Bloco COMERCIAL — só renderiza (e só consulta) para quem tem o módulo.

import { prisma } from "@/lib/db";
import { Kpi } from "@/components/painel/pecas";

export default async function BlocoComercial({ imobiliariaId }: { imobiliariaId: number }) {
  const agora = new Date();
  const semanaAtras = new Date(agora.getTime() - 7 * 86_400_000);
  const ontem = new Date(agora.getTime() - 24 * 3_600_000);
  const em7dias = new Date(agora.getTime() + 7 * 86_400_000);

  const [novosNaSemana, semResposta, visitasProximas, totalSemana, comVisitaSemana] =
    await Promise.all([
      prisma.lead.count({ where: { imobiliariaId, criadoEm: { gte: semanaAtras } } }),
      // Lead ainda em "NOVO" e parado há mais de 24h: é o que esfria.
      prisma.lead.count({
        where: { imobiliariaId, status: "NOVO", criadoEm: { lt: ontem } },
      }),
      prisma.lead.count({
        where: { imobiliariaId, visitaEm: { gte: agora, lte: em7dias } },
      }),
      prisma.lead.count({ where: { imobiliariaId, criadoEm: { gte: semanaAtras } } }),
      prisma.lead.count({
        where: { imobiliariaId, criadoEm: { gte: semanaAtras }, visitaEm: { not: null } },
      }),
    ]);

  const conversao = totalSemana > 0 ? (comVisitaSemana / totalSemana) * 100 : 0;

  return (
    <div className="carta sobe mb-4 overflow-hidden" style={{ animationDelay: "0.12s" }}>
      <div className="px-[22px] pt-4">
        <p className="label-caps m-0 !text-[9px] tracking-[.12em] text-[#8CF0B0]">comercial</p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        <Kpi label="Leads novos na semana" valor={String(novosNaSemana)} hint="últimos 7 dias" />
        <Kpi
          label="Sem resposta há +24h"
          valor={String(semResposta)}
          hint={semResposta > 0 ? "esfriando — priorize hoje" : "nenhum parado"}
          hintCor={semResposta > 0 ? "#F5B23D" : "#7A828F"}
        />
        <Kpi label="Visitas nos próximos 7 dias" valor={String(visitasProximas)} hint="agenda confirmada" />
        <Kpi
          label="Conversão lead → visita"
          valor={`${conversao.toFixed(0)}%`}
          hint={`${comVisitaSemana} de ${totalSemana} na semana`}
          gauge={{ percent: conversao, cor: "#34C46A" }}
        />
      </div>
    </div>
  );
}
