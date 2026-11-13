import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLanguage } from '@/features/shared/i18n/useLanguage';

import { SecondaryButton } from './Buttons';

/**
 * "Read this screen aloud": speaks the text the screen passes in, in the app
 * language, with the device voice (no network). Screens build `text` from the
 * same strings they render, so what is read matches what is shown.
 */
export function ReadAloud({ text, testID }: { text: string; testID?: string }) {
  const { t } = useTranslation();
  const { meta } = useLanguage();
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => void Speech.stop(), []);

  const toggle = async () => {
    if (speaking) {
      await Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(text, {
      language: meta.bcp47,
      rate: 0.95,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <SecondaryButton
      label={speaking ? t('profile.stopReading') : t('profile.readAloud')}
      icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'}
      onPress={() => void toggle()}
      accessibilityHint={t('profile.readAloud')}
      testID={testID ?? 'read-aloud'}
    />
  );
}
