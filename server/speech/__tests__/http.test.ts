import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechHandler, parseLanguage, type SpeechHttpDeps } from '../http.ts';
import { SarvamError } from '../errors.ts';
import type { TranscribeRequest } from '../types.ts';

function deps(overrides: Partial<SpeechHttpDeps> = {}) {
  const seen: TranscribeRequest[] = [];
  const d: SpeechHttpDeps = {
    sarvam: {
      transcribe: async (req) => {
        seen.push(req);
        return { requestId: 'r1', transcript: 'नमस्ते', languageCode: 'hi-IN', languageProbability: null };
      },
      synthesize: async () => ({ requestId: 't1', audiosBase64: ['AAAA'] }),
    },
    chat: {
      async *chatStream() {
        yield 'Rest ';
        yield 'and drink water.';
      },
    },
    ...overrides,
  };
  return { d, seen };
}

/** The same multipart request P3's app sends to Sarvam today. */
function p3SttRequest(fields: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }), 'visit.m4a');
  form.append('model', 'saarika:v2.5');
  form.append('language_code', 'hi-IN');
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request('http://x/speech/stt', { method: 'POST', body: form, headers });
}

describe('POST /speech/stt', () => {
  it("accepts P3's existing request and ignores the client's model", async () => {
    const { d, seen } = deps();
    const res = await createSpeechHandler(d)(p3SttRequest());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { transcript: 'नमस्ते', language_code: 'hi-IN', request_id: 'r1' });
    assert.equal(seen[0].languageCode, 'hi-IN');
    assert.equal(seen[0].model, undefined); // server default (saaras:v3), not saarika
  });

  it('maps or-IN to od-IN and rejects unknown languages and modes', async () => {
    const { d, seen } = deps();
    const h = createSpeechHandler(d);
    await h(p3SttRequest({ language_code: 'or-IN' }));
    assert.equal(seen[0].languageCode, 'od-IN');
    assert.equal((await h(p3SttRequest({ language_code: 'xx-IN' }))).status, 400);
    assert.equal((await h(p3SttRequest({ mode: 'sing' }))).status, 400);
  });

  it('returns 503 with a device fallback when Sarvam is down', async () => {
    const { d } = deps({
      sarvam: {
        transcribe: async () => {
          throw new SarvamError({ kind: 'network', retryable: true, message: 'down' });
        },
        synthesize: async () => ({ requestId: null, audiosBase64: [] }),
      },
    });
    const res = await createSpeechHandler(d)(p3SttRequest());
    assert.equal(res.status, 503);
    assert.equal((await res.json()).fallback, 'device');
  });

  it('requires the app token when one is configured', async () => {
    const { d } = deps({ appToken: 'secret' });
    const h = createSpeechHandler(d);
    assert.equal((await h(p3SttRequest())).status, 401);
    assert.equal((await h(p3SttRequest({}, { 'x-app-token': 'secret' }))).status, 200);
  });
});

describe('POST /speech/tts', () => {
  const tts = (body: unknown) => new Request('http://x/speech/tts', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

  it('returns Bulbul audio for supported languages', async () => {
    const res = await createSpeechHandler(deps().d)(tts({ text: 'नमस्ते', language: 'hi' }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { audioBase64: ['AAAA'], mimeType: 'audio/mpeg', requestId: 't1' });
  });

  it('tells the app to use device speech for Urdu and text only for Kashmiri', async () => {
    const h = createSpeechHandler(deps().d);
    assert.equal((await (await h(tts({ text: 'سلام', language: 'ur' }))).json()).fallback, 'device');
    assert.equal((await (await h(tts({ text: 'سلام', language: 'ks-IN' }))).json()).fallback, 'text-only');
  });

  it('validates input', async () => {
    const h = createSpeechHandler(deps().d);
    assert.equal((await h(tts({ text: '', language: 'hi' }))).status, 400);
    assert.equal((await h(tts({ text: 'x'.repeat(3000), language: 'hi' }))).status, 413);
  });
});

describe('POST /ai/chat', () => {
  it('streams chat events as server-sent events', async () => {
    const req = new Request('http://x/ai/chat', { method: 'POST', body: JSON.stringify({ message: 'fever care?', history: [], language: 'en' }) });
    const res = await createSpeechHandler(deps().d)(req);
    assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const events = (await res.text()).split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')).type);
    assert.deepEqual(events, ['sources', 'delta', 'delta', 'chips', 'done']);
  });

  it('streams the emergency event for red flags', async () => {
    const req = new Request('http://x/ai/chat', { method: 'POST', body: JSON.stringify({ message: 'I have chest pain', language: 'en' }) });
    const text = await (await createSpeechHandler(deps().d)(req)).text();
    assert.match(text, /"type":"emergency"/);
  });
});

describe('parseLanguage', () => {
  it('accepts app and Sarvam codes', () => {
    assert.equal(parseLanguage('hi'), 'hi');
    assert.equal(parseLanguage('ta-IN'), 'ta');
    assert.equal(parseLanguage('or-IN'), 'od');
    assert.equal(parseLanguage('fr'), null);
  });
});
