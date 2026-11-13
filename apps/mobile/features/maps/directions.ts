import { telUrl } from '@am/records';

/** Turn-by-turn directions in the platform's maps app: Apple Maps on iOS, Google Maps elsewhere. */
export function directionsUrlFor(os: string, to: { lat: number; lng: number }): string {
  const ll = `${to.lat},${to.lng}`;
  if (os === 'ios') return `https://maps.apple.com/?daddr=${ll}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${ll}`;
}

export function callUrl(phone: string): string {
  return telUrl(phone);
}
