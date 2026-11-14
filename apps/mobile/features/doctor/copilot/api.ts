/**
 * Doctor copilot calls to the server (server/copilot/routes.ts). No keys here:
 * the models run on the server. Every call can fail (offline, old server); the
 * screens then show the on-phone summary or say the feature needs the server.
 */
import type { LanguageCode } from '@am/shared';
import type { LabComparison, LabTest } from '@server/copilot/labs';
import type { ConsultationNoteDraft } from '@server/copilot/notesSchema';
import type { CopilotSummary } from '@server/copilot/summary';

import { apiJson } from '@/features/shared/services/api';

export type Narrative = { text: string | null; reason: string | null; model: string | null; label: string };

export async function fetchSummary(patientId: string, narrative = false): Promise<{ summary: CopilotSummary; narrative: Narrative | null }> {
  const r = await apiJson<{ ok: boolean; summary: CopilotSummary; narrative: Narrative | null }>(`/copilot/summary/${encodeURIComponent(patientId)}${narrative ? '?narrative=1' : ''}`, undefined, { timeoutMs: narrative ? 60_000 : 20_000 });
  return { summary: r.summary, narrative: r.narrative };
}

export async function fetchLabs(patientId: string): Promise<{ comparison: LabComparison; tests: LabTest[] }> {
  return apiJson(`/copilot/labs/${encodeURIComponent(patientId)}`);
}

export type LabEntryRow = { testCode: string; value: number | string; testName?: string; unit?: string };

export async function saveLabs(patientId: string, observedAt: string, results: LabEntryRow[]): Promise<{ comparison: LabComparison }> {
  return apiJson('/copilot/labs', { patientId, observedAt, results });
}

export async function draftNotes(transcript: string, patientId: string, language: LanguageCode): Promise<{ draft: ConsultationNoteDraft; model: string }> {
  return apiJson('/copilot/notes', { transcript, patientId, language }, { timeoutMs: 90_000 });
}
