import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { findSlot, generateSlots, istDate, istInstant, weekdayOf, windowsFor } from '../slots.ts';
import type { AvailabilityRule } from '../types.ts';

const rule = (p: Partial<AvailabilityRule>): AvailabilityRule => ({
  id: Math.random().toString(36).slice(2),
  doctorId: 'doc-1',
  facilityId: 'fac-1',
  weekday: null,
  specificDate: null,
  closed: false,
  startTime: '09:00',
  endTime: '10:00',
  slotMinutes: 15,
  validFrom: null,
  validTo: null,
  createdBy: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  ...p,
});

// 2026-11-16 is a Monday. "now" is Sunday 15 Nov 2026, 08:00 IST.
const NOW = new Date('2026-11-15T02:30:00.000Z');

describe('IST helpers', () => {
  it('IST is UTC+05:30', () => {
    assert.equal(istInstant('2026-11-16', 9 * 60).toISOString(), '2026-11-16T03:30:00.000Z');
    assert.equal(istDate('2026-11-15T19:00:00.000Z'), '2026-11-16', '00:30 IST next day');
    assert.equal(istDate('2026-11-15T18:29:00.000Z'), '2026-11-15');
    assert.equal(weekdayOf('2026-11-16'), 1);
  });
});

describe('generateSlots', () => {
  it('no availability → no slots (nothing invented)', () => {
    assert.deepEqual(generateSlots({ rules: [], appointments: [], from: '2026-11-16', to: '2026-11-30', now: NOW }), []);
  });

  it('weekly hours become slots of slot_minutes on that weekday only, in IST', () => {
    const slots = generateSlots({ rules: [rule({ weekday: 1 })], appointments: [], from: '2026-11-15', to: '2026-11-22', now: NOW });
    assert.deepEqual(
      slots.map((s) => s.startsAt),
      ['2026-11-16T03:30:00.000Z', '2026-11-16T03:45:00.000Z', '2026-11-16T04:00:00.000Z', '2026-11-16T04:15:00.000Z'],
    );
    assert.equal(slots[0].endsAt, '2026-11-16T03:45:00.000Z');
    assert.equal(slots[0].facilityId, 'fac-1');
  });

  it('a slot that does not fit before the end of the window is dropped', () => {
    const slots = generateSlots({ rules: [rule({ weekday: 1, startTime: '09:00', endTime: '09:50', slotMinutes: 20 })], appointments: [], from: '2026-11-16', to: '2026-11-16', now: NOW });
    assert.equal(slots.length, 2);
  });

  it('a closed date exception removes that day; an hours exception replaces the weekly hours', () => {
    const rules = [rule({ weekday: 1 }), rule({ specificDate: '2026-11-16', closed: true, startTime: null, endTime: null }), rule({ specificDate: '2026-11-23', startTime: '14:00', endTime: '14:30', slotMinutes: 30 })];
    const slots = generateSlots({ rules, appointments: [], from: '2026-11-16', to: '2026-11-30', now: NOW });
    assert.ok(!slots.some((s) => istDate(s.startsAt) === '2026-11-16'), 'closed day');
    assert.deepEqual(slots.filter((s) => istDate(s.startsAt) === '2026-11-23').map((s) => s.startsAt), ['2026-11-23T08:30:00.000Z']);
    assert.equal(slots.filter((s) => istDate(s.startsAt) === '2026-11-30').length, 4, 'weekly hours resume');
  });

  it('validity dates limit the weekly hours', () => {
    const slots = generateSlots({ rules: [rule({ weekday: 1, validFrom: '2026-11-20', validTo: '2026-11-25' })], appointments: [], from: '2026-11-16', to: '2026-12-07', now: NOW });
    assert.deepEqual([...new Set(slots.map((s) => istDate(s.startsAt)))], ['2026-11-23']);
  });

  it('past slots and active bookings are not offered; cancelled bookings free the slot', () => {
    const now = new Date('2026-11-16T03:40:00.000Z'); // 09:10 IST Monday
    const appointments = [
      { doctorId: 'doc-1', startsAt: '2026-11-16T04:00:00.000Z', endsAt: '2026-11-16T04:15:00.000Z', status: 'booked' as const },
      { doctorId: 'doc-1', startsAt: '2026-11-16T04:15:00.000Z', endsAt: '2026-11-16T04:30:00.000Z', status: 'cancelled' as const },
      { doctorId: 'doc-2', startsAt: '2026-11-16T03:45:00.000Z', endsAt: '2026-11-16T04:00:00.000Z', status: 'confirmed' as const },
    ];
    const slots = generateSlots({ rules: [rule({ weekday: 1 })], appointments, from: '2026-11-16', to: '2026-11-16', now });
    assert.deepEqual(slots.map((s) => s.startsAt), ['2026-11-16T03:45:00.000Z', '2026-11-16T04:15:00.000Z']);
  });

  it('respects a minimum lead time', () => {
    const now = new Date('2026-11-16T03:35:00.000Z'); // 09:05 IST
    const slots = generateSlots({ rules: [rule({ weekday: 1 })], appointments: [], from: '2026-11-16', to: '2026-11-16', now, minLeadMinutes: 15 });
    assert.equal(slots[0].startsAt, '2026-11-16T04:00:00.000Z', '09:15 is within 15 min of 09:05; 09:30 is first');
  });

  it('overlapping windows do not duplicate slots; doctors are kept apart', () => {
    const rules = [rule({ weekday: 1 }), rule({ weekday: 1, startTime: '09:30', endTime: '10:00' }), rule({ weekday: 1, doctorId: 'doc-2' })];
    const slots = generateSlots({ rules, appointments: [], from: '2026-11-16', to: '2026-11-16', now: NOW });
    assert.equal(slots.filter((s) => s.doctorId === 'doc-1').length, 4);
    assert.equal(slots.filter((s) => s.doctorId === 'doc-2').length, 4);
    assert.equal(generateSlots({ rules, appointments: [], from: '2026-11-16', to: '2026-11-16', now: NOW, doctorId: 'doc-2' }).length, 4);
  });

  it('windowsFor ignores other doctors and closed weekly rows', () => {
    assert.equal(windowsFor([rule({ weekday: 1, doctorId: 'x' })], 'doc-1', '2026-11-16').length, 0);
  });

  it('findSlot accepts only an exact published, free start', () => {
    const rules = [rule({ weekday: 1 })];
    assert.ok(findSlot({ rules, appointments: [], now: NOW, doctorId: 'doc-1', startsAt: '2026-11-16T03:45:00.000Z' }));
    assert.equal(findSlot({ rules, appointments: [], now: NOW, doctorId: 'doc-1', startsAt: '2026-11-16T03:50:00.000Z' }), null, 'off-grid');
    assert.equal(findSlot({ rules, appointments: [], now: NOW, doctorId: 'doc-1', startsAt: '2026-11-17T03:45:00.000Z' }), null, 'Tuesday has no hours');
    assert.ok(findSlot({ rules, appointments: [], now: NOW, doctorId: 'doc-1', startsAt: '2026-11-16T09:15:00+05:30' }), 'offset form accepted');
  });
});
