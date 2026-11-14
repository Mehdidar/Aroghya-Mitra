/**
 * ASHA connect rules. Who may do what:
 *
 *  - patient: sees their own ASHA; asks for one by village (assigned at once
 *    when an active ASHA covers it, else waits for the PHC admin); writes to
 *    their ASHA (text, "please visit", "please call"). Every patient message
 *    goes through the red-flag detector: an emergency sign marks it urgent and
 *    the reply carries the 108 / 112 numbers for the app's emergency banner.
 *  - asha: reads and answers messages of HER caseload only; accepts, declines
 *    or completes visit/call requests (status never moves backwards); scans a
 *    patient's QR card (same token, consent and access log as the doctor's
 *    scan) and may add an unassigned patient she has just scanned.
 *  - admin: sees the assignment board, assigns / moves / removes patients,
 *    sets the villages each ASHA covers. A doctor sees the board read-only.
 *
 * Assigning updates the patients row (ashaWorkerId), writes an assignment
 * event, and moves the field record in the ASHA sync store so the new ASHA's
 * phone gets the patient on its next sync and the old one is told to drop it.
 */
import type { Patient as RecordPatient, Profile } from '../../packages/shared/types.ts';
import { sameRecord } from '../../packages/shared/ids.ts';
import { detectRedFlags, EMERGENCY_CONTACTS } from '../../packages/patient-ai/safety/redFlags.ts';
import type { RecordsRepository } from '../records/repository.ts';
import { logAccess } from '../records/service.ts';
import { verifyQrToken, fromQrPayload } from '../qr/token.ts';
import type { StoredPatient, SyncStore } from '../asha/sync.ts';
import type { Visit } from '../risk/index.ts';
import { areaMatches, cleanAreas, suggestAshas } from './match.ts';
import type { AshaConnectRepository } from './repository.ts';
import type {
  AshaCard,
  AshaLoad,
  AshaMessage,
  AssignMethod,
  ConnectPatient,
  Fail,
  MessageKind,
  PatientAssignment,
  RequestStatus,
  ScanSummary,
  VisitWhen,
} from './types.ts';

export type FieldStore = { store: SyncStore; flush(): Promise<void> };

export interface ConnectDeps {
  repo: AshaConnectRepository;
  records: RecordsRepository;
  /** The ASHA sync store (field records). Optional: without it assignments change only the records tables. */
  field?: () => Promise<FieldStore | null>;
  now: () => Date;
  newId: () => string;
  qr: () => { secret: string; demo: boolean };
}

const fail = (reason: string, status: Fail['status']): Fail => ({ ok: false, reason, status });
const KINDS: MessageKind[] = ['text', 'visit_request', 'call_request'];
const WHEN: VisitWhen[] = ['today', 'tomorrow', 'this_week'];
const STATUS_ORDER: RequestStatus[] = ['open', 'accepted', 'done'];
const MAX_BODY = 1000;
const SYMPTOM_DAYS = 30;
/** An ASHA may add a scanned patient for this long after the scan. */
const SCAN_ADD_WINDOW_MS = 2 * 3_600_000;
export const DEMO_PAYLOAD_PREFIX = 'AM1.demo.';
const DAY = 86_400_000;

export class AshaConnectService {
  private readonly d: ConnectDeps;
  constructor(d: ConnectDeps) {
    this.d = d;
  }
  private now() {
    return this.d.now();
  }

  // ---------------------------------------------------------------- helpers

  /** The patient row the viewer is asking about: a patient only ever gets their own. */
  async patientFor(viewer: Profile, patientId: string | null): Promise<ConnectPatient | Fail> {
    if (!viewer.isActive) return fail('inactive_account', 403);
    if (viewer.role === 'patient') {
      const own = await this.d.repo.findPatientByUser(viewer.id);
      if (!own) return fail('no_patient', 404);
      if (patientId && !sameRecord(patientId, own.id)) return fail('not_permitted', 403);
      return own;
    }
    if (!patientId) return fail('patient_required', 400);
    const p = await this.d.repo.getPatient(patientId);
    return p ?? fail('no_patient', 404);
  }

