# Status: what is real, what is mocked, what needs review

Updated 2026-11-13 on `finish/one-app`.

## Verified on 2026-11-13

| Check | Result |
|---|---|
| `npm run test:server` (server + packages, `node --test`) | 212 pass, 0 fail, 0 cancelled |
| App tests (`jest-expo`) | 99 pass across 10 suites |
| `npm run typecheck` (server/packages + app) | 0 errors |
| `npm run ml:test` (pytest, food classifier) | 563 pass, 1 skipped |
| `npx expo-doctor` | 20 / 20 checks |
| Migrations 1000 + 3001 + 4001 + 4002 on `supabase/postgres` | apply cleanly; P4's RLS test passes all 56 checks |
| Web build, every route for all four roles | 40 / 40 render with content and no page errors, incl. Urdu (right-to-left) and Kannada |
| Demo flow in the browser | 9 / 9 steps pass, each under 1 s (see below) |
| Secret scan of `apps/` source, app env files and the served web bundle | no key names or values (in the committed branch) |

### The demo flow, as run

1. ASHA: Rekha Kumari shows a critical alert (BP 150/100 with danger signs) and an emergency referral.
2. Doctor: the referral is in the inbox; Accept.
3. Patient: the server issues a signed QR token (5 min).
4. Doctor: scans (pastes) it; Rekha's history opens.
5. Doctor: new consultation, prescribes Methyldopa 250 mg morning and night, saves.
6. Patient: Methyldopa is on the Reminders tab; marking a dose taken moves the count from 0 to 1 of 5.
7. Switching to Urdu flips the layout to right-to-left.

Not testable headless, so not verified here: recording audio from a real microphone, the camera QR scanner, local notifications firing, and the app on a physical iPhone or Android phone.

## Backend, live

| Endpoint | Live result on 2026-11-13 |
|---|---|
| `/speech/stt`, `/speech/tts` | Sarvam: transcript returned; Hindi speech audio returned |
| `/ai/chat` | streams sources, text deltas and suggestion chips; "chest pain and sweating" returns the emergency event with 108 and 112 |
| `/ai/prescription` | Gemini read a prescription photo into doctor, patient, three medicines, strengths, 1-0-1 timings, durations and meal timing |
| `/ai/food` | DishDetect named jalebi and butter chicken with portion, kcal, allergens and cautions; declined to name an idli photo at 41% confidence (below its floor), as designed |
| `/qr/issue`, `/qr/scan` | signed token issued and opened; forged token refused; a second doctor refused; patients cannot scan |
| `/records/history/:id` | patient sees own history (stat cards, timeline, adherence); other callers refused |
| `/asha/sync`, `/asha/photos` | a phone alert tampered to "low" came back from the server as "critical" pre-eclampsia; another ASHA's push refused (403); photo upload and fetch work |

**Gemini note.** New Gemini keys get an empty 404 from `generateContent`. The server now uses Google's Interactions API and walks a model chain (`gemini-3.5-flash`, `3.8-flash`, `3.1-flash-lite`, `flash-latest`), because several flash models answer "high demand" at times. Without any answering model, prescription reading returns a labelled demo extraction.

## Mocked or demo

- **e-RaktKosh** is not connected. Blood banks are 15 fictional Bengaluru entries with mock stock; every phone number is labelled "Demo number".
- **Hospital navigation** uses one fictional three-floor PHC graph.
- **Demo cast** (Rekha Kumari, Sunita Devi, Dr. Arjun Rao, Meena Shetty, PHC Hebbal): fictional people and records.
- **Records persistence**: the app keeps records in a local store seeded with the demo dataset. The Supabase tables exist and are tested, but the app does not write to them yet.
- **QR scan offline**: the payload `AM1.demo.<id>` resolves locally so the doctor flow works without a server.
- **Phone OTP** is real only when phone sign-in is enabled on the Supabase project (it is off today); otherwise the code is `123456` and the screen says so.
- **Server auth** runs in demo mode (trusts `x-demo-role`) until `SUPABASE_URL` or `SUPABASE_JWT_SECRET` is set in the root `.env`.
- **Report upload** stores metadata only; no file leaves the phone.
- **Jan Aushadhi generic prices** are an indicative demo table.

## Needs clinical review before any real use

- `packages/patient-ai/safety/redFlagTerms.ts`: emergency phrases in 15 languages. Odia, Assamese and Kashmiri were added without a native speaker.
- `server/ai/chat/knowledge.ts`: every health summary is marked `reviewed: false`.
- `apps/mobile/features/asha/logic/rules.ts`: the 35 risk thresholds have not been signed off.
- `ml/food-classifier/core/indian_nutrition.json` and `core/diet.py`: typical-recipe estimates and coarse cautions, not dietary advice.

## Known gaps

- Translations: English, Hindi and Kannada are complete; Urdu covers the main labels; Tamil, Telugu and Kashmiri fall back to English on the newer screens.
- The ASHA phone keeps its own alert severity after sync; the server's verified severity is stored for doctors but not yet merged back into the phone's store.
- `4003` (storage bucket) applies on Supabase cloud; the local Postgres image lacks the `public` column on `storage.buckets`.
- The Supabase Edge Function entry (`supabase/functions/api`) is written but has not been deployed.
- Expo SDK: the app is already on SDK 58, the version the brief's SDK 52 concern pointed towards. `eas.json` has development and preview (APK) profiles as the fallback path for a phone whose Expo Go does not match.
