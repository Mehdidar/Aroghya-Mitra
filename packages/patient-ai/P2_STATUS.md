# P2: Patient AI & Voice, status

## Done (plain TypeScript, tested; live-tested against Sarvam on 2026-11-13)

| Area | Files | What it does |
|---|---|---|
| Sarvam client | `server/speech/sarvamClient.ts` | Speech-to-text (REST + realtime WebSocket), Bulbul TTS (REST + HTTP stream), translate, language ID, chat (streaming). `api-subscription-key` header, timeouts, retry with backoff, typed errors that say when to fall back to device speech |
| Language support | `server/speech/languageCapabilities.ts` | Per language: STT, Bulbul voice, translate model, fallback. Urdu → device voice, Kashmiri → text only (no Bulbul voice) |
| HTTP endpoints | `server/speech/http.ts` | `POST /speech/stt`, `/speech/tts`, `/ai/chat` (SSE). Web-standard handler: Supabase Edge Function or `scripts/devServer.ts` |
| Chatbot | `server/ai/chat/*` | Emergency check first (no AI call), search over approved WHO/MoHFW content, safety prompt, streamed reply, suggestion chips, cached phrase translations |
| Red flags | `features/patient-ai/safety/*` | On-device "Call 108" for 13 emergency types in English, Hinglish and 11 Indian languages. Self-harm shows Tele-MANAS 14416 |
| Reminders | `features/patient-ai/reminders/*` | Dose times, rolling 7-day window (iOS 64 limit), grouped notifications with Taken/Skip, timeline, adherence, streak. `expo-notifications` adapter (Android 13+ permission order) |
| Prescription reading | `server/ai/prescription/*` | Zod schema with per-field confidence ("Confirm with pharmacist" below 0.75), prompts, parser for 1-0-1 / BD / TDS / SOS / durations |
| Food analysis | `server/ai/food/*`, `features/patient-ai/nutrition/macros.ts` | Schema, prompt, `FoodRecognizer` (vision LLM now; DishDetect adapter for the team model later), macro maths for the portion slider |
| Chat history | `features/patient-ai/chat/historyStore.ts` | Saved on the phone only |

## Measured live (11 languages)

| | Result |
|---|---|
| Chat reply language and script | Correct in hi, ta, bn, te, mr, gu, kn, ml, pa, ur, od |
| Chat first word | 0.17–0.36 s (Odia ~1.1 s: always translated for the safety check) |
| Emergency detection | On the phone in 10 languages; Odia via the server's translated check |
| Voice round trip (Bulbul → Saaras) | Exact in all 9 tested languages (Tamil/Bengali write "two" as "2") |
| TTS first audio (HTTP stream) | ~0.22 s |
| Realtime STT first partial | ~1.4 s |

## Run the tests

```bash
npm i --no-save zod@4          # only dependency, until P1 adds a root package.json
node --test "server/**/*.test.ts" "features/**/*.test.ts"
```

Live checks (need `SARVAM_API_KEY` in the environment, never in a file that is committed):

```bash
node server/speech/scripts/smoke.ts      # every Sarvam API, with timings
node server/ai/scripts/chatDemo.ts       # chat service end to end
node server/speech/scripts/devServer.ts  # endpoints on :8787 for the phone
```

## For P3 (ASHA voice)

- Point the app at the server instead of calling Sarvam directly, so the key is no longer in the APK:
  `EXPO_PUBLIC_SARVAM_STT_URL=http://<laptop-LAN-IP>:8787/speech/stt`. The endpoint takes the same multipart fields the app already sends (`file`, `language_code`) and returns `{ transcript }`.
- `saarika:v2.5` (the current default in `mobile/.env.example`) is not in Sarvam's current docs. The endpoint ignores the client's `model` and uses `saaras:v3`, which is tested.
- On 503 the response has `fallback: "device"`: show the "type it instead" path.

## Needs from P1

- Root `package.json` with `zod` (P2's only runtime dependency) and the test script above.
- Shared types: move `DoseSlot` / `MealRelation` (`features/patient-ai/types.ts`) and the `Prescription`, `DoseLog` shapes into the shared package. P4 reads `dose_logs`.
- Auth: replace the `P2_PROXY_TOKEN` check in `server/speech/http.ts` with Supabase JWT verification.
- Screens: `app/(patient)/` chat, voice orb, prescription explainer, nutrition analyzer; P1 places `AssistantHeroBanner` and `UpcomingRemindersCard` on the home screen.

## Needs review before real users

- **Red-flag terms:** a native speaker per language. Odia, Assamese and Kashmiri have no on-device list yet.
- **Health content** (`server/ai/chat/knowledge.ts`): plain-language summaries of WHO/MoHFW pages, every entry `reviewed: false` until a clinician checks it.
- **Not yet tested:** real (human) voices and noise, Urdu device voice on a phone, prescription and food photos, the voice assistant end to end.
