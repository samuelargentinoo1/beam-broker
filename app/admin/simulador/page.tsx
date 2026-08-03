import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Card, Badge, inputClass, SubmitButton } from "@/components/ui";
import { prisma } from "@/lib/db";
import { exigirOperador } from "@/lib/operador";
import { agentesAtivos } from "@/lib/planos";
import {
  enviarComoCliente,
  historicoSimulacao,
  reiniciarSimulacao,
} from "@/lib/simulador";
import type { AgenteIA } from "@prisma/client";

export const dynamic = "force-dynamic";

const ROTULO: Record<string, string> = {
  RECEPCAO: "Recepção",
  VENDAS: "Vendas (locação)",
  COMPRA_VENDA: "Compra e venda",
  ADMINISTRACAO: "Administração",
  CAPTACAO: "Captação",
  AJUDA_CORRETOR: "Ajuda Corretor",
};

export default async function SimuladorPage({
  searchParams,
}: {
  searchParams: Promise<{ imob?: string; agente?: string; erro?: string }>;
}) {
  await exigirOperador();
  const { imob, agente: agenteParam, erro } = await searchParams;

  const imobiliarias = await prisma.imobiliaria.findMany({
    orderBy: { id: "asc" },
    select: { id: true, nome: true, modulos: true, addons: true },
  });
  if (imobiliarias.length === 0) {
    return (
      <>
        <PageHeader kicker="operação" title="Simulador de IA" />
        <Card>
          <p className="m-0 text-sm text-[#9AA2AF]">
            Nenhuma imobiliária cadastrada ainda. Crie um cliente para simular o atendimento dele.
          </p>
        </Card>
      </>
    );
  }

  const imobiliaria = imobiliarias.find((i) => i.id === Number(imob)) ?? imobiliarias[0]!;
  const ativos = agentesAtivos(imobiliaria.modulos, imobiliaria.addons);
  const agente = (ativos.includes(agenteParam as (typeof ativos)[number])
    ? agenteParam
    : ativos[0]) as AgenteIA;

  const { mensagens, agenteAtual } = await historicoSimulacao(imobiliaria.id, agente);

  async function acaoEnviar(formData: FormData) {
    "use server";
    const r = await enviarComoCliente(formData);
    const base = `/admin/simulador?imob=${formData.get("imobiliariaId")}&agente=${formData.get("agente")}`;
    redirect(r.erro ? `${base}&erro=${encodeURIComponent(r.erro)}` : base);
  }
  async function acaoReiniciar(formData: FormData) {
    "use server";
    await reiniciarSimulacao(formData);
    redirect(`/admin/simulador?imob=${formData.get("imobiliariaId")}&agente=${formData.get("agente")}`);
  }

  return (
    <>
      <PageHeader
        kicker="operação"
        title="Simulador de IA"
        subtitle="Você é o cliente; a IA segue o curso normal — mesmo prompt, mesmas ferramentas, mesmo modelo."
        breadcrumb={[{ label: "Painel do dono", href: "/admin" }, { label: "Simulador" }]}
      />

      <Card className="mb-5 !border-[#BBF7D0] !bg-[#F0FDF4]">
        <p className="m-0 text-[13px] leading-relaxed text-[#8CF0B0]">
          <strong className="font-medium">Nenhuma mensagem sai daqui.</strong> Todo envio de
          WhatsApp (texto, foto e áudio) fica bloqueado durante a simulação — o que a IA <em>teria</em>{" "}
          mandado aparece na conversa, marcado. As ferramentas de leitura e escrita no banco rodam
          normalmente, então escolha a imobiliária com isso em mente.
        </p>
      </Card>

      {/* Escolha do cenário */}
      <Card className="mb-5">
        <p className="label-caps m-0 mb-3 !text-[9px] text-[#7A828F]">cenário</p>
        <div className="flex flex-wrap gap-2.5">
          {imobiliarias.map((i) => (
            <Link
              key={i.id}
              href={`/admin/simulador?imob=${i.id}`}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
                i.id === imobiliaria.id
                  ? "border-[#34C46A] bg-[rgba(52,196,106,.06)] !text-[#8CF0B0]"
                  : "border-[#1E222B] !text-[#9AA2AF] hover:border-[#39414F]"
              }`}
            >
              {i.nome}
            </Link>
          ))}
        </div>

        <p className="label-caps m-0 mb-2 mt-4 !text-[9px] text-[#7A828F]">
          agentes deste plano · módulos [{imobiliaria.modulos.join(", ") || "nenhum"}]
          {imobiliaria.addons.length > 0 && ` · add-on ${imobiliaria.addons.join(", ")}`}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {ativos.map((a) => (
            <Link
              key={a}
              href={`/admin/simulador?imob=${imobiliaria.id}&agente=${a}`}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
                a === agente
                  ? "border-[#F4F5F7] bg-[#F4F5F7] !text-white"
                  : "border-[#1E222B] !text-[#9AA2AF] hover:border-[#39414F]"
              }`}
            >
              {ROTULO[a] ?? a}
            </Link>
          ))}
        </div>
        <p className="mt-3 mb-0 text-[12px] text-[#7A828F]">
          Só aparecem os agentes que o plano desta imobiliária contratou — é exatamente o que o
          cliente final encontra.
        </p>
      </Card>

      {erro && (
        <Card className="mb-5 !border-[#4A2028] !bg-[#1F1215]">
          <p className="m-0 text-sm text-[#FFA5B6]">{erro}</p>
        </Card>
      )}

      {/* Conversa */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="label-caps m-0 !text-[9px] text-[#7A828F]">
            conversa · {ROTULO[agente] ?? agente}
            {agenteAtual !== agente && (
              <span className="ml-2 normal-case tracking-normal text-[#F5B23D]">
                a IA direcionou para {ROTULO[agenteAtual] ?? agenteAtual}
              </span>
            )}
          </p>
          <form action={acaoReiniciar}>
            <input type="hidden" name="imobiliariaId" value={imobiliaria.id} />
            <input type="hidden" name="agente" value={agente} />
            <SubmitButton>Reiniciar conversa</SubmitButton>
          </form>
        </div>

        <div className="mb-4 flex max-h-[460px] flex-col gap-2.5 overflow-y-auto rounded-[14px] bg-[#14171D] p-4">
          {mensagens.length === 0 && (
            <p className="m-0 py-8 text-center text-[13px] text-[#7A828F]">
              Mande a primeira mensagem como se fosse o cliente.
            </p>
          )}
          {mensagens.map((m, i) => {
            const daIA = m.autor === "IA";
            return (
              <div key={i} className={`flex ${daIA ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[78%] whitespace-pre-wrap rounded-[14px] px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                    daIA
                      ? "bg-[#12141A] text-[#F4F5F7] shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                      : "bg-[#34C46A] text-[#06210F]"
                  }`}
                >
                  {m.texto}
                  <span
                    className={`mt-1 block text-[10px] ${daIA ? "text-[#7A828F]" : "text-[rgba(255,255,255,.7)]"}`}
                  >
                    {daIA ? "IA" : "você (cliente)"} ·{" "}
                    {m.em.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <form action={acaoEnviar} className="flex items-end gap-2">
          <input type="hidden" name="imobiliariaId" value={imobiliaria.id} />
          <input type="hidden" name="agente" value={agente} />
          <input
            name="mensagem"
            required
            autoComplete="off"
            className={`${inputClass} flex-1`}
            placeholder="Escreva como o cliente escreveria…"
          />
          <SubmitButton>Enviar</SubmitButton>
        </form>
      </Card>

      <p className="mt-4 text-[12px] leading-relaxed text-[#7A828F]">
        Esta conversa fica marcada como simulação: não aparece no painel de atendimento da
        imobiliária nem entra nas métricas de operação dela. O consumo de IA, porém, é real e entra
        no CMV — <Link href={`/admin/clientes/${imobiliaria.id}`} className="text-[#34C46A]">veja na ficha do cliente</Link>.
      </p>
    </>
  );
}