  /** The ASHA's caseload ids: patients rows assigned to her plus field records on her phone's store. */
  async caseload(ashaId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    const me = await this.d.repo.getStaff(ashaId);
    for (const p of await this.d.repo.listPatients(me?.facilityId ?? null)) if (p.ashaWorkerId === ashaId) ids.add(p.id);
    const field = await this.d.field?.();
    if (field) for (const row of Object.values(field.store.load<StoredPatient>('patients'))) if (row.record.assignedAshaId === ashaId) ids.add(row.record.id);
    return ids;
  }
  private async inCaseload(ashaId: string, patientId: string) {
    for (const id of await this.caseload(ashaId)) if (sameRecord(id, patientId)) return true;
    return false;
  }

  private async card(ashaId: string, patientId: string): Promise<AshaCard | null> {
    const asha = await this.d.repo.getStaff(ashaId);
    if (!asha) return null;
    const areas = (await this.d.repo.listAreas(asha.facilityId)).filter((a) => a.ashaId === ashaId).map((a) => a.area);
    const bundle = await this.d.records.loadRecordBundle(patientId);
    const visits = (bundle?.ashaVisits ?? []).filter((v) => v.ashaWorkerId === ashaId).map((v) => v.visitedAt);
    const fieldVisits = (await this.fieldVisits(patientId)).filter((v) => v.ashaId === ashaId).map((v) => v.visitedAt);
    const last = [...visits, ...fieldVisits].sort().pop() ?? null;
    return { id: asha.id, fullName: asha.fullName, phone: asha.phone, areas, lastVisitAt: last };
  }

  private async fieldVisits(patientId: string): Promise<Visit[]> {
    const field = await this.d.field?.();
    if (!field) return [];
    return Object.values(field.store.load<Visit>('visits'))
      .map((r) => r.record)
      .filter((v) => sameRecord(v.patientId, patientId));
  }
  private async fieldPatient(patientId: string): Promise<StoredPatient | null> {
    const field = await this.d.field?.();
    if (!field) return null;
    return Object.values(field.store.load<StoredPatient>('patients')).find((r) => sameRecord(r.record.id, patientId))?.record ?? null;
  }

  // ---------------------------------------------------------------- patient: my ASHA

  async mine(viewer: Profile, patientId: string | null) {
    const p = await this.patientFor(viewer, patientId);
    if ('ok' in p) return p;
    if (viewer.role !== 'patient' && viewer.role !== 'admin' && !(viewer.role === 'asha' && p.ashaWorkerId === viewer.id)) return fail('not_permitted', 403);
    const req = (await this.d.repo.listRequests()).find((r) => sameRecord(r.patientId, p.id)) ?? null;
    const asha = p.ashaWorkerId ? await this.card(p.ashaWorkerId, p.id) : null;
    return { ok: true as const, patientId: p.id, area: p.area, asha, waitingSince: asha ? null : (req?.requestedAt ?? null) };
  }

  /** "Find my ASHA": save the village, assign at once if an active ASHA covers it, else wait for the PHC. */
  async find(viewer: Profile, body: { patientId?: unknown; area?: unknown }) {
    if (viewer.role !== 'patient') return fail('forbidden_role', 403);
    const p = await this.patientFor(viewer, typeof body.patientId === 'string' ? body.patientId : null);
    if ('ok' in p) return p;
    if (p.ashaWorkerId) return this.mine(viewer, p.id);
    const area = cleanAreas([body.area])[0];
    if (!area) return fail('area_required', 400);
    await this.d.repo.setPatientArea(p.id, area);
    const best = await this.bestAsha({ ...p, area });
    if (best && best.match === 'area') {
      await this.assign({ ...p, area }, best.ashaId, 'area_match', viewer.id, `Covers ${area}`);
      return { ...(await this.mine(viewer, p.id)), method: 'area_match' as const };
    }
    await this.d.repo.upsertRequest({ patientId: p.id, area, requestedAt: this.now().toISOString() });
    return { ...(await this.mine(viewer, p.id)), method: 'waiting' as const };
  }

