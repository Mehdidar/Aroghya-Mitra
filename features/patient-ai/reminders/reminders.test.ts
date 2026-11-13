import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, courseEndDate, doseTime, expandDoses, parseHHMM, planNotifications, toDateKey, type ReminderMedicine } from './schedule.ts';
import { adherenceRate, adherenceStreak, buildTimeline, type DoseLogEntry } from './adherence.ts';
import { ACTION_SKIP, ACTION_TAKEN, doseActionsFromResponse, ensureNotificationPermission, syncReminders, type NotificationsModule, type PermissionResponse } from './notifications.ts';

// All dates are built from local components, so the tests pass in any time zone.
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m); // November 2026

const dolo: ReminderMedicine = {
  id: 'dolo', name: 'Dolo 650', dose: '1 tablet', slots: ['morning', 'night'], mealRelation: 'after_food',
  startDate: '2026-11-13', durationDays: 5, asNeeded: false,
};
const pan: ReminderMedicine = {
  id: 'pan', name: 'Pan-D', dose: '1 capsule', slots: ['morning'], mealRelation: 'before_food',
  startDate: '2026-11-13', durationDays: 3, asNeeded: false,
};

describe('date helpers', () => {
  it('adds days across month ends', () => {
    assert.equal(addDays('2026-11-30', 1), '2026-12-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(toDateKey(at(5, 23, 59)), '2026-11-05');
  });

  it('validates HH:MM', () => {
    assert.deepEqual(parseHHMM('08:05'), { h: 8, m: 5 });
    assert.throws(() => parseHHMM('25:00'));
    assert.throws(() => parseHHMM('8am'));
  });

  it('applies meal offsets, rolling back across midnight', () => {
    assert.deepEqual(doseTime('2026-11-13', 'morning', 'after_food'), at(13, 8, 15));
    assert.deepEqual(doseTime('2026-11-13', 'morning', 'before_food'), at(13, 7, 30));
    const late = doseTime('2026-11-14', 'night', 'empty_stomach', { morning: '08:00', afternoon: '13:00', evening: '18:00', night: '00:30' });
    assert.deepEqual(late, at(13, 23, 30)); // belongs to the 14th's course day, rings at 23:30 on the 13th
  });
});

describe('expandDoses', () => {
  it('produces every dose of a 5-day course and no more', () => {
    const doses = expandDoses(dolo, at(1, 0), at(30, 0));
    assert.equal(doses.length, 10);
    assert.equal(doses[0].id, 'dolo@2026-11-13#morning');
    assert.equal(doses.at(-1)!.id, 'dolo@2026-11-17#night');
    assert.equal(courseEndDate(dolo), '2026-11-17');
  });

  it('skips doses already past when the course starts mid-day', () => {
    const doses = expandDoses(dolo, at(13, 14), at(30, 0));
    assert.equal(doses[0].id, 'dolo@2026-11-13#night');
    assert.equal(doses.length, 9);
  });

  it('gives no doses for as-needed, paused or zero-length medicines', () => {
    assert.equal(expandDoses({ ...dolo, asNeeded: true }, at(1, 0), at(30, 0)).length, 0);
    assert.equal(expandDoses({ ...dolo, paused: true }, at(1, 0), at(30, 0)).length, 0);
    assert.equal(expandDoses({ ...dolo, durationDays: 0 }, at(1, 0), at(30, 0)).length, 0);
  });

  it('keeps ongoing medicines going through the window', () => {
    const doses = expandDoses({ ...dolo, durationDays: null }, at(20, 0), at(23, 0));
    assert.equal(doses.length, 6);
  });

  it('includes a dose shifted before midnight into the previous day', () => {
    const times = { morning: '08:00', afternoon: '13:00', evening: '18:00', night: '00:20' };
    const med: ReminderMedicine = { ...dolo, slots: ['night'], mealRelation: 'before_food', startDate: '2026-11-14', durationDays: 1 };
    const doses = expandDoses(med, at(13, 12), at(14, 12), times);
    assert.equal(doses.length, 1);
    assert.deepEqual(doses[0].at, at(13, 23, 50));
    assert.equal(doses[0].courseDate, '2026-11-14');
  });
});

describe('planNotifications', () => {
  it('groups medicines due at the same minute and sorts by time', () => {
    const sameTime: ReminderMedicine = { ...pan, mealRelation: 'after_food' };
    const plan = planNotifications([dolo, sameTime], at(13, 6));
    assert.deepEqual(plan[0].medicineNames, ['Dolo 650', 'Pan-D']);
    assert.equal(plan[0].doseIds.length, 2);
    assert.deepEqual(plan[0].at, at(13, 8, 15));
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i].at > plan[i - 1].at);
  });

  it('only plans future doses inside the horizon, capped for iOS', () => {
    const now = at(13, 9);
    const plan = planNotifications([{ ...dolo, durationDays: null, slots: ['morning', 'afternoon', 'evening', 'night'] }], now, { horizonDays: 30, maxPending: 60 });
    assert.equal(plan.length, 60);
    assert.ok(plan.every((p) => p.at > now));
    assert.equal(planNotifications([dolo], now, { horizonDays: 1 }).length, 2); // tonight and tomorrow morning
  });

  it('has stable ids so re-planning is idempotent', () => {
    const a = planNotifications([dolo, pan], at(13, 6));
    const b = planNotifications([dolo, pan], at(13, 6, 30));
    assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
  });
});

