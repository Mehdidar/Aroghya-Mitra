import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DEMO_IDS } from '@am/shared';

import DoctorAdmin from '@/app/(doctor)/admin';
import ConsultationScreen from '@/app/(doctor)/consultation/[patientId]';
import DoctorDashboard from '@/app/(doctor)/index';
import DoctorReferrals from '@/app/(doctor)/referrals';
import { mergeReferrals, toRecordReferral } from '@/features/doctor/ashaBridge';
import { remindersFor } from '@/features/doctor/prescriptions';
import { resolveScan } from '@/features/doctor/qrScan';
import { useRecords } from '@/features/shared/data/recordsStore';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';

const params: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useLocalSearchParams: () => params,
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

beforeEach(async () => {
  useSession.setState({ role: 'doctor', language: 'en', onboarded: true });
  useRecords.getState().reset();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('Admin', () => {
  it('renders analytics charts, staff and blood stock', async () => {
    useSession.setState({ role: 'admin' });
    await render(wrap(<DoctorAdmin />));
    await waitFor(() => expect(screen.getByTestId('chart-visits')).toBeTruthy());
    expect(screen.getByTestId('chart-risk')).toBeTruthy();
    expect(screen.getAllByText('Sunita Devi').length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByTestId('stock-O+')).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`staff-22222222-2222-4222-8222-000000000013-toggle`));
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });
});

describe('Doctor dashboard', () => {
  it('renders the stats from the seed and the Scan QR button', async () => {
    await render(wrap(<DoctorDashboard />));
    expect(screen.getByTestId('scan-qr')).toBeTruthy();
    expect(screen.getByTestId('stat-high-risk')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText(/Open referrals: 1/)).toBeTruthy());
    expect(screen.getByLabelText(/High-risk alerts: 1/)).toBeTruthy();
    expect(screen.getByTestId('open-demo-patient')).toBeTruthy();
  });
});

describe('Referral inbox', () => {
  it("lists Rekha's referral and Accept updates it in the store", async () => {
    await render(wrap(<DoctorReferrals />));
    await waitFor(() => expect(screen.getByTestId(`referral-${DEMO_IDS.referral}`)).toBeTruthy());
    expect(screen.getByText('Rekha Kumari')).toBeTruthy();
    expect(screen.getByText('New')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`referral-${DEMO_IDS.referral}-accept`));
    const r = useRecords.getState().referrals.find((x) => x.id === DEMO_IDS.referral)!;
    expect(r.status).toBe('accepted');
    expect(r.acceptedAt).toBeTruthy();
    expect(r.seenAt).toBeTruthy();
  });

  it('merges ASHA-store referrals without duplicating the seeded one', () => {
    const asha = toRecordReferral({ id: DEMO_IDS.referral, patientId: 'p', fromAshaId: 'a', reason: 'x', alertIds: ['al'], urgency: 'urgent', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    const other = { ...asha, id: 'ref-2' };
    const store = useRecords.getState().referrals;
    const merged = mergeReferrals(store, [asha, other]);
    expect(merged.filter((r) => r.id === DEMO_IDS.referral)).toHaveLength(1);
    expect(merged.some((r) => r.id === 'ref-2')).toBe(true);
    expect(asha.riskAlertId).toBe('al');
  });
});

describe('Consultation', () => {
  it('saves a prescription that appears in the patient reminders', async () => {
    params.patientId = DEMO_IDS.patientRecord;
    params.referralId = DEMO_IDS.referral;
    const before = useRecords.getState().reminders.length;
    await render(wrap(<ConsultationScreen />));
    fireEvent.changeText(screen.getByTestId('consultation-diagnosis'), 'Pre-eclampsia, mild');
    fireEvent.changeText(screen.getByTestId('medicine-0-name'), 'Nifedipine 10 mg');
    await fireEvent.press(screen.getByTestId('medicine-0-slot-night'));
    await fireEvent.press(screen.getByTestId('consultation-save'));
    const s = useRecords.getState();
    expect(s.prescriptions[0].items[0].name).toBe('Nifedipine 10 mg');
    expect(s.prescriptions[0].source).toBe('doctor');
    expect(s.reminders.length).toBe(before + 1);
    expect(s.reminders[0].name).toBe('Nifedipine 10 mg');
    expect(s.reminders[0].slots).toEqual(['morning', 'night']);
    expect(s.consultations[0].diagnosis).toBe('Pre-eclampsia, mild');
    expect(s.referrals.find((r) => r.id === DEMO_IDS.referral)!.status).toBe('accepted');
  });

  it('remindersFor maps items to one plan each', () => {
    const items = remindersFor({ id: 'rx', patientId: 'p', prescribedBy: 'd', source: 'doctor', issuedAt: '2026-11-13T00:00:00.000Z', diagnosis: null, notes: null, items: [{ name: 'A', dosage: '1', frequency: 'bd', timesOfDay: ['morning', 'bogus'], durationDays: 5, instructions: 'after food' }] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'rx:0', slots: ['morning'], mealRelation: 'after_food', durationDays: 5, prescriptionId: 'rx' });
  });
});

describe('QR scan resolution', () => {
  it('resolves the demo payload locally and rejects garbage', async () => {
    expect(await resolveScan(`AM1.demo.${DEMO_IDS.patientRecord}`)).toEqual({ ok: true, patientId: DEMO_IDS.patientRecord, via: 'local' });
    expect((await resolveScan('hello')).ok).toBe(false);
    expect(await resolveScan('AM1.demo.nope')).toEqual({ ok: false, reason: 'not_found' });
  });
});

