import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BookScreen from '@/app/(patient)/appointments/book';
import AppointmentsScreen from '@/app/(patient)/appointments/index';
import DoctorAppointmentsScreen from '@/app/(doctor)/appointments-day';
import AvailabilityScreen from '@/app/(doctor)/availability';
import { formFromRules, toInput } from '@/features/appointments/availabilityForm';
import { formatTime, istDateOf, normaliseClock, weekdayName } from '@/features/appointments/format';
import { APPOINTMENT_REMINDER_KIND, planAppointmentReminders, syncAppointmentReminders } from '@/features/appointments/reminders';
import type { Appointment, SlotsResponse } from '@/features/appointments/types';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';

const mockApiJson = jest.fn();
jest.mock('@/features/shared/services/api', () => {
  const actual = jest.requireActual('@/features/shared/services/api');
  return { ...actual, apiJson: (...args: unknown[]) => mockApiJson(...args) };
});

const params: Record<string, string> = {};
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
    useLocalSearchParams: () => params,
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
  };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

const { ApiError } = jest.requireActual('@/features/shared/services/api');
const DOCTOR = '22222222-2222-4222-8222-000000000003';
const FACILITY = { id: '11111111-1111-4111-8111-000000000001', name: 'PHC Hebbal', phone: null };
const future = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString().replace(/:\d\d\.\d+Z$/, ':00.000Z');

const slotsResponse = (over: Partial<SlotsResponse> = {}): SlotsResponse => ({
  ok: true,
  facility: FACILITY,
  published: false,
  doctors: [],
  slots: [],
  from: '2026-11-15',
  to: '2026-11-28',
  timeZone: 'Asia/Kolkata',
  ...over,
});

const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1',
  patientId: 'p1',
  doctorId: DOCTOR,
  facilityId: FACILITY.id,
  startsAt: future(48),
  endsAt: future(48.25),
  status: 'booked',
  reason: 'BP check',
  bookedBy: null,
  createdAt: '',
  updatedAt: '',
  cancelledReason: null,
  rescheduledFrom: null,
  doctorName: 'Dr. Arjun Rao',
  patientName: null,
  facilityName: 'PHC Hebbal',
  facilityPhone: null,
  ...over,
});