describe('timeline and adherence', () => {
  const doses = expandDoses(dolo, at(1, 0), at(30, 0));
  const log = (id: string, status: 'taken' | 'skipped', when: Date): DoseLogEntry => ({ doseId: id, status, at: when });

  it('derives upcoming, due, taken, skipped and missed', () => {
    const entries = [log('dolo@2026-11-13#morning', 'taken', at(13, 8, 20))];
    const tl = buildTimeline(doses, entries, at(14, 8, 0));
    const status = Object.fromEntries(tl.map((t) => [t.dose.id, t.status]));
    assert.equal(status['dolo@2026-11-13#morning'], 'taken');
    assert.equal(status['dolo@2026-11-13#night'], 'missed');
    assert.equal(status['dolo@2026-11-14#morning'], 'due');
    assert.equal(status['dolo@2026-11-14#night'], 'upcoming');
  });

  it('lets a later tap override an earlier one', () => {
    const entries = [log('dolo@2026-11-13#morning', 'skipped', at(13, 8, 20)), log('dolo@2026-11-13#morning', 'taken', at(13, 9))];
    assert.equal(buildTimeline(doses, entries, at(13, 10))[0].status, 'taken');
  });

  it('computes the streak, not breaking it for an unfinished today', () => {
    const takenAll = (days: number[]) => days.flatMap((d) => [log(`dolo@2026-11-${d}#morning`, 'taken', at(d, 8)), log(`dolo@2026-11-${d}#night`, 'taken', at(d, 21))]);
    const entries = [...takenAll([13, 14, 15]), log('dolo@2026-11-16#morning', 'taken', at(16, 8))];
    assert.equal(adherenceStreak(doses, entries, at(16, 12)), 3); // today half done
    assert.equal(adherenceStreak(doses, [...entries, log('dolo@2026-11-16#night', 'taken', at(16, 21))], at(16, 22)), 4);
    assert.equal(adherenceStreak(doses, [...entries, log('dolo@2026-11-16#night', 'skipped', at(16, 21))], at(16, 22)), 0);
  });

  it('breaks the streak on a missed day', () => {
    const entries = [log('dolo@2026-11-13#morning', 'taken', at(13, 8)), log('dolo@2026-11-14#morning', 'taken', at(14, 8)), log('dolo@2026-11-14#night', 'taken', at(14, 21))];
    assert.equal(adherenceStreak(doses, entries, at(15, 6)), 1); // 13th night missed
  });

  it('reports adherence over decided doses only', () => {
    const entries = [log('dolo@2026-11-13#morning', 'taken', at(13, 8)), log('dolo@2026-11-13#night', 'skipped', at(13, 21))];
    assert.equal(adherenceRate(doses, entries, at(14, 9)), 0.5); // 14th morning is still "due"
    assert.equal(adherenceRate(doses, [], at(12, 9)), null);
  });
});

// ------------------------------------------------------------------ expo adapter

