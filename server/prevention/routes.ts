/**
 * Preventive care routes.
 *
 *   GET  /prevention/guidelines      the guideline versions and review dates the plan uses
 *   GET  /prevention/:patientId      the computed plan + records (+ linked children)
 *   POST /prevention/records         { kind: 'vaccination'|'growth'|'screening'|'pregnancy', patientId, record: {...} }
 *
 * Access: server/prevention/access.ts (records access + the ASHA for her patients).
 * Writes: ASHA and doctor in their own name; a patient may only self-report a
 * past vaccine on their own record (stored with source 'self_reported').
 */
import { GUIDELINES } from '../../packages/patient-ai/prevention/guidelines/index.ts';
import { toDay } from '../../packages/patient-ai/prevention/dates.ts';
import { newUuid } from '../../packages/shared/ids.ts';
import { json, type Route } from '../http/router.ts';
import { getDemoRepository } from '../records/demoSeed.ts';
import type { RecordsRepository } from '../records/repository.ts';
import { viewerFor } from '../records/routes.ts';
import { mayWrite, preventionAccess } from './access.ts';
import type { PreventionRepository } from './repository.ts';
import { RECORD_KINDS, RecordError, personFrom, planFor, validateRecord, type RecordKind } from './service.ts';
import { getPreventionRepository } from './store.ts';

const PLAN = /^\/prevention\/([^/]+)$/;

export function routes(opts: { records?: RecordsRepository; repo?: PreventionRepository; now?: () => Date } = {}): Route[] {
  const records = () => opts.records ?? getDemoRepository();
  const repo = () => opts.repo ?? getPreventionRepository();
  const now = opts.now ?? (() => new Date());

  const vitalsOf = async (patientId: string | null) => {
    if (!patientId) return [];
    try {
      return (await records().loadRecordBundle(patientId))?.vitals ?? [];
    } catch {
      return [];
    }
  };

  return [
    {
      method: 'GET',
      path: '/prevention/guidelines',
      handler: () => json({ ok: true, guidelines: GUIDELINES }),
    },
    {
      method: 'GET',
      path: PLAN,
      handler: async (_req, { caller, url }) => {
        const patientId = decodeURIComponent(PLAN.exec(url.pathname.replace(/\/+$/, ''))?.[1] ?? '');
        const viewer = await viewerFor(records(), caller);
        const t = now();
        const d = await preventionAccess(records(), repo(), viewer, patientId, t);
        if (!d.allowed) return json({ ok: false, reason: d.reason }, d.reason === 'no_patient' ? 404 : 403);
        const stored = await repo().listRecords(patientId);
        const person = personFrom(d.patient, d.subject, stored, await vitalsOf(d.patient?.id ?? null));
        const children = [];
        for (const childId of d.subject?.childIds ?? []) {
          const [child, childPatient] = [await repo().getSubject(childId), await records().getPatient(childId)];
          const cr = await repo().listRecords(childId);
          const cp = personFrom(childPatient, child, cr);
          children.push({ patientId: childId, name: childPatient?.fullName ?? child?.name ?? '', person: cp, plan: planFor(cp, t) });
        }
        return json({
          ok: true,
          basis: d.basis,
          storage: repo().backend,
          demo: d.subject?.demo ?? false,
          patient: { id: d.patient?.id ?? d.subject?.patientId ?? patientId, name: d.patient?.fullName ?? d.subject?.name ?? '' },
          person,
          plan: planFor(person, t),
          children,
          canRecord: mayWrite(viewer, d.basis, 'growth'),
        });
      },
    },
    {
      method: 'POST',
      path: '/prevention/records',
      handler: async (req, { caller }) => {
        const body = (await req.json().catch(() => null)) as { kind?: string; patientId?: string; record?: Record<string, unknown> } | null;
        if (!body || typeof body.patientId !== 'string' || !body.record || typeof body.record !== 'object') return json({ ok: false, error: 'Expected { kind, patientId, record }' }, 400);
        const kind = body.kind as RecordKind;
        if (!RECORD_KINDS.includes(kind)) return json({ ok: false, error: `Unknown kind: ${String(body.kind)}` }, 400);
        const viewer = await viewerFor(records(), caller);
        const t = now();
        const d = await preventionAccess(records(), repo(), viewer, body.patientId, t);
        if (!d.allowed) return json({ ok: false, reason: d.reason }, d.reason === 'no_patient' ? 404 : 403);
        if (!mayWrite(viewer, d.basis, kind)) return json({ ok: false, reason: 'not_permitted' }, 403);

        const dob = d.patient?.dateOfBirth ?? d.subject?.dob ?? null;
        let fields;
        try {
          fields = validateRecord(kind, body.record, toDay(t), dob ? dob.slice(0, 10) : null);
        } catch (e) {
          if (e instanceof RecordError) return json({ ok: false, error: e.message }, e.status);
          throw e;
        }
        const id = typeof body.record.id === 'string' && body.record.id.length <= 80 ? body.record.id : newUuid();
        const patientId = body.patientId;
        const by = viewer.role === 'patient' ? null : viewer.id;
        const r = repo();
        let saved: unknown;
        switch (kind) {
          case 'vaccination': {
            const v = fields as { vaccineCode: string; dose: number; givenOn: string; batch: string | null };
            const source = viewer.role === 'patient' ? 'self_reported' : viewer.role === 'asha' ? 'asha' : 'doctor';
            saved = await r.saveVaccination({ id, patientId, ...v, givenBy: by, source, createdBy: viewer.id });
            break;
          }
          case 'growth':
            saved = await r.saveGrowth({ id, patientId, ...(fields as { measuredOn: string }), measuredBy: by });
            break;
          case 'screening':
            saved = await r.saveScreening({ id, patientId, ...(fields as { kind: 'bp'; screenedOn: string; value: Record<string, unknown> }), by });
            break;
          case 'pregnancy':
            saved = await r.savePregnancy({ id, patientId, ...(fields as { lmp: string }), recordedBy: by });
            break;
        }
        return json({ ok: true, kind, record: saved });
      },
    },
  ];
}
