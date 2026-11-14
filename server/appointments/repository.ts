/**
 * Storage for availability and appointments.
 *
 *  - MemoryAppointmentsRepository: tests and the laptop demo. Starts EMPTY: no
 *    availability is seeded, so the demo shows the honest "no times published"
 *    state until a doctor or admin publishes hours in the app.
 *  - SupabaseAppointmentsRepository (supabaseRepository.ts): PostgREST with the
 *    service-role key, chosen when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 *
 * insertAppointment must refuse a second active booking for the same doctor and
 * start time (SlotTakenError); in Postgres that is the partial unique index.
 */
import type { Profile } from '../../packages/shared/types.ts';
import { DEMO_FACILITY } from '../../packages/shared/demo.ts';
import { isActive, type Appointment, type AppointmentStatus, type AvailabilityRule, type FacilityInfo } from './types.ts';

export class SlotTakenError extends Error {
  constructor() {
    super('slot_taken');
    this.name = 'SlotTakenError';
  }
}

export type AppointmentPatch = Partial<Pick<Appointment, 'status' | 'cancelledReason'>>;

export interface AppointmentsRepository {
  getFacility(id: string): Promise<FacilityInfo | null>;
  /** Active doctors registered at a facility. */
  listFacilityDoctors(facilityId: string): Promise<Pick<Profile, 'id' | 'fullName'>[]>;

  listRules(filter: { facilityId?: string; doctorId?: string }): Promise<AvailabilityRule[]>;
  /** Replace every rule of this doctor with `rules` (new ids). */
  replaceRules(doctorId: string, rules: AvailabilityRule[]): Promise<AvailabilityRule[]>;

  getAppointment(id: string): Promise<Appointment | null>;
  /** Appointments starting in [start, end), optionally for some doctors / a facility / only active. */
  listAppointments(filter: { doctorIds?: string[]; facilityId?: string; start?: string; end?: string; activeOnly?: boolean }): Promise<Appointment[]>;
  listForPatient(patientId: string): Promise<Appointment[]>;
  /** Throws SlotTakenError if the doctor already has an active booking at that start time. */
  insertAppointment(a: Appointment): Promise<Appointment>;
  updateAppointment(id: string, patch: AppointmentPatch, now: Date): Promise<Appointment | null>;
}

export interface MemoryAppointmentsData {
  rules: AvailabilityRule[];
  appointments: Appointment[];
  facilities: FacilityInfo[];
}

export class MemoryAppointmentsRepository implements AppointmentsRepository {
  readonly data: MemoryAppointmentsData;
  private readonly profiles: () => Profile[];

  constructor(opts: { data?: Partial<MemoryAppointmentsData>; profiles?: () => Profile[] } = {}) {
    // The demo PHC's phone number is not known, so none is shown (never a made-up number).
    this.data = { rules: [], appointments: [], facilities: [{ id: DEMO_FACILITY.id, name: DEMO_FACILITY.name, phone: null }], ...opts.data };
    this.profiles = opts.profiles ?? (() => []);
  }

  async getFacility(id: string) {
    return this.data.facilities.find((f) => f.id === id) ?? null;
  }

  async listFacilityDoctors(facilityId: string) {
    return this.profiles()
      .filter((p) => p.role === 'doctor' && p.isActive && p.facilityId === facilityId)
      .map((p) => ({ id: p.id, fullName: p.fullName }));
  }

  async listRules(filter: { facilityId?: string; doctorId?: string }) {
    return this.data.rules.filter((r) => (!filter.facilityId || r.facilityId === filter.facilityId) && (!filter.doctorId || r.doctorId === filter.doctorId)).map((r) => ({ ...r }));
  }

  async replaceRules(doctorId: string, rules: AvailabilityRule[]) {
    this.data.rules = [...this.data.rules.filter((r) => r.doctorId !== doctorId), ...rules.map((r) => ({ ...r }))];
    return rules.map((r) => ({ ...r }));
  }

  async getAppointment(id: string) {
    const a = this.data.appointments.find((x) => x.id === id);
    return a ? { ...a } : null;
  }

  async listAppointments(f: { doctorIds?: string[]; facilityId?: string; start?: string; end?: string; activeOnly?: boolean }) {
    const start = f.start ? Date.parse(f.start) : -Infinity;
    const end = f.end ? Date.parse(f.end) : Infinity;
    return this.data.appointments
      .filter((a) => {
        const t = Date.parse(a.startsAt);
        return (!f.doctorIds || f.doctorIds.includes(a.doctorId)) && (!f.facilityId || a.facilityId === f.facilityId) && t >= start && t < end && (!f.activeOnly || isActive(a.status));
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((a) => ({ ...a }));
  }

  async listForPatient(patientId: string) {
    return this.data.appointments.filter((a) => a.patientId === patientId).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map((a) => ({ ...a }));
  }

  // Synchronous check-and-insert (no await in between), so two bookings for one slot cannot both land.
  async insertAppointment(a: Appointment) {
    const clash = this.data.appointments.some((x) => x.doctorId === a.doctorId && x.startsAt === a.startsAt && isActive(x.status));
    if (isActive(a.status) && clash) throw new SlotTakenError();
    this.data.appointments.push({ ...a });
    return { ...a };
  }

  async updateAppointment(id: string, patch: AppointmentPatch, now: Date) {
    const a = this.data.appointments.find((x) => x.id === id);
    if (!a) return null;
    Object.assign(a, patch, { updatedAt: now.toISOString() });
    return { ...a };
  }
}

export type { AppointmentStatus };
