# server/integrations

Adapters for Indian government health systems. Only what is officially
documented and usable without credentials we lack is built. Full evaluation,
sources and the steps to apply: `docs/INTEGRATIONS.md`.

| Folder / file | What it is | State |
|---|---|---|
| `status.ts`, `routes.ts` | `GET /integrations/status`: one entry per system (verdict, enabled/disabled, missing env var **names**, never values). Admins can add `?probe=abdm` to test the ABDM sandbox credentials once. | Live |
| `abdm/` | ABDM gateway session (access token) client for the **sandbox**. | Disabled until env vars are set |
| `janaushadhi/products.ts` | Parser for the official PMBJP Product & MRP List (CSV). Used by `server/scripts/importJanAushadhi.ts`. | Script only; data not shipped |

## ABDM (sandbox)

Set on the server only (repo-root `.env` / Supabase secrets, never `EXPO_PUBLIC_*`):

```
ABDM_CLIENT_ID=...            # from the ABDM sandbox after registration
ABDM_CLIENT_SECRET=...
ABDM_BASE_URL=https://dev.abdm.gov.in/api/hiecm
ABDM_CM_ID=sbx                # optional, default sbx
```

- `AbdmSession.accessToken()` → `POST {base}/gateway/v3/sessions` with
  `{ clientId, clientSecret, grantType: "client_credentials" }` and headers
  `X-CM-ID`, `REQUEST-ID`, `TIMESTAMP`. Token cached ≤ 15 min.
- `AbdmSession.gatewayHeaders()` gives `Authorization: Bearer …` plus the same
  headers, for future gateway calls.
- The production gateway (`apis.abdm.gov.in`) and `X-CM-ID: abdm` are refused
  on purpose. Go-live needs NHA approval first.
- Shapes come from NHA's own open-source wrapper
  (github.com/NHA-ABDM/ABDM-wrapper). ABHA verification is **not** built: the
  V3 ABHA docs (sandbox.abdm.gov.in) are only readable after sign-in, and the
  calls need RSA encryption with ABDM's public key. We will not guess them.

## Jan Aushadhi

```
node server/scripts/importJanAushadhi.ts <products.csv> --dry-run
node server/scripts/importJanAushadhi.ts <products.csv> --out=/somewhere/outside-git/janaushadhi.json
```

The CSV is the official Product & MRP List saved from janaushadhi.gov.in or
pmbi.co.in. Those pages say "All Rights Reserved" (PMBI): do not commit the
CSV or JSON, and do not ship them in the app until PMBI agrees in writing.

## Tests

`npm run test:server` runs `server/integrations/**/__tests__`. All network
calls use a fake fetch; no test reaches a real ABDM endpoint.

## Rules for new adapters here
- Disabled unless its env vars are set; report it in `status.ts`.
- Never return or log secrets or tokens.
- Inject `fetch` so tests never hit government systems.
- No scraping. Only documented, officially offered APIs or datasets.
- Node type stripping + Deno: no enums, no constructor parameter properties, explicit `.ts` imports.
