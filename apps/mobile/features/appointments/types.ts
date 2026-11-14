/**
 * The app's copy of the appointment shapes the server returns
 * (server/appointments/types.ts). Times are ISO instants; availability
 * windows are 'HH:MM' in India time (Asia/Kolkata).
 */
export type AppointmentStatus = 'booked' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

export const isActiveStatus = (s: AppointmentStatus) => s === 'booked' || s === 'confirmed';

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
  doctorName: string | null;
  patientName: string | null;
  facilityName: string | null;
  facilityPhone: string | null;
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
  phone: string | null;
}

export interface SlotsResponse {
  ok: true;
  facility: FacilityInfo;
  /** False when no doctor at this PHC has published any hours: show the honest empty state. */
  published: boolean;
  doctors: { id: string; name: string | null }[];
  slots: Slot[];
  from: string;
  to: string;
  timeZone: string;
}

export interface AvailabilityRule {
  id: string;
  doctorId: string;
  facilityId: string;
  weekday: number | null;
  specificDate: string | null;
  closed: boolean;
  startTime: string | null;
  endTime: string | null;
  slotMinutes: number;
  validFrom: string | null;
  validTo: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AvailabilityResponse {
  ok: true;
  facility: FacilityInfo;
  doctors: { id: string; name: string }[];
  rules: AvailabilityRule[];
  timeZone: string;
}

/** Body of PUT /availability. */
export interface AvailabilityInput {
  doctorId?: string;
  slotMinutes: number;
  weekly: { weekday: number; start: string; end: string }[];
  exceptions: ({ date: string; closed: true } | { date: string; start: string; end: string })[];
  validFrom?: string | null;
}
