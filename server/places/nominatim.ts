/**
 * Nearby hospitals, clinics and pharmacies from OpenStreetMap's Nominatim search.
 *
 * Shared by the server (server/places/routes.ts) and the app (features/maps):
 * the app asks Nominatim directly from the phone first, because public
 * OpenStreetMap services often throttle shared cloud servers; the server path
 * (with Overpass as a further fallback) is the backup. Web-standard fetch only.
 */
export type PlaceKind = 'hospital' | 'clinic' | 'pharmacy';

export interface NearbyPlace {
  id: string;
  /** Name from OSM (name, then name:en), or an English fallback such as "Unnamed clinic" when `named` is false. */
  name: string;
  named: boolean;
  kind: PlaceKind;
  lat: number;
  lng: number;
  phone: string | null;
  address: string | null;
  emergency: boolean;
  openingHours: string | null;
  distanceKm: number;
}

export const MAX_RESULTS = 80;

export const USER_AGENT = 'AroghyaMitra/0.1 (health app demo)';

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function kindOf(tags: Record<string, string>): PlaceKind | null {
  const a = tags.amenity;
  const h = tags.healthcare;
  if (a === 'hospital' || h === 'hospital') return 'hospital';
  if (a === 'pharmacy' || h === 'pharmacy') return 'pharmacy';
  if (a === 'clinic' || a === 'doctors' || h === 'clinic' || h === 'doctor' || h === 'centre') return 'clinic';
  return null;
}

export const FALLBACK_NAME: Record<PlaceKind, string> = { hospital: 'Unnamed hospital', clinic: 'Unnamed clinic', pharmacy: 'Unnamed pharmacy' };

export function firstPhone(tags: Record<string, string>): string | null {
  const raw = tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile'] ?? tags.mobile;
  if (!raw) return null;
  const first = raw.split(/[;,/]/)[0]?.trim();
  return first && /\d{5,}/.test(first.replace(/[\s-]/g, '')) ? first : null;
}


export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** Nominatim's usage policy allows at most one request per second per application. */
const NOMINATIM_GAP_MS = 1100;

type NominatimHit = {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  type?: string;
  category?: string;
  display_name?: string;
  extratags?: Record<string, string> | null;
};

/** One Nominatim search per kind inside a bounding box around the point; OpenStreetMap data, usually answers in ~1 s. */
export async function queryNominatim(
  origin: { lat: number; lng: number },
  radiusKm: number,
  kinds: readonly PlaceKind[],
  o: { fetchImpl: typeof fetch; timeoutMs: number; sleep?: (ms: number) => Promise<void>; url?: string },
): Promise<{ ok: true; places: NearbyPlace[] } | { ok: false; error: string }> {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180)));
  const viewbox = [origin.lng - dLng, origin.lat + dLat, origin.lng + dLng, origin.lat - dLat].map((n) => n.toFixed(5)).join(',');
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = Date.now() + o.timeoutMs;
  const out = new Map<string, NearbyPlace>();
  let answered = 0;
  for (let i = 0; i < kinds.length; i++) {
    if (i > 0) await sleep(NOMINATIM_GAP_MS);
    const left = deadline - Date.now();
    if (left <= 250) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), left);
    try {
      const q = new URLSearchParams({ format: 'jsonv2', q: kinds[i], viewbox, bounded: '1', limit: '50', extratags: '1' });
      const res = await o.fetchImpl(`${o.url ?? NOMINATIM_URL}?${q}`, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: ctrl.signal });
      if (!res.ok) continue;
      const hits = (await res.json()) as NominatimHit[];
      if (!Array.isArray(hits)) continue;
      answered++;
      for (const h of hits) {
        const lat = Number(h.lat);
        const lng = Number(h.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !h.osm_type || !h.osm_id) continue;
        const tags: Record<string, string> = { ...(h.extratags ?? {}), ...(h.category === 'healthcare' ? { healthcare: h.type ?? '' } : { amenity: h.type ?? '' }) };
        const kind = kindOf(tags);
        if (!kind || !kinds.includes(kind)) continue;
        const distanceKm = Math.round(haversineKm(origin.lat, origin.lng, lat, lng) * 100) / 100;
        if (distanceKm > radiusKm) continue;
        const id = `osm-${h.osm_type}-${h.osm_id}`;
        const name = h.name?.trim();
        out.set(id, {
          id,
          name: name || FALLBACK_NAME[kind],
          named: !!name,
          kind,
          lat,
          lng,
          phone: firstPhone(tags),
          address: h.display_name ? h.display_name.split(',').slice(name ? 1 : 0, (name ? 1 : 0) + 3).map((x) => x.trim()).join(', ') || null : null,
          emergency: tags.emergency === 'yes',
          openingHours: tags.opening_hours ?? null,
          distanceKm,
        });
      }
    } catch {
      /* this kind failed; try the others */
    } finally {
      clearTimeout(timer);
    }
  }
  if (!answered) return { ok: false, error: 'OpenStreetMap search is not reachable' };
  const places = [...out.values()].sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name)).slice(0, MAX_RESULTS);
  return { ok: true, places };
}

