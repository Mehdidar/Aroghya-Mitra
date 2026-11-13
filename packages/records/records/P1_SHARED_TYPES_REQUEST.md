# P4 → P1: shared types and tables P4 depends on

P4 (Doctor/Admin + Health Records) has written its code against the draft
types in `features/records/types.ts`. When the shared types land, P4 will
re-export them from that one file. Please include the fields below, or tell P4
what you named them instead.

**Most important:** `Prescription`, `Referral`, `AccessLog`, `Consultation`.

## Tables P4's migrations (`supabase/migrations/4001–4003`) need from the base

| Table | Columns P4 uses |
|---|---|
| `facilities` | `id uuid` |
| `profiles` | `id uuid → auth.users`, `role text` (`patient`/`doctor`/`asha`/`admin`), `full_name`, `facility_id uuid`, `is_active boolean` |
| `patients` | `id uuid`, `user_id uuid null → auth.users` (null = registered by a doctor, no app account), `full_name`, `facility_id`, `asha_worker_id → profiles` |
| `prescriptions` | `id`, `patient_id`, `prescribed_by → profiles` (null for scanned paper ones), `source` (`doctor`/`scan`), `issued_at`, `diagnosis`, `items jsonb`, `notes` |
| `consultations` | `id`, `patient_id`, `doctor_id`, `facility_id`, `started_at`, `notes`, `diagnosis`, `lab_orders text[]`, `follow_up_date date`, `prescription_id`, `referral_id` |
| `referrals` | `id`, `patient_id`, `from_asha_id`, `to_doctor_id null`, `to_facility_id null`, `reason`, `risk_alert_id null`, `status` (`pending`/`seen`/`accepted`/`closed`), `created_at`, `seen_at`, `accepted_at` |
| `access_logs` | `id`, `patient_id`, `viewer_id`, `viewer_role`, `viewer_name`, `method` (`qr_scan`/`direct`), `outcome` (`granted`/`denied`), `reason`, `created_at` |

P4 also reads P2's `dose_logs` and P3's `asha_visits`, `risk_alerts` and
`vitals`. The fields are in `features/records/types.ts`.

## Notes for P1

- **P4's base migrations must run first.** P1's base migration needs a lower number than `4001` so it runs before P4's.
- **4002 turns on RLS for `patients`, `prescriptions`, `consultations`, `referrals`, `access_logs` and `profiles`.** Each P4 policy only adds access, and all are named `p4_*`. P2 and P3 still need their own policies for their roles.
- **Only the server writes `access_logs`.** Clients have no insert, update or delete rights on it. Every history view is logged by the Edge Function in `server/records/service.ts`.
- **The server code imports with explicit `.ts` extensions** (needed for Node and Deno). For Expo/tsc, set `"allowImportingTsExtensions": true` together with `"noEmit": true` in `tsconfig.json`.
- **The QR Edge Function needs a `QR_TOKEN_SECRET` env var** of at least 32 random bytes. It is server-only: never put it in the app bundle.
