/**
 * Offline demo replies for the demo patient (Rekha: about 34 weeks pregnant,
 * gestational hypertension on labetalol, penicillin allergy). Shown ONLY when
 * the server cannot be reached and no real patient is signed in, always under
 * the "Demo answer" label. The generic chat.demo.* text comes first, then a
 * personal note from assistant.json demo.*.
 */
import { DEMO_IDS } from '@am/shared';

import { isRealPatient, useSession } from '@/features/shared/state/session';

import type { ContextLabel, ReplyContext } from '@/features/patient/chat/types';

/** The demo record's pregnancy (server/records/demoSeed.ts: 34 weeks at the latest referral). */
export const DEMO_PREGNANCY_WEEKS = 34;

const PERSONAL: Record<string, ContextLabel[]> = {
  fever: ['pregnancy', 'allergies', 'medicines'],
  headache: ['pregnancy', 'conditions', 'alerts'],
  bp: ['conditions', 'medicines', 'vitals'],
  pregnancy: ['pregnancy', 'conditions', 'medicines'],
  medicine: ['allergies', 'pregnancy', 'medicines'],
};

/** True when the signed-in patient is the demo patient (demo sign-in, or the demo record id). */
export function isDemoPatient(): boolean {
  const s = useSession.getState();
  return s.role === 'patient' && !isRealPatient() && (s.patientId ?? DEMO_IDS.patientRecord) === DEMO_IDS.patientRecord;
}

/** The personal part of a demo reply: the i18n key and the record labels it uses, or null. */
export function personalDemo(key: string): { i18nKey: string; context: ReplyContext } | null {
  if (!isDemoPatient()) return null;
  const used = PERSONAL[key];
  if (!used) return null;
  return {
    i18nKey: `assistant:demo.${key}`,
    context: { used, personalised: true, ...(used.includes('pregnancy') ? { pregnancyWeeks: DEMO_PREGNANCY_WEEKS } : {}) },
  };
}
