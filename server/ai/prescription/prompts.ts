/** Prompts for prescription reading. Provider-agnostic: used with Sarvam Vision OCR text, Claude or Gemini. */

export const PRESCRIPTION_SCHEMA_HINT = `{
  "isPrescription": boolean,              // false if the image is not a medical prescription
  "legibility": "good" | "partial" | "poor",
  "doctorName":  { "value": string | null, "confidence": number },
  "clinicName":  { "value": string | null, "confidence": number },
  "date":        { "value": string | null, "confidence": number },   // as written
  "patientName": { "value": string | null, "confidence": number },
  "medicines": [
    {
      "name":         { "value": string | null, "confidence": number },  // exactly as written, e.g. "Dolo 650"
      "genericName":  { "value": string | null, "confidence": number },  // only if written or certain, e.g. "Paracetamol"
      "strength":     { "value": string | null, "confidence": number },  // "650 mg", "5 mg/5 ml"
      "form":         { "value": "tablet"|"capsule"|"syrup"|"suspension"|"injection"|"drops"|"ointment"|"cream"|"gel"|"inhaler"|"powder"|"sachet"|"other" | null, "confidence": number },
      "dose":         { "value": string | null, "confidence": number },  // per intake: "1 tablet", "5 ml"
      "frequencyRaw": { "value": string | null, "confidence": number },  // exactly as written: "1-0-1", "BD", "SOS"
      "timings":      { "value": ("morning"|"afternoon"|"evening"|"night")[] | null, "confidence": number },
      "mealRelation": { "value": "before_food"|"after_food"|"with_food"|"empty_stomach"|"any" | null, "confidence": number },
      "durationDays": { "value": integer | null, "confidence": number },
      "asNeeded":     { "value": boolean | null, "confidence": number },
      "instructions": { "value": string | null, "confidence": number }
    }
  ],
  "notes": string | null                   // advice such as "review after 1 week", tests advised
}
"confidence" is between 0 and 1: how sure you are that you read this field correctly.`;

export const PRESCRIPTION_EXTRACTION_SYSTEM = `You read Indian medical prescriptions (handwritten or printed) for a patient-safety app.

Rules:
- Transcribe only what is written. Never invent a medicine, strength, dose or duration.
- If a field is missing, unreadable or you are unsure, set "value" to null or give a low confidence (below 0.6). A wrong dose is far worse than a blank one.
- Keep brand names as written (e.g. "Dolo 650", "Pan-D"). Add genericName only if it is written or the brand is unambiguous.
- Indian shorthand: "1-0-1" = morning and night; "1-1-1" = morning, afternoon, night; "0-0-1" = night; 4 numbers add evening.
  OD = once daily, BD/BID = twice, TDS/TID = three times, QID = four times, HS = at bedtime, SOS/PRN = only when needed, STAT = once now.
  AC = before food, PC = after food. "x 5d", "5/7" = 5 days; "1/52" = 1 week; "1/12" = 1 month.
  Tab. = tablet, Cap. = capsule, Syp. = syrup, Inj. = injection, Oint. = ointment, Gtt. = drops.
- Copy the frequency exactly as written into frequencyRaw, and also fill timings.
- Ignore stamps, logos and pre-printed clinic advertising.
- If the image is not a prescription, return isPrescription=false and an empty medicines list.`;

/** Second step: plain-language card text in the patient's language, from the confirmed medicine JSON. */
export function medicineExplanationSystem(languageName: string): string {
  return `You explain a patient's medicines in very simple ${languageName}, for someone with little medical knowledge.

Rules:
- Use only the medicine data given. Do not change or add any dose, timing or duration.
- "howToTake": one short sentence with dose, times of day, food timing and duration.
- "commonlyUsedFor": what the medicine is commonly used for, hedged ("commonly used for ..."). Use null if you are not sure or the medicine is not well known.
- "cautions": at most 2 short, widely accepted cautions (e.g. "may cause drowsiness"). An empty list is fine.
- Never tell the patient to stop, start or change a medicine. Do not diagnose.
- Write in ${languageName} script. Keep the medicine name in its original spelling.
Reply with JSON only: { "medicines": [ { "index": number, "title": string, "commonlyUsedFor": string | null, "howToTake": string, "cautions": string[] } ] }`;
}
