import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NearbyScreen from '@/app/(patient)/nearby';
import { buildLeafletHtml, directionsUrlFor, nearbyPath, parseMapMessage, setDataScript } from '@/features/maps';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';

// Fake OSM places as the server returns them (names are fixtures, not real facilities).
const PLACES = [
  { id: 'osm-way-1', name: 'Test General Hospital', named: true, kind: 'hospital', lat: 13.036, lng: 77.597, phone: '+91 80 1234 5678', address: '1 Test Road', emergency: true, openingHours: '24/7', distanceKm: 0.1 },
  { id: 'osm-node-2', name: 'Unnamed clinic', named: false, kind: 'clinic', lat: 13.04, lng: 77.6, phone: null, address: null, emergency: false, openingHours: null, distanceKm: 0.6 },
  { id: 'osm-node-3', name: 'Test Pharmacy', named: true, kind: 'pharmacy', lat: 13.045, lng: 77.6, phone: null, address: null, emergency: false, openingHours: null, distanceKm: 1.1 },
];

const mockApiJson = jest.fn();
// The phone asks OpenStreetMap directly first; by default that "fails" so these tests cover the server path.
const mockNominatim = jest.fn(async () => ({ ok: false as const, error: 'offline' }));
jest.mock('@server/places/nominatim', () => ({ queryNominatim: (...args: unknown[]) => mockNominatim(...(args as [])) }));
jest.mock('@/features/shared/services/api', () => ({
  apiJson: (...args: unknown[]) => mockApiJson(...args),
}));

const mockLocation = { granted: false };
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: mockLocation.granted })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 13.0358, longitude: 77.597 } })),
}));

