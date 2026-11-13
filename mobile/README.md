# Aroghya Mitra: mobile app (Expo SDK 58)

One Expo app for all four roles. P1 owns the shell (`app/_layout.tsx`, `app/(auth)/`, the
`app/(patient)/` layout, `features/shared/`, `locales/`); P3's ASHA module is described below.

## ASHA module (P3)

Offline-first app for ASHA workers doing home visits: register households, record vitals
by typing or by voice (Sarvam speech-to-text, Hindi and English), get an instant risk check,
and refer high-risk patients to a doctor. Everything works without network, and data syncs
when the phone is back online.

## Run

```bash
cd mobile
npm install
cp .env.example .env      # optional: all values are optional
npx expo start            # press "a" for Android, or scan the QR with Expo Go
npm test                  # P3's 46 unit tests + the shell and nutrition tests (jest-expo)
npm run typecheck
```

> **Windows + OneDrive:** Jest and Metro skip files that OneDrive stores as cloud placeholders,
> so you get "No tests found" or an app with no screens. Clone the repo outside OneDrive
> (for example `C:\dev\Aroghya-Mitra`). As a stop-gap for tests only, run `npm run test:asha`.

## What the ASHA module does

| Screen | Route | What it does |
|---|---|---|
| Home | `/asha` | Caseload sorted by risk, with tiles for high-risk, due visits and referrals. Has search, care-group filters, sync status and a Hindi/English toggle |
| Register | `/asha/patient/new` | Name, age or DOB, village, care groups (pregnant, newborn, NCD, TB, elderly), LMP or weeks pregnant, birth weight, conditions |
| Patient | `/asha/patient/:id` | Profile, gestation weeks and EDD, current alerts, referral status, visit history with per-visit sync state, call button |
| Home visit | `/asha/visit/:patientId` | Voice report → Sarvam STT → auto-fills vitals and symptoms. Has category-specific vitals and danger signs, a **live risk check** as you type, photos, GPS, follow-up date, and a refer prompt for high or critical findings |
| Alerts | `/asha/alerts` | All current alerts, most severe first, with mark-seen and refer |
| Referrals | `/asha/referrals` | Referrals and the status the doctor (P4) has set |

### Risk engine (`features/asha/logic/rules.ts`)

The risk engine is deterministic and offline, with 35 rules. Each alert carries the evidence
that triggered it, plus a stable id (`patientId:ruleId:visitId`), so re-sending never
duplicates. It also carries a `reasonKey` and `reasonParams`, so P4 can re-render the reason
in any language.

- **Pregnancy (MoHFW ANC):** BP ≥140/90 and ≥160/110, pre-eclampsia (high BP plus headache, blurred vision, swelling or abdominal pain), Hb <7 and <10, bleeding, convulsions, leaking fluid, fever, absent or reduced fetal movement (≥20 wks), post-dates (≥41 wks)
- **Newborn (HBNC / IMNCI 0–59 days):** danger signs (not feeding, convulsions, chest indrawing, lethargy), RR ≥60, temp ≥37.5 or <35.5, jaundice, umbilical infection, low birth weight
- **General:** SpO₂ <90 and <94, chest pain with breathlessness, fever, pulse ≥120
- **NCD (NPCDCS):** BP ≥140/90 and ≥180/120, random sugar ≥200 and ≥300, fasting sugar ≥126, sugar <70
- **TB (NTEP):** cough ≥2 weeks, haemoptysis, weight loss, night sweats

Severity sets the referral urgency: critical → emergency, high → urgent, anything else → routine.
These rules are a screening aid for referral, not a diagnosis.

### Voice (`features/asha/voice/`, `logic/transcript.ts`)

The app records up to 29 s, which is the limit for Sarvam's synchronous REST API. The clip
goes to `POST https://api.sarvam.ai/speech-to-text` (model `saarika:v2.5`, `hi-IN` or `en-IN`),
or to your proxy at `EXPO_PUBLIC_SARVAM_STT_URL`.

The parser understands English, Hindi and Hinglish:

- "BP 150 by 100", "बीपी १५० बटा १००"
- "hb 7 point 5", "हीमोग्लोबिन आठ"
- °F to °C conversion
- symptom phrases, with negation ("no fever", "बुखार नहीं")

It only fills fields the ASHA has not typed, and the ASHA confirms everything before saving.

### Offline store and sync (`features/asha/store/`, `services/sync.ts`)

- **Storage:** one JSON document in AsyncStorage, with serialised writes. A corrupt blob is backed up and the app starts clean.
- **Outbox:** every change is queued in an outbox. The app syncs on reconnect, when it comes to the foreground, and every 60 s.
- **Photos:** uploaded first, and their local URIs are swapped for the remote URLs.
- **Conflicts:** last write wins on `updatedAt`. A record edited while a sync is in flight stays queued, which is checked by a content fingerprint.

## Backend contract (P1)

- `POST /asha/sync`: body `{ ashaId, since, patients[], visits[], alerts[], referrals[] }`. Returns `{ serverTime, patients?, visits?, referrals? }`.
- `POST /asha/photos`: multipart `file`. Returns `{ url }`.
- Schema: `server/migrations/001_asha.sql` (PostgreSQL).
- `server/risk/index.ts` re-exports the same rule engine, so the server can re-verify alerts.

