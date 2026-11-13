/**
 * Bridge from the ASHA module's offline store to the doctor's inbox on the
 * same device: a referral Sunita creates in the ASHA screens shows up in
 * Dr Rao's inbox without a server round trip. (With a server, the same rows
 * arrive through /asha/sync and the records store.)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEMO_FACILITY, DEMO_IDS, type RecordReferral, type RecordRiskAlert, type Referral, type RiskAlert } from '@am/shared';

import { DB_KEY } from '@/features/asha/store/store';

type AshaDbShape = { referrals?: Record<string, Referral>; alerts?: Record<string, RiskAlert>; patients?: Record<string, { id: string; name: string }> };

export function toRecordReferral(r: Referral): RecordReferral {
  return {
    id: r.id,
    patientId: r.patientId,
    fromAshaId: r.fromAshaId,
    toDoctorId: r.toDoctorId ?? DEMO_IDS.doctor,
    toFacilityId: DEMO_FACILITY.id,
    reason: r.reason,
    riskAlertId: r.alertIds[0] ?? null,
    status: r.status,
    createdAt: r.createdAt,
    seenAt: r.status === 'pending' ? null : r.updatedAt,
    acceptedAt: r.status === 'accepted' || r.status === 'closed' ? r.updatedAt : null,
  };
}

export function toRecordAlert(a: RiskAlert, ashaId: string): RecordRiskAlert {
  return {
    id: a.id,
    patientId: a.patientId,
    ashaWorkerId: ashaId,
    level: a.severity === 'critical' || a.severity === 'high' ? 'high' : 'medium',
    reason: a.reason,
    createdAt: a.createdAt,
    resolvedAt: a.acknowledged ? a.createdAt : null,
  };
}

export type AshaBridgeData = { referrals: RecordReferral[]; alerts: RecordRiskAlert[]; patientNames: Record<string, string> };

/** Read the ASHA module's store. Empty when the ASHA app has never run on this device. */
export async function loadAshaBridge(storage: Pick<typeof AsyncStorage, 'getItem'> = AsyncStorage): Promise<AshaBridgeData> {
  const empty: AshaBridgeData = { referrals: [], alerts: [], patientNames: {} };
  try {
    const raw = await storage.getItem(DB_KEY);
    if (!raw) return empty;
    const db = JSON.parse(raw) as AshaDbShape;
    const referrals = Object.values(db.referrals ?? {}).map(toRecordReferral);
    const alerts = Object.values(db.alerts ?? {}).map((a) => toRecordAlert(a, referrals.find((r) => r.patientId === a.patientId)?.fromAshaId ?? DEMO_IDS.asha));
    const patientNames = Object.fromEntries(Object.values(db.patients ?? {}).map((p) => [p.id, p.name]));
    return { referrals, alerts, patientNames };
  } catch {
    return empty;
  }
}

/** Store rows win over bridge rows with the same id (the doctor's own status changes stick). */
export function mergeReferrals(fromStore: RecordReferral[], fromAsha: RecordReferral[]): RecordReferral[] {
  const seen = new Set(fromStore.map((r) => r.id));
  return [...fromStore, ...fromAsha.filter((r) => !seen.has(r.id))];
}
