/**
 * PHC appointment endpoints (rules in service.ts; times in Asia/Kolkata):
 *
 *   GET  /appointments/slots?facilityId&doctorId&from&to   free slots from published hours
 *   POST /appointments                                      book { patientId?, doctorId, startsAt, reason? }
 *   POST /appointments/:id/reschedule                       { startsAt, doctorId? }
 *   POST /appointments/:id/cancel                           { reason? }
 *   POST /appointments/:id/confirm | /complete | /no-show   doctor / admin
 *   GET  /appointments/mine?patientId                       patient (or ASHA / staff for a patient)
 *   GET  /appointments/doctor?date&doctorId                 doctor's day list (admin: facility)
 *   GET  /availability?doctorId&facilityId                  published hours
 *   PUT  /availability                                      doctor (self) / admin (facility doctors)
 *
 * Errors: { ok: false, reason } with 400 / 403 / 404 / 409.
 */
import { json, type Route } from '../http/router.ts';
import type { Caller } from '../http/auth.ts';
import type { Profile } from '../../packages/shared/types.ts';
import { DEMO_PROFILES } from '../../packages/shared/demo.ts';
import { RestClient, restConfigFromEnv } from '../db/rest.ts';
import { getDemoRepository } from '../records/demoSeed.ts';
import { MemoryRecordsRepository } from '../records/memoryRepository.ts';
import type { RecordsRepository } from '../records/repository.ts';
import { viewerFor } from '../records/routes.ts';
import { MemoryAppointmentsRepository, type AppointmentsRepository } from './repository.ts';
import { AppointmentService, type Fail } from './service.ts';
import { SupabaseAppointmentsRepository } from './supabaseRepository.ts';

let shared: AppointmentsRepository | null = null;

/**
 * Supabase when configured; otherwise in memory with NO availability seeded:
 * the demo starts at "no times published" until a doctor or admin publishes hours.
 */
export function getAppointmentsRepository(): AppointmentsRepository {
  if (!shared) {
    const cfg = restConfigFromEnv();
    if (cfg) shared = new SupabaseAppointmentsRepository(new RestClient(cfg));
    else {
      const records = getDemoRepository();
      const profiles = (): Profile[] => (records instanceof MemoryRecordsRepository ? records.data.profiles : DEMO_PROFILES);
      shared = new MemoryAppointmentsRepository({ profiles });
    }
  }
  return shared;
}

const ACTION = /^\/appointments\/([^/]+)\/(reschedule|cancel|confirm|complete|no-show)$/;

const send = (r: { ok: true } | Fail, ok: unknown) => (r.ok ? json(ok) : json({ ok: false, reason: (r as Fail).reason }, (r as Fail).status));
const body = async (req: Request): Promise<Record<string, unknown> | null> => {
  const b = await req.json().catch(() => null);
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
};
const param = (url: URL, k: string) => url.searchParams.get(k) || null;

export function routes(opts: { repo?: AppointmentsRepository; records?: RecordsRepository; now?: () => Date; newId?: () => string } = {}): Route[] {
  const records = () => opts.records ?? getDemoRepository();
  const svc = () => new AppointmentService({ records: records(), repo: opts.repo ?? getAppointmentsRepository(), now: opts.now ?? (() => new Date()), newId: opts.newId });
  const viewer = (caller: Caller) => viewerFor(records(), caller);

  return [
    {
      method: 'GET',
      path: '/appointments/slots',
      handler: async (_req, { caller, url }) => {
        const r = await svc().slots(await viewer(caller), { facilityId: param(url, 'facilityId'), doctorId: param(url, 'doctorId'), from: param(url, 'from'), to: param(url, 'to') });
        return send(r, r);
      },
    },
    {
      method: 'GET',
      path: '/appointments/mine',
      handler: async (_req, { caller, url }) => {
        const r = await svc().mine(await viewer(caller), param(url, 'patientId'));
        return send(r, r);
      },
    },
    {
      method: 'GET',
      path: '/appointments/doctor',
      handler: async (_req, { caller, url }) => {
        const r = await svc().doctorDay(await viewer(caller), { date: param(url, 'date'), doctorId: param(url, 'doctorId') });
        return send(r, r);
      },
    },
    {
      method: 'POST',
      path: '/appointments',
      handler: async (req, { caller }) => {
        const b = await body(req);
        if (!b) return json({ ok: false, reason: 'bad_request' }, 400);
        const r = await svc().book(await viewer(caller), b);
        return r.ok ? json(r, 201) : send(r, r);
      },
    },
    {
      method: 'POST',
      path: ACTION,
      handler: async (req, { caller, url }) => {
        const m = ACTION.exec(url.pathname.replace(/\/+$/, ''));
        const id = decodeURIComponent(m?.[1] ?? '');
        const action = m?.[2];
        const b = (await body(req)) ?? {};
        const v = await viewer(caller);
        const s = svc();
        const r =
          action === 'reschedule'
            ? await s.reschedule(v, id, b)
            : action === 'cancel'
              ? await s.cancel(v, id, b)
              : await s.setStatus(v, id, action === 'confirm' ? 'confirmed' : action === 'complete' ? 'completed' : 'no_show');
        return send(r, r);
      },
    },
    {
      method: 'GET',
      path: '/availability',
      handler: async (_req, { caller, url }) => {
        const r = await svc().getAvailability(await viewer(caller), { doctorId: param(url, 'doctorId'), facilityId: param(url, 'facilityId') });
        return send(r, r);
      },
    },
    {
      method: 'PUT',
      path: '/availability',
      handler: async (req, { caller }) => {
        const b = await body(req);
        if (!b) return json({ ok: false, reason: 'bad_request' }, 400);
        const r = await svc().putAvailability(await viewer(caller), b);
        return send(r, r);
      },
    },
  ];
}