## Integration notes for the team

- `features/asha/types.ts` is P3's proposal for the shared types. Swap it for P1's re-exports when they land.
- P1's shell has replaced the placeholder `app/_layout.tsx` and removed `app/index.tsx`. Signing in as ASHA opens `/asha`; a Sign out button sits in the ASHA home header.
- Pass the signed-in user to the provider: `<AshaProvider user={user}>` in `app/(asha)/_layout.tsx`.
- The app is on SDK 58, so the old `@react-navigation/*` overrides are gone. Voice recording uses `expo-audio` (expo-av no longer exists).

## How to use the skeleton (P1)

Requirements: Node 24 (`.nvmrc`; Node 25 works with engine warnings). `npm install`, then `npx expo start`.

**Demo roles.** First launch shows onboarding, then the language picker, then the role picker. Pick a
role and press **Continue in demo mode** (instant), or **Sign in with phone** (demo OTP: any valid
10-digit number, code `123456`; Supabase is `TODO(Phase B)` in `features/shared/auth/AuthService.ts`).
The root layout guards the groups with `Stack.Protected`: patient → `(patient)`, ASHA → `(asha)`
(`/asha`), doctor and admin → `(doctor)`. Profile → **Sign out** (ASHA: header button) returns to the
role picker. The session `{ role, language, onboarded }` lives in `features/shared/state/session.ts`
(zustand + AsyncStorage); `useCurrentUser()` gives the demo user (patient: Lakshmi Gowda).

**Add a screen.** Drop a file in your group, e.g. `app/(patient)/chat.tsx` (P2) or
`app/(patient)/qr-card.tsx` (P4). Files outside `(tabs)/` are pushed above the tab bar, so you never
edit the tab layout (ask P1 for a new tab). Home's service tiles point at `/service/<id>` placeholders
until the real screen exists; change the target in `app/(patient)/(tabs)/index.tsx`.
Build screens from `features/shared/ui` (`Screen`, `Card`, `PrimaryButton`, `Pill`, `ServiceTile`,
`StatCard`, `IconButton`, `Icon`, `Text`, `EmptyState`, `TextField`, `Slider`, `Skeleton`, `Glass`…).
See them all at **`/dev/components`** (open `http://localhost:8081/dev/components` on web).

**Use the theme.** `const t = useTheme()` gives `t.colors`, `t.accent` (role accent: patient blue, ASHA
sage, doctor/admin indigo, chosen from the route group), `t.space`, `t.radii`, `t.sizes`, `t.shadows`,
`t.typography` and `t.gradient(stops)` for `backgroundImage`. Never hard-code a colour or import
`palette`. Use `<RoleScope role="admin">` to override the accent for a subtree. High contrast and text
scale live in `useThemeSettings()` (no settings UI yet).

**Text and translations.** Only use `<Text variant tone>` from `features/shared/ui` (it picks
Manrope / Noto / Noto Naskh Arabic per script and the right line height). Strings live in
`locales/<lang>/<namespace>.json` (`common`, `auth`, `patient`, `nutrition` today) and are read with
`useTranslation('<namespace>')`. To add a namespace, create the JSON for all 7 languages and add the
imports to `locales/index.ts`. English is the fallback (Kashmiri falls back to Urdu, then English).
Switch language with `useLanguage().setLanguage(code)`: strings and RTL flip immediately, no reload.
RTL rules: use `start`/`end`, `marginStart`/`paddingEnd` etc., never `left`/`right`; pass
`flipInRTL` to directional icons; use `<Text numeric>` for phone numbers, vitals and IDs.

## Nutrition scan (P1 integration, owned by P2)

`app/(patient)/nutrition.tsx` (Home → Nutrition) is a thin route over
`features/shared/screens/NutritionScanScreen.tsx`, with its client in
`features/shared/services/food/`. The nutrition analyzer belongs to P2 (`features/patient-ai`): P2
can move both folders as they are. The app never calls DishDetect or a vision LLM directly; it posts
the photo (multipart `file`) to `POST {EXPO_PUBLIC_AI_URL}/ai/food` on P2's server and expects P2's
`FoodRecognition` shape (copied in `services/food/types.ts` until P2's branch merges). With no URL, or
when the server cannot be reached (30 s timeout), it shows one of three labelled **demo results**
(masala dosa, chicken biryani, one not-recognised). Portion maths match P2's `macros.ts`.

Requests to P2: build `POST /ai/food`; add a diet tier and ingredients to `FoodRecognition`; add a
feedback endpoint (the "Wrong dish? Tell us" button is a no-op until then).

### Running with DishDetect (behind P2's server)

From the repo root (the Python project, not `mobile/`):

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-serve.txt
# torch and torchvision are installed separately (CPU wheels), see requirements-serve.txt
.venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 8000
```

Point P2's server at it (`DishDetectFoodRecognizer` with `http://localhost:8000`), then set
`EXPO_PUBLIC_AI_URL` to P2's server: `http://<laptop LAN IP>:<port>` for phones, `http://localhost:<port>`
for web or a simulator. Today DishDetect's Indian dish head is not trained, so most photos come back
"We couldn't name this dish yet" and every result is marked uncertain; the screen says so.
