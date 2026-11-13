/**
 * ASHA sync: the app's outbox in, what changed on the server out.
 *
 * Contract (apps/mobile/features/asha/services/sync.ts):
 *   POST /asha/sync    SyncRequest  -> SyncResponse
 *   POST /asha/photos  multipart "file" -> { url }
 *
 * Upsert by id with last-write-wins on `updatedAt` (alerts: `createdAt`);
 * return, for this ASHA, every record received after `since`.
 *
 * Risk is RE-VERIFIED here: for every pushed visit the server runs the same
 * rule engine (server/risk) over the patient and the visit and stores ITS
 * alerts with verifiedBy 'server', replacing whatever severity the phone
 * computed. A tampered or stale phone cannot lower a critical alert.
 *
 * Storage is a JSON file per collection under server/.data/asha (atomic
 * writes). Single-server, no schema to migrate; swap `FileStore` for a
 * database when more than one server needs the data.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { evaluateVisit, type Patient, type Referral, type RiskAlert, type Visit } from '../risk/index.ts';
import type { Caller } from '../http/auth.ts';

export type Collection = 'patients' | 'visits' | 'alerts' | 'referrals';
export const COLLECTIONS: Collection[] = ['patients', 'visits', 'alerts', 'referrals'];

export type StoredPatient = Patient & { updatedAt: string };
export type VerifiedAlert = RiskAlert & { verifiedBy: 'phone' | 'server' };

export interface SyncRequest {
  ashaId: string;
  since?: string;
  patients?: StoredPatient[];
  visits?: Omit<Visit, 'syncState'>[];
  alerts?: RiskAlert[];
  referrals?: Referral[];
}

export interface SyncResponse {
  serverTime: string;
  patients: StoredPatient[];
  visits: Visit[];
  referrals: Referral[];
  /** Alerts the server computed for the pushed visits (verifiedBy 'server'). */
  verifiedAlerts: VerifiedAlert[];
  accepted: Record<Collection, number>;
}

export class SyncError extends Error {
  readonly status: 400 | 403;
  constructor(status: 400 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

type Row<T> = { record: T; receivedAt: string };
type Table<T> = Record<string, Row<T>>;

const OWNER: Record<Collection, string> = { patients: 'assignedAshaId', visits: 'ashaId', alerts: 'ashaId', referrals: 'fromAshaId' };
const CLOCK: Record<Collection, string> = { patients: 'updatedAt', visits: 'updatedAt', referrals: 'updatedAt', alerts: 'createdAt' };

const later = (a?: string, b?: string) => (a ?? '') > (b ?? '');
export const nowIso = () => new Date().toISOString();

export interface SyncStore {
  load<T>(name: Collection): Table<T>;
  save<T>(name: Collection, table: Table<T>): void;
}

/** JSON file per collection, written atomically. */
export class FileStore implements SyncStore {
  readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  private path(name: Collection) {
    return join(this.root, `${name}.json`);
  }
  load<T>(name: Collection): Table<T> {
    const p = this.path(name);
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, 'utf8')) as Table<T>;
  }
  save<T>(name: Collection, table: Table<T>): void {
    mkdirSync(this.root, { recursive: true });
    const tmp = `${this.path(name)}.tmp`;
    writeFileSync(tmp, JSON.stringify(table));
    renameSync(tmp, this.path(name));
  }
}

/** In-memory store for tests. */
export class MemoryStore implements SyncStore {
  private tables = new Map<Collection, Table<unknown>>();
  load<T>(name: Collection): Table<T> {
    return { ...(this.tables.get(name) as Table<T> | undefined) };
  }
  save<T>(name: Collection, table: Table<T>): void {
    this.tables.set(name, table as Table<unknown>);
  }
}

