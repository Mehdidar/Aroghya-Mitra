/**
 * Pulls what other phones wrote (through the server) into the local records
 * store, so the three apps are connected:
 *
 *   patient phone  GET /records/bundle/:id   → the doctor's new prescription appears in Reminders
 *   doctor phone   GET /records/inbox        → ASHA referrals and alerts from the field
 *                  GET /records/bundle/:id   → the full record when a patient is opened
 *
 * Writes go the other way through outbox.ts. Merges never delete local rows
 * and never move a referral back (pending → seen → accepted → closed). Rows
 * are matched with `sameRecord`, because the database stores non-UUID ids
 * under a stable UUID.
 *
 * Every pull is best-effort: offline, the app keeps showing its local copy.
 */
import { useEffect, useRef } from 'react';

import { sameRecord, type Patient, type Prescription, type RecordReferral, type RecordRiskAlert } from '@am/shared';

import { remindersFor } from '@/features/doctor/prescriptions';
import { apiJson } from '@/features/shared/services/api';

import { flushOutbox, markOffline, markSynced, syncEnabled } from './outbox';
import { useRecords, type RecordsState } from './recordsStore';

type Bundle = Pick<RecordsState, 'vitals' | 'prescriptions' | 'doseLogs' | 'reports' | 'consultations' | 'referrals' | 'riskAlerts'> & { patient: Patient };
export type Inbox = { referrals: RecordReferral[]; riskAlerts: RecordRiskAlert[]; patients: Patient[] };
type Data = Pick<RecordsState, 'patients' | 'vitals' | 'prescriptions' | 'reports' | 'consultations' | 'referrals' | 'riskAlerts' | 'reminders'>;

const STATUS = ['pending', 'seen', 'accepted', 'closed'] as const;
const rank = (s: RecordReferral['status']) => STATUS.indexOf(s);

function addMissing<T extends { id: string }>(local: T[], remote: T[] | undefined): { rows: T[]; added: T[] } {
  const added = (remote ?? []).filter((r) => !local.some((l) => sameRecord(l.id, r.id)));
  return { rows: added.length ? [...added, ...local] : local, added };
}

export function mergeReferrals(local: RecordReferral[], remote: RecordReferral[] | undefined): RecordReferral[] {
  let changed = false;
  const rows = local.map((l) => {
    const r = remote?.find((x) => sameRecord(x.id, l.id));
    if (!r || rank(r.status) <= rank(l.status)) return l;
    changed = true;
    return { ...l, status: r.status, seenAt: l.seenAt ?? r.seenAt, acceptedAt: l.acceptedAt ?? r.acceptedAt };
  });
  const { rows: withNew, added } = addMissing(rows, remote);
  return changed || added.length ? withNew : local;
}

/** The local key for a patient the server sent (the local id when it is the same record). */
const patientKey = (patients: Record<string, Patient>, p: Patient) => Object.keys(patients).find((k) => sameRecord(k, p.id)) ?? p.id;

function mergePatients(local: Record<string, Patient>, remote: Patient[]): Record<string, Patient> {
  let out = local;
  for (const p of remote) {
    const key = patientKey(local, p);
    if (!local[key]) out = { ...out, [key]: { ...p, id: key } };
  }
  return out;
}

/** What a server bundle adds to the local store (pure, for tests). */
export function mergeBundle(state: Data, b: Bundle, now = new Date()): Partial<Data> {
  const patch: Partial<Data> = {};
  const patients = mergePatients(state.patients, [b.patient]);
  if (patients !== state.patients) patch.patients = patients;
  const rx = addMissing(state.prescriptions, b.prescriptions);
  if (rx.added.length) {
    patch.prescriptions = rx.rows;
    // A doctor's new prescription becomes reminders on the patient's phone.
    const fresh = rx.added.filter((p: Prescription) => p.source === 'doctor' && !state.reminders.some((r) => r.prescriptionId && sameRecord(r.prescriptionId, p.id)));
    if (fresh.length) patch.reminders = [...fresh.flatMap((p) => remindersFor(p, now)), ...state.reminders];
  }
  for (const k of ['vitals', 'reports', 'consultations', 'riskAlerts'] as const) {
    const m = addMissing(state[k] as { id: string }[], b[k] as { id: string }[]);
    if (m.added.length) (patch as Record<string, unknown>)[k] = m.rows;
  }
  const refs = mergeReferrals(state.referrals, b.referrals);
  if (refs !== state.referrals) patch.referrals = refs;
  return patch;
}

/** What a doctor inbox adds to the local store (pure, for tests). */
export function mergeInbox(state: Data, inbox: Inbox): Partial<Data> {
  const patch: Partial<Data> = {};
  const patients = mergePatients(state.patients, inbox.patients);
  if (patients !== state.patients) patch.patients = patients;
  const refs = mergeReferrals(state.referrals, inbox.referrals);
  if (refs !== state.referrals) patch.referrals = refs;
  const alerts = addMissing(state.riskAlerts, inbox.riskAlerts);
  if (alerts.added.length) patch.riskAlerts = alerts.rows;
  return patch;
}

export type PullOutcome = { ok: boolean; changed: number };
const apply = (patch: Partial<Data>): PullOutcome => {
  markSynced();
  const changed = Object.keys(patch).length;
  if (changed) useRecords.setState(patch);
  return { ok: true, changed };
};

/** Patient phone, or a doctor opening one record: send what is queued, then pull the record. */
export async function pullPatientRecords(patientId: string): Promise<PullOutcome> {
  try {
    await flushOutbox();
    const res = await apiJson<{ ok: boolean; bundle: Bundle }>(`/records/bundle/${encodeURIComponent(patientId)}`, undefined, { timeoutMs: 10_000 });
    return res.ok ? apply(mergeBundle(useRecords.getState(), res.bundle)) : { ok: false, changed: 0 };
  } catch {
    markOffline();
    return { ok: false, changed: 0 };
  }
}

/** Doctor phone: send what is queued, then pull referrals and alerts addressed to this doctor. */
export async function pullDoctorInbox(): Promise<PullOutcome> {
  try {
    await flushOutbox();
    const res = await apiJson<{ ok: boolean } & Inbox>('/records/inbox', undefined, { timeoutMs: 10_000 });
    return res.ok ? apply(mergeInbox(useRecords.getState(), res)) : { ok: false, changed: 0 };
  } catch {
    markOffline();
    return { ok: false, changed: 0 };
  }
}

/**
 * Pull when the screen mounts and every 20 s while it stays mounted (tab
 * screens stay mounted, so this also catches a doctor's change made while the
 * patient sits on the Reminders tab). Does nothing until the app shell has
 * started sync (startOutbox), so unit tests never touch the network.
 */
export function usePullWhileOpen(pull: (() => Promise<PullOutcome>) | null, key: string) {
  const ref = useRef(pull);
  useEffect(() => {
    ref.current = pull;
  });
  useEffect(() => {
    if (!syncEnabled() || !ref.current) return;
    void ref.current();
    const t = setInterval(() => void ref.current?.(), 20_000);
    return () => clearInterval(t);
  }, [key]);
}
