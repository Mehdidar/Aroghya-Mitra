/** The process-wide preventive store: Supabase when configured, else the in-memory demo data. */
import { RestClient, restConfigFromEnv } from '../db/rest.ts';
import { MemoryPreventionRepository, SupabasePreventionRepository, demoPreventionData, type PreventionRepository } from './repository.ts';

let shared: PreventionRepository | null = null;

export function getPreventionRepository(): PreventionRepository {
  if (!shared) {
    const cfg = restConfigFromEnv();
    shared = cfg ? new SupabasePreventionRepository(new RestClient(cfg)) : new MemoryPreventionRepository(demoPreventionData());
  }
  return shared;
}
