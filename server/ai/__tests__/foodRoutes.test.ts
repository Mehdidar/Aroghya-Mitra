import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRouter } from '../../http/router.ts';
import { foodRoutes } from '../food/routes.ts';

const photo = () => {
  const f = new FormData();
  f.append('file', new Blob([new Uint8Array(64)], { type: 'image/jpeg' }), 'meal.jpg');
  return f;
};
const post = (body: FormData | string, headers: Record<string, string> = {}) =>
  new Request('http://x/ai/food', { method: 'POST', body, headers: { 'x-demo-role': 'patient', ...headers } });

describe('POST /ai/food', () => {
  it('proxies the photo to DishDetect and returns its FoodRecognition verbatim', async () => {
    process.env.AUTH_MODE = 'demo';
    const seen: { url: string; hasFile: boolean }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, hasFile: (init.body as FormData).get('file') instanceof Blob });
      return new Response(JSON.stringify({ isFood: true, items: [{ name: 'Idli' }], source: 'dishdetect', reliable: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const handler = createRouter(foodRoutes({ fetchImpl, dishDetectUrl: 'http://ml:8000/' }));
    const res = await handler(post(photo()));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).items[0].name, 'Idli');
    assert.deepEqual(seen, [{ url: 'http://ml:8000/ai/food', hasFile: true }]);
  });

  it('answers 503 with a demo fallback hint when the model service is down', async () => {
    process.env.AUTH_MODE = 'demo';
    const fetchImpl = (async () => {
      throw new TypeError('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const res = await createRouter(foodRoutes({ fetchImpl }))(post(photo()));
    assert.equal(res.status, 503);
    assert.equal((await res.json()).fallback, 'demo');
  });

  it('rejects a request without a photo', async () => {
    process.env.AUTH_MODE = 'demo';
    const res = await createRouter(foodRoutes({ fetchImpl: fetch }))(post('{}', { 'content-type': 'application/json' }));
    assert.equal(res.status, 400);
  });
});
