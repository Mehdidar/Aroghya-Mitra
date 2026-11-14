import { toDbId } from '@am/shared';

import type { AshaMessage } from '../../ashaConnect/types';
import {
  URGENT_WINDOW_MS,
  findPatient,
  groupThreads,
  humanize,
  mergeMessages,
  pendingUrgent,
  planItems,
  totalUnread,
  visitDayOptions,
} from '../connect/inbox';
import { dobFromAge } from '../logic/clinical';
import type { Patient, Visit } from '../types';

const NOW = new Date('2026-11-14T09:00:00.000Z');
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

let n = 0;
const msg = (over: Partial<AshaMessage>): AshaMessage => {
  n += 1;
  const at = over.createdAt ?? ago(10 - n * 0.01);
  return {
    id: `m${n}`,
    patientId: 'p1',
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

const person = (id: string, name: string): Patient => ({ id, name, sex: 'F', dob: dobFromAge(30), village: 'Rampur', categories: ['general'], assignedAshaId: 'a1' });
const patients: Record<string, Patient> = { local_p1: person('local_p1', 'Rekha'), p2: person('p2', 'Sita'), p3: person('p3', 'Meera') };
// The server names local_p1 by its UUID form.
const P1 = toDbId('local_p1');

describe('inbox grouping', () => {
  it('finds the phone record for a server UUID', () => {
    expect(findPatient(patients, P1)?.name).toBe('Rekha');
    expect(findPatient(patients, 'p2')?.name).toBe('Sita');
    expect(findPatient(patients, 'nobody')).toBeUndefined();
  });

  it('groups per patient, counts unread patient messages only, oldest first inside a thread', () => {
    const list = [
      msg({ patientId: P1, createdAt: ago(5) }),
      msg({ patientId: P1, from: 'asha', createdAt: ago(4) }),
      msg({ patientId: P1, createdAt: ago(3) }),
      msg({ patientId: 'p2', createdAt: ago(1), readAt: ago(0.5) }),
    ];
    const threads = groupThreads([...list].reverse(), patients, NOW);
    expect(threads).toHaveLength(2);
    const t1 = threads.find((t) => t.patient?.name === 'Rekha')!;
    expect(t1.patientId).toBe(P1);
    expect(t1.messages.map((m) => m.createdAt)).toEqual([ago(5), ago(4), ago(3)]);
    expect(t1.unread).toBe(2);
    expect(totalUnread(threads)).toBe(2);
  });

  it('orders urgent first, then open requests, then newest', () => {
    const list = [
      msg({ patientId: 'p2', createdAt: ago(1) }), // newest plain message
      msg({ patientId: 'p3', kind: 'visit_request', status: 'open', visitWhen: 'today', createdAt: ago(6) }),
      msg({ patientId: P1, urgent: true, emergencyCategories: ['bleeding'], createdAt: ago(8) }),
    ];
    const order = groupThreads(list, patients, NOW).map((t) => t.patient?.name);
    expect(order).toEqual(['Rekha', 'Meera', 'Sita']);
  });

  it('an urgent message stops being urgent once the ASHA replies or answers the request', () => {
    const urgent = msg({ urgent: true, createdAt: ago(3) });
    expect(pendingUrgent([urgent], NOW)?.id).toBe(urgent.id);
    expect(pendingUrgent([urgent, msg({ from: 'asha', createdAt: ago(2) })], NOW)).toBeNull();
    const req = msg({ urgent: true, kind: 'call_request', status: 'accepted', createdAt: ago(2) });
    expect(pendingUrgent([req], NOW)).toBeNull();
  });

  it('an old urgent message stays while unread, and drops out once read', () => {
    const old = ago(URGENT_WINDOW_MS / 3_600_000 + 1);
    expect(pendingUrgent([msg({ urgent: true, createdAt: old })], NOW)).not.toBeNull();
    expect(pendingUrgent([msg({ urgent: true, createdAt: old, readAt: ago(1) })], NOW)).toBeNull();
  });

  it('merges by id with the newer updatedAt winning', () => {
    const a = msg({ kind: 'visit_request', status: 'open' });
    const accepted = { ...a, status: 'accepted' as const, updatedAt: ago(0) };
    expect(mergeMessages([a], [accepted])[0].status).toBe('accepted');
    expect(mergeMessages([accepted], [a])[0].status).toBe('accepted');
    expect(mergeMessages([a], [msg({})])).toHaveLength(2);
  });
});

describe("today's plan", () => {
  const visit = (over: Partial<Visit>): Visit => ({
    id: 'v1',
    patientId: 'p2',
    ashaId: 'a1',
    visitedAt: ago(24 * 7),
    status: 'completed',
    photos: [],
    source: 'manual',
    updatedAt: ago(24 * 7),
    followUpOn: ago(2),
    ...over,
  });

  it('lists urgent, open requests, accepted visits due today or late, then follow-ups', () => {
    const urgent = msg({ patientId: P1, urgent: true, createdAt: ago(1) });
    const callReq = msg({ patientId: 'p3', kind: 'call_request', status: 'open', visitWhen: 'today', createdAt: ago(3) });
    const visitReq = msg({ patientId: 'p3', kind: 'visit_request', status: 'open', visitWhen: 'tomorrow', createdAt: ago(4) });
    const today = msg({ patientId: 'p2', kind: 'visit_request', status: 'accepted', scheduledFor: NOW.toISOString(), createdAt: ago(30) });
    const late = msg({ patientId: 'p2', kind: 'visit_request', status: 'accepted', scheduledFor: ago(48), createdAt: ago(72) });
    const future = msg({ patientId: 'p2', kind: 'visit_request', status: 'accepted', scheduledFor: new Date(NOW.getTime() + 3 * 86_400_000).toISOString() });
    const done = msg({ patientId: 'p2', kind: 'visit_request', status: 'done', scheduledFor: ago(1) });
    const threads = groupThreads([urgent, callReq, visitReq, today, late, future, done], patients, NOW);
    const items = planItems(threads, [visit({})], NOW);
    expect(items.map((i) => i.kind)).toEqual(['urgent', 'request', 'request', 'scheduled', 'scheduled', 'followUp']);
    // "today" requests before "tomorrow"
    expect(items[1].kind === 'request' && items[1].message.id).toBe(callReq.id);
    // late (earlier date) first, flagged late
    expect(items[3]).toMatchObject({ kind: 'scheduled', late: true });
    expect(items[4]).toMatchObject({ kind: 'scheduled', late: false });
  });

  it('an urgent request is listed once (as urgent)', () => {
    const urgentReq = msg({ patientId: 'p3', kind: 'visit_request', status: 'open', visitWhen: 'today', urgent: true });
    const items = planItems(groupThreads([urgentReq], patients, NOW), [], NOW);
    expect(items.map((i) => i.kind)).toEqual(['urgent']);
  });
});

describe('helpers', () => {
  it('offers today (now) and the next seven days at 10:00', () => {
    const opts = visitDayOptions(NOW);
    expect(opts).toHaveLength(8);
    expect(opts[0].iso).toBe(NOW.toISOString());
    expect(opts[1].date.getHours()).toBe(10);
    expect(opts[7].date.getTime() - opts[1].date.getTime()).toBeGreaterThanOrEqual(6 * 86_400_000 - 3_600_000);
  });

  it('humanizes unknown codes', () => {
    expect(humanize('fetal_movement_reduced')).toBe('Fetal movement reduced');
    expect(humanize('')).toBe('');
  });
});
