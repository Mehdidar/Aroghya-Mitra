/**
 * Appointment calls to the server (server/appointments/routes.ts).
 *
 * Booking is online only: slots are live, so nothing here is queued for later.
 * A network failure becomes { kind: 'offline' } and the screen says so.
 */
import { ApiError, apiJson } from '@/features/shared/services/api';

import type { Appointment, AvailabilityInput, AvailabilityResponse, AvailabilityRule, SlotsResponse } from './types';

export type AppointmentError = { kind: 'offline' } | { kind: 'server'; status: number; reason: string };

export function classifyError(e: unknown): AppointmentError {
  if (e instanceof ApiError) {
    const reason = (e.body as { reason?: unknown } | null)?.reason;
    return { kind: 'server', status: e.status, reason: typeof reason === 'string' ? reason : 'generic' };
  }
  // fetch rejects (no network, DNS, timeout abort) before any HTTP status exists.
  return { kind: 'offline' };
}

const qs = (q: Record<string, string | null | undefined>) => {
  const p = Object.entries(q).filter(([, v]) => v) as [string, string][];
  return p.length ? `?${p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
};

const TIMEOUT = { timeoutMs: 12_000 };

export const appointmentsApi = {
  slots: (q: { facilityId?: string | null; doctorId?: string | null; from?: string; to?: string } = {}) =>
    apiJson<SlotsResponse>(`/appointments/slots${qs(q)}`, undefined, TIMEOUT),
  mine: (patientId?: string | null) => apiJson<{ ok: true; patientId: string; appointments: Appointment[] }>(`/appointments/mine${qs({ patientId })}`, undefined, TIMEOUT),
  book: (body: { patientId?: string | null; doctorId: string; startsAt: string; reason?: string | null }) =>
    apiJson<{ ok: true; appointment: Appointment }>('/appointments', body, TIMEOUT),
  reschedule: (id: string, body: { startsAt: string; doctorId?: string }) =>
    apiJson<{ ok: true; appointment: Appointment; previous: Appointment }>(`/appointments/${encodeURIComponent(id)}/reschedule`, body, TIMEOUT),
  cancel: (id: string, reason?: string) => apiJson<{ ok: true; appointment: Appointment }>(`/appointments/${encodeURIComponent(id)}/cancel`, { reason: reason ?? null }, TIMEOUT),
  setStatus: (id: string, action: 'confirm' | 'complete' | 'no-show') => apiJson<{ ok: true; appointment: Appointment }>(`/appointments/${encodeURIComponent(id)}/${action}`, {}, TIMEOUT),
  doctorDay: (date: string, doctorId?: string | null) => apiJson<{ ok: true; date: string; appointments: Appointment[] }>(`/appointments/doctor${qs({ date, doctorId })}`, undefined, TIMEOUT),
  availability: (q: { doctorId?: string | null } = {}) => apiJson<AvailabilityResponse>(`/availability${qs(q)}`, undefined, TIMEOUT),
  publish: (body: AvailabilityInput) => apiJson<{ ok: true; doctorId: string; rules: AvailabilityRule[] }>('/availability', body, { ...TIMEOUT, method: 'PUT' }),
};
