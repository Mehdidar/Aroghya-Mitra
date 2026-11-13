/**
 * GET /places/nearby?lat=&lng=&radiusKm=&kinds=hospital,clinic,pharmacy
 *   → { ok, source: 'osm', attribution, cached, places: NearbyPlace[] }
 *
 * Real hospitals, clinics and pharmacies from OpenStreetMap through the public
 * Overpass API. Results are cached in memory for 6 hours per rounded
 * location (2 decimals, about 1 km), radius and kinds, so the free Overpass
 * service is not hit on every screen open. Upstream failure → 502 with an
 * empty list; the app then shows its error state.
 *
 * Runs on Node and Deno: only fetch and web APIs.
 */
import { json, type Route } from '../http/router.ts';
import { readEnv } from '../speech/config.ts';
import { FALLBACK_NAME, MAX_RESULTS, USER_AGENT, firstPhone, haversineKm, kindOf, queryNominatim, type NearbyPlace, type PlaceKind } from './nominatim.ts';
export { MAX_RESULTS, haversineKm, kindOf, queryNominatim, type NearbyPlace, type PlaceKind } from './nominatim.ts';




export interface PlacesOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Overpass interpreters tried in order (default: OVERPASS_URL, comma-separated, else overpass-api.de). */
  endpoints?: string[];
  timeoutMs?: number;
  cacheTtlMs?: number;
  /** false skips Nominatim (tests of the Overpass path). */
  nominatim?: boolean;
  nominatimUrl?: string;
  /** Test hook for the pause between Nominatim requests. */
  sleep?: (ms: number) => Promise<void>;
}

export const ALL_KINDS: readonly PlaceKind[] = ['hospital', 'clinic', 'pharmacy'];
export const DEFAULT_RADIUS_KM = 5;
export const MIN_RADIUS_KM = 0.5;
export const MAX_RADIUS_KM = 10;
// OVERPASS_URL may list more interpreters (comma-separated), tried in order within the same 15 s budget
// when one is busy; by default only the main public instance is used.
// The main public Overpass server answers 429/502/504 when busy; two public mirrors carry the same data.
export const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const ATTRIBUTION = '© OpenStreetMap contributors';

type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export function clampRadius(raw: string | null): number {
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_RADIUS_KM;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, n));
}

export function parseKinds(raw: string | null): PlaceKind[] {
  if (!raw) return [...ALL_KINDS];
  const want = new Set(raw.split(',').map((s) => s.trim().toLowerCase()));
  const kinds = ALL_KINDS.filter((k) => want.has(k));
  return kinds.length ? kinds : [...ALL_KINDS];
}


/** Overpass QL for the chosen kinds around a point. Ways and relations come back with a centre point. */
export function buildQuery(lat: number, lng: number, radiusKm: number, kinds: readonly PlaceKind[]): string {
  const around = `(around:${Math.round(radiusKm * 1000)},${lat.toFixed(6)},${lng.toFixed(6)})`;
  const sel: string[] = [];
  if (kinds.includes('hospital')) sel.push(`nwr["amenity"="hospital"]${around};`, `nwr["healthcare"="hospital"]${around};`);
  if (kinds.includes('clinic')) sel.push(`nwr["amenity"~"^(clinic|doctors)$"]${around};`, `nwr["healthcare"~"^(clinic|doctor|centre)$"]${around};`);
  if (kinds.includes('pharmacy')) sel.push(`nwr["amenity"="pharmacy"]${around};`, `nwr["healthcare"="pharmacy"]${around};`);
  return `[out:json][timeout:12];(${sel.join('')});out center tags 1000;`;
}

/** Map OSM tags to one of our kinds, or null if this element is not a place we list. */



function address(tags: Record<string, string>): string | null {
  if (tags['addr:full']) return tags['addr:full'];
  const parts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:place'],
    tags['addr:suburb'],
    tags['addr:city'],
    tags['addr:postcode'],
  ].filter((p): p is string => !!p && p.trim() !== '');
  return parts.length ? parts.join(', ') : null;
}


