// Geografia das IAs: geocodifica endereços/bairros e resolve proximidade, para
// oferecer imóveis a até ~1-2 km do bairro pedido com boa assertividade.
//
// Usa o Nominatim (OpenStreetMap) — sem chave, uso leve (só no cadastro do
// imóvel e ao interpretar o bairro pedido). Falha aqui nunca quebra o fluxo:
// sem coordenadas, a busca cai no filtro textual por bairro (comportamento antigo).

import { prisma } from "@/lib/db";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
export const RAIO_PROXIMIDADE_KM = 2; // "perto" = até 2 km do bairro pedido

// Cache simples em processo para não repetir geocodificação do mesmo local.
const cache = new Map<string, { lat: number; lon: number } | null>();

export async function geocodificar(consulta: string): Promise<{ lat: number; lon: number } | null> {
  const chave = consulta.trim().toLowerCase();
  if (!chave) return null;
  if (cache.has(chave)) return cache.get(chave)!;
  try {
    const url = `${NOMINATIM}?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(consulta)}`;
    const res = await fetch(url, {
      headers: {
        // Nominatim exige User-Agent identificável.
        "User-Agent": "BeamBroker-ERP/1.0 (contato via app)",
        "Accept-Language": "pt-BR",
      },
    });
    if (!res.ok) {
      cache.set(chave, null);
      return null;
    }
    const dados = (await res.json()) as Array<{ lat: string; lon: string }>;
    const p = dados[0];
    const r = p ? { lat: parseFloat(p.lat), lon: parseFloat(p.lon) } : null;
    cache.set(chave, r);
    return r;
  } catch {
    cache.set(chave, null);
    return null;
  }
}

// Geocodifica um bairro/cidade/UF (ordem que dá boa precisão no Nominatim).
export async function geocodificarLocal(bairro?: string | null, cidade?: string | null, uf?: string | null) {
  const partes = [bairro, cidade, uf, "Brasil"].filter(Boolean);
  if (partes.length <= 1) return null;
  return geocodificar(partes.join(", "));
}

// Geocodifica e salva as coordenadas de um imóvel (best-effort, no cadastro).
export async function geocodificarImovel(imovelId: number) {
  const imovel = await prisma.imovel.findUnique({ where: { id: imovelId } });
  if (!imovel) return;
  const consulta = [imovel.endereco, imovel.bairro, imovel.cidade, imovel.uf, "Brasil"].filter(Boolean).join(", ");
  const p = await geocodificar(consulta);
  if (!p) return;
  await prisma.imovel.update({ where: { id: imovelId }, data: { latitude: p.lat, longitude: p.lon } }).catch(() => {});
}

// Distância em km entre dois pontos (haversine).
function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Anota imóveis com a distância (km) ao centro do bairro pedido, quando ambos
// têm coordenadas. Usado para oferecer "perto" (até RAIO_PROXIMIDADE_KM).
export async function distanciasAoBairro<T extends { latitude: number | null; longitude: number | null }>(
  imoveis: T[],
  bairro?: string | null,
  cidade?: string | null,
  uf?: string | null
): Promise<Map<T, number>> {
  const mapa = new Map<T, number>();
  const centro = await geocodificarLocal(bairro, cidade, uf);
  if (!centro) return mapa;
  for (const im of imoveis) {
    if (im.latitude != null && im.longitude != null) {
      mapa.set(im, distanciaKm(centro.lat, centro.lon, im.latitude, im.longitude));
    }
  }
  return mapa;
}
