import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SarvamClient } from '../sarvamClient.ts';
import { SarvamError, classifyHttpError, parseRetryAfter } from '../errors.ts';

type Call = { url: string; init: RequestInit };

function client(responses: (Response | Error | ((init: RequestInit) => Promise<Response>))[], extra: Partial<ConstructorParameters<typeof SarvamClient>[0]> = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(init);
    return next;
  }) as unknown as typeof fetch;
  const c = new SarvamClient({
    apiKey: 'test-key',
    fetch: fetchImpl,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
    ...extra,
  });
  return { c, calls, sleeps };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('SarvamClient retries', () => {
  it('sends the api-subscription-key header and JSON body', async () => {
    const { c, calls } = client([json({ request_id: 'r1', translated_text: 'नमस्ते', source_language_code: 'en-IN' })]);
    const r = await c.translate({ input: 'Hello', sourceLanguageCode: 'en-IN', targetLanguageCode: 'hi-IN' });
    assert.equal(r.translatedText, 'नमस्ते');
    assert.equal(calls[0].url, 'https://api.sarvam.ai/translate');
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers['api-subscription-key'], 'test-key');
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      input: 'Hello', source_language_code: 'en-IN', target_language_code: 'hi-IN', model: 'mayura:v1',
    });
  });

  it('retries 503 with backoff, then succeeds', async () => {
    const { c, calls, sleeps } = client([
      json({ error: { message: 'overloaded', code: 'model_overloaded' } }, 503),
      json({ error: { message: 'overloaded' } }, 502),
      json({ request_id: 'r', language_code: 'hi-IN', script_code: 'Deva' }),
    ]);
    const r = await c.identifyLanguage('नमस्ते');
    assert.equal(r.languageCode, 'hi-IN');
    assert.equal(calls.length, 3);
    // equal jitter with random=0.5: 300*2^n capped at 4000, times 0.75
    assert.deepEqual(sleeps, [225, 450]);
  });

  it('honours Retry-After on 429', async () => {
    const { c, sleeps } = client([
      json({ error: { message: 'slow down', code: 'rate_limit_exceeded_error' } }, 429, { 'retry-after': '2' }),
      json({ request_id: 'r', language_code: 'en-IN', script_code: 'Latn' }),
    ]);
    await c.identifyLanguage('hello');
    assert.deepEqual(sleeps, [2000]);
  });

  it('does not retry auth or quota errors', async () => {
    for (const [status, code, kind] of [
      [403, 'invalid_api_key_error', 'auth'],
      [402, 'insufficient_quota_error', 'quota'],
      [429, 'seat_budget_exhausted_error', 'quota'],
      [400, 'invalid_request_error', 'bad_request'],
    ] as const) {
      const { c, calls } = client([json({ error: { message: 'no', code } }, status)]);
      await assert.rejects(c.identifyLanguage('x'), (e: unknown) => e instanceof SarvamError && e.kind === kind && !e.retryable);
      assert.equal(calls.length, 1, `${status} ${code} should not retry`);
    }
  });

  it('gives up after maxRetries and reports a network error as service unavailable', async () => {
    const { c, calls } = client([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')], { maxRetries: 2 });
    await assert.rejects(c.identifyLanguage('x'), (e: unknown) => e instanceof SarvamError && e.kind === 'network' && e.isServiceUnavailable);
    assert.equal(calls.length, 3);
  });

  it('times out slow requests', async () => {
    const hang = (init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const { c } = client([hang], { timeoutMs: 20, maxRetries: 0 });
    await assert.rejects(c.identifyLanguage('x'), (e: unknown) => e instanceof SarvamError && e.kind === 'timeout');
  });

  it('does not retry when the caller aborts', async () => {
    const ac = new AbortController();
    const hang = (init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        ac.abort();
      });
    const { c, calls } = client([hang]);
    await assert.rejects(c.identifyLanguage('x', { signal: ac.signal }), (e: unknown) => e instanceof SarvamError && e.kind === 'aborted');
    assert.equal(calls.length, 1);
  });

  it('rebuilds the multipart body on retry for STT', async () => {
    const { c, calls } = client([json({}, 500), json({ request_id: 'r', transcript: 'नमस्ते', language_code: 'hi-IN' })]);
    const r = await c.transcribe({ audio: new Uint8Array([1, 2, 3]), mimeType: 'audio/wav', mode: 'transcribe' });
    assert.equal(r.transcript, 'नमस्ते');
    assert.notEqual(calls[0].init.body, calls[1].init.body);
    const form = calls[1].init.body as FormData;
    assert.equal(form.get('model'), 'saaras:v3');
    assert.equal(form.get('mode'), 'transcribe');
    assert.equal(form.get('language_code'), 'unknown');
  });
});

describe('SarvamClient chat streaming', () => {
  it('yields content deltas from SSE', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Nam"}}]}\n\ndata: {"choices":[{"delta":{"content":"aste"}}]}\n',
      '\ndata: [DONE]\n\n',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(ctrl) {
        for (const s of sse) ctrl.enqueue(new TextEncoder().encode(s));
        ctrl.close();
      },
    });
    const { c, calls } = client([new Response(body, { status: 200 })]);
    let text = '';
    for await (const d of c.chatStream({ messages: [{ role: 'user', content: 'hi' }] })) text += d;
    assert.equal(text, 'Namaste');
    assert.equal(calls[0].url, 'https://api.sarvam.ai/v2/chat/completions');
    assert.equal(JSON.parse(String(calls[0].init.body)).stream, true);
  });
});

describe('SarvamClient chat', () => {
  it('defaults to the fast non-reasoning model', async () => {
    const { c, calls } = client([json({ model: 'sarvam-105b-conversations', choices: [{ finish_reason: 'stop', message: { content: ' ORS है। ' } }] })]);
    const r = await c.chat({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(r.content, 'ORS है।');
    assert.equal(r.finishReason, 'stop');
    assert.equal(JSON.parse(String(calls[0].init.body)).model, 'sarvam-105b-conversations');
  });

  it('throws a clear error when reasoning used up max_tokens', async () => {
    const { c } = client([json({ choices: [{ finish_reason: 'length', message: { content: null, reasoning_content: 'thinking...' } }] })]);
    await assert.rejects(c.chat({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 50 }), /max_tokens ran out/);
  });
});

describe('translate', () => {
  it("rejects source 'auto' with sarvam-translate", async () => {
    const { c, calls } = client([]);
    await assert.rejects(
      c.translate({ input: 'x', sourceLanguageCode: 'auto', targetLanguageCode: 'ur-IN', model: 'sarvam-translate:v1' }),
      (e: unknown) => e instanceof SarvamError && e.kind === 'bad_request',
    );
    assert.equal(calls.length, 0);
  });
});

describe('error helpers', () => {
  it('classifies statuses', () => {
    assert.deepEqual(classifyHttpError(503), { kind: 'server', retryable: true });
    assert.deepEqual(classifyHttpError(429), { kind: 'rate_limit', retryable: true });
    assert.deepEqual(classifyHttpError(422), { kind: 'bad_request', retryable: false });
  });
  it('parses Retry-After seconds and dates', () => {
    assert.equal(parseRetryAfter('3'), 3000);
    assert.equal(parseRetryAfter(new Date(10_000).toUTCString(), 4_000), 6000);
    assert.equal(parseRetryAfter('soon'), undefined);
  });
});
