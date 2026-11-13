import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '../types';
import { STT_MAX_SECONDS, SttUnavailableError, transcribe } from './sarvam';

export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'error';

/**
 * Record → stop → Sarvam STT. The audio file URI is kept even if transcription fails,
 * so the visit can still be saved and the transcript typed by hand.
 */
export function useVoiceReport(lang: Lang) {
  const [state, setState] = useState<VoiceState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<{ kind: 'permission' | 'stt' | 'other'; message: string } | null>(null);
  const [audioUri, setAudioUri] = useState<string | undefined>();
  // expo-av was removed from recent SDKs; expo-audio's recorder is a hook-managed object.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recRef = useRef<typeof recorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTranscriptRef = useRef<((text: string) => void) | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    clearTimer();
    try {
      await rec.stop();
    } catch {
      // already stopped
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    const uri = rec.uri ?? undefined;
    setAudioUri(uri);
    if (!uri) {
      setState('idle');
      return;
    }
    setState('transcribing');
    try {
      const text = await transcribe(uri, lang);
      onTranscriptRef.current?.(text);
      setState('idle');
    } catch (e) {
      setError({ kind: e instanceof SttUnavailableError ? 'stt' : 'other', message: (e as Error).message });
      setState('error');
    }
  }, [lang]);

  const start = useCallback(
    async (onTranscript: (text: string) => void) => {
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
        recRef.current = recorder;
        setSeconds(0);
        setState('recording');
        const startedAt = Date.now();
        timerRef.current = setInterval(() => {
          const s = Math.floor((Date.now() - startedAt) / 1000);
          setSeconds(s);
          if (s >= STT_MAX_SECONDS) void stop();
        }, 500);
      } catch (e) {
        setError({ kind: 'other', message: (e as Error).message });
        setState('error');
      }
    },
    [stop, recorder],
  );

  useEffect(
    () => () => {
      clearTimer();
      recRef.current?.stop().catch(() => undefined);
    },
    [],
  );

  return { state, seconds, error, audioUri, start, stop, maxSeconds: STT_MAX_SECONDS };
}
