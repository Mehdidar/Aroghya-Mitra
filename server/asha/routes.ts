/**
 * ASHA sync routes on the shared router (server/app.ts).
 *
 * Storage: with Supabase configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 * the sync store lives in the asha_sync_store table and photos in a private
 * Storage bucket, so the server can run hosted with no disk. Without it, JSON
 * files and a photo folder under server/.data/asha (laptop demo).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DbError, RestClient, restConfigFromEnv } from '../db/rest.ts';
import { json, type Route } from '../http/router.ts';
import { readEnv } from '../speech/config.ts';
import { getDemoRepository } from '../records/demoSeed.ts';
import type { RecordsRepository } from '../records/repository.ts';
import { DbSyncStore, SupabasePhotoStore, type PhotoStore } from './dbStore.ts';
import { FileStore, SyncError, isSafePhotoName, photoName, sync, type SyncRequest, type SyncResponse, type SyncStore, type VerifiedAlert } from './sync.ts';
import type { AshaBatch } from './toRecords.ts';

/** What one sync adds to the health records: the server's alerts win for every visit it re-checked. */
export function batchFor(req: SyncRequest, res: SyncResponse): AshaBatch {
  const rechecked = new Set((req.visits ?? []).map((v) => v.id));
  const phoneOnly: VerifiedAlert[] = (req.alerts ?? []).filter((a) => !a.visitId || !rechecked.has(a.visitId)).map((a) => ({ ...a, verifiedBy: 'phone' }));
  return {
    patients: (req.patients ?? []) as AshaBatch['patients'],
    visits: (req.visits ?? []) as AshaBatch['visits'],
    alerts: [...res.verifiedAlerts, ...phoneOnly],
    referrals: req.referrals ?? [],
  };
}

export const DATA_DIR = join(import.meta.dirname ?? '.', '..', '.data', 'asha');
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Photos in a folder on this machine (laptop demo). */
export class FilePhotoStore implements PhotoStore {
  readonly dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }
  async put(name: string, bytes: Uint8Array) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, name), bytes);
  }
  async get(name: string) {
    const p = join(this.dir, name);
    if (!existsSync(p)) return null;
    return { bytes: new Uint8Array(readFileSync(p)), mime: MIME[name.split('.').pop() ?? 'jpg'] ?? 'application/octet-stream' };
  }
}

function defaultStores(photoDir: string): { store: SyncStore; photos: PhotoStore } {
  const cfg = restConfigFromEnv();
  if (cfg) return { store: new DbSyncStore(new RestClient(cfg)), photos: new SupabasePhotoStore(cfg) };
  return { store: new FileStore(DATA_DIR), photos: new FilePhotoStore(photoDir) };
}

type Readyable = SyncStore & { ready?: () => Promise<void>; flush?: () => Promise<void> };

export function routes(
  storeArg?: SyncStore,
  photoDir = join(DATA_DIR, 'photos'),
  records: () => RecordsRepository | null = getDemoRepository,
  photosArg?: PhotoStore,
): Route[] {
  const defaults = storeArg && photosArg ? null : defaultStores(photoDir);
  let store: Readyable = storeArg ?? defaults!.store;
  /** The database store until it proves missing (migration 3002 not applied): then files, with a warning. */
  const readyStore = async () => {
    try {
      await store.ready?.();
    } catch (e) {
      if (!(e instanceof DbError) || (e.status !== 404 && !/asha_sync_store/.test(e.message))) throw e;
      console.warn('[asha/sync] table asha_sync_store is missing (apply supabase/migrations/3002_asha_sync_store.sql); using files on this machine for now');
      store = new FileStore(DATA_DIR);
    }
  };
  const photos: PhotoStore = photosArg ?? (storeArg ? new FilePhotoStore(photoDir) : defaults!.photos);
  return [
    {
      method: 'POST',
      path: '/asha/sync',
      handler: async (req, { caller }) => {
        const payload = await req.json().catch(() => null);
        if (!payload) return json({ error: 'Expected a JSON body' }, 400);
        try {
          await readyStore();
          const res = sync(payload, caller, store);
          // Make sure the ASHA store reached the database before answering (hosted instances can freeze after).
          await store.flush?.();
          // Mirror into the health records so the doctor's inbox and the patient's history see it.
          // The ASHA store already has the data, so a records failure is reported, not fatal.
          let recordsStatus: 'saved' | 'failed' | 'off' = 'off';
          const repo = records();
          if (repo) {
            recordsStatus = await repo.saveAshaBatch(batchFor(payload as SyncRequest, res)).then(
              () => 'saved' as const,
              (err: unknown) => {
                console.warn('[asha/sync] could not mirror into records:', err instanceof Error ? err.message : err);
                return 'failed' as const;
              },
            );
          }
          return json({ ...res, records: recordsStatus });
        } catch (e) {
          if (e instanceof SyncError) return json({ error: e.message }, e.status);
          throw e;
        }
      },
    },
    {
      method: 'POST',
      path: '/asha/photos',
      handler: async (req, { caller, url }) => {
        if (caller.role !== 'asha' && caller.role !== 'admin') return json({ error: 'Forbidden' }, 403);
        let form: FormData;
        try {
          form = await req.formData();
        } catch {
          return json({ error: 'Expected multipart/form-data' }, 400);
        }
        const file = form.get('file');
        if (!(file instanceof Blob) || file.size === 0) return json({ error: 'Missing photo' }, 400);
        if (file.size > MAX_PHOTO_BYTES) return json({ error: 'Photo too large' }, 413);
        const name = photoName((file as File).name);
        await photos.put(name, new Uint8Array(await file.arrayBuffer()), MIME[name.split('.').pop() ?? 'jpg'] ?? 'image/jpeg');
        // Hosted behind a path prefix (Edge Function: /functions/v1/api), PUBLIC_BASE_URL gives the public base.
        const base = (readEnv('PUBLIC_BASE_URL') ?? url.origin).replace(/\/$/, '');
        return json({ url: `${base}/asha/photos/${name}` });
      },
    },
    {
      method: 'GET',
      path: /^\/asha\/photos\/[^/]+$/,
      handler: async (_req, { url }) => {
        const name = url.pathname.split('/').pop() ?? '';
        if (!isSafePhotoName(name)) return json({ error: 'Not found' }, 404);
        const got = await photos.get(name);
        if (!got) return json({ error: 'Not found' }, 404);
        return new Response(new Blob([got.bytes as Uint8Array<ArrayBuffer>]), { headers: { 'content-type': got.mime, 'cache-control': 'private, max-age=86400' } });
      },
    },
  ];
}
