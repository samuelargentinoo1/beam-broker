// Resultado da busca global (lupa do menu superior) — pesquisa em toda a
// carteira da imobiliária logada: imóveis, pessoas, contratos, leads e ocorrências.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { temModulo } from "@/lib/planos";
import { Card, Empty, PageHeader } from "@/components/ui";
import { brl } from "@/lib/format";

export const dynamic = "force-dynamic";

type Resultado = { icone: string; titulo: string; detalhe: string; href: string };

export default async function PesquisaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { imobiliaria } = await exigirSessao();
  const q = ((await searchParams).q ?? "").trim();

  const grupos: { titulo: string; itens: Resultado[] }[] = [];

  // A busca só olha o que o cliente pode abrir. Sem isso, um cliente de
  // Recepção encontraria leads e clicaria num link que leva à tela de
  // bloqueio — experiência ruim e vazamento de informação sobre o que existe.
  const comComercial = temModulo(imobiliaria.modulos, "COMERCIAL");

  if (q) {
    const contem = { contains: q, mode: "insensitive" as const };
    const [imoveis, pessoas, leads] = await Promise.all([
      prisma.imovel.findMany({
        where: {
          imobiliariaId: imobiliaria.id,
          OR: [{ codigo: contem }, { endereco: contem }, { bairro: contem }, { cidade: contem }, { tipo: contem }],
        },
        take: 8,
      }),
      prisma.pessoa.findMany({
        where: {
          imobiliariaId: imobiliaria.id,
          OR: [{ nome: contem }, { cpfCnpj: contem }, { email: contem }, { telefone: contem }],
        },
        take: 8,
      }),
      comComercial
        ? prisma.lead.findMany({
            where: {
              imobiliariaId: imobiliaria.id,
              OR: [{ nome: contem }, { telefone: contem }, { email: contem }],
            },
            take: 8,
          })
        : Promise.resolve([]),
    ]);

    if (imoveis.length)
      grupos.push({
        titulo: "Imóveis",
        itens: imoveis.map((i) => ({
          icone: "⌂",
          titulo: `${i.codigo} — ${i.endereco}`,
          detalhe: `${i.tipo} · ${i.cidade}/${i.uf}${i.valorSugerido ? ` · ${brl(i.valorSugerido)}/mês` : ""}`,
          href: `/imoveis/${i.id}`,
        })),
      });
    if (pessoas.length)
      grupos.push({
        titulo: "Pessoas",
        itens: pessoas.map((p) => ({
          icone: "◫",
          titulo: p.nome,
          detalhe: [p.cpfCnpj, p.telefone, p.email].filter(Boolean).join(" · "),
          href: "/contatos",
        })),
      });
    if (leads.length)
      grupos.push({
        titulo: "Leads",
        itens: leads.map((l) => ({
          icone: "◎",
          titulo: l.nome,
          detalhe: [l.telefone, l.email, l.status].filter(Boolean).join(" · "),
          href: "/negocios",
        })),
      });
  }

  const total = grupos.reduce((soma, g) => soma + g.itens.length, 0);

  return (
    <div>
      <PageHeader
        kicker="Pesquisa"
        title={q ? `Resultados para “${q}”` : "Pesquisa"}
        subtitle={
          q
            ? `${total} resultado${total === 1 ? "" : "s"} na carteira de ${imobiliaria.nome}`
            : "Use a lupa do menu superior para pesquisar em toda a carteira"
        }
      />
      {!q ? (
        <Empty>Digite algo na busca lá em cima — imóvel, nome, CPF, telefone, contrato…</Empty>
      ) : total === 0 ? (
        <Empty>Nada encontrado para “{q}”. Tente parte do nome, código ou endereço.</Empty>
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <Card key={grupo.titulo} className="overflow-hidden rounded-[22px]">
              <p className="label-caps px-5 py-3 !text-[8.5px] tracking-[.12em] text-[#9AA2AF] bg-[#12141A] border-b border-[#1E222B] m-0">
                {grupo.titulo}
              </p>
              {grupo.itens.map((item, i) => (
                <Link
                  key={i}
                  href={item.href}
                  style={{ animationDelay: `${i * 30}ms` }}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-[#07080B] transition-colors border-b border-[#1E222B] last:border-0"
                >
                  <span aria-hidden className="grid place-items-center w-9 h-9 shrink-0 rounded-[10px] bg-[rgba(52,196,106,.08)] text-[#8CF0B0] text-[14px]">
                    {item.icone}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-[#F4F5F7] truncate">{item.titulo}</span>
                    <span className="block text-[11.5px] text-[#7A828F] truncate">{item.detalhe}</span>
                  </span>
                </Link>
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
