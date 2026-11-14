import { analyzeFood, FoodScanError, parseFoodRecognition, sendFoodFeedback } from '../client';
import { clampPortion, extrasForPortion, macrosForPortion } from '../macros';
import { MOCK_RESULTS } from '../testFixtures';

const photo = { uri: 'file:///tmp/meal.jpg', mimeType: 'image/jpeg', fileName: 'meal.jpg' };

const good = {
  isFood: true,
  items: [
    {
      name: 'Idli',
      localName: 'ಇಡ್ಲಿ',
      isIndianDish: true,
      portionDescription: '2 idlis',
      estimatedGrams: '120',
      per100g: { kcal: 146, proteinG: 4.5, carbsG: 30, fatG: 0.6 },
      confidence: 0.9,
    },
  ],
  notes: null,
  source: 'dishdetect',
  reliable: true,
};

function okFetch(body: unknown, status = 200) {
  return jest.fn(async () => ({ ok: status < 400, status, json: async () => body }) as unknown as Response);
}

describe('parseFoodRecognition', () => {
  it('parses a recognised dish and coerces string grams', () => {
    const r = parseFoodRecognition(good);
    expect(r.items[0].name).toBe('Idli');
    expect(r.items[0].estimatedGrams).toBe(120);
    expect(r.reliable).toBe(true);
  });

  it('parses a not-recognised result (no items, unreliable)', () => {
    const r = parseFoodRecognition({ isFood: true, items: [], notes: 'Indian dish head not trained', source: 'dishdetect', reliable: false });
    expect(r.items).toHaveLength(0);
    expect(r.reliable).toBe(false);
  });

  it('accepts a dish with no nutrition (all-zero per100g, as P2 maps nutrition: null)', () => {
    const r = parseFoodRecognition({ ...good, items: [{ ...good.items[0], per100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } }], reliable: false });
    expect(r.items[0].per100g.kcal).toBe(0);
  });

  it('rejects a malformed body', () => {
    expect(() => parseFoodRecognition({ items: 'nope' })).toThrow(FoodScanError);
  });

  it('parses DishDetect extras: extra nutrients, diet restrictions, provenance and requestId', () => {
    const r = parseFoodRecognition({
      ...good,
      requestId: 'req-1',
      items: [
        {
          ...good.items[0],
          per100g: { ...good.items[0].per100g, fiberG: '1.5', sugarsG: 0.5, sodiumMg: 250 },
          diet: {
            tier: 'vegan',
            reliable: true,
            allergens: ['dairy', 'kryptonite'],
            containsOnionGarlic: false,
            suitable: { vegan: true, no_onion_garlic: true },
            cautions: [{ code: 'hypertension', level: 'moderate' }, { code: 'made_up', level: 'high' }],
          },
          nutrition: { provenance: 'estimated', source: 'Curated estimate: IFCT 2017', note: null },
        },
      ],
    });
    expect(r.requestId).toBe('req-1');
    const item = r.items[0];
    expect(item.per100g).toMatchObject({ fiberG: 1.5, sugarsG: 0.5, sodiumMg: 250 });
    expect(item.diet?.tier).toBe('vegan');
    expect(item.diet?.allergens).toEqual(['dairy']); // unknown allergen dropped, not fatal
    expect(item.diet?.cautions).toEqual([{ code: 'hypertension', level: 'moderate' }]); // unknown caution dropped
    expect(item.diet?.suitable.no_onion_garlic).toBe(true);
    expect(item.nutrition?.provenance).toBe('estimated');
  });

  it('still parses a P2 response with none of the extras', () => {
    const r = parseFoodRecognition(good);
    expect(r.items[0].diet).toBeUndefined();
    expect(r.items[0].nutrition).toBeUndefined();
    expect(r.items[0].per100g.fiberG).toBeUndefined();
    expect(r.requestId ?? null).toBeNull();
  });
});

