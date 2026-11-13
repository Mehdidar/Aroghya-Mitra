/** Shared runtime config for the patient-facing app. */
export const patientConfig = {
  geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
  // gemini-2.0-flash and 2.5-flash are retired for new keys (404 "no longer available"); 3.8-flash is current.
  geminiModel: process.env.EXPO_PUBLIC_GEMINI_MODEL ?? 'gemini-3.8-flash',
  /** Tried once when the primary model is retired (404) or overloaded (503). */
  geminiFallbackModel: process.env.EXPO_PUBLIC_GEMINI_FALLBACK_MODEL ?? 'gemini-flash-latest',
  sarvamApiKey: process.env.EXPO_PUBLIC_SARVAM_API_KEY ?? '',
  sttProxyUrl: process.env.EXPO_PUBLIC_SARVAM_STT_URL ?? '',
  sarvamSttModel: process.env.EXPO_PUBLIC_SARVAM_STT_MODEL ?? 'saarika:v2.5',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  aiUrl: (process.env.EXPO_PUBLIC_AI_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
};
