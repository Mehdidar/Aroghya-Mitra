import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BloodBanksScreen from '@/app/(patient)/blood-banks';
import HospitalNavigation from '@/app/(patient)/hospital/index';
import QrCardScreen from '@/app/(patient)/qr-card';
import PatientHealth from '@/app/(patient)/(tabs)/health';
import { DEMO_HOSPITAL, buildRoute, parseEntranceQr, shortestPath } from '@/features/hospital';
import { DEMO_QR_PREFIX } from '@/features/health/useQrCard';
import { qrModules } from '@/features/health/QrCodeView';
import { demoPatientId, useRecords } from '@/features/shared/data/recordsStore';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

describe('Health features', () => {
  beforeEach(async () => {
    useSession.setState({ role: 'patient', language: 'en', onboarded: true });
    useRecords.getState().reset();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('health hub renders the stat cards from the seeded records and the share toggle', async () => {
    await render(wrap(<PatientHealth />));
    expect(screen.getByText('My health')).toBeTruthy();
    expect(screen.getByTestId('stat-blood_group')).toBeTruthy();
    expect(screen.getByTestId('stat-weight')).toBeTruthy();
    // BP, heart rate and SpO2 are for the doctor and ASHA screens, not the patient's hub.
    for (const k of ['blood_pressure', 'heart_rate', 'spo2']) expect(screen.queryByTestId(`stat-${k}`)).toBeNull();
    expect(screen.getByText(/B\+/)).toBeTruthy();
    expect(screen.getAllByText(/150\/100/).length).toBeGreaterThan(0);
    expect(screen.getByText('Open alert from your ASHA worker')).toBeTruthy();
    expect(screen.getByText('Haemoglobin, urine protein')).toBeTruthy();
    expect(screen.getByTestId('share-switch')).toBeTruthy();
  });

  it('QR card shows the offline demo code when the server cannot be reached', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    try {
      await render(wrap(<QrCardScreen />));
      await waitFor(() => expect(screen.getByTestId('qr-code')).toBeTruthy());
      expect(screen.getByText('Demo code (offline)')).toBeTruthy();
      expect(screen.getByText(/Refreshes in/)).toBeTruthy();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('QR card is paused when sharing is off, and the demo payload encodes the patient id', async () => {
    useRecords.getState().setShareHistory(false);
    await render(wrap(<QrCardScreen />));
    await waitFor(() => expect(screen.getByTestId('qr-paused')).toBeTruthy());
    const m = qrModules(`${DEMO_QR_PREFIX}${demoPatientId}`);
    expect(m.size).toBeGreaterThan(20);
    expect(m.dark.length).toBe(m.size * m.size);
  });

  it('blood banks list renders with demo-number labels and a mock-data banner', async () => {
    await render(wrap(<BloodBanksScreen />));
    await waitFor(() => expect(screen.getByTestId('blood-list')).toBeTruthy());
    expect(screen.getByTestId('blood-mock-banner')).toBeTruthy();
    expect(screen.getAllByText('Demo number').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Call').length).toBeGreaterThan(0);
  });

  it('hospital: shortest path from the main entrance to the pharmacy and a cross-floor route to maternity', () => {
    const toPharmacy = shortestPath('main_entrance', 'pharmacy');
    expect(toPharmacy?.map((n) => n.id)).toEqual(['main_entrance', 'c0a', 'c0b', 'lift0', 'c0d', 'pharmacy']);
    const route = buildRoute('main_entrance', 'maternity')!;
    expect(route.steps[0].kind).toBe('start');
    expect(route.steps.some((s) => s.kind === 'lift' && s.toFloor === 2)).toBe(true);
    expect(route.steps[route.steps.length - 1]).toMatchObject({ kind: 'arrive', label: 'maternity' });
    expect(Object.keys(route.byFloor)).toEqual(['0', '2']);
    expect(parseEntranceQr(`AMNAV.${DEMO_HOSPITAL.id}.emergency_entrance`)).toBe('emergency_entrance');
    expect(parseEntranceQr('AMNAV.other.main_entrance')).toBeNull();
    expect(parseEntranceQr(`AMNAV.${DEMO_HOSPITAL.id}.pharmacy`)).toBeNull();
  });

  it('hospital screen renders the route steps once a destination is chosen', async () => {
    await render(wrap(<HospitalNavigation />));
    expect(screen.getByTestId('route-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('dest-pharmacy'));
    expect(screen.getByTestId('route-summary')).toBeTruthy();
    expect(screen.getByTestId('floor-map-0')).toBeTruthy();
    const steps = screen.getAllByTestId(/^step-\d+$/);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Start at the Main entrance')).toBeTruthy();
    expect(screen.getByText(/You have arrived at Pharmacy/)).toBeTruthy();
    expect(screen.getByTestId('read-aloud')).toBeTruthy();
  });
});
