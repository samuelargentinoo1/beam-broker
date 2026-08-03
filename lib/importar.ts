"use server";

// Importação de carteira por planilha (#6): CSV exportado do Excel/Google
// Sheets/planilha. Cada linha vira um imóvel (criando/reaproveitando o
// proprietário pelo CPF/CNPJ) e pode trazer FOTOS por URL para a IA integrar.
//
// CSV em vez de XLSX de propósito: não exige dependência nova (build à prova de
// falha na Vercel) e toda planilha exporta CSV. Aceita separador , ou ; e
// valores no formato brasileiro (1.500,00) ou internacional (1500.00).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { auditar } from "@/lib/auditoria";
import { proximoNumero } from "@/lib/format";

// ─── Parsing de CSV ─────────────────────────────────────────────────────────

function detectarDelimitador(cabecalho: string): string {
  const ptv = (cabecalho.match(/;/g) ?? []).length;
  const vir = (cabecalho.match(/,/g) ?? []).length;
  return ptv > vir ? ";" : ",";
}

// Parser de CSV com suporte a aspas (campos com vírgula/quebra de linha).
function parseCSV(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let emAspas = false;
  const delim = detectarDelimitador(texto.split(/\r?\n/)[0] ?? ",");
  const s = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (emAspas) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; }
        else emAspas = false;
      } else campo += c;
    } else if (c === '"') {
      emAspas = true;
    } else if (c === delim) {
      linha.push(campo); campo = "";
    } else if (c === "\n") {
      linha.push(campo); campo = "";
      if (linha.some((x) => x.trim() !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    if (linha.some((x) => x.trim() !== "")) linhas.push(linha);
  }
  return linhas;
}

function normalizarChave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Sinônimos de coluna → campo canônico.
const ALIASES: Record<string, string> = {
  proprietario: "prop_nome", proprietario_nome: "prop_nome", nome_proprietario: "prop_nome", dono: "prop_nome", locador: "prop_nome",
  cpf: "prop_cpf", cnpj: "prop_cpf", cpf_cnpj: "prop_cpf", documento: "prop_cpf", proprietario_cpf: "prop_cpf",
  telefone_proprietario: "prop_tel", proprietario_telefone: "prop_tel", whatsapp_proprietario: "prop_tel", telefone: "prop_tel", whatsapp: "prop_tel",
  pix: "prop_pix", chave_pix: "prop_pix",
  email: "prop_email", email_proprietario: "prop_email",
  tipo: "tipo",
  codigo: "codigo", cod: "codigo", referencia: "codigo", ref: "codigo",
  endereco: "endereco", logradouro: "endereco",
  bairro: "bairro",
  cidade: "cidade", municipio: "cidade",
  uf: "uf", estado: "uf",
  cep: "cep",
  finalidade: "finalidade",
  aluguel: "aluguel", valor_aluguel: "aluguel", valor: "aluguel", valor_sugerido: "aluguel",
  venda: "venda", valor_venda: "venda", preco: "venda", preco_venda: "venda",
  area: "area", area_m2: "area", m2: "area", metragem: "area", area_util: "area",
  condominio: "condominio", valor_condominio: "condominio",
  iptu: "iptu", valor_iptu: "iptu",
  fotos: "fotos", foto: "fotos", imagens: "fotos", urls_fotos: "fotos", fotos_urls: "fotos",
  quartos: "quartos", dormitorios: "quartos", dorms: "quartos", qtd_quartos: "quartos",
  banheiros: "banheiros", banheiro: "banheiros", wc: "banheiros",
  suites: "suites", suite: "suites",
  vagas: "vagas", garagem: "vagas", vagas_garagem: "vagas",
};

function parseValor(v: string | undefined): number | null {
  if (!v) return null;
  let s = v.replace(/[\u0300-\u036f]/g, "").trim();
  if (!s) return null;
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseInteiro(v: string | undefined): number | null {
  const n = parseValor(v);
  return n == null ? null : Math.max(0, Math.trunc(n));
}

const PREFIXO: Record<string, string> = { Apartamento: "AP", Casa: "CS", "Sala comercial": "SL", Terreno: "TR" };

// ─── Ação de importação ─────────────────────────────────────────────────────

export async function importarCarteira(formData: FormData) {
  const { imobiliaria } = await exigirSessao();
  const arquivo = formData.get("arquivo") as File | null;
  const colado = (formData.get("csv") as string | null)?.trim();
  const texto = (arquivo && arquivo.size > 0 ? await arquivo.text() : colado) ?? "";
  if (!texto.trim()) {
    revalidatePath("/importar");
    return { ok: false, criados: 0, erros: ["Nenhum arquivo/CSV enviado."] };
  }

  const linhas = parseCSV(texto);
  if (linhas.length < 2) {
    return { ok: false, criados: 0, erros: ["Planilha vazia ou sem linhas de dados."] };
  }

  const cabecalho = linhas[0].map((c) => ALIASES[normalizarChave(c)] ?? normalizarChave(c));
  const idx = (campo: string) => cabecalho.indexOf(campo);
  const col = (linha: string[], campo: string) => {
    const i = idx(campo);
    return i >= 0 ? (linha[i] ?? "").trim() : "";
  };

  // pré-carrega os códigos existentes por prefixo para gerar sequência
  const existentes = await prisma.imovel.findMany({
    where: { imobiliariaId: imobiliaria.id },
    select: { codigo: true },
  });
  const codigosUsados = new Set(existentes.map((e) => e.codigo));

  const erros: string[] = [];
  let criados = 0;
  let fotosCriadas = 0;

  for (let l = 1; l < linhas.length; l++) {
    const linha = linhas[l];
    try {
      const endereco = col(linha, "endereco");
      const cpf = col(linha, "prop_cpf").replace(/\s/g, "");
      const propNome = col(linha, "prop_nome");
      if (!endereco || !cpf || !propNome) {
        erros.push(`Linha ${l + 1}: faltam proprietário, CPF/CNPJ ou endereço — ignorada.`);
        continue;
      }

      // proprietário (reaproveita pelo CPF/CNPJ dentro do tenant)
      const proprietario = await prisma.pessoa.upsert({
        where: { imobiliariaId_cpfCnpj: { imobiliariaId: imobiliaria.id, cpfCnpj: cpf } },
        create: {
          imobiliariaId: imobiliaria.id,
          nome: propNome,
          cpfCnpj: cpf,
          telefone: col(linha, "prop_tel") || null,
          email: col(linha, "prop_email") || null,
          chavePix: col(linha, "prop_pix") || null,
        },
        update: {
          ...(col(linha, "prop_tel") ? { telefone: col(linha, "prop_tel") } : {}),
          ...(col(linha, "prop_pix") ? { chavePix: col(linha, "prop_pix") } : {}),
        },
      });

      const tipoRaw = col(linha, "tipo") || "Apartamento";
      const tipo = tipoRaw.charAt(0).toUpperCase() + tipoRaw.slice(1).toLowerCase();
      const prefixo = PREFIXO[tipo] ?? PREFIXO[tipoRaw] ?? "IM";

      // código: usa o da planilha se houver e estiver livre; senão gera
      let codigo = col(linha, "codigo");
      if (!codigo || codigosUsados.has(codigo)) {
        const doPrefixo = [...codigosUsados].filter((c) => c.startsWith(`${prefixo}-`));
        const numero = proximoNumero(doPrefixo, prefixo);
        codigo = `${prefixo}-${String(numero).padStart(4, "0")}`;
      }
      codigosUsados.add(codigo);

      const finRaw = normalizarChave(col(linha, "finalidade"));
      const finalidade = finRaw.includes("ambos") || (finRaw.includes("loca") && finRaw.includes("vend"))
        ? "AMBOS"
        : finRaw.includes("vend")
          ? "VENDA"
          : "LOCACAO";

      const imovel = await prisma.imovel.create({
        data: {
          imobiliariaId: imobiliaria.id,
          codigo,
          tipo,
          endereco,
          bairro: col(linha, "bairro") || null,
          cidade: col(linha, "cidade") || imobiliaria.municipio || "",
          uf: (col(linha, "uf") || imobiliaria.uf || "").toUpperCase().slice(0, 2),
          cep: col(linha, "cep") || null,
          finalidade,
          valorSugerido: parseValor(col(linha, "aluguel")),
          valorVenda: parseValor(col(linha, "venda")),
          areaM2: parseValor(col(linha, "area")),
          quartos: parseInteiro(col(linha, "quartos")),
          banheiros: parseInteiro(col(linha, "banheiros")),
          suites: parseInteiro(col(linha, "suites")),
          vagas: parseInteiro(col(linha, "vagas")),
          valorCondominio: parseValor(col(linha, "condominio")),
          valorIptuMensal: parseValor(col(linha, "iptu")),
          proprietarioId: proprietario.id,
        },
      });
      criados++;
      await import("@/lib/geo").then((m) => m.geocodificarImovel(imovel.id)).catch(() => {});

      // fotos (URLs separadas por | , ou ;)
      const fotosRaw = col(linha, "fotos");
      if (fotosRaw) {
        const urls = fotosRaw
          .split(/[|,;\s]+/)
          .map((u) => u.trim())
          .filter((u) => /^https?:\/\//i.test(u));
        if (urls.length) {
          await prisma.fotoImovel.createMany({
            data: urls.map((url, i) => ({ imovelId: imovel.id, url, ordem: i })),
          });
          fotosCriadas += urls.length;
        }
      }
    } catch (e) {
      erros.push(`Linha ${l + 1}: ${(e as Error).message}`);
    }
  }

  await auditar("CARTEIRA_IMPORTADA", "Imovel", undefined, `${criados} imóvel(is), ${fotosCriadas} foto(s), ${erros.length} erro(s)`);
  revalidatePath("/imoveis");
  revalidatePath("/importar");
  return { ok: true, criados, fotosCriadas, erros };
}
