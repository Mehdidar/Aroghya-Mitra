# Aroghya Mitra: context for AI assistants

Read this before changing or explaining anything in this repo. It describes what
the app is, how it is built, the rules that must not be broken, and where things
live. Facts here were true on 2026-11-14 (branch `finish/one-app`).

## What it is

Aroghya Mitra ("health friend") is a multilingual primary-care app for India,
built for a Bengaluru PHC demo. One Expo app serves four roles:

| Role | Who | Main jobs in the app |
|---|---|---|
| Patient | e.g. a pregnant woman on BP tablets, often low literacy | Voice/chat health assistant, prescription photo reader, food (nutrition) scan, medicine reminders, QR health card, nearby care map, blood banks, step counter |
| ASHA worker | Village community health worker | Household caseload, home visits (vitals, symptoms, voice notes, photos), offline-first, automatic risk alerts, referrals to the PHC doctor |
| Doctor | PHC medical officer | Referral inbox from ASHAs, scan a patient's QR to open history, consultations and prescriptions that reach the patient's reminders |
| Admin | PHC admin | Staff, ASHA assignments, blood stock, analytics (shares the doctor shell) |

Languages: English, Hindi, Kannada, Tamil, Telugu, Urdu (right-to-left), Kashmiri
(Perso-Arabic, right-to-left). The ASHA module's own strings are English and Hindi only.

Demo cast (fictional): Rekha Kumari (patient, 34 weeks pregnant, gestational
hypertension), Sunita Devi (ASHA), Dr. Arjun Rao (doctor), Meena Shetty (admin),
PHC Hebbal. Fixed ids are in `packages/shared/demo.ts` (`DEMO_IDS`, `DEMO_USERS`).

## Architecture

```
apps/mobile/        Expo SDK 58 app (React Native + web), Expo Router, TypeScript
packages/shared     @am/shared: types, theme tokens, languages, demo cast, ids (toDbId/sameRecord)
packages/patient-ai @am/patient-ai: red-flag (emergency) detection, reminder schedule, adherence, Jan Aushadhi generics
packages/records    @am/records: record types, referral actions, blood bank service
server/             One HTTP handler (web Request/Response) run by Node locally or Deno as a Supabase Edge Function
ml/food-classifier  Python FastAPI "DishDetect" food model (CLIP probe + MobileNet heads, 120 Indian dishes)
supabase/           SQL migrations with row-level security, the Edge Function entry (functions/api)
docs/               STATUS.md (what is real/mocked), CLINICAL_REVIEW.md, DEVICE_TEST.md
```

Data flow: phone ⇄ server ⇄ Supabase Postgres. The app never holds API keys and
never talks to Postgres directly; it calls the server, which uses the Supabase
service-role key and enforces access rules itself (mirroring the RLS policies).

### App (apps/mobile)
- Route groups: `app/(auth)`, `app/(patient)` (tabs: Home, Health, Reminders, Profile + stack screens), `app/(asha)`, `app/(doctor)` (tabs over a stack). Role guards via `Stack.Protected` in `app/_layout.tsx`.
- UI kit and theme: `features/shared/ui` and `features/shared/theme` (tokens per role; schemes standard / high contrast / dark; text scale 1–1.5). Use these, not raw colours.
- i18n: `locales/<lang>/<namespace>.json`, registered in `locales/index.ts`. Every user-facing string goes in all 7 languages.
- Local-first data: zustand stores persisted in AsyncStorage. `features/shared/data/recordsStore.ts` (patient records), the ASHA store in `features/asha/store`. Writes are queued in `outbox.ts` (POST /records/push, retried offline); `serverSync.ts` pulls other phones' changes (bundle, doctor inbox).
- Uploads: Expo SDK 58's global fetch (expo/fetch) does NOT send React Native `{uri,name,type}` form parts. Always use `features/shared/services/filePart.ts`.
- Accessibility: `features/shared/a11y/audioGuide.tsx` (`<ScreenGuide id>` speaks a per-screen description when the audio guide is on; "Explain this screen" button; quiet when VoiceOver/TalkBack run). Haptics + announcements via `features/shared/feedback.ts`. Touch targets ≥ 48 pt; every control has an accessibilityLabel.
- Maps: `features/maps` (Leaflet + OpenStreetMap tiles in a WebView; iframe on web). Places from Nominatim queried from the phone first, server as backup.

### Server (server/)
Routes (all under one router, auth via Supabase JWT or demo headers):

