import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Shared runtime config for the app. URLs and the Supabase anon key only:
 * no AI key is ever read here (Sarvam, Gemini and the QR secret live in the
 * repo-root .env and are used by the server).
 */
function resolveUrl(url: string): string {
  const clean = url.replace(/\/$/, '');
  if (Platform.OS !== 'web') {
    const hostUri =
      Constants.expoConfig?.hostUri ??
      (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ??
      '';
    if (hostUri) {
      if (hostUri.includes('.exp.direct')) {
        return `https://${hostUri}`;
      }
      const host = hostUri.split(':')[0];
      if (host && host !== 'localhost') {
        return `http://${host}:8787`;
      }
    }
  }
  return clean;
}

export const patientConfig = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  sttProxyUrl: process.env.EXPO_PUBLIC_SARVAM_STT_URL ?? '',
  sarvamSttModel: process.env.EXPO_PUBLIC_SARVAM_STT_MODEL ?? 'saarika:v2.5',
  /** Nutrition scan base (the server proxies /ai/food to the ML service). */
  aiUrl: resolveUrl(process.env.EXPO_PUBLIC_AI_URL ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787'),
  /** The Aroghya Mitra server (server/app.ts). */
  apiUrl: resolveUrl(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787'),
};
