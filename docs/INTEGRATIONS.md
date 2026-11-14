# Government health integrations

Checked on **2026-11-14** (branch `finish/one-app`). Covers ABDM / ABHA,
eSanjeevani, e-RaktKosh, Jan Aushadhi, U-WIN and DigiLocker: what each
officially offers, what it needs from us, what we built, and how to apply.

How this was checked: web search and page fetches on 2026-11-14, plus NHA's own
code on GitHub. Several official portals load as JavaScript apps, need a login,
or would not load from our tools (sandbox.abdm.gov.in docs, uwin.mohfw.gov.in,
esanjeevani.mohfw.gov.in, partners.digilocker.gov.in did not resolve,
janaushadhi.gov.in failed its TLS certificate check). Anything we could not read
on an official page is marked **(not re-verified)** and comes from earlier
knowledge or secondary sources. Confirm those points with the agency before you
rely on them.

## Summary

| System | Verdict | Built in this repo | What you need to do next |
|---|---|---|---|
| **ABDM / ABHA** (ABHA, consent manager, HIP/HIU, HPR/HFR) | **Available with credentials** (sandbox), then NHA certification for live use | Sandbox session-token client (off until env vars are set), `GET /integrations/status` | Register on the ABDM sandbox, get a client id and secret, put them in the server env |
| **eSanjeevani** (national telemedicine) | **No public API** | Nothing | Link patients out to the official eSanjeevani app or site. Records can arrive later through ABDM consent |
| **e-RaktKosh** (blood stock) | **No public API** | Already had: official blood-bank directory import (GODL). No live stock | Email eraktkosh@cdac.in to ask for a data-sharing arrangement |
| **Jan Aushadhi** (PMBJP medicines and Kendras) | **Public data only**, but "All Rights Reserved" | CSV importer + parser for the official Product & MRP List. No data shipped | Ask PMBI for written permission to use the list. Then import it |
| **U-WIN** (immunisation) | **No public API** | Nothing | None for now. Vaccination records may come through ABHA once ABDM is live (not re-verified) |
| **DigiLocker** | **Partner onboarding required** (Requester, via MeitY/NeGD and API Setu) | Nothing | Apply as a Requester organisation, if we decide we need it |

Status words used below:
- **Available with credentials**: there is an official API. We can use it once the agency gives us keys.
- **Partner onboarding required**: there is an API, but only for approved organisations after an agreement.
- **No public API**: no documented API for outside apps. People use the agency's own site or app.
- **Public data only**: the agency publishes lists we can read, but there is no API.

Nothing here scrapes a website or pretends to be a live integration. The app
keeps its labelled demo data (blood stock, Jan Aushadhi prices) until real data is
legally available.

### What the server now reports

`GET /integrations/status` (any signed-in user) returns one entry per system:

```json
{ "ok": true, "checkedAt": "…", "integrations": [
  { "id": "abdm", "name": "ABDM / ABHA (sandbox)", "verdict": "available_with_credentials",
    "state": "disabled", "built": ["gateway session token (sandbox)"],
    "missingEnv": ["ABDM_CLIENT_ID", "ABDM_CLIENT_SECRET", "ABDM_BASE_URL"], "note": "…" },
  …
] }
```

`state` is one of: `enabled`, `disabled` (built but its env vars are unset),
`misconfigured`, or `not_built`. Only variable **names** appear, never values.
An admin can add `?probe=abdm` to try the sandbox token call once. It returns
`{ "probe": { "abdm": { "ok": true } } }`, or the HTTP status and a short reason.
The admin "Integrations" line can read this route.

---

## 1. ABDM / ABHA (Ayushman Bharat Digital Mission)

**Verdict: Available with credentials (sandbox).** Live use needs NHA certification.

### In plain English
ABDM is India's national health data network, run by the National Health
Authority (NHA). It covers:
- **ABHA**: a 14-digit health ID plus an address like `name@abdm`.
- A **consent manager** (HIE-CM): patients approve who may see their records.
- **HIP**: a health information provider, an app or facility that shares records.
- **HIU**: a health information user, one that requests records.
- Registries of professionals (**HPR**) and facilities (**HFR**).

Any company can register for the **sandbox**, a test copy of ABDM. Going live
takes several stages: build in the sandbox, pass NHA's functional tests and a
security audit, then get production keys.

