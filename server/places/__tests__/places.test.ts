import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { routes, clampRadius, parseKinds, buildQuery, type NearbyPlace } from '../routes.ts';

// Fixture elements shaped like Overpass `out center tags` output; names are made up, not real places.
const OVERPASS = {
  elements: [
    { type: 'node', id: 1, lat: 13.05, lon: 77.597, tags: { amenity: 'pharmacy', name: 'Far Pharmacy', 'contact:phone': '+91 80 1111 2222; +91 98450 00000', opening_hours: '24/7' } },
    { type: 'way', id: 22, center: { lat: 13.036, lon: 77.597 }, tags: { amenity: 'hospital', name: 'Near Hospital', emergency: 'yes', 'addr:housenumber': '12', 'addr:street': 'Bellary Road', 'addr:city': 'Bengaluru', 'addr:postcode': '560024' } },
    { type: 'node', id: 3, lat: 13.04, lon: 77.6, tags: { amenity: 'doctors' } },
    { type: 'node', id: 4, lat: 13.045, lon: 77.6, tags: { healthcare: 'clinic', 'name:en': 'English Name Clinic', phone: '080-2345 6789' } },
    { type: 'node', id: 5, lat: 13.04, lon: 77.6, tags: { amenity: 'school', name: 'Not health' } },
    { type: 'way', id: 6, tags: { amenity: 'hospital', name: 'No coordinates' } },
  ],
};

const ORIGIN = 'lat=13.0358&lng=77.597';