  private async bestAsha(p: ConnectPatient) {
    const ashas = await this.d.repo.listAshas(p.facilityId);
    const areas = await this.d.repo.listAreas(p.facilityId);
    const patients = await this.d.repo.listPatients(p.facilityId);
    const load = new Map<string, number>();
    for (const x of patients) if (x.ashaWorkerId) load.set(x.ashaWorkerId, (load.get(x.ashaWorkerId) ?? 0) + 1);
    return suggestAshas({ patientArea: p.area, patientFacilityId: p.facilityId, ashas, areas, caseloads: load })[0] ?? null;
  }

  // ---------------------------------------------------------------- assignment

  /** Move a patient to `ashaId` (or off every list with null). Idempotent. */
  async assign(p: ConnectPatient, ashaId: string | null, method: AssignMethod, byId: string | null, reason: string | null) {
    const prev = p.ashaWorkerId;
    if (prev === ashaId) return;
    const asha = ashaId ? await this.d.repo.getStaff(ashaId) : null;
    const at = this.now().toISOString();
    await this.d.repo.setPatientAsha(p.id, ashaId, { facilityId: asha?.facilityId ?? null, area: p.area });
    await this.d.repo.addEvent({ id: this.d.newId(), patientId: p.id, ashaId, previousAshaId: prev, method: ashaId ? method : 'unassigned', reason, byId, createdAt: at });
    if (ashaId) await this.d.repo.deleteRequest(p.id);
    await this.moveFieldRecord(p, ashaId, at);
  }

  /** The ASHA phones work from the sync store: re-own the field record (or create one) with a fresh receivedAt. */
  private async moveFieldRecord(p: ConnectPatient, ashaId: string | null, at: string) {
    const field = await this.d.field?.();
    if (!field) return;
    const table = field.store.load<StoredPatient>('patients');
    const key = Object.keys(table).find((id) => sameRecord(id, p.id));
    if (key) {
      table[key] = { record: { ...table[key].record, assignedAshaId: ashaId ?? '', updatedAt: at }, receivedAt: at };
    } else if (ashaId) {
      const full: RecordPatient | null = await this.d.records.getPatient(p.id);
      const record: StoredPatient = {
        id: p.id,
        name: p.fullName,
        // Unknown sex / date of birth stay unknown ('U', '') until the ASHA's first visit; never guessed.
        sex: full?.sex === 'female' ? 'F' : full?.sex === 'male' ? 'M' : 'U',
        dob: full?.dateOfBirth ?? '',
        phone: p.phone ?? undefined,
        village: p.area ?? '',
        categories: ['general'],
        conditions: full?.chronicConditions ?? [],
        assignedAshaId: ashaId,
        needsDetails: !full?.dateOfBirth || !full?.sex,
        updatedAt: at,
      };
      table[p.id] = { record, receivedAt: at };
    } else return;
    field.store.save('patients', table);
    await field.flush();
  }

  /** Patients taken away from this ASHA since `since`, so her phone can drop them. */
  async released(ashaId: string, since: string | undefined): Promise<string[]> {
    const events = await this.d.repo.listEvents({ previousAshaId: ashaId, since });
    const ids = [...new Set(events.map((e) => e.patientId))];
    const out: string[] = [];
    for (const id of ids) {
      const p = await this.d.repo.getPatient(id);
      if (p?.ashaWorkerId !== ashaId) out.push(id);
    }
    return out;
  }