/** Overpass JSON → places for the chosen kinds, nearest first, at most MAX_RESULTS. */
export function parseOverpass(body: unknown, origin: { lat: number; lng: number }, kinds: readonly PlaceKind[], radiusKm = MAX_RADIUS_KM): NearbyPlace[] {
  const elements = (body as { elements?: OsmElement[] } | null)?.elements;
  if (!Array.isArray(elements)) return [];
  const seen = new Set<string>();
  const out: NearbyPlace[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const kind = kindOf(tags);
    if (!kind || !kinds.includes(kind)) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const id = `osm-${el.type}-${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const distanceKm = Math.round(haversineKm(origin.lat, origin.lng, lat, lng) * 100) / 100;
    if (distanceKm > radiusKm + 0.05) continue;
    const name = (tags.name ?? tags['name:en'] ?? '').trim();
    out.push({
      id,
      name: name || FALLBACK_NAME[kind],
      named: !!name,
      kind,
      lat,
      lng,
      phone: firstPhone(tags),
      address: address(tags),
      emergency: tags.emergency === 'yes',
      openingHours: tags.opening_hours ?? null,
      distanceKm,
    });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
  return out.slice(0, MAX_RESULTS);
}

function endpointsFromEnv(): string[] {
  const env = readEnv('OVERPASS_URL');
  const list = env ? env.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return list.length ? list : DEFAULT_ENDPOINTS;
}

/**
 * POST the query to each endpoint in turn until one answers 200 with JSON, all within one
 * deadline. A busy instance (429/5xx) or a network error moves on to the next one.
 */
async function queryOverpass(
  query: string,
  o: { fetchImpl: typeof fetch; endpoints: string[]; timeoutMs: number },
): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
  const deadline = Date.now() + o.timeoutMs;
  let error = 'OpenStreetMap search is not reachable';
  for (const endpoint of o.endpoints) {
    const left = deadline - Date.now();
    if (left <= 250) {
      error = 'OpenStreetMap search timed out';
      break;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), left);
    try {
      const res = await o.fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT, accept: 'application/json' },
        body: new URLSearchParams({ data: query }).toString(),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        error = res.status === 429 || res.status >= 500 ? `OpenStreetMap search is busy (HTTP ${res.status})` : `OpenStreetMap search failed (HTTP ${res.status})`;
        continue;
      }
      return { ok: true, body: await res.json() };
    } catch (e) {
      error = (e as { name?: string })?.name === 'AbortError' ? 'OpenStreetMap search timed out' : 'OpenStreetMap search is not reachable';
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error };
}

export function routes(opts: PlacesOptions = {}): Route[] {
  const cache = new Map<string, { at: number; places: NearbyPlace[] }>();
  const now = opts.now ?? (() => Date.now());
  const ttl = opts.cacheTtlMs ?? 6 * 60 * 60_000; // places change slowly; spare the busy public servers
  const timeoutMs = opts.timeoutMs ?? 20_000;

  return [
    {
      method: 'GET',
      path: '/places/nearby',
      handler: async (_req, { url }) => {
        const lat = Number(url.searchParams.get('lat'));
        const lng = Number(url.searchParams.get('lng'));
        if (!url.searchParams.get('lat') || !url.searchParams.get('lng') || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          return json({ error: 'lat and lng are required numbers', places: [] }, 400);
        }
        const radiusKm = clampRadius(url.searchParams.get('radiusKm'));
        const kinds = parseKinds(url.searchParams.get('kinds'));
        // Rounded to ~1 km so nearby users share a cache entry; distances are still from the exact point.
        const key = `${lat.toFixed(2)},${lng.toFixed(2)}|${radiusKm}|${kinds.join(',')}`;
        const hit = cache.get(key);
        if (hit && now() - hit.at < ttl) {
          const places = hit.places
            .map((p) => ({ ...p, distanceKm: Math.round(haversineKm(lat, lng, p.lat, p.lng) * 100) / 100 }))
            .sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
          return json({ ok: true, source: 'osm', attribution: ATTRIBUTION, cached: true, radiusKm, places });
        }

        const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
        // 1. Nominatim (fast, reliable); 2. Overpass (fuller tags, but the public servers are often busy).
        let places: NearbyPlace[] | null = null;
        let error = 'OpenStreetMap search is not reachable';
        if (opts.nominatim !== false) {
          const n = await queryNominatim({ lat, lng }, radiusKm, kinds, { fetchImpl, timeoutMs: Math.min(timeoutMs, 12_000), sleep: opts.sleep, url: opts.nominatimUrl });
          if (n.ok) places = n.places;
          else error = n.error;
        }
        if (!places) {
          const result = await queryOverpass(buildQuery(lat, lng, radiusKm, kinds), { fetchImpl, endpoints: opts.endpoints ?? endpointsFromEnv(), timeoutMs });
          if (!result.ok) return json({ error: result.ok === false ? result.error : error, places: [] }, 502);
          places = parseOverpass(result.body, { lat, lng }, kinds, radiusKm);
        }
        cache.set(key, { at: now(), places });
        if (cache.size > 500) cache.delete(cache.keys().next().value as string);
        return json({ ok: true, source: 'osm', attribution: ATTRIBUTION, cached: false, radiusKm, places });
      },
    },
  ];
}
