# Teleconsultation (video) — research note

> **Status: NOTHING IS IMPLEMENTED.** Aroghya Mitra has no video or audio
> teleconsultation. The appointments feature books **in-person** PHC visits only.
> This note records the options, what each needs, and a recommendation. It was
> written on 2026-11-14 from public sources (linked below); vendor terms change,
> so confirm each point with the provider before building anything.

## Why not build it now

A teleconsultation is a clinical encounter. Under the Telemedicine Practice
Guidelines 2020 it needs a registered medical practitioner (RMP), the patient's
recorded consent, an identity check of both sides, a record of the consultation
and a safe route to in-person care in an emergency. A video call that works in a
demo but does not meet those rules would be unsafe to show as "real". There is
also no provider account, keys or data-processing agreement in this project.

## Rules that apply (India)

- **Telemedicine Practice Guidelines, 2020** (MoHFW / Board of Governors in
  supersession of MCI; Appendix 5 of the IMC Professional Conduct Regulations).
  Official text: <https://www.mohfw.gov.in/pdf/Telemedicine.pdf>. Summaries:
  [PSA Legal FAQ](https://psalegal.com/telemedicine-guidelines-2020-faq/),
  [Khaitan & Co](https://khaitanco.com/thought-leaderships/Telemedicine-Practice-Guidelines),
  [AIIMS FAQ](https://aiims.edu/images/pdf/notice/FAQ_Telemedicine.pdf).
  - Only an RMP on the State / Indian Medical Register may consult.
  - **Consent:** implied if the patient starts the consultation; explicit (and
    recorded in the patient record) if a health worker, RMP or caregiver starts
    it — i.e. an **ASHA-initiated** teleconsult needs explicit recorded consent.
  - **Identity:** the RMP verifies the patient's identity (name, age, address,
    ID where needed) and states their own name and registration number.
  - **Records:** the RMP keeps a digital trail of the consultation (logs,
    messages, images, notes, prescription). The guidelines do **not** require
    recording the video; if a recording is made it is health data and needs
    consent, secure storage and a retention rule.
  - **Prescribing limits:** List O / A / B medicine categories; some medicines
    only after a video consult or follow-up; Schedule X / NDPS never by telemedicine.
  - **Emergency:** first aid advice and immediate referral to in-person care
    (the app's 108 button must stay visible during any consult).
  - RMPs must complete the mandated online telemedicine course.
- **Digital Personal Data Protection Act, 2023 + Rules 2025** — health data is
  personal data; consent notices, purpose limitation, breach reporting. Cross-border
  transfer is allowed except to restricted countries, but sector rules may add
  localisation, so India data residency is the safe default
  ([IAPP overview](https://iapp.org/resources/article/the-act-unpacked-fundamentals-of-compliance-under-indias-digital-personal-data-protection-act)).
- **ABDM**: consultation records should link to the patient's ABHA and the
  doctor's HPR id / facility HFR id if the PHC is on ABDM.

## Options

| Option | What it is | Data residency | What it needs | Fit |
|---|---|---|---|---|
| **eSanjeevani** (MoHFW, C-DAC) | Government national telemedicine service: AB-HWC (hub-and-spoke, PHC/HWC ↔ hub doctor) and OPD (patient ↔ doctor). Integrated with ABDM (ABHA, HPR, HFR) since 2022; 43+ crore consultations. | Government-hosted in India | The PHC and its doctors onboarded by the **state** eSanjeevani nodal officer; doctors use the eSanjeevani app/portal. | Best clinical/regulatory fit for a PHC. **No public third-party API or SDK found.** UHI-based discovery/booking was *proposed* by NHA but not confirmed live. |
| **100ms** | Indian WebRTC video SDK (React Native SDK available). | US / EU / **India** stores; India residency for enterprise plans via sales. Recordings off unless enabled; usually go to the customer's own bucket. SOC 2 Type II. | Account, app access key + secret (server only), a server endpoint that mints short-lived room tokens, enterprise contract for India residency, DPA. | Good technical fit if a custom call is ever needed. |
| **Agora** | Global RTC SDK (React Native SDK). | Media "geofencing" can restrict to `AREA_CODE_IN`; storage/logging terms need contract review. | App ID + certificate (server mints tokens), geofencing set in the client, DPA. | Workable; confirm India processing for logs and recordings. |
| **Twilio Programmable Video** | Former market leader. | — | — | **Do not use:** Twilio's notice puts end of life at **5 Dec 2026** ([changelog](https://www.twilio.com/en-us/changelog/Extension-of-Twilio-Programmable-Video-End-of-Life-to-December-5-2026)), three weeks from this note. |
| **Jitsi Meet, self-hosted** | Open-source; Docker deployment; JWT room auth (`ENABLE_AUTH=1`, `AUTH_TYPE=jwt`, `APP_ID`, `APP_SECRET`); optional E2EE toggle. | Wherever we host it (e.g. an Indian cloud region) | A server we operate (TURN, scaling, patching, monitoring), JWT minted by our server, ops on-call. | Full control and no per-minute fee, but the operational and security burden lands on a small team. |

Sources: [eSanjeevani–ABDM integration (Medical Dialogues)](https://medicaldialogues.in/news/health/nha-esanjeevani-integrated-with-ayushman-bharat-digital-mission-93952),
[eSanjeevani 43 crore consultations](https://www.digitalhealthnews.com/esanjeevani-crosses-43-crore-consultations-as-india-strengthens-digital-health-network),
[UHI telemedicine integration](https://www.digitalhealthnews.com/central-govt-to-integrate-telemedicine-services-under-unified-health-interface),
[100ms security & residency](https://www.100ms.live/docs/get-started/v2/get-started/security-and-privacy/100ms-policy-on-security-and-privacy),
[100ms telehealth](https://100ms.live/solutions/telehealth),
[Agora geofencing](https://docs.agora.io/en/realtime-media/rtc/build/manage-connection-and-quality/geofencing),
[Twilio Video sunset analysis](https://bloggeek.me/twilio-programmable-video-sunset/),
[Jitsi Docker handbook](https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-docker).

## Recommendation

1. **Use eSanjeevani, not our own video.** For a government PHC the right path
   is the state's eSanjeevani AB-HWC/OPD rollout: doctors are already
   credentialed, it is ABDM-linked and free. In the app, the most we should add
   is a clearly labelled link/hand-off ("Consult on eSanjeevani"), plus, once the
   PHC is onboarded, an appointment type "eSanjeevani teleconsult" whose slot
   the doctor publishes like any other. Ask the Karnataka eSanjeevani nodal
   officer / C-DAC Mohali whether any integration interface (deep link, UHI) is
   available to partner apps.
2. **Only if a custom call is ever required** (e.g. ASHA-assisted video at a
   home visit outside eSanjeevani): 100ms with an India-residency enterprise
   contract, or Agora with `AREA_CODE_IN`; tokens minted by our server per
   appointment (never keys in the app); explicit recorded consent screen (ASHA
   flow); RMP name + registration number shown; recording **off** by default;
   consultation notes saved to `consultations`; 108 button kept on screen.
3. Do not adopt Twilio Video. Self-hosted Jitsi only with a dedicated ops owner.

## If it is built later — checklist

- [ ] Provider contract + DPA, India data residency confirmed in writing
- [ ] Server endpoint that issues short-lived, per-appointment room tokens (doctor and patient only)
- [ ] Consent capture (who started the call; explicit consent stored when ASHA/caregiver initiated)
- [ ] Doctor identity: name, registration number, HPR id shown to the patient
- [ ] Patient identity check step for the doctor
- [ ] Recording policy (default off), retention, access logging
- [ ] Consultation note + e-prescription rules per medicine list O/A/B
- [ ] Emergency path: 108 button, "go to the PHC now" advice
- [ ] Low-bandwidth fallback (audio-only) and all 7 languages
- [ ] Clinical and legal review before any patient use
