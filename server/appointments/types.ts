/**
 * PHC appointments: published doctor availability and booked appointments.
 * Mirrors supabase/migrations/5201_appointments.sql.
 *
 * Times: `startsAt` / `endsAt` are ISO instants (UTC). Availability windows are
 * wall-clock times ('HH:MM') in the PHC's time zone, Asia/Kolkata (IST, UTC+05:30,
 * no daylight saving). Dates ('YYYY-MM-DD') are IST calendar dates.
 */

export type AppointmentStatus = 'booked' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

/** Statuses that hold a slot. */
export const ACTIVE_STATUSES: readonly AppointmentStatus[] = ['booked', 'confirmed'];
export const isActive = (s: AppointmentStatus) => s === 'booked' || s === 'confirmed';

/**
 * One availability row: weekly hours (weekday set) or a date exception
 * (specificDate set). A date exception replaces that day's weekly hours; a
 * closed exception (closed: true) means no slots that day.
 */
export interface AvailabilityRule {
  id: string;
  doctorId: string;
  facilityId: string;
  /** 0 = Sunday … 6 = Saturday (IST). Null for a date exception. */
  weekday: number | null;
  /** 'YYYY-MM-DD' (IST). Null for weekly hours. */
  specificDate: string | null;
  closed: boolean;
  /** 'HH:MM' IST. Null only for a closed exception. */
  startTime: string | null;
  endTime: string | null;
  slotMinutes: number;
  validFrom: string | null;
  validTo: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  facilityId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  reason: string | null;
  bookedBy: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledReason: string | null;
  rescheduledFrom: string | null;
}

export interface Slot {
  doctorId: string;
  facilityId: string;
  startsAt: string;
  endsAt: string;
}

export interface FacilityInfo {
  id: string;
  name: string;
  /** Null when the PHC's number is not known: the app then shows no number. */
  phone: string | null;
}

/** What the app shows for one appointment (names resolved by the server). */
export interface AppointmentView extends Appointment {
  doctorName: string | null;
  patientName: string | null;
  facilityName: string | null;
  facilityPhone: string | null;
}
