/**
 * Resolve a scanned QR payload to a patient. Online: POST /qr/scan (Fork B's
 * contract). Offline, or for the demo payload, resolve locally from the
 * records store so the doctor's flow works without a server.
 */
import { DEMO_IDS } from '@am/shared';

import { useRecords } from '@/features/shared/data/recordsStore';
import { ApiError, apiJson, serverReachable } from '@/features/shared/services/api';

export const DEMO_PAYLOAD_PREFIX = 'AM1.demo.';
export const demoPayload = (patientId: string = DEMO_IDS.patientRecord) => `${DEMO_PAYLOAD_PREFIX}${patientId}`;

export type ScanResolution =
  | { ok: true; patientId: string; via: 'server' | 'local'; message?: string }
  | { ok: false; reason: 'invalid' | 'denied' | 'not_found' | 'server'; message?: string };

type ServerScan = { ok: true; patientId: string } | { ok: false; reason?: string; message?: string };

export async function resolveScan(payload: string, fetchImpl?: typeof fetch): Promise<ScanResolution> {
  const text = payload.trim();
  if (!text) return { ok: false, reason: 'invalid' };
  const local = (patientId: string): ScanResolution =>
    useRecords.getState().patients[patientId] ? { ok: true, patientId, via: 'local' } : { ok: false, reason: 'not_found' };

  if (text.startsWith(DEMO_PAYLOAD_PREFIX)) return local(text.slice(DEMO_PAYLOAD_PREFIX.length));
  if (!text.startsWith('AM1.')) return { ok: false, reason: 'invalid' };

  if (!(await serverReachable(fetchImpl))) return { ok: false, reason: 'server', message: 'offline' };
  try {
    const r = await apiJson<ServerScan>('/qr/scan', { payload: text }, { fetchImpl });
    if (r.ok) {
      if (!useRecords.getState().patients[r.patientId]) return { ok: true, patientId: r.patientId, via: 'server' };
      return { ok: true, patientId: r.patientId, via: 'server' };
    }
    return { ok: false, reason: r.reason === 'expired' || r.reason === 'invalid' ? 'invalid' : 'denied', message: r.message };
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return { ok: false, reason: 'denied' };
    return { ok: false, reason: 'server' };
  }
}
