import i18n from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';

import { useSession } from '@/features/shared/state/session';

import { loadScriptFonts } from './fonts';
import { LANGUAGES, isLanguageCode, type Direction, type LanguageCode } from './languages';

/**
 * Applies a language everywhere, with no reload:
 * - i18next switches strings (every useTranslation() re-renders);
 * - the root layout reads `direction` and sets `style={{ direction }}` + LocaleProvider, so
 *   start/end styles, row order and natural text alignment flip immediately;
 * - the native I18nManager flag is synced so the next cold start is already in the right direction;
 * - on web, <html dir lang> is updated.
 */
export async function applyLanguage(lng: LanguageCode): Promise<void> {
  await loadScriptFonts(LANGUAGES[lng].script);
  if (i18n.language !== lng) await i18n.changeLanguage(lng);
  const rtl = LANGUAGES[lng].dir === 'rtl';
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = LANGUAGES[lng].bcp47;
    }
  } else {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(rtl); // takes effect on next cold start; the live flip comes from the root style
  }
}

/** Current language, its metadata and direction. Never read I18nManager.isRTL or i18n.dir(). */
export function useLanguage() {
  const { i18n: inst } = useTranslation();
  const setStored = useSession((s) => s.setLanguage);
  const language: LanguageCode = isLanguageCode(inst.language) ? inst.language : 'en';
  const direction: Direction = LANGUAGES[language].dir;
  const setLanguage = useCallback(
    async (lng: LanguageCode) => {
      setStored(lng);
      await applyLanguage(lng);
    },
    [setStored]
  );
  return { language, meta: LANGUAGES[language], direction, isRTL: direction === 'rtl', setLanguage };
}
