import { toDbId } from '@am/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AshaHome from '@/app/(asha)/asha/index';
import MessagesScreen from '@/app/(asha)/asha/messages';
import ScanScreen from '@/app/(asha)/asha/scan';
import ThreadScreen from '@/app/(asha)/asha/thread/[patientId]';
import type { AshaMessage, ScanSummary } from '@/features/ashaConnect/types';
import i18n from '@/features/shared/i18n';
import { router as mockRouter } from 'expo-router';

import { resetInbox } from '../connect/useAshaInbox';
import { t as translate } from '../data/i18n';
import { dobFromAge } from '../logic/clinical';
import { config } from '../services/config';
import { AshaStore, MemoryKV } from '../store/store';
import type { Patient } from '../types';

const mockApiJson = jest.fn();
jest.mock('@/features/shared/services/api', () => {
  const actual = jest.requireActual('@/features/shared/services/api');
  return { ...actual, apiJson: (...args: unknown[]) => mockApiJson(...args) };
});

const mockParams: { patientId?: string } = {};
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
    Stack: { Screen: () => null },
    useLocalSearchParams: () => mockParams,
    usePathname: () => '/asha',
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
  };
});

jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn()] }));

// A fake ASHA context: a real store over memory, no network sync.
const mockAsha: Record<string, unknown> = {};
jest.mock('../store/AshaContext', () => ({ useAsha: () => mockAsha }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

const person = (id: string, name: string, phone?: string): Patient => ({ id, name, sex: 'F', dob: dobFromAge(28), village: 'Hebbal', categories: ['pregnant'], assignedAshaId: 'a1', phone });
const REKHA = toDbId('rekha_local');

let n = 0;
const msg = (over: Partial<AshaMessage>): AshaMessage => {
  n += 1;
  const at = over.createdAt ?? new Date(Date.now() - (100 - n) * 60_000).toISOString();
  return {
    id: `m${n}`,
    patientId: REKHA,
    ashaId: 'a1',
    from: 'patient',
    senderId: 'u1',
    kind: 'text',
    body: `hello ${n}`,
    visitWhen: null,
    status: null,
    scheduledFor: null,
    urgent: false,
    emergencyCategories: [],
    createdAt: at,
    updatedAt: at,
    readAt: null,
    ...over,
  };
};

let messages: AshaMessage[] = [];
function serve(extra: (path: string, body: unknown) => unknown = () => undefined) {
  mockApiJson.mockImplementation(async (path: string, body?: unknown) => {
    const r = extra(path, body);
    if (r !== undefined) return r;
    if (path.startsWith('/asha/messages/read')) return { ok: true, read: 1 };
    if (path.startsWith('/asha/messages') && body === undefined) return { ok: true, serverTime: new Date().toISOString(), messages };
    throw new Error(`unexpected ${path}`);
  });
}

const syncNow = jest.fn(async () => undefined);
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetInbox();
  config.apiUrl = 'http://test.local';
  const store = new AshaStore(new MemoryKV());
  await store.seed({ patients: { rekha_local: { ...person('rekha_local', 'Rekha Kumari', '9845000000'), updatedAt: '' }, sita: { ...person('sita', 'Sita'), updatedAt: '' } } });
  Object.assign(mockAsha, {
    ready: true,
    db: store.snapshot,
    store,
    user: { id: 'a1', role: 'asha', name: 'Sunita Devi' },
    lang: 'en',
    setLang: jest.fn(),
    t: (k: string, p?: Record<string, string | number>) => translate(k, 'en', p),
    sync: { kind: 'idle', lastSyncAt: '2026-11-14T00:00:00.000Z' },
    syncNow,
    online: true,
  });
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('ASHA messages inbox', () => {
  it('lists the urgent thread first with its reason, then requests, then newest', async () => {
    messages = [
      msg({ patientId: 'sita', body: 'Thank you', createdAt: new Date().toISOString() }),
      msg({ body: 'I am bleeding a lot', urgent: true, emergencyCategories: ['bleeding'] }),
    ];
    serve();
    await render(wrap(<MessagesScreen />));
    await waitFor(() => expect(screen.getAllByTestId(/^thread-row-/)).toHaveLength(2));
    const rows = screen.getAllByTestId(/^thread-row-/);
    expect(rows[0].props.testID).toBe(`thread-row-${REKHA}`);
    expect(screen.getByText(/Emergency sign: heavy bleeding/)).toBeTruthy();
    expect(screen.getByText('Rekha Kumari')).toBeTruthy();
  });

  it('says messages need the internet when no server is configured', async () => {
    config.apiUrl = '';
    serve();
    await render(wrap(<MessagesScreen />));
    expect(screen.getByTestId('messages-no-server')).toBeTruthy();
    expect(screen.getByText('Messages need an internet connection.')).toBeTruthy();
    expect(mockApiJson).not.toHaveBeenCalled();
  });
});

describe('ASHA home: today plan', () => {
  it('puts the emergency message and open requests in Today\'s plan with an unread count on Messages', async () => {
    const req = msg({ patientId: 'sita', kind: 'call_request', status: 'open', visitWhen: 'today', body: '' });
    messages = [msg({ body: 'Fits since morning', urgent: true, emergencyCategories: ['seizure'] }), req];
    serve();
    await render(wrap(<AshaHome />));
    await waitFor(() => expect(screen.getByTestId(`plan-urgent-${REKHA}`)).toBeTruthy());
    expect(screen.getByText('Emergency message: Rekha Kumari')).toBeTruthy();
    expect(screen.getByTestId(`plan-request-${req.id}`)).toBeTruthy();
    expect(screen.getByText('Sita asks you to call')).toBeTruthy();
    expect(screen.getByTestId('tile-messages').props.accessibilityLabel).toBe('Messages, 2 new');
    await act(async () => {
      fireEvent.press(screen.getByTestId('asha-scan-button'));
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/asha/scan');
    await act(async () => {
      fireEvent.press(screen.getByTestId(`plan-urgent-${REKHA}`));
    });
    expect(mockRouter.push).toHaveBeenCalledWith(`/asha/thread/${encodeURIComponent(REKHA)}`);
  });
});

describe('ASHA thread', () => {
  it('marks read, shows the urgent banner, accepts a visit for tomorrow and sends a reply', async () => {
    const req = msg({ kind: 'visit_request', status: 'open', visitWhen: 'tomorrow', body: 'BP check please' });
    messages = [msg({ body: 'Severe headache and blurred vision', urgent: true, emergencyCategories: ['pregnancy'] }), req];
    mockParams.patientId = encodeURIComponent(REKHA);
    const calls: { path: string; body: unknown }[] = [];
    serve((path, body) => {
      calls.push({ path, body });
      if (path === `/asha/messages/${req.id}/status`) {
        const b = body as { status: 'accepted'; scheduledFor: string };
        return { ok: true, message: { ...req, status: b.status, scheduledFor: b.scheduledFor, updatedAt: new Date().toISOString() } };
      }
      if (path === '/asha/messages' && body) {
        const b = body as { body: string };
        return { ok: true, message: msg({ from: 'asha', body: b.body, createdAt: new Date().toISOString() }), emergency: null };
      }
      return undefined;
    });
    await render(wrap(<ThreadScreen />));
    await waitFor(() => expect(screen.getByTestId('thread-urgent')).toBeTruthy());
    await waitFor(() => expect(calls.some((c) => c.path === '/asha/messages/read' && (c.body as { patientId: string }).patientId === REKHA)).toBe(true));
    expect(screen.getByTestId('thread-call-urgent')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId(`request-accept-${req.id}`));
    });
    expect(screen.getByText('When will you visit?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId(`request-confirm-${req.id}`));
    });
    const status = calls.find((c) => c.path === `/asha/messages/${req.id}/status`);
    expect(status).toBeTruthy();
    const sent = status!.body as { status: string; scheduledFor: string };
    expect(sent.status).toBe('accepted');
    // The patient asked for tomorrow: that day is preselected.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(new Date(sent.scheduledFor).getDate()).toBe(tomorrow.getDate());
    await waitFor(() => expect(screen.getByTestId(`request-done-${req.id}`)).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Call 108 now.'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('asha-reply-send'));
    });
    expect(calls.find((c) => c.path === '/asha/messages' && c.body)?.body).toEqual({ patientId: REKHA, kind: 'text', body: 'Call 108 now.' });
    // Her reply shows in the thread and answers the emergency: the banner (and its 108 quick reply chip) goes.
    await waitFor(() => expect(screen.queryByTestId('thread-urgent')).toBeNull());
    expect(screen.getAllByText('Call 108 now.')).toHaveLength(1);
    expect(screen.getByTestId('asha-reply-input').props.value).toBe('');
  });
});

describe('ASHA QR scan', () => {
  const summary: ScanSummary = {
    patient: { id: 'p9', fullName: 'Lakshmi', ageYears: null, sex: 'female', area: 'Kempapura', phone: null, bloodGroup: null, allergies: ['Penicillin'], conditions: [], pregnancyWeeks: 20 },
    latestVitals: { recordedAt: '2026-11-10T05:00:00.000Z', source: 'asha_visit', systolic: 142, diastolic: 92, hemoglobin: null, temperatureC: null, spo2: null, bloodSugarMgDl: null, weightKg: null },
    symptoms: [{ at: '2026-11-10T05:00:00.000Z', source: 'asha_visit', codes: ['severe_headache', 'fetal_movement_reduced', 'odd_code'], text: null }],
    openAlerts: [],
    medicines: [],
    lastConsultation: null,
    lastAshaVisit: null,
    assignedAsha: null,
  };

  it('shows the card honestly and adds an unassigned patient after a demo scan', async () => {
    const calls: string[] = [];
    serve((path) => {
      calls.push(path);
      if (path === '/asha/scan') return { ok: true, patientId: 'p9', summary, assignment: 'none', canAdd: true };
      if (path === '/asha/scan/add') return { ok: true, patientId: 'p9', added: true };
      return { ok: true, serverTime: '', messages: [] };
    });
    await render(wrap(<ScanScreen />));
    await act(async () => {
      fireEvent.press(screen.getByTestId('asha-scan-demo'));
    });
    await waitFor(() => expect(screen.getByTestId('asha-scan-result')).toBeTruthy());
    expect(screen.getByText('Penicillin')).toBeTruthy();
    expect(screen.getByText('Pregnant: 20 weeks')).toBeTruthy();
    expect(screen.getByText('142/92 mmHg')).toBeTruthy();
    expect(screen.getByText('Severe headache, Fetal movement: Reduced, Odd code')).toBeTruthy();
    // Missing values say so; nothing is invented.
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThanOrEqual(4);
    await act(async () => {
      fireEvent.press(screen.getByTestId('asha-scan-add'));
    });
    expect(calls).toContain('/asha/scan/add');
    expect(syncNow).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('The patient will appear on your phone after the next sync. Try again when online.')).toBeTruthy());
  });

  it('tells the ASHA to ask for history sharing when consent is off', async () => {
    serve((path) => (path === '/asha/scan' ? { ok: false, reason: 'consent_off' } : { ok: true, serverTime: '', messages: [] }));
    await render(wrap(<ScanScreen />));
    await act(async () => {
      fireEvent.press(screen.getByTestId('asha-scan-demo'));
    });
    await waitFor(() => expect(screen.getByText(/turn on "Share my history" in their profile/)).toBeTruthy());
  });
});
