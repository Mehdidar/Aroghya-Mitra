import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RemoteBloodBankProvider } from '../remote.ts';
import { createBloodBankService } from '../service.ts';

const bank = { id: 'nhp-x', name: 'Directory bank', category: 'government' as const, address: 'a', area: 'b', city: 'c', location: { lat: 12.97, lng: 77.59 }, phone: '+918022223333', phoneVerified: true, open24x7: true, facilityId: null };

describe('RemoteBloodBankProvider', () => {
  it('lists directory banks with unknown stock even when a blood group is selected', async () => {
    const svc = createBloodBankService(new RemoteBloodBankProvider(async () => ({ ok: true, banks: [bank], stock: {} })));
    const res = await svc.search({ bloodGroup: 'B+', component: 'prbc', near: { lat: 12.97, lng: 77.6 } });
    assert.equal(svc.source, 'supabase');
    assert.deepEqual(res.map((r) => [r.bank.name, r.stockUnknown]), [['Directory bank', true]]);
  });

  it('falls back to the labelled demo banks when the server has none or is offline', async () => {
    for (const load of [async () => null, async () => { throw new Error('offline'); }]) {
      const svc = createBloodBankService(new RemoteBloodBankProvider(load));
      const res = await svc.search({});
      assert.equal(svc.source, 'mock');
      assert.ok(res.length > 5);
      assert.ok(res.every((r) => !r.stockUnknown && !r.bank.phoneVerified));
    }
  });
});
