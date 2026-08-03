// Busca de endereço por CEP: preenche automaticamente rua, bairro, cidade e UF
// (e coordenadas quando o provedor traz). Só o que o CEP NÃO informa — número e
// complemento — fica para preencher à mão. Usado no cadastro manual (form) e
// pela IA de captação. Best-effort: se o CEP não resolver, não quebra nada.
//
// Fonte principal: BrasilAPI (v2) — às vezes já devolve lat/lon. Fallback: ViaCEP.

export type EnderecoCep = {
  cep: string;
  logradouro: string | null; // rua (sem número)
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
};

function soDigitos(cep: string): string {
  return (cep || "").replace(/\D/g, "");
}

// Formata como 00000-000.
export function formatarCep(cep: string): string {
  const d = soDigitos(cep).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

async function viaBrasilApi(cep: string): Promise<EnderecoCep | null> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      cep?: string; state?: string; city?: string; neighborhood?: string; street?: string;
      location?: { coordinates?: { latitude?: number | string; longitude?: number | string } };
    };
    const lat = d.location?.coordinates?.latitude;
    const lon = d.location?.coordinates?.longitude;
    return {
      cep: formatarCep(cep),
      logradouro: d.street || null,
      bairro: d.neighborhood || null,
      cidade: d.city || null,
      uf: d.state || null,
      latitude: lat != null && lat !== "" ? Number(lat) : null,
      longitude: lon != null && lon !== "" ? Number(lon) : null,
    };
  } catch {
    return null;
  }
}

async function viaViaCep(cep: string): Promise<EnderecoCep | null> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string;
    };
    if (d.erro) return null;
    return {
      cep: formatarCep(cep),
      logradouro: d.logradouro || null,
      bairro: d.bairro || null,
      cidade: d.localidade || null,
      uf: d.uf || null,
      latitude: null,
      longitude: null,
    };
  } catch {
    return null;
  }
}

// Busca o endereço do CEP. Tenta a BrasilAPI (pode trazer coordenada) e, se
// falhar/vier vazia, o ViaCEP. Devolve null quando o CEP é inválido ou não existe.
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const d = soDigitos(cep);
  if (d.length !== 8) return null;
  const principal = await viaBrasilApi(d);
  // Se a BrasilAPI trouxe pelo menos cidade/UF, usa (mesmo sem coordenada).
  if (principal && (principal.cidade || principal.uf)) {
    // Sem coordenada no CEP? Tenta geocodificar por rua+bairro+cidade (best-effort).
    if (principal.latitude == null) {
      const p = await import("@/lib/geo")
        .then((m) => m.geocodificar([principal.logradouro, principal.bairro, principal.cidade, principal.uf, "Brasil"].filter(Boolean).join(", ")))
        .catch(() => null);
      if (p) {
        principal.latitude = p.lat;
        principal.longitude = p.lon;
      }
    }
    return principal;
  }
  return await viaViaCep(d);
}
