# Aroghya Mitra: product spec (as built)

The original SPEC.md and design references were never committed. This is the
specification reconstructed from the code on `finish/one-app`; where the code
and the hackathon brief differ, the code wins and the gap is in STATUS.md.

## 1. Users and jobs

| User | Job to be done | Must work offline? |
|---|---|---|
| Patient (rural or peri-urban, low literacy, phone in a regional language) | Understand a prescription, remember doses, ask health questions by voice, carry records, find blood, find the way inside a hospital | Reminders, records, QR (demo), hospital map: yes. Voice and chat: no (device speech fallback). |
| ASHA worker | Register households, record a home visit by voice in under two minutes, get told who is at risk, refer | Everything; sync when back online |
| Doctor / PHC admin | Open a patient's history by scanning their card, consult, prescribe, act on ASHA referrals, manage staff and blood stock | Reads cached data; writes need the server |

## 2. Roles and navigation

- Onboarding: language picker (7 languages, Urdu and Kashmiri right-to-left) → role picker → one-tap demo sign-in, or phone OTP (Supabase when configured, demo code `123456` otherwise).
- `app/_layout.tsx` guards one route group per role: `(patient)`, `(asha)`, `(doctor)` (doctor and admin share it; admin tools are on the Admin tab).
- Patient tabs: Home · Health · Reminders · Profile. ASHA: stack (home, register, patient, visit, alerts, referrals, profile). Doctor: Dashboard · Patients · Referrals · Admin.

## 3. Domain model (packages/shared/types.ts)

`Patient` (database row) and `AshaPatient` (field card) describe the same
person; `RiskAlert` (rule evidence) and `RecordRiskAlert` (doctor summary);
`Referral` (ASHA outbox) and `RecordReferral` (doctor inbox). `Prescription`,
`PrescriptionItem`, `DoseLog`, `DoseSlot`, `MealRelation`, `Consultation`,
`HealthReport`, `AccessLog`, `PatientConsent`, `AccessGrant`, `VitalsReading`,
`Vitals`, `Visit`. Ids are UUIDs; timestamps ISO-8601 UTC.

Database: `supabase/migrations/1000_base.sql` (facilities, profiles, patients,
vitals, prescriptions, dose_logs, referrals, consultations, access_logs),
`3001_asha.sql` (asha_visits, risk_alerts with `verified_by`), `4001–4003`
(consents, grants, redemptions, reports, blood banks, storage bucket).

## 4. Features

### Patient
- **AI chat**: `POST /ai/chat` server-sent events (emergency, delta, chips, done). On-device red-flag check first (`packages/patient-ai/safety`), "Call 108" and Tele-MANAS 14416 banner. Demo reply when the server is unreachable, labelled.
- **Voice**: record → `/speech/stt` → chat (voice mode) → `/speech/tts` playback; device speech on 503.
- **Prescription explainer**: photo → `/ai/prescription` (Gemini vision, demo extraction without a key) → medicine cards, "Confirm with pharmacist" on low-confidence essential fields → edit → reminders + local notifications.
- **Reminders**: dose timeline from `packages/patient-ai/reminders`, Taken / Skip, streak and 7-day adherence.
- **Nutrition**: photo → `/ai/food` (DishDetect ML service) → dish, portion, macros + fibre / sugar / sodium, allergens, diet cautions; portion slider; daily log.
- **Health**: stat cards and timeline from `server/records/history.ts`; QR health card (`/qr/issue`, 5–10 min tokens, auto-refresh, demo code offline); report upload with validation; blood banks (mock stock, "Demo number" on every phone); hospital navigation (3-floor demo graph, shortest path, SVG map, steps read aloud, entrance QR start).

### ASHA
- Caseload with risk badges, follow-ups due; register; visit with vitals, symptoms, photos, GPS, voice report (Hindi/English transcript parsed into vitals); 35-rule risk engine; alerts; referrals; offline outbox → `POST /asha/sync` (last-write-wins, server re-verifies alerts).

### Doctor / Admin
- Dashboard (today's patients, pending referrals, high-risk), Scan QR → `/qr/scan` → history; consultation (notes, diagnosis, lab orders, follow-up, prescription → patient reminders); referral inbox (mark seen / accept / close); admin: users, ASHA assignments, blood stock editing, analytics.

## 5. Design system

`packages/shared/tokens.ts`: light airy background, 24 px rounded cards,
pastel service tiles, big-number stat cards, near-black pill buttons, glowing
voice orb, status pills. Role accents: Patient teal, ASHA sage, Doctor/Admin
indigo (`roleAccents`). High-contrast scheme, text scale and script-aware
line heights for Devanagari, Kannada, Tamil, Telugu and Perso-Arabic.

## 6. Non-functional

- Offline first for the ASHA and patient records; demo paths labelled on screen.
- No secrets in the app bundle; server verifies Supabase JWTs; RLS per role.
- Every screen has loading, empty and error states; 48 px touch targets; RTL layout.
