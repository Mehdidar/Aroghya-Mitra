import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { addDays, addMonths, demoPrevention, preventionPlan, toDay, type PreventionPerson } from '@am/patient-ai/prevention/index';
import { DEMO_IDS } from '@am/shared';

import { ApiError } from '@/features/shared/services/api';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';
import { flushQueue, usePreventionOutbox } from '@/features/prevention/outbox';
import { withPending } from '@/features/prevention/person';
import { buildRecord } from '@/features/prevention/RecordForms';
import { PREVENTION_KIND, remindAbout, reminderTime } from '@/features/prevention/reminders';
import type { PendingRecord } from '@/features/prevention/types';
import PreventionScreen from '@/app/(patient)/prevention';
import AshaPrevention from '@/app/(asha)/asha/prevention/[patientId]';

jest.mock('@/features/shared/services/api', () => {
  const actual = jest.requireActual('@/features/shared/services/api');
  return { ...actual, apiJson: jest.fn(async () => Promise.reject(new Error('offline'))) };
});

const params: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useLocalSearchParams: () => params,
  Stack: { Screen: () => null },
}));

const sitaBaby = () => {
  const today = toDay(new Date());
  return { id: 'demo_p3', name: 'Baby of Sita', sex: 'M' as const, dob: addDays(today, -9), village: 'Rampur', categories: ['newborn' as const], assignedAshaId: DEMO_IDS.asha, newborn: { birthWeightKg: 2.2 } };
};
jest.mock('@/features/asha/store/AshaContext', () => ({
  useAsha: () => {
    const p = sitaBaby();
    return { db: { patients: { [p.id]: p }, visits: {} }, store: { visitsFor: () => [] }, lang: 'en', t: (k: string) => k, user: { id: 'asha' } };
  },
}));

const item = (over: Partial<PendingRecord> = {}): PendingRecord => ({ kind: 'growth', patientId: 'p1', record: { id: 'r1', measuredOn: '2026-11-01', weightKg: 3 }, queuedAt: '2026-11-01T00:00:00Z', tries: 0, ...over });
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

