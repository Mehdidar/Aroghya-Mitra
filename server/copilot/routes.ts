/**
 * Doctor AI copilot routes.
 *
 *   GET  /copilot/summary/:patientId[?narrative=1]  deterministic summary + clinical timeline + lab comparison;
 *                                                   with narrative=1 also an AI draft written only from the facts
 *   GET  /copilot/labs/:patientId                   lab comparison (per test over time, change, out-of-range flags)
 *   POST /copilot/labs                              a doctor enters lab values from a report
 *   POST /copilot/notes                             dictation transcript → structured consultation note DRAFT
 *
 * Who: active doctors and admins with access to the patient (server/records/access.ts);
 * writes (labs, notes) are doctors only. Every summary/labs open, granted or
 * denied, is written to the access log like GET /records/history. The notes
 * route saves nothing: the doctor edits and approves the draft on the phone.
 */
import { ExtractionError, extractStructured, type LlmCall } from '../ai/extractStructured.ts';
import { json, type Route } from '../http/router.ts';
import { pregnancyFromRecord } from '../../packages/records/medicines/safety.ts';
import type { Profile } from '../../packages/records/records/types.ts';
import { resolveAccess } from '../records/access.ts';
import { getDemoRepository } from '../records/demoSeed.ts';
import type { LabResult, RecordsRepository } from '../records/repository.ts';
import { viewerFor } from '../records/routes.ts';
import { logAccess } from '../records/service.ts';
import { validateLabEntry } from './labEntry.ts';
import { compareLabs, LAB_TESTS } from './labs.ts';
import { defaultCopilotLlm, type CopilotLlm } from './llm.ts';
import { writeNarrative } from './narrative.ts';
import { ConsultationNoteDraft, NOTES_SCHEMA_HINT, NOTES_SYSTEM_PROMPT } from './notesSchema.ts';
import { buildCopilotSummary } from './summary.ts';

const SUMMARY = /^\/copilot\/summary\/([^/]+)$/;
const LABS = /^\/copilot\/labs\/([^/]+)$/;
const LANGS = new Set(['en', 'hi', 'kn', 'ta', 'te', 'ur', 'ks']);

export interface CopilotDeps {
  repo?: RecordsRepository;
  now?: () => Date;
  /** null: no model configured. Default: Gemini, then Sarvam. */
  llm?: CopilotLlm | null;
  newId?: () => string;
}

type Gate = { ok: true; viewer: Profile; basis: string } | { ok: false; res: Response };

const idFrom = (re: RegExp, url: URL) => decodeURIComponent(re.exec(url.pathname.replace(/\/+$/, ''))?.[1] ?? '');

