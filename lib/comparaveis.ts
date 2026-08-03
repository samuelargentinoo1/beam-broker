// Referência de mercado por COMPARÁVEIS de anúncios (ZAP / VivaReal / OLX),
// obtida de um serviço externo de captura. Serve APENAS para a IA ter noção de
// preço e de bairro/cidade em qualquer lugar do Brasil e ser mais assertiva ao
// falar de valor. NUNCA é usada para oferecer imóvel nem para enviar link de
// anúncio: a oferta é sempre da NOSSA carteira. Por isso, deste módulo só saem
// números (preço, área, quartos, bairro) — nunca URL, foto ou contato de terceiro.
//
// Configuração (fora do repositório, por variável de ambiente):
//   SCRAPER_URL   → base HTTPS do serviço de referência (ex.: túnel do serviço)
//   SCRAPER_TOKEN → token opcional enviado no header Authorization
// Sem SCRAPER_URL, o sistema segue só com a carteira (comportamento anterior).

const BASE = () => (process.env.SCRAPER_URL || "").replace(/\/+$/, "");
const TOKEN = () => process.env.SCRAPER_TOKEN || "";

// Transcrição de áudio pelo serviço externo (whisper local, sem chave/custo).
// Fallback para a nota de voz quando o ElevenLabs não está disponível ou falha.
// Recebe os bytes do áudio e devolve o texto, ou null se não der.
export async function transcreverPeloServico(
  audio: Buffer,
  mime = "audio/ogg"
): Promise<string | null> {
  const base = BASE();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": mime, ...(TOKEN() ? { Authorization: `Bearer ${TOKEN()}` } : {}) },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => null)) as { text?: string } | null;
    const t = d?.text;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  } catch (e) {
    console.error("transcreverPeloServico:", e);
    return null;
  }
}

// Só os campos numéricos/textuais que importam para preço — nada de url/foto/contato.
export type Comparavel = {
  price?: number | null;
  area_m2?: number | null;
  bedrooms?: number | null;
  neighborhood?: string | null;
  city?: string | null;
};

// UF (sigla) → nome por extenso, que é o formato aceito pelo serviço.
const UF_NOME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};
function estadoPorExtenso(uf?: string | null): string | undefined {
  if (!uf) return undefined;
  const s = uf.trim();
  if (s.length > 2) return s; // já veio por extenso
  return UF_NOME[s.toUpperCase()];
}

// Mapeia o "tipo" livre da carteira para o property_type do serviço.
function mapearTipo(tipo?: string | null): string | undefined {
  if (!tipo) return undefined;
  const t = tipo.toLowerCase();
  if (/apart|apto|\bap\b|kitnet|studio|stúdio|flat/.test(t)) return "apartamento";
  if (/casa|sobrado/.test(t)) return "casa";
  if (/sala|comerc|loja|escrit|galp/.test(t)) return "comercial";
  if (/terreno|lote|área|area/.test(t)) return "terreno";
  return undefined;
}

// Busca comparáveis no serviço externo. Retorna null quando não há serviço
// configurado, quando falta cidade, ou quando o serviço falhou/bloqueou (503) —
// nesses casos a referência de mercado cai para a carteira, sem inventar nada.
export async function buscarComparaveis(p: {
  finalidade: "LOCACAO" | "VENDA";
  cidade?: string | null;
  uf?: string | null;
  bairro?: string | null;
  tipo?: string | null;
  areaM2?: number | null;
}): Promise<Comparavel[] | null> {
  const base = BASE();
  if (!base || !p.cidade) return null;

  const qs = new URLSearchParams();
  qs.set("city", p.cidade);
  const estado = estadoPorExtenso(p.uf);
  if (estado) qs.set("state", estado);
  qs.set("business", p.finalidade === "VENDA" ? "venda" : "aluguel");
  if (p.bairro) qs.set("neighborhood", p.bairro);
  const tipo = mapearTipo(p.tipo);
  if (tipo) qs.set("property_type", tipo);
  // Faixa de área ±30% para comparar imóveis parecidos (o serviço descarta os
  // anúncios sem área declarada quando pedimos min/max).
  if (p.areaM2 && p.areaM2 > 0) {
    qs.set("min_area", String(Math.round(p.areaM2 * 0.7)));
    qs.set("max_area", String(Math.round(p.areaM2 * 1.3)));
  }
  qs.set("size", "30"); // teto real do serviço

  try {
    const res = await fetch(`${base}/search?${qs.toString()}`, {
      headers: TOKEN() ? { Authorization: `Bearer ${TOKEN()}` } : {},
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null; // 503 = fontes falharam/bloqueadas → trata como sem dado
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) return null;
    return data
      .map((d) => ({
        price: typeof d?.price === "number" ? d.price : null,
        area_m2: typeof d?.area_m2 === "number" ? d.area_m2 : null,
        bedrooms: typeof d?.bedrooms === "number" ? d.bedrooms : null,
        neighborhood: d?.neighborhood ?? null,
        city: d?.city ?? null,
      }))
      .filter((c) => (c.price ?? 0) > 0);
  } catch (e) {
    console.error("buscarComparaveis:", e);
    return null;
  }
}
