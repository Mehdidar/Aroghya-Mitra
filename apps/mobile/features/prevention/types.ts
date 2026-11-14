import type { PreventionPerson, PreventionPlan } from '@am/patient-ai/prevention/index';

/** GET /prevention/:patientId (server/prevention/routes.ts). */
export interface PlanResponse {
  ok: true;
  basis: string;
  storage: 'memory' | 'supabase';
  demo: boolean;
  patient: { id: string; name: string };
  person: PreventionPerson;
  plan: PreventionPlan;
  children: { patientId: string; name: string; person: PreventionPerson; plan: PreventionPlan }[];
  canRecord: boolean;
}

export type RecordKind = 'vaccination' | 'growth' | 'screening' | 'pregnancy';

/** One write waiting for POST /prevention/records. `record.id` makes the retry an upsert. */
export interface PendingRecord {
  kind: RecordKind;
  patientId: string;
  record: Record<string, unknown> & { id: string };
  queuedAt: string;
  tries: number;
  /** Set when the server refused it (4xx): kept so the worker sees why, never retried. */
  rejected?: string;
}