| Route | Purpose |
|---|---|
| `GET /health` | liveness |
| `POST /speech/stt`, `POST /speech/tts` | Sarvam speech-to-text / text-to-speech |
| `POST /ai/chat` | Streaming health chat (Sarvam), grounded on `server/ai/chat/knowledge.ts`; emergency events for red flags |
| `POST /ai/prescription` | Prescription photo → medicines (Gemini, Interactions API, model fallback chain) |
| `POST /ai/food` | Food photo → dish, portion, nutrients, allergens, cautions. Own DishDetect model first (DISHDETECT_URL), Sarvam image model backup (numbers always from `server/ai/food/dishCatalog.json`) |
| `POST /qr/issue`, `POST /qr/scan` | Signed short-lived QR tokens; scan grants a doctor time-limited access if the patient shares history |
| `GET /records/history/:id`, `GET /records/bundle/:id` | Patient history (access-checked, logged) |
| `GET /records/inbox` | Doctor's open referrals + patients + alerts |
| `POST /records/push` | Phone writes with per-row rules (patients: own dose logs/vitals/scanned prescriptions/reports/consent; doctors: prescriptions and consultations in their own name for patients they may open) |
| `GET /me` | Who is signed in; registers a first-time patient |
| `POST /asha/sync`, `/asha/photos` | ASHA offline sync; the server re-runs the risk rules and its verdict overrides the phone's |
| `GET /blood-banks` | Official directory rows when imported, else 404 (app uses labelled demo banks) |
| `GET /places/nearby` | OSM hospitals/clinics/pharmacies (Nominatim, then Overpass), cached 6 h |

Storage: `server/records/supabaseRepository.ts` when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, else in-memory demo data. Server code must run on both Node (type stripping: no constructor parameter properties, no enums, explicit `.ts` imports) and Deno.

### Database (supabase/migrations)
`1000_base.sql` (facilities, profiles, patients, vitals, prescriptions, dose_logs, referrals, consultations, access_logs + RLS), `3001_asha.sql` (asha_visits, risk_alerts), `3002_asha_sync_store.sql`, `4001/4002` (consents, QR grants/redemptions, health reports, blood banks/stock, policies), `4003` (report storage bucket). Migrations are re-runnable. RLS tests: `supabase/tests/4001_p4_rls.test.sql`.

## Rules that must not be broken
1. No secrets in the app. Keys (Sarvam, Gemini, Supabase service role, QR secret, food-model key) live only in the repo-root `.env` and as server secrets. Nothing secret in any `EXPO_PUBLIC_*` variable. Only the Supabase URL and publishable key may be public.
2. The server decides roles from the JWT's `app_metadata` only, never `user_metadata` (users can set that).
3. Never show invented health numbers. No placeholder vitals, appointments or doctors. If there is no data, say so.
4. Safety first: emergency phrases (`packages/patient-ai/safety/redFlagTerms.ts`) must keep triggering the 108 banner; the floating 108 button stays on patient screens; medical content is a screening aid, not a diagnosis.
5. The server's ASHA risk verdict overrides the phone's; referral status never moves backwards.
6. Every UI string in all 7 languages; layouts must work right-to-left and at 150% text.
7. Don't commit other people's in-progress files; don't publish builds containing them.

## Running, testing, deploying
- `npm run demo`: server + food model + Expo for a laptop demo. `npm run dev:server` (port 8787).
- Tests: `npm run test:server` (node:test), `npm run test:app` (jest-expo), `npm run typecheck`, `npm run ml:test` (pytest).
- Database: `npm run db:migrate | db:seed | db:check`. Real blood banks: `npm run data:blood-banks -- <csv>`. Clinical sheet: `npm run review:clinical`.
- Hosting: `npm run deploy:server -- --yes` (Supabase Edge Function `api`). Food model container: `npm run deploy:food -- --local`.
- Phones: EAS Update branch/channel `preview` (Expo Go, signed in to the project's Expo account) and an Android APK from the `preview` build profile. Publish from a clean git worktree of the committed code.

## Real vs demo (see docs/STATUS.md)
Real: speech, chat, prescription reading, food recognition, QR access control, Supabase records and sync across phones, nearby care from OpenStreetMap, step counter (phone sensor). Demo or pending: demo login (SMS sign-in is off; `AUTH_MODE=demo`), blood bank stock (no public e-RaktKosh API), the indoor PHC map, clinical review of rules and texts, native-speaker review of Kashmiri/Odia/Assamese.
