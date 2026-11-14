/**
 * AppointmentsRepository on Supabase (PostgREST + service-role key). Server only.
 * Columns follow supabase/migrations/5201_appointments.sql. The partial unique
 * index appointments_doctor_slot_active turns a double booking into HTTP 409,
 * which becomes SlotTakenError.
 */
import { toDbId } from '../../packages/shared/ids.ts';
import { DbError, inList, type RestClient } from '../db/rest.ts';
import { SlotTakenError, type AppointmentPatch, type AppointmentsRepository } from './repository.ts';
import type { Appointment, AvailabilityRule, FacilityInfo } from './types.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const hhmm = (v: unknown) => (v === null || v === undefined ? null : String(v).slice(0, 5));

export const mapRule = (r: Row): AvailabilityRule => ({
  id: String(r.id),
  doctorId: String(r.doctor_id),
  facilityId: String(r.facility_id),
  weekday: r.weekday === null || r.weekday === undefined ? null : Number(r.weekday),
  specificDate: s(r.specific_date),
  closed: r.is_closed === true,
  startTime: hhmm(r.start_time),
  endTime: hhmm(r.end_time),
  slotMinutes: Number(r.slot_minutes ?? 15),
  validFrom: s(r.valid_from),
  validTo: s(r.valid_to),
  createdBy: s(r.created_by),
  createdAt: String(r.created_at ?? ''),
});

const ruleRow = (r: AvailabilityRule): Row => ({
  id: toDbId(r.id),
  doctor_id: toDbId(r.doctorId),
  facility_id: toDbId(r.facilityId),
  weekday: r.weekday,
  specific_date: r.specificDate,
  is_closed: r.closed,
  start_time: r.startTime,
  end_time: r.endTime,
  slot_minutes: r.slotMinutes,
  valid_from: r.validFrom,
  valid_to: r.validTo,
  created_by: r.createdBy ? toDbId(r.createdBy) : null,
  created_at: r.createdAt,
});

export const mapAppointment = (r: Row): Appointment => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  doctorId: String(r.doctor_id),
  facilityId: String(r.facility_id),
  // PostgREST returns '+00:00' offsets; normalise to the Z form used everywhere else.
  startsAt: new Date(String(r.starts_at)).toISOString(),
  endsAt: new Date(String(r.ends_at)).toISOString(),
  status: r.status as Appointment['status'],
  reason: s(r.reason),
  bookedBy: s(r.booked_by),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  cancelledReason: s(r.cancelled_reason),
  rescheduledFrom: s(r.rescheduled_from),
});

const appointmentRow = (a: Appointment): Row => ({
  id: toDbId(a.id),
  patient_id: toDbId(a.patientId),
  doctor_id: toDbId(a.doctorId),
  facility_id: toDbId(a.facilityId),
  starts_at: a.startsAt,
  ends_at: a.endsAt,
  status: a.status,
  reason: a.reason,
  booked_by: a.bookedBy ? toDbId(a.bookedBy) : null,
  created_at: a.createdAt,
  updated_at: a.updatedAt,
  cancelled_reason: a.cancelledReason,
  rescheduled_from: a.rescheduledFrom ? toDbId(a.rescheduledFrom) : null,
});

const isUniqueViolation = (e: unknown) =>
  e instanceof DbError && (e.status === 409 || (e.detail as { code?: string } | null)?.code === '23505');

export class SupabaseAppointmentsRepository implements AppointmentsRepository {
  private readonly db: RestClient;
  constructor(db: RestClient) {
    this.db = db;
  }

  async getFacility(id: string): Promise<FacilityInfo | null> {
    const r = await this.db.selectOne<Row>('facilities', { id: `eq.${toDbId(id)}` });
    return r ? { id: String(r.id), name: String(r.name), phone: s(r.phone) } : null;
  }

  async listFacilityDoctors(facilityId: string) {
    const rows = await this.db.select<Row>('profiles', { facility_id: `eq.${toDbId(facilityId)}`, role: 'eq.doctor', is_active: 'eq.true' }, { columns: 'id,full_name', order: 'full_name.asc' });
    return rows.map((r) => ({ id: String(r.id), fullName: String(r.full_name) }));
  }

  async listRules(f: { facilityId?: string; doctorId?: string }) {
    const filter: Record<string, string> = {};
    if (f.facilityId) filter.facility_id = `eq.${toDbId(f.facilityId)}`;
    if (f.doctorId) filter.doctor_id = `eq.${toDbId(f.doctorId)}`;
    return (await this.db.select<Row>('doctor_availability', filter, { order: 'created_at.asc' })).map(mapRule);
  }

  async replaceRules(doctorId: string, rules: AvailabilityRule[]) {
    const id = toDbId(doctorId);
    // New rows first, then remove the old ones, so the doctor is never briefly without hours on a failure.
    const inserted = rules.length ? (await this.db.insert<Row>('doctor_availability', rules.map(ruleRow))).map(mapRule) : [];
    const keep = inserted.map((r) => r.id);
    await this.db.delete('doctor_availability', keep.length ? { doctor_id: `eq.${id}`, id: `not.${inList(keep)}` } : { doctor_id: `eq.${id}` });
    return inserted;
  }

  async getAppointment(id: string) {
    const r = await this.db.selectOne<Row>('appointments', { id: `eq.${toDbId(id)}` });
    return r ? mapAppointment(r) : null;
  }

  async listAppointments(f: { doctorIds?: string[]; facilityId?: string; start?: string; end?: string; activeOnly?: boolean }) {
    const filter: Record<string, string> = {};
    if (f.doctorIds) {
      if (!f.doctorIds.length) return [];
      filter.doctor_id = inList(f.doctorIds.map(toDbId));
    }
    if (f.facilityId) filter.facility_id = `eq.${toDbId(f.facilityId)}`;
    if (f.activeOnly) filter.status = 'in.(booked,confirmed)';
    const bounds = [f.start ? `starts_at.gte."${f.start}"` : null, f.end ? `starts_at.lt."${f.end}"` : null].filter(Boolean);
    if (bounds.length) filter.and = `(${bounds.join(',')})`;
    return (await this.db.select<Row>('appointments', filter, { order: 'starts_at.asc', limit: 2000 })).map(mapAppointment);
  }

  async listForPatient(patientId: string) {
    return (await this.db.select<Row>('appointments', { patient_id: `eq.${toDbId(patientId)}` }, { order: 'starts_at.desc', limit: 200 })).map(mapAppointment);
  }

  async insertAppointment(a: Appointment) {
    try {
      const [row] = await this.db.insert<Row>('appointments', appointmentRow(a));
      return mapAppointment(row);
    } catch (e) {
      if (isUniqueViolation(e)) throw new SlotTakenError();
      throw e;
    }
  }

  async updateAppointment(id: string, patch: AppointmentPatch, now: Date) {
    const body: Row = { updated_at: now.toISOString() };
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.cancelledReason !== undefined) body.cancelled_reason = patch.cancelledReason;
    const [row] = await this.db.update<Row>('appointments', { id: `eq.${toDbId(id)}` }, body);
    return row ? mapAppointment(row) : null;
  }
}
