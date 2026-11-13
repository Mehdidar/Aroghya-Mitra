# Team and ownership

The repo's commit history uses the hackathon's team labels. This is who owned
what, and where that code lives now.

| Team | Owned | Now at |
|---|---|---|
| **P1** Foundation | app shell, auth and role routing, theme, UI kit, i18n (7 languages), shared types, base migration, demo cast | `apps/mobile/app/_layout.tsx`, `app/(auth)`, `features/shared`, `locales/`, `packages/shared`, `supabase/migrations/1000_base.sql` |
| **P2** Patient AI + voice | Sarvam client (STT, TTS, translate, chat), chatbot with approved-content RAG and red flags, prescription and food extraction schemas, reminder schedule and adherence, macros | `server/speech`, `server/ai`, `packages/patient-ai` |
| **P3** ASHA | offline ASHA module (6 screens), 35-rule risk engine, voice transcript parser, sync contract, ASHA tables | `apps/mobile/features/asha`, `app/(asha)`, `server/risk`, `supabase/migrations/3001_asha.sql` |
| **P4** Doctor/Admin + records | signed QR tokens, access rules, history builder, upload rules, blood banks, doctor dashboard and inbox logic, records tables and RLS | `packages/records`, `server/qr`, `server/records`, `supabase/migrations/4001–4003`, `supabase/tests` |
| **ML** DishDetect India | food classifier (three heads + CLIP probe), curated nutrition table, diet rules, FastAPI service | `ml/food-classifier` |
| Integration (this branch) | one workspace, server router and auth, records store, patient / doctor / admin screens, hospital navigation, demo dataset, demo script, docs | everywhere above; see `git log finish/one-app` |

## Working agreements

- `@am/shared` is the only place a domain type is defined; module files re-export under their old names.
- Server code imports with explicit `.ts` extensions (Node and Deno); the app imports packages through `@am/*`.
- Every screen reads strings through i18next; English, Hindi and Kannada are complete, the other languages fall back to English where a key is missing (STATUS.md lists the gaps).
- Keys live in the repo-root `.env` and are read only by the server.
- Tests: `npm test` (server + packages + app), `npm run ml:test`; CI should also run `psql -f supabase/tests/4001_p4_rls.test.sql` against a database with the migrations applied.
