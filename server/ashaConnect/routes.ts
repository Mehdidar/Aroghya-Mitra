/**
 * ASHA connect endpoints (rules in service.ts):
 *
 *   GET  /asha/connect/mine?patientId          patient: my ASHA (or waiting / none)
 *   POST /asha/connect/find   { area }         patient: find my ASHA by village
 *   GET  /asha/assignments                     admin (doctor read-only): the assignment board
 *   POST /asha/assign  { patientId, ashaId|null, reason? }   admin
 *   PUT  /asha/areas   { ashaId, areas[] }     admin: villages an ASHA covers
 *   GET  /asha/messages?patientId&since        patient (own) / ASHA (caseload)
 *   POST /asha/messages { patientId?, kind, body, visitWhen? }   patient or ASHA
 *   POST /asha/messages/read { patientId? }    mark the other side's messages read
 *   POST /asha/messages/:id/status { status, scheduledFor? }     ASHA answers a request
 *   POST /asha/scan    { payload }             ASHA scans a patient's QR card
 *   POST /asha/scan/add { patientId }          ASHA adds the unassigned patient she just scanned
 *
 * Errors: { ok: false, reason } with 400 / 403 / 404 / 409.
 */
import { DEMO_FACILITY, DEMO_IDS, DEMO_USERS } from '../../packages/shared/demo.ts';
import type { Profile } from '../../packages/shared/types.ts';
import { RestClient, restConfigFromEnv } from '../db/rest.ts';
import type { Caller } from '../http/auth.ts';
import { json, type Route } from '../http/router.ts';
import { qrSecret } from '../qr/routes.ts';
import { getDemoRepository } from '../records/demoSeed.ts';
import { MemoryRecordsRepository } from '../records/memoryRepository.ts';
import type { RecordsRepository } from '../records/repository.ts';
import { viewerFor } from '../records/routes.ts';
import { areaKey } from './match.ts';
import { MemoryAshaConnectRepository, type AshaConnectRepository } from './repository.ts';
import { AshaConnectService, type FieldStore } from './service.ts';
import { SupabaseAshaConnectRepository } from './supabaseRepository.ts';
import type { Fail } from './types.ts';

/** Second demo ASHA (same id as the admin screen's demo staff list), covering the other demo village. */
export const DEMO_SECOND_ASHA: Profile = { id: '22222222-2222-4222-8222-000000000011', role: 'asha', fullName: 'Geeta Rani', facilityId: DEMO_FACILITY.id, isActive: true };
/** Demo villages: Sunita covers Rampur and Sonpur, Geeta covers Bhagwanpur (the ASHA demo caseload's villages). */
export const DEMO_AREAS: { ashaId: string; area: string }[] = [
  { ashaId: DEMO_IDS.asha, area: 'Rampur' },
  { ashaId: DEMO_IDS.asha, area: 'Sonpur' },
  { ashaId: DEMO_SECOND_ASHA.id, area: 'Bhagwanpur' },
];

let shared: AshaConnectRepository | null = null;

export function getConnectRepository(): AshaConnectRepository {
  if (!shared) {
    const cfg = restConfigFromEnv();
    if (cfg) shared = new SupabaseAshaConnectRepository(new RestClient(cfg));
    else {
      const records = getDemoRepository();
      const data = records instanceof MemoryRecordsRepository ? records.data : null;
      if (data && !data.profiles.some((p) => p.id === DEMO_SECOND_ASHA.id)) data.profiles.push({ ...DEMO_SECOND_ASHA });
      shared = new MemoryAshaConnectRepository({
        records: () => (data ? { patients: data.patients, profiles: data.profiles } : { patients: [], profiles: [] }),
        phones: { [DEMO_IDS.asha]: DEMO_USERS.asha.phone },
        data: { areas: DEMO_AREAS.map((a) => ({ ...a, facilityId: DEMO_FACILITY.id, key: areaKey(a.area) })) },
      });
    }
  }
  return shared;
}

const send = (r: { ok: true } | Fail) => (r.ok ? json(r) : json({ ok: false, reason: (r as Fail).reason }, (r as Fail).status));
const body = async (req: Request): Promise<Record<string, unknown>> => {
  const b = await req.json().catch(() => null);
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
};
const STATUS = /^\/asha\/messages\/([^/]+)\/status$/;

export function routes(
  opts: { repo?: AshaConnectRepository; records?: RecordsRepository | (() => RecordsRepository); field?: () => Promise<FieldStore | null>; now?: () => Date; newId?: () => string; qr?: () => { secret: string; demo: boolean } } = {},
): Route[] {
  const records = (): RecordsRepository => (typeof opts.records === 'function' ? opts.records() : (opts.records ?? getDemoRepository()));
  const svc = () =>
    new AshaConnectService({
      repo: opts.repo ?? getConnectRepository(),
      records: records(),
      field: opts.field,
      now: opts.now ?? (() => new Date()),
      newId: opts.newId ?? (() => crypto.randomUUID()),
      qr: opts.qr ?? qrSecret,
    });
  const viewer = (caller: Caller) => viewerFor(records(), caller);
  const q = (url: URL, k: string) => url.searchParams.get(k) || null;

  return [
    { method: 'GET', path: '/asha/connect/mine', handler: async (_r, { caller, url }) => send(await svc().mine(await viewer(caller), q(url, 'patientId'))) },
    { method: 'POST', path: '/asha/connect/find', handler: async (req, { caller }) => send(await svc().find(await viewer(caller), await body(req))) },
    { method: 'GET', path: '/asha/assignments', handler: async (_r, { caller }) => send(await svc().board(await viewer(caller))) },
    { method: 'POST', path: '/asha/assign', handler: async (req, { caller }) => send(await svc().adminAssign(await viewer(caller), await body(req))) },
    { method: 'PUT', path: '/asha/areas', handler: async (req, { caller }) => send(await svc().setAreas(await viewer(caller), await body(req))) },
    {
      method: 'GET',
      path: '/asha/messages',
      handler: async (_r, { caller, url }) => send(await svc().listMessages(await viewer(caller), { patientId: q(url, 'patientId'), since: q(url, 'since') })),
    },
    { method: 'POST', path: '/asha/messages', handler: async (req, { caller }) => send(await svc().send(await viewer(caller), await body(req))) },
    { method: 'POST', path: '/asha/messages/read', handler: async (req, { caller }) => send(await svc().markRead(await viewer(caller), await body(req))) },
    {
      method: 'POST',
      path: STATUS,
      handler: async (req, { caller, url }) => send(await svc().setStatus(await viewer(caller), decodeURIComponent(url.pathname.match(STATUS)![1]), await body(req))),
    },
    {
      method: 'POST',
      path: '/asha/scan',
      handler: async (req, { caller }) => {
        const b = await body(req);
        const payload = typeof b.payload === 'string' ? b.payload.trim() : '';
        if (!payload) return json({ ok: false, reason: 'not_aroghya_qr' }, 400);
        return send(await svc().scan(await viewer(caller), payload));
      },
    },
    { method: 'POST', path: '/asha/scan/add', handler: async (req, { caller }) => send(await svc().addScanned(await viewer(caller), await body(req))) },
  ];
}

/** For /asha/sync: which patients this ASHA's phone should drop (moved to another ASHA since `since`). */
export async function releasedFor(ashaId: string, since: string | undefined, records: RecordsRepository, repo: AshaConnectRepository = getConnectRepository()): Promise<string[]> {
  const s = new AshaConnectService({ repo, records, now: () => new Date(), newId: () => crypto.randomUUID(), qr: qrSecret });
  return s.released(ashaId, since);
}
