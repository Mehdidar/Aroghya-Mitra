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

## Phones connected through the database (2026-11-13)

The server now stores records in Supabase when `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are set (`server/records/supabaseRepository.ts`),
and the app sends its changes there and pulls other phones' changes back
(`apps/mobile/features/shared/data/outbox.ts`, `serverSync.ts`).

Verified against a real Postgres (the `supabase/postgres` image with PostgREST
in front, the same API Supabase serves):

| Check | Result |
|---|---|
| `npm run db:migrate` twice in a row | all migrations re-run cleanly (policies now `drop policy if exists`); 4003 skipped locally (no Storage schema) |
| `npm run db:seed` twice in a row | identical row counts, no duplicates |
| RLS test after the policy change | 56 / 56 |
| API flow against the database | 18 / 18: history, inbox, doctor push, patient pull, dose log, five refusal cases, ASHA sync mirrored, tampered alert replaced, referral never moves backwards, QR issue and scan, consent |
| Separate browser profiles as separate phones | ASHA sync → doctor inbox; doctor's prescription → in the database in 30 ms → patient's Reminders; patient's Taken tap → database in under 1 s |
| Server tests / app tests | 219 / 219, 104 / 104 |

Rules on writes (`server/records/push.ts`, mirroring the RLS policies because
the service-role key bypasses them): patients write only their own dose logs,
vitals, scanned prescriptions, reports and consent; doctors write prescriptions
and consultations only in their own name, only for patients they may open, and
update only referrals addressed to them or their facility; ASHA data arrives
through `/asha/sync`, where the server's risk check replaces the phone's.

**Not yet done on the cloud project.** Its tables do not exist yet (every table
returns 404). It needs the secret key and the database password in the root
`.env`, then `npm run db:migrate && npm run db:seed`. Keep `AUTH_MODE=demo`
until phone sign-in is switched on, or every call is refused.

## Release checklist progress (2026-11-13)

| Item | Done here | Still needs |
|---|---|---|
| Real login | Server decides the role (`app_metadata` only; a self-set role is ignored); `/me` registers a new patient with an empty record; app keeps the Supabase session and sends its token; each patient sees only their own records. Verified on the live project with a real token. | Switch on phone sign-in (an SMS provider such as Twilio, MSG91 or Vonage) in Supabase → Authentication → Providers → Phone, then set `AUTH_MODE=supabase`. Staff accounts: set `app_metadata.role` and a `profiles` row for each doctor, ASHA and admin. |
| Medical review | `npm run review:clinical` writes `docs/CLINICAL_REVIEW.md` from the code: 35 ASHA rules in plain conditions, 9 chatbot summaries, emergency phrases in 15 languages, with tick boxes and a sign-off. | A doctor fills it in; native speakers check the emergency phrases (Odia, Assamese and Kashmiri first). |
| Real phones | Android was missing the notification permission (reminders would not show on Android 13+): fixed, plus reminders after a restart. `docs/DEVICE_TEST.md` is a 13-step phone checklist. | Someone runs it on a phone. |
| Fake data | `npm run data:blood-banks -- <file.csv>` imports the official Blood Bank Directory (National Health Portal / NIHFW, GODL licence) into Supabase; the app then lists real banks and says "call to check stock". | Download the CSV from the AIKosh page (a browser button; it cannot be fetched automatically) and run the import. Live stock needs e-RaktKosh, which has no public API. The hospital map needs the real floor plan of the facility. |
| Translations | Tamil, Telugu and Kashmiri complete (581, 581 and 596 strings), Urdu gaps filled (198). | Native-speaker review, Kashmiri especially. The ASHA module itself is in English and Hindi only. |
| Hosting | The server runs as a Supabase Edge Function (tested under Deno against the live project); ASHA data and photos move to the database and Storage; `npm run deploy:server`. | A Supabase access token in `.env`, and run `supabase/migrations/3002_asha_sync_store.sql` in the SQL Editor. The food model (Python) needs its own host. |

## Mocked or demo

- **e-RaktKosh** is not connected. Blood banks are 15 fictional Bengaluru entries with mock stock; every phone number is labelled "Demo number".
- **Hospital navigation** uses one fictional three-floor PHC graph.
- **Demo cast** (Rekha Kumari, Sunita Devi, Dr. Arjun Rao, Meena Shetty, PHC Hebbal): fictional people and records.
- **Records persistence**: in memory on the server until the Supabase keys are set (see above); each phone also keeps a local copy and works offline.
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

- Translations: all seven languages are complete in the main app; the ASHA module is English and Hindi only.
- The ASHA phone keeps its own alert severity after sync; the server's verified severity reaches doctors (inbox and database) but is not yet merged back into the ASHA phone's store.
- `4003` (storage bucket) applies on Supabase cloud; the local Postgres image lacks the `public` column on `storage.buckets`.
- The Supabase Edge Function entry (`supabase/functions/api`) is written but has not been deployed.
- Expo SDK: the app is already on SDK 58, the version the brief's SDK 52 concern pointed towards. `eas.json` has development and preview (APK) profiles as the fallback path for a phone whose Expo Go does not match.
