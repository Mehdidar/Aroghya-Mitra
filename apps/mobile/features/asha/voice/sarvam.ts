import { apiFetch, ApiError } from '@/features/shared/services/api';

import { config } from '../services/config';
import type { Lang } from '../types';
import { filePart } from '@/features/shared/services/filePart';

/**
 * Speech-to-text for the voice visit report, through the server's
 * POST /speech/stt (server/speech/http.ts), which calls Sarvam saaras:v3 with
 * the key kept server-side. The request takes the same multipart fields as
 * Sarvam's own API (file, language_code); the server ignores any `model`.
 * Clips are under 30 s (the synchronous endpoint's limit).
 */
export const STT_MAX_SECONDS = 29;

export class SttUnavailableError extends Error {}

export function sttConfigured(): boolean {
  return Boolean(config.apiUrl);
}

const LANG_CODE: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN' };

export async function transcribe(fileUri: string, lang: Lang): Promise<string> {
  if (!sttConfigured()) throw new SttUnavailableError('Speech-to-text is not configured');

  const form = new FormData();
  form.append('file', await filePart(fileUri, 'visit.m4a', 'audio/mp4'));
  form.append('language_code', LANG_CODE[lang]);

  try {
    const res = await apiFetch('/speech/stt', { method: 'POST', body: form, timeoutMs: 45_000 });
    const body = (await res.json()) as { transcript?: string };
    return (body.transcript ?? '').trim();
  } catch (e) {
    if (e instanceof ApiError) {
      // 503 means the server has no speech provider right now: the screen offers typing instead.
      if (e.status === 503) throw new SttUnavailableError('Speech-to-text is unavailable on the server');
      throw new Error(`Speech-to-text failed (HTTP ${e.status})`);
    }
    if ((e as Error).name === 'AbortError') throw new SttUnavailableError('Speech-to-text timed out');
    if (e instanceof TypeError) throw new SttUnavailableError('No internet for speech-to-text');
    throw e;
  }
}
