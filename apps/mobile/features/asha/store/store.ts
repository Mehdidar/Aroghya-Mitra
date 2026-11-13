import { latestVisitByPatient } from '../logic/clinical';
import { evaluateVisit, maxRisk, urgencyFor } from '../logic/rules';
import type { ID, ISODate, Lang, Patient, Referral, ReferralUrgency, RiskAlert, Visit } from '../types';

/**
 * Offline-first store for one ASHA's caseload. Pure TypeScript: persistence goes
 * through the injected KV (AsyncStorage on device, a Map in tests).
 *
 * Every local change is queued in `outbox`; sync pushes the outbox and merges what
 * the server returns using last-write-wins on `updatedAt`.
 */

export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

export type OutboxKind = 'patient' | 'visit' | 'alert' | 'referral';
export interface OutboxItem {
  kind: OutboxKind;
  id: ID;
}

/** Patients carry a local edit clock so pulled copies don't overwrite newer local edits. */
export type StoredPatient = Patient & { updatedAt: ISODate };

export interface AshaDB {
  version: 1;
  patients: Record<ID, StoredPatient>;
  visits: Record<ID, Visit>;
  alerts: Record<ID, RiskAlert>;
  referrals: Record<ID, Referral>;
  outbox: OutboxItem[];
  lastSyncAt?: ISODate;
}

export const DB_KEY = 'asha.db.v1';

export const emptyDB = (): AshaDB => ({ version: 1, patients: {}, visits: {}, alerts: {}, referrals: {}, outbox: [] });

