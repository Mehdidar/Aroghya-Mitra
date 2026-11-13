import { analyzeFood, FoodScanError, parseFoodRecognition } from '../client';
import { clampPortion, macrosForPortion } from '../macros';
import { MOCK_RESULTS } from '../mock';

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
});

describe('macros', () => {
  it('scales per-100 g values by portion (P2 rounding)', () => {
    expect(macrosForPortion({ kcal: 168, proteinG: 3.9, carbsG: 25.6, fatG: 5.6 }, 250)).toEqual({ kcal: 420, proteinG: 9.8, carbsG: 64, fatG: 14 });
    expect(macrosForPortion({ kcal: 100, proteinG: 1, carbsG: 1, fatG: 1 }, 0).kcal).toBe(0);
  });
  it('clamps the portion to 50-500 g in 5 g steps', () => {
    expect(clampPortion(20)).toBe(50);
    expect(clampPortion(999)).toBe(500);
    expect(clampPortion(184)).toBe(185);
  });
});

describe('analyzeFood', () => {
  it('uses a labelled demo result when no server URL is set', async () => {
    const fetchImpl = jest.fn();
    const r = await analyzeFood(photo, { baseUrl: '', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.demo).toBe(true);
    expect(r.demoReason).toBe('unset');
    expect(MOCK_RESULTS).toContain(r.recognition);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to the demo result when the server is unreachable', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const r = await analyzeFood(photo, { baseUrl: 'http://10.0.0.5:8000', fetchImpl: fetchImpl as unknown as typeof fetch, platform: 'ios' });
    expect(r).toMatchObject({ demo: true, demoReason: 'unreachable' });
  });

  it('falls back on timeout', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    );
    const r = await analyzeFood(photo, { baseUrl: 'http://x', fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20, platform: 'android' });
    expect(r.demoReason).toBe('unreachable');
  });

  it('posts multipart `file` to /ai/food and returns the server result', async () => {
    const fetchImpl = okFetch(good);
    const r = await analyzeFood(photo, { baseUrl: 'http://ai.local/', fetchImpl: fetchImpl as unknown as typeof fetch, platform: 'ios' });
    expect(r.demo).toBe(false);
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
