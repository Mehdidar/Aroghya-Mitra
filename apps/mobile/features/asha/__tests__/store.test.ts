import { DEMO_IDS, toDbId } from '@am/shared';
import { buildDemoDB } from '../data/seed';
import { dobFromAge, followUpsDue, lmpFromWeeks, parseDateInput } from '../logic/clinical';
import { syncOnce, type SyncRequest, type SyncResponse, type SyncTransport } from '../services/sync';
import { AshaStore, DB_KEY, MemoryKV } from '../store/store';
import type { Patient, Visit, Vitals } from '../types';

const patient = (): Patient => ({
  id: 'p1', name: 'Rekha', sex: 'F', dob: dobFromAge(25), village: 'Rampur', categories: ['pregnant'],
  assignedAshaId: 'a1', pregnancy: { lmp: lmpFromWeeks(30) },
});
let n = 0;
const visit = (vitals: Omit<Vitals, 'recordedAt'>, extra: Partial<Visit> = {}): Visit => {
  const at = new Date(Date.now() + n++ * 1000).toISOString();
  return { id: `v${n}`, patientId: 'p1', ashaId: 'a1', visitedAt: at, status: 'completed', vitals: { recordedAt: at, ...vitals }, photos: [], source: 'manual', updatedAt: at, ...extra };
};

async function freshStore() {
  const kv = new MemoryKV();
  const store = new AshaStore(kv);
  await store.load();
  await store.savePatient(patient());
  return { kv, store };
}

describe('AshaStore', () => {
  it('persists and reloads', async () => {
    const { kv, store } = await freshStore();
    await store.recordVisit(visit({ systolic: 150, diastolic: 100 }));
    const reloaded = new AshaStore(kv);
    const db = await reloaded.load();
    expect(Object.keys(db.visits)).toHaveLength(1);
    expect(db.patients.p1.riskLevel).toBe('high');
  });

  it('recovers from a corrupt blob instead of crashing', async () => {
    const kv = new MemoryKV();
    await kv.setItem(DB_KEY, '{not json');
    const db = await new AshaStore(kv).load();
    expect(db.patients).toEqual({});
    expect([...kv.map.keys()].some((k) => k.startsWith(`${DB_KEY}.corrupt.`))).toBe(true);
  });

  it('risk level follows the latest visit and ignores not-at-home visits', async () => {
    const { store } = await freshStore();
    await store.recordVisit(visit({ systolic: 170, diastolic: 115 }));
    expect(store.patient('p1')!.riskLevel).toBe('critical');
    await store.recordVisit(visit({}, { status: 'not_at_home' }));
    expect(store.patient('p1')!.riskLevel).toBe('critical');
    await store.recordVisit(visit({ systolic: 118, diastolic: 76 }));
    expect(store.patient('p1')!.riskLevel).toBe('none');
    expect(store.currentAlerts('p1')).toEqual([]);
  });

  it('re-saving a visit replaces its alerts and keeps acknowledgements', async () => {
    const { store } = await freshStore();
    const v = visit({ systolic: 150, diastolic: 100, hemoglobin: 6 });
    const { alerts } = await store.recordVisit(v);
    await store.acknowledgeAlert(alerts[0].id);
    const again = await store.recordVisit({ ...v, vitals: { ...v.vitals!, systolic: 120, diastolic: 80 } });
    expect(again.alerts.map((a) => a.ruleId)).toEqual(['preg_anaemia_severe']);
    expect(again.alerts[0].acknowledged).toBe(true);
    expect(Object.keys(store.snapshot.alerts)).toHaveLength(1);
  });

  it('referral marks the visit referred and picks urgency from alerts', async () => {
    const { store } = await freshStore();
    const { visit: v, alerts } = await store.recordVisit(visit({ symptoms: ['bleeding_pv'] }));
    const r = await store.createReferral({ patientId: 'p1', fromAshaId: 'a1', alertIds: alerts.map((a) => a.id), visitId: v.id });
    expect(r.urgency).toBe('emergency');
    expect(store.snapshot.visits[v.id].status).toBe('referred');
  });
});

