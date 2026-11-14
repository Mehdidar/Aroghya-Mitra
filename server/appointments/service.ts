/**
 * Appointment rules: who may book, change and see what, and the booking checks.
 *
 *  patient  books, reschedules and cancels their own appointments
 *  asha     the same for patients assigned to them
 *  doctor   books for patients registered at their facility; confirms,
 *           completes, marks no-show at their facility; publishes own hours
 *  admin    as doctor for the facility, and publishes hours for its doctors
 *  inactive accounts: nothing
 *
 * A booking is accepted only for a slot generateSlots() returns right now
 * (published hours, in the future, not taken). The repository's insert is the
 * final guard against two people taking the same slot at once.
 * Mirrors the a5_* policies in supabase/migrations/5201_appointments.sql.
 */
import { DEMO_FACILITY } from '../../packages/shared/demo.ts';
import { newUuid, sameRecord } from '../../packages/shared/ids.ts';
import type { Patient, Profile } from '../../packages/shared/types.ts';
import type { RecordsRepository } from '../records/repository.ts';
import { SlotTakenError, type AppointmentsRepository } from './repository.ts';
import { addDays, datesBetween, findSlot, generateSlots, istDate, isDate, isTime, minutesOf, rangeInstants, TIME_ZONE } from './slots.ts';
import { isActive, type Appointment, type AppointmentView, type AvailabilityRule, type FacilityInfo, type Slot } from './types.ts';

export type Fail = { ok: false; status: number; reason: string };
export type Result<T> = ({ ok: true } & T) | Fail;

const fail = (status: number, reason: string): Fail => ({ ok: false, status, reason });

/** Slots starting sooner than this are not offered or accepted. */
export const MIN_LEAD_MINUTES = 15;
/** How far ahead slots can be listed in one call. */
export const MAX_RANGE_DAYS = 31;
/** A patient may hold at most this many upcoming active appointments. */
export const MAX_UPCOMING_PER_PATIENT = 3;
/**
 * The PHC this deployment serves, used when neither the request nor the
 * caller names a facility (e.g. a patient registered by phone sign-in).
 */
export const HOME_FACILITY_ID = DEMO_FACILITY.id;

export interface AppointmentDeps {
  records: RecordsRepository;
  repo: AppointmentsRepository;
  now: () => Date;
  newId?: () => string;
}

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

export class AppointmentService {
  private readonly d: AppointmentDeps;
  constructor(deps: AppointmentDeps) {
    this.d = deps;
  }

  private id() {
    return (this.d.newId ?? newUuid)();
  }

  // ---------------------------------------------------------------- access

  private async ownPatient(viewer: Profile): Promise<Patient | null> {
    return this.d.records.findPatientByUser(viewer.id);
  }

  /** May this viewer act for this patient (book, see, cancel)? */
  canActForPatient(viewer: Profile, patient: Patient): boolean {
    if (!viewer.isActive) return false;
    switch (viewer.role) {
      case 'patient':
        return patient.userId !== null && patient.userId === viewer.id;
      case 'asha':
        return patient.ashaWorkerId !== null && patient.ashaWorkerId === viewer.id;
      case 'doctor':
      case 'admin':
        return patient.facilityId !== null && patient.facilityId === viewer.facilityId;
      default:
        return false;
    }
  }

  /** May this viewer change this appointment? Staff act on their facility's appointments. */
  private async canActOnAppointment(viewer: Profile, a: Appointment): Promise<boolean> {
    if (!viewer.isActive) return false;
    if (viewer.role === 'doctor' || viewer.role === 'admin') return viewer.facilityId !== null && a.facilityId === viewer.facilityId;
    const patient = await this.d.records.getPatient(a.patientId);
    return !!patient && this.canActForPatient(viewer, patient);
  }

