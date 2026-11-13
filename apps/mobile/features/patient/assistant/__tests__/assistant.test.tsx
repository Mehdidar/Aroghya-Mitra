import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PatientAssistant from '@/app/(patient)/assistant';
import VoiceConsultation from '@/app/(patient)/voice';
import { DietPreferences } from '@/features/patient/assistant/DietPreferences';
import { dietForChat, parseAvoidList, useDietPreferences } from '@/features/patient/assistant/preferences';
import { streamChat } from '@/features/patient/chat/chatClient';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';
import { speak } from '@/features/patient/voice/speech';

jest.mock('@/features/patient/voice/speech', () => ({
  speak: jest.fn(async () => 'device'),
  stopSpeaking: jest.fn(async () => undefined),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;
const REKHA = '33333333-3333-4333-8333-000000000001';

const sse = (events: object[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

const IBUPROFEN_EVENTS = [
  { type: 'context', used: ['pregnancy', 'allergies', 'medicines'], personalised: true, pregnancyWeeks: 34 },
  { type: 'warning', code: 'nsaid_pregnancy', text: 'server text', params: { weeks: 34, item: 'ibuprofen' }, escalate: false },
  { type: 'sources', sources: [] },
  { type: 'delta', text: 'Your record shows you are about 34 weeks pregnant. Ask your doctor.' },
  { type: 'done' },
];

let realFetch: typeof fetch;
beforeEach(async () => {
  realFetch = globalThis.fetch;
  useSession.setState({ role: 'patient', language: 'en', onboarded: true, patientId: null });
  useDietPreferences.getState().reset();
  (speak as jest.Mock).mockClear();
  await AsyncStorage.clear();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('food preferences', () => {
  it('parses the avoid list and builds the chat payload', () => {
    expect(parseAvoidList(' brinjal, Peanuts,, BRINJAL ;okra')).toEqual(['brinjal', 'Peanuts', 'okra']);
    expect(dietForChat()).toBeNull();
    useDietPreferences.setState({ dietType: 'jain', noOnionGarlic: true, avoid: ['okra'] });
    expect(dietForChat()).toEqual({ type: 'jain', noOnionGarlic: true, avoid: ['okra'] });
  });

  it('DietPreferences edits the store', async () => {
    await render(wrap(<DietPreferences />));
    expect(screen.getByText('Food preferences')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('diet-type-veg'));
    });
    await act(async () => {
      fireEvent(screen.getByTestId('diet-no-onion-garlic'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('diet-avoid'), 'brinjal, peanuts');
    });
    await act(async () => {
      fireEvent(screen.getByTestId('diet-avoid'), 'blur');
    });
    expect(useDietPreferences.getState()).toMatchObject({ dietType: 'veg', noOnionGarlic: true, avoid: ['brinjal', 'peanuts'] });
  });
});

describe('personalised chat', () => {
  it('sends the patient id, food preferences and history as { role, content }', async () => {
    const fetchImpl = jest.fn(async () => sse([{ type: 'done' }]));
    for await (const _ of streamChat({ message: 'hi', history: [{ role: 'user', text: 'earlier' }], language: 'en', patientId: REKHA, diet: { type: 'veg' } }, { fetchImpl: fetchImpl as unknown as typeof fetch })) void _;
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ message: 'hi', history: [{ role: 'user', content: 'earlier' }], language: 'en', mode: 'text', patientId: REKHA, diet: { type: 'veg' } });
  });

  it('shows the warning card, the "based on" chip and the "Why this answer?" details', async () => {
    useDietPreferences.setState({ dietType: 'veg', noOnionGarlic: false, avoid: [] });
    const fetchMock = jest.fn(async () => sse(IBUPROFEN_EVENTS));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await render(wrap(<PatientAssistant />));
    await screen.findByText('How are you feeling?');
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('chat-input'), 'Can I take ibuprofen?');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-send'));
    });
    await waitFor(() => expect(screen.getByTestId('chat-warning-nsaid_pregnancy')).toBeTruthy());
    expect(screen.getByText(/Painkillers like ibuprofen are usually avoided after 20 weeks/)).toBeTruthy();
    expect(screen.getByText('Personalised for you · based on: pregnancy 34 wks, allergy, your medicines')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-why'));
    });
    expect(screen.getByText('• Pregnancy: your record shows about 34 weeks.')).toBeTruthy();
    const body = JSON.parse(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string));
    expect(body.patientId).toBe(REKHA);
    expect(body.diet).toEqual({ type: 'veg' });
  });

  it('says so when the record could not be used', async () => {
    globalThis.fetch = jest.fn(async () => sse([{ type: 'context', used: [], personalised: false, reason: 'not_permitted' }, { type: 'delta', text: 'General advice.' }, { type: 'done' }])) as unknown as typeof fetch;
    await render(wrap(<PatientAssistant />));
    await screen.findByText('How are you feeling?');
    await act(async () => {
      fireEvent.press(screen.getByText('I have a fever'));
    });
    await waitFor(() => expect(screen.getByTestId('chat-not-personalised')).toBeTruthy());
  });

  it('offline, the demo patient gets a demo reply that knows her record', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    await render(wrap(<PatientAssistant />));
    await screen.findByText('How are you feeling?');
    await act(async () => {
      fireEvent.press(screen.getByText('My BP is high'));
    });
    await waitFor(() => expect(screen.getByText('Demo answer · server not reachable')).toBeTruthy());
    expect(screen.getByText(/^Demo answer: .*For you: your record shows high BP in pregnancy/)).toBeTruthy();
    expect(screen.getByTestId('chat-personalised')).toBeTruthy();
  });

  it('a real patient does not get the demo patient’s record offline', async () => {
    useSession.setState({ patientId: 'real-patient-1' });
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    await render(wrap(<PatientAssistant />));
    await screen.findByText('How are you feeling?');
    await act(async () => {
      fireEvent.press(screen.getByText('My BP is high'));
    });
    await waitFor(() => expect(screen.getByText('Demo answer · server not reachable')).toBeTruthy());
    expect(screen.queryByText(/For you:/)).toBeNull();
  });

  it('voice mode speaks the warnings first', async () => {
    globalThis.fetch = jest.fn(async () => sse(IBUPROFEN_EVENTS)) as unknown as typeof fetch;
    await render(wrap(<VoiceConsultation />));
    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-sample-bp'));
    });
    await waitFor(() => expect(speak).toHaveBeenCalled());
    const spoken = (speak as jest.Mock).mock.calls[0][0] as string;
    expect(spoken.endsWith('Your record shows you are about 34 weeks pregnant. Ask your doctor.')).toBe(true);
    expect(spoken.startsWith('Your record shows you are about 34 weeks pregnant. Painkillers')).toBe(true);
  });
});