let idCounter = 0;
export function newId(prefix: string): ID {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const nowISO = () => new Date().toISOString();
const later = (a?: ISODate, b?: ISODate) => (a ?? '') >= (b ?? '');

type Listener = (db: AshaDB) => void;

export class AshaStore {
  private db: AshaDB = emptyDB();
  private listeners = new Set<Listener>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private kv: KV, private clock: () => ISODate = nowISO) {}

  async load(): Promise<AshaDB> {
    try {
      const raw = await this.kv.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AshaDB;
        this.db = { ...emptyDB(), ...parsed };
      }
    } catch {
      // Corrupt blob: start clean rather than crash in the field. Old blob is kept under a backup key.
      const raw = await this.kv.getItem(DB_KEY).catch(() => null);
      if (raw) await this.kv.setItem(`${DB_KEY}.corrupt.${Date.now()}`, raw).catch(() => undefined);
      this.db = emptyDB();
    }
    this.emit();
    return this.db;
  }

  get snapshot(): AshaDB {
    return this.db;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Serialises writes so two quick saves can't interleave and lose data. */
  private commit(next: AshaDB): Promise<void> {
    this.db = next;
    this.emit();
    const json = JSON.stringify(next);
    this.writeChain = this.writeChain.then(() => this.kv.setItem(DB_KEY, json)).catch(() => undefined);
    return this.writeChain;
  }

  private emit() {
    for (const l of this.listeners) l(this.db);
  }

  private enqueue(outbox: OutboxItem[], items: OutboxItem[]): OutboxItem[] {
    const key = (i: OutboxItem) => `${i.kind}:${i.id}`;
    const seen = new Set(outbox.map(key));
    return [...outbox, ...items.filter((i) => !seen.has(key(i)))];
  }

  // ---------------- queries ----------------

  patient(id: ID): StoredPatient | undefined {
    return this.db.patients[id];
  }

  visitsFor(patientId: ID): Visit[] {
    return Object.values(this.db.visits)
      .filter((v) => v.patientId === patientId)
      .sort((a, b) => (a.visitedAt < b.visitedAt ? 1 : -1));
  }

  /** Alerts from each patient's most recent assessed visit: the "current" risk picture. */
  currentAlerts(patientId?: ID): RiskAlert[] {
    const latest = latestAssessedVisits(Object.values(this.db.visits));
    return Object.values(this.db.alerts).filter(
      (a) => (!patientId || a.patientId === patientId) && a.visitId != null && latest.get(a.patientId)?.id === a.visitId,
    );
  }

  referralsFor(patientId: ID): Referral[] {
    return Object.values(this.db.referrals)
      .filter((r) => r.patientId === patientId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // ---------------- mutations ----------------

  async savePatient(p: Patient): Promise<StoredPatient> {
    const stored: StoredPatient = { ...p, updatedAt: this.clock() };
    await this.commit({
      ...this.db,
      patients: { ...this.db.patients, [p.id]: stored },
      outbox: this.enqueue(this.db.outbox, [{ kind: 'patient', id: p.id }]),
    });
    return stored;
  }

  /**
   * Saves (or re-saves) a visit, re-runs the risk rules, replaces the visit's old alerts,
   * and recomputes the patient's cached risk level from their latest visit.
   */
  async recordVisit(input: Visit, lang: Lang = 'en'): Promise<{ visit: Visit; alerts: RiskAlert[] }> {
    const patient = this.db.patients[input.patientId];
    if (!patient) throw new Error(`Unknown patient ${input.patientId}`);

    const visit: Visit = { ...input, updatedAt: this.clock(), syncState: 'pending' };
    const fresh = evaluateVisit(patient, visit, lang);

    const alerts: Record<ID, RiskAlert> = {};
    for (const a of Object.values(this.db.alerts)) if (a.visitId !== visit.id) alerts[a.id] = a;
    for (const a of fresh) {
      const prev = this.db.alerts[a.id];
      alerts[a.id] = prev?.acknowledged ? { ...a, acknowledged: true } : a;
    }
    const visits = { ...this.db.visits, [visit.id]: visit };

    const riskLevel = riskForPatient(patient.id, visits, alerts);
    await this.commit({
      ...this.db,
      visits,
      alerts,
      patients: { ...this.db.patients, [patient.id]: { ...patient, riskLevel } },
      outbox: this.enqueue(this.db.outbox, [
        { kind: 'visit', id: visit.id },
        ...fresh.map((a) => ({ kind: 'alert' as const, id: a.id })),
      ]),
    });
    return { visit, alerts: fresh.map((a) => alerts[a.id]) };
  }

  async acknowledgeAlert(alertId: ID): Promise<void> {
    const a = this.db.alerts[alertId];
    if (!a || a.acknowledged) return;
    await this.commit({
      ...this.db,
      alerts: { ...this.db.alerts, [alertId]: { ...a, acknowledged: true } },
      outbox: this.enqueue(this.db.outbox, [{ kind: 'alert', id: alertId }]),
    });
  }

  async createReferral(args: {
    patientId: ID;
    fromAshaId: ID;
    alertIds: ID[];
    reason?: string;
    urgency?: ReferralUrgency;
    notes?: string;
    visitId?: ID;
  }): Promise<Referral> {
    const alerts = args.alertIds.map((id) => this.db.alerts[id]).filter(Boolean);
    const now = this.clock();
    const referral: Referral = {
      id: newId('ref'),
      patientId: args.patientId,
      fromAshaId: args.fromAshaId,
      reason: args.reason ?? alerts.map((a) => a.reason).join(' • '),
      alertIds: args.alertIds,
      urgency: args.urgency ?? urgencyFor(alerts),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      notes: args.notes,
    };

    let visits = this.db.visits;
    const outbox: OutboxItem[] = [{ kind: 'referral', id: referral.id }];
    if (args.visitId && visits[args.visitId]) {
      visits = { ...visits, [args.visitId]: { ...visits[args.visitId], status: 'referred', updatedAt: now, syncState: 'pending' } };
      outbox.push({ kind: 'visit', id: args.visitId });
    }
    await this.commit({
      ...this.db,
      visits,
      referrals: { ...this.db.referrals, [referral.id]: referral },
      outbox: this.enqueue(this.db.outbox, outbox),
    });
    return referral;
  }

  // ---------------- sync support ----------------

  record(kind: OutboxKind, id: ID): object | undefined {
    const table = { patient: this.db.patients, visit: this.db.visits, alert: this.db.alerts, referral: this.db.referrals }[kind];
    return table[id];
  }

  /**
   * Records that were pushed successfully. `pushed` carries each record's fingerprint at
   * push time; anything edited while the request was in flight no longer matches and
   * stays queued for the next sync.
   */
  async markSynced(pushed: (OutboxItem & { fingerprint: string })[], syncedAt: ISODate, visitPhotoUrls: Record<ID, string[]> = {}): Promise<void> {
    const done = new Set<string>();
    for (const p of pushed) {
      const current = this.record(p.kind, p.id);
      if (current && fingerprint(current) === p.fingerprint) done.add(`${p.kind}:${p.id}`);
    }
    const visits = { ...this.db.visits };
    for (const p of pushed) {
      if (p.kind !== 'visit' || !visits[p.id]) continue;
      const synced = done.has(`visit:${p.id}`);
      visits[p.id] = {
        ...visits[p.id],
        photos: replacePhotos(visits[p.id].photos, visitPhotoUrls[p.id]),
        syncState: synced ? 'synced' : 'pending',
      };
    }
    await this.commit({
      ...this.db,
      visits,
      outbox: this.db.outbox.filter((o) => !done.has(`${o.kind}:${o.id}`)),
      lastSyncAt: syncedAt,
    });
  }

  async markFailed(items: OutboxItem[]): Promise<void> {
    const visits = { ...this.db.visits };
    for (const i of items) if (i.kind === 'visit' && visits[i.id]) visits[i.id] = { ...visits[i.id], syncState: 'failed' };
    await this.commit({ ...this.db, visits });
  }

  /** Merges server data. Local records with unsynced edits, or a newer clock, win. */
  async mergeRemote(remote: { patients?: StoredPatient[]; visits?: Visit[]; referrals?: Referral[] }): Promise<void> {
    const pending = new Set(this.db.outbox.map((o) => `${o.kind}:${o.id}`));
    const patients = { ...this.db.patients };
    for (const p of remote.patients ?? []) {
      const local = patients[p.id];
      if (pending.has(`patient:${p.id}`) || (local && later(local.updatedAt, p.updatedAt))) continue;
      patients[p.id] = { ...p, riskLevel: local?.riskLevel ?? p.riskLevel };
    }
    const visits = { ...this.db.visits };
    for (const v of remote.visits ?? []) {
      const local = visits[v.id];
      if (pending.has(`visit:${v.id}`) || (local && later(local.updatedAt, v.updatedAt))) continue;
      visits[v.id] = { ...v, syncState: 'synced' };
    }
    const referrals = { ...this.db.referrals };
    for (const r of remote.referrals ?? []) {
      const local = referrals[r.id];
      if (pending.has(`referral:${r.id}`) || (local && later(local.updatedAt, r.updatedAt))) continue;
      referrals[r.id] = r;
    }
    await this.commit({ ...this.db, patients, visits, referrals });
  }

  /** Bulk insert used for demo seeding; does not queue anything for sync. */
  async seed(db: Partial<AshaDB>): Promise<void> {
    await this.commit({ ...emptyDB(), ...db });
  }
}

/** Stable content hash of a record, ignoring local-only fields. */
export function fingerprint(record: object): string {
  const { syncState: _s, ...rest } = record as Record<string, unknown>;
  return JSON.stringify(rest);
}

/** Swap uploaded local URIs for their remote URLs, keeping any photo added since. */
function replacePhotos(current: string[], uploaded?: string[]): string[] {
  if (!uploaded) return current;
  return [...uploaded, ...current.slice(uploaded.length)];
}

function latestAssessedVisits(visits: Visit[]): Map<ID, Visit> {
  return latestVisitByPatient(visits.filter((v) => v.status !== 'not_at_home'));
}

function riskForPatient(patientId: ID, visits: Record<ID, Visit>, alerts: Record<ID, RiskAlert>) {
  const latest = latestAssessedVisits(Object.values(visits).filter((v) => v.patientId === patientId)).get(patientId);
  if (!latest) return 'none' as const;
  return maxRisk(Object.values(alerts).filter((a) => a.visitId === latest.id).map((a) => a.severity));
}

export class MemoryKV implements KV {
  map = new Map<string, string>();
  async getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  async setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  async removeItem(k: string) {
    this.map.delete(k);
  }
}