describe('sync', () => {
  const okTransport = (onPush?: (r: SyncRequest) => void, res: Partial<SyncResponse> = {}): SyncTransport => ({
    async push(req) {
      onPush?.(req);
      return { serverTime: '2030-01-01T00:00:00.000Z', ...res };
    },
    async uploadPhoto(uri) {
      return `https://cdn.example/${uri.split('/').pop()}`;
    },
  });

  it('pushes the outbox, uploads photos, and clears the queue', async () => {
    const { store } = await freshStore();
    await store.recordVisit(visit({ systolic: 150, diastolic: 100 }, { photos: ['file:///tmp/a.jpg'] }));
    let sent: SyncRequest | undefined;
    const res = await syncOnce(store, okTransport((r) => (sent = r)), 'a1');
    expect(res.ok).toBe(true);
    expect(sent!.patients).toHaveLength(1);
    expect(sent!.visits[0].photos).toEqual(['https://cdn.example/a.jpg']);
    expect(sent!.visits[0]).not.toHaveProperty('syncState');
    expect(sent!.alerts).toHaveLength(1);
    expect(store.snapshot.outbox).toEqual([]);
    const v = Object.values(store.snapshot.visits)[0];
    expect(v.syncState).toBe('synced');
    expect(v.photos).toEqual(['https://cdn.example/a.jpg']);
  });

  it('keeps the queue and marks visits failed when offline', async () => {
    const { store } = await freshStore();
    await store.recordVisit(visit({}));
    const res = await syncOnce(store, { push: async () => { throw new Error('Network request failed'); }, uploadPhoto: async (u) => u }, 'a1');
    expect(res.ok).toBe(false);
    expect(store.snapshot.outbox.length).toBeGreaterThan(0);
    expect(Object.values(store.snapshot.visits)[0].syncState).toBe('failed');
  });

  it('an edit made during the push stays queued', async () => {
    const { store } = await freshStore();
    const v = visit({});
    await store.recordVisit(v);
    await syncOnce(
      store,
      okTransport(() => {
        void store.recordVisit({ ...v, notes: 'edited mid-sync' });
      }),
      'a1',
    );
    expect(store.snapshot.outbox.some((o) => o.kind === 'visit' && o.id === v.id)).toBe(true);
    expect(store.snapshot.visits[v.id].notes).toBe('edited mid-sync');
  });

  it('pulls doctor referral status updates with last-write-wins', async () => {
    const { store } = await freshStore();
    const r = await store.createReferral({ patientId: 'p1', fromAshaId: 'a1', alertIds: [], urgency: 'urgent', reason: 'x' });
    await syncOnce(store, okTransport(), 'a1');
    await syncOnce(store, okTransport(undefined, { referrals: [{ ...r, status: 'seen', updatedAt: '2031-01-01T00:00:00.000Z' }] }), 'a1');
    expect(store.snapshot.referrals[r.id].status).toBe('seen');
    // An older server copy does not clobber it
    await syncOnce(store, okTransport(undefined, { referrals: [{ ...r, status: 'pending', updatedAt: '2020-01-01T00:00:00.000Z' }] }), 'a1');
    expect(store.snapshot.referrals[r.id].status).toBe('seen');
  });
});

describe('release (patients the PHC moved to another ASHA)', () => {
  async function twoPatients() {
    const { kv, store } = await freshStore();
    await store.savePatient({ ...patient(), id: 'p2', name: 'Sita' });
    await store.recordVisit(visit({ systolic: 150, diastolic: 100 }));
    await store.recordVisit({ ...visit({ hemoglobin: 6 }), patientId: 'p2' });
    await store.createReferral({ patientId: 'p2', fromAshaId: 'a1', alertIds: [], urgency: 'urgent', reason: 'x' });
    return { kv, store };
  }

  it('drops the patient with their visits, alerts, referrals and queued items', async () => {
    const { kv, store } = await twoPatients();
    const removed = await store.release(['p2']);
    expect(removed).toEqual(['p2']);
    const db = store.snapshot;
    expect(Object.keys(db.patients)).toEqual(['p1']);
    expect(Object.values(db.visits).every((v) => v.patientId === 'p1')).toBe(true);
    expect(Object.values(db.alerts).every((a) => a.patientId === 'p1')).toBe(true);
    expect(Object.values(db.referrals)).toEqual([]);
    expect(db.outbox.every((o) => store.record(o.kind, o.id))).toBe(true);
    expect(db.outbox.some((o) => o.kind === 'patient' && o.id === 'p1')).toBe(true);
    // Persisted
    const reloaded = await new AshaStore(kv).load();
    expect(Object.keys(reloaded.patients)).toEqual(['p1']);
  });

  it('matches the server UUID form of a phone id', async () => {
    const { store } = await twoPatients();
    expect(await store.release([toDbId('p2')])).toEqual(['p2']);
    expect(store.patient('p2')).toBeUndefined();
  });

  it('ignores unknown ids and an empty list', async () => {
    const { store } = await twoPatients();
    const before = store.snapshot;
    expect(await store.release([])).toEqual([]);
    expect(await store.release(['nobody'])).toEqual([]);
    expect(store.snapshot).toBe(before);
  });

  it('sync applies `released` and `rejectedPatientIds` after pushing the queue', async () => {
    const { store } = await twoPatients();
    await store.savePatient({ ...patient(), id: 'p3', name: 'Asha' });
    let pushed: SyncRequest | undefined;
    const transport: SyncTransport = {
      async push(req) {
        pushed = req;
        return { serverTime: '2030-01-01T00:00:00.000Z', released: [toDbId('p2')], rejectedPatientIds: ['p3'] };
      },
      uploadPhoto: async (u) => u,
    };
    const res = await syncOnce(store, transport, 'a1');
    expect(res).toMatchObject({ ok: true, released: 2 });
    // Her last visit for the released patient still went to the server first.
    expect(pushed!.visits.some((v) => v.patientId === 'p2')).toBe(true);
    expect(Object.keys(store.snapshot.patients)).toEqual(['p1']);
    expect(store.snapshot.outbox).toEqual([]);
  });
});

describe('clinical helpers and seed', () => {
  it('parses field date formats', () => {
    expect(parseDateInput('05/03/2026')).toBe('2026-03-05T00:00:00.000Z');
    expect(parseDateInput('2026-03-05')).toBe('2026-03-05T00:00:00.000Z');
    expect(parseDateInput('31/02/2026')).toBeUndefined();
  });
  it('demo data has risk levels and due follow-ups, and nothing queued', () => {
    const db = buildDemoDB('a1');
    expect(db.patients[DEMO_IDS.patientRecord].riskLevel).toBe('critical');
    expect(db.patients.demo_p3.riskLevel).toBe('high');
    expect(db.outbox).toEqual([]);
    expect(followUpsDue(Object.values(db.visits)).length).toBeGreaterThan(0);
  });
});
