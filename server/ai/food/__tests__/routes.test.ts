import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRouter } from '../../../http/router.ts';
import { foodRoutes } from '../routes.ts';
import { CATALOG_KEYS, parseReply } from '../sarvamFood.ts';

const photo = () => {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' }), 'meal.jpg');
  return new Request('http://x/ai/food', { method: 'POST', body: fd, headers: { 'x-demo-role': 'patient' } });
};
const sarvamReply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

type Call = { url: string; body?: string };
function fakeFetch(handlers: { dishdetect?: () => Response | Promise<Response>; sarvam?: (body: string) => Response }) {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url.includes('sarvam')) return handlers.sarvam ? handlers.sarvam(String(init?.body)) : new Response('{}', { status: 500 });
    if (!handlers.dishdetect) throw new TypeError('fetch failed');
    return handlers.dishdetect();
  }) as typeof fetch;
  return { f, calls };
}

const run = async (deps: Parameters<typeof foodRoutes>[0]) => {
  const prev = { mode: process.env.AUTH_MODE };
  process.env.AUTH_MODE = 'demo';
  try {
    const res = await createRouter(foodRoutes(deps))(photo());
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  } finally {
    if (prev.mode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = prev.mode;
  }
};

describe('POST /ai/food', () => {
  it('uses the team model when it answers, and never calls Sarvam', async () => {
    const { f, calls } = fakeFetch({ dishdetect: () => new Response(JSON.stringify({ isFood: true, items: [], source: 'dishdetect', reliable: false }), { status: 200 }) });
    const r = await run({ fetchImpl: f, dishDetectUrl: 'http://model', sarvamApiKey: 'k' });
    assert.equal(r.status, 200);
    assert.equal(r.body.source, 'dishdetect');
    assert.ok(calls.every((c) => !c.url.includes('sarvam')));
  });

  it('falls back to Sarvam when the model is unreachable, with numbers from the curated catalogue only', async () => {
    const { f, calls } = fakeFetch({ sarvam: () => sarvamReply('```json\n{"isFood": true, "dishes": [{"key": "idli", "name": "Idli", "confidence": 0.95}]}\n```') });
    const r = await run({ fetchImpl: f, dishDetectUrl: 'http://model', sarvamApiKey: 'k' });
    assert.equal(r.status, 200);
    assert.equal(r.body.source, 'vision-llm');
    assert.equal(r.body.reliable, false);
    const item = r.body.items[0];
    assert.equal(item.name, 'Idli');
    assert.equal(item.per100g.kcal, 130);
    assert.equal(item.estimatedGrams, 100);
    assert.equal(item.diet.tier, 'vegan');
    assert.equal(item.confidence, 0.95);
    assert.match(r.body.notes, /general AI image model/);
    const sent = JSON.parse(calls.find((c) => c.url.includes('sarvam'))!.body!);
    assert.equal(sent.model, 'gemma4');
    assert.match(sent.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
  });

  it('goes straight to Sarvam when no model address is configured (hosted server)', async () => {
    const { f, calls } = fakeFetch({ sarvam: () => sarvamReply('{"isFood": true, "dishes": [{"key": "butter_chicken", "name": "Butter chicken", "confidence": 0.9}]}') });
    const prev = process.env.DISHDETECT_URL;
    delete process.env.DISHDETECT_URL;
    try {
      const r = await run({ fetchImpl: f, sarvamApiKey: 'k' });
      assert.equal(r.body.items[0].diet.tier, 'non_veg');
      assert.ok(r.body.items[0].diet.allergens.includes('dairy'));
      assert.equal(calls.length, 1);
    } finally {
      if (prev !== undefined) process.env.DISHDETECT_URL = prev;
    }
  });

  it('shows a dish outside the catalogue by name, with no numbers', async () => {
    const { f } = fakeFetch({ sarvam: () => sarvamReply('{"isFood": true, "dishes": [{"key": null, "name": "Thukpa", "confidence": 0.8}, {"key": "made_up_key", "name": "Mystery", "confidence": 0.5}]}') });
    const r = await run({ fetchImpl: f, dishDetectUrl: 'http://model', sarvamApiKey: 'k' });
    assert.deepEqual(r.body.items.map((i: any) => i.name), ['Thukpa', 'Mystery']);
    assert.ok(r.body.items.every((i: any) => i.per100g.kcal === 0 && i.nutrition.provenance === 'none' && !i.diet));
  });

  it('passes on a model that declines to name the dish (no second opinion)', async () => {
    const { f, calls } = fakeFetch({ dishdetect: () => new Response(JSON.stringify({ isFood: true, items: [], source: 'dishdetect', reliable: false, notes: 'below floor' }), { status: 200 }) });
    const r = await run({ fetchImpl: f, dishDetectUrl: 'http://model', sarvamApiKey: 'k' });
    assert.deepEqual(r.body.items, []);
    assert.equal(calls.length, 1);
  });

  it('a non-food photo comes back as not food', async () => {
    const { f } = fakeFetch({ sarvam: () => sarvamReply('{"isFood": false, "dishes": []}') });
    const r = await run({ fetchImpl: f, dishDetectUrl: 'http://model', sarvamApiKey: 'k' });
    assert.equal(r.body.isFood, false);
    assert.deepEqual(r.body.items, []);
  });

  it('returns the demo fallback when both fail, or when there is no Sarvam key', async () => {
    const both = fakeFetch({ dishdetect: () => new Response('down', { status: 502 }), sarvam: () => new Response('err', { status: 500 }) });
    const r1 = await run({ fetchImpl: both.f, dishDetectUrl: 'http://model', sarvamApiKey: 'k' });
    assert.equal(r1.status, 503);
    assert.equal(r1.body.fallback, 'demo');
    const nokey = fakeFetch({});
    const r2 = await run({ fetchImpl: nokey.f, dishDetectUrl: 'http://model', sarvamApiKey: '' });
    assert.equal(r2.status, 503);
    assert.ok(nokey.calls.every((c) => !c.url.includes('sarvam')));
  });
});

describe('Sarvam rate limit', () => {
  it('waits and retries once on 429', async () => {
    let n = 0;
    const { f } = fakeFetch({
      sarvam: () => (++n === 1 ? new Response('{}', { status: 429, headers: { 'retry-after': '0.5' } }) : sarvamReply('{"isFood": true, "dishes": [{"key": "idli", "name": "Idli", "confidence": 0.9}]}')),
    });
    const r = await run({ fetchImpl: f, dishDetectUrl: 'http://model', sarvamApiKey: 'k' });
    assert.equal(n, 2);
    assert.equal(r.body.items[0].name, 'Idli');
  });
});

describe('parseReply', () => {
  it('reads fenced JSON, drops keys not in the catalogue and clamps confidence', () => {
    const p = parseReply('Sure!\n```json\n{"isFood": true, "dishes": [{"key": "IDLI??", "name": "Idli", "confidence": 3}]}\n```');
    assert.deepEqual(p, { isFood: true, dishes: [{ key: null, name: 'Idli', confidence: 1 }] });
    assert.equal(parseReply('no json here'), null);
    assert.ok(CATALOG_KEYS.length >= 100);
  });
});