const mockWebView = { onMessage: null as null | ((e: { nativeEvent: { data: string } }) => void), injected: [] as string[] };
jest.mock('react-native-webview', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const WebView = React.forwardRef(function MockWebView(props: { onMessage: typeof mockWebView.onMessage; testID?: string }, ref: unknown) {
    mockWebView.onMessage = props.onMessage;
    React.useImperativeHandle(ref, () => ({ injectJavaScript: (js: string) => mockWebView.injected.push(js) }));
    return React.createElement(View, { testID: props.testID });
  });
  return { WebView, default: WebView };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

describe('Nearby care', () => {
  beforeEach(async () => {
    useSession.setState({ role: 'patient', language: 'en', onboarded: true });
    mockLocation.granted = false;
    mockWebView.injected = [];
    mockApiJson.mockReset();
    mockNominatim.mockClear();
    await AsyncStorage.clear();
    mockApiJson.mockImplementation(async (path: string) => {
      if (path.startsWith('/places/nearby')) return { ok: true, places: PLACES };
      throw new Error('offline'); // blood banks fall back to the labelled demo banks
    });
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('lists real places and demo blood banks, with the Bengaluru note when location is refused', async () => {
    await render(wrap(<NearbyScreen />));
    await waitFor(() => expect(screen.getByTestId('place-osm-way-1')).toBeTruthy());
    expect(screen.getByText('Test General Hospital')).toBeTruthy();
    expect(screen.getByText('Unnamed clinic')).toBeTruthy();
    expect(screen.getByText(/Hospital · 100 m · 24x7 · Emergency/)).toBeTruthy();
    expect(screen.getByText('Showing Bengaluru; allow location for places near you')).toBeTruthy();
    expect(screen.getByText('Data © OpenStreetMap contributors')).toBeTruthy();
    expect(screen.getByText('Indoor guide: PHC Hebbal (demo)')).toBeTruthy();
    expect(screen.getAllByText('Demo').length).toBeGreaterThan(0);
    // Call only where there is a phone; Directions everywhere.
    expect(screen.getByLabelText('Call Test General Hospital')).toBeTruthy();
    expect(screen.queryByTestId('call-osm-node-3')).toBeNull();
    expect(screen.getByLabelText('Directions to Test Pharmacy')).toBeTruthy();
    // The map is labelled for screen readers; the server was asked around Bengaluru centre.
    expect(screen.getByLabelText('Map of nearby care; the same places are listed below')).toBeTruthy();
    // Phone-direct search was tried first (and 'failed' here), then the server was asked around Bengaluru centre.
    expect(mockNominatim).toHaveBeenCalled();
    expect(mockApiJson.mock.calls.map((c) => String(c[0])).find((p) => p.startsWith('/places/nearby'))).toMatch(/^\/places\/nearby\?lat=12\.97\d+&lng=77\.59\d+&radiusKm=5&kinds=hospital%2Cclinic%2Cpharmacy$/);
  });

  it('uses the device location when allowed', async () => {
    mockLocation.granted = true;
    await render(wrap(<NearbyScreen />));
    await waitFor(() => expect(screen.getByText('Showing places near you')).toBeTruthy());
    await waitFor(() => expect(mockApiJson).toHaveBeenCalledWith(nearbyPath({ lat: 13.0358, lng: 77.597 }), undefined, expect.anything()));
  });

  it('filters by kind with selected state on the chips', async () => {
    await render(wrap(<NearbyScreen />));
    await waitFor(() => expect(screen.getByTestId('place-osm-way-1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('filter-pharmacy'));
    expect(screen.getByTestId('filter-pharmacy').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('filter-all').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('place-osm-node-3')).toBeTruthy();
    expect(screen.queryByTestId('place-osm-way-1')).toBeNull();
    expect(screen.queryAllByText(/^Blood bank ·/)).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('filter-bloodbank'));
    expect(screen.queryByTestId('place-osm-node-3')).toBeNull();
    expect(screen.getAllByText(/^Blood bank ·/).length).toBeGreaterThan(0);
  });

  it('Directions and Call open the right URLs', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(wrap(<NearbyScreen />));
    await waitFor(() => expect(screen.getByTestId('directions-osm-way-1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('directions-osm-way-1'));
    expect(open).toHaveBeenLastCalledWith('https://maps.apple.com/?daddr=13.036,77.597'); // jest-expo runs as iOS
    await fireEvent.press(screen.getByTestId('call-osm-way-1'));
    expect(open).toHaveBeenLastCalledWith('tel:+918012345678');
    open.mockRestore();
  });

  it('builds directions URLs per platform', () => {
    const to = { lat: 13.036, lng: 77.597 };
    expect(directionsUrlFor('ios', to)).toBe('https://maps.apple.com/?daddr=13.036,77.597');
    expect(directionsUrlFor('android', to)).toBe('https://www.google.com/maps/dir/?api=1&destination=13.036,77.597');
    expect(directionsUrlFor('web', to)).toBe('https://www.google.com/maps/dir/?api=1&destination=13.036,77.597');
  });

  it('sends places to the map when it is ready, and a marker tap highlights the row', async () => {
    await render(wrap(<NearbyScreen />));
    await waitFor(() => expect(screen.getByTestId('place-osm-way-1')).toBeTruthy());
    await act(async () => mockWebView.onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'ready' }) } }));
    expect(mockWebView.injected.at(-1)).toContain('osm-node-3');
    await act(async () => mockWebView.onMessage?.({ nativeEvent: { data: JSON.stringify({ type: 'select', id: 'osm-node-3' }) } }));
    expect(screen.getByTestId('place-osm-node-3')).toHaveStyle({ borderWidth: 2 });
    expect(mockWebView.injected.at(-1)).toContain('"selectedId":"osm-node-3"');
  });

  it('shows the error state with retry when the server cannot reach OpenStreetMap', async () => {
    mockApiJson.mockImplementation(async () => {
      throw new Error('HTTP 502');
    });
    await render(wrap(<NearbyScreen />));
    await waitFor(() => expect(screen.getByTestId('nearby-error')).toBeTruthy());
    expect(screen.getByText('Could not load nearby places')).toBeTruthy();
  });

  it('map page: pinned Leaflet with SRI, OSM attribution, names escaped', () => {
    const html = buildLeafletHtml();
    expect(html).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    expect(html).toContain('integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="');
    expect(html).toContain('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(html).toContain('OpenStreetMap</a> contributors');
    const js = setDataScript({ places: [{ id: 'x', name: '</script><b>', kind: 'clinic', lat: 1, lng: 2 }], user: null, selectedId: null, fitKey: 'k' });
    expect(js).not.toContain('</script>');
    expect(parseMapMessage('{"type":"select","id":"osm-node-1"}')).toEqual({ type: 'select', id: 'osm-node-1' });
    expect(parseMapMessage('nope')).toBeNull();
  });

  it('uses the phone-direct OpenStreetMap search when it answers, without asking the server for places', async () => {
    mockNominatim.mockImplementationOnce(async () => ({
      ok: true,
      places: [{ id: 'osm-node-1', name: 'Direct Hospital', named: true, kind: 'hospital', lat: 12.972, lng: 77.595, phone: null, address: null, emergency: false, openingHours: null, distanceKm: 0.3 }],
    }) as never);
    await render(wrap(<NearbyScreen />));
    expect(await screen.findByText('Direct Hospital')).toBeTruthy();
    expect(mockApiJson.mock.calls.some((c) => String(c[0]).startsWith('/places/nearby'))).toBe(false);
  });
});

