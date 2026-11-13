/**
 * Shared runtime config for the app. URLs and the Supabase anon key only:
 * no AI key is ever read here (Sarvam, Gemini and the QR secret live in the
 * repo-root .env and are used by the server).
 */
export const patientConfig = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Nutrition scan base (the server proxies /ai/food to the ML service). */
  aiUrl: (process.env.EXPO_PUBLIC_AI_URL ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, ''),
  /** The Aroghya Mitra server (server/app.ts). */
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, ''),
};
