/**
 * Which government health integrations this server has, and whether each is
 * switched on. Reports variable NAMES only, never values. Verdicts and sources
 * are in docs/INTEGRATIONS.md (checked 2026-11-14).
 */
import { abdmConfigFromEnv } from './abdm/config.ts';
import { readEnv } from '../speech/config.ts';

export type Verdict = 'available_with_credentials' | 'partner_onboarding_required' | 'no_public_api' | 'public_data_only';
/** enabled: configured and usable. disabled: built but its variables are unset. misconfigured: set but unusable. not_built: nothing in this server. */
export type State = 'enabled' | 'disabled' | 'misconfigured' | 'not_built';

export interface IntegrationStatus {
  id: 'abdm' | 'esanjeevani' | 'eraktkosh' | 'jan_aushadhi' | 'uwin' | 'digilocker';
  name: string;
  verdict: Verdict;
  state: State;
  /** What this server can actually do today with it. */
  built: string[];
  /** Env variable names still needed (no values). */
  missingEnv?: string[];
  problem?: string;
  note: string;
}

type Read = (name: string) => string | undefined;

export function integrationStatus(read: Read = readEnv): IntegrationStatus[] {
  const abdm = abdmConfigFromEnv(read);
  return [
    {
      id: 'abdm',
      name: 'ABDM / ABHA (sandbox)',
      verdict: 'available_with_credentials',
      state: abdm.config ? 'enabled' : abdm.problem ? 'misconfigured' : 'disabled',
      built: ['gateway session token (sandbox)'],
      ...(abdm.missing.length ? { missingEnv: abdm.missing } : {}),
      ...(abdm.problem ? { problem: abdm.problem } : {}),
      note: 'ABHA verification, HIP/HIU consent flows and HPR/HFR are not built yet; they need the V3 sandbox docs and NHA approval.',
    },
    {
      id: 'esanjeevani',
      name: 'eSanjeevani telemedicine',
      verdict: 'no_public_api',
      state: 'not_built',
      built: [],
      note: 'No published API for third-party apps. The app may link patients to the official eSanjeevani site/app.',
    },
    {
      id: 'eraktkosh',
      name: 'e-RaktKosh blood stock',
      verdict: 'no_public_api',
      state: 'not_built',
      built: [],
      note: 'No published API. Blood bank directory comes from the official GODL dataset (npm run data:blood-banks); live stock is not available.',
    },
    {
      id: 'jan_aushadhi',
      name: 'Jan Aushadhi (PMBJP) product list',
      verdict: 'public_data_only',
      state: 'disabled',
      built: ['CSV importer: node server/scripts/importJanAushadhi.ts'],
      note: 'Official list is published on janaushadhi.gov.in / pmbi.co.in under "All Rights Reserved"; import only with PMBI permission. App still uses its labelled demo table.',
    },
    {
      id: 'uwin',
      name: 'U-WIN immunisation registry',
      verdict: 'no_public_api',
      state: 'not_built',
      built: [],
      note: 'No published third-party API. Vaccination records may reach patients through ABHA once ABDM is live.',
    },
    {
      id: 'digilocker',
      name: 'DigiLocker',
      verdict: 'partner_onboarding_required',
      state: 'not_built',
      built: [],
      note: 'Requester onboarding with MeitY/NeGD (via API Setu) is required before any API access.',
    },
  ];
}
