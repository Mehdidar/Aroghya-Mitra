/**
 * ASHA connect calls (server/ashaConnect/routes.ts). Every call returns
 * { ok: true, ... } or { ok: false, reason } and never throws for HTTP errors;
 * a network failure gives reason 'offline'.
 *
 * Reasons the UI should handle: offline, no_asha, no_patient, not_permitted,
 * forbidden_role, area_required, empty, when_required, date_required, closed,
 * backwards, consent_off, expired, invalid, malformed, not_aroghya_qr,
 * token_already_used, inactive_account, assigned_to_other, scan_first, asha_inactive.
 */
import { ApiError, apiFetch, apiJson } from '@/features/shared/services/api';

import type { AshaCard, AshaLoad, AshaMessage, MessageKind, PatientAssignment, RequestStatus, ScanSummary, VisitWhen } from './types';

export type Failure = { ok: false; reason: string };
export type Result<T> = ({ ok: true } & T) | Failure;

export type EmergencyInfo = { categories: string[]; contacts: { number: string; labelKey: string }[] };

async function call<T>(path: string, init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<Result<T>> {
  try {
    if (init.method === 'PUT') {
      const res = await apiFetch(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body ?? {}) });
      return (await res.json()) as Result<T>;
    }
    return await apiJson<Result<T>>(path, init.method === 'GET' ? undefined : (init.body ?? {}));
  } catch (e) {
    if (e instanceof ApiError) {
      const reason = (e.body as { reason?: string } | null)?.reason;
      return { ok: false, reason: reason ?? `http_${e.status}` };
    }
    return { ok: false, reason: 'offline' };
  }
}

const qs = (p: Record<string, string | null | undefined>) => {
  const s = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : '';
};

export type MyAsha = { patientId: string; area: string | null; asha: AshaCard | null; waitingSince: string | null; method?: 'area_match' | 'waiting' };

// -------------------------------------------------------------- patient
export const getMyAsha = (patientId?: string) => call<MyAsha>(`/asha/connect/mine${qs({ patientId })}`, { method: 'GET' });
export const findMyAsha = (area: string, patientId?: string) => call<MyAsha>('/asha/connect/find', { body: { area, patientId } });

// -------------------------------------------------------------- messages (patient and ASHA)
export const listMessages = (q: { patientId?: string; since?: string } = {}) => call<{ serverTime: string; messages: AshaMessage[] }>(`/asha/messages${qs(q)}`, { method: 'GET' });
export const sendMessage = (m: { patientId?: string; kind: MessageKind; body: string; visitWhen?: VisitWhen }) => call<{ message: AshaMessage; emergency: EmergencyInfo | null }>('/asha/messages', { body: m });
export const markThreadRead = (patientId?: string) => call<{ read: number }>('/asha/messages/read', { body: { patientId } });
/** ASHA: accept (with scheduledFor ISO for visit requests), decline or complete a request. */
export const setRequestStatus = (id: string, status: Exclude<RequestStatus, 'open'>, scheduledFor?: string) =>
  call<{ message: AshaMessage }>(`/asha/messages/${encodeURIComponent(id)}/status`, { body: { status, scheduledFor } });

// -------------------------------------------------------------- ASHA scan
export type ScanResult = { patientId: string; summary: ScanSummary; assignment: 'mine' | 'other' | 'none'; canAdd: boolean };
export const scanPatientCard = (payload: string) => call<ScanResult>('/asha/scan', { body: { payload } });
export const addScannedPatient = (patientId: string) => call<{ patientId: string; added: boolean }>('/asha/scan/add', { body: { patientId } });

// -------------------------------------------------------------- admin
export type Board = { canEdit: boolean; ashas: AshaLoad[]; patients: PatientAssignment[] };
export const getAssignmentBoard = () => call<Board>('/asha/assignments', { method: 'GET' });
export const assignPatient = (patientId: string, ashaId: string | null, reason?: string) => call<{ patientId: string; ashaId: string | null }>('/asha/assign', { body: { patientId, ashaId, reason } });
export const setAshaAreas = (ashaId: string, areas: string[]) => call<{ ashaId: string; areas: string[] }>('/asha/areas', { method: 'PUT', body: { ashaId, areas } });

/** Unread messages from the other side. */
export const unreadCount = (messages: AshaMessage[], reader: 'patient' | 'asha') => messages.filter((m) => m.from !== reader && !m.readAt).length;
