import { fingerprint, type AshaStore, type OutboxItem, type StoredPatient } from '../store/store';
import type { ID, ISODate, Referral, RiskAlert, Visit } from '../types';

/**
 * Wire contract with the backend (P1 owns the server; this is what the ASHA app needs):
 *
 *   POST {apiUrl}/asha/sync
 *     body:     SyncRequest
 *     response: SyncResponse
 *   POST {apiUrl}/asha/photos   multipart "file" -> { url }
 *
 * The server should upsert by id with last-write-wins on `updatedAt` and return everything
 * for this ASHA changed since `since` (patients, visits, and referrals whose status the
 * doctor changed).
 */
export interface SyncRequest {
  ashaId: ID;
  since?: ISODate;
  patients: StoredPatient[];
  visits: Omit<Visit, 'syncState'>[];
  alerts: RiskAlert[];
  referrals: Referral[];
}

export interface SyncResponse {
  serverTime: ISODate;
  patients?: StoredPatient[];
  visits?: Visit[];
  referrals?: Referral[];
}

export interface SyncTransport {
  push(req: SyncRequest): Promise<SyncResponse>;
  uploadPhoto(localUri: string): Promise<string>;
}

export type SyncResult =
  | { ok: true; pushed: number; pulledReferrals: number }
  | { ok: false; error: string; skipped?: boolean };

const isLocal = (uri: string) => !/^https?:\/\//.test(uri);

let running: Promise<SyncResult> | null = null;

/** One push+pull round. Concurrent calls share the in-flight run. */
export function syncOnce(store: AshaStore, transport: SyncTransport, ashaId: ID): Promise<SyncResult> {
  if (!running) running = doSync(store, transport, ashaId).finally(() => (running = null));
  return running;
}

async function doSync(store: AshaStore, transport: SyncTransport, ashaId: ID): Promise<SyncResult> {
  const db = store.snapshot;
  const items: (OutboxItem & { fingerprint: string })[] = [];
  const req: SyncRequest = { ashaId, since: db.lastSyncAt, patients: [], visits: [], alerts: [], referrals: [] };
  const photoUrls: Record<ID, string[]> = {};

  try {
    for (const item of db.outbox) {
      const rec = store.record(item.kind, item.id);
      if (!rec) continue;
      items.push({ ...item, fingerprint: fingerprint(rec) });
      switch (item.kind) {
        case 'patient':
          req.patients.push(rec as StoredPatient);
          break;
        case 'alert':
          req.alerts.push(rec as RiskAlert);
          break;
        case 'referral':
          req.referrals.push(rec as Referral);
          break;
        case 'visit': {
          const { syncState: _s, ...visit } = rec as Visit;
          const photos: string[] = [];
          for (const uri of visit.photos) photos.push(isLocal(uri) ? await transport.uploadPhoto(uri) : uri);
          photoUrls[visit.id] = photos;
          req.visits.push({ ...visit, photos });
          break;
        }
      }
    }

    const res = await transport.push(req);
    await store.markSynced(items, res.serverTime, photoUrls);
    await store.mergeRemote(res);
    return { ok: true, pushed: items.length, pulledReferrals: res.referrals?.length ?? 0 };
  } catch (e) {
    await store.markFailed(items);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function createHttpTransport(
  baseUrl: string,
  getToken?: () => Promise<string | undefined>,
  /** Extra headers per request (the app passes its demo-auth / session headers here). */
  extraHeaders?: () => Record<string, string>,
): SyncTransport {
  const headers = async (): Promise<Record<string, string>> => {
    const token = await getToken?.();
    return { ...(extraHeaders?.() ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };
  const withTimeout = async (input: string, init: RequestInit, ms = 20_000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(input, { ...init, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${input}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    async push(req) {
      const res = await withTimeout(`${baseUrl}/asha/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await headers()) },
        body: JSON.stringify(req),
      });
      return (await res.json()) as SyncResponse;
    },
    async uploadPhoto(localUri) {
      const form = new FormData();
      const name = localUri.split('/').pop() || 'photo.jpg';
      // React Native's FormData accepts { uri, name, type } file descriptors.
      form.append('file', { uri: localUri, name, type: 'image/jpeg' } as unknown as Blob);
      const res = await withTimeout(`${baseUrl}/asha/photos`, { method: 'POST', headers: await headers(), body: form }, 60_000);
      const body = (await res.json()) as { url: string };
      return body.url;
    },
  };
}