function fakeNotifications(perm: { current: PermissionResponse; afterRequest?: PermissionResponse }) {
  const calls: string[] = [];
  const scheduled = new Map<string, { identifier: string; content: { data?: Record<string, unknown> } }>();
  const N: NotificationsModule = {
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    getPermissionsAsync: async () => (calls.push('get'), perm.current),
    requestPermissionsAsync: async () => (calls.push('request'), perm.afterRequest ?? perm.current),
    setNotificationChannelAsync: async () => void calls.push('channel'),
    setNotificationCategoryAsync: async () => void calls.push('category'),
    scheduleNotificationAsync: async (req) => {
      calls.push(`schedule:${req.identifier}`);
      scheduled.set(req.identifier!, { identifier: req.identifier!, content: { data: req.content.data } });
      return req.identifier!;
    },
    cancelScheduledNotificationAsync: async (id) => {
      calls.push(`cancel:${id}`);
      scheduled.delete(id);
    },
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
  };
  return { N, calls, scheduled };
}

const copy = {
  channelName: 'Medicine reminders', taken: 'Taken', skip: 'Skip',
  title: () => 'Time for your medicine', body: (n: string[]) => n.join(', '),
};

describe('notification permissions', () => {
  it('creates the Android channel before asking (Android 13+)', async () => {
    const { N, calls } = fakeNotifications({ current: { granted: false, canAskAgain: true }, afterRequest: { granted: true, canAskAgain: true } });
    assert.equal(await ensureNotificationPermission(N, { OS: 'android', Version: 33 }, copy), 'granted');
    assert.ok(calls.indexOf('channel') < calls.indexOf('request'));
  });

  it('does not create a channel on iOS and accepts provisional authorisation', async () => {
    const { N, calls } = fakeNotifications({ current: { granted: false, canAskAgain: true, ios: { status: 3 } } });
    assert.equal(await ensureNotificationPermission(N, { OS: 'ios', Version: '18.0' }, copy), 'granted');
    assert.ok(!calls.includes('channel'));
    assert.ok(!calls.includes('request'));
  });

  it('reports blocked when the user must go to settings', async () => {
    const { N } = fakeNotifications({ current: { granted: false, canAskAgain: false } });
    assert.equal(await ensureNotificationPermission(N, { OS: 'android', Version: 34 }, copy), 'blocked');
    const denied = fakeNotifications({ current: { granted: false, canAskAgain: true }, afterRequest: { granted: false, canAskAgain: true } });
    assert.equal(await ensureNotificationPermission(denied.N, { OS: 'android', Version: 34 }, copy), 'denied');
  });
});

describe('syncReminders', () => {
  it('schedules the plan, then only applies the difference', async () => {
    const { N, calls, scheduled } = fakeNotifications({ current: { granted: true, canAskAgain: true } });
    const plan1 = planNotifications([dolo, pan], at(13, 6));
    const first = await syncReminders(N, plan1, copy);
    assert.deepEqual(first, { scheduled: plan1.length, cancelled: 0, kept: 0 });

    // Re-sync with the same plan: nothing changes.
    assert.deepEqual(await syncReminders(N, plan1, copy), { scheduled: 0, cancelled: 0, kept: plan1.length });

    // Pan-D removed: its own 07:30 slots are cancelled, Dolo's stay.
    calls.length = 0;
    const plan2 = planNotifications([dolo], at(13, 6));
    const third = await syncReminders(N, plan2, copy);
    assert.equal(third.cancelled, 3);
    assert.equal(third.scheduled, 0);
    assert.equal(scheduled.size, plan2.length);
  });

  it('leaves notifications that are not dose reminders alone', async () => {
    const { N, scheduled } = fakeNotifications({ current: { granted: true, canAskAgain: true } });
    scheduled.set('appointment-1', { identifier: 'appointment-1', content: { data: { kind: 'appointment' } } });
    await syncReminders(N, [], copy);
    assert.ok(scheduled.has('appointment-1'));
  });
});

describe('notification actions', () => {
  const response = (actionIdentifier: string) => ({
    actionIdentifier,
    notification: { request: { content: { data: { kind: 'dose-reminder', doseIds: ['dolo@2026-11-13#morning', 'pan@2026-11-13#morning'] } } } },
  });

  it('maps Taken and Skip buttons to log entries for every grouped dose', () => {
    const now = at(13, 8, 20);
    assert.deepEqual(doseActionsFromResponse(response(ACTION_TAKEN), now).map((e) => e.status), ['taken', 'taken']);
    assert.deepEqual(doseActionsFromResponse(response(ACTION_SKIP), now).map((e) => e.doseId), ['dolo@2026-11-13#morning', 'pan@2026-11-13#morning']);
    assert.deepEqual(doseActionsFromResponse(response('expo.modules.notifications.actions.DEFAULT'), now), []);
  });
});