  /** The patient a request is about: the caller's own record, or `patientId` if the caller may act for them. */
  async resolvePatient(viewer: Profile, patientId?: string | null): Promise<Result<{ patient: Patient }>> {
    if (!viewer.isActive) return fail(403, 'inactive_account');
    if (viewer.role === 'patient') {
      const own = await this.ownPatient(viewer);
      if (!own) return fail(404, 'no_patient');
      if (patientId && !sameRecord(patientId, own.id)) return fail(403, 'not_permitted');
      return { ok: true, patient: own };
    }
    if (!patientId) return fail(400, 'patient_required');
    const patient = await this.d.records.getPatient(patientId);
    if (!patient) return fail(404, 'no_patient');
    if (!this.canActForPatient(viewer, patient)) return fail(403, 'not_permitted');
    return { ok: true, patient };
  }

  private async facilityFor(viewer: Profile, requested?: string | null): Promise<string> {
    if (requested) return requested;
    if (viewer.role === 'patient') {
      const own = await this.ownPatient(viewer);
      if (own?.facilityId) return own.facilityId;
    }
    return viewer.facilityId ?? HOME_FACILITY_ID;
  }

  private async facilityInfo(id: string): Promise<FacilityInfo> {
    return (await this.d.repo.getFacility(id)) ?? { id, name: id === DEMO_FACILITY.id ? DEMO_FACILITY.name : '', phone: null };
  }

  // ----------------------------------------------------------------- views

  async views(list: Appointment[], viewer: Profile): Promise<AppointmentView[]> {
    const names = new Map<string, string | null>();
    const patients = new Map<string, string | null>();
    const facilities = new Map<string, FacilityInfo>();
    const out: AppointmentView[] = [];
    const showPatientName = viewer.role !== 'patient';
    for (const a of list) {
      if (!names.has(a.doctorId)) names.set(a.doctorId, (await this.d.records.getProfile(a.doctorId))?.fullName ?? null);
      if (showPatientName && !patients.has(a.patientId)) patients.set(a.patientId, (await this.d.records.getPatient(a.patientId))?.fullName ?? null);
      if (!facilities.has(a.facilityId)) facilities.set(a.facilityId, await this.facilityInfo(a.facilityId));
      const f = facilities.get(a.facilityId)!;
      out.push({ ...a, doctorName: names.get(a.doctorId) ?? null, patientName: showPatientName ? (patients.get(a.patientId) ?? null) : null, facilityName: f.name || null, facilityPhone: f.phone });
    }
    return out;
  }

  // ----------------------------------------------------------------- slots

  async slots(
    viewer: Profile,
    q: { facilityId?: string | null; doctorId?: string | null; from?: string | null; to?: string | null },
  ): Promise<Result<{ facility: FacilityInfo; published: boolean; doctors: { id: string; name: string | null }[]; slots: Slot[]; from: string; to: string; timeZone: string }>> {
    if (!viewer.isActive) return fail(403, 'inactive_account');
    const today = istDate(this.d.now());
    const from = q.from ?? today;
    if (!isDate(from) || (q.to && !isDate(q.to))) return fail(400, 'bad_date');
    const start = from < today ? today : from;
    const to = q.to ?? addDays(start, 13);
    if (to < start) return fail(400, 'bad_date');
    if (datesBetween(start, to).length > MAX_RANGE_DAYS) return fail(400, 'range_too_long');

    const facilityId = await this.facilityFor(viewer, q.facilityId);
    const facility = await this.facilityInfo(facilityId);
    const allRules = await this.d.repo.listRules({ facilityId });
    const rules = q.doctorId ? allRules.filter((r) => sameRecord(r.doctorId, q.doctorId!)) : allRules;
    const doctorIds = [...new Set(rules.map((r) => r.doctorId))];
    const range = rangeInstants(start, to);
    const appointments = doctorIds.length ? await this.d.repo.listAppointments({ doctorIds, start: range.start, end: range.end, activeOnly: true }) : [];
    const slots = generateSlots({ rules, appointments, from: start, to, now: this.d.now(), minLeadMinutes: MIN_LEAD_MINUTES });
    const doctors = [];
    for (const id of doctorIds) doctors.push({ id, name: (await this.d.records.getProfile(id))?.fullName ?? null });
    return { ok: true, facility, published: allRules.length > 0, doctors, slots, from: start, to, timeZone: TIME_ZONE };
  }

