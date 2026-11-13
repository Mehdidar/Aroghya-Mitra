/** Shared by LeafletMap.tsx (native WebView) and LeafletMap.web.tsx (iframe). */
import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { MapPayload } from './leafletHtml';
import type { MapPlace } from './types';

export type LeafletMapProps = {
  places: MapPlace[];
  user: { lat: number; lng: number } | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Turn the props into the page payload. */
export function useMapPayload(places: MapPlace[], user: LeafletMapProps['user'], selectedId: string | null): MapPayload {
  return useMemo(
    () => ({
      places: places.map(({ id, name, kind, lat, lng }) => ({ id, name, kind, lat, lng })),
      user,
      selectedId,
      fitKey: `${user ? `${user.lat},${user.lng}` : ''}|${places.map((p) => p.id).join(',')}`,
    }),
    [places, user, selectedId],
  );
}

export function parseMapMessage(raw: string): { type: 'select'; id: string } | { type: 'ready' } | { type: 'error' } | null {
  try {
    const m = JSON.parse(raw) as { type?: string; id?: unknown };
    if (m.type === 'select' && typeof m.id === 'string') return { type: 'select', id: m.id };
    if (m.type === 'ready' || m.type === 'error') return { type: m.type };
  } catch {
    /* not ours */
  }
  return null;
}

