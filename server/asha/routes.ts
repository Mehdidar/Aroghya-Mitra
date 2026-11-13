/** ASHA sync routes on the shared router (server/app.ts). */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { json, type Route } from '../http/router.ts';
import { FileStore, SyncError, isSafePhotoName, photoName, sync, type SyncStore } from './sync.ts';

export const DATA_DIR = join(import.meta.dirname, '..', '.data', 'asha');
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export function routes(store: SyncStore = new FileStore(DATA_DIR), photoDir = join(DATA_DIR, 'photos')): Route[] {
  return [
    {
      method: 'POST',
      path: '/asha/sync',
      handler: async (req, { caller }) => {
        const payload = await req.json().catch(() => null);
        if (!payload) return json({ error: 'Expected a JSON body' }, 400);
        try {
          return json(sync(payload, caller, store));
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
        mkdirSync(photoDir, { recursive: true });
        writeFileSync(join(photoDir, name), new Uint8Array(await file.arrayBuffer()));
        return json({ url: `${url.origin}/asha/photos/${name}` });
      },
    },
    {
      method: 'GET',
      path: /^\/asha\/photos\/[^/]+$/,
      handler: async (_req, { url }) => {
        const name = url.pathname.split('/').pop() ?? '';
        const path = join(photoDir, name);
        if (!isSafePhotoName(name) || !existsSync(path)) return json({ error: 'Not found' }, 404);
        const ext = name.split('.').pop() ?? 'jpg';
        return new Response(readFileSync(path), { headers: { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'private, max-age=86400' } });
      },
    },
  ];
}
