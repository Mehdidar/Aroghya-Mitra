import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GeminiError, geminiGenerateWithModel } from '../gemini.ts';

const ok = (text: string, model: string) =>
  new Response(JSON.stringify({ model, steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'text', text }] }] }), { status: 200 });

describe('geminiGenerateWithModel (Interactions API)', () => {
  it('sends the image and system prompt, reads model_output text', async () => {
    type Sent = { url: string; body: { model: string; system_instruction: string; input: { type: string; mime_type?: string }[] }; key: string | null };
    const calls: Sent[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string), key: new Headers(init.headers).get('x-goog-api-key') });
      return ok('{"isPrescription":true}', 'gemini-3.6-flash');
    }) as unknown as typeof fetch;
    const r = await geminiGenerateWithModel({ system: 'sys', user: 'read' }, { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' }, { apiKey: 'k', fetchImpl });
    assert.equal(r.text, '{"isPrescription":true}');
    assert.equal(r.model, 'gemini-3.6-flash');
    const sent = calls[0];
    assert.equal(sent.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(sent.key, 'k');
    assert.equal(sent.body.system_instruction, 'sys');
    assert.deepEqual(sent.body.input.map((p) => p.type), ['text', 'image']);
    assert.equal(sent.body.input[1].mime_type, 'image/jpeg');
  });

  it('walks the model chain past 404 and 503, and stops at a 400', async () => {
    const seen: string[] = [];
    const statuses = [404, 503];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen.push(JSON.parse(init.body as string).model);
      const s = statuses.shift();
      return s ? new Response('busy', { status: s }) : ok('fine', 'm3');
    }) as unknown as typeof fetch;
    const r = await geminiGenerateWithModel({ system: '', user: 'x' }, null, { apiKey: 'k', fetchImpl, model: 'custom' });
    assert.equal(r.text, 'fine');
    assert.equal(seen[0], 'custom');
    assert.equal(seen.length, 3);

    const bad = (async () => new Response('bad request', { status: 400 })) as unknown as typeof fetch;
    await assert.rejects(geminiGenerateWithModel({ system: '', user: 'x' }, null, { apiKey: 'k', fetchImpl: bad }), (e) => e instanceof GeminiError && e.status === 400);
  });

  it('refuses without a key', async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(geminiGenerateWithModel({ system: '', user: 'x' }, null), GeminiError);
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
  });
});
