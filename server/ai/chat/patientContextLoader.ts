/**
 * The default way POST /ai/chat finds the caller and their record: the same
 * auth as every route (server/http/auth.ts) and the process-wide records
 * repository (Supabase or the in-memory demo). Denied attempts are written to
 * the access log like any other refused record open; the record is never logged.
 */
import { authenticate } from '../../http/auth.ts';
import { getDemoRepository } from '../../records/demoSeed.ts';
import type { RecordsRepository } from '../../records/repository.ts';
import { viewerFor } from '../../records/routes.ts';
import { logAccess } from '../../records/service.ts';
import { dietOnlyContext, loadPatientContext, type DietPreferences, type PatientContextResult } from './patientContext.ts';

export type PatientContextLoader = (req: Request, patientId: string, diet: DietPreferences | null) => Promise<PatientContextResult>;

export function recordsPatientContextLoader(opts: { repo?: () => RecordsRepository; now?: () => Date } = {}): PatientContextLoader {
  return async (req, patientId, diet) => {
    try {
      const caller = await authenticate(req);
      if (!caller) return { status: 'not_permitted', context: dietOnlyContext(diet) };
      const repo = opts.repo?.() ?? getDemoRepository();
      const viewer = await viewerFor(repo, caller);
      const now = opts.now?.() ?? new Date();
      return await loadPatientContext(repo, viewer, patientId, {
        now,
        diet,
        onDenied: async (reason) => void (await logAccess(repo, viewer, patientId, 'direct', 'denied', reason, now)),
      });
    } catch {
      return { status: 'unavailable', context: dietOnlyContext(diet) };
    }
  };
}