function upsert<T extends { id?: string }>(store: SyncStore, name: Collection, records: T[] | undefined, receivedAt: string): number {
  const table = store.load<T>(name);
  const clock = CLOCK[name] as keyof T;
  let applied = 0;
  for (const rec of records ?? []) {
    if (!rec || typeof rec !== 'object' || typeof rec.id !== 'string' || !rec.id) continue;
    const cur = table[rec.id];
    if (cur && later(cur.record[clock] as string | undefined, rec[clock] as string | undefined)) continue;
    table[rec.id] = { record: rec, receivedAt };
    applied++;
  }
  if (applied) store.save(name, table);
  return applied;
}

function changedSince<T extends object>(store: SyncStore, name: Collection, ashaId: string, since?: string): T[] {
  const owner = OWNER[name];
  return Object.values(store.load<T>(name))
    .filter((row) => (row.record as Record<string, unknown>)[owner] === ashaId && (!since || later(row.receivedAt, since)))
    .map((row) => row.record);
}

/** Replace the phone's alerts for each pushed visit with the server's own evaluation. */
function reverify(store: SyncStore, req: SyncRequest, receivedAt: string): VerifiedAlert[] {
  const patients = store.load<StoredPatient>('patients');
  const alerts = store.load<VerifiedAlert>('alerts');
  const out: VerifiedAlert[] = [];
  let changed = false;
  for (const visit of req.visits ?? []) {
    if (!visit?.id) continue;
    const patient = req.patients?.find((p) => p.id === visit.patientId) ?? patients[visit.patientId]?.record;
    if (!patient) continue;
    const verified = evaluateVisit(patient, visit as Visit, 'en').map((a) => ({ ...a, verifiedBy: 'server' as const }));
    for (const id of Object.keys(alerts)) if (alerts[id].record.visitId === visit.id) delete alerts[id];
    for (const a of verified) alerts[a.id] = { record: a, receivedAt };
    out.push(...verified);
    changed = true;
  }
  if (changed) store.save('alerts', alerts);
  return out;
}

export function sync(payload: unknown, caller: Caller, store: SyncStore): SyncResponse {
  const req = (payload ?? {}) as SyncRequest;
  if (!req.ashaId || typeof req.ashaId !== 'string') throw new SyncError(400, 'ashaId is required');
  if (caller.role !== 'admin' && (caller.role !== 'asha' || caller.id !== req.ashaId)) {
    throw new SyncError(403, 'only the ASHA worker who owns this caseload (or an admin) may sync it');
  }
  const receivedAt = nowIso();
  const accepted = {
    patients: upsert(store, 'patients', req.patients, receivedAt),
    visits: upsert(store, 'visits', req.visits, receivedAt),
    // Phone alerts are stored (verifiedBy 'phone') and then overridden per visit below.
    alerts: upsert(store, 'alerts', (req.alerts ?? []).map((a) => ({ ...a, verifiedBy: 'phone' as const })), receivedAt),
    referrals: upsert(store, 'referrals', req.referrals, receivedAt),
  };
  const verifiedAlerts = reverify(store, req, receivedAt);
  return {
    serverTime: receivedAt,
    patients: changedSince<StoredPatient>(store, 'patients', req.ashaId, req.since),
    visits: changedSince<Visit>(store, 'visits', req.ashaId, req.since),
    referrals: changedSince<Referral>(store, 'referrals', req.ashaId, req.since),
    verifiedAlerts,
    accepted,
  };
}

const SAFE = /[^A-Za-z0-9._-]+/g;

/** A unique, safe filename for an uploaded visit photo. */
export function photoName(original: string | null | undefined): string {
  const base = (original ?? 'photo.jpg').replace(SAFE, '_');
  let ext = (base.match(/\.[A-Za-z0-9]+$/)?.[0] ?? '.jpg').toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) ext = '.jpg';
  return `${crypto.randomUUID().replace(/-/g, '')}${ext}`;
}

export const isSafePhotoName = (name: string) => /^[a-f0-9]{32}\.(jpg|jpeg|png|webp)$/.test(name);