  /** The free slot at exactly this start for this doctor, checked against live data. */
  private async liveSlot(doctorId: string, startsAt: string, ignoreAppointmentId?: string): Promise<Slot | null> {
    const t = Date.parse(startsAt);
    if (Number.isNaN(t)) return null;
    const date = istDate(new Date(t));
    const rules = await this.d.repo.listRules({ doctorId });
    const range = rangeInstants(date, date);
    const appointments = (await this.d.repo.listAppointments({ doctorIds: [doctorId], start: range.start, end: range.end, activeOnly: true })).filter((a) => a.id !== ignoreAppointmentId);
    return findSlot({ rules, appointments, now: this.d.now(), doctorId, startsAt, minLeadMinutes: MIN_LEAD_MINUTES });
  }

  private async patientClash(patientId: string, slot: Slot, ignoreId?: string): Promise<Fail | null> {
    const now = this.d.now().getTime();
    const mine = (await this.d.repo.listForPatient(patientId)).filter((a) => isActive(a.status) && a.id !== ignoreId);
    const s = Date.parse(slot.startsAt);
    const e = Date.parse(slot.endsAt);
    if (mine.some((a) => Date.parse(a.startsAt) < e && s < Date.parse(a.endsAt))) return fail(409, 'patient_busy');
    if (mine.filter((a) => Date.parse(a.endsAt) > now).length >= MAX_UPCOMING_PER_PATIENT) return fail(409, 'too_many');
    return null;
  }

  // --------------------------------------------------------------- booking

  async book(viewer: Profile, body: { patientId?: unknown; doctorId?: unknown; startsAt?: unknown; reason?: unknown }): Promise<Result<{ appointment: AppointmentView }>> {
    if (typeof body.doctorId !== 'string' || typeof body.startsAt !== 'string') return fail(400, 'bad_request');
    const who = await this.resolvePatient(viewer, typeof body.patientId === 'string' ? body.patientId : null);
    if (!who.ok) return who;
    const doctor = await this.d.records.getProfile(body.doctorId);
    if (!doctor || doctor.role !== 'doctor' || !doctor.isActive) return fail(404, 'no_doctor');
    const slot = await this.liveSlot(doctor.id, body.startsAt);
    if (!slot) return fail(409, 'slot_unavailable');
    if ((viewer.role === 'doctor' || viewer.role === 'admin') && slot.facilityId !== viewer.facilityId) return fail(403, 'not_permitted');
    const clash = await this.patientClash(who.patient.id, slot);
    if (clash) return clash;
    const now = this.d.now().toISOString();
    const appt: Appointment = {
      id: this.id(),
      patientId: who.patient.id,
      doctorId: doctor.id,
      facilityId: slot.facilityId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: 'booked',
      reason: cleanText(body.reason, 500),
      bookedBy: viewer.id,
      createdAt: now,
      updatedAt: now,
      cancelledReason: null,
      rescheduledFrom: null,
    };
    try {
      const saved = await this.d.repo.insertAppointment(appt);
      return { ok: true, appointment: (await this.views([saved], viewer))[0] };
    } catch (e) {
      if (e instanceof SlotTakenError) return fail(409, 'slot_taken');
      throw e;
    }
  }

  private async loadForChange(viewer: Profile, id: string): Promise<Result<{ appt: Appointment }>> {
    if (!viewer.isActive) return fail(403, 'inactive_account');
    const appt = await this.d.repo.getAppointment(id);
    if (!appt) return fail(404, 'not_found');
    if (!(await this.canActOnAppointment(viewer, appt))) return fail(403, 'not_permitted');
    return { ok: true, appt };
  }

