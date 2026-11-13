import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRouter } from '../../http/router.ts';
import { routes } from '../prescription/routes.ts';
import { demoExtraction } from '../prescription/demoExtraction.ts';
import { fieldsToConfirm } from '../prescription/schema.ts';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function upload(bytes: Uint8Array | null, type = 'image/png'): Request {
  const form = new FormData();
  if (bytes) form.append('file', new Blob([bytes as BlobPart], { type }), 'rx.png');
  return new Request('http://x/ai/prescription', { method: 'POST', body: form, headers: { 'x-demo-role': 'patient' } });
}

const withDemoAuth = () => {
  process.env.AUTH_MODE = 'demo';
};

describe('POST /ai/prescription', () => {
  it('returns the demo extraction, labelled, when no vision model is configured', async () => {
    withDemoAuth();
    const handler = createRouter(routes({ extract: null }));
    const res = await handler(upload(png));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { demo: boolean; reason: string; prescription: { medicines: unknown[] } };
    assert.equal(body.demo, true);
    assert.equal(body.reason, 'no_vision_model');
    assert.equal(body.prescription.medicines.length, 3);
  });

  it('parses the model reply through P2 schema when the model answers', async () => {
    withDemoAuth();
    const raw = JSON.stringify({
      isPrescription: true,
      legibility: 'good',
      medicines: [{ name: { value: 'Dolo', confidence: 0.9 }, strength: { value: '650 mg', confidence: 0.9 }, dose: { value: '1 tablet', confidence: 0.9 }, frequencyRaw: { value: '1-0-1', confidence: 0.9 }, timings: { value: ['morning', 'night'], confidence: 0.9 }, durationDays: { value: '5 days', confidence: 0.9 } }],
    });
    let seenMime = '';
    const handler = createRouter(routes({ extract: async (img) => ((seenMime = img.mimeType), raw) }));
    const res = await handler(upload(png));
    const body = (await res.json()) as { demo: boolean; prescription: { medicines: { name: { value: string }; durationDays: { value: number } }[] } };
    assert.equal(seenMime, 'image/png');
    assert.equal(body.demo, false);
    assert.equal(body.prescription.medicines[0].name.value, 'Dolo');
    assert.equal(body.prescription.medicines[0].durationDays.value, 5);
  });

  it('falls back to demo (and says why) when the model fails or replies nonsense', async () => {
    withDemoAuth();
    const broken = createRouter(routes({ extract: async () => 'not json at all' }));
    const b1 = (await (await broken(upload(png))).json()) as { demo: boolean; reason: string };
    assert.equal(b1.demo, true);
    assert.equal(b1.reason, 'parse_error');
    const down = createRouter(routes({ extract: async () => { throw new Error('boom'); } }));
    const b2 = (await (await down(upload(png))).json()) as { demo: boolean };
    assert.equal(b2.demo, true);
  });

  it('rejects a missing file, a non-image and a JSON body without an image', async () => {
    withDemoAuth();
    const handler = createRouter(routes({ extract: null }));
    assert.equal((await handler(upload(null))).status, 400);
    assert.equal((await handler(upload(png, 'text/plain'))).status, 400);
    const r = await handler(new Request('http://x/ai/prescription', { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-role': 'patient' }, body: '{}' }));
    assert.equal(r.status, 400);
  });

  it('accepts a base64 JSON body too', async () => {
    withDemoAuth();
    const handler = createRouter(routes({ extract: null }));
    const r = await handler(new Request('http://x/ai/prescription', { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-role': 'patient' }, body: JSON.stringify({ imageBase64: Buffer.from(png).toString('base64'), mimeType: 'image/png' }) }));
    assert.equal(r.status, 200);
  });

  it('the demo extraction has exactly the low-confidence fields the review screen must flag', () => {
    const d = demoExtraction();
    assert.deepEqual(fieldsToConfirm(d.medicines[1]), ['strength']);
    assert.deepEqual(fieldsToConfirm(d.medicines[0]), []);
  });
});
