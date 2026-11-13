/**
 * Runtime config. Expo inlines EXPO_PUBLIC_* at build time; set them in apps/mobile/.env:
 *
 *   EXPO_PUBLIC_API_URL=http://<laptop LAN IP>:8787   # the Aroghya Mitra server (speech, sync, QR). Omit to run fully offline.
 *   EXPO_PUBLIC_ASHA_DEMO=1                             # seed demo households on first launch
 *
 * There is no speech key here on purpose: speech-to-text goes through the server
 * (POST /speech/stt), which holds the Sarvam key. The app bundle is public.
 */
import { patientConfig } from '@/features/shared/services/config';
import { DEMO_USERS } from '@am/shared';

export const config = {
  apiUrl: patientConfig.apiUrl,
  demo: (process.env.EXPO_PUBLIC_ASHA_DEMO ?? '1') !== '0',
  /** The signed-in ASHA (demo cast until Supabase auth assigns real ids). */
  ashaId: process.env.EXPO_PUBLIC_ASHA_ID ?? DEMO_USERS.asha.id,
  ashaName: process.env.EXPO_PUBLIC_ASHA_NAME ?? DEMO_USERS.asha.name,
  syncIntervalMs: 60_000,
};