  /** A new appointment at the new time (rescheduled_from = old); the old one is cancelled, which frees its slot. */
  async reschedule(viewer: Profile, id: string, body: { startsAt?: unknown; doctorId?: unknown }): Promise<Result<{ appointment: AppointmentView; previous: AppointmentView }>> {
    if (typeof body.startsAt !== 'string') return fail(400, 'bad_request');
    const got = await this.loadForChange(viewer, id);
    if (!got.ok) return got;
    const old = got.appt;
    if (!isActive(old.status)) return fail(409, 'not_active');
    if ((viewer.role === 'patient' || viewer.role === 'asha') && Date.parse(old.startsAt) <= this.d.now().getTime()) return fail(409, 'too_late');
    const doctorId = typeof body.doctorId === 'string' ? body.doctorId : old.doctorId;
    if (doctorId === old.doctorId && new Date(body.startsAt).getTime() === Date.parse(old.startsAt)) return fail(409, 'same_slot');
    const slot = await this.liveSlot(doctorId, body.startsAt, old.id);
    if (!slot) return fail(409, 'slot_unavailable');
    if ((viewer.role === 'doctor' || viewer.role === 'admin') && slot.facilityId !== viewer.facilityId) return fail(403, 'not_permitted');
    const clash = await this.patientClash(old.patientId, slot, old.id);
    if (clash) return clash;
    const now = this.d.now();
    const next: Appointment = {
      ...old,
      id: this.id(),
      doctorId,
      facilityId: slot.facilityId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: 'booked',
      bookedBy: viewer.id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      cancelledReason: null,
      rescheduledFrom: old.id,
    };
    let saved: Appointment;
    try {
      saved = await this.d.repo.insertAppointment(next);
    } catch (e) {
      if (e instanceof SlotTakenError) return fail(409, 'slot_taken');
      throw e;
    }
    const prev = (await this.d.repo.updateAppointment(old.id, { status: 'cancelled', cancelledReason: 'rescheduled' }, now)) ?? old;
    const [a, p] = await this.views([saved, prev], viewer);
    return { ok: true, appointment: a, previous: p };
  }

  async cancel(viewer: Profile, id: string, body: { reason?: unknown }): Promise<Result<{ appointment: AppointmentView }>> {
    const got = await this.loadForChange(viewer, id);
    if (!got.ok) return got;
    if (!isActive(got.appt.status)) return fail(409, 'not_active');
    if ((viewer.role === 'patient' || viewer.role === 'asha') && Date.parse(got.appt.startsAt) <= this.d.now().getTime()) return fail(409, 'too_late');
    const updated = await this.d.repo.updateAppointment(id, { status: 'cancelled', cancelledReason: cleanText(body.reason, 300) }, this.d.now());
    if (!updated) return fail(404, 'not_found');
    return { ok: true, appointment: (await this.views([updated], viewer))[0] };
  }

  /** Doctor / admin: confirm (booked → confirmed), complete, or mark no-show (only once the time has come). */
  async setStatus(viewer: Profile, id: string, to: 'confirmed' | 'completed' | 'no_show'): Promise<Result<{ appointment: AppointmentView }>> {
    if (viewer.role !== 'doctor' && viewer.role !== 'admin') return fail(403, 'not_permitted');
    const got = await this.loadForChange(viewer, id);
    if (!got.ok) return got;
    const a = got.appt;
    const allowed = to === 'confirmed' ? a.status === 'booked' : isActive(a.status);
    if (!allowed) return fail(409, 'not_active');
    if (to === 'no_show' && Date.parse(a.startsAt) > this.d.now().getTime()) return fail(409, 'too_early');
    const updated = await this.d.repo.updateAppointment(id, { status: to }, this.d.now());
    if (!updated) return fail(404, 'not_found');
    return { ok: true, appointment: (await this.views([updated], viewer))[0] };
  }

  // ---------------------------------------------------------------- lists

