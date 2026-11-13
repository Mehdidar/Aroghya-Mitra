# Status: what is real, what is mocked, what needs review

Updated 2026-11-13 on `finish/one-app`. (Draft: the screen sections are finalised once the parallel builds land.)

## Real

- One Expo app (SDK 58) with all four roles; TypeScript server with JWT auth; npm workspaces; all suites green.
- Speech-to-text, text-to-speech and the chatbot run on Sarvam through the server when `SARVAM_API_KEY` is set (verified live on 2026-11-13).
- Food recognition: DishDetect India (trained 2026-11-13 on 5,538 photos; dish head served by a CLIP probe at 75.9% test accuracy; veg 92.2%, vegan 87.1%) with a curated per-100 g nutrition table for 120 dishes and allergen / diet cautions.
- ASHA module: offline store, sync queue, 35-rule risk engine, voice transcript parser (P3, 46 tests).
- Migrations `1000_base`, `3001_asha`, `4001`, `4002` apply on `supabase/postgres` and P4's RLS test passes (56 checks). `4003` (storage bucket) applies on Supabase cloud; the local image's storage schema lacks the `public` column.
- Server-side re-verification of ASHA risk alerts on sync.
- Signed QR health-card tokens (`server/qr`) and the records history builder.

## Mocked or demo

- **e-RaktKosh**: not connected. Blood banks are 15 fictional Bengaluru entries with mock stock; every phone number is labelled "Demo number".
- **Hospital navigation**: one fictional 3-floor hospital graph.
- **Demo cast** (Rekha Kumari, Sunita Devi, Dr. Arjun Rao, Meena Shetty, PHC Hebbal): fictional people and records.
- **Records persistence**: the app keeps records in a local store (`features/shared/data/recordsStore.ts`) seeded with the demo dataset; the Supabase tables exist but the app does not write to them yet.
- **QR scan offline**: the demo payload `AM1.demo.<id>` resolves locally so the doctor flow works with no server.
- **Phone OTP**: real only when Supabase phone auth is enabled on the project; otherwise the code is `123456` and the screen says so.
- **Prescription reading** without `GEMINI_API_KEY`: a fixed demo extraction, labelled.
- **Gemini availability**: on 2026-11-13 Google's generation endpoints returned "high demand" for every current model; the app degrades to the labelled demo path.

## Needs clinical review before any real use

- `packages/patient-ai/safety/redFlagTerms.ts`: emergency phrases in 15 languages. Odia, Assamese and Kashmiri were added without a native speaker.
- `server/ai/chat/knowledge.ts`: every health summary is marked `reviewed: false`.
- `apps/mobile/features/asha/logic/rules.ts`: the 35 risk thresholds (BP, haemoglobin, newborn respiratory rate, sugar) follow common Indian guidelines but have not been signed off.
- `ml/food-classifier/core/indian_nutrition.json` and `core/diet.py`: typical-recipe estimates and coarse cautions, not dietary advice.

## Known gaps

- Translations: English, Hindi and Kannada are complete for every namespace; Urdu covers the main labels; Tamil, Telugu and Kashmiri fall back to English for the newer screens (`health`, `reminders`, `doctor`, `hospital`).
- The web build cannot record audio in Jest / headless runs; voice was verified on device paths and with mocked recorders.
- `expo-notifications` reminders fire on device builds; Expo Go on Android 13+ needs the permission prompt accepted.
- Supabase Edge Function deployment of `server/app.ts` is not wired (the Node dev server is the demo path).