beforeEach(async () => {
  useSession.setState({ role: 'patient', language: 'en', onboarded: true });
  mockApiJson.mockReset();
  for (const k of Object.keys(params)) delete params[k];
  await AsyncStorage.clear();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('Booking: never invented times', () => {
  it('with no published hours shows the honest empty state, without a phone number', async () => {
    mockApiJson.mockResolvedValue(slotsResponse());
    await render(wrap(<BookScreen />));
    await waitFor(() => expect(screen.getByTestId('book-empty')).toBeTruthy());
    expect(screen.getByText('No appointment times published yet')).toBeTruthy();
    expect(screen.getByText(/Please call or visit PHC Hebbal to book/)).toBeTruthy();
    expect(screen.queryByTestId('call-phc')).toBeNull();
    expect(screen.queryByTestId('book-confirm')).toBeNull();
  });

  it('shows the PHC number only when it is known', async () => {
    mockApiJson.mockResolvedValue(slotsResponse({ facility: { ...FACILITY, phone: '+91 80 2345 6789' } }));
    await render(wrap(<BookScreen />));
    await waitFor(() => expect(screen.getByTestId('call-phc')).toBeTruthy());
    expect(screen.getByText(/Call \+91 80 2345 6789 to book/)).toBeTruthy();
  });

  it('offline: says booking needs the internet and queues nothing', async () => {
    mockApiJson.mockRejectedValue(new TypeError('Network request failed'));
    await render(wrap(<BookScreen />));
    await waitFor(() => expect(screen.getByTestId('book-offline')).toBeTruthy());
    expect(screen.getByText(/Booking needs the internet/)).toBeTruthy();
    expect(mockApiJson.mock.calls.every((c) => c[1] === undefined)).toBe(true);
  });

  it('books a real published slot: day → time → reason → confirm', async () => {
    const s1 = future(30);
    const slots = [{ doctorId: DOCTOR, facilityId: FACILITY.id, startsAt: s1, endsAt: future(30.25) }];
    mockApiJson.mockImplementation(async (path: string, body?: unknown) => {
      if (path.startsWith('/appointments/slots')) return slotsResponse({ published: true, doctors: [{ id: DOCTOR, name: 'Dr. Arjun Rao' }], slots });
      if (path === '/appointments' && body) return { ok: true, appointment: appt({ startsAt: s1 }) };
      if (path.startsWith('/appointments/mine')) return { ok: true, patientId: 'p1', appointments: [appt({ startsAt: s1 })] };
      throw new Error(`unexpected ${path}`);
    });
    await render(wrap(<BookScreen />));
    await waitFor(() => expect(screen.getByTestId(`slot-${s1}`)).toBeTruthy());
    expect(screen.getAllByText('Dr. Arjun Rao').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PHC Hebbal').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId(`slot-${s1}`));
    await fireEvent.changeText(screen.getByTestId('book-reason'), 'BP check');
    await fireEvent.press(screen.getByTestId('book-confirm'));
    await waitFor(() => expect(screen.getByTestId('book-done')).toBeTruthy());
    expect(mockApiJson).toHaveBeenCalledWith('/appointments', { patientId: null, doctorId: DOCTOR, startsAt: s1, reason: 'BP check' }, expect.anything());
    expect(screen.getByText('Appointment booked')).toBeTruthy();
  });

  it('a slot taken in the meantime shows a clear message and reloads the times', async () => {
    const s1 = future(30);
    const slots = [{ doctorId: DOCTOR, facilityId: FACILITY.id, startsAt: s1, endsAt: future(30.25) }];
    mockApiJson.mockImplementation(async (path: string, body?: unknown) => {
      if (path.startsWith('/appointments/slots')) return slotsResponse({ published: true, doctors: [{ id: DOCTOR, name: 'Dr. Arjun Rao' }], slots });
      if (path === '/appointments' && body) throw new ApiError(409, 'taken', { ok: false, reason: 'slot_taken' });
      throw new Error(path);
    });
    await render(wrap(<BookScreen />));
    await waitFor(() => expect(screen.getByTestId(`slot-${s1}`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`slot-${s1}`));
    await fireEvent.press(screen.getByTestId('book-confirm'));
    await waitFor(() => expect(screen.getByText('Someone just booked that time. Please choose another.')).toBeTruthy());
  });
});

describe('My appointments', () => {
  it('lists upcoming with reschedule / cancel, and cancel asks first', async () => {
    mockApiJson.mockImplementation(async (path: string, body?: unknown) => {
      if (path.startsWith('/appointments/mine')) return { ok: true, patientId: 'p1', appointments: [appt()] };
      if (path === '/appointments/a1/cancel') return { ok: true, appointment: appt({ status: 'cancelled' }) };
      throw new Error(`${path} ${JSON.stringify(body)}`);
    });
    await render(wrap(<AppointmentsScreen />));
    await waitFor(() => expect(screen.getByTestId('appointment-a1')).toBeTruthy());
    expect(screen.getByTestId('explain-appointments')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cancel-a1'));
    expect(screen.getByText('Cancel this appointment?')).toBeTruthy();
    expect(mockApiJson).not.toHaveBeenCalledWith('/appointments/a1/cancel', expect.anything(), expect.anything());
    await fireEvent.press(screen.getByTestId('cancel-dialog-confirm'));
    await waitFor(() => expect(mockApiJson).toHaveBeenCalledWith('/appointments/a1/cancel', { reason: null }, expect.anything()));
  });

  it('with nothing booked says so (no placeholder appointments)', async () => {
    mockApiJson.mockResolvedValue({ ok: true, patientId: 'p1', appointments: [] });
    await render(wrap(<AppointmentsScreen />));
    await waitFor(() => expect(screen.getByTestId('appointments-none')).toBeTruthy());
  });
});

describe('Doctor screens', () => {
  beforeEach(() => useSession.setState({ role: 'doctor' }));

  it("today's list shows the patient and offers confirm / complete", async () => {
    mockApiJson.mockImplementation(async (path: string) => {
      if (path.startsWith('/appointments/doctor')) return { ok: true, date: '2026-11-16', appointments: [appt({ patientName: 'Rekha Kumari' })] };
      if (path === '/appointments/a1/confirm') return { ok: true, appointment: appt({ status: 'confirmed' }) };
      throw new Error(path);
    });
    await render(wrap(<DoctorAppointmentsScreen />));
    await waitFor(() => expect(screen.getByText('Rekha Kumari')).toBeTruthy());
    expect(screen.queryByTestId('noshow-a1')).toBeNull();
    await fireEvent.press(screen.getByTestId('confirm-a1'));
    await fireEvent.press(screen.getByTestId('doctor-dialog-confirm'));
    await waitFor(() => expect(mockApiJson).toHaveBeenCalledWith('/appointments/a1/confirm', {}, expect.anything()));
  });

  it('availability: the labelled admin template fills the form and Publish sends it', async () => {
    mockApiJson.mockImplementation(async (path: string, body?: unknown) => {
      if (path.startsWith('/availability') && body === undefined) return { ok: true, facility: FACILITY, doctors: [{ id: DOCTOR, name: 'Dr. Arjun Rao' }], rules: [], timeZone: 'Asia/Kolkata' };
      if (path === '/availability') return { ok: true, doctorId: DOCTOR, rules: [] };
      throw new Error(path);
    });
    await render(wrap(<AvailabilityScreen />));
    await waitFor(() => expect(screen.getByTestId('availability-template')).toBeTruthy());
    expect(screen.getByText(/Nothing published yet/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('availability-template'));
    await fireEvent.press(screen.getByTestId('availability-publish'));
    await waitFor(() => expect(mockApiJson).toHaveBeenCalledWith('/availability', expect.objectContaining({ slotMinutes: 15 }), expect.objectContaining({ method: 'PUT' })));
    const body = mockApiJson.mock.calls.find((c) => c[0] === '/availability' && c[1])![1];
    expect(body.weekly.map((w: { weekday: number }) => w.weekday).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.weekly[0]).toMatchObject({ start: '09:00', end: '13:00' });
  });
});

describe('Helpers', () => {
  it('formats in India time', () => {
    expect(istDateOf('2026-11-15T19:00:00.000Z')).toBe('2026-11-16');
    expect(formatTime('2026-11-16T03:30:00.000Z', 'en')).toMatch(/9:00/);
    expect(weekdayName(1, 'en')).toBe('Monday');
    expect(normaliseClock('9')).toBe('09:00');
    expect(normaliseClock('0930')).toBe('09:30');
    expect(normaliseClock('25:00')).toBeNull();
  });

  it('availability form round-trips and refuses bad times', () => {
    const f = formFromRules([
      { id: '1', doctorId: 'd', facilityId: 'f', weekday: 1, specificDate: null, closed: false, startTime: '09:00', endTime: '13:00', slotMinutes: 20, validFrom: null, validTo: null, createdBy: null, createdAt: '' },
      { id: '2', doctorId: 'd', facilityId: 'f', weekday: null, specificDate: '2026-12-25', closed: true, startTime: null, endTime: null, slotMinutes: 20, validFrom: null, validTo: null, createdBy: null, createdAt: '' },
    ]);
    expect(toInput(f, undefined, '2026-11-15')).toEqual({ doctorId: undefined, slotMinutes: 20, weekly: [{ weekday: 1, start: '09:00', end: '13:00' }], exceptions: [{ date: '2026-12-25', closed: true }], validFrom: '2026-11-15' });
    expect(toInput({ ...f, weekly: { 1: [{ start: '13:00', end: '09:00' }] } }, undefined, '2026-11-15')).toBeNull();
  });

  it('plans reminders a day and an hour before, only for active future appointments', () => {
    const now = new Date('2026-11-15T00:00:00.000Z');
    const plan = planAppointmentReminders(
      [
        { id: 'a', startsAt: '2026-11-17T04:00:00.000Z', status: 'booked' },
        { id: 'b', startsAt: '2026-11-15T05:00:00.000Z', status: 'confirmed' },
        { id: 'c', startsAt: '2026-11-18T04:00:00.000Z', status: 'cancelled' },
      ],
      now,
    );
    expect(plan.map((p) => p.id)).toEqual(['appt-a-day', 'appt-a-hour', 'appt-b-hour']);
    expect(plan[0].at.toISOString()).toBe('2026-11-16T04:00:00.000Z');
  });

  it('sync cancels reminders of cancelled / moved appointments and leaves dose reminders alone', async () => {
    const scheduled: { identifier: string; content: { data: Record<string, unknown> } }[] = [
      { identifier: 'appt-old-hour', content: { data: { kind: APPOINTMENT_REMINDER_KIND, at: 'x' } } },
      { identifier: 'dose-1', content: { data: { kind: 'dose-reminder' } } },
    ];
    const N = {
      getAllScheduledNotificationsAsync: jest.fn(async () => scheduled),
      cancelScheduledNotificationAsync: jest.fn(async () => undefined),
      scheduleNotificationAsync: jest.fn(async () => 'id'),
      SchedulableTriggerInputTypes: { DATE: 'date' },
    };
    const plan = planAppointmentReminders([{ id: 'new', startsAt: '2026-11-17T04:00:00.000Z', status: 'booked' }], new Date('2026-11-15T00:00:00.000Z'));
    const r = await syncAppointmentReminders(N as never, plan, () => ({ title: 't', body: 'b' }));
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('appt-old-hour');
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('dose-1');
    expect(r).toEqual({ scheduled: 2, cancelled: 1, kept: 0 });
  });
});
