/**
 * AshaConnectRepository on Supabase (PostgREST + service-role key). Server only.
 * Columns follow supabase/migrations/5301_asha_connect.sql (and patients /
 * profiles from 1000_base.sql).
 */
import { toDbId } from '../../packages/shared/ids.ts';
import { inList, type RestClient } from '../db/rest.ts';
import { areaKey } from './match.ts';
import type { AshaConnectRepository, MessageFilter, MessagePatch } from './repository.ts';
import type { AshaMessage, AssignmentEvent, ConnectPatient, ConnectRequest, ConnectStaff, ServiceArea } from './types.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());

const PATIENT_COLS = 'id,user_id,full_name,phone,area,facility_id,asha_worker_id,created_at';
const mapPatient = (r: Row): ConnectPatient => ({
  id: String(r.id),
  userId: s(r.user_id),
  fullName: String(r.full_name ?? ''),
  phone: s(r.phone),
  area: s(r.area),
  facilityId: s(r.facility_id),
  ashaWorkerId: s(r.asha_worker_id),
  createdAt: iso(r.created_at) ?? '',
});
const mapStaff = (r: Row): ConnectStaff => ({ id: String(r.id), fullName: String(r.full_name ?? ''), phone: s(r.phone), facilityId: s(r.facility_id), isActive: r.is_active === true });
const mapArea = (r: Row): ServiceArea => ({ ashaId: String(r.asha_id), facilityId: s(r.facility_id), area: String(r.area), key: String(r.area_key) });
const mapEvent = (r: Row): AssignmentEvent => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  ashaId: s(r.asha_id),
  previousAshaId: s(r.previous_asha_id),
  method: r.method as AssignmentEvent['method'],
  reason: s(r.reason),
  byId: s(r.by_id),
  createdAt: iso(r.created_at) ?? '',
});
export const mapMessage = (r: Row): AshaMessage => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  ashaId: s(r.asha_id),
  from: r.sender_role as AshaMessage['from'],
  senderId: String(r.sender_id),
  kind: r.kind as AshaMessage['kind'],
  body: String(r.body ?? ''),
  visitWhen: (s(r.visit_when) as AshaMessage['visitWhen']) ?? null,
  status: (s(r.status) as AshaMessage['status']) ?? null,
  scheduledFor: iso(r.scheduled_for),
  urgent: r.urgent === true,
  emergencyCategories: Array.isArray(r.emergency_categories) ? (r.emergency_categories as string[]) : [],
  createdAt: iso(r.created_at) ?? '',
  updatedAt: iso(r.updated_at) ?? '',
  readAt: iso(r.read_at),
});
const messageRow = (m: AshaMessage): Row => ({
  id: toDbId(m.id),
  patient_id: toDbId(m.patientId),
  asha_id: m.ashaId ? toDbId(m.ashaId) : null,
  sender_role: m.from,
  sender_id: toDbId(m.senderId),
  kind: m.kind,
  body: m.body,
  visit_when: m.visitWhen,
  status: m.status,
  scheduled_for: m.scheduledFor,
  urgent: m.urgent,
  emergency_categories: m.emergencyCategories,
  created_at: m.createdAt,
  updated_at: m.updatedAt,
  read_at: m.readAt,
});
const patch = (p: MessagePatch): Row => {
  const out: Row = {};
  if ('status' in p) out.status = p.status;
  if ('scheduledFor' in p) out.scheduled_for = p.scheduledFor;
  if ('readAt' in p) out.read_at = p.readAt;
  if ('updatedAt' in p) out.updated_at = p.updatedAt;
  return out;
};

export class SupabaseAshaConnectRepository implements AshaConnectRepository {
  private readonly db: RestClient;
  constructor(db: RestClient) {
    this.db = db;
  }

  async listAshas(facilityId: string | null) {
    const f: Record<string, string> = { role: 'eq.asha' };
    if (facilityId) f.facility_id = `eq.${toDbId(facilityId)}`;
    return (await this.db.select<Row>('profiles', f, { columns: 'id,full_name,phone,facility_id,is_active', order: 'full_name.asc' })).map(mapStaff);
  }
  async getStaff(id: string) {
    const r = await this.db.selectOne<Row>('profiles', { id: `eq.${toDbId(id)}` });
    return r ? mapStaff(r) : null;
  }
  async listPatients(facilityId: string | null) {
    const f: Record<string, string> = facilityId ? { or: `(facility_id.eq.${toDbId(facilityId)},facility_id.is.null)` } : {};
    return (await this.db.select<Row>('patients', f, { columns: PATIENT_COLS, order: 'full_name.asc', limit: 5000 })).map(mapPatient);
  }
  async getPatient(id: string) {
    const r = await this.db.selectOne<Row>('patients', { id: `eq.${toDbId(id)}` });
    return r ? mapPatient(r) : null;
  }
  async findPatientByUser(userId: string) {
    const r = await this.db.selectOne<Row>('patients', { user_id: `eq.${toDbId(userId)}` });
    return r ? mapPatient(r) : null;
  }
  async setPatientAsha(patientId: string, ashaId: string | null, fill: { facilityId?: string | null; area?: string | null }) {
    const cur = await this.getPatient(patientId);
    if (!cur) return;
    const p: Row = { asha_worker_id: ashaId ? toDbId(ashaId) : null };
    if (!cur.facilityId && fill.facilityId) p.facility_id = toDbId(fill.facilityId);
    if (!cur.area && fill.area) p.area = fill.area;
    await this.db.update('patients', { id: `eq.${toDbId(patientId)}` }, p);
  }
  async setPatientArea(patientId: string, area: string) {
    await this.db.update('patients', { id: `eq.${toDbId(patientId)}` }, { area });
  }

