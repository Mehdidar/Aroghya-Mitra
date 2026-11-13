import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppointmentsScreen from '@/app/(patient)/appointments';
import HealthInsightsScreen from '@/app/(patient)/insights';
import UploadHealthReport from '@/app/(patient)/upload-report';
import VoiceConsultation from '@/app/(patient)/voice';
import PatientAssistant from '@/app/(patient)/(tabs)/assistant';
import PatientRecords from '@/app/(patient)/(tabs)/records';
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

  describe('Records / Report Screen (Image 1 Right)', () => {
    it('renders heart rate with bpm, blood group, weight, and latest reports', async () => {
      await render(wrap(<PatientRecords />));
      expect(screen.getByText('Heart Rate')).toBeTruthy();
      expect(screen.getByText('96')).toBeTruthy();
      expect(screen.getByText('bpm')).toBeTruthy();
      expect(screen.getByText('Blood Group')).toBeTruthy();
      expect(screen.getByText('A+')).toBeTruthy();
      expect(screen.getByText('Weight')).toBeTruthy();
      expect(screen.getByText('80')).toBeTruthy();
      expect(screen.getByText('Latest Report')).toBeTruthy();
      expect(screen.getByText('General Health')).toBeTruthy();
      expect(screen.getByText('Diabetes')).toBeTruthy();
    });
  });

  describe('Upload Health Report Screen (Image 4 Right)', () => {
    it('renders upload dropzone, progress bar, supported reports, and analyze button', async () => {
      await render(wrap(<UploadHealthReport />));
      expect(screen.getByText('Upload health report')).toBeTruthy();
      expect(screen.getByText('Upload your file')).toBeTruthy();
      expect(screen.getByText('Health report.png')).toBeTruthy();
      expect(screen.getByText('82%')).toBeTruthy();
      expect(screen.getByText('Supported reports')).toBeTruthy();
      expect(screen.getByText('Analyze with AI')).toBeTruthy();
    });
  });

  describe('Symptom Checker / Assistant Screen (Image 4 Middle)', () => {
    it('renders how are you feeling, quick symptom chips, prompt counter, and input', async () => {
      await render(wrap(<PatientAssistant />));
      expect(screen.getByText('Symptom checker')).toBeTruthy();
      expect(screen.getByText('How are you feeling?')).toBeTruthy();
      expect(screen.getByText('Headache')).toBeTruthy();
      expect(screen.getByText('Fever')).toBeTruthy();
      expect(screen.getByText('You have 56 prompts left...')).toBeTruthy();
    });
  });

  describe('Voice Consultation Screen (Image 2)', () => {
    it('renders title, ticking timer, speech transcription, and call controls', async () => {
      await render(wrap(<VoiceConsultation />));
      expect(screen.getByText('AI Health Assistant')).toBeTruthy();
      expect(screen.getByText(/12:19|12:20/)).toBeTruthy();
      expect(screen.getByLabelText('Mute microphone')).toBeTruthy();
      expect(screen.getByLabelText('End call')).toBeTruthy();
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

