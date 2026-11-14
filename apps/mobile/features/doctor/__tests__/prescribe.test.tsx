import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DEMO_IDS } from '@am/shared';

import DoctorPatient from '@/app/(doctor)/patient/[id]';
import PrescribeScreen from '@/app/(doctor)/prescribe/[patientId]';
import { useRecords } from '@/features/shared/data/recordsStore';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';

const params: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useLocalSearchParams: () => params,
}));
jest.mock('@/features/doctor/copilot/api', () => ({
  draftNotes: () => Promise.reject(new Error('offline in tests')),
  fetchSummary: () => Promise.reject(new Error('offline in tests')),
  fetchLabs: () => Promise.reject(new Error('offline in tests')),
  saveLabs: () => Promise.reject(new Error('offline in tests')),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

beforeEach(async () => {
  useSession.setState({ role: 'doctor', language: 'en', onboarded: true });
  useRecords.getState().reset();
  for (const k of Object.keys(params)) delete params[k];
  (router.push as jest.Mock).mockClear();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('Prescribe medicine (no consultation)', () => {
  it('checks the warnings, then saves a doctor prescription with reminders for the patient', async () => {
    params.patientId = DEMO_IDS.patientRecord;
    await render(wrap(<PrescribeScreen />));
    expect(screen.getByTestId('screen-prescribe')).toBeTruthy();
    expect(screen.getByText('Rekha Kumari', { exact: true })).toBeTruthy();
    expect(screen.getByText(/Allergy: Penicillin|Penicillin/)).toBeTruthy();
    expect(screen.getByTestId('rx-pregnant')).toBeTruthy();

    const before = { rx: useRecords.getState().prescriptions.length, rem: useRecords.getState().reminders.length, cons: useRecords.getState().consultations.length };
    // Nothing typed yet: nothing to send.
    await fireEvent.press(screen.getByTestId('prescribe-save'));
    expect(screen.getByTestId('prescribe-error')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('medicine-0-name'), 'Ibuprofen 400 mg');
    await fireEvent.changeText(screen.getByTestId('prescribe-diagnosis'), 'Back pain');
    await waitFor(() => expect(screen.getByTestId('rx-warnings')).toBeTruthy());
    // A warning blocks saving until the doctor has reviewed it.
    await fireEvent.press(screen.getByTestId('prescribe-save'));
    expect(screen.getByTestId('prescribe-error')).toBeTruthy();
    expect(useRecords.getState().prescriptions.length).toBe(before.rx);

    for (const ack of screen.getAllByTestId(/^rx-warning-ack-/)) await fireEvent.press(ack);
    await fireEvent.press(screen.getByTestId('prescribe-save'));

    const s = useRecords.getState();
    expect(s.prescriptions.length).toBe(before.rx + 1);
    expect(s.consultations.length).toBe(before.cons); // no consultation is created
    const rx = s.prescriptions[0];
    expect(rx).toMatchObject({ patientId: DEMO_IDS.patientRecord, prescribedBy: DEMO_IDS.doctor, source: 'doctor', diagnosis: 'Back pain' });
    expect(rx.items[0]).toMatchObject({ name: 'Ibuprofen 400 mg', timesOfDay: ['morning'] });
    expect(s.reminders.length).toBe(before.rem + 1);
    expect(s.reminders.find((r) => r.prescriptionId === rx.id)).toMatchObject({ name: 'Ibuprofen 400 mg', slots: ['morning'] });

    expect(screen.getByTestId('prescribe-sent')).toBeTruthy();
    expect(screen.getByText("Sent to Rekha Kumari's reminders")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('prescribe-done'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/patient/[id]', params: { id: DEMO_IDS.patientRecord } });
  });

  it('is for doctors only (the server keeps prescriptions in the doctor’s own name)', async () => {
    useSession.setState({ role: 'admin' });
    params.patientId = DEMO_IDS.patientRecord;
    await render(wrap(<PrescribeScreen />));
    expect(screen.getByText('Only a doctor can prescribe')).toBeTruthy();
    expect(screen.queryByTestId('prescribe-save')).toBeNull();
  });

  it('the patient page opens it next to New consultation', async () => {
    params.id = DEMO_IDS.patientRecord;
    await render(wrap(<DoctorPatient />));
    expect(screen.getByTestId('new-consultation')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('prescribe-medicine'));
    expect(router.push).toHaveBeenCalledWith(`/prescribe/${DEMO_IDS.patientRecord}`);
  });
});
