/**
 * Data for the Nearby care screen: the device location (or Bengaluru centre), real
 * hospitals, clinics and pharmacies from OpenStreetMap, and the app's blood banks
 * (official directory when imported, otherwise the labelled demo banks).
 *
 * OpenStreetMap places: asked from the phone first (Nominatim; public OSM services
 * often throttle shared cloud servers such as the hosted API), kept on the phone for
 * 6 hours per area, with the server's /places/nearby as the backup.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { queryNominatim, type NearbyPlace } from '@server/places/nominatim';

import { BENGALURU_CENTRE, createBloodBankService, RemoteBloodBankProvider, type BloodBankPayload, type BloodBankService, type LatLng } from '@am/records';

import { apiJson } from '@/features/shared/services/api';

import type { MapPlace, NearbyPlacesResponse } from './types';

export const NEARBY_RADIUS_KM = 5;
const LOCATION_TIMEOUT_MS = 10_000;

let bloodBanks: BloodBankService | null = null;
function bloodBankService(): BloodBankService {
  bloodBanks ??= createBloodBankService(new RemoteBloodBankProvider(() => apiJson<BloodBankPayload>('/blood-banks', undefined, { timeoutMs: 8000 }).catch(() => null)));
  return bloodBanks;
}

/** Foreground location, or null when permission is refused, the module is missing or it takes too long. */
export async function deviceLocation(): Promise<LatLng | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Location = require('expo-location') as {
      requestForegroundPermissionsAsync: () => Promise<{ granted: boolean }>;
      getCurrentPositionAsync: (o: { accuracy?: number }) => Promise<{ coords: { latitude: number; longitude: number } }>;
    };
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm?.granted) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({}),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
    return pos?.coords ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

export type DeviceLocationState = { location: LatLng | null; located: boolean };

/** Starts with null while asking; then the device point (located) or Bengaluru centre (not located). */
export function useDeviceLocation(): DeviceLocationState {
  const [state, setState] = useState<DeviceLocationState>({ location: null, located: false });
  useEffect(() => {
    let alive = true;
    void deviceLocation().then((loc) => {
      if (alive) setState(loc ? { location: loc, located: true } : { location: BENGALURU_CENTRE, located: false });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export type NearbyPlacesState = {
  status: 'loading' | 'ready' | 'error';
  /** OSM places and blood banks, nearest first. On an OSM error the blood banks are still here. */
  places: MapPlace[];
  bloodBankSource: 'mock' | 'eraktkosh' | 'supabase' | null;
  retry: () => void;
};

export function nearbyPath(at: LatLng, radiusKm = NEARBY_RADIUS_KM): string {
  const q = new URLSearchParams({ lat: at.lat.toFixed(5), lng: at.lng.toFixed(5), radiusKm: String(radiusKm), kinds: 'hospital,clinic,pharmacy' });
  return `/places/nearby?${q.toString()}`;
}

const CACHE_PREFIX = 'aroghya-nearby-v1:';
const CACHE_MS = 6 * 60 * 60_000;

/** OSM places near `at`: phone-direct Nominatim (cached 6 h), else the server. Throws when both fail. */
export async function loadOsmPlaces(at: LatLng, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<NearbyPlacesResponse['places']> {
  const key = `${CACHE_PREFIX}${at.lat.toFixed(2)},${at.lng.toFixed(2)}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw) as { at: number; places: NearbyPlace[] };
      if (Date.now() - saved.at < CACHE_MS && Array.isArray(saved.places)) return saved.places;
    }
  } catch {
    /* no cache */
  }
  const direct = await queryNominatim(at, NEARBY_RADIUS_KM, ['hospital', 'clinic', 'pharmacy'], { fetchImpl, timeoutMs: 12_000 }).catch(() => null);
  if (direct?.ok && direct.places.length) {
    void AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), places: direct.places })).catch(() => undefined);
    return direct.places;
  }
  const r = await apiJson<NearbyPlacesResponse>(nearbyPath(at), undefined, { timeoutMs: 20_000 });
  return r.places ?? [];
}

function fromServer(p: NearbyPlacesResponse['places'][number]): MapPlace {
  return {
    id: p.id,
    name: p.named === false ? '' : p.name,
    kind: p.kind,
    lat: p.lat,
    lng: p.lng,
    phone: p.phone ?? null,
    address: p.address ?? null,
    emergency: !!p.emergency,
    open24x7: p.openingHours?.trim() === '24/7',
    distanceKm: typeof p.distanceKm === 'number' ? p.distanceKm : null,
  };
}

export function useNearbyPlaces(location: LatLng | null): NearbyPlacesState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<NearbyPlacesState, 'retry'> & { key: string | null }>({ key: null, status: 'loading', places: [], bloodBankSource: null });
  // A new location or a retry is a new key; until its results arrive the state reads as loading.
  const key = location ? `${location.lat},${location.lng}#${attempt}` : null;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!location || !key) return;
    let alive = true;
    const service = bloodBankService();
    const osm = loadOsmPlaces(location).then((places) => places.map(fromServer));
    const banks = service
      .search({ near: location, sort: 'distance', onlyAvailable: false, radiusKm: 15, limit: 20 })
      .then((results) =>
        results.map(
          (r): MapPlace => ({
            id: `bank-${r.bank.id}`,
            name: r.bank.name,
            kind: 'bloodbank',
            lat: r.bank.location.lat,
            lng: r.bank.location.lng,
            // Demo banks carry made-up numbers: never offer to call them.
            phone: r.bank.phoneVerified ? r.bank.phone : null,
            address: r.bank.address || null,
            emergency: false,
            open24x7: r.bank.open24x7,
            distanceKm: r.distanceKm,
            demo: service.source === 'mock',
          }),
        ),
      )
      .catch(() => [] as MapPlace[]);

    void Promise.allSettled([osm, banks]).then(([o, b]) => {
      if (!alive) return;
      const bankPlaces = b.status === 'fulfilled' ? b.value : [];
      const osmPlaces = o.status === 'fulfilled' ? o.value : [];
      const places = [...osmPlaces, ...bankPlaces].sort((x, y) => (x.distanceKm ?? Infinity) - (y.distanceKm ?? Infinity));
      setState({ key, status: o.status === 'fulfilled' ? 'ready' : 'error', places, bloodBankSource: service.source });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers location and attempt
  }, [key]);

  const { key: loadedKey, ...rest } = state;
  return { ...rest, status: loadedKey === key && key !== null ? rest.status : 'loading', retry };
}
