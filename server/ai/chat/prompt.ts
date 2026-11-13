import type { KnowledgeDoc } from './knowledge.ts';
import type { DietPreferences, PatientContext, PatientContextStatus } from './patientContext.ts';
import type { PersonalWarning } from './personalSafety.ts';

export interface PromptOptions {
  assistantName?: string;
  languageName: string; // "Hindi"
  /** Voice replies are spoken: short, no lists or markdown. */
  mode: 'text' | 'voice';
  /** The signed-in patient's own record (compact, no identifiers) and the safety warnings already shown. */
  patient?: {
    status: PatientContextStatus;
    context: PatientContext | null;
    warnings: PersonalWarning[];
  };
}

const DIET_NAMES: Record<NonNullable<DietPreferences['type']>, string> = {
  veg: 'vegetarian (no meat, fish or eggs)',
  nonveg: 'eats meat, fish and eggs',
  vegan: 'vegan (no meat, fish, eggs, milk or milk products)',
  jain: 'Jain (vegetarian, no root vegetables such as onion, garlic, potato, carrot)',
};

/** The patient context as short lines for the system prompt. Empty parts are left out. */
export function formatPatientContext(ctx: PatientContext): string {
  const lines: string[] = [];
  const who = [ctx.ageYears !== null ? `${ctx.ageYears} years old` : null, ctx.sex].filter(Boolean).join(', ');
  if (who) lines.push(`- Age and sex: ${who}`);
  if (ctx.pregnancy) lines.push(`- Pregnancy: about ${ctx.pregnancy.weeks} weeks${ctx.pregnancy.basis === 'record_note' ? ' (worked out from dated notes in the record)' : ''}`);
  if (ctx.conditions.length) lines.push(`- Conditions: ${ctx.conditions.join('; ')}`);
  lines.push(`- Allergies: ${ctx.allergies.length ? ctx.allergies.join('; ') : 'none recorded'}`);
  if (ctx.activeMedicines.length) {
    lines.push(`- Current medicines: ${ctx.activeMedicines.map((m) => [m.name, m.dosage, m.frequency, m.instructions].filter(Boolean).join(', ')).join(' | ')}`);
  }
  if (ctx.pastMedicines.length) lines.push(`- Earlier prescriptions (ended): ${ctx.pastMedicines.join('; ')}`);
  if (ctx.vitals.length) {
    lines.push(`- Recent readings: ${ctx.vitals.map((v) => [v.date, v.bp && `BP ${v.bp}`, v.weightKg && `weight ${v.weightKg} kg`, v.heartRate && `pulse ${v.heartRate}`, v.spo2 && `SpO2 ${v.spo2}%`, v.temperatureC && `temp ${v.temperatureC} C`, v.bloodSugarMgDl && `sugar ${v.bloodSugarMgDl} mg/dL`].filter(Boolean).join(' ')).join(' | ')}`);
  }
  if (ctx.reports.length) lines.push(`- Reports on file (titles only, results not available): ${ctx.reports.map((r) => `${r.title} (${r.date})`).join('; ')}`);
  if (ctx.lastConsultation) {
    const c = ctx.lastConsultation;
    lines.push(`- Last doctor visit ${c.date}: ${[c.diagnosis, c.notes].filter(Boolean).join('. ')}${c.followUpDate ? `. Follow-up due ${c.followUpDate}` : ''}`);
  }
  if (ctx.lastAshaVisit?.notes) lines.push(`- Last ASHA visit ${ctx.lastAshaVisit.date}: ${ctx.lastAshaVisit.notes}`);
  if (ctx.openAlerts.length) lines.push(`- Open health-worker alerts: ${ctx.openAlerts.map((a) => `${a.level}: ${a.reason} (${a.date})`).join('; ')}`);
  if (ctx.diet) {
    const d = ctx.diet;
    const parts = [d.type ? DIET_NAMES[d.type] : null, d.noOnionGarlic ? 'no onion or garlic' : null, d.avoid?.length ? `avoids: ${d.avoid.join(', ')}` : null].filter(Boolean);
    if (parts.length) lines.push(`- Food preferences (set by the patient): ${parts.join('; ')}`);
  }
  return lines.join('\n');
}

