/**
 * Record with expo-audio, transcribe with the server: POST /speech/stt
 * (multipart `file`, `language_code`), the same fields as Sarvam's API, so no
 * key is needed on the phone. Metering (0..1) drives the VoiceOrb halo.
 */
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { LANGUAGES, type LanguageCode } from '@am/shared';

import { ApiError, apiFetch } from '@/features/shared/services/api';
import { filePart } from '@/features/shared/services/filePart';

export const STT_MAX_SECONDS = 29;

export type VoiceInputState = 'idle' | 'recording' | 'transcribing' | 'error';
export type VoiceInputError = { kind: 'permission' | 'stt_unavailable' | 'network' | 'other'; message: string };

export interface Transcript {
  text: string;
  languageCode: string | null;
}

export class SttUnavailableError extends Error {}

/** dBFS (-160..0) to 0..1 */
export function meterLevel(metering: number | undefined): number {
  if (metering === undefined || !Number.isFinite(metering)) return 0;
  return Math.min(1, Math.max(0, (metering + 60) / 60));
}

export async function transcribeFile(uri: string, lang: LanguageCode, fetchImpl?: typeof fetch): Promise<Transcript> {
  const form = new FormData();
  const name = Platform.OS === 'web' ? 'clip.webm' : 'clip.m4a';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, name);
  } else {
    // expo/fetch does not send React Native's { uri, name, type } parts: see filePart.ts.
    form.append('file', await filePart(uri, name, 'audio/mp4'));
  }
  form.append('language_code', LANGUAGES[lang].sarvam);
  form.append('mode', 'transcribe');
  try {
    const res = await apiFetch('/speech/stt', { method: 'POST', body: form, timeoutMs: 45_000, fetchImpl });
    const body = (await res.json()) as { transcript?: string; language_code?: string };
    return { text: (body.transcript ?? '').trim(), languageCode: body.language_code ?? null };
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) throw new SttUnavailableError('Speech service unavailable');
    if (e instanceof ApiError) throw e;
    throw new SttUnavailableError((e as Error).message);
  }
}

export function useVoiceInput(lang: LanguageCode) {
  const [state, setState] = useState<VoiceInputState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<VoiceInputError | null>(null);
  const [audioUri, setAudioUri] = useState<string | undefined>();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const activeRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTranscriptRef = useRef<((t: Transcript) => void) | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = useCallback(async () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimer();
    setLevel(0);
    try {
      await recorder.stop();
    } catch {
      /* already stopped */
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    const uri = recorder.uri ?? undefined;
    setAudioUri(uri);
    if (!uri) {
      setState('idle');
      return;
    }
    setState('transcribing');
    try {
      const t = await transcribeFile(uri, lang);
      setState('idle');
      onTranscriptRef.current?.(t);
    } catch (e) {
      setError({ kind: e instanceof SttUnavailableError ? 'stt_unavailable' : e instanceof ApiError ? 'other' : 'network', message: (e as Error).message });
      setState('error');
    }
  }, [lang, recorder]);

  const start = useCallback(
    async (onTranscript: (t: Transcript) => void) => {
      setError(null);
      onTranscriptRef.current = onTranscript;
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError({ kind: 'permission', message: 'Microphone permission denied' });
        setState('error');
        return;
      }
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        activeRef.current = true;
        setSeconds(0);
        setState('recording');
        const startedAt = Date.now();
        timerRef.current = setInterval(() => {
          const s = Math.floor((Date.now() - startedAt) / 1000);
          setSeconds(s);
          try {
            setLevel(meterLevel(recorder.getStatus().metering));
          } catch {
            /* metering unsupported */
          }
          if (s >= STT_MAX_SECONDS) void stop();
        }, 250);
      } catch (e) {
        setError({ kind: 'other', message: (e as Error).message });
        setState('error');
      }
    },
    [recorder, stop],
  );

  useEffect(
    () => () => {
      clearTimer();
      if (activeRef.current) recorder.stop().catch(() => undefined);
    },
    [recorder],
  );

  return { state, seconds, level, error, audioUri, start, stop, maxSeconds: STT_MAX_SECONDS };
}
