import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppointmentsScreen from '@/app/(patient)/appointments';
import HealthInsightsScreen from '@/app/(patient)/insights';
import UploadHealthReport from '@/app/(patient)/upload-report';
import VoiceConsultation from '@/app/(patient)/voice';
import PatientAssistant from '@/app/(patient)/assistant';
import PatientRecords from '@/app/(patient)/(tabs)/health';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

describe('Patient UI Screens (from Design Images)', () => {
  beforeEach(async () => {
    useSession.setState({ role: 'patient', language: 'en', onboarded: true });
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  describe('Health hub (records tab)', () => {
    it('renders the vitals stat cards, tools and recent reports from the seeded records', async () => {
      await render(wrap(<PatientRecords />));
      expect(screen.getByText('My health')).toBeTruthy();
      expect(screen.getByText('Blood group')).toBeTruthy();
      expect(screen.getByText('Weight')).toBeTruthy();
      expect(screen.getByText('QR health card')).toBeTruthy();
      expect(screen.getByText('Recent reports')).toBeTruthy();
    });
  });

  describe('Upload Health Report Screen', () => {
    it('renders the picker, name field, categories and save button', async () => {
      await render(wrap(<UploadHealthReport />));
      expect(screen.getByText('Upload health report')).toBeTruthy();
      expect(screen.getByText('Choose a file')).toBeTruthy();
      expect(screen.getByText('Report name')).toBeTruthy();
      expect(screen.getByText('Blood test')).toBeTruthy();
      expect(screen.getByText('Save report')).toBeTruthy();
    });
  });

  describe('AI assistant screen', () => {
    it('renders the welcome card, starter chips and the input', async () => {
      await render(wrap(<PatientAssistant />));
      expect(await screen.findByText('How are you feeling?')).toBeTruthy();
      expect(screen.getByText('I have a fever')).toBeTruthy();
      expect(screen.getByText('Headache since morning')).toBeTruthy();
      expect(screen.getByTestId('chat-input')).toBeTruthy();
    });
  });

  describe('Voice assistant screen', () => {
    it('renders title, timer, the orb and call controls', async () => {
      await render(wrap(<VoiceConsultation />));
      expect(screen.getByText('Voice assistant')).toBeTruthy();
      expect(screen.getByText(/00:0\d/)).toBeTruthy();
      expect(screen.getByTestId('voice-orb')).toBeTruthy();
      expect(screen.getByLabelText('End')).toBeTruthy();
    });
  });

  describe('My Appointments Screen (Image 3 Right)', () => {
    it('renders upcoming appointments, past visits, and Make Appointment button', async () => {
      await render(wrap(<AppointmentsScreen />));
      expect(screen.getByText('My Appointments')).toBeTruthy();
      expect(screen.getByText('Upcoming')).toBeTruthy();
      expect(screen.getByText('Dr. Olivia Wilson')).toBeTruthy();
      expect(screen.getByText('Dermatologist')).toBeTruthy();
      expect(screen.getByText('Past Visits')).toBeTruthy();
      expect(screen.getByText('Make Appointment')).toBeTruthy();
    });
  });

  describe('Health Insights Screen (Image 4 Left)', () => {
    it('renders week in review, sleep consistency, activity, and sleep quality chart', async () => {
      await render(wrap(<HealthInsightsScreen />));
      expect(screen.getByText('Health insight')).toBeTruthy();
      expect(screen.getByText('Your week in review')).toBeTruthy();
      expect(screen.getByText('Sleep is getting more consistent')).toBeTruthy();
      expect(screen.getByText('Afternoon activity dipped')).toBeTruthy();
      expect(screen.getByText('Sleep quality')).toBeTruthy();
      expect(screen.getByText('+8%')).toBeTruthy();
      expect(screen.getByText('Discuss with Arogya AI')).toBeTruthy();
    });
  });
});