For us, the realistic order is:
1. **Milestone 1**: let patients verify or link their ABHA in our app.
2. **Milestone 2**: become an HIP, so PHC prescriptions and visit notes can go to the patient's ABHA locker.
3. **Milestone 3**: become an HIU, so a doctor can request a patient's records from other hospitals with the patient's consent.

### Official sources checked (2026-11-14)
- https://sandbox.abdm.gov.in → redirects (301) to https://sandbox.nha.gov.in/. That page lists the sandboxes: HIE-CM (ABHA, health records, consent) at https://sbxai.abdm.gov.in/, UHI, and NHCX (https://nhcxai.abdm.gov.in). Toll-free support: 14477.
- https://sandbox.abdm.gov.in/sandbox/v3/new-documentation?doc=ByOTP (V3 ABHA docs): renders client-side, so we could not read its content. **Not verified.**
- https://abdm.gov.in/abdm: only the page title rendered. **Not verified.**
- NHA's official open-source wrapper: https://github.com/NHA-ABDM/ABDM-wrapper (last pushed 2025-02-21). We read these files in it:
  - `src/main/resources/application-v3.properties`: sandbox gateway `https://dev.abdm.gov.in/api/hiecm`, production `https://apis.abdm.gov.in/api/hiecm`, `createSessionPath=/gateway/v3/sessions`, plus the consent and data-flow paths (for example `/consent/v3/request/init` and `/data-flow/v3/health-information/request`).
  - `src/main/java/in/nha/abdm/wrapper/v1/common/requests/SessionManager.java`: the session body is `{clientId, clientSecret, grantType: "client_credentials"}`. Headers are `X-CM-ID`, `TIMESTAMP` (ISO-8601 UTC with milliseconds) and `REQUEST-ID` (a UUID). The token "expires at 20 minutes", so the wrapper refreshes it every 15.
  - `mock-gateway/src/main/resources/abdm-gateway.yaml`: `SessionResponse { accessToken, expiresIn, refreshExpiresIn, refreshToken, tokenType }`.
- Developer forum (secondary): https://devforum.abdm.gov.in. Threads about V3 access and sessions, for example https://devforum.abdm.gov.in/t/i-am-not-able-to-access-the-v3-apis/8094.

### Authentication
- **Sandbox:** register at the sandbox portal and receive a **client id and secret**. Exchange them for a JWT with `POST {gateway}/gateway/v3/sessions`. `X-CM-ID` is `sbx` in the sandbox and `abdm` in production. Every gateway call then sends `Authorization: Bearer <token>`. The token lasts about 20 minutes.
- **HIP/HIU calls** also need an **HFR facility id** (sent as `X-HIP-ID` / `X-HIU-ID`), linked to our client id. The PHC must be registered in HFR, and its doctors in HPR, before records can be shared under their names. **(not re-verified)**
- **ABHA V3 enrolment and verification** (host `abhasbx.abdm.gov.in/abha/api/v3`, per secondary sources): logins such as the ABHA number, mobile number and OTP must be **RSA-encrypted with ABDM's public key** before sending. Responses return a user token (`X-token`) for profile calls. **(not re-verified; official V3 docs need sign-in)**
- **Production:** after the sandbox work come the functional test (the "exit" test in the sandbox), a security audit by a CERT-In empanelled auditor, the go-live application, and then production keys. **(not re-verified)**

### Permissions and consent
- Records move only under a **consent artefact**: a signed record of what the patient agreed to share. It names the purpose, the HIU, the types of health information, the date range, the expiry, and how often data may be fetched. The patient approves it in their ABHA/PHR app, and can revoke it.
- Data moves encrypted end to end. The HIP pushes it straight to the HIU's data-push URL, never through the gateway in clear. (In the wrapper this is the `dataPushUrl` and `/data-flow/v3/...` paths.)
- Records are FHIR R4 bundles, following NRCeS profiles (`OPConsultation`, `Prescription`, `DiagnosticReport`, …). **(not re-verified)**
- NHA's **Health Data Management Policy** applies to every ABDM participant. **(not re-verified)**
- **DPDP Act 2023 / DPDP Rules 2025:**
  - MeitY notified the Rules on **14 Nov 2025**: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf (PIB).
  - Most obligations apply **18 months later (about 13 May 2027)**: notice, consent, security safeguards, breach reporting, retention, and children's data. Consent Manager registration (Rule 4) starts earlier. Sources disagree between 12 months and "to be notified".
  - Before then we should:
    - give a clear notice in all 7 languages;
    - get consent for each specific purpose;
    - let users withdraw consent;
    - delete data when the purpose ends;
    - report breaches;
    - get verifiable parental consent for users under 18. Pregnant minors are a real case for us; check the healthcare exemption in the Rules' schedule.

