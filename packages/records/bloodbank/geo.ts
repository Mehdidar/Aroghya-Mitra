import type { LatLng } from './types.ts';

const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in km. Road distance in Bengaluru is typically 1.3–1.6× this. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(km: number | null): string {
  if (km === null) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** Opens turn-by-turn directions in Google Maps (app if installed, else browser). */
export function directionsUrl(to: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** "5 min ago", "3 h ago", "2 days ago". */
export function formatUpdatedAgo(iso: string | null, now: Date): string {
  if (!iso) return 'Not reported';
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
