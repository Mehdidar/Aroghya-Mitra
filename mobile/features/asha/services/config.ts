/**
 * Runtime config. Expo inlines EXPO_PUBLIC_* at build time; set them in mobile/.env:
 *
 *   EXPO_PUBLIC_API_URL=https://your-backend.example.com   # omit to run fully offline
 *   EXPO_PUBLIC_SARVAM_STT_URL=https://your-backend.example.com/asha/stt  # preferred: server proxy
 *   EXPO_PUBLIC_SARVAM_API_KEY=...        # hackathon only: direct call, key ships in the app
 *   EXPO_PUBLIC_ASHA_DEMO=1               # seed demo households on first launch
 */
export const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, ''),
  sttProxyUrl: process.env.EXPO_PUBLIC_SARVAM_STT_URL ?? '',
  sarvamApiKey: process.env.EXPO_PUBLIC_SARVAM_API_KEY ?? '',
  sarvamSttModel: process.env.EXPO_PUBLIC_SARVAM_STT_MODEL ?? 'saarika:v2.5',
  demo: (process.env.EXPO_PUBLIC_ASHA_DEMO ?? '1') !== '0',
  /** Until P1's auth lands, the signed-in ASHA. */
  ashaId: process.env.EXPO_PUBLIC_ASHA_ID ?? 'asha-demo-1',
  ashaName: process.env.EXPO_PUBLIC_ASHA_NAME ?? 'Sunita Devi',
  syncIntervalMs: 60_000,
};
