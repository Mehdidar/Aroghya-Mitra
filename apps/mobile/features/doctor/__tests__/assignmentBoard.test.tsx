import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DoctorAdmin from '@/app/(doctor)/(tabs)/admin';
import type { Board } from '@/features/ashaConnect/api';
import { AssignmentBoard } from '@/features/doctor/admin/AssignmentBoard';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';

// The board talks to the server only: GET/POST through apiJson, PUT /asha/areas through apiFetch.
const mockApiJson = jest.fn();
const mockApiFetch = jest.fn();
jest.mock('@/features/shared/services/api', () => {
  const actual = jest.requireActual('@/features/shared/services/api');
  return { ...actual, apiJson: (...a: unknown[]) => mockApiJson(...a), apiFetch: (...a: unknown[]) => mockApiFetch(...a) };
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useLocalSearchParams: () => ({}),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

const board = (canEdit: boolean): Board => ({
  canEdit,
  ashas: [
    { id: 'a1', fullName: 'Sunita Devi', phone: null, isActive: true, areas: ['Rampur'], caseload: 6, highRisk: 1, openRequests: 2 },
    { id: 'a2', fullName: 'Lakshmi Bai', phone: null, isActive: false, areas: [], caseload: 0, highRisk: 0, openRequests: 0 },
    { id: 'a3', fullName: 'Geeta Rani', phone: null, isActive: true, areas: ['Hebbal'], caseload: 2, highRisk: 0, openRequests: 0 },
  ],
  patients: [
    { id: 'p1', fullName: 'Kavya N', area: 'Rampur', ashaId: null, ashaName: null, highRisk: false, requestedAt: '2026-11-13T10:00:00.000Z', suggestion: { ashaId: 'a1', fullName: 'Sunita Devi', match: 'area', caseload: 6 }, lastChange: null },
    { id: 'p3', fullName: 'Anil K', area: null, ashaId: null, ashaName: null, highRisk: false, requestedAt: null, suggestion: { ashaId: 'a3', fullName: 'Geeta Rani', match: 'facility', caseload: 2 }, lastChange: null },
    { id: 'p2', fullName: 'Rekha Kumari', area: 'Hebbal', ashaId: 'a1', ashaName: 'Sunita Devi', highRisk: true, requestedAt: null, suggestion: null, lastChange: { method: 'admin', createdAt: '2026-11-01T09:00:00.000Z', reason: null } },
  ],
});

const serve = (b: Board) =>
  mockApiJson.mockImplementation(async (path: string) => {
    if (path === '/asha/assignments') return { ok: true, ...b };
    if (path === '/asha/assign') return { ok: true, patientId: 'x', ashaId: 'y' };
    throw new Error(`unexpected ${path}`);
  });
const calls = (path: string) => mockApiJson.mock.calls.filter((c) => c[0] === path);

beforeEach(async () => {
  mockApiJson.mockReset();
  mockApiFetch.mockReset();
  useSession.setState({ role: 'admin', language: 'en', onboarded: true });
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('ASHA assignment board (admin)', () => {
  it('lists the waiting patient with the suggested ASHA and assigns her in one tap', async () => {
    serve(board(true));
    await render(wrap(<AssignmentBoard />));
    await waitFor(() => expect(screen.getByTestId('waiting-p1')).toBeTruthy());
    expect(screen.getByText('Sunita Devi · covers Rampur · 6 on her list')).toBeTruthy();
    expect(screen.getByText('Geeta Rani · least busy at this PHC · 2 on her list')).toBeTruthy();
    expect(screen.getByText(/Rampur · Asked on/)).toBeTruthy();
    expect(screen.queryByTestId('waiting-p2')).toBeNull(); // Rekha already has an ASHA

    await fireEvent.press(screen.getByTestId('assign-suggested-p1'));
    await waitFor(() => expect(calls('/asha/assign')).toHaveLength(1));
    expect(calls('/asha/assign')[0][1]).toEqual({ patientId: 'p1', ashaId: 'a1', reason: undefined });
    // The board is fetched again after the change.
    await waitFor(() => expect(calls('/asha/assignments')).toHaveLength(2));
    expect(screen.getByTestId('board-notice')).toBeTruthy();
    expect(screen.getByText('Kavya N is now on Sunita Devi\'s list.')).toBeTruthy();
  });

  it('asks before moving a patient, sends the reason, and never lets an inactive ASHA be chosen', async () => {
    serve(board(true));
    await render(wrap(<AssignmentBoard />));
    await waitFor(() => expect(screen.getByTestId('row-p2')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('move-p2'));
    expect(screen.getByTestId('pick-all-p2-a2').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('pick-all-p2-a2'));
    expect(screen.queryByTestId('confirm-p2')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('move-reason-p2'), 'Family moved to Hebbal');
    await fireEvent.press(screen.getByTestId('pick-all-p2-a3'));
    expect(screen.getByText('Move Rekha Kumari from Sunita Devi to Geeta Rani?')).toBeTruthy();
    expect(calls('/asha/assign')).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('confirm-yes-p2'));
    await waitFor(() => expect(calls('/asha/assign')).toHaveLength(1));
    expect(calls('/asha/assign')[0][1]).toEqual({ patientId: 'p2', ashaId: 'a3', reason: 'Family moved to Hebbal' });
  });

  it('removes a patient from the list (ashaId null) after confirming', async () => {
    serve(board(true));
    await render(wrap(<AssignmentBoard />));
    await waitFor(() => expect(screen.getByTestId('row-p2')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('move-p2'));
    await fireEvent.press(screen.getByTestId('remove-p2'));
    expect(screen.getByText(/Take Rekha Kumari off Sunita Devi's list\?/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-yes-p2'));
    await waitFor(() => expect(calls('/asha/assign')).toHaveLength(1));
    expect(calls('/asha/assign')[0][1]).toEqual({ patientId: 'p2', ashaId: null, reason: undefined });
  });

  it('saves the villages an ASHA covers', async () => {
    serve(board(true));
    mockApiFetch.mockResolvedValue({ json: async () => ({ ok: true, ashaId: 'a1', areas: ['Rampur', 'Kodigehalli'] }) });
    await render(wrap(<AssignmentBoard />));
    await waitFor(() => expect(screen.getByTestId('areas-a1')).toBeTruthy());
    expect(screen.getByTestId('areas-a1').props.value).toBe('Rampur');
    await fireEvent.changeText(screen.getByTestId('areas-a1'), 'Rampur, Kodigehalli,');
    await fireEvent.press(screen.getByTestId('areas-save-a1'));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe('/asha/areas');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ ashaId: 'a1', areas: ['Rampur', 'Kodigehalli'] });
    await waitFor(() => expect(screen.getByText('Villages saved for Sunita Devi.')).toBeTruthy());
  });

  it('shows the server refusal for an inactive ASHA', async () => {
    serve(board(true));
    await render(wrap(<AssignmentBoard />));
    await waitFor(() => expect(screen.getByTestId('waiting-p1')).toBeTruthy());
    const { ApiError } = jest.requireActual('@/features/shared/services/api');
    mockApiJson.mockImplementation(async (path: string) => {
      if (path === '/asha/assignments') return { ok: true, ...board(true) };
      throw new ApiError(409, 'Conflict', { ok: false, reason: 'asha_inactive' });
    });
    await fireEvent.press(screen.getByTestId('assign-suggested-p1'));
    await waitFor(() => expect(screen.getByText('This ASHA is inactive and cannot take patients.')).toBeTruthy());
  });
});

describe('ASHA assignment board (doctor, read-only)', () => {
  it('shows the board without any way to change it', async () => {
    useSession.setState({ role: 'doctor' });
    serve(board(false));
    await render(wrap(<AssignmentBoard />));
    await waitFor(() => expect(screen.getByTestId('waiting-p1')).toBeTruthy());
    expect(screen.getByText('Read-only: only the PHC admin can change assignments')).toBeTruthy();
    expect(screen.getByText('Sunita Devi · covers Rampur · 6 on her list')).toBeTruthy();
    expect(screen.queryByTestId('assign-suggested-p1')).toBeNull();
    expect(screen.queryByTestId('choose-p1')).toBeNull();
    expect(screen.queryByTestId('move-p2')).toBeNull();
    expect(screen.queryByTestId('areas-a1')).toBeNull();
    expect(screen.getByText('Villages: Rampur')).toBeTruthy();
  });
});

describe('ASHA assignment board offline', () => {
  it('says honestly that assignments need the server, and retries', async () => {
    mockApiJson.mockRejectedValue(new TypeError('Network request failed'));
    await render(wrap(<AssignmentBoard />));
    await waitFor(() => expect(screen.getByTestId('board-error')).toBeTruthy());
    expect(screen.getByText('Assignments need the server')).toBeTruthy();
    serve(board(true));
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByTestId('waiting-p1')).toBeTruthy());
  });
});

describe('Admin screen', () => {
  it('shows the server board in place of the old phone-only assignment chips', async () => {
    serve(board(true));
    await render(wrap(<DoctorAdmin />));
    await waitFor(() => expect(screen.getByTestId('waiting-p1')).toBeTruthy());
    expect(screen.getByTestId('assignment-board')).toBeTruthy();
    expect(screen.queryAllByTestId(/^assign-(?!suggested-)/)).toHaveLength(0);
    await waitFor(() => expect(screen.getByTestId('stock-O+')).toBeTruthy());
  });
});