beforeEach(async () => {
  usePreventionOutbox.setState({ queue: [], cache: {} });
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('prevention outbox', () => {
  it('drops sent items, keeps network failures for retry and keeps 4xx refusals with the reason', async () => {
    const queue = [item({ record: { id: 'a' } }), item({ record: { id: 'b' } }), item({ record: { id: 'c' } })];
    const { remaining, sent } = await flushQueue(queue, async (q) => {
      if (q.record.id === 'b') throw new Error('network');
      if (q.record.id === 'c') throw new ApiError(400, 'bad', { error: 'Unknown vaccine code' });
    });
    expect(sent).toBe(1);
    expect(remaining.map((r) => r.record.id)).toEqual(['b', 'c']);
    expect(remaining[0].rejected).toBeUndefined();
    expect(remaining[0].tries).toBe(1);
    expect(remaining[1].rejected).toBe('Unknown vaccine code');
    // A refused item is not sent again.
    const send = jest.fn(async () => undefined);
    const again = await flushQueue(remaining, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(again.remaining.map((r) => r.record.id)).toEqual(['c']);
  });

  it('queued records show in the plan before they sync', () => {
    const today = toDay(new Date());
    const dob = addDays(today, -50);
    const person: PreventionPerson = { dob, sex: 'female', vaccinations: [] };
    const merged = withPending(person, 'kid', [item({ kind: 'vaccination', patientId: 'kid', record: { id: 'v', vaccineCode: 'penta', dose: 1, givenOn: today } })]);
    expect(preventionPlan(merged, today).items.find((i) => i.id === 'uip:penta:1')?.status).toBe('done');
    expect(withPending(person, 'other', merged.vaccinations ? [] : []).vaccinations).toEqual([]);
  });
});

describe('ASHA record form', () => {
  const today = '2026-11-14';
  it('builds valid records and refuses bad input', () => {
    expect(buildRecord('growth', { weight: '2,4', date: today }, today)).toEqual({ kind: 'growth', record: { measuredOn: today, weightKg: 2.4, heightCm: null, muacCm: null } });
    expect(buildRecord('growth', { date: today }, today)).toEqual({ error: 'empty' });
    expect(buildRecord('growth', { weight: 'abc' }, today)).toEqual({ error: 'number' });
    expect(buildRecord('screening', { kind: 'bp', systolic: '150', diastolic: '100' }, today)).toEqual({ kind: 'screening', record: { kind: 'bp', screenedOn: today, value: { systolic: 150, diastolic: 100 } } });
    expect(buildRecord('screening', { kind: 'bp', systolic: '80', diastolic: '120' }, today)).toEqual({ error: 'range' });
    expect(buildRecord('screening', { kind: 'oral' }, today)).toEqual({ error: 'pickResult' });
    expect(buildRecord('vaccine', { date: '2027-01-01' }, today)).toEqual({ error: 'date' });
    expect(buildRecord('vaccine', {}, today)).toEqual({ error: 'pickVaccine' });
  });
});

describe('Remind me', () => {
  it('reminds at 9 am on the due day, or tomorrow when that has passed', () => {
    const now = new Date(2026, 10, 14, 15);
    expect(reminderTime('2026-12-09', now)).toEqual(new Date(2026, 11, 9, 9));
    expect(reminderTime('2026-11-01', now)).toEqual(new Date(2026, 10, 15, 9));
  });

  it('schedules one prevention notification through the shared permission helper', async () => {
    const scheduled: unknown[] = [];
    const N = {
      getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
      requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
      setNotificationChannelAsync: async () => undefined,
      setNotificationCategoryAsync: async () => undefined,
      scheduleNotificationAsync: async (r: unknown) => (scheduled.push(r), 'id'),
      cancelScheduledNotificationAsync: async () => undefined,
      getAllScheduledNotificationsAsync: async () => [],
      AndroidImportance: { HIGH: 4 },
      SchedulableTriggerInputTypes: { DATE: 'date' },
    };
    const r = await remindAbout({ id: 'anc:visit:4', dueFrom: '2026-12-01' }, { title: 'T', body: 'B', channelName: 'c', taken: 't', skip: 's' }, new Date(2026, 10, 14), N);
    expect(r.state).toBe('scheduled');
    expect(scheduled).toHaveLength(1);
    expect((scheduled[0] as { identifier: string; content: { data: { kind: string } } }).identifier).toBe('prevention:anc:visit:4');
    expect((scheduled[0] as { content: { data: { kind: string } } }).content.data.kind).toBe(PREVENTION_KIND);
  });
});

describe('strings', () => {
  it('every item, reason and flag the engine can produce has text in all 7 languages', () => {
    const today = '2026-11-14';
    const people: PreventionPerson[] = [
      ...demoPrevention(today).map((s) => s.person),
      { dob: addMonths(today, -9), sex: 'male', jeEndemic: true, growth: [{ measuredOn: addDays(today, -40), weightKg: 7, muacCm: 11 }, { measuredOn: today, weightKg: 6.9, heightCm: 60 }] },
      { dob: addMonths(today, -20), sex: 'female', growth: [{ measuredOn: today, muacCm: 12 }] },
      { dob: '2019-01-01', sex: 'female' },
      { dob: '2012-01-01', sex: 'male', vaccinations: [{ vaccineCode: 'td', dose: 1, givenOn: '2022-01-01', source: 'self_reported' }] },
      { dob: '1980-01-01', sex: 'female', deliveredOn: addDays(today, -30), conditions: ['hypertension', 'diabetes'], screenings: [{ kind: 'bp', screenedOn: today, value: { systolic: 190, diastolic: 112 } }, { kind: 'sugar', screenedOn: today, value: { mgdl: 300 } }, { kind: 'oral', screenedOn: today, value: { result: 'abnormal' } }, { kind: 'hb', screenedOn: today, value: { gdl: 6 } }] },
      { dob: '1990-01-01', sex: 'male', screenings: [{ kind: 'bp', screenedOn: today, value: { systolic: 150, diastolic: 95 } }, { kind: 'hb', screenedOn: '2026-01-01', value: { gdl: 12 } }] },
      { dob: '1998-01-01', sex: 'female', pregnancy: { lmp: addDays(today, -70) }, vaccinations: [{ vaccineCode: 'td_pregnancy', dose: 1, givenOn: '2025-01-01' }, { vaccineCode: 'td_pregnancy', dose: 2, givenOn: '2025-02-01' }], screenings: [{ kind: 'bp', screenedOn: today, value: { systolic: 165, diastolic: 112 } }] },
      { dob: addDays(today, -20), sex: 'female', birthWeightKg: 3.2, growth: [{ measuredOn: addDays(today, -2), weightKg: 3.0 }] },
    ];
    const keys = new Set<string>();
    for (const p of people) {
      const plan = preventionPlan(p, today);
      for (const i of plan.items) {
        if (i.category !== 'vaccine') keys.add(`item.${i.code}`);
        keys.add(`reason.${i.reason.code}`);
        keys.add(`status.${i.status}`);
        keys.add(`section.${i.status}`);
      }
      for (const f of plan.flags) keys.add(`flag.${f.code}`);
    }
    expect(keys.size).toBeGreaterThan(60);
    for (const lng of ['en', 'hi', 'kn', 'ta', 'te', 'ur', 'ks']) {
      const missing = [...keys].filter((k) => !i18n.getResource(lng, 'prevent', k));
      expect({ lng, missing }).toEqual({ lng, missing: [] });
    }
  });
});

describe('screens', () => {
  it('patient: Rekha sees her plan offline from the demo data, with sources and Remind me', async () => {
    useSession.setState({ role: 'patient', language: 'en', onboarded: true, patientId: null });
    await render(wrap(<PreventionScreen />));
    expect(await screen.findByText('My preventive care')).toBeTruthy();
    expect(screen.getByText('34 weeks pregnant')).toBeTruthy();
    expect(screen.getByText('Td-2')).toBeTruthy();
    expect(screen.getByTestId('flag-anaemia')).toBeTruthy();
    expect(screen.getByTestId('flag-pregnancyBpHigh')).toBeTruthy();
    expect(screen.getByTestId('remind-anc:visit:4')).toBeTruthy();
    expect(screen.getAllByText(/Awaiting clinical review/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('explain-prevention')).toBeTruthy();
  });

  it('ASHA: Baby of Sita plan; recording a weight queues it offline', async () => {
    params.patientId = 'demo_p3';
    useSession.setState({ role: 'asha', language: 'en', onboarded: true });
    await render(wrap(<AshaPrevention />));
    expect(await screen.findByText('Baby of Sita')).toBeTruthy();
    expect(screen.getByTestId('flag-lowBirthWeight')).toBeTruthy();
    expect(screen.getByTestId('plan-item-uip:bcg:1')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByText('Growth'));
    });
    await act(async () => {
      await fireEvent.changeText(screen.getByTestId('field-weight'), '2.4');
    });
    await act(async () => {
      await fireEvent.press(screen.getByTestId('prevention-save'));
    });
    const q = usePreventionOutbox.getState().queue;
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ kind: 'growth', patientId: 'demo_p3', record: { weightKg: 2.4 } });
    expect(await screen.findByText(/1 not yet synced/)).toBeTruthy();
  });
});
