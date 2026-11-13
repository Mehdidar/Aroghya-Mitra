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

describe('clinical helpers and seed', () => {
  it('parses field date formats', () => {
    expect(parseDateInput('05/03/2026')).toBe('2026-03-05T00:00:00.000Z');
    expect(parseDateInput('2026-03-05')).toBe('2026-03-05T00:00:00.000Z');
    expect(parseDateInput('31/02/2026')).toBeUndefined();
  });
  it('demo data has risk levels and due follow-ups, and nothing queued', () => {
    const db = buildDemoDB('a1');
    expect(db.patients.demo_p1.riskLevel).toBe('critical');
    expect(db.patients.demo_p3.riskLevel).toBe('high');
    expect(db.outbox).toEqual([]);
    expect(followUpsDue(Object.values(db.visits)).length).toBeGreaterThan(0);
  });
});
