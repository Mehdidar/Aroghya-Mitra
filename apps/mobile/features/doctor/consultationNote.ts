/**
 * Pure helpers for the consultation editor: turn a dictated note draft
 * (server/copilot/notesSchema.ts) into editable form fields, and the approved
 * fields into the Consultation record. Nothing here saves anything.
 */
import type { ConsultationNoteDraft } from '@server/copilot/notesSchema';

import { emptyMedicine, SLOTS, type MedicineDraft, type Slot } from './prescriptions';

export type NoteFields = {
  chiefComplaint: string;
  history: string;
  examination: string;
  bp: string;
  pulse: string;
  temperature: string;
  spo2: string;
  weight: string;
  assessment: string;
  plan: string;
  notes: string;
  followUpText: string;
};

export const emptyNoteFields = (): NoteFields => ({ chiefComplaint: '', history: '', examination: '', bp: '', pulse: '', temperature: '', spo2: '', weight: '', assessment: '', plan: '', notes: '', followUpText: '' });

/** Dose times guessed from a frequency phrase. Shown to the doctor, who changes them as needed. */
export function slotsFor(frequency: string | null | undefined): Slot[] {
  const f = (frequency ?? '').toLowerCase();
  if (/\b(qid|four times|4 times)\b/.test(f)) return ['morning', 'afternoon', 'evening', 'night'];
  if (/\b(tds|tid|thrice|three times|3 times)\b/.test(f)) return ['morning', 'afternoon', 'night'];
  if (/\b(bd|bid|twice|two times|2 times|12 ?hourly)\b/.test(f)) return ['morning', 'night'];
  if (/\b(hs|night|bedtime)\b/.test(f)) return ['night'];
  if (/\b(evening)\b/.test(f)) return ['evening'];
  return ['morning'];
}

/** "7 days" → 7, "2 weeks" → 14, "1 month" → 30; unknown → ''. */
export function durationDays(text: string | null | undefined): string {
  const m = /(\d+)\s*(day|days|d|week|weeks|wk|wks|month|months)\b/i.exec(text ?? '');
  if (!m) return /^\d+$/.test((text ?? '').trim()) ? (text ?? '').trim() : '';
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  return String(u.startsWith('w') ? n * 7 : u.startsWith('m') ? n * 30 : n);
}

/** "after one week", "in 10 days", "2026-11-21" → YYYY-MM-DD, else null (the doctor types it). */
export function followUpDate(text: string | null | undefined, today = new Date()): string | null {
  const s = (text ?? '').toLowerCase();
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(s);
  if (iso) return iso[1];
  const words: Record<string, number> = { one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fourteen: 14 };
  const m = /\b(\d+|one|a|two|three|four|five|six|seven|ten|fourteen)\s*(day|days|week|weeks|month|months)\b/.exec(s);
  if (!m) return null;
  const n = /\d/.test(m[1]) ? Number(m[1]) : words[m[1]];
  const days = m[2].startsWith('week') ? n * 7 : m[2].startsWith('month') ? n * 30 : n;
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fieldsFromDraft(d: ConsultationNoteDraft): NoteFields {
  const v = d.vitals;
  return {
    chiefComplaint: d.chiefComplaint ?? '',
    history: d.history ?? '',
    examination: d.examination ?? '',
    bp: v.systolic != null && v.diastolic != null ? `${v.systolic}/${v.diastolic}` : '',
    pulse: v.heartRate != null ? String(v.heartRate) : '',
    temperature: v.temperatureC != null ? String(v.temperatureC) : '',
    spo2: v.spo2 != null ? String(v.spo2) : '',
    weight: v.weightKg != null ? String(v.weightKg) : '',
    assessment: d.assessment ?? '',
    plan: d.plan ?? '',
    notes: '',
    followUpText: d.followUp ?? '',
  };
}

export function medicinesFromDraft(d: ConsultationNoteDraft): MedicineDraft[] {
  return d.medicines.map((m) => ({
    ...emptyMedicine(),
    name: m.name,
    dosage: m.dose ?? '',
    frequency: m.frequency ?? '',
    timesOfDay: slotsFor(m.frequency),
    durationDays: durationDays(m.duration),
    instructions: m.instructions ?? '',
  }));
}

/** The approved fields as the consultation's note text (SOAP order). */
export function composeNotes(f: NoteFields, labels: Record<'chiefComplaint' | 'history' | 'examination' | 'vitals' | 'plan' | 'followUp', string> = { chiefComplaint: 'Complaint', history: 'History', examination: 'Examination', vitals: 'Vitals', plan: 'Plan', followUp: 'Follow-up' }): string | null {
  const vitals = [f.bp && `BP ${f.bp} mmHg`, f.pulse && `pulse ${f.pulse}/min`, f.temperature && `temp ${f.temperature} °C`, f.spo2 && `SpO2 ${f.spo2}%`, f.weight && `weight ${f.weight} kg`].filter(Boolean).join(', ');
  const parts = [
    f.chiefComplaint && `${labels.chiefComplaint}: ${f.chiefComplaint.trim()}`,
    f.history && `${labels.history}: ${f.history.trim()}`,
    f.examination && `${labels.examination}: ${f.examination.trim()}`,
    vitals && `${labels.vitals}: ${vitals}`,
    f.plan && `${labels.plan}: ${f.plan.trim()}`,
    f.followUpText && `${labels.followUp}: ${f.followUpText.trim()}`,
    f.notes.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}

export const isSlot = (s: string): s is Slot => (SLOTS as readonly string[]).includes(s);