  async board(viewer: Profile) {
    if (!viewer.isActive || (viewer.role !== 'admin' && viewer.role !== 'doctor')) return fail('forbidden_role', 403);
    const fac = viewer.facilityId;
    const [ashas, patients, areas, requests, messages] = await Promise.all([
      this.d.repo.listAshas(fac),
      this.d.repo.listPatients(fac),
      this.d.repo.listAreas(fac),
      this.d.repo.listRequests(),
      this.d.repo.listMessages({ limit: 2000 }),
    ]);
    const field = await this.d.field?.();
    const fieldRows = field ? Object.values(field.store.load<StoredPatient>('patients')).map((r) => r.record) : [];
    const risky = (id: string) => {
      const f = fieldRows.find((r) => sameRecord(r.id, id));
      return f?.riskLevel === 'high' || f?.riskLevel === 'critical';
    };
    const load = new Map<string, number>();
    for (const p of patients) if (p.ashaWorkerId) load.set(p.ashaWorkerId, (load.get(p.ashaWorkerId) ?? 0) + 1);
    const name = new Map(ashas.map((a) => [a.id, a.fullName]));
    const events = await this.d.repo.listEvents({});

    const ashaRows: AshaLoad[] = ashas.map((a) => ({
      id: a.id,
      fullName: a.fullName,
      phone: a.phone,
      isActive: a.isActive,
      areas: areas.filter((x) => x.ashaId === a.id).map((x) => x.area),
      caseload: load.get(a.id) ?? 0,
      highRisk: patients.filter((p) => p.ashaWorkerId === a.id && risky(p.id)).length,
      openRequests: messages.filter((m) => m.ashaId === a.id && m.status === 'open').length,
    }));
    const patientRows: PatientAssignment[] = patients.map((p) => {
      const req = requests.find((r) => sameRecord(r.patientId, p.id));
      const last = events.filter((e) => sameRecord(e.patientId, p.id)).pop();
      const suggestion = p.ashaWorkerId ? null : (suggestAshas({ patientArea: p.area ?? req?.area ?? null, patientFacilityId: p.facilityId, ashas, areas, caseloads: load })[0] ?? null);
      return {
        id: p.id,
        fullName: p.fullName,
        area: p.area ?? req?.area ?? null,
        ashaId: p.ashaWorkerId,
        ashaName: p.ashaWorkerId ? (name.get(p.ashaWorkerId) ?? null) : null,
        highRisk: risky(p.id),
        requestedAt: p.ashaWorkerId ? null : (req?.requestedAt ?? null),
        suggestion,
        lastChange: last ? { method: last.method, createdAt: last.createdAt, reason: last.reason } : null,
      };
    });
    // Waiting patients first (oldest request first), then unassigned, then by name.
    patientRows.sort(
      (a, b) =>
        Number(!!b.requestedAt) - Number(!!a.requestedAt) ||
        (a.requestedAt ?? '').localeCompare(b.requestedAt ?? '') ||
        Number(!a.ashaId) * -1 - Number(!b.ashaId) * -1 ||
        a.fullName.localeCompare(b.fullName),
    );
    return { ok: true as const, canEdit: viewer.role === 'admin', ashas: ashaRows, patients: patientRows };
  }

  async adminAssign(viewer: Profile, body: { patientId?: unknown; ashaId?: unknown; reason?: unknown }) {
    if (!viewer.isActive || viewer.role !== 'admin') return fail('forbidden_role', 403);
    if (typeof body.patientId !== 'string') return fail('patient_required', 400);
    const p = await this.d.repo.getPatient(body.patientId);
    if (!p) return fail('no_patient', 404);
    if (viewer.facilityId && p.facilityId && p.facilityId !== viewer.facilityId) return fail('not_permitted', 403);
    const ashaId = body.ashaId === null ? null : typeof body.ashaId === 'string' ? body.ashaId : undefined;
    if (ashaId === undefined) return fail('asha_required', 400);
    if (ashaId) {
      const a = await this.d.repo.getStaff(ashaId);
      const isAsha = (await this.d.repo.listAshas(viewer.facilityId)).some((x) => x.id === ashaId);
      if (!a || !isAsha) return fail('no_asha', 404);
      if (!a.isActive) return fail('asha_inactive', 409);
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) || null : null;
    await this.assign(p, ashaId, 'admin', viewer.id, reason);
    return { ok: true as const, patientId: p.id, ashaId };
  }

  async setAreas(viewer: Profile, body: { ashaId?: unknown; areas?: unknown }) {
    if (!viewer.isActive || viewer.role !== 'admin') return fail('forbidden_role', 403);
    if (typeof body.ashaId !== 'string') return fail('asha_required', 400);
    const a = (await this.d.repo.listAshas(viewer.facilityId)).find((x) => x.id === body.ashaId);
    if (!a) return fail('no_asha', 404);
    const rows = await this.d.repo.replaceAreas(a.id, a.facilityId, cleanAreas(body.areas));
    return { ok: true as const, ashaId: a.id, areas: rows.map((r) => r.area) };
  }

