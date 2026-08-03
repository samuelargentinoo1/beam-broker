import Link from "next/link";
import type { Ativacao } from "@/lib/ativacao";

// Card de primeiros passos. `onDispensar` (server action) só é passado no
// Dashboard — em Configurações o checklist fica sempre visível, sem dispensar.
export function ChecklistAtivacao({
  ativacao,
  onDispensar,
}: {
  ativacao: Ativacao;
  onDispensar?: () => Promise<void>;
}) {
  const { passos, concluidos, total } = ativacao;
  const pct = Math.round((concluidos / total) * 100);

  return (
    <div className="carta sobe p-6 mb-6" style={{ animationDelay: "0.04s" }}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="label-caps m-0 mb-1 !text-[9px] tracking-[.14em] text-[#34C46A]">
            Primeiros passos
          </p>
          <h2 className="m-0 text-[17px] font-semibold text-[#F4F5F7]">
            Ative sua imobiliária em 7 passos
          </h2>
          <p className="m-0 mt-1 text-[13px] text-[#9AA2AF]">
            Do zero ao primeiro ciclo completo: imóvel → contrato → fatura → repasse.
          </p>
        </div>
        {onDispensar && (
          <form action={onDispensar}>
            <button
              type="submit"
              className="text-[12px] text-[#7A828F] hover:text-[#9AA2AF] whitespace-nowrap cursor-pointer"
            >
              Dispensar
            </button>
          </form>
        )}
      </div>

      {/* Barra de progresso */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-2 rounded-full bg-[#1E222B] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#34C46A] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-data text-[12px] font-semibold text-[#C9CFD8] whitespace-nowrap">
          {concluidos} de {total}
        </span>
      </div>

      <div className="grid gap-2">
        {passos.map((p, i) => (
          <div
            key={p.chave}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
              p.feito ? "border-[#1E222B] bg-[#07080B]" : "border-[#1E222B] hover:border-[rgba(52,196,106,.4)]"
            }`}
          >
            <span
              aria-hidden
              className={`grid place-items-center w-6 h-6 shrink-0 rounded-full text-[12px] font-bold ${
                p.feito
                  ? "bg-[#34C46A] text-[#06210F]"
                  : "bg-[rgba(52,196,106,.08)] text-[#34C46A]"
              }`}
            >
              {p.feito ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`m-0 text-[13.5px] font-medium ${
                  p.feito ? "text-[#7A828F] line-through" : "text-[#F4F5F7]"
                }`}
              >
                {p.titulo}
              </p>
              {!p.feito && <p className="m-0 text-[12px] text-[#7A828F]">{p.descricao}</p>}
            </div>
            {!p.feito && (
              <Link
                href={p.href}
                className="shrink-0 text-[12.5px] font-[520] rounded-full bg-[#34C46A] !text-[#06210F] px-3.5 py-1.5 hover:bg-[#8CF0B0] transition-colors"
              >
                Fazer
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
