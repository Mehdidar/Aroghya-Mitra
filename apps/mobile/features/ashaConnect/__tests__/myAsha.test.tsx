import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MyAshaScreen from '@/app/(patient)/my-asha';
import { mergeMessages } from '@/features/ashaConnect/patient/useMyAsha';
import type { AshaCard, AshaMessage } from '@/features/ashaConnect/types';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';

const mockApiJson = jest.fn();
jest.mock('@/features/shared/services/api', () => {
  const actual = jest.requireActual('@/features/shared/services/api');
  return { ...actual, apiJson: (...args: unknown[]) => mockApiJson(...args) };
});

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
    useLocalSearchParams: () => ({}),
    usePathname: () => '/my-asha',
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
  };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

const PID = '33333333-3333-4333-8333-000000000001';
const SUNITA: AshaCard = { id: '22222222-2222-4222-8222-000000000002', fullName: 'Sunita Devi', phone: '+91 98450 12345', areas: ['Hebbal', 'Kempapura'], lastVisitAt: null };

const msg = (over: Partial<AshaMessage> = {}): AshaMessage => ({
  id: 'm1',
  patientId: PID,
  ashaId: SUNITA.id,
  from: 'patient',
  senderId: 'u1',
  kind: 'text',
  body: 'Hello',
  visitWhen: null,
  status: null,
  scheduledFor: null,
  urgent: false,
  emergencyCategories: [],
  createdAt: '2026-11-14T05:00:00.000Z',
  updatedAt: '2026-11-14T05:00:00.000Z',
  readAt: null,
  ...over,
});

type Routes = {
  mine?: unknown;
  find?: unknown;
  messages?: AshaMessage[];
  send?: (body: { kind: string; body: string; visitWhen?: string }) => unknown;
};

function serve(r: Routes) {
  mockApiJson.mockImplementation(async (path: string, body?: unknown) => {
    if (path.startsWith('/asha/connect/mine')) {
      if (r.mine instanceof Error) throw r.mine;
      return r.mine;
    }
    if (path === '/asha/connect/find') return r.find;
    if (path.startsWith('/asha/messages/read')) return { ok: true, read: 0 };
    if (path.startsWith('/asha/messages') && body === undefined) return { ok: true, serverTime: '2026-11-14T06:00:00.000Z', messages: r.messages ?? [] };
    if (path === '/asha/messages') return r.send?.(body as { kind: string; body: string });
    throw new Error(`unexpected ${path}`);
  });
}

