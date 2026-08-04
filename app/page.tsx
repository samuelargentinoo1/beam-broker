import { Suspense } from "react";
import { SEM_BANCO } from "@/lib/sem-banco";
import { redirect as _redirDemo } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { statusAtivacao } from "@/lib/ativacao";
import { temModulo } from "@/lib/planos";
import { PageHeader } from "@/components/ui";
import { ChecklistAtivacao } from "@/components/checklist-ativacao";
import BlocoBase from "@/components/painel/bloco-base";
import BlocoComercial from "@/components/painel/bloco-comercial";

export const dynamic = "force-dynamic";

async function dispensarChecklist() {
  "use server";
  const { imobiliaria } = await exigirSessao();
  await prisma.imobiliaria.update({
    where: { id: imobiliaria.id },
    data: { onboardingDispensado: true },
  });
  revalidatePath("/");
}

// Esqueleto enquanto um bloco carrega. Com Suspense por bloco, o BASE aparece
// sem esperar o COMERCIAL terminar as consultas pesadas.
function Esqueleto() {
  return <div className="carta mb-4 h-[104px] animate-pulse bg-[#14171D]" aria-hidden />;
}

// O painel só DECIDE quais blocos renderizar; cada bloco faz as PRÓPRIAS
// consultas. É isso que impede um cliente de Recepção de pagar a latência dos
// leads que ele nem vê.
export default async function DashboardPage() {
  // Vitrine sem banco: esta tela lê o Postgres. Manda para a fila do dia.
  if (SEM_BANCO) _redirDemo("/meu-dia");

  const { imobiliaria } = await exigirSessao();
  const comComercial = temModulo(imobiliaria.modulos, "COMERCIAL");

  const ativacao = await statusAtivacao(imobiliaria);
  const mostrarChecklist = !ativacao.completo && !ativacao.dispensado;

  const acoesRapidas = [
    ...(comComercial
      ? [{ href: "/meu-dia", glifo: "◉", cor: "#8CF0B0", fundo: "rgba(52,196,106,.08)", label: "Abrir a fila do dia" }]
      : []),
    { href: "/conversas", glifo: "✆", cor: "#5B8DFF", fundo: "rgba(91,141,255,.08)", label: "Abrir as conversas" },
  ];

  return (
    <div>
      <PageHeader
        kicker="Visão geral"
        title="Dashboard da administradora"
        subtitle="Visão real da operação — atendimento, carteira e cobrança"
        action={
          <span className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 bg-[rgba(52,196,106,.07)] border border-[rgba(52,196,106,.18)]">
            <span className="pulse-dot h-[7px] w-[7px] rounded-full bg-[#34C46A]" />
            <span className="label-caps !text-[8px] tracking-[.12em] text-[#8CF0B0]">
              sistema operando
            </span>
          </span>
        }
      />

      {mostrarChecklist && (
        <ChecklistAtivacao ativacao={ativacao} onDispensar={dispensarChecklist} />
      )}

      {/* Ordem: BASE, depois COMERCIAL. Cada Suspense isola o seu bloco — um
          bloco lento não segura os outros. */}
      <Suspense fallback={<Esqueleto />}>
        <BlocoBase imobiliariaId={imobiliaria.id} />
      </Suspense>

      {comComercial && (
        <Suspense fallback={<Esqueleto />}>
          <BlocoComercial imobiliariaId={imobiliaria.id} />
        </Suspense>
      )}

      <div className="carta sobe p-[22px]" style={{ animationDelay: "0.24s" }} data-tour="acoes-rapidas">
        <p className="label-caps m-0 mb-3 !text-[9px] tracking-[.12em] text-[#9AA2AF]">
          próximos passos
        </p>
        <ul
          className="m-0 grid list-none gap-2 p-0"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}
        >
          {acoesRapidas.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="flex items-center gap-3 rounded-2xl border border-[#1E222B] px-3.5 py-[11px] !text-[#C9CFD8] transition-colors hover:border-[rgba(52,196,106,.4)] hover:bg-[#07080B] hover:!text-[#F4F5F7]"
              >
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px]"
                  style={{ background: a.fundo, color: a.cor }}
                >
                  {a.glifo}
                </span>
                <span className="text-[13.5px]">{a.label}</span>
                <span className="ml-auto text-[#7A828F]">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
