/**
 * Audio guide for blind, low-vision and non-reading users.
 *
 * Each screen describes itself in a few spoken sentences: what it is for,
 * what is where, and what to do next (strings in the `guide` namespace, in
 * all seven languages, with live details such as the next medicine).
 *
 *  - With the guide switched on (Profile → Accessibility), the description is
 *    spoken when the screen opens, in the app language, with Sarvam's Indian
 *    voices (the phone's own voice when offline).
 *  - When VoiceOver / TalkBack is running, nothing is spoken automatically (the
 *    screen reader is already talking); the "Explain this screen" button still works.
 *  - "Explain this screen" speaks it on demand, guide on or off.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { speak, stopSpeaking } from '@/features/patient/voice/speech';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { SecondaryButton, Text } from '@/features/shared/ui';

type GuideSettings = { enabled: boolean; setEnabled: (on: boolean) => void };

export const useAudioGuide = create<GuideSettings>()(
  persist((set) => ({ enabled: false, setEnabled: (enabled) => set({ enabled }) }), {
    name: 'aroghya-audio-guide-v1',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: ({ enabled }) => ({ enabled }),
  }),
);

function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => alive && setOn(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return on;
}

/**
 * Speak `text` when the screen opens (guide on, no screen reader). `key` names
 * the screen so the description is spoken once per visit, not on every re-render.
 */
export function useScreenGuide(text: string, key: string) {
  const enabled = useAudioGuide((s) => s.enabled);
  const screenReader = useScreenReader();
  const { language } = useLanguage();
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || screenReader || !text) return;
    const id = `${key}:${language}`;
    if (spokenFor.current === id) return;
    spokenFor.current = id;
    // A short pause so the screen has appeared before it is described.
    const timer = setTimeout(() => void speak(text, language), 450);
    return () => clearTimeout(timer);
  }, [enabled, screenReader, text, key, language]);
  useEffect(() => () => void stopSpeaking(), []);
}

/** "Explain this screen": speaks the description now (or stops it). */
export function ExplainScreenButton({ text, testID }: { text: string; testID?: string }) {
  const { t } = useTranslation('guide');
  const { language } = useLanguage();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => void stopSpeaking(), []);
  const toggle = useCallback(async () => {
    if (speaking) {
      await stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    await speak(text, language, { onDone: () => setSpeaking(false) });
  }, [speaking, text, language]);
  return (
    <SecondaryButton
      label={speaking ? t('stop') : t('explain')}
      icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'}
      onPress={() => void toggle()}
      accessibilityHint={t('explainHint')}
      testID={testID ?? 'explain-screen'}
    />
  );
}

/**
 * One line per screen: `<ScreenGuide id="health" />` speaks guide:<id> when the
 * screen opens (guide on) and shows the "Explain this screen" button.
 * `extra` adds live details (e.g. the next medicine) after the fixed text.
 */
export function ScreenGuide({ id, extra, button = true }: { id: string; extra?: string; button?: boolean }) {
  const { t } = useTranslation('guide');
  const text = [t(`screens.${id}`), extra].filter(Boolean).join(' ');
  useScreenGuide(text, id);
  return button ? <ExplainScreenButton text={text} testID={`explain-${id}`} /> : null;
}

/** Profile → Accessibility: switch the audio guide on or off (it speaks a sample when switched on). */
export function AudioGuideToggle() {
  const { t } = useTranslation('guide');
  const { language } = useLanguage();
  const enabled = useAudioGuide((s) => s.enabled);
  const setEnabled = useAudioGuide((s) => s.setEnabled);
  return (
    <>
      <SecondaryButton
        label={enabled ? t('setting.on') : t('setting.off')}
        icon={enabled ? 'ear' : 'ear-outline'}
        accessibilityHint={t('setting.help')}
        onPress={() => {
          const next = !enabled;
          setEnabled(next);
          if (next) void speak(t('setting.help'), language);
          else void stopSpeaking();
        }}
        testID="audio-guide-toggle"
      />
      <Text variant="caption" tone="tertiary">
        {t('setting.help')}
      </Text>
    </>
  );
}