function fakeFetch(body: unknown = OVERPASS, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

async function call(handler: ReturnType<typeof routes>[number]['handler'], qs: string) {
  const url = new URL(`http://localhost/places/nearby?${qs}`);
  const res = await handler(new Request(url), { caller: { id: 't', role: 'patient', via: 'demo' }, url });
  return { status: res.status, body: (await res.json()) as { ok?: boolean; cached?: boolean; error?: string; places: NearbyPlace[] } };
}

describe('GET /places/nearby', () => {
  it('parses nodes and ways (centre), maps tags, and sorts by distance', async () => {
    const f = fakeFetch();
    const [route] = routes({ nominatim: false, fetchImpl: f.fn });
    const { status, body } = await call(route.handler, `${ORIGIN}&radiusKm=3`);
    assert.equal(status, 200);
    assert.deepEqual(body.places.map((p) => p.id), ['osm-way-22', 'osm-node-3', 'osm-node-4', 'osm-node-1']);
    const [hosp, unnamed, clinic, pharm] = body.places;
    assert.equal(hosp.kind, 'hospital');
    assert.equal(hosp.emergency, true);
    assert.equal(hosp.address, '12 Bellary Road, Bengaluru, 560024');
    assert.equal(hosp.lat, 13.036);
    assert.equal(unnamed.kind, 'clinic');
    assert.equal(unnamed.named, false);
    assert.equal(unnamed.name, 'Unnamed clinic');
    assert.equal(clinic.name, 'English Name Clinic');
    assert.equal(clinic.phone, '080-2345 6789');
    assert.equal(pharm.kind, 'pharmacy');
    assert.equal(pharm.phone, '+91 80 1111 2222');
    assert.equal(pharm.openingHours, '24/7');
    for (let i = 1; i < body.places.length; i++) assert.ok(body.places[i - 1].distanceKm <= body.places[i].distanceKm);

    // POSTed as a form with a generic User-Agent.
    assert.equal(f.calls.length, 1);
    const headers = f.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['user-agent'], 'AroghyaMitra/0.1 (health app demo)');
    const data = new URLSearchParams(String(f.calls[0].init.body)).get('data') ?? '';
    assert.match(data, /out center/);
    assert.match(data, /around:3000,13\.035800,77\.597000/);
  });

  it('filters by kinds', async () => {
    const [route] = routes({ nominatim: false, fetchImpl: fakeFetch().fn });
    const { body } = await call(route.handler, `${ORIGIN}&kinds=pharmacy`);
    assert.deepEqual(body.places.map((p) => p.kind), ['pharmacy']);
  });

  it('clamps the radius to 0.5–10 km (default 5) and parses kinds', () => {
    assert.equal(clampRadius(null), 5);
    assert.equal(clampRadius('abc'), 5);
    assert.equal(clampRadius('0.1'), 0.5);
    assert.equal(clampRadius('50'), 10);
    assert.equal(clampRadius('3'), 3);
    assert.deepEqual(parseKinds('pharmacy,bogus'), ['pharmacy']);
    assert.deepEqual(parseKinds('bogus'), ['hospital', 'clinic', 'pharmacy']);
    assert.match(buildQuery(13, 77, 10, ['hospital']), /around:10000/);
    assert.doesNotMatch(buildQuery(13, 77, 10, ['hospital']), /pharmacy/);
  });

  it('a radius of 50 is clamped to 10 km in the upstream query', async () => {
    const f = fakeFetch({ elements: [] });
    const [route] = routes({ nominatim: false, fetchImpl: f.fn });
    await call(route.handler, `${ORIGIN}&radiusKm=50`);
    assert.match(new URLSearchParams(String(f.calls[0].init.body)).get('data') ?? '', /around:10000,/);
  });

  it('serves a repeat request from the cache for 6 hours', async () => {
    const f = fakeFetch();
    let t = 1_000_000;
    const [route] = routes({ nominatim: false, fetchImpl: f.fn, now: () => t });
    const a = await call(route.handler, `${ORIGIN}&radiusKm=3`);
    const b = await call(route.handler, `lat=13.0361&lng=77.5972&radiusKm=3`); // rounds to the same key
    assert.equal(a.body.cached, false);
    assert.equal(b.body.cached, true);
    assert.equal(b.body.places.length, a.body.places.length);
    assert.equal(f.calls.length, 1);
    t += 5 * 60 * 60_000;
    const mid = await call(route.handler, `${ORIGIN}&radiusKm=3`);
    assert.equal(mid.body.cached, true);
    t += 61 * 60_000;
    const c = await call(route.handler, `${ORIGIN}&radiusKm=3`);
    assert.equal(c.body.cached, false);
    assert.equal(f.calls.length, 2);
  });

  it('returns 502 with an empty list when Overpass fails or is unreachable', async () => {
    const [down] = routes({ nominatim: false, fetchImpl: fakeFetch({ error: 'busy' }, 504).fn });
    const r1 = await call(down.handler, ORIGIN);
    assert.equal(r1.status, 502);
    assert.deepEqual(r1.body.places, []);
    assert.ok(r1.body.error);

    const throwing = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const [offline] = routes({ nominatim: false, fetchImpl: throwing });
    const r2 = await call(offline.handler, ORIGIN);
    assert.equal(r2.status, 502);
    assert.deepEqual(r2.body.places, []);
  });

  it('tries the next Overpass instance when the first one is busy', async () => {
    const urls: string[] = [];
    const fn = (async (url: string) => {
      urls.push(String(url));
      return urls.length === 1 ? new Response('at capacity', { status: 504 }) : new Response(JSON.stringify(OVERPASS), { status: 200 });
    }) as unknown as typeof fetch;
    const [route] = routes({ nominatim: false, fetchImpl: fn, endpoints: ['https://a.example/api/interpreter', 'https://b.example/api/interpreter'] });
    const r = await call(route.handler, `${ORIGIN}&radiusKm=3`);
    assert.equal(r.status, 200);
    assert.equal(r.body.places.length, 4);
    assert.deepEqual(urls, ['https://a.example/api/interpreter', 'https://b.example/api/interpreter']);
  });

  it('rejects missing or invalid coordinates with 400', async () => {
    const f = fakeFetch();
    const [route] = routes({ nominatim: false, fetchImpl: f.fn });
    assert.equal((await call(route.handler, 'lat=abc&lng=77')).status, 400);
    assert.equal((await call(route.handler, 'lng=77')).status, 400);
    assert.equal((await call(route.handler, 'lat=95&lng=77')).status, 400);
    assert.equal(f.calls.length, 0);
    // Outside India is fine.
    assert.equal((await call(route.handler, 'lat=51.5&lng=-0.12')).status, 200);
  });

  it('uses Nominatim first: one request per kind, a pause between them, places mapped and sorted', async () => {
    const hits: Record<string, unknown[]> = {
      hospital: [
        { osm_type: 'way', osm_id: 11, lat: '13.0400', lon: '77.5970', name: 'Far Hospital', category: 'amenity', type: 'hospital', display_name: 'Far Hospital, Road 1, Hebbal, Bengaluru, Karnataka', extratags: { phone: '+91 80 1234 5678', emergency: 'yes' } },
        { osm_type: 'node', osm_id: 12, lat: '13.0359', lon: '77.5971', name: 'Near Hospital', category: 'amenity', type: 'hospital', display_name: 'Near Hospital, Road 2, Hebbal' },
      ],
      pharmacy: [{ osm_type: 'node', osm_id: 13, lat: '13.0365', lon: '77.5980', name: '', category: 'amenity', type: 'pharmacy', display_name: 'Road 3, Hebbal' }],
      clinic: [{ osm_type: 'node', osm_id: 14, lat: '14.5000', lon: '77.5980', name: 'Too Far Clinic', category: 'amenity', type: 'clinic' }],
    };
    const calls: string[] = [];
    const pauses: number[] = [];
    const fn = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      const q = new URL(String(url)).searchParams.get('q') ?? '';
      return new Response(JSON.stringify(hits[q] ?? []), { status: 200 });
    }) as typeof fetch;
    const [route] = routes({ fetchImpl: fn, sleep: async (ms) => void pauses.push(ms), nominatimUrl: 'https://nominatim.example/search' });
    const r = await call(route.handler, `${ORIGIN}&radiusKm=3`);
    assert.equal(r.status, 200);
    assert.equal(calls.length, 3);
    assert.ok(calls.every((u) => u.startsWith('https://nominatim.example/search?') && /bounded=1/.test(u) && /viewbox=/.test(u)));
    assert.deepEqual(pauses, [1100, 1100], 'Nominatim allows one request per second');
    assert.deepEqual(r.body.places.map((p: { name: string }) => p.name), ['Near Hospital', 'Unnamed pharmacy', 'Far Hospital']);
    const far = r.body.places.find((p: { name: string }) => p.name === 'Far Hospital')!;
    assert.equal(far.phone, '+91 80 1234 5678');
    assert.equal(far.emergency, true);
    assert.equal(far.id, 'osm-way-11');
  });

  it('falls back to Overpass when Nominatim is down', async () => {
    let n = 0;
    const fn = (async (url: RequestInfo | URL) => {
      n++;
      if (String(url).includes('nominatim')) return new Response('busy', { status: 503 });
      return new Response(JSON.stringify(OVERPASS), { status: 200 });
    }) as typeof fetch;
    const [route] = routes({ fetchImpl: fn, sleep: async () => undefined, nominatimUrl: 'https://nominatim.example/search', endpoints: ['https://overpass.example/api/interpreter'] });
    const r = await call(route.handler, ORIGIN);
    assert.equal(r.status, 200);
    assert.ok(r.body.places.length > 0);
    assert.equal(n, 4, 'three Nominatim tries, then one Overpass');
  });
});

