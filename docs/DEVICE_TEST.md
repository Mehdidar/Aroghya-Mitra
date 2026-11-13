# Testing on a real phone

The browser tests cannot reach the microphone, the camera or notifications.
These steps need a person with an Android phone (and an iPhone if you have one).
About 20 minutes. Tick each box and write down anything odd.

## Install

**Fastest (same Wi-Fi as the laptop):** run `npm run demo` on the laptop,
install **Expo Go** from the Play Store / App Store, and scan the QR code the
script prints.

**A real app file (works anywhere, needs a free Expo account):**
`cd apps/mobile && npx eas-cli build -p android --profile preview` gives an APK
link to install. If the server is hosted (`npm run deploy:server`), set
`EXPO_PUBLIC_API_URL` in `eas.json` → `build.preview.env` to the URL it printed
first, or the APK will look for a server on the phone itself.

## Checklist

| # | Try this | Expected | OK? |
|---|---|---|---|
| 1 | Patient → voice orb → allow microphone → say "mujhe sir dard hai" | the words appear, an answer is spoken back in Hindi | ☐ |
| 2 | Say "seene mein dard aur pasina" (chest pain and sweating) | red "Call 108" banner at once | ☐ |
| 3 | Tap Call 108 on the banner | the phone dialler opens with 108 (do not press call) | ☐ |
| 4 | Prescription → take a photo of a printed prescription | medicine cards appear | ☐ |
| 5 | Set reminders, then change the phone's clock or wait for the next dose time | a notification arrives, also with the app closed | ☐ |
| 6 | Restart the phone, wait for the next dose | the reminder still arrives | ☐ |
| 7 | Nutrition → photo of a plate of food | dish name, calories, cautions | ☐ |
| 8 | Patient → QR card; on a second phone sign in as Doctor → Scan → allow camera → point at the first phone | Rekha's history opens on the doctor's phone | ☐ |
| 9 | ASHA → open Rekha → new visit → record a voice note (allow mic) → add a photo → save | visit saved; with airplane mode on it says "waiting to sync", and syncs when back online | ☐ |
| 10 | Doctor → New consultation → prescribe → Save; then on the patient phone open Reminders | the new medicine appears within ~20 seconds | ☐ |
| 11 | Settings → language → Kannada, then Urdu | all text changes; Urdu flips to right-to-left | ☐ |
| 12 | Blood banks → allow location | banks sorted by distance from you | ☐ |
| 13 | Large text (phone Settings → font size biggest) | screens still readable, buttons not cut off | ☐ |

Phone model and Android/iOS version: ______________________

Tested by: ______________  Date: ______________
