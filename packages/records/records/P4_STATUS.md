# P4: Doctor/Admin + Health Records, status

## Done (plain TypeScript, no dependencies, tested)

| Area | Files | What it does |
|---|---|---|
| QR token | `server/qr/token.ts` | HS256 JWT on Web Crypto. Lifetime is 5–10 min and the payload holds only patient id, scope and jti. Algorithm is pinned; payload is prefixed `AM1.` |
| QR flows | `server/qr/service.ts` | Issue (patient only, consent on). Scan runs verify → role → consent → single-use jti → grant → history in one request. Every attempt is logged |
| Access rules | `server/records/access.ts` | Same rules as SQL `p4_can_view_patient()` |
| History view | `server/records/history.ts` | Stat cards, allergies/conditions, open risk alerts, timeline across all modules, vitals series, adherence |
| Records service | `server/records/service.ts` | Open history (always logged), Share-history toggle (off revokes grants), access log list |
| QR card logic | `features/records/qrCard.ts` | Refresh timing, countdown, never shows an expired code |
| Upload rules | `features/records/upload.ts` | Category, type and size checks, storage path, progress |
| Blood banks | `features/bloodbank/*` | `BloodBankService` with 15 Bengaluru banks (mock stock). Filter, distance, staleness, Call/Directions links, admin stock edit |
| Doctor/admin logic | `features/doctor/*` | Dashboard, patient search and form validation, referral inbox, admin analytics |
| Database | `supabase/migrations/4001–4003` | P4 tables, RLS on P4 and shared tables, private `health-reports` bucket |
| RLS tests | `supabase/tests/4001_p4_rls.test.sql` | About 50 checks that a role cannot read or write what it shouldn't |

## Run the tests

```bash
node --test "server/**/*.test.ts" "features/**/*.test.ts"      # Node 22.18+ (strips types natively)
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/4001_p4_rls.test.sql
```

The SQL suite was verified on PGlite (Postgres in WebAssembly) using stubs
for Supabase `auth`, `storage` and P1's base tables. A mutation check weakened
13 rules one at a time: 11 were caught, and the other 2 are redundant safety
layers (another rule still blocks the same action).

## e-RaktKosh

There is no public API, so the finder uses mock data behind `BloodBankService`.
Phone numbers are fake (`+91 80 0000 xxxx`, flagged `phoneVerified: false`),
so the UI must label them as demo numbers. See `features/bloodbank/eraktkosh.ts`.

## Waiting on P1's skeleton (Expo + Supabase)

- **Screens:** `app/(doctor)/` (dashboard, patients, scan, consultation, inbox, admin) and P4's `app/(patient)/` screens (QR card, history, upload, blood banks), in the indigo accent with tablet layouts
- **Supabase repository** implementing `server/records/repository.ts`
- **Edge Functions** `qr-issue` and `qr-scan`, wrapping `server/qr/service.ts`
- **Demo kit:** root `README.md` with screenshots, architecture diagram and 3-minute script
