/**
 * ASHA sync store and photo store on Supabase, for a hosted server (no disk).
 *
 * The sync logic (sync.ts) is synchronous over whole tables, so this store
 * loads every collection once (`ready()`), serves reads from memory, and on
 * `save` writes only the rows that changed. `flush()` waits for those writes;
 * the route calls it before answering, so nothing is lost when an Edge
 * Function instance is frozen after the response.
 */
import { DbError, inList, type RestClient, type RestConfig } from '../db/rest.ts';
import { COLLECTIONS, type Collection, type SyncStore } from './sync.ts';

type Row<T> = { record: T; receivedAt: string };
type Table<T> = Record<string, Row<T>>;

export class DbSyncStore implements SyncStore {
  private tables = new Map<Collection, Table<unknown>>();
  private saved = new Map<Collection, Record<string, string>>();
  private loading: Promise<void> | null = null;
  private pending: Promise<unknown>[] = [];
  private readonly db: RestClient;

  constructor(db: RestClient) {
    this.db = db;
  }

  /** Load every collection (once per process). */
  ready(): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        for (const c of COLLECTIONS) {
          const rows = await this.db.select<{ id: string; record: unknown; received_at: string }>('asha_sync_store', { collection: `eq.${c}` }, { limit: 50_000 });
          const table: Table<unknown> = {};
          for (const r of rows) table[r.id] = { record: r.record, receivedAt: r.received_at };
          this.tables.set(c, table);
          this.saved.set(c, Object.fromEntries(Object.entries(table).map(([id, row]) => [id, JSON.stringify(row)])));
        }
      })().catch((e) => {
        this.loading = null;
        throw e;
      });
    }
    return this.loading;
  }

  load<T>(name: Collection): Table<T> {
    return { ...((this.tables.get(name) ?? {}) as Table<T>) };
  }

  save<T>(name: Collection, table: Table<T>): void {
    this.tables.set(name, table as Table<unknown>);
    const before = this.saved.get(name) ?? {};
    const after = Object.fromEntries(Object.entries(table).map(([id, row]) => [id, JSON.stringify(row)]));
    this.saved.set(name, after);
    const changed = Object.keys(after).filter((id) => after[id] !== before[id]);
    const removed = Object.keys(before).filter((id) => !(id in after));
    if (changed.length) {
      const rows = changed.map((id) => ({ collection: name, id, record: table[id].record, received_at: table[id].receivedAt }));
      this.pending.push(this.db.upsert('asha_sync_store', rows, 'collection,id'));
    }
    if (removed.length) this.pending.push(this.db.delete('asha_sync_store', { collection: `eq.${name}`, id: inList(removed) }));
  }

  /** Wait for every write since the last flush; throws if one failed. */
  async flush(): Promise<void> {
    const p = this.pending;
    this.pending = [];
    const results = await Promise.allSettled(p);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failed) {
      // Force a reload next time, so memory never runs ahead of the database.
      this.loading = null;
      throw failed.reason instanceof DbError ? failed.reason : new Error(String(failed.reason));
    }
  }
}

export interface PhotoStore {
  put(name: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(name: string): Promise<{ bytes: Uint8Array; mime: string } | null>;
}

/** Visit photos in a private Supabase Storage bucket (created on first upload). */
export class SupabasePhotoStore implements PhotoStore {
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private bucketReady: Promise<void> | null = null;
  readonly bucket: string;
  constructor(cfg: RestConfig, bucket = 'asha-photos') {
    this.bucket = bucket;
    this.base = `${cfg.url.replace(/\/$/, '')}/storage/v1`;
    this.headers = { apikey: cfg.key, ...(cfg.key.startsWith('eyJ') ? { authorization: `Bearer ${cfg.key}` } : {}) };
  }
  private ensureBucket() {
    if (!this.bucketReady) {
      this.bucketReady = fetch(`${this.base}/bucket`, {
        method: 'POST',
        headers: { ...this.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false, file_size_limit: 12 * 1024 * 1024, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] }),
      }).then(async (r) => {
        // 409 / "already exists" is fine.
        if (!r.ok && r.status !== 409 && !/exist/i.test(await r.text())) throw new Error(`could not create bucket ${this.bucket}: HTTP ${r.status}`);
      });
    }
    return this.bucketReady;
  }
  async put(name: string, bytes: Uint8Array, mime: string) {
    await this.ensureBucket();
    const r = await fetch(`${this.base}/object/${this.bucket}/${name}`, { method: 'POST', headers: { ...this.headers, 'content-type': mime, 'x-upsert': 'true' }, body: new Blob([bytes as Uint8Array<ArrayBuffer>]) });
    if (!r.ok) throw new Error(`photo upload failed: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  }
  async get(name: string) {
    const r = await fetch(`${this.base}/object/authenticated/${this.bucket}/${name}`, { headers: this.headers });
    if (!r.ok) return null;
    return { bytes: new Uint8Array(await r.arrayBuffer()), mime: r.headers.get('content-type') ?? 'image/jpeg' };
  }
}
