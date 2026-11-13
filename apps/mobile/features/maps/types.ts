/** One place on the Nearby care map and list. OSM places come from the server; blood banks from @am/records. */
export type MapPlaceKind = 'hospital' | 'clinic' | 'pharmacy' | 'bloodbank';

export interface MapPlace {
  id: string;
  /** Display name. Empty when OSM has no name; the screen then shows a translated "Unnamed clinic". */
  name: string;
  kind: MapPlaceKind;
  lat: number;
  lng: number;
  phone: string | null;
  address: string | null;
  emergency: boolean;
  open24x7: boolean;
  distanceKm: number | null;
  /** True for the app's labelled demo blood banks (no official directory imported). */
  demo?: boolean;
}

/** Marker colours per kind, shared by the map page and the list legend. */
export const KIND_COLOURS: Record<MapPlaceKind, string> = {
  hospital: '#D32F2F',
  clinic: '#1565C0',
  pharmacy: '#2E7D32',
  bloodbank: '#7B0A0A',
};

export const USER_DOT_COLOUR = '#1E88E5';

/** Server response of GET /places/nearby (server/places/routes.ts). */
export interface NearbyPlacesResponse {
  ok?: boolean;
  places: {
    id: string;
    name: string;
    named?: boolean;
    kind: 'hospital' | 'clinic' | 'pharmacy';
    lat: number;
    lng: number;
    phone: string | null;
    address: string | null;
    emergency: boolean;
    openingHours: string | null;
    distanceKm: number;
  }[];
  error?: string;
}
