import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DEMO_IDS } from '@am/shared';

import ConsultationScreen from '@/app/(doctor)/consultation/[patientId]';
import DoctorPatient from '@/app/(doctor)/patient/[id]';
import DoctorReferrals from '@/app/(doctor)/(tabs)/referrals';
import { composeNotes, durationDays, emptyNoteFields, followUpDate, slotsFor } from '@/features/doctor/consultationNote';
import { useRecords } from '@/features/shared/data/recordsStore';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';

const params: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useLocalSearchParams: () => params,
}));

const mockDraft = jest.fn();
jest.mock('@/features/doctor/copilot/api', () => ({
  draftNotes: (...a: unknown[]) => mockDraft(...a),
  fetchSummary: () => Promise.reject(new Error('offline in tests')),
  fetchLabs: () => Promise.reject(new Error('offline in tests')),
  saveLabs: () => Promise.reject(new Error('offline in tests')),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

beforeEach(async () => {
  useSession.setState({ role: 'doctor', language: 'en', onboarded: true });
  useRecords.getState().reset();
  mockDraft.mockReset();
  for (const k of Object.keys(params)) delete params[k];
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('Consultation with the copilot', () => {
  it('a dictated draft fills the editable form, and nothing is saved before Approve and save', async () => {
    params.patientId = DEMO_IDS.patientRecord;
    mockDraft.mockResolvedValue({
      model: 'fake',
      draft: {
        chiefComplaint: 'Headache for 2 days',
        history: '34 weeks pregnant',
        examination: 'Pedal oedema',
        vitals: { systolic: 150, diastolic: 100, heartRate: 92, temperatureC: null, spo2: null, respiratoryRate: null, weightKg: null, bloodSugarMgDl: null },
        assessment: 'Gestational hypertension',
        plan: 'Add nifedipine',
        labOrders: ['CBC', 'LFT'],
        followUp: 'after one week',
        medicines: [{ name: 'Nifedipine 10 mg', dose: '1 tablet', frequency: 'at night', duration: '7 days', instructions: null }],
      },
    });
    const before = { c: useRecords.getState().consultations.length, p: useRecords.getState().prescriptions.length };
    await render(wrap(<ConsultationScreen />));
    await fireEvent.changeText(screen.getByTestId('notes-transcript'), 'Headache two days, BP 150 by 100, add nifedipine 10 mg at night for 7 days');
    await fireEvent.press(screen.getByTestId('notes-draft'));
    await waitFor(() => expect(screen.queryByText(/Drafting needs the server|could not structure/) ?? screen.getByTestId('notes-drafted')).toBeTruthy());
    expect(screen.queryByText(/Drafting needs the server/)).toBeNull();
    expect(screen.getByTestId('notes-drafted')).toBeTruthy();
    expect(mockDraft).toHaveBeenCalledWith(expect.stringContaining('nifedipine'), DEMO_IDS.patientRecord, 'en');
    expect(screen.getByTestId('note-bp').props.value).toBe('150/100');
    expect(screen.getByTestId('consultation-diagnosis').props.value).toBe('Gestational hypertension');
    expect(screen.getByTestId('medicine-0-name').props.value).toBe('Nifedipine 10 mg');
    expect(screen.getByTestId('medicine-0-duration').props.value).toBe('7');
    expect(useRecords.getState().consultations.length).toBe(before.c);
    expect(useRecords.getState().prescriptions.length).toBe(before.p);

    // The doctor edits a field, then approves.
    await fireEvent.changeText(screen.getByTestId('note-plan'), 'Add nifedipine; review BP in one week');
    await fireEvent.press(screen.getByTestId('consultation-save'));
    const s = useRecords.getState();
    expect(s.consultations.length).toBe(before.c + 1);
    expect(s.consultations[0].notes).toContain('BP 150/100');
    expect(s.consultations[0].notes).toContain('review BP in one week');
    expect(s.consultations[0].labOrders).toEqual(['CBC', 'LFT']);
    expect(s.prescriptions[0].items[0]).toMatchObject({ name: 'Nifedipine 10 mg', timesOfDay: ['night'], durationDays: 7 });
  });

  it('pregnancy and allergy warnings must each be acknowledged before saving', async () => {
    params.patientId = DEMO_IDS.patientRecord;
    await render(wrap(<ConsultationScreen />));
    await fireEvent.changeText(screen.getByTestId('consultation-diagnosis'), 'Back pain');
    await fireEvent.changeText(screen.getByTestId('medicine-0-name'), 'Ibuprofen 400 mg');
    await waitFor(() => expect(screen.getByTestId('rx-warnings')).toBeTruthy());
    expect(screen.getByText(/Ibuprofen 400 mg in pregnancy \(34 weeks\)/)).toBeTruthy();
    const before = useRecords.getState().prescriptions.length;
    await fireEvent.press(screen.getByTestId('consultation-save'));
    expect(screen.getByTestId('consultation-error')).toBeTruthy();
    expect(useRecords.getState().prescriptions.length).toBe(before);

    await fireEvent.press(screen.getByTestId('rx-warning-ack-pregnancy:ibuprofen:nsaid_20w'));
    await fireEvent.press(screen.getByTestId('consultation-save'));
    expect(useRecords.getState().prescriptions.length).toBe(before + 1);
  });

  it("Rekha's penicillin allergy flags amoxicillin; the picker searches the NLEM list", async () => {
    params.patientId = DEMO_IDS.patientRecord;
    await render(wrap(<ConsultationScreen />));
    await fireEvent(screen.getByTestId('medicine-0-name'), 'focus');
    await fireEvent.changeText(screen.getByTestId('medicine-0-name'), 'amox');
    await waitFor(() => expect(screen.getByTestId('medicine-0-pick-amoxicillin')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('medicine-0-pick-amoxicillin'));
    expect(screen.getByTestId('medicine-0-name').props.value).toBe('Amoxicillin 250 mg capsule');
    await waitFor(() => expect(screen.getByText(/patient allergy "Penicillin"/)).toBeTruthy());
    expect(screen.queryByTestId('medicine-0-generic')).toBeNull(); // no Jan Aushadhi row for 250 mg
    await fireEvent.press(screen.getByTestId('medicine-0-strength-500 mg'));
    expect(screen.getByTestId('medicine-0-name').props.value).toBe('Amoxicillin 500 mg capsule');
    expect(screen.getByText(/Jan Aushadhi generic: Amoxicillin 500 mg/)).toBeTruthy();
  });
});

describe('Ranked referral inbox', () => {
  it('shows the rank and why', async () => {
    await render(wrap(<DoctorReferrals />));
    await waitFor(() => expect(screen.getByTestId(`referral-${DEMO_IDS.referral}-why`)).toBeTruthy());
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText(/Pregnancy with a high BP danger sign \(BP 150\/100\)/)).toBeTruthy();
    expect(screen.getByText(/Not seen by a doctor yet/)).toBeTruthy();
    expect(screen.getByTestId('inbox-ranking-note')).toBeTruthy();
  });
});

describe('Doctor patient page', () => {
  it('shows the deterministic summary built on the phone, and the clinical timeline with filters', async () => {
    params.id = DEMO_IDS.patientRecord;
    await render(wrap(<DoctorPatient />));
    expect(screen.getByTestId('copilot-summary')).toBeTruthy();
    expect(screen.getByText('From this phone')).toBeTruthy();
    expect(screen.getAllByText(/Labetalol 100 mg · 1 tablet · Twice a day/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Lab values load from the server/)).toBeTruthy();
    expect(screen.getByTestId('copilot-timeline')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('timeline-filter-vitals'));
    expect(screen.queryByTestId(/^timeline-consultation:/)).toBeNull();
    expect(screen.getAllByTestId(/^timeline-vitals:/).length).toBe(3);
  });
});

describe('note helpers', () => {
  it('parse frequency, duration and follow-up; compose the note', () => {
    expect(slotsFor('twice daily')).toEqual(['morning', 'night']);
    expect(slotsFor('TDS')).toEqual(['morning', 'afternoon', 'night']);
    expect(slotsFor('at bedtime')).toEqual(['night']);
    expect(durationDays('2 weeks')).toBe('14');
    expect(durationDays('5')).toBe('5');
    expect(durationDays('until review')).toBe('');
    expect(followUpDate('after one week', new Date(2026, 10, 14))).toBe('2026-11-21');
    expect(followUpDate('2026-12-01')).toBe('2026-12-01');
    expect(followUpDate('when needed')).toBeNull();
    expect(composeNotes({ ...emptyNoteFields(), chiefComplaint: 'Fever', bp: '120/80' })).toBe('Complaint: Fever\nVitals: BP 120/80 mmHg');
    expect(composeNotes(emptyNoteFields())).toBeNull();
  });
});
