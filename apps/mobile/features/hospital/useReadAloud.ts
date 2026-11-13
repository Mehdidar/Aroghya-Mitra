import { useCallback, useEffect, useState } from 'react';

import { LANGUAGES, type LanguageCode } from '@/features/shared/i18n/languages';

/** Reads a list of sentences with the device voice (expo-speech) in the app language. Safe on web and under Jest. */
export function useReadAloud(language: LanguageCode) {
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-speech') as { stop: () => void }).stop();
    } catch {
      /* no speech module */
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (sentences: string[]) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Speech = require('expo-speech') as { speak: (text: string, o: { language: string; onDone?: () => void; onError?: () => void }) => void; stop: () => void };
        Speech.stop();
        setSpeaking(true);
        Speech.speak(sentences.join('. '), { language: LANGUAGES[language].bcp47, onDone: () => setSpeaking(false), onError: () => setSpeaking(false) });
      } catch {
        setSpeaking(false);
      }
    },
    [language],
  );

  useEffect(() => stop, [stop]);
  return { speak, stop, speaking };
}
