import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO } from "@/lib/auth";
import { getSessao } from "@/lib/sessao";
import { prisma } from "@/lib/db";
import { BarraSuperior, Dock, type Notificacao } from "@/components/chrome";
import Onboarding from "@/components/onboarding";
import "./globals.css";

async function sair() {
  "use server";
  const jar = await cookies();
  jar.delete(COOKIE_SESSAO);
  redirect("/login");
}

export const metadata: Metadata = {
  title: "Administrativo — ERP de Locação",
  description: "ERP de administração de imóveis com atendimento por IA",
};

// Notificações do sino: pendências reais da imobiliária logada
async function carregarNotificacoes(imobiliariaId: number): Promise<Notificacao[]> {
  const [atrasadas, abertas, novos] = await Promise.all([
    prisma.fatura.count({
      where: { status: "ATRASADA", contrato: { imovel: { imobiliariaId } } },
    }),
    prisma.ocorrencia.count({ where: { status: "ABERTA", imovel: { imobiliariaId } } }),
    prisma.lead.count({ where: { status: "NOVO", imobiliariaId } }),
  ]);
  const notificacoes: Notificacao[] = [];
  if (atrasadas > 0)
    notificacoes.push({
      glifo: "⚠",
      titulo: `${atrasadas} fatura${atrasadas > 1 ? "s" : ""} em atraso`,
      detalhe: "Veja a régua de cobrança em Inadimplência",
      href: "/inadimplencia",
    });
  if (abertas > 0)
    notificacoes.push({
      glifo: "⚙",
      titulo: `${abertas} ocorrência${abertas > 1 ? "s" : ""} aberta${abertas > 1 ? "s" : ""}`,
      detalhe: "Manutenções aguardando andamento",
      href: "/ocorrencias",
    });
  if (novos > 0)
    notificacoes.push({
      glifo: "◎",
      titulo: `${novos} lead${novos > 1 ? "s" : ""} novo${novos > 1 ? "s" : ""} no CRM`,
      detalhe: "Interessados aguardando primeiro atendimento",
      href: "/meu-dia",
    });
  return notificacoes;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // O painel do dono (/admin) tem shell próprio (app/admin/layout.tsx) e NÃO usa
  // o chrome do cliente: nada de dock de imóveis/faturas na área do operador,
  // mesmo que exista um cookie de cliente no navegador.
  const rota = (await headers()).get("x-pathname") ?? "";
  if (rota === "/admin" || rota.startsWith("/admin/")) {
    return (
      <html lang="pt-BR">
        <body className="min-h-screen antialiased">{children}</body>
      </html>
    );
  }

  const sessao = await getSessao();

  // Sem sessão (login/cadastro): página limpa, sem o chrome do app
  if (!sessao) {
    return (
      <html lang="pt-BR">
        <body className="min-h-screen antialiased">{children}</body>
      </html>
    );
  }

  const [notificacoes, qtdImoveis] = await Promise.all([
    carregarNotificacoes(sessao.imobiliaria.id),
    prisma.imovel.count({ where: { imobiliariaId: sessao.imobiliaria.id } }),
  ]);
  const temDados = qtdImoveis > 0;

  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <div className="flex h-screen overflow-hidden bg-[#07080B] text-[#F4F5F7]">
          <Dock sair={sair} modulos={sessao.imobiliaria.modulos} />
          <div className="flex-1 flex flex-col min-w-0">
            <BarraSuperior
              nomeUsuario={sessao.usuario.nome}
              emailUsuario={sessao.usuario.email}
              nomeImobiliaria={sessao.imobiliaria.nome}
              notificacoes={notificacoes}
            />
            <main className="flex-1 overflow-y-auto relative z-[1]">
              <div className="max-w-[1200px] mx-auto box-border px-7 pt-[104px] pb-[168px]">
                {children}
              </div>
            </main>
          </div>
        </div>
        <Onboarding temDados={temDados} />
      </body>
    </html>
  );
}
