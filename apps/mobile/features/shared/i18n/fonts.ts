import * as Font from 'expo-font';

import type { Script } from './languages';

// Each TTF is required by path so Metro bundles only 400/600/700 (the package roots require every weight).
// Families are keyed by their @expo-google-fonts export names, which tokens.fontFamily uses.
const FILES: Record<Script, Record<string, number>> = {
  latn: {
    Manrope_400Regular: require('@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf'),
    Manrope_600SemiBold: require('@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf'),
    Manrope_700Bold: require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'),
  },
  deva: {
    NotoSansDevanagari_400Regular: require('@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf'),
    NotoSansDevanagari_600SemiBold: require('@expo-google-fonts/noto-sans-devanagari/600SemiBold/NotoSansDevanagari_600SemiBold.ttf'),
    NotoSansDevanagari_700Bold: require('@expo-google-fonts/noto-sans-devanagari/700Bold/NotoSansDevanagari_700Bold.ttf'),
  },
  knda: {
    NotoSansKannada_400Regular: require('@expo-google-fonts/noto-sans-kannada/400Regular/NotoSansKannada_400Regular.ttf'),
    NotoSansKannada_600SemiBold: require('@expo-google-fonts/noto-sans-kannada/600SemiBold/NotoSansKannada_600SemiBold.ttf'),
    NotoSansKannada_700Bold: require('@expo-google-fonts/noto-sans-kannada/700Bold/NotoSansKannada_700Bold.ttf'),
  },
  taml: {
    NotoSansTamil_400Regular: require('@expo-google-fonts/noto-sans-tamil/400Regular/NotoSansTamil_400Regular.ttf'),
    NotoSansTamil_600SemiBold: require('@expo-google-fonts/noto-sans-tamil/600SemiBold/NotoSansTamil_600SemiBold.ttf'),
    NotoSansTamil_700Bold: require('@expo-google-fonts/noto-sans-tamil/700Bold/NotoSansTamil_700Bold.ttf'),
  },
  telu: {
    NotoSansTelugu_400Regular: require('@expo-google-fonts/noto-sans-telugu/400Regular/NotoSansTelugu_400Regular.ttf'),
    NotoSansTelugu_600SemiBold: require('@expo-google-fonts/noto-sans-telugu/600SemiBold/NotoSansTelugu_600SemiBold.ttf'),
    NotoSansTelugu_700Bold: require('@expo-google-fonts/noto-sans-telugu/700Bold/NotoSansTelugu_700Bold.ttf'),
  },
  arab: {
    NotoNaskhArabic_400Regular: require('@expo-google-fonts/noto-naskh-arabic/400Regular/NotoNaskhArabic_400Regular.ttf'),
    NotoNaskhArabic_600SemiBold: require('@expo-google-fonts/noto-naskh-arabic/600SemiBold/NotoNaskhArabic_600SemiBold.ttf'),
    NotoNaskhArabic_700Bold: require('@expo-google-fonts/noto-naskh-arabic/700Bold/NotoNaskhArabic_700Bold.ttf'),
  },
};

/** Every bundled face, for useFonts() in the root layout (they ship in the bundle either way). */
export const FONT_FILES: Record<string, number> = Object.assign({}, ...Object.values(FILES));

const loaded = new Set<Script>();

/** Loads one script's fonts on demand (no-op once loaded). Never throws: on failure the system font is used. */
export async function loadScriptFonts(script: Script): Promise<void> {
  if (loaded.has(script) || Object.keys(FILES[script]).every((f) => Font.isLoaded(f))) {
    loaded.add(script);
    return;
  }
  try {
    await Font.loadAsync(FILES[script]);
    loaded.add(script);
  } catch (e) {
    if (__DEV__) console.warn(`[fonts] could not load ${script}`, e);
  }
}
