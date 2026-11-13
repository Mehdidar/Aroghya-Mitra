// The single source of truth for app languages (P2 reads stt/tts/translate for the Sarvam pipeline).
export const LANGUAGES = {
  en: { bcp47: 'en-IN', sarvam: 'en-IN', native: 'English', english: 'English', dir: 'ltr', script: 'latn', stt: true, tts: 'bulbul', translate: 'mayura' },
  hi: { bcp47: 'hi-IN', sarvam: 'hi-IN', native: 'हिन्दी', english: 'Hindi', dir: 'ltr', script: 'deva', stt: true, tts: 'bulbul', translate: 'mayura' },
  kn: { bcp47: 'kn-IN', sarvam: 'kn-IN', native: 'ಕನ್ನಡ', english: 'Kannada', dir: 'ltr', script: 'knda', stt: true, tts: 'bulbul', translate: 'mayura' },
  ur: { bcp47: 'ur-IN', sarvam: 'ur-IN', native: 'اردو', english: 'Urdu', dir: 'rtl', script: 'arab', stt: true, tts: 'device', translate: 'sarvam-translate' },
  ta: { bcp47: 'ta-IN', sarvam: 'ta-IN', native: 'தமிழ்', english: 'Tamil', dir: 'ltr', script: 'taml', stt: true, tts: 'bulbul', translate: 'mayura' },
  te: { bcp47: 'te-IN', sarvam: 'te-IN', native: 'తెలుగు', english: 'Telugu', dir: 'ltr', script: 'telu', stt: true, tts: 'bulbul', translate: 'mayura' },
  ks: { bcp47: 'ks-IN', sarvam: 'ks-IN', native: 'کٲشُر', english: 'Kashmiri', dir: 'rtl', script: 'arab', stt: true, tts: 'none', translate: 'sarvam-translate' },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;
export type Script = (typeof LANGUAGES)[LanguageCode]['script'];
export type Direction = 'ltr' | 'rtl';
export const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[];
export const isLanguageCode = (c: unknown): c is LanguageCode => typeof c === 'string' && c in LANGUAGES;
export const directionOf = (lng: LanguageCode): Direction => LANGUAGES[lng].dir;

/** Detects the script of a string from its first strong non-Latin character ('latn' if none). */
export function detectScript(text: string): Script | null {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x0900 && cp <= 0x097f) return 'deva';
    if (cp >= 0x0c80 && cp <= 0x0cff) return 'knda';
    if (cp >= 0x0b80 && cp <= 0x0bff) return 'taml';
    if (cp >= 0x0c00 && cp <= 0x0c7f) return 'telu';
    if ((cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0x0750 && cp <= 0x077f) || (cp >= 0xfb50 && cp <= 0xfeff)) return 'arab';
  }
  return /[A-Za-z]/.test(text) ? 'latn' : null;
}