  async mine(viewer: Profile, patientId?: string | null): Promise<Result<{ patientId: string; appointments: AppointmentView[] }>> {
    const who = await this.resolvePatient(viewer, patientId);
    if (!who.ok) return who;
    const list = await this.d.repo.listForPatient(who.patient.id);
    return { ok: true, patientId: who.patient.id, appointments: await this.views(list, viewer) };
  }

  /** Doctor: their own day (or a colleague's at the same facility). Admin: the whole facility, or one doctor. */
  async doctorDay(viewer: Profile, q: { date?: string | null; doctorId?: string | null }): Promise<Result<{ date: string; appointments: AppointmentView[] }>> {
    if (!viewer.isActive) return fail(403, 'inactive_account');
    if (viewer.role !== 'doctor' && viewer.role !== 'admin') return fail(403, 'not_permitted');
    if (!viewer.facilityId) return fail(403, 'no_facility');
    const date = q.date ?? istDate(this.d.now());
    if (!isDate(date)) return fail(400, 'bad_date');
    const range = rangeInstants(date, date);
    const doctorIds = q.doctorId ? [q.doctorId] : viewer.role === 'doctor' ? [viewer.id] : undefined;
    const list = await this.d.repo.listAppointments({ doctorIds, facilityId: viewer.facilityId, start: range.start, end: range.end });
    return { ok: true, date, appointments: await this.views(list, viewer) };
  }

  // ---------------------------------------------------------- availability

  async getAvailability(viewer: Profile, q: { doctorId?: string | null; facilityId?: string | null }): Promise<Result<{ facility: FacilityInfo; doctors: { id: string; name: string }[]; rules: AvailabilityRule[]; timeZone: string }>> {
    if (!viewer.isActive) return fail(403, 'inactive_account');
    const facilityId = await this.facilityFor(viewer, q.facilityId);
    const facility = await this.facilityInfo(facilityId);
    const rules = await this.d.repo.listRules({ facilityId, doctorId: q.doctorId ?? undefined });
    const staff = (viewer.role === 'doctor' || viewer.role === 'admin') && viewer.facilityId === facilityId;
    const doctors = staff
      ? (await this.d.repo.listFacilityDoctors(facilityId)).map((d) => ({ id: d.id, name: d.fullName }))
      : [];
    return { ok: true, facility, doctors, rules, timeZone: TIME_ZONE };
  }

  async putAvailability(viewer: Profile, body: unknown): Promise<Result<{ doctorId: string; rules: AvailabilityRule[] }>> {
    if (!viewer.isActive) return fail(403, 'inactive_account');
    if (viewer.role !== 'doctor' && viewer.role !== 'admin') return fail(403, 'not_permitted');
    const b = (body ?? {}) as { doctorId?: unknown; slotMinutes?: unknown; weekly?: unknown; exceptions?: unknown; validFrom?: unknown; validTo?: unknown };
    const doctorId = typeof b.doctorId === 'string' ? b.doctorId : viewer.role === 'doctor' ? viewer.id : null;
    if (!doctorId) return fail(400, 'doctor_required');
    if (viewer.role === 'doctor' && !sameRecord(doctorId, viewer.id)) return fail(403, 'not_permitted');
    const doctor = await this.d.records.getProfile(doctorId);
    if (!doctor || doctor.role !== 'doctor' || !doctor.isActive) return fail(404, 'no_doctor');
    if (!doctor.facilityId) return fail(400, 'no_facility');
    if (viewer.role === 'admin' && doctor.facilityId !== viewer.facilityId) return fail(403, 'not_permitted');

    const parsed = parseAvailability(b, { doctorId: doctor.id, facilityId: doctor.facilityId, createdBy: viewer.id, now: this.d.now(), newId: () => this.id() });
    if (!parsed.ok) return parsed;
    const rules = await this.d.repo.replaceRules(doctor.id, parsed.rules);
    return { ok: true, doctorId: doctor.id, rules };
  }
}

