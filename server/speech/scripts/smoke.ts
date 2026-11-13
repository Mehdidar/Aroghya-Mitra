/**
 * Live check of every Sarvam API we use, with timings.
 *
 *   SARVAM_API_KEY=... npx tsx server/speech/scripts/smoke.ts [outDir]
 *
 * TTS output is fed back into STT (REST and realtime socket), so no sample audio file is needed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSarvamClientFromEnv } from '../config';
import { base64ToBytes } from '../sarvamClient';
import { SarvamError } from '../errors';
import { parseWav, pcm16BytesFor } from '../wav';

const HINDI = 'नमस्ते, मुझे दो दिन से बुखार और सिरदर्द है। मुझे क्या करना चाहिए?';
const ENGLISH = 'Take one tablet after food, twice a day, for five days.';

type Row = { step: string; ok: boolean; ms: number; detail: string };
const rows: Row[] = [];

async function step(name: string, fn: () => Promise<string>) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    rows.push({ step: name, ok: true, ms: Math.round(performance.now() - t0), detail });
  } catch (e) {
    const detail = e instanceof SarvamError ? `${e.kind} ${e.status ?? ''} ${e.code ?? ''} ${e.message}` : String(e);
    rows.push({ step: name, ok: false, ms: Math.round(performance.now() - t0), detail });
  }
}

async function main() {
  const outDir = process.argv[2] ?? join(tmpdir(), 'sarvam-smoke');
  await mkdir(outDir, { recursive: true });
  const sarvam = createSarvamClientFromEnv();
  let wav16k: Uint8Array | null = null;

  await step('LID (text-lid)', async () => {
    const r = await sarvam.identifyLanguage(HINDI);
    return `${r.languageCode} / ${r.scriptCode}`;
  });

  await step('Translate en→hi (mayura:v1)', async () => {
    const r = await sarvam.translate({ input: ENGLISH, sourceLanguageCode: 'en-IN', targetLanguageCode: 'hi-IN', model: 'mayura:v1', mode: 'modern-colloquial' });
    return r.translatedText;
  });

  await step('Translate en→ur (sarvam-translate:v1)', async () => {
    const r = await sarvam.translate({ input: ENGLISH, sourceLanguageCode: 'en-IN', targetLanguageCode: 'ur-IN', model: 'sarvam-translate:v1' });
    return r.translatedText;
  });

  await step('TTS REST hi-IN (bulbul:v3, 16 kHz wav)', async () => {
    const r = await sarvam.synthesize({ text: HINDI, languageCode: 'hi-IN', sampleRate: 16000, codec: 'wav' });
    wav16k = base64ToBytes(r.audiosBase64[0]);
    await writeFile(join(outDir, 'tts-hi.wav'), wav16k);
    const info = parseWav(wav16k);
    return `${(info.pcm.length / 2 / info.sampleRate).toFixed(1)} s @ ${info.sampleRate} Hz → ${join(outDir, 'tts-hi.wav')}`;
  });

  await step('TTS stream hi-IN (time to first byte)', async () => {
    const t0 = performance.now();
    const { stream, contentType } = await sarvam.synthesizeStream({ text: HINDI, languageCode: 'hi-IN' });
    const reader = stream.getReader();
    let first = -1;
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (first < 0) first = Math.round(performance.now() - t0);
      bytes += value.length;
    }
    return `${contentType}, first byte ${first} ms, ${bytes} bytes`;
  });

  await step('STT REST (saaras:v3, transcribe)', async () => {
    if (!wav16k) throw new Error('needs TTS output');
    const r = await sarvam.transcribe({ audio: wav16k, mimeType: 'audio/wav', mode: 'transcribe', languageCode: 'unknown' });
    return `[${r.languageCode}] ${r.transcript}`;
  });

  await step('STT REST (saaras:v3, translate → English)', async () => {
    if (!wav16k) throw new Error('needs TTS output');
    const r = await sarvam.transcribe({ audio: wav16k, mimeType: 'audio/wav', mode: 'translate' });
    return r.transcript;
  });

  await step('STT realtime WebSocket', async () => {
    if (!wav16k) throw new Error('needs TTS output');
    const { pcm, sampleRate } = parseWav(wav16k);
    const finals: string[] = [];
    let firstPartialMs = -1;
    const t0 = performance.now();
    const session = sarvam.openRealtimeTranscription(
      { languageCode: 'hi-IN', sampleRate: 16000, encoding: 'linear16' },
      {
        onPartial: () => {
          if (firstPartialMs < 0) firstPartialMs = Math.round(performance.now() - t0);
        },
        onFinal: (t) => finals.push(t.text),
      },
    );
    if (sampleRate !== 16000) throw new Error(`expected 16 kHz, got ${sampleRate}`);
    await session.ready;
    const chunk = pcm16BytesFor(100, 16000);
    for (let i = 0; i < pcm.length; i += chunk) {
      session.sendAudio(pcm.subarray(i, i + chunk));
      await new Promise((r) => setTimeout(r, 100)); // real-time pacing
    }
    session.sendAudio(new Uint8Array(pcm16BytesFor(1000, 16000))); // 1 s of silence for VAD
    session.end();
    const timer = setTimeout(() => session.close(), 8000);
    const closed = await session.closed;
    clearTimeout(timer);
    return `first partial ${firstPartialMs} ms, close ${closed.code}, final: ${finals.join(' | ') || '(none)'}`;
  });

  await step('Chat (non-streaming)', async () => {
    const r = await sarvam.chat({ messages: [{ role: 'user', content: 'Reply with one short sentence in Hindi: what is ORS?' }], maxTokens: 200 });
    if (!r.content) throw new Error(`empty reply (finish_reason ${r.finishReason})`);
    return `${r.model}: ${r.content.slice(0, 160)}`;
  });

  await step('Chat (streaming, time to first token)', async () => {
    const t0 = performance.now();
    let first = -1;
    let text = '';
    for await (const delta of sarvam.chatStream({ messages: [{ role: 'user', content: 'Say hello in Tamil in one sentence.' }], maxTokens: 200 })) {
      if (first < 0) first = Math.round(performance.now() - t0);
      text += delta;
    }
    if (!text.trim()) throw new Error('stream produced no content');
    return `first token ${first} ms: ${text.slice(0, 120)}`;
  });

  console.log('\nSarvam smoke test\n');
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(r.ms).padStart(6)} ms  ${r.step}\n        ${r.detail}`);
  process.exitCode = rows.every((r) => r.ok) ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