describe('macros', () => {
  it('scales per-100 g values by portion (P2 rounding)', () => {
    expect(macrosForPortion({ kcal: 168, proteinG: 3.9, carbsG: 25.6, fatG: 5.6 }, 250)).toEqual({ kcal: 420, proteinG: 9.8, carbsG: 64, fatG: 14 });
    expect(macrosForPortion({ kcal: 100, proteinG: 1, carbsG: 1, fatG: 1 }, 0).kcal).toBe(0);
  });
  it('scales the extras and omits the ones the server did not send', () => {
    expect(extrasForPortion({ kcal: 1, proteinG: 1, carbsG: 1, fatG: 1, fiberG: 2, sodiumMg: 330 }, 180)).toEqual({ fiberG: 3.6, sodiumMg: 594 });
    expect(extrasForPortion({ kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 }, 180)).toEqual({});
  });
  it('clamps the portion to 50-500 g in 5 g steps', () => {
    expect(clampPortion(20)).toBe(50);
    expect(clampPortion(999)).toBe(500);
    expect(clampPortion(184)).toBe(185);
  });
});

describe('analyzeFood', () => {
  it('says the food scan is not set up when no server URL is set (no sample dish)', async () => {
    const fetchImpl = jest.fn();
    await expect(analyzeFood(photo, { baseUrl: '', fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('says it cannot reach the server when the network fails (no sample dish)', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(analyzeFood(photo, { baseUrl: 'http://10.0.0.5:8000', fetchImpl: fetchImpl as unknown as typeof fetch, platform: 'ios' })).rejects.toMatchObject({ kind: 'offline' });
  });

  it('treats a timeout as offline', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    );
    await expect(analyzeFood(photo, { baseUrl: 'http://x', fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20, platform: 'android' })).rejects.toMatchObject({ kind: 'offline' });
  });

  it('posts multipart `file` to /ai/food and returns the server result', async () => {
    const fetchImpl = okFetch(good);
    const r = await analyzeFood(photo, { baseUrl: 'http://ai.local/', fetchImpl: fetchImpl as unknown as typeof fetch, platform: 'ios' });
    expect(r.recognition.items[0].name).toBe('Idli');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://ai.local/ai/food');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('throws typed errors for HTTP failures instead of faking a result', async () => {
    await expect(analyzeFood(photo, { baseUrl: 'http://x', fetchImpl: okFetch({}, 413) as unknown as typeof fetch, platform: 'ios' })).rejects.toMatchObject({ kind: 'too_large' });
    await expect(analyzeFood(photo, { baseUrl: 'http://x', fetchImpl: okFetch({}, 429) as unknown as typeof fetch, platform: 'ios' })).rejects.toMatchObject({ kind: 'rate_limited' });
    await expect(analyzeFood(photo, { baseUrl: 'http://x', fetchImpl: okFetch({}, 503) as unknown as typeof fetch, platform: 'ios' })).rejects.toMatchObject({ kind: 'server' });
  });
});

describe('sendFoodFeedback', () => {
  it('posts a wrong_dish correction against the requestId', async () => {
    const fetchImpl = okFetch({ ok: true });
    const r = await sendFoodFeedback(' Ragi mudde ', { baseUrl: 'http://ai.local', apiKey: 'k', requestId: 'req-1', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.sent).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://ai.local/feedback');
    expect(JSON.parse(init.body as string)).toEqual({ request_id: 'req-1', kind: 'wrong_dish', correct_dish: 'Ragi mudde' });
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
  });

  it('sends nothing without a server, a requestId or a name, and never throws', async () => {
    const fetchImpl = okFetch({ ok: true });
    expect(await sendFoodFeedback('x', { baseUrl: '', requestId: 'r', fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ sent: false });
    expect(await sendFoodFeedback('x', { baseUrl: 'http://ai.local', requestId: null, fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ sent: false });
    expect(await sendFoodFeedback('   ', { baseUrl: 'http://ai.local', requestId: 'r', fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ sent: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    const failing = jest.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await sendFoodFeedback('x', { baseUrl: 'http://ai.local', requestId: 'r', fetchImpl: failing as unknown as typeof fetch })).toEqual({ sent: false });
  });
});