  // ---------------------------------------------------------------- messages

  async listMessages(viewer: Profile, q: { patientId: string | null; since: string | null }) {
    const serverTime = this.now().toISOString();
    const since = q.since && !Number.isNaN(Date.parse(q.since)) ? q.since : undefined;
    if (viewer.role === 'patient') {
      const p = await this.patientFor(viewer, q.patientId);
      if ('ok' in p) return p;
      return { ok: true as const, serverTime, messages: await this.d.repo.listMessages({ patientId: p.id, since, limit: 300 }) };
    }
    if (viewer.role === 'asha' && viewer.isActive) {
      const ids = [...(await this.caseload(viewer.id))];
      if (q.patientId) {
        if (!ids.some((i) => sameRecord(i, q.patientId!))) return fail('not_permitted', 403);
        return { ok: true as const, serverTime, messages: await this.d.repo.listMessages({ patientId: q.patientId, since, limit: 300 }) };
      }
      if (!ids.length) return { ok: true as const, serverTime, messages: [] };
      return { ok: true as const, serverTime, messages: await this.d.repo.listMessages({ patientIds: ids, since, limit: 1000 }) };
    }
    return fail('forbidden_role', 403);
  }

  async send(viewer: Profile, body: { patientId?: unknown; kind?: unknown; body?: unknown; visitWhen?: unknown }) {
    if (!viewer.isActive) return fail('inactive_account', 403);
    const kind = (typeof body.kind === 'string' ? body.kind : 'text') as MessageKind;
    if (!KINDS.includes(kind)) return fail('bad_kind', 400);
    const text = typeof body.body === 'string' ? body.body.trim().slice(0, MAX_BODY) : '';
    const at = this.now().toISOString();
    const base = { id: this.d.newId(), createdAt: at, updatedAt: at, readAt: null, scheduledFor: null };

    if (viewer.role === 'patient') {
      const p = await this.patientFor(viewer, typeof body.patientId === 'string' ? body.patientId : null);
      if ('ok' in p) return p;
      if (!p.ashaWorkerId) return fail('no_asha', 409);
      if (kind === 'text' && !text) return fail('empty', 400);
      const visitWhen = kind === 'text' ? null : WHEN.includes(body.visitWhen as VisitWhen) ? (body.visitWhen as VisitWhen) : kind === 'visit_request' ? null : 'today';
      if (kind === 'visit_request' && !visitWhen) return fail('when_required', 400);
      // Safety first: the patient's own words go through the emergency detector before anything else.
      const flags = text ? detectRedFlags(text) : null;
      const msg: AshaMessage = {
        ...base,
        patientId: p.id,
        ashaId: p.ashaWorkerId,
        from: 'patient',
        senderId: viewer.id,
        kind,
        body: text,
        visitWhen,
        status: kind === 'text' ? null : 'open',
        urgent: !!flags?.isEmergency,
        emergencyCategories: flags?.categories ?? [],
      };
      const saved = await this.d.repo.insertMessage(msg);
      const emergency = flags?.isEmergency ? { categories: flags.categories, contacts: flags.contacts.length ? flags.contacts : [EMERGENCY_CONTACTS.ambulance, EMERGENCY_CONTACTS.national] } : null;
      return { ok: true as const, message: saved, emergency };
    }

    if (viewer.role === 'asha') {
      if (kind !== 'text') return fail('bad_kind', 400);
      if (!text) return fail('empty', 400);
      if (typeof body.patientId !== 'string') return fail('patient_required', 400);
      if (!(await this.inCaseload(viewer.id, body.patientId))) return fail('not_permitted', 403);
      // The ASHA phone may use its own id for the patient (e.g. demo_p3); store the records id when there is one.
      const patientId = (await this.d.repo.getPatient(body.patientId))?.id ?? body.patientId;
      const msg: AshaMessage = { ...base, patientId, ashaId: viewer.id, from: 'asha', senderId: viewer.id, kind, body: text, visitWhen: null, status: null, urgent: false, emergencyCategories: [] };
      return { ok: true as const, message: await this.d.repo.insertMessage(msg), emergency: null };
    }
    return fail('forbidden_role', 403);
  }

