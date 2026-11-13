/**
 * Ids that work both on the phone and in Postgres.
 *
 * Most Supabase tables use `uuid` primary keys, but the app and the demo seed
 * also make readable ids such as `rx-lq3k2-ab12cd` or `vit-1`. `toDbId` turns
 * any id into a stable UUID (the same input always gives the same UUID), so a
 * record written twice lands on the same row, and the phone can match a row it
 * reads back from the server to the local copy it already has.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (id: string): boolean => UUID_RE.test(id);

/** 32-bit FNV-1a with a seed, as 8 hex characters. */
function fnv(input: string, seed: number): string {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** A UUID for any id: UUIDs pass through (lower-cased); anything else is hashed to a stable UUID. */
export function toDbId(id: string): string {
  if (isUuid(id)) return id.toLowerCase();
  const hex = fnv(id, 0x9e3779b9) + fnv(id, 0x85ebca6b) + fnv(id, 0xc2b2ae35) + fnv(id, 0x27d4eb2f);
  // Version nibble 5 (name-based) and RFC 4122 variant, so Postgres and any validator accept it.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** True when two ids name the same database row. */
export const sameRecord = (a: string, b: string): boolean => toDbId(a) === toDbId(b);

/** A random v4 UUID (no crypto dependency, so it runs in React Native without a polyfill). */
export function newUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${r()}${r()}-${r()}-4${r().slice(1)}-${variant}${r().slice(1)}-${r()}${r()}${r()}`;
}
