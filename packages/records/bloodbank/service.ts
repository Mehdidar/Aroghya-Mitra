/**
 * BloodBankService: one interface for the blood bank finder, whatever the source.
 *
 *   createBloodBankService()          → mock Bengaluru data (default today)
 *   createBloodBankService(provider)  → any provider (Supabase table, e-RaktKosh proxy)
 *
 * The finder screen only talks to this interface, so switching to real data
 * does not touch any UI code.
 */
import { BENGALURU_CENTRE, mockBanks, mockStock } from './data/bengaluru.mock.ts';
import { haversineKm } from './geo.ts';
import type { BloodBank, BloodBankQuery, BloodBankResult, DataSource, StockEntry } from './types.ts';

/** Raw data source. Implement this to plug in Supabase or an e-RaktKosh proxy. */
export interface BloodBankProvider {
  readonly source: DataSource;
  listBanks(): Promise<BloodBank[]>;
  getStock(bankId: string): Promise<StockEntry[]>;
  /** Admin edit. Providers that are read-only throw. */
  setStock(bankId: string, entries: Omit<StockEntry, 'updatedAt'>[], now: Date): Promise<StockEntry[]>;
}

export interface BloodBankService {
  readonly source: DataSource;
  search(query?: BloodBankQuery, now?: Date): Promise<BloodBankResult[]>;
  getBank(id: string, now?: Date): Promise<{ bank: BloodBank; stock: StockEntry[]; lastUpdated: string | null } | null>;
  updateStock(bankId: string, entries: Omit<StockEntry, 'updatedAt'>[], now?: Date): Promise<StockEntry[]>;
}

export const STALE_AFTER_HOURS = 24;
export { BENGALURU_CENTRE };

export function createBloodBankService(provider: BloodBankProvider = new MockBloodBankProvider()): BloodBankService {
  return {
    get source() {
      return provider.source;
    },

    async search(query: BloodBankQuery = {}, now: Date = new Date()) {
      const banks = await provider.listBanks();
      const filtered = query.bloodGroup !== undefined || query.component !== undefined;
      const onlyAvailable = query.onlyAvailable ?? filtered;

      const results: BloodBankResult[] = [];
      for (const bank of banks) {
        const distanceKm = query.near ? round1(haversineKm(query.near, bank.location)) : null;
        if (query.radiusKm !== undefined && distanceKm !== null && distanceKm > query.radiusKm) continue;

        const stock = await provider.getStock(bank.id);
        const matchingStock = stock
          .filter(
            (s) =>
              (query.bloodGroup === undefined || s.bloodGroup === query.bloodGroup) &&
              (query.component === undefined || s.component === query.component),
          )
          .sort((a, b) => b.units - a.units);
        const unitsAvailable = matchingStock.reduce((n, s) => n + s.units, 0);
        // A bank with no stock rows at all (official directory, nobody reports its stock) is not
        // "out of stock": keep it, and the screen says "call to check".
        const stockUnknown = stock.length === 0 && provider.source !== 'mock';
        if (onlyAvailable && unitsAvailable === 0 && !stockUnknown) continue;

        const lastUpdated = newest(stock);
        results.push({
          bank,
          unitsAvailable,
          matchingStock,
          distanceKm,
          lastUpdated,
          isStale: lastUpdated === null || now.getTime() - Date.parse(lastUpdated) > STALE_AFTER_HOURS * 3_600_000,
          stockUnknown,
          source: provider.source,
        });
      }

      const sort = query.sort ?? (query.near ? 'distance' : 'units');
      results.sort((a, b) => {
        if (sort === 'distance') return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || b.unitsAvailable - a.unitsAvailable;
        if (sort === 'updated') return Date.parse(b.lastUpdated ?? '0') - Date.parse(a.lastUpdated ?? '0');
        return b.unitsAvailable - a.unitsAvailable || (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
      });
      return query.limit ? results.slice(0, query.limit) : results;
    },

    async getBank(id: string) {
      const bank = (await provider.listBanks()).find((b) => b.id === id);
      if (!bank) return null;
      const stock = await provider.getStock(id);
      return { bank, stock, lastUpdated: newest(stock) };
    },

    async updateStock(bankId, entries, now = new Date()) {
      for (const e of entries) {
        if (!Number.isInteger(e.units) || e.units < 0 || e.units > 10_000) {
          throw new Error(`Invalid units for ${e.bloodGroup} ${e.component}: ${e.units}`);
        }
      }
      return provider.setStock(bankId, entries, now);
    },
  };
}

/** In-memory provider backed by the Bengaluru mock data. Admin edits last until reload. */
export class MockBloodBankProvider implements BloodBankProvider {
  readonly source: DataSource = 'mock';
  private readonly banks: BloodBank[];
  private readonly stock: Map<string, StockEntry[]>;

  constructor(now: Date = new Date()) {
    this.banks = mockBanks();
    this.stock = mockStock(now);
  }

  async listBanks() {
    return this.banks;
  }

  async getStock(bankId: string) {
    return this.stock.get(bankId) ?? [];
  }

  async setStock(bankId: string, entries: Omit<StockEntry, 'updatedAt'>[], now: Date) {
    if (!this.banks.some((b) => b.id === bankId)) throw new Error(`Unknown blood bank ${bankId}`);
    const updatedAt = now.toISOString();
    const rows = [...(this.stock.get(bankId) ?? [])];
    for (const e of entries) {
      const i = rows.findIndex((r) => r.bloodGroup === e.bloodGroup && r.component === e.component);
      const row = { ...e, updatedAt };
      if (i >= 0) rows[i] = row;
      else rows.push(row);
    }
    this.stock.set(bankId, rows);
    return rows;
  }
}

function newest(stock: StockEntry[]): string | null {
  let best: string | null = null;
  for (const s of stock) if (best === null || Date.parse(s.updatedAt) > Date.parse(best)) best = s.updatedAt;
  return best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