  /** The ASHA answers a visit / call request. Status only moves forward (declined is final). */
  async setStatus(viewer: Profile, id: string, body: { status?: unknown; scheduledFor?: unknown }) {
    if (!viewer.isActive || viewer.role !== 'asha') return fail('forbidden_role', 403);
    const m = await this.d.repo.getMessage(id);
    if (!m || m.kind === 'text') return fail('not_found', 404);
    if (!(await this.inCaseload(viewer.id, m.patientId))) return fail('not_permitted', 403);
    const next = body.status as RequestStatus;
    if (!['accepted', 'done', 'declined'].includes(next)) return fail('bad_status', 400);
    if (m.status === 'declined' || m.status === 'done') return fail('closed', 409);
    if (next !== 'declined' && STATUS_ORDER.indexOf(next) <= STATUS_ORDER.indexOf(m.status ?? 'open')) return fail('backwards', 409);
    let scheduledFor = m.scheduledFor;
    if (next === 'accepted' && m.kind === 'visit_request') {
      const t = typeof body.scheduledFor === 'string' ? Date.parse(body.scheduledFor) : NaN;
      if (Number.isNaN(t) || t < this.now().getTime() - DAY) return fail('date_required', 400);
      scheduledFor = new Date(t).toISOString();
    }
    const at = this.now().toISOString();
    const saved = await this.d.repo.updateMessage(m.id, { status: next, scheduledFor, updatedAt: at, readAt: m.readAt ?? at });
    return { ok: true as const, message: saved };
  }

  async markRead(viewer: Profile, body: { patientId?: unknown }) {
    if (viewer.role === 'patient') {
      const p = await this.patientFor(viewer, typeof body.patientId === 'string' ? body.patientId : null);
      if ('ok' in p) return p;
      return { ok: true as const, read: await this.d.repo.markRead(p.id, 'patient', this.now().toISOString()) };
    }
    if (viewer.role === 'asha' && viewer.isActive && typeof body.patientId === 'string') {
      if (!(await this.inCaseload(viewer.id, body.patientId))) return fail('not_permitted', 403);
      return { ok: true as const, read: await this.d.repo.markRead(body.patientId, 'asha', this.now().toISOString()) };
    }
    return fail('forbidden_role', 403);
  }

  // ---------------------------------------------------------------- ASHA scans a patient's QR card

  async scan(viewer: Profile, payload: string) {
    if (viewer.role !== 'asha') return fail('forbidden_role', 403);
    const now = this.now();
    let patientId: string;
    const records = this.d.records;
    if (payload.startsWith(DEMO_PAYLOAD_PREFIX)) {
      // The offline demo card carries no signature: accepted only while the server itself runs without a real QR secret.
      if (!this.d.qr().demo) return fail('expired', 403);
      patientId = payload.slice(DEMO_PAYLOAD_PREFIX.length);
    } else {
      const token = fromQrPayload(payload);
      if (!token) return fail('not_aroghya_qr', 400);
      const v = await verifyQrToken(token, { secret: this.d.qr().secret, now });
      if (!v.ok) {
        if (v.claims && (await records.getPatient(v.claims.sub))) await logAccess(records, viewer, v.claims.sub, 'qr_scan', 'denied', v.reason, now);
        return fail(v.reason, v.reason === 'malformed' ? 400 : 403);
      }
      patientId = v.claims.sub;
      const { firstViewerId } = await records.redeemToken(v.claims.jti, patientId, viewer.id, now);
      if (firstViewerId !== viewer.id) {
        await logAccess(records, viewer, patientId, 'qr_scan', 'denied', 'token_already_used', now);
        return fail('token_already_used', 403);
      }
    }
    const patient = await records.getPatient(patientId);
    if (!patient) return fail('no_patient', 404);
    if (!viewer.isActive) {
      await logAccess(records, viewer, patientId, 'qr_scan', 'denied', 'inactive_account', now);
      return fail('inactive_account', 403);
    }
    const consent = await records.getConsent(patientId);
    if (!consent?.shareHistory) {
      await logAccess(records, viewer, patientId, 'qr_scan', 'denied', 'consent_off', now);
      return fail('consent_off', 403);
    }
    await logAccess(records, viewer, patientId, 'qr_scan', 'granted', 'asha_scan', now);
    const summary = await this.summary(patient, now);
    const mine = patient.ashaWorkerId === viewer.id;
    return {
      ok: true as const,
      patientId: patient.id,
      summary,
      assignment: mine ? ('mine' as const) : patient.ashaWorkerId ? ('other' as const) : ('none' as const),
      canAdd: !patient.ashaWorkerId,
    };
  }

