import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RolePicker from '@/app/(auth)/role';
import PatientHome from '@/app/(patient)/(tabs)/index';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

async function useLanguage(lng: string) {
  await act(async () => {
    await i18n.changeLanguage(lng);
  });
}

describe('Role picker', () => {
  beforeEach(async () => {
    useSession.setState({ role: null, language: 'en', onboarded: false });
    await useLanguage('en');
  });

  it('shows four roles in English and signs in to demo mode', async () => {
    await render(wrap(<RolePicker />));
    expect(screen.getByText('Who is using the app?')).toBeTruthy();
    for (const label of ['Patient', 'ASHA worker', 'Doctor', 'Admin']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText('Continue in demo mode')).toBeNull();

    await fireEvent.press(screen.getByTestId('role-asha'));
    expect(screen.getByText('Continue in demo mode')).toBeTruthy();
    expect(screen.getByText('Sign in with phone')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('continue-demo'));
    expect(useSession.getState().role).toBe('asha');
  });

  it('renders in Urdu', async () => {
    await useLanguage('ur');
    await render(wrap(<RolePicker />));
    expect(screen.getByText('ایپ کون استعمال کر رہا ہے؟')).toBeTruthy();
    expect(screen.getByText('مریض')).toBeTruthy();
    expect(screen.getByText('آشا کارکن')).toBeTruthy();
    expect(screen.queryByText('Who is using the app?')).toBeNull();
  });
});

describe('Patient Home', () => {
  beforeEach(async () => {
    useSession.setState({ role: 'patient', language: 'en', onboarded: true });
    await useLanguage('en');
  });

  it('renders greeting, voice card, next medicine, services and the language chip in English', async () => {
    await render(wrap(<PatientHome />));
    expect(screen.getByText('Hello, Rekha')).toBeTruthy();
    expect(screen.getByText('Services')).toBeTruthy();
    for (const s of ['Chat', 'Voice', 'Prescription', 'Nutrition', 'Nearby care', 'QR card', 'Blood banks', 'Reports'])
      expect(screen.getByText(s)).toBeTruthy();
    // One way into the assistant: the voice card, with "Type instead" for text chat.
    expect(screen.queryByText('AI Health Assistant')).toBeNull();
    expect(screen.getByText('Talk to Aroghya Mitra')).toBeTruthy();
    expect(screen.getByTestId('type-instead')).toBeTruthy();
    expect(screen.getByTestId('language-chip')).toBeTruthy();
    expect(screen.getByTestId('sync-status')).toBeTruthy();
    // Home must not show invented vitals: the app has no live source for them.
    expect(screen.queryByText('Heart rate')).toBeNull();
    expect(screen.queryByText('Weight')).toBeNull();
    // Real doses from the reminder plan (which ones depends on the time of day), never the old placeholder list.
    expect(screen.queryByText('Metformin 500 mg')).toBeNull();
    const card = screen.getByTestId('reminders-card');
    expect(card).toBeTruthy();
  });

  it('renders in Urdu', async () => {
    await useLanguage('ur');
    await render(wrap(<PatientHome />));
    expect(screen.getByText('خدمات')).toBeTruthy();
    expect(screen.getByText('آروگیہ مترا سے بات کریں')).toBeTruthy();
    expect(screen.queryByText('Services')).toBeNull();
  });
});