### What we could build
| Feature | Needs |
|---|---|
| Sandbox token + status (done) | Sandbox client id/secret |
| Verify a patient's ABHA number or address, and show their ABHA card | Sandbox V3 ABHA docs, RSA public key handling, an OTP flow in the app (M1) |
| Create an ABHA for a patient | Same as above. Aadhaar-OTP enrolment has extra NHA conditions |
| Scan-and-share at the PHC desk (HFR QR → patient profile) | HFR facility id, HIP callbacks (M1/M2) |
| Push PHC prescriptions and consultations to the patient's ABHA locker | HIP (M2): care-context linking, FHIR bundles, encrypted data push |
| A doctor pulls records from other facilities with consent | HIU (M3): consent requests, decrypting received data |

### What we built
- `server/integrations/abdm/config.ts`: reads `ABDM_CLIENT_ID`, `ABDM_CLIENT_SECRET`, `ABDM_BASE_URL` and optional `ABDM_CM_ID` (default `sbx`). The adapter stays **off** unless all three required variables are set. It refuses the production gateway, `X-CM-ID: abdm`, and non-https URLs (http is allowed only for a local mock gateway).
- `server/integrations/abdm/session.ts`: `AbdmSession.accessToken()` and `gatewayHeaders()`. They follow the request and response shapes in NHA's wrapper. The token is cached for at most 15 minutes, concurrent callers share one fetch, and errors never contain the secret or the token.
- `server/integrations/status.ts` and `routes.ts`: `GET /integrations/status`, plus the admin-only `?probe=abdm`.
- Tests: `server/integrations/abdm/__tests__/session.test.ts` and `server/integrations/__tests__/status.test.ts`. They use a fake fetch, so no real ABDM endpoint is called.
- **Not built:** ABHA verification. We could not read the official V3 request and response shapes, or the encryption details, from an official page. We will not guess at an identity API.

### Steps for the team to apply
1. Go to https://sandbox.abdm.gov.in (now https://sandbox.nha.gov.in) and open the **HIE-CM sandbox** (https://sbxai.abdm.gov.in/). Register the organisation that owns Aroghya Mitra. You will need the entity name, the type of solution (choose HIP + HIU, and "ABHA creation/verification" for M1), and a technical contact. **(form fields not re-verified)**
2. When the sandbox **client id and secret** arrive by email or on the dashboard, put them in the repo-root `.env` and the Supabase secrets. Never put them in `EXPO_PUBLIC_*`.
   ```
   ABDM_CLIENT_ID=…
   ABDM_CLIENT_SECRET=…
   ABDM_BASE_URL=https://dev.abdm.gov.in/api/hiecm
   ABDM_CM_ID=sbx
   ```