beforeEach(async () => {
  useSession.setState({ role: 'patient', language: 'en', onboarded: true });
  mockApiJson.mockReset();
  await AsyncStorage.clear();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('My ASHA: assigned', () => {
  it('shows her name, villages, honest last visit and a Call button for her real number', async () => {
    serve({ mine: { ok: true, patientId: PID, area: 'Hebbal', asha: SUNITA, waitingSince: null } });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(wrap(<MyAshaScreen />));
    await waitFor(() => expect(screen.getByText('Sunita Devi')).toBeTruthy());
    expect(screen.getByTestId('screen-my-asha')).toBeTruthy();
    expect(screen.getByText('Villages: Hebbal, Kempapura')).toBeTruthy();
    expect(screen.getByText('No visit recorded yet')).toBeTruthy();
    expect(screen.getByText('For an emergency call 108, do not wait for a reply.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('my-asha-call'));
    expect(open).toHaveBeenCalledWith('tel:+919845012345');
    expect(screen.getByTestId('my-asha-visit')).toBeTruthy();
    expect(screen.getByTestId('my-asha-callback')).toBeTruthy();
    expect(screen.queryByTestId('my-asha-find-input')).toBeNull();
    open.mockRestore();
  });

  it('has no Call button when no phone number is on record', async () => {
    serve({ mine: { ok: true, patientId: PID, area: 'Hebbal', asha: { ...SUNITA, phone: null }, waitingSince: null } });
    await render(wrap(<MyAshaScreen />));
    await waitFor(() => expect(screen.getByText('Sunita Devi')).toBeTruthy());
    expect(screen.queryByTestId('my-asha-call')).toBeNull();
  });

  it('shows request cards with the status the ASHA gave', async () => {
    serve({
      mine: { ok: true, patientId: PID, area: 'Hebbal', asha: SUNITA, waitingSince: null },
      messages: [
        msg({ id: 'r1', kind: 'visit_request', body: 'BP check', visitWhen: 'today', status: 'accepted', scheduledFor: '2026-11-18T05:30:00.000Z' }),
        msg({ id: 'r2', kind: 'call_request', body: '', visitWhen: 'today', status: 'declined', createdAt: '2026-11-14T05:10:00.000Z', updatedAt: '2026-11-14T05:10:00.000Z' }),
        msg({ id: 'a1', from: 'asha', senderId: SUNITA.id, body: 'I will come on Tuesday', createdAt: '2026-11-14T05:20:00.000Z', updatedAt: '2026-11-14T05:20:00.000Z' }),
      ],
    });
    await render(wrap(<MyAshaScreen />));
    await waitFor(() => expect(screen.getByTestId('my-asha-request-r1')).toBeTruthy());
    expect(screen.getByText(/^Sunita will visit on Wed/)).toBeTruthy();
    expect(screen.getByText('Declined')).toBeTruthy();
    expect(screen.getByText('I will come on Tuesday')).toBeTruthy();
    expect(mockApiJson).toHaveBeenCalledWith('/asha/messages/read', expect.anything());
  });

  it("shows the 108 emergency banner when the server flags the patient's message", async () => {
    const sent: unknown[] = [];
    serve({
      mine: { ok: true, patientId: PID, area: 'Hebbal', asha: SUNITA, waitingSince: null },
      send: (b) => {
        sent.push(b);
        return {
          ok: true,
          message: msg({ id: 'm9', body: b.body, urgent: true, emergencyCategories: ['pregnancy'] }),
          emergency: { categories: ['pregnancy'], contacts: [{ number: '108', labelKey: 'emergency.ambulance' }, { number: '112', labelKey: 'emergency.national' }] },
        };
      },
    });
    await render(wrap(<MyAshaScreen />));
    await waitFor(() => expect(screen.getByTestId('my-asha-input')).toBeTruthy());
    expect(screen.queryByTestId('emergency-banner')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('my-asha-input'), 'Something feels wrong with the baby');
    await fireEvent.press(screen.getByTestId('my-asha-send'));
    await waitFor(() => expect(screen.getByTestId('emergency-banner')).toBeTruthy());
    expect(screen.getByTestId('call-108')).toBeTruthy();
    expect(screen.getByTestId('call-112')).toBeTruthy();
    expect(sent).toEqual([{ kind: 'text', body: 'Something feels wrong with the baby' }]);
    expect(screen.getByText('Marked urgent')).toBeTruthy();
  });

  it('shows the 108 banner from the on-device check even when the message cannot be sent', async () => {
    serve({
      mine: { ok: true, patientId: PID, area: 'Hebbal', asha: SUNITA, waitingSince: null },
      send: () => {
        throw new TypeError('Network request failed');
      },
    });
    await render(wrap(<MyAshaScreen />));
    await waitFor(() => expect(screen.getByTestId('my-asha-input')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('my-asha-input'), 'I have heavy bleeding');
    await fireEvent.press(screen.getByTestId('my-asha-send'));
    await waitFor(() => expect(screen.getByTestId('emergency-banner')).toBeTruthy());
    expect(screen.getByTestId('call-108')).toBeTruthy();
    expect(screen.getByText(/^Not sent\. You are offline/)).toBeTruthy();
    // The text stays in the box so it can be sent again.
    expect(screen.getByTestId('my-asha-input').props.value).toBe('I have heavy bleeding');
  });

  it('sends a visit request with the chosen day', async () => {
    const sent: unknown[] = [];
    serve({
      mine: { ok: true, patientId: PID, area: 'Hebbal', asha: SUNITA, waitingSince: null },
      send: (b) => {
        sent.push(b);
        return { ok: true, message: msg({ id: 'v1', kind: 'visit_request', body: b.body, visitWhen: 'tomorrow', status: 'open' }), emergency: null };
      },
    });
    await render(wrap(<MyAshaScreen />));
    await waitFor(() => expect(screen.getByTestId('my-asha-visit')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('my-asha-visit'));
    await fireEvent.press(screen.getByTestId('my-asha-visit-tomorrow'));
    await fireEvent.press(screen.getByTestId('my-asha-visit-send'));
    await waitFor(() => expect(screen.getByText('Visit request sent to Sunita')).toBeTruthy());
    expect(sent).toEqual([{ kind: 'visit_request', body: '', visitWhen: 'tomorrow' }]);
    expect(screen.getByText('Waiting for Sunita to reply')).toBeTruthy();
  });
});

describe('My ASHA: not assigned', () => {
  it('shows the find form prefilled with the saved village, then the PHC waiting state', async () => {
    serve({
      mine: { ok: true, patientId: PID, area: 'Yelahanka', asha: null, waitingSince: null },
      find: { ok: true, patientId: PID, area: 'Yelahanka', asha: null, waitingSince: '2026-11-14T05:00:00.000Z', method: 'waiting' },
    });
    await render(wrap(<MyAshaScreen />));
    await waitFor(() => expect(screen.getByTestId('my-asha-find-input')).toBeTruthy());
    expect(screen.getByTestId('my-asha-find-input').props.value).toBe('Yelahanka');
    expect(screen.queryByTestId('my-asha-send')).toBeNull();
    await fireEvent.press(screen.getByTestId('my-asha-find-submit'));
    await waitFor(() => expect(screen.getByText('Request sent to PHC Hebbal')).toBeTruthy());
    expect(screen.getByText(/The PHC will assign an ASHA to you/)).toBeTruthy();
    expect(screen.getByText(/^Requested on/)).toBeTruthy();
  });

  it('assigns at once when an ASHA covers the village', async () => {
    serve({
      mine: { ok: true, patientId: PID, area: null, asha: null, waitingSince: null },
      find: { ok: true, patientId: PID, area: 'Hebbal', asha: SUNITA, waitingSince: null, method: 'area_match' },
    });
    await render(wrap(<MyAshaScreen />));
    await waitFor(() => expect(screen.getByTestId('my-asha-find-input')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('my-asha-find-submit'));
    expect(screen.getByText('Please type your village or area.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('my-asha-find-input'), 'Hebbal');
    await fireEvent.press(screen.getByTestId('my-asha-find-submit'));
    await waitFor(() => expect(screen.getByText('We found your ASHA: Sunita Devi')).toBeTruthy());
    expect(screen.getByTestId('my-asha-card')).toBeTruthy();
  });

  it('says so honestly when offline with nothing saved', async () => {
    serve({ mine: new TypeError('Network request failed') });
    await render(wrap(<MyAshaScreen />));
    await waitFor(() => expect(screen.getByTestId('my-asha-offline')).toBeTruthy());
    expect(screen.getByText('You are offline. Check your internet and try again.')).toBeTruthy();
    expect(screen.getByTestId('my-asha-retry')).toBeTruthy();
  });
});

describe('My ASHA: languages', () => {
  it('renders in Urdu and Kashmiri (right-to-left; the UI kit marks text direction)', async () => {
    serve({ mine: { ok: true, patientId: PID, area: 'Hebbal', asha: SUNITA, waitingSince: null } });
    await act(async () => {
      await i18n.changeLanguage('ur');
    });
    const { unmount } = await render(wrap(<MyAshaScreen />));
    await waitFor(() => expect(screen.getByText(/Sunita Devi/)).toBeTruthy());
    expect(screen.getByText(/میری آشا/)).toBeTruthy();
    expect(screen.getByText(/براہ کرم میرے گھر آئیں/)).toBeTruthy();
    unmount();
    await act(async () => {
      await i18n.changeLanguage('ks');
    });
    await render(wrap(<MyAshaScreen />));
    await waitFor(() => expect(screen.getByText(/Sunita Devi/)).toBeTruthy());
    expect(screen.getAllByText(/میٲنۍ آشا/)[0]).toBeTruthy();
  });
});

describe('mergeMessages', () => {
  it('keeps one row per id, the newer update wins, oldest first', () => {
    const a = msg({ id: 'x', status: 'open', kind: 'visit_request', createdAt: '2026-11-14T05:00:00Z', updatedAt: '2026-11-14T05:00:00Z' });
    const b = msg({ id: 'y', createdAt: '2026-11-14T04:00:00Z', updatedAt: '2026-11-14T04:00:00Z' });
    const a2 = { ...a, status: 'accepted' as const, updatedAt: '2026-11-14T06:00:00Z' };
    const out = mergeMessages([a], [a2, b]);
    expect(out.map((m) => m.id)).toEqual(['y', 'x']);
    expect(out[1].status).toBe('accepted');
  });
});
