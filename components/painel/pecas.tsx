// Peças visuais compartilhadas pelos blocos do painel. Ficavam dentro de
// app/page.tsx; saíram junto com a divisão em blocos por módulo.

export const CIRCUNFERENCIA = 163.4; // 2πr com r=26

export function Kpi({
  label,
  valor,
  hint,
  hintCor = "#7A828F",
  gauge,
}: {
  label: string;
  valor: string;
  hint: string;
  hintCor?: string;
  gauge?: { percent: number; cor: string };
}) {
  const CIRC = 163.4; // 2πr com r=26
  return (
    <div className="px-[22px] py-[18px] border-l border-[#1E222B] min-w-0">
      <p className="label-caps m-0 !text-[9px] tracking-[.12em] text-[#9AA2AF]">{label}</p>
      <div className="flex items-center justify-between gap-3 mt-2">
        <p
          className="font-data m-0 font-semibold whitespace-nowrap text-[#F4F5F7]"
          style={{ fontSize: "clamp(19px,1.9vw,25px)" }}
          data-cu
        >
          {valor}
        </p>
        {gauge && (
          <svg width="46" height="46" viewBox="0 0 60 60" className="shrink-0">
            <circle cx="30" cy="30" r="26" fill="none" stroke="#1E222B" strokeWidth="6" />
            <circle
              cx="30"
              cy="30"
              r="26"
              fill="none"
              stroke={gauge.cor}
              strokeWidth="6"
              strokeLinecap="round"
              transform="rotate(-90 30 30)"
              style={{
                strokeDasharray: CIRC,
                strokeDashoffset: CIRC * (1 - Math.min(100, Math.max(0, gauge.percent)) / 100),
                animation: "gauge 1.4s .4s ease-out both",
              }}
            />
          </svg>
        )}
      </div>
      <p className="m-0 mt-1.5 text-[11.5px]" style={{ color: hintCor }}>
        {hint}
      </p>
    </div>
  );
}

// Card de métrica mensal com sparkline decorativa
export function Metrica({
  label,
  valor,
  hint,
  hintCor,
  destaque = false,
  plano = false,
  atraso,
}: {
  label: string;
  valor: string;
  hint: string;
  hintCor: string;
  destaque?: boolean;
  plano?: boolean;
  atraso: string;
}) {
  const pontos = plano
    ? "0,15 15,15 30,15 45,15 60,15 75,15 90,15 105,15 120,15"
    : "0,26 15,24 30,25 45,20 60,21 75,14 90,15 105,8 120,6";
  return (
    <div
      className="carta sobe p-5"
      style={{
        animationDelay: atraso,
        ...(destaque
          ? {
              background: "linear-gradient(180deg, rgba(52,196,106,.05), #fff 55%)",
              borderColor: "rgba(52,196,106,.25)",
            }
          : {}),
      }}
    >
      <p className="label-caps m-0 mb-2 !text-[9px] tracking-[.12em] text-[#9AA2AF]">{label}</p>
      <p
        className={`font-data m-0 text-[27px] font-[460] whitespace-nowrap ${destaque ? "text-[#8CF0B0]" : "text-[#F4F5F7]"}`}
        data-cu
      >
        {valor}
      </p>
      <p className="m-0 mt-[5px] text-[11.5px]" style={{ color: hintCor }}>
        {hint}
      </p>
      <svg
        viewBox="0 0 120 30"
        preserveAspectRatio="none"
        className="block w-full h-7 overflow-visible mt-3"
      >
        <polyline
          points={pontos}
          fill="none"
          stroke={plano ? "#CBD5E1" : "#34C46A"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ strokeDasharray: 260, strokeDashoffset: 260, animation: "dash 1.4s .4s ease-out both" }}
        />
      </svg>
    </div>
  );
}
