/**
 * e-RaktKosh: findings and adapter slot.
 *
 * Checked 2026-11-13:
 *  - e-RaktKosh (https://eraktkosh.mohfw.gov.in) shows stock through a public
 *    search form (state → district → blood group → component). Results list the
 *    bank, category, availability, last-updated time and type.
 *  - There is no documented public API, no API key programme and no open-data
 *    export. The form calls undocumented internal endpoints that can change
 *    without notice and are not CORS-enabled, so a phone app cannot call them.
 *
 * Decision: the app ships with mock Bengaluru data (`data/bengaluru.mock.ts`)
 * behind `BloodBankService`. To use live data later, run a server-side proxy
 * (Supabase Edge Function on a schedule) that fetches e-RaktKosh results for
 * Karnataka/Bengaluru Urban, upserts them into the `blood_stock` table, and
 * point the app at a Supabase-backed provider. Check e-RaktKosh's terms of use
 * before scraping, and prefer asking NHM Karnataka / NBTC for a data feed.
 */
import type { BloodBankProvider } from './service.ts';

export class ERaktKoshUnavailableError extends Error {
  constructor() {
    super('e-RaktKosh has no public API; use MockBloodBankProvider or a Supabase-backed provider.');
    this.name = 'ERaktKoshUnavailableError';
  }
}

/** Placeholder so the source can be selected in config; always refuses. */
export const eRaktKoshProvider: BloodBankProvider = {
  source: 'eraktkosh',
  listBanks: () => Promise.reject(new ERaktKoshUnavailableError()),
  getStock: () => Promise.reject(new ERaktKoshUnavailableError()),
  setStock: () => Promise.reject(new ERaktKoshUnavailableError()),
};