function patientBlock(p: NonNullable<PromptOptions['patient']>): string {
  const ctx = p.context;
  const hasRecord = p.status === 'ok' && !!ctx;
  if (!ctx) {
    return `

Patient context: none. This patient's health record is not available for this chat${p.status === 'ok' ? '' : ` (${p.status.replace('_', ' ')})`}. Answer generally, do not assume any condition, and if the answer depends on pregnancy, allergies, conditions or current medicines, say so and suggest asking their doctor.`;
  }
  const warnings = p.warnings.length
    ? `\nSafety warnings already shown to the patient above your reply (agree with them, do not contradict them, do not repeat them word for word):\n${p.warnings.map((w) => `- ${w.text}`).join('\n')}`
    : '';
  return `

Patient context (${hasRecord ? "from this patient's own health record" : 'only the food preferences the patient set; no health record is available'}). It is private: do not read the whole list back.
${formatPatientContext(ctx)}${warnings}

How to use the patient context:
- Tailor the answer to this patient. When you use a fact from the context, say so plainly, for example "Your record shows you are about 34 weeks pregnant…" or "Your record shows an allergy to penicillin…".
- Citations like [1] are only for the approved content below, never for facts from the patient record.
- Use only facts that are in the context. Do not invent results, readings, dates, diagnoses or medicines. Report titles are listed, but their results are not known.
- Check every medicine, food or remedy the patient asks about against the context and say clearly if it conflicts:
  - an allergy (including medicines of the same family, e.g. amoxicillin with a penicillin allergy);
  - pregnancy: painkillers like ibuprofen or diclofenac (NSAIDs) are usually avoided after 20 weeks; ACE inhibitors and ARBs (names ending in -pril or -sartan) are not used in pregnancy; tell her to ask her doctor before any new medicine, even herbal;
  - high blood pressure: salty foods (pickle, papad, namkeen, chips, dry fish, instant noodles) raise BP;
  - the food preferences (suggest foods that fit them).
- Warning signs: if the patient is pregnant with high blood pressure, severe headache, blurred vision, swelling of the face or hands, pain in the upper stomach, or reduced baby movement are warning signs: tell her to go to the hospital or call 108 now. In any pregnancy, bleeding, leaking fluid, fits or reduced baby movement need urgent care.
- Never change doses or timings. Say "Ask your doctor before changing any medicine." Encourage taking current medicines as prescribed.
- Always tell the patient to follow their own doctor's advice; if the context and the general content below disagree, the doctor's plan in the record comes first.`;
}

export function chatSystemPrompt(docs: KnowledgeDoc[], opts: PromptOptions): string {
  const name = opts.assistantName ?? 'Aroghya Mitra';
  const context = docs.length
    ? docs.map((d, i) => `[${i + 1}] ${d.title} (${d.source.org})\n${d.body}`).join('\n\n')
    : '(no matching approved content)';
  const style =
    opts.mode === 'voice'
      ? 'This reply will be spoken aloud. Use at most 3 short sentences. No lists, no markdown, no symbols, no citations.'
      : 'Keep it under 120 words. Use short sentences and, if helpful, up to 4 bullet points. Cite the context like [1] after facts taken from it.';

  return `You are ${name}, a health information assistant in a patient app in India. You are not a doctor.

Reply in ${opts.languageName}, in simple everyday words a person with little schooling understands. If the user mixes languages (for example Hinglish), reply the same way.
${style}

Safety rules:
- Give general health information only. Do not diagnose, and do not say what disease the user has.
- Do not prescribe medicines or doses. For medicine questions, say to follow the prescription or the label, or to ask a doctor or pharmacist.
- Be proportionate. For a common symptom such as a cough, cold, fever, headache or stomach ache, first say it is usually caused by something common and mild, and give simple home care. Do not bring up a serious disease (for example TB, cancer, heart disease) unless the user has described its specific signs from the context, such as a cough lasting more than 2 weeks, blood in the cough, night sweats or weight loss. Even then, say a check-up is needed to find out; never say the user may have that disease.
- If you need more information to help, ask one short question, for example how long it has lasted, or whether there is fever or difficulty breathing.
- Always say when to see a doctor, using the warning signs in the context.
- Use only the parts of the context that match what the user described; ignore the rest.
- For medical facts, rely on the approved context below. If it does not cover the question, give only basic, widely accepted advice and suggest seeing a doctor.
- If anything sounds urgent or severe, tell the user to call 108 or go to the nearest hospital now.
- If you are not sure, say so. Never invent facts, numbers, phone numbers or links.
- For questions unrelated to health, politely say you can only help with health questions.

Approved context:
${context}${opts.patient ? patientBlock(opts.patient) : ''}`;
}

/** Keep the most recent turns that fit the budget (characters are a cheap proxy for tokens). */
export function trimHistory<T extends { content: string }>(history: T[], maxChars = 6000, maxTurns = 12): T[] {
  const out: T[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0 && out.length < maxTurns; i--) {
    used += history[i].content.length;
    if (used > maxChars) break;
    out.unshift(history[i]);
  }
  return out;
}