3. Restart the server. As admin, call `GET /integrations/status?probe=abdm`. You should see `"ok": true`.
4. Create test ABHA addresses (`…@sbx`) in the sandbox PHR app (phrsbx.abdm.gov.in per secondary sources). Download the V3 docs and the public key from the signed-in sandbox portal, and share them with engineering so ABHA verification can be built against the real specification.
5. Register **PHC Hebbal in HFR** (https://facility.abdm.gov.in) and its doctors in **HPR** (https://hpr.abdm.gov.in). This needs the facility's official details and the doctors' registration numbers. **(URLs not re-verified)**
6. Register the server's callback URL in the sandbox (the "bridge" URL) for HIP/HIU callbacks.
7. For go-live: pass the sandbox functional (exit) test, commission a security audit from a CERT-In empanelled auditor, apply for production, then sign NHA's participation terms. Questions: integration.support@nha.gov.in or 14477.

### Risks
- The V3 API shapes still change. Forum threads show V0.5, V1 and V3 confusion. Pin each call to a documented version.
- The `expiresIn` unit is ambiguous: the spec says "minutes" while the wrapper treats tokens as 20-minute. We cap reuse at 15 minutes.
- ABHA data is identity data. Handle it under DPDP, keep it only on the server, and log every access, as we already do for history.
- Certification takes weeks to months, and the audit costs money.
- An HIP must answer gateway callbacks quickly. Our Supabase Edge Function cold starts may need checking.

---

## 2. eSanjeevani (national telemedicine)

**Verdict: No public API.**

### In plain English
eSanjeevani is the government's free video-consultation service. It runs in two
modes: OPD (patient to doctor) and AB-HWC (health and wellness centre to a
specialist hub). Patients use the eSanjeevani app or website directly. It is
already connected to ABDM: consultations created there can be linked to a
patient's ABHA. Any outside app receives those records through ABDM consent,
not through an eSanjeevani API.

### Sources checked (2026-11-14)
- https://esanjeevani.mohfw.gov.in/: client-rendered, only the title loaded. No developer or API section was visible. **Not verified.**
- Press coverage of the ABDM integration (June 2022), for example https://medicaldialogues.in/news/health/nha-esanjeevani-integrated-with-ayushman-bharat-digital-mission-93952.
- Web search for "eSanjeevani API integration third party": no official developer documentation found.

### Authentication / permissions
No third-party access programme is published. Patients sign in to eSanjeevani
with their own mobile OTP.

### What we could build
- A plain link-out ("Talk to a government doctor online, free") that opens the official eSanjeevani app or website. Use no branding beyond the name, and add no embedding. This is an app change (`apps/mobile`), which this work did not touch.
- Once ABDM M3 (HIU) is live: with the patient's consent, fetch their eSanjeevani consultation notes and prescriptions like any other ABDM record.

### What we built
Nothing. Status route entry only.

### Steps to apply
None available. If a direct partnership is wanted, write to the eSanjeevani team at C-DAC Mohali through the contact page on the official site, or to MoHFW. **(contact not re-verified)**

### Risks
Do not imply that Aroghya Mitra books eSanjeevani appointments or is part of
eSanjeevani.

---

## 3. e-RaktKosh (blood bank stock)

**Verdict: No public API.**

### In plain English
e-RaktKosh is MoHFW's blood bank management system, built by C-DAC. Anyone can
check stock on its website or app, but no machine-readable API is published
for other apps. Registration on e-RaktKosh became mandatory for blood centres
(reported for 27 Mar 2026), but that does not create an API for us. Reading
stock by scraping the site is not allowed, and we will not do it.

### Sources checked (2026-11-14)
- https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/eraktkoshfaq.cnt: the FAQ describes stock search on the website and the Android/iOS apps only. It mentions no API or data sharing. Contact: **eraktkosh@cdac.in**.
- https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/about.cnt
- https://services.india.gov.in/service/detail/check-blood-bank-stock-availability-eraktkosh (National Portal listing, which points to the same site).

### What we already have
- `npm run data:blood-banks -- <csv>` imports the **official Blood Bank Directory** (NHP/NIHFW, published under GODL on AIKosh and data.gov.in). It holds names, addresses and phone numbers, but no stock.
- `GET /blood-banks` serves those rows plus any stock an admin types in. The app says "call to check stock" and labels demo stock as demo.

### What we could build
- A link-out to the official e-RaktKosh stock page or app, next to each bank.
- Live stock only after C-DAC or MoHFW agree to a data feed.

### Steps to apply
Email eraktkosh@cdac.in (copy the State Blood Transfusion Council, Karnataka).
Describe the PHC use case and ask whether a read-only stock feed for a district
can be shared, and under what terms.

### Risks
Stock shown must never be invented. Rule 3 in AGENTS.md already covers this.

---

## 4. Jan Aushadhi (PMBJP generic medicines and Kendra locator)

**Verdict: Public data only, all rights reserved.** No API, and no open-licence dataset of the product list.

### In plain English
The Pradhan Mantri Bhartiya Janaushadhi Pariyojana sells generic medicines
cheaply through about 20,000 Kendras (PIB, June 2026). PMBI publishes the
product and price list and a Kendra finder on its websites, and runs the
"Jan Aushadhi Sugam" app. The pages say **"Copyright … PMBI. All Rights
Reserved."** On data.gov.in we found only state-wise **counts** of Kendras,
not a full product list or a geocoded Kendra list under GODL. So we built a
tool that can read the official list. We did **not** download or ship it.

### Sources checked (2026-11-14)
- https://janaushadhi.gov.in/productportfolio/ProductmrpList: cited in a Lok Sabha answer as the official price list. Our fetch failed its TLS certificate check, so we did not read it directly. **Not verified.**
- https://www.pmbi.co.in/Others.aspx: footer "Copyright 2026, Pharmaceuticals & Medical Devices Bureau of India (PMBI). All Rights Reserved". It links to `ProductList.aspx` (Product & MRP List), `SortingView.aspx` and `DistributorDetails.aspx`, which are web pages, not downloads. It also links to separate copyright, terms and conditions pages.
- Older official price PDFs: https://www.pmbi.co.in/old-data/New_MRP_Oct15.pdf and https://www.pmbi.co.in/old-data/PriceListDec2014.pdf. These are outdated, and their columns are Drug Code, Name of the Product, Unit Size, MRP.
- https://pharma-dept.gov.in/janaushadhi-scheme (Department of Pharmaceuticals).
- data.gov.in community pages with state-wise Kendra counts, for example https://community.data.gov.in/?p=116037. These are aggregates only.

### Authentication / permissions
None to read the pages. Reuse falls under PMBI's copyright terms: **get written
permission** before republishing prices in the app.

### What the app has today
`packages/patient-ai/generics/janAushadhi.ts` holds `JAN_AUSHADHI_DEMO`. It has
20 hand-entered rows, each with a generic name, a pack, an indicative
**branded** MRP, a Jan Aushadhi price and brand aliases. It is labelled DEMO.
`findGeneric(name, strength, table)` and `totalSaving(items, table)` already
take the table as a parameter.

### What we built
- `server/integrations/janaushadhi/products.ts`: `productRows(csvText)` parses the official Product & MRP List.
  - It finds the header even below a title line, and matches column-name variants such as "Generic Name" or "Name of the Product".
  - It parses MRPs written as "₹ 12.50", "12/-" or "Rs. 1,250.00".
  - It pulls the strength out of the name.
  - It skips and counts rows with no name, no usable MRP, or a duplicate drug code.
- `server/scripts/importJanAushadhi.ts`: reads a CSV you give it and writes a JSON file of `{ drugCode, name, unitSize, mrpInr, group, strength }`. It **does not download anything.**
  ```
  node server/scripts/importJanAushadhi.ts ~/Downloads/pmbjp-products.csv --dry-run
  node server/scripts/importJanAushadhi.ts ~/Downloads/pmbjp-products.csv --out=/tmp/janaushadhi.json
  ```
  To make the CSV, open the official Product & MRP List and save or export it as CSV.
  Keep the CSV and the JSON **outside git** until PMBI agrees.
- Tests: `server/integrations/janaushadhi/__tests__/products.test.ts`, using made-up fixture rows.

### How an import would replace the demo table
1. The official list gives the **Jan Aushadhi price only**. It has no branded MRPs, so on its own it cannot produce the "you save ₹X" figure the demo table shows.
2. Proposed change, in `packages/patient-ai`, by its owner:
   1. Build the table from the imported JSON. Fill `janAushadhiInr`, `generic` and `pack` from `mrpInr`, `name` and `unitSize`, and match on salt + `strength` as `findGeneric` already does.
   2. Show "Jan Aushadhi price ₹X for <pack>".
   3. Show a saving only when a branded price is known from a real source, such as the MRP on the patient's own scanned prescription or pharmacy bill. Do not use the invented demo brand prices.
   4. Keep the "ask your doctor or pharmacist before switching" line.
3. Kendra locator: link out to the official Kendra finder on janaushadhi.gov.in, or the Sugam app. Our OSM nearby map can also show pharmacies tagged as Jan Aushadhi Kendras where OSM has them. Each source must be labelled.

### Steps to apply
Write to PMBI, using the contact on the official site or via the Department of
Pharmaceuticals. Ask permission to show the Product & MRP List, and the Kendra
list with coordinates, inside a free public-health app with attribution.
Ask also whether a machine-readable file or feed exists.

### Risks
Prices change, so record the import date and show "prices as of <date>". The
copyright terms apply. Never show a "saving" built on invented branded prices.

---

## 5. U-WIN (Universal Immunisation Programme registry)

**Verdict: No public API.**

### In plain English
U-WIN is MoHFW's digital register of every pregnancy and childhood vaccination
under the national programme. Vaccinators record doses there, and citizens can
see and download certificates. It is reported to link with ABHA. No API for
outside apps is published.

### Sources checked (2026-11-14)
- https://uwin.mohfw.gov.in/: client-rendered, only the title loaded. **Not verified.**
- Secondary: UNDP on U-WIN's interoperability with ABDM (https://undp.org/node/393996), and reporting on a Poshan Tracker–ABHA integration that shows U-WIN immunisation data (https://www.digitalhealthnews.com/poshan-tracker-abha-integration-advances-unified-digital-health-records-under-abdm).

### What we could build
- A link-out for patients to see their own record on U-WIN. The ASHA app could point workers to the U-WIN vaccinator app; it must not copy data across.
- Later, through ABDM M3 and consent, immunisation records **if** U-WIN publishes them as an ABDM HIP. **(not re-verified)**

### What we built
Nothing. Status route entry only.

### Steps to apply
None public. Raise it with the state immunisation officer (Karnataka) or MoHFW's
UIP division if ASHA-side integration is wanted.

### Risks
ASHA visit data must not be presented as a U-WIN record.

---

## 6. DigiLocker

**Verdict: Partner onboarding required** (as a "Requester" organisation, through MeitY/NeGD and API Setu).

### In plain English
DigiLocker is the government's document wallet. An approved organisation can,
with the user's OAuth consent, pull that user's verified documents, such as
Aadhaar, a disability certificate or the ABHA card. Approval needs an onboarding
application, an agreement and a server in India. DigiLocker also works as an
ABDM health-locker app. For a health app, ABDM is usually the better route to
health records, and DigiLocker is mainly useful for verifying identity or
benefit documents.

### Sources checked (2026-11-14)
- https://partners.digilocker.gov.in/: DNS did not resolve from our tools. **Not verified.**
- DigiLocker Requester terms (June 2025): https://cf-media.api-setu.in/resources/DigiLocker-Terms-of-User-Requester-june-2025.pdf. It requires a senior authorised representative to complete onboarding, explicit informed user consent before any document is accessed, and no caching or storing of documents beyond the permitted duration.
- Requester API Specification v1.12 (Sept 2023): https://cf-media.api-setu.in/resources/Requester-APISpecification-V1_12.pdf
- Onboarding FAQ: https://www.digilocker.gov.in/assets/FAQ%20DL%20EL_onboarding.pdf. It says a registered Indian mobile number and a server located in India are mandatory.
- API Setu: https://apisetu.gov.in (the partner portal for credentials, per secondary sources).

### Authentication / permissions
OAuth 2.0: the user signs in to DigiLocker and approves each request. We get a
client id and secret only after onboarding is approved. Whether a sandbox
exists is unclear: one source says testing is done in production. **(not
re-verified)**

### What we could build
"Fetch my disability certificate or ABHA card from DigiLocker" for scheme
eligibility, with consent, and without storing the document beyond its purpose.

### What we built
Nothing. Status route entry only.

### Steps to apply
1. Decide whether we need it. ABDM covers health records.
2. Have a senior authorised representative apply as a Requester on the DigiLocker partners portal / API Setu. Organisation documents and the use case are required.
3. Accept the Requester terms, host the callback in India, and receive the credentials.

### Risks
Strict rules on storing documents. Consent is needed for each pull. Using
Aadhaar data brings its own legal rules.

---

## Environment variables

| Variable | Where | Needed for |
|---|---|---|
| `ABDM_CLIENT_ID` | server only | ABDM sandbox session |
| `ABDM_CLIENT_SECRET` | server only | ABDM sandbox session |
| `ABDM_BASE_URL` | server only | e.g. `https://dev.abdm.gov.in/api/hiecm` |
| `ABDM_CM_ID` | server only, optional | `sbx` (default) |

No other integration uses environment variables yet.

## Code map
- `server/integrations/README.md`: developer notes.
- `server/integrations/status.ts`, `routes.ts`: `GET /integrations/status`.
- `server/integrations/abdm/`: sandbox session client (`config.ts`, `session.ts`, `types.ts`).
- `server/integrations/janaushadhi/products.ts` and `server/scripts/importJanAushadhi.ts`: the official product list importer.
- `server/bloodbanks/`, `server/scripts/importBloodBanks.ts`: the blood bank directory import (it predates this document).
