import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { temModulo } from "@/lib/planos";
import ModuloBloqueado from "@/components/modulo-bloqueado";

// Gate REAL do módulo Comercial. Ver o comentário em app/(adm)/layout.tsx.
export default async function LayoutComercial({ children }: { children: React.ReactNode }) {
  const { imobiliaria } = await exigirSessao();
  if (!temModulo(imobiliaria.modulos, "COMERCIAL")) {
    const [imoveis, leads] = await Promise.all([
      prisma.imovel.count({ where: { imobiliariaId: imobiliaria.id } }),
      prisma.lead.count({ where: { imobiliariaId: imobiliaria.id } }),
    ]);
    return (
      <ModuloBloqueado modulo="COMERCIAL" imobiliaria={imobiliaria} numeros={{ imoveis, leads }} />
    );
  }
  return <>{children}</>;
}
