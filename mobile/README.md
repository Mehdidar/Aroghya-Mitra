# Aroghya Mitra: mobile app (Expo) · ASHA module (P3)

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
npm test                  # 46 unit tests (rules, voice parsing, store and sync)
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
- `app/_layout.tsx` and `app/index.tsx` are minimal placeholders so the module runs on its own. P1's shell replaces them.
- Pass the signed-in user to the provider: `<AshaProvider user={user}>` in `app/(asha)/_layout.tsx`.
- `package.json` pins `@react-navigation/*` to 7.0-era versions through `overrides`. Newer 7.x releases drop `query-string`, which expo-router 4 (SDK 52) still imports.
