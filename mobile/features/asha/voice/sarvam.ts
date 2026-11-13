import { config } from '../services/config';
import type { Lang } from '../types';

/**
 * Sarvam speech-to-text (REST, synchronous, clips < 30 s).
 * Docs: https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe
 *
 * Prefer EXPO_PUBLIC_SARVAM_STT_URL (a backend proxy that adds the key) so the key is
 * not shipped inside the APK. The direct-key path exists for hackathon demos only.
 */
export const STT_MAX_SECONDS = 29;

export class SttUnavailableError extends Error {}

export function sttConfigured(): boolean {
  return Boolean(config.sttProxyUrl || config.sarvamApiKey);
}

const LANG_CODE: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN' };

export async function transcribe(fileUri: string, lang: Lang): Promise<string> {
  if (!sttConfigured()) throw new SttUnavailableError('Speech-to-text is not configured');

  const form = new FormData();
  form.append('file', { uri: fileUri, name: 'visit.m4a', type: 'audio/mp4' } as unknown as Blob);
  form.append('model', config.sarvamSttModel);
  form.append('language_code', LANG_CODE[lang]);

  const url = config.sttProxyUrl || 'https://api.sarvam.ai/speech-to-text';
  const headers: Record<string, string> = config.sttProxyUrl ? {} : { 'api-subscription-key': config.sarvamApiKey };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: form, signal: ctrl.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Sarvam STT ${res.status}: ${detail.slice(0, 200)}`);
    }
    const body = (await res.json()) as { transcript?: string };
    return (body.transcript ?? '').trim();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new SttUnavailableError('Speech-to-text timed out');
    if (e instanceof TypeError) throw new SttUnavailableError('No internet for speech-to-text');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
