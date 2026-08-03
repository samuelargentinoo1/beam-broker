import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_OPERADOR } from "@/lib/operador-auth";
import { getOperador } from "@/lib/operador";

// Shell do painel do dono. NÃO usa components/chrome.tsx: nenhum item do produto
// (imóveis, faturas, contratos) aparece aqui. Se o dono precisa ver a tela do
// cliente, isso é a função "entrar como" (auditada e temporária), não o dock.
const NAV = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/clientes/novo", label: "Novo cliente" },
  { href: "/admin/simulador", label: "Simulador de IA" },
  { href: "/admin/calculadora", label: "Calculadora" },
  { href: "/admin/acessos", label: "Acessos" },
];

async function sairOperador() {
  "use server";
  (await cookies()).delete(COOKIE_OPERADOR);
  redirect("/admin/entrar");
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // A tela de entrada é filha deste layout, mas não pode exigir sessão.
  const operador = await getOperador();

  return (
    <div className="min-h-screen bg-[#07080B] text-[#F4F5F7]">
      {operador && (
        <header className="sticky top-0 z-50 border-b border-[#1E222B] bg-[#12141A]/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1200px] items-center gap-5 px-7 py-3">
            <span className="label-caps !text-[9px] tracking-[.18em] text-[#8CF0B0]">
              operação · dono
            </span>
            <nav className="flex items-center gap-4">
              {NAV.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="text-[13px] !text-[#C9CFD8] hover:!text-[#8CF0B0] transition-colors"
                >
                  {i.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[11.5px] text-[#7A828F]">{operador.email}</span>
              <form action={sairOperador}>
                <button
                  type="submit"
                  className="rounded-lg border border-[#1E222B] px-2.5 py-1 text-[12px] text-[#9AA2AF] hover:bg-[#07080B] cursor-pointer"
                >
                  Sair
                </button>
              </form>
            </div>
          </div>
        </header>
      )}
      <main className="mx-auto box-border max-w-[1200px] px-7 py-8">{children}</main>
    </div>
  );
}