  async listAreas(facilityId: string | null) {
    const f: Record<string, string> = facilityId ? { or: `(facility_id.eq.${toDbId(facilityId)},facility_id.is.null)` } : {};
    return (await this.db.select<Row>('asha_service_areas', f, { order: 'area.asc' })).map(mapArea);
  }
  async replaceAreas(ashaId: string, facilityId: string | null, areas: string[]) {
    await this.db.delete('asha_service_areas', { asha_id: `eq.${toDbId(ashaId)}` });
    if (!areas.length) return [];
    const rows = areas.map((area) => ({ asha_id: toDbId(ashaId), facility_id: facilityId ? toDbId(facilityId) : null, area, area_key: areaKey(area) }));
    return (await this.db.insert<Row>('asha_service_areas', rows)).map(mapArea);
  }

  async addEvent(e: AssignmentEvent) {
    await this.db.insert('asha_assignment_events', {
      id: toDbId(e.id),
      patient_id: toDbId(e.patientId),
      asha_id: e.ashaId ? toDbId(e.ashaId) : null,
      previous_asha_id: e.previousAshaId ? toDbId(e.previousAshaId) : null,
      method: e.method,
      reason: e.reason,
      by_id: e.byId ? toDbId(e.byId) : null,
      created_at: e.createdAt,
    });
  }
  async listEvents(f: { patientId?: string; previousAshaId?: string; since?: string }) {
    const q: Record<string, string> = {};
    if (f.patientId) q.patient_id = `eq.${toDbId(f.patientId)}`;
    if (f.previousAshaId) q.previous_asha_id = `eq.${toDbId(f.previousAshaId)}`;
    if (f.since) q.created_at = `gt.${f.since}`;
    return (await this.db.select<Row>('asha_assignment_events', q, { order: 'created_at.asc', limit: 5000 })).map(mapEvent);
  }

  async listRequests() {
    return (await this.db.select<Row>('asha_connect_requests', {}, { order: 'requested_at.asc', limit: 5000 })).map(
      (r): ConnectRequest => ({ patientId: String(r.patient_id), area: String(r.area), requestedAt: iso(r.requested_at) ?? '' }),
    );
  }
  async upsertRequest(r: ConnectRequest) {
    await this.db.upsert('asha_connect_requests', { patient_id: toDbId(r.patientId), area: r.area, requested_at: r.requestedAt }, 'patient_id');
  }
  async deleteRequest(patientId: string) {
    await this.db.delete('asha_connect_requests', { patient_id: `eq.${toDbId(patientId)}` });
  }

  async listMessages(f: MessageFilter) {
    const q: Record<string, string> = {};
    if (f.patientId) q.patient_id = `eq.${toDbId(f.patientId)}`;
    if (f.patientIds) q.patient_id = inList(f.patientIds.map(toDbId));
    if (f.ashaId) q.asha_id = `eq.${toDbId(f.ashaId)}`;
    if (f.since) q.updated_at = `gt.${f.since}`;
    // Newest N, returned oldest first.
    const rows = await this.db.select<Row>('asha_messages', q, { order: 'created_at.desc', limit: f.limit ?? 500 });
    return rows.map(mapMessage).reverse();
  }
  async getMessage(id: string) {
    const r = await this.db.selectOne<Row>('asha_messages', { id: `eq.${toDbId(id)}` });
    return r ? mapMessage(r) : null;
  }
  async insertMessage(m: AshaMessage) {
    const [r] = await this.db.insert<Row>('asha_messages', messageRow(m));
    return r ? mapMessage(r) : m;
  }
  async updateMessage(id: string, p: MessagePatch) {
    const [r] = await this.db.update<Row>('asha_messages', { id: `eq.${toDbId(id)}` }, patch(p));
    return r ? mapMessage(r) : null;
  }
  async markRead(patientId: string, readerSide: 'patient' | 'asha', at: string) {
    const rows = await this.db.update<Row>(
      'asha_messages',
      { patient_id: `eq.${toDbId(patientId)}`, sender_role: `neq.${readerSide}`, read_at: 'is.null' },
      { read_at: at, updated_at: at },
    );
    return rows.length;
  }
}
