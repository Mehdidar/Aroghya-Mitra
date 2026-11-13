/**
 * Speak a reply: POST /speech/tts {text, language} -> base64 mp3 played with
 * expo-audio; on 503 {fallback:'device'} (no server voice for the language,
 * or the service is down) or any network failure, the device voice
 * (expo-speech) reads it instead. Returns which path spoke.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { LANGUAGES, type LanguageCode } from '@am/shared';

import { ApiError, apiJson } from '@/features/shared/services/api';

export type SpokenVia = 'server' | 'device' | 'none';

let current: AudioPlayer | null = null;

export async function stopSpeaking(): Promise<void> {
  try {
    current?.pause();
    current?.remove();
  } catch {
    /* already gone */
  }
  current = null;
  await Speech.stop().catch(() => undefined);
}

async function playBase64Mp3(b64: string, onDone: () => void): Promise<void> {
  let uri: string;
  if (Platform.OS === 'web') {
    uri = `data:audio/mpeg;base64,${b64}`;
  } else {
    // expo-file-system 58: File API. Lazy import keeps Jest and web light.
    const fs = await import('expo-file-system');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new fs.File(fs.Paths.cache, `tts-${Date.now()}.mp3`);
    file.write(bytes);
    uri = file.uri;
  }
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
  const player = createAudioPlayer({ uri });
  current = player;
  player.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish) {
      if (current === player) current = null;
      player.remove();
      onDone();
    }
  });
  player.play();
}

function speakOnDevice(text: string, lang: LanguageCode, onDone: () => void): boolean {
  try {
    Speech.speak(text, { language: LANGUAGES[lang].bcp47, onDone, onStopped: onDone, onError: onDone });
    return true;
  } catch {
    onDone();
    return false;
  }
}

export async function speak(text: string, lang: LanguageCode, opts: { onDone?: () => void; fetchImpl?: typeof fetch } = {}): Promise<SpokenVia> {
  await stopSpeaking();
  const done = () => opts.onDone?.();
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 2500);
  if (!clean) {
    done();
    return 'none';
  }
  if (LANGUAGES[lang].tts === 'bulbul') {
    try {
      const r = await apiJson<{ audioBase64?: string | string[]; mimeType?: string }>('/speech/tts', { text: clean, language: lang }, { timeoutMs: 30_000, fetchImpl: opts.fetchImpl });
      const b64 = Array.isArray(r.audioBase64) ? r.audioBase64.join('') : r.audioBase64;
      if (b64) {
        await playBase64Mp3(b64, done);
        return 'server';
      }
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 503)) {
        // network or other error: device voice
      }
    }
  }
  if (LANGUAGES[lang].tts === 'none') {
    done();
    return 'none';
  }
  return speakOnDevice(clean, lang, done) ? 'device' : 'none';
}