  /** Add a patient she scanned in the last two hours who has no ASHA yet. */
  async addScanned(viewer: Profile, body: { patientId?: unknown }) {
    if (!viewer.isActive || viewer.role !== 'asha') return fail('forbidden_role', 403);
    if (typeof body.patientId !== 'string') return fail('patient_required', 400);
    const p = await this.d.repo.getPatient(body.patientId);
    if (!p) return fail('no_patient', 404);
    if (p.ashaWorkerId === viewer.id) return { ok: true as const, patientId: p.id, added: false };
    if (p.ashaWorkerId) return fail('assigned_to_other', 409);
    const logs = await this.d.records.listAccessLogs(p.id, 50);
    const since = this.now().getTime() - SCAN_ADD_WINDOW_MS;
    const scanned = logs.some((l) => l.viewerId === viewer.id && l.method === 'qr_scan' && l.outcome === 'granted' && Date.parse(l.createdAt) >= since);
    if (!scanned) return fail('scan_first', 403);
    await this.assign(p, viewer.id, 'qr_scan', viewer.id, 'Added after scanning the health card');
    return { ok: true as const, patientId: p.id, added: true };
  }

  /** What the ASHA needs at the door: who, what they are facing now, what they take. Nothing invented. */
  async summary(patient: RecordPatient, now: Date): Promise<ScanSummary> {
    const bundle = await this.d.records.loadRecordBundle(patient.id);
    const field = await this.fieldPatient(patient.id);
    const visits = (await this.fieldVisits(patient.id)).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
    const people = new Map((bundle?.people ?? []).map((x) => [x.id, x.fullName]));
    const cutoff = now.getTime() - SYMPTOM_DAYS * DAY;

    const dob = patient.dateOfBirth ? Date.parse(patient.dateOfBirth) : NaN;
    const ageYears = Number.isNaN(dob) ? null : Math.floor((now.getTime() - dob) / (365.25 * DAY));
    const lmp = field?.pregnancy?.lmp ? Date.parse(field.pregnancy.lmp) : NaN;
    const weeks = Number.isNaN(lmp) ? null : Math.floor((now.getTime() - lmp) / (7 * DAY));
    const pregnancyWeeks = field?.categories?.includes('pregnant') && weeks !== null && weeks >= 0 && weeks <= 44 ? weeks : null;

    // Latest measured values: a records vitals row or an ASHA field visit, whichever is newer.
    const rec = [...(bundle?.vitals ?? [])].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
    const fv = visits.find((v) => v.vitals && Object.keys(v.vitals).some((k) => k !== 'recordedAt' && k !== 'symptoms' && k !== 'fetalMovement'));
    let latestVitals: ScanSummary['latestVitals'] = null;
    const n = (x: number | null | undefined) => (typeof x === 'number' ? x : null);
    if (fv && (!rec || fv.visitedAt > rec.recordedAt)) {
      const v = fv.vitals!;
      latestVitals = { recordedAt: fv.visitedAt, source: 'asha_visit', systolic: n(v.systolic), diastolic: n(v.diastolic), hemoglobin: n(v.hemoglobin), temperatureC: n(v.temperatureC), spo2: n(v.spo2), bloodSugarMgDl: n(v.bloodSugarRandom ?? v.bloodSugarFasting), weightKg: n(v.weightKg) };
    } else if (rec) {
      latestVitals = { recordedAt: rec.recordedAt, source: rec.source, systolic: n(rec.systolic), diastolic: n(rec.diastolic), hemoglobin: null, temperatureC: n(rec.temperatureC), spo2: n(rec.spo2), bloodSugarMgDl: n(rec.bloodSugarMgDl), weightKg: n(rec.weightKg) };
    }

    const symptoms: ScanSummary['symptoms'] = [];
    for (const v of visits) {
      if (Date.parse(v.visitedAt) < cutoff) continue;
      const codes = v.vitals?.symptoms ?? [];
      if (codes.length || v.vitals?.fetalMovement === 'reduced' || v.vitals?.fetalMovement === 'absent') {
        symptoms.push({ at: v.visitedAt, source: 'asha_visit', codes: [...codes, ...(v.vitals?.fetalMovement && v.vitals.fetalMovement !== 'normal' ? [`fetal_movement_${v.vitals.fetalMovement}`] : [])], text: v.notes ?? null });
      }
    }
    const msgs = await this.d.repo.listMessages({ patientId: patient.id, limit: 200 });
    for (const m of msgs) {
      if (m.from !== 'patient' || !m.body || Date.parse(m.createdAt) < cutoff) continue;
      symptoms.push({ at: m.createdAt, source: 'patient_message', codes: m.emergencyCategories.map((c) => `emergency_${c}`), text: m.body });
    }
    for (const c of bundle?.consultations ?? []) {
      if (Date.parse(c.startedAt) < cutoff || !c.notes) continue;
      symptoms.push({ at: c.startedAt, source: 'consultation', codes: [], text: c.notes });
    }
    symptoms.sort((a, b) => b.at.localeCompare(a.at));

    const openAlerts = (bundle?.riskAlerts ?? [])
      .filter((a) => !a.resolvedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((a) => ({ level: a.level, reason: a.reason, createdAt: a.createdAt }));

    const active = (bundle?.prescriptions ?? []).filter((p) => {
      if (p.source !== 'doctor') return false;
      const issued = Date.parse(p.issuedAt);
      const longest = Math.max(0, ...p.items.map((i) => i.durationDays ?? 90));
      return issued + longest * DAY >= now.getTime();
    });
    const medicines = active.flatMap((p) => p.items.map((i) => ({ name: i.name, dosage: i.dosage, frequency: i.frequency })));

    const lastC = [...(bundle?.consultations ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    const lastV = [...(bundle?.ashaVisits ?? [])].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))[0];
    const fieldLast = visits[0];
    const lastAshaVisit =
      fieldLast && (!lastV || fieldLast.visitedAt >= lastV.visitedAt)
        ? { at: fieldLast.visitedAt, ashaName: people.get(fieldLast.ashaId) ?? null, notes: fieldLast.notes ?? null }
        : lastV
          ? { at: lastV.visitedAt, ashaName: people.get(lastV.ashaWorkerId) ?? null, notes: lastV.notes }
          : null;
    const asha = patient.ashaWorkerId ? await this.d.repo.getStaff(patient.ashaWorkerId) : null;

    return {
      patient: {
        id: patient.id,
        fullName: patient.fullName,
        ageYears,
        sex: patient.sex,
        area: patient.area,
        phone: patient.phone,
        bloodGroup: patient.bloodGroup,
        allergies: patient.allergies,
        conditions: [...new Set([...patient.chronicConditions, ...(field?.conditions ?? [])])],
        pregnancyWeeks,
      },
      latestVitals,
      symptoms: symptoms.slice(0, 12),
      openAlerts,
      medicines,
      lastConsultation: lastC ? { at: lastC.startedAt, doctorName: people.get(lastC.doctorId) ?? null, diagnosis: lastC.diagnosis, followUpDate: lastC.followUpDate } : null,
      lastAshaVisit,
      assignedAsha: asha ? { id: asha.id, fullName: asha.fullName } : null,
    };
  }
}

export { areaMatches };