const slotLen = (v: unknown, dflt: number): number | null => {
  if (v === undefined || v === null) return dflt;
  const n = Number(v);
  return Number.isInteger(n) && n >= 5 && n <= 240 ? n : null;
};

/**
 * Validate a PUT /availability body:
 *   { slotMinutes?: 15,
 *     weekly: [{ weekday: 1, start: '09:00', end: '13:00', slotMinutes? }],
 *     exceptions: [{ date: '2026-12-25', closed: true } | { date, start, end, slotMinutes? }],
 *     validFrom?: 'YYYY-MM-DD', validTo?: 'YYYY-MM-DD' }
 * An empty weekly + exceptions list removes all the doctor's hours.
 */
export function parseAvailability(
  b: { slotMinutes?: unknown; weekly?: unknown; exceptions?: unknown; validFrom?: unknown; validTo?: unknown },
  ctx: { doctorId: string; facilityId: string; createdBy: string; now: Date; newId: () => string },
): Result<{ rules: AvailabilityRule[] }> {
  const dflt = slotLen(b.slotMinutes, 15);
  if (dflt === null) return fail(400, 'bad_slot_length');
  const weekly = Array.isArray(b.weekly) ? b.weekly : b.weekly === undefined ? [] : null;
  const exceptions = Array.isArray(b.exceptions) ? b.exceptions : b.exceptions === undefined ? [] : null;
  if (!weekly || !exceptions) return fail(400, 'bad_request');
  if (weekly.length + exceptions.length > 100) return fail(400, 'too_many_rules');
  const validFrom = b.validFrom === undefined || b.validFrom === null ? null : b.validFrom;
  const validTo = b.validTo === undefined || b.validTo === null ? null : b.validTo;
  if ((validFrom !== null && !isDate(validFrom)) || (validTo !== null && !isDate(validTo)) || (validFrom && validTo && validFrom > validTo)) return fail(400, 'bad_date');
  const base = { doctorId: ctx.doctorId, facilityId: ctx.facilityId, validFrom: validFrom as string | null, validTo: validTo as string | null, createdBy: ctx.createdBy, createdAt: ctx.now.toISOString() };
  const window = (w: { start?: unknown; end?: unknown }) => isTime(w.start) && isTime(w.end) && minutesOf(w.start) < minutesOf(w.end);
  const rules: AvailabilityRule[] = [];
  for (const raw of weekly as { weekday?: unknown; start?: unknown; end?: unknown; slotMinutes?: unknown }[]) {
    const wd = Number(raw?.weekday);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) return fail(400, 'bad_weekday');
    if (!window(raw)) return fail(400, 'bad_time');
    const len = slotLen(raw.slotMinutes, dflt);
    if (len === null) return fail(400, 'bad_slot_length');
    if (minutesOf(raw.end as string) - minutesOf(raw.start as string) < len) return fail(400, 'window_too_short');
    rules.push({ ...base, id: ctx.newId(), weekday: wd, specificDate: null, closed: false, startTime: raw.start as string, endTime: raw.end as string, slotMinutes: len });
  }
  for (const raw of exceptions as { date?: unknown; closed?: unknown; start?: unknown; end?: unknown; slotMinutes?: unknown }[]) {
    if (!isDate(raw?.date)) return fail(400, 'bad_date');
    if (raw.closed === true) {
      rules.push({ ...base, id: ctx.newId(), weekday: null, specificDate: raw.date, closed: true, startTime: null, endTime: null, slotMinutes: dflt });
      continue;
    }
    if (!window(raw)) return fail(400, 'bad_time');
    const len = slotLen(raw.slotMinutes, dflt);
    if (len === null) return fail(400, 'bad_slot_length');
    if (minutesOf(raw.end as string) - minutesOf(raw.start as string) < len) return fail(400, 'window_too_short');
    rules.push({ ...base, id: ctx.newId(), weekday: null, specificDate: raw.date, closed: false, startTime: raw.start as string, endTime: raw.end as string, slotMinutes: len });
  }
  return { ok: true, rules };
}
