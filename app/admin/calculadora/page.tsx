import { PageHeader } from "@/components/ui";
import { exigirOperador } from "@/lib/operador";
import { custoRealPorAgente } from "@/lib/admin";
import CalculadoraCliente from "./calculadora-cliente";

export const dynamic = "force-dynamic";

export default async function CalculadoraPage() {
  await exigirOperador();
  // Alimenta a comparação medido × simulado. Se a telemetria ainda estiver
  // vazia, o componente simplesmente não mostra o bloco.
  const medido = await custoRealPorAgente(30);

  return (
    <>
      <PageHeader
        kicker="operação"
        title="Calculadora de CMV"
        subtitle="Simule o custo real de IA por cliente antes de fechar preço. Os parâmetros padrão foram medidos neste repositório — ajuste conforme a telemetria acumular."
        breadcrumb={[{ label: "Painel do dono", href: "/admin" }, { label: "Calculadora" }]}
      />
      <CalculadoraCliente medido={medido} />
    </>
  );
}
