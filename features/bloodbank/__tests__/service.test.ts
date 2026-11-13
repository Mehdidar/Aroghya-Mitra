import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BENGALURU_CENTRE, MockBloodBankProvider, createBloodBankService } from '../service.ts';
import { directionsUrl, formatDistance, formatUpdatedAgo, haversineKm, telUrl } from '../geo.ts';
import { mockBanks, mockStock } from '../data/bengaluru.mock.ts';
import { BLOOD_GROUPS } from '../../records/types.ts';
import { BLOOD_COMPONENTS } from '../types.ts';

const NOW = new Date('2026-11-13T10:00:00.000Z');
const service = () => createBloodBankService(new MockBloodBankProvider(NOW));

test('mock data: Bengaluru banks with full stock tables, demo phones flagged', () => {
  const banks = mockBanks();
  assert.ok(banks.length >= 12);
  assert.equal(new Set(banks.map((b) => b.id)).size, banks.length);
  for (const b of banks) {
    assert.equal(b.city, 'Bengaluru');
    assert.ok(b.location.lat > 12.7 && b.location.lat < 13.2, b.id);
    assert.ok(b.location.lng > 77.4 && b.location.lng < 77.8, b.id);
    assert.equal(b.phoneVerified, false);
    assert.match(b.phone!, /^\+91 80 0000 \d{4}$/);
  }
  const stock = mockStock(NOW);
  for (const rows of stock.values()) assert.equal(rows.length, BLOOD_GROUPS.length * BLOOD_COMPONENTS.length);
});

test('mock stock is deterministic and realistic (O+ PRBC ≫ AB− PRBC)', () => {
  const a = mockStock(NOW);
  const b = mockStock(NOW);
  assert.deepEqual([...a.entries()], [...b.entries()]);
  const sum = (g: string) =>
    [...a.values()].flat().filter((s) => s.bloodGroup === g && s.component === 'prbc').reduce((n, s) => n + s.units, 0);
  assert.ok(sum('O+') > 10 * sum('AB-'), `${sum('O+')} vs ${sum('AB-')}`);
});

test('filter by group + component only returns banks that have it', async () => {
  const res = await service().search({ bloodGroup: 'O-', component: 'platelets_sdp' }, NOW);
  for (const r of res) {
    assert.ok(r.unitsAvailable > 0);
    assert.ok(r.matchingStock.every((s) => s.bloodGroup === 'O-' && s.component === 'platelets_sdp'));
  }
  const all = await service().search({ bloodGroup: 'O-', component: 'platelets_sdp', onlyAvailable: false }, NOW);
  assert.equal(all.length, mockBanks().length);
});

test('near + radius: sorted by distance, all within radius', async () => {
  const res = await service().search({ near: BENGALURU_CENTRE, radiusKm: 8 }, NOW);
  assert.ok(res.length > 3);
  assert.ok(res.length < mockBanks().length, 'far banks (Bommasandra) excluded');
  for (let i = 1; i < res.length; i++) assert.ok(res[i - 1]!.distanceKm! <= res[i]!.distanceKm!);
  assert.ok(res.every((r) => r.distanceKm! <= 8));
});

test('sort by units without location', async () => {
  const res = await service().search({ bloodGroup: 'B+' }, NOW);
  for (let i = 1; i < res.length; i++) assert.ok(res[i - 1]!.unitsAvailable >= res[i]!.unitsAvailable);
  assert.ok(res.every((r) => r.distanceKm === null));
});

test('last-updated and staleness', async () => {
  const res = await service().search({}, NOW);
  assert.ok(res.every((r) => r.lastUpdated !== null && Date.parse(r.lastUpdated) <= NOW.getTime()));
  const stale = res.filter((r) => r.isStale).map((r) => r.bank.id);
  assert.ok(stale.includes('blr-sapthagiri'), 'the slow-updating bank is flagged stale');
});

test('admin stock edit updates units and timestamp; invalid units rejected', async () => {
  const svc = service();
  const later = new Date(NOW.getTime() + 3_600_000);
  await svc.updateStock('blr-victoria', [{ bloodGroup: 'AB-', component: 'prbc', units: 7 }], later);
  const bank = await svc.getBank('blr-victoria');
  const row = bank!.stock.find((s) => s.bloodGroup === 'AB-' && s.component === 'prbc')!;
  assert.deepEqual([row.units, row.updatedAt, bank!.lastUpdated], [7, later.toISOString(), later.toISOString()]);
  await assert.rejects(svc.updateStock('blr-victoria', [{ bloodGroup: 'A+', component: 'ffp', units: -1 }]), /Invalid units/);
  await assert.rejects(svc.updateStock('nope', [{ bloodGroup: 'A+', component: 'ffp', units: 1 }]), /Unknown/);
});

test('geo helpers', () => {
  const km = haversineKm({ lat: 12.9716, lng: 77.5946 }, { lat: 13.1986, lng: 77.7066 }); // MG Road → airport
  assert.ok(km > 26 && km < 30, String(km));
  assert.equal(formatDistance(0.45), '450 m');
  assert.equal(formatDistance(3.26), '3.3 km');
  assert.equal(formatDistance(27.4), '27 km');
  assert.equal(directionsUrl({ lat: 12.9, lng: 77.6 }), 'https://www.google.com/maps/dir/?api=1&destination=12.9,77.6&travelmode=driving');
  assert.equal(telUrl('+91 80 0000 1001'), 'tel:+918000001001');
  assert.equal(formatUpdatedAgo(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW), '5 min ago');
  assert.equal(formatUpdatedAgo(new Date(NOW.getTime() - 3 * 3_600_000).toISOString(), NOW), '3 h ago');
  assert.equal(formatUpdatedAgo(new Date(NOW.getTime() - 50 * 3_600_000).toISOString(), NOW), '2 days ago');
});
