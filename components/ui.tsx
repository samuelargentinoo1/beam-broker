import Link from "next/link";
import type { ReactNode } from "react";

// Primitivos no design "flutuante": cabeçalho centralizado com kicker,
// cards .carta (22px, hover que levanta), botões-pílula azuis, inputs 14px,
// tabelas com th em mono-caps e badges em tinta.

export type Migalha = { label: string; href?: string };

export function PageHeader({
  title,
  subtitle,
  action,
  kicker,
  breadcrumb,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  kicker?: string;
  breadcrumb?: Migalha[];
}) {
  return (
    <div
      className="sobe mb-[26px] flex flex-col items-center text-center gap-3.5"
      style={{ animationDelay: "0.06s" }}
    >
      {breadcrumb && breadcrumb.length > 0 && (
        <nav
          aria-label="Trilha de navegação"
          className="flex items-center flex-wrap justify-center gap-1.5 text-[12px] text-[#7A828F]"
        >
          {breadcrumb.map((m, i) => {
            const ultimo = i === breadcrumb.length - 1;
            return (
              <span key={i} className="flex items-center gap-1.5">
                {m.href && !ultimo ? (
                  <Link href={m.href} className="!text-[#9AA2AF] hover:!text-[#34C46A] transition-colors">
                    {m.label}
                  </Link>
                ) : (
                  <span className={ultimo ? "text-[#C9CFD8] font-medium" : ""}>{m.label}</span>
                )}
                {!ultimo && <span className="text-[#39414F]" aria-hidden>›</span>}
              </span>
            );
          })}
        </nav>
      )}
      <div>
        {kicker && (
          <p className="label-caps m-0 mb-2 !text-[9px] tracking-[.18em] text-[#7A828F]">{kicker}</p>
        )}
        <h1 className="m-0 text-4xl font-[420] leading-[1.12] tracking-[-0.035em] text-[#F4F5F7]">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-[7px] mb-0 max-w-[720px] text-sm leading-[1.55] text-[#9AA2AF]">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
  id,
  dataTour,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  dataTour?: string;
}) {
  return (
    <div id={id} data-tour={dataTour} className={`carta sobe ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "bad" | "warn";
}) {
  const tons = {
    default: "text-[#F4F5F7]",
    good: "text-[#34C46A]",
    bad: "text-[#FF5C7A]",
    warn: "text-[#F5B23D]",
  };
  const tonsHint = {
    default: "text-[#7A828F]",
    good: "text-[#34C46A]",
    bad: "text-[#FF5C7A]",
    warn: "text-[#F5B23D]",
  };
  return (
    <Card className="p-5">
      <p className="label-caps m-0 mb-2 !text-[9px] tracking-[.12em] text-[#9AA2AF]">{label}</p>
      <p
        className={`font-data m-0 text-[25px] font-semibold whitespace-nowrap ${tons[tone]}`}
        data-cu
      >
        {value}
      </p>
      {hint && <p className={`m-0 mt-1.5 text-[11.5px] ${tonsHint[tone]}`}>{hint}</p>}
    </Card>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "red" | "amber" | "blue";
}) {
  const tons = {
    slate: "bg-[#171B22] text-[#9AA2AF]",
    green: "bg-[rgba(52,196,106,.1)] text-[#34C46A]",
    red: "bg-[rgba(255,92,122,.1)] text-[#FF5C7A]",
    amber: "bg-[rgba(245,178,61,.1)] text-[#F5B23D]",
    blue: "bg-[rgba(52,196,106,.1)] text-[#8CF0B0]",
  };
  return (
    <span
      className={`label-caps inline-block rounded-full px-2.5 py-[3px] !text-[8.5px] tracking-[.08em] whitespace-nowrap ${tons[tone]}`}
    >
      {children}
    </span>
  );
}

// Botão da marca: verde Beam com texto ESCURO. Branco sobre #34C46A tem
// contraste ~2:1 e reprova em qualquer critério de acessibilidade.
const pilula =
  "inline-flex items-center justify-center gap-[7px] font-[560] cursor-pointer rounded-full text-[13.5px] px-5 py-[9px] !text-[#06210F] whitespace-nowrap transition-all bg-gradient-to-b from-[#6FE39A] to-[#34C46A] shadow-[0_0_0_1px_rgba(255,255,255,.16),0_8px_20px_-6px_rgba(52,196,106,.45),inset_0_1px_1px_rgba(255,255,255,.5)] hover:from-[#85EFAB] hover:to-[#45D479]";

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={pilula}>
      {children}
    </Link>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button type="submit" className={pilula}>
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="label-caps block mb-1.5 !text-[9px] tracking-[.1em] text-[#9AA2AF]">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass = "input-ds";

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <Card className="overflow-hidden" >
      <div className="overflow-x-auto rounded-[22px]">
        <table className="w-full border-collapse text-[13.5px] text-left">
          <thead>
            <tr className="bg-[#12141A]">
              {head.map((h) => (
                <th
                  key={h}
                  className="label-caps text-left font-semibold px-[18px] py-[11px] !text-[8.5px] tracking-[.1em] text-[#9AA2AF] whitespace-nowrap border-b border-[#1E222B]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E222B] text-[#C9CFD8] [&>tr]:transition-colors [&>tr:hover]:bg-[#07080B]">
            {children}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-[#7A828F] py-10 text-center border border-dashed border-[#2A303B] rounded-[22px] bg-[#12141A]/60">
      {children}
    </p>
  );
}

// Estado vazio que ensina a próxima ação: ícone (glifo), título, orientação e
// um botão de ação. Se a ação não estiver disponível ainda, passe `desabilitado`
// + `dica` (o botão vira aviso explicando o pré-requisito).
export function EmptyState({
  glifo = "＋",
  titulo,
  descricao,
  acaoHref,
  acaoLabel,
  desabilitado = false,
  dica,
}: {
  glifo?: string;
  titulo: string;
  descricao: string;
  acaoHref?: string;
  acaoLabel?: string;
  desabilitado?: boolean;
  dica?: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-14 px-6 border border-dashed border-[#2A303B] rounded-[22px] bg-[#12141A]/60">
      <span
        aria-hidden
        className="grid place-items-center w-14 h-14 rounded-2xl bg-[rgba(52,196,106,.08)] text-[#34C46A] text-[22px]"
      >
        {glifo}
      </span>
      <div>
        <p className="m-0 text-[15px] font-semibold text-[#F4F5F7]">{titulo}</p>
        <p className="m-0 mt-1 text-[13px] text-[#9AA2AF] max-w-[440px]">{descricao}</p>
      </div>
      {acaoHref && acaoLabel && !desabilitado && (
        <Link
          href={acaoHref}
          className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#34C46A] !text-[#06210F] text-[13.5px] font-[520] px-5 py-2.5 hover:bg-[#8CF0B0] transition-colors"
        >
          {acaoLabel}
        </Link>
      )}
      {desabilitado && dica && (
        <p className="mt-1 text-[12px] text-[#7A828F] bg-[#171B22] rounded-full px-4 py-1.5">{dica}</p>
      )}
    </div>
  );
}
