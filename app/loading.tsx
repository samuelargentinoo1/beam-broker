// Skeleton mostrado INSTANTANEAMENTE ao trocar de aba, enquanto o servidor
// renderiza a página. Com o prefetch dos links, a navegação passa a parecer
// imediata (some a sensação de "travou") mesmo nas páginas dinâmicas.
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* cabeçalho */}
      <div className="mb-6">
        <div className="h-3 w-24 rounded bg-[#1E222B]" />
        <div className="mt-3 h-7 w-64 rounded-lg bg-[#1E222B]" />
        <div className="mt-2 h-3 w-80 max-w-full rounded bg-[#1A1E26]" />
      </div>

      {/* faixa de indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-[22px] border border-[#1E222B] bg-[#12141A]" />
        ))}
      </div>

      {/* bloco de conteúdo */}
      <div className="rounded-[22px] border border-[#1E222B] bg-[#12141A] p-5">
        <div className="h-4 w-40 rounded bg-[#1E222B]" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-[#171B22]" />
          ))}
        </div>
      </div>
    </div>
  );
}
