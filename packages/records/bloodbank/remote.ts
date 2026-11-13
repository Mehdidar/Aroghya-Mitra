/**
 * Blood banks from the server (GET /blood-banks): the official directory rows
 * imported into Supabase. Falls back to the labelled demo provider when the
 * server has none (not configured, nothing imported, or offline).
 *
 * The directory has no stock levels, so directory banks usually have no stock
 * rows; the service then lists them by distance and the screen says
 * "call to check stock" instead of showing a number.
 */
import { MockBloodBankProvider, type BloodBankProvider } from './service.ts';
import type { BloodBank, DataSource, StockEntry } from './types.ts';

export type BloodBankPayload = { ok: boolean; banks: BloodBank[]; stock: Record<string, StockEntry[]> };

export class RemoteBloodBankProvider implements BloodBankProvider {
  source: DataSource = 'mock';
  private loaded: Promise<void> | null = null;
  private banks: BloodBank[] = [];
  private stock: Record<string, StockEntry[]> = {};
  private readonly fallback = new MockBloodBankProvider();
  private readonly load: () => Promise<BloodBankPayload | null>;

  constructor(load: () => Promise<BloodBankPayload | null>) {
    this.load = load;
  }

  private ready() {
    if (!this.loaded) {
      this.loaded = this.load()
        .then((p) => {
          if (p?.ok && p.banks.length) {
            this.banks = p.banks;
            this.stock = p.stock ?? {};
            this.source = 'supabase';
          }
        })
        .catch(() => undefined);
    }
    return this.loaded;
  }

  async listBanks() {
    await this.ready();
    return this.source === 'supabase' ? this.banks : this.fallback.listBanks();
  }

  async getStock(bankId: string) {
    await this.ready();
    return this.source === 'supabase' ? (this.stock[bankId] ?? []) : this.fallback.getStock(bankId);
  }

  async setStock(bankId: string, entries: Omit<StockEntry, 'updatedAt'>[], now: Date) {
    await this.ready();
    if (this.source === 'supabase') throw new Error('Directory stock is read-only in the app');
    return this.fallback.setStock(bankId, entries, now);
  }
}