export function routes(deps: CopilotDeps = {}): Route[] {
  const repo = () => deps.repo ?? getDemoRepository();
  const now = deps.now ?? (() => new Date());
  let llmCache: CopilotLlm | null | undefined = deps.llm;
  const llm = () => (llmCache === undefined ? (llmCache = defaultCopilotLlm({ json: true })) : llmCache);
  let textLlmCache: CopilotLlm | null | undefined = deps.llm;
  const textLlm = () => (textLlmCache === undefined ? (textLlmCache = defaultCopilotLlm({ json: false })) : textLlmCache);
  const newId = deps.newId ?? (() => crypto.randomUUID());

  /** Doctor/admin (or doctor only) with access to the patient. `log` writes the access log like history opens. */
  async function gate(caller: Parameters<typeof viewerFor>[1], patientId: string, opts: { doctorOnly?: boolean; log: boolean }): Promise<Gate> {
    const r = repo();
    const viewer = await viewerFor(r, caller);
    const t = now();
    const roleOk = viewer.role === 'doctor' || (!opts.doctorOnly && viewer.role === 'admin');
    if (!roleOk || !viewer.isActive) {
      if (opts.log && patientId && (await r.getPatient(patientId))) await logAccess(r, viewer, patientId, 'direct', 'denied', viewer.isActive ? 'not_permitted' : 'inactive_account', t);
      return { ok: false, res: json({ ok: false, reason: viewer.isActive ? 'not_permitted' : 'inactive_account' }, 403) };
    }
    if (!patientId) return { ok: false, res: json({ ok: false, reason: 'no_patient' }, 400) };
    const d = await resolveAccess(r, viewer, patientId, t);
    if (!d.allowed) {
      if (opts.log && d.reason !== 'no_patient') await logAccess(r, viewer, patientId, 'direct', 'denied', d.reason, t);
      return { ok: false, res: json({ ok: false, reason: d.reason }, d.reason === 'no_patient' ? 404 : 403) };
    }
    if (opts.log) await logAccess(r, viewer, patientId, 'direct', 'granted', d.basis, t);
    return { ok: true, viewer, basis: d.basis };
  }

  /** Lab values, or null if the store cannot give them (e.g. lab_results not migrated yet). */
  async function labsOf(patientId: string): Promise<LabResult[] | null> {
    try {
      return await repo().listLabResults(patientId);
    } catch (e) {
      console.warn('[copilot] lab results unavailable:', (e as Error).message);
      return null;
    }
  }

  return [
    {
      method: 'GET',
      path: SUMMARY,
      handler: async (_req, { caller, url }) => {
        const patientId = idFrom(SUMMARY, url);
        const g = await gate(caller, patientId, { log: true });
        if (!g.ok) return g.res;
        const bundle = await repo().loadRecordBundle(patientId);
        if (!bundle) return json({ ok: false, reason: 'no_patient' }, 404);
        const summary = buildCopilotSummary(bundle, await labsOf(patientId), { now: now() });
        let narrative: { text: string | null; reason: string | null; model: string | null; label: string } | null = null;
        if (url.searchParams.get('narrative') === '1') {
          const m = textLlm();
          const r = await writeNarrative(summary.facts, m?.call ?? null);
          narrative = r.ok
            ? { text: r.text, reason: null, model: m?.name() ?? null, label: 'AI draft — verify against the record' }
            : { text: null, reason: r.reason, model: null, label: 'AI draft — verify against the record' };
          if (!r.ok) console.warn('[copilot] narrative not shown:', r.reason, r.detail ?? '');
        }
        return json({ ok: true, basis: g.basis, summary, narrative });
      },
    },
    {
      method: 'GET',
      path: LABS,
      handler: async (_req, { caller, url }) => {
        const patientId = idFrom(LABS, url);
        const g = await gate(caller, patientId, { log: true });
        if (!g.ok) return g.res;
        const labs = await labsOf(patientId);
        if (!labs) return json({ ok: false, reason: 'labs_unavailable' }, 503);
        return json({ ok: true, comparison: compareLabs(labs), tests: LAB_TESTS });
      },
    },
    {
      method: 'POST',
      path: '/copilot/labs',
      handler: async (req, { caller }) => {
        const body = (await req.json().catch(() => null)) as { patientId?: unknown } | null;
        if (!body || typeof body !== 'object') return json({ ok: false, errors: ['Expected a JSON body'] }, 400);
        const patientId = typeof body.patientId === 'string' ? body.patientId : '';
        const g = await gate(caller, patientId, { doctorOnly: true, log: false });
        if (!g.ok) return g.res;
        const patient = await repo().getPatient(patientId);
        const bundle = await repo().loadRecordBundle(patientId);
        const preg = pregnancyFromRecord(patient?.chronicConditions ?? [], (bundle?.referrals ?? []).map((r) => r.reason));
        const v = validateLabEntry({ ...body, patientId: patient?.id ?? patientId }, { enteredBy: g.viewer.id, now: now(), newId, pregnant: preg.pregnant });
        if (!v.ok) return json({ ok: false, errors: v.errors }, 400);
        try {
          await repo().saveLabResults(v.rows);
        } catch (e) {
          console.warn('[copilot] saving lab results failed:', (e as Error).message);
          return json({ ok: false, reason: 'labs_unavailable' }, 503);
        }
        const labs = (await labsOf(patientId)) ?? v.rows;
        return json({ ok: true, saved: v.rows.length, comparison: compareLabs(labs) });
      },
    },
    {
      method: 'POST',
      path: '/copilot/notes',
      handler: async (req, { caller }) => {
        const body = (await req.json().catch(() => null)) as { transcript?: unknown; patientId?: unknown; language?: unknown } | null;
        const transcript = typeof body?.transcript === 'string' ? body.transcript.trim() : '';
        const patientId = typeof body?.patientId === 'string' ? body.patientId : '';
        const language = typeof body?.language === 'string' && LANGS.has(body.language) ? body.language : 'en';
        if (!transcript || transcript.length < 3) return json({ ok: false, reason: 'empty_transcript' }, 400);
        if (transcript.length > 8000) return json({ ok: false, reason: 'transcript_too_long' }, 413);
        const g = await gate(caller, patientId, { doctorOnly: true, log: false });
        if (!g.ok) return g.res;
        const m = llm();
        if (!m) return json({ ok: false, reason: 'no_model' }, 503);
        try {
          const draft = await extractStructured(`Dictation language: ${language}.\nDictation:\n${transcript}`, ConsultationNoteDraft, {
            llm: m.call as LlmCall,
            instructions: NOTES_SYSTEM_PROMPT,
            schemaHint: NOTES_SCHEMA_HINT,
            maxAttempts: 2,
          });
          return json({ ok: true, draft, model: m.name(), approved: false, note: 'Draft only: nothing is saved until the doctor approves it.' });
        } catch (e) {
          const reason = e instanceof ExtractionError ? 'unparseable' : 'model_error';
          console.warn('[copilot] notes extraction failed:', reason, (e as Error).message);
          return json({ ok: false, reason }, 502);
        }
      },
    },
  ];
}
