import { DEMO_IDS, toDbId, type Prescription, type RecordReferral } from '@am/shared';

import { batchSize, mergeBatch, subtract } from '../outbox';
import { useRecords } from '../recordsStore';
import { mergeBundle, mergeInbox, mergeReferrals } from '../serverSync';

const ref = (over: Partial<RecordReferral> = {}): RecordReferral => ({
  id: 'ref-1', patientId: 'p1', fromAshaId: DEMO_IDS.asha, toDoctorId: DEMO_IDS.doctor, toFacilityId: null, reason: 'BP high', riskAlertId: null,
  status: 'pending', createdAt: '2026-11-13T08:00:00.000Z', seenAt: null, acceptedAt: null, ...over,
});

describe('outbox batches', () => {
  it('keeps the newest copy of a record and merges referral updates field by field', () => {
    const a = mergeBatch({}, { referrals: [{ id: 'r1', status: 'seen', seenAt: 't1' }], doseLogs: [{ id: 'd1', status: 'taken' } as never] });
    const b = mergeBatch(a, { referrals: [{ id: 'r1', status: 'accepted', acceptedAt: 't2' }], doseLogs: [{ id: 'd1', status: 'skipped' } as never] });
    expect(b.referrals).toEqual([{ id: 'r1', status: 'accepted', seenAt: 't1', acceptedAt: 't2' }]);
    expect(b.doseLogs).toEqual([{ id: 'd1', status: 'skipped' }]);
    expect(batchSize(b)).toBe(2);
  });

  it('after a send, only rows changed since stay queued', () => {
    const sent = { doseLogs: [{ id: 'd1', status: 'taken' } as never], consent: { patientId: 'p', shareHistory: false } };
    const now = mergeBatch(sent, { doseLogs: [{ id: 'd2', status: 'taken' } as never] });
    expect(subtract(now, sent)).toEqual({ doseLogs: [{ id: 'd2', status: 'taken' }] });
  });
});

describe('merging what the server sends', () => {
  it('never moves a referral backwards, and adds referrals this phone has not seen', () => {
    const local = [ref({ status: 'accepted', acceptedAt: 't' })];
    expect(mergeReferrals(local, [ref({ status: 'pending' })])).toBe(local);
    const merged = mergeReferrals([ref()], [ref({ id: toDbId('ref-1'), status: 'closed' }), ref({ id: 'ref-2' })]);
    expect(merged.map((r) => [r.id, r.status])).toEqual([['ref-2', 'pending'], ['ref-1', 'closed']]);
  });

  it("a doctor's new prescription becomes reminders on the patient's phone, once", () => {
    useRecords.getState().reset();
    const state = useRecords.getState();
    const rx: Prescription = {
      id: toDbId('rx-new'), patientId: DEMO_IDS.patientRecord, prescribedBy: DEMO_IDS.doctor, source: 'doctor', issuedAt: '2026-11-13T09:00:00.000Z', diagnosis: null,
      items: [{ name: 'Methyldopa 250 mg', dosage: '1 tablet', frequency: 'Twice a day', timesOfDay: ['morning', 'night'], durationDays: 5 }], notes: null,
    };
    const patient = state.patients[DEMO_IDS.patientRecord];
    const bundle = { patient, vitals: [], prescriptions: [...state.prescriptions, rx], doseLogs: [], reports: [], consultations: [], referrals: [], riskAlerts: [] };
    const patch = mergeBundle(state, bundle);
    expect(patch.prescriptions?.[0].id).toBe(rx.id);
    expect(patch.reminders?.filter((r) => r.prescriptionId === rx.id).map((r) => r.name)).toEqual(['Methyldopa 250 mg']);
    expect(patch.patients).toBeUndefined();
    useRecords.setState(patch);
    expect(mergeBundle(useRecords.getState(), bundle)).toEqual({});
  });

  it('the doctor inbox adds the ASHA patient, referral and alert under the ids this phone already uses', () => {
    useRecords.getState().reset();
    const state = useRecords.getState();
    const patch = mergeInbox(state, {
      patients: [{ ...state.patients[DEMO_IDS.patientRecord] }, { ...state.patients[DEMO_IDS.patientRecord], id: toDbId('demo_p2'), fullName: 'Pooja Yadav' }],
      referrals: [ref({ id: 'ref-new', patientId: toDbId('demo_p2') })],
      riskAlerts: [{ id: 'demo_p2:anaemia', patientId: toDbId('demo_p2'), ashaWorkerId: DEMO_IDS.asha, level: 'medium', reason: 'Hb 8.5', createdAt: 't', resolvedAt: null }],
    });
    expect(Object.values(patch.patients ?? {}).map((p) => p.fullName)).toContain('Pooja Yadav');
    expect(Object.keys(patch.patients ?? {}).filter((k) => k === DEMO_IDS.patientRecord)).toHaveLength(1);
    expect(patch.referrals?.[0].id).toBe('ref-new');
    expect(patch.riskAlerts?.[0].reason).toBe('Hb 8.5');
  });
});
