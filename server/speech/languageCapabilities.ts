/**
 * What each app language can do with Sarvam, and what to do when it can't.
 * Pure data, no Node or React Native imports, so the app can import it too
 * (for offline fallback decisions). Verified against docs.sarvam.ai on 2026-11-13.
 */

export type AppLanguage =
  | 'en' | 'hi' | 'bn' | 'ta' | 'te' | 'mr' | 'gu' | 'kn' | 'ml' | 'od' | 'pa'
  | 'as' | 'ur' | 'ks';

export type TranslateModel = 'mayura:v1' | 'sarvam-translate:v1';

export type TtsStrategy = 'bulbul' | 'device' | 'text-only';

export interface LanguageCapability {
  code: AppLanguage;
  /** Code for REST STT, TTS, translate and LID. */
  sarvamCode: string;
  /** Code for the realtime STT WebSocket (the docs use or-IN there instead of od-IN). */
  realtimeSttCode: string;
  englishName: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
  stt: boolean;
  realtimeStt: boolean;
  /** Bulbul v3 voice available. */
  bulbulTts: boolean;
  /** Locales to try with expo-speech, in order. Empty means text only. Check at runtime with Speech.getAvailableVoicesAsync(). */
  deviceTtsLocales: string[];
  /** Cheapest model that supports this language. mayura is limited to the 11 main languages. */
  translateModel: TranslateModel;
  /** Sarvam text-lid can return this language. */
  lid: boolean;
}

const MAYURA = 'mayura:v1' as const;
const SARVAM_TRANSLATE = 'sarvam-translate:v1' as const;

function main(code: AppLanguage, englishName: string, nativeName: string, sarvamCode = `${code}-IN`): LanguageCapability {
  return {
    code, sarvamCode, realtimeSttCode: sarvamCode, englishName, nativeName, dir: 'ltr',
    stt: true, realtimeStt: true, bulbulTts: true, deviceTtsLocales: [sarvamCode, code],
    translateModel: MAYURA, lid: true,
  };
}

export const LANGUAGE_CAPABILITIES: Record<AppLanguage, LanguageCapability> = {
  en: main('en', 'English', 'English'),
  hi: main('hi', 'Hindi', 'हिन्दी'),
  bn: main('bn', 'Bengali', 'বাংলা'),
  ta: main('ta', 'Tamil', 'தமிழ்'),
  te: main('te', 'Telugu', 'తెలుగు'),
  mr: main('mr', 'Marathi', 'मराठी'),
  gu: main('gu', 'Gujarati', 'ગુજરાતી'),
  kn: main('kn', 'Kannada', 'ಕನ್ನಡ'),
  ml: main('ml', 'Malayalam', 'മലയാളം'),
  od: { ...main('od', 'Odia', 'ଓଡ଼ିଆ'), realtimeSttCode: 'or-IN', deviceTtsLocales: ['or-IN', 'or'] },
  pa: main('pa', 'Punjabi', 'ਪੰਜਾਬੀ'),
  as: {
    code: 'as', sarvamCode: 'as-IN', realtimeSttCode: 'as-IN', englishName: 'Assamese', nativeName: 'অসমীয়া', dir: 'ltr',
    stt: true, realtimeStt: true, bulbulTts: false, deviceTtsLocales: ['as-IN', 'as'],
    translateModel: SARVAM_TRANSLATE, lid: false,
  },
  // Urdu and Kashmiri: Sarvam STT works, but there is no Bulbul voice and no LID.
  ur: {
    code: 'ur', sarvamCode: 'ur-IN', realtimeSttCode: 'ur-IN', englishName: 'Urdu', nativeName: 'اردو', dir: 'rtl',
    stt: true, realtimeStt: true, bulbulTts: false, deviceTtsLocales: ['ur-IN', 'ur-PK', 'ur'],
    translateModel: SARVAM_TRANSLATE, lid: false,
  },
  ks: {
    code: 'ks', sarvamCode: 'ks-IN', realtimeSttCode: 'ks-IN', englishName: 'Kashmiri', nativeName: 'کٲشُر', dir: 'rtl',
    stt: true, realtimeStt: true, bulbulTts: false, deviceTtsLocales: [],
    translateModel: SARVAM_TRANSLATE, lid: false,
  },
};

export const APP_LANGUAGES = Object.keys(LANGUAGE_CAPABILITIES) as AppLanguage[];

export function getCapability(lang: AppLanguage): LanguageCapability {
  return LANGUAGE_CAPABILITIES[lang];
}

/** Map a Sarvam code (hi-IN, or-IN, od-IN, ...) back to an app language. */
export function fromSarvamCode(code: string | null | undefined): AppLanguage | null {
  if (!code) return null;
  const normalized = code.toLowerCase();
  for (const cap of Object.values(LANGUAGE_CAPABILITIES)) {
    if (cap.sarvamCode.toLowerCase() === normalized || cap.realtimeSttCode.toLowerCase() === normalized) return cap.code;
  }
  return null;
}

/**
 * How to speak text in a language.
 * - sarvamReachable=false: never pick bulbul.
 * - deviceHasVoice: result of the on-device voice check (unknown = assume yes when locales exist).
 */
export function ttsStrategy(
  lang: AppLanguage,
  opts: { sarvamReachable?: boolean; deviceHasVoice?: boolean } = {},
): TtsStrategy {
  const cap = LANGUAGE_CAPABILITIES[lang];
  const sarvamReachable = opts.sarvamReachable ?? true;
  if (cap.bulbulTts && sarvamReachable) return 'bulbul';
  const deviceHasVoice = opts.deviceHasVoice ?? cap.deviceTtsLocales.length > 0;
  return deviceHasVoice && cap.deviceTtsLocales.length > 0 ? 'device' : 'text-only';
}

/** Translation model that covers both languages. */
export function translateModelFor(source: AppLanguage, target: AppLanguage): TranslateModel {
  const needsWide =
    LANGUAGE_CAPABILITIES[source].translateModel === SARVAM_TRANSLATE ||
    LANGUAGE_CAPABILITIES[target].translateModel === SARVAM_TRANSLATE;
  return needsWide ? SARVAM_TRANSLATE : MAYURA;
}
