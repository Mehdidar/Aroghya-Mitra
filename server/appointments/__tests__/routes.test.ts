import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_FACILITY, DEMO_IDS } from '../../../packages/shared/demo.ts';
import { createRouter } from '../../http/router.ts';
import { demoMemoryData } from '../../records/demoSeed.ts';
import { MemoryRecordsRepository } from '../../records/memoryRepository.ts';
import { MemoryAppointmentsRepository } from '../repository.ts';
import { routes } from '../routes.ts';

// Sunday 15 Nov 2026, 08:00 IST. Monday 16 Nov has the published hours.
const NOW = new Date('2026-11-15T02:30:00.000Z');
const MON_0900 = '2026-11-16T03:30:00.000Z';
const MON_0915 = '2026-11-16T03:45:00.000Z';
const MON_0930 = '2026-11-16T04:00:00.000Z';

const OTHER_FACILITY = '11111111-1111-4111-8111-000000000099';
const OTHER_DOCTOR = 'doc-elsewhere';
const OTHER_PATIENT = 'pat-other';
const OTHER_USER = 'user-other';

function setup(now = NOW) {
  process.env.AUTH_MODE = 'demo';
  const records = new MemoryRecordsRepository(demoMemoryData(now));
  records.data.profiles.push(
    { id: OTHER_DOCTOR, role: 'doctor', fullName: 'Dr. Elsewhere', facilityId: OTHER_FACILITY, isActive: true },
    { id: OTHER_USER, role: 'patient', fullName: 'Other Patient', facilityId: null, isActive: true },
    { id: 'asha-2', role: 'asha', fullName: 'Other ASHA', facilityId: DEMO_FACILITY.id, isActive: true },
    { id: 'doc-off', role: 'doctor', fullName: 'Dr. Off', facilityId: DEMO_FACILITY.id, isActive: false },
  );
  records.data.patients.push({ ...records.data.patients[0], id: OTHER_PATIENT, userId: OTHER_USER, fullName: 'Other Patient', ashaWorkerId: 'asha-2', facilityId: OTHER_FACILITY });
  const repo = new MemoryAppointmentsRepository({ profiles: () => records.data.profiles });
  let n = 0;
  const handler = createRouter(routes({ repo, records, now: () => now, newId: () => `appt-${++n}` }));
  const call = async (method: string, path: string, role: string, user?: string, body?: unknown) => {
    const res = await handler(
      new Request(`http://x${path}`, {
        method,
        headers: { 'x-demo-role': role, ...(user ? { 'x-demo-user': user } : {}), 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  return { records, repo, call };
}

const MONDAY_HOURS = { slotMinutes: 15, weekly: [{ weekday: 1, start: '09:00', end: '10:00' }] };

describe('appointments: empty state and availability', () => {
  it('with no published hours the patient gets no slots and published: false (nothing invented)', async () => {
    const { call } = setup();
    const r = await call('GET', '/appointments/slots', 'patient');
    assert.equal(r.status, 200);
    assert.equal(r.body.published, false);
    assert.deepEqual(r.body.slots, []);
    assert.deepEqual(r.body.doctors, []);
    assert.equal(r.body.facility.name, 'PHC Hebbal');
    assert.equal(r.body.facility.phone, null, 'no made-up phone number');
    assert.equal(r.body.timeZone, 'Asia/Kolkata');
  });

  it('a doctor publishes their own hours; patients then see real slots with the doctor name', async () => {
    const { call } = setup();
    const put = await call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    assert.equal(put.status, 200);
    assert.equal(put.body.rules.length, 1);
    const r = await call('GET', '/appointments/slots', 'patient');
    assert.equal(r.body.published, true);
    assert.equal(r.body.slots.length, 8, 'two Mondays in the default 14-day window, 4 slots each');
    assert.equal(r.body.slots[0].startsAt, MON_0900);
    assert.deepEqual(r.body.doctors, [{ id: DEMO_IDS.doctor, name: 'Dr. Arjun Rao' }]);
  });

  it('an admin publishes hours for a doctor of their facility, not another facility', async () => {
    const { call } = setup();
    assert.equal((await call('PUT', '/availability', 'admin', undefined, { ...MONDAY_HOURS, doctorId: DEMO_IDS.doctor })).status, 200);
    assert.equal((await call('PUT', '/availability', 'admin', undefined, { ...MONDAY_HOURS, doctorId: OTHER_DOCTOR })).status, 403);
    assert.equal((await call('PUT', '/availability', 'admin', undefined, MONDAY_HOURS)).body.reason, 'doctor_required');
    const got = await call('GET', '/availability', 'admin');
    assert.deepEqual(got.body.doctors, [{ id: DEMO_IDS.doctor, name: 'Dr. Arjun Rao' }]);
    assert.equal(got.body.rules.length, 1);
  });

  it('patients, ASHAs and doctors for someone else cannot publish hours', async () => {
    const { call } = setup();
    assert.equal((await call('PUT', '/availability', 'patient', undefined, MONDAY_HOURS)).status, 403);
    assert.equal((await call('PUT', '/availability', 'asha', undefined, MONDAY_HOURS)).status, 403);
    assert.equal((await call('PUT', '/availability', 'doctor', undefined, { ...MONDAY_HOURS, doctorId: OTHER_DOCTOR })).status, 403);
  });

  it('invalid hours are refused', async () => {
    const { call } = setup();
    assert.equal((await call('PUT', '/availability', 'doctor', undefined, { weekly: [{ weekday: 7, start: '09:00', end: '10:00' }] })).body.reason, 'bad_weekday');
    assert.equal((await call('PUT', '/availability', 'doctor', undefined, { weekly: [{ weekday: 1, start: '10:00', end: '09:00' }] })).body.reason, 'bad_time');
    assert.equal((await call('PUT', '/availability', 'doctor', undefined, { slotMinutes: 2, weekly: [] })).body.reason, 'bad_slot_length');
  });

  it('a closed date exception removes that day from the slots', async () => {
    const { call } = setup();
    await call('PUT', '/availability', 'doctor', undefined, { ...MONDAY_HOURS, exceptions: [{ date: '2026-11-16', closed: true }] });
    const r = await call('GET', '/appointments/slots?from=2026-11-16&to=2026-11-23', 'patient');
    assert.ok(r.body.slots.every((s: { startsAt: string }) => s.startsAt.startsWith('2026-11-23')));
    assert.equal(r.body.slots.length, 4);
  });

  it('publishing an empty list removes all hours (back to the honest empty state)', async () => {
    const { call } = setup();
    await call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    await call('PUT', '/availability', 'doctor', undefined, { weekly: [], exceptions: [] });
    const r = await call('GET', '/appointments/slots', 'patient');
    assert.equal(r.body.published, false);
    assert.equal(r.body.slots.length, 0);
  });
});

describe('appointments: booking', () => {
  it('the patient books a published slot for themselves', async () => {
    const { call } = setup();
    await call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    const r = await call('POST', '/appointments', 'patient', undefined, { doctorId: DEMO_IDS.doctor, startsAt: MON_0900, reason: '  BP check  ' });
    assert.equal(r.status, 201);
    const a = r.body.appointment;
    assert.equal(a.status, 'booked');
    assert.equal(a.patientId, DEMO_IDS.patientRecord);
    assert.equal(a.endsAt, MON_0915);
    assert.equal(a.reason, 'BP check');
    assert.equal(a.doctorName, 'Dr. Arjun Rao');
    assert.equal(a.facilityName, 'PHC Hebbal');
    assert.equal(a.patientName, null, 'a patient view does not repeat their own name');
    const mine = await call('GET', '/appointments/mine', 'patient');
    assert.equal(mine.body.appointments.length, 1);
    const slots = await call('GET', '/appointments/slots', 'patient');
    assert.ok(!slots.body.slots.some((s: { startsAt: string }) => s.startsAt === MON_0900), 'the booked slot is gone');
  });

  it('a time nobody published cannot be booked', async () => {
    const { call } = setup();
    assert.equal((await call('POST', '/appointments', 'patient', undefined, { doctorId: DEMO_IDS.doctor, startsAt: MON_0900 })).body.reason, 'slot_unavailable');
    await call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    assert.equal((await call('POST', '/appointments', 'patient', undefined, { doctorId: DEMO_IDS.doctor, startsAt: '2026-11-16T03:31:00.000Z' })).body.reason, 'slot_unavailable');
  });

  it('double booking the same doctor slot is refused', async () => {
    const { call } = setup();
    await call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    assert.equal((await call('POST', '/appointments', 'patient', undefined, { doctorId: DEMO_IDS.doctor, startsAt: MON_0900 })).status, 201);
    const again = await call('POST', '/appointments', 'doctor', undefined, { patientId: DEMO_IDS.patientRecord, doctorId: DEMO_IDS.doctor, startsAt: MON_0900 });
    assert.equal(again.status, 409);
    assert.equal(again.body.reason, 'slot_unavailable');
  });

  it('two bookings racing for one slot: exactly one wins', async () => {
    const { call, records } = setup();
    records.data.patients.push({ ...records.data.patients[0], id: 'pat-2', userId: 'user-2', ashaWorkerId: DEMO_IDS.asha });
    records.data.profiles.push({ id: 'user-2', role: 'patient', fullName: 'P2', facilityId: null, isActive: true });
    await call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    const [a, b] = await Promise.all([
      call('POST', '/appointments', 'patient', undefined, { doctorId: DEMO_IDS.doctor, startsAt: MON_0900 }),
      call('POST', '/appointments', 'patient', 'user-2', { doctorId: DEMO_IDS.doctor, startsAt: MON_0900 }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  });

  it('a patient cannot hold two appointments at the same time', async () => {
    const { call, records } = setup();
    records.data.profiles.push({ id: 'doc-2', role: 'doctor', fullName: 'Dr. Two', facilityId: DEMO_FACILITY.id, isActive: true });
    await call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    await call('PUT', '/availability', 'admin', undefined, { ...MONDAY_HOURS, doctorId: 'doc-2' });
    await call('POST', '/appointments', 'patient', undefined, { doctorId: DEMO_IDS.doctor, startsAt: MON_0900 });
    const r = await call('POST', '/appointments', 'patient', undefined, { doctorId: 'doc-2', startsAt: MON_0900 });
    assert.equal(r.body.reason, 'patient_busy');
  });

  it('a patient cannot book for someone else', async () => {
    const { call } = setup();
    await call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    const r = await call('POST', '/appointments', 'patient', undefined, { patientId: OTHER_PATIENT, doctorId: DEMO_IDS.doctor, startsAt: MON_0900 });
    assert.equal(r.status, 403);
  });

  it('the ASHA books for an assigned patient only', async () => {
    const { call } = setup();
    await call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    const ok = await call('POST', '/appointments', 'asha', undefined, { patientId: DEMO_IDS.patientRecord, doctorId: DEMO_IDS.doctor, startsAt: MON_0900 });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.appointment.bookedBy, DEMO_IDS.asha);
    assert.equal(ok.body.appointment.patientName, 'Rekha Kumari');
    const no = await call('POST', '/appointments', 'asha', undefined, { patientId: OTHER_PATIENT, doctorId: DEMO_IDS.doctor, startsAt: MON_0915 });
    assert.equal(no.status, 403);
    assert.equal((await call('POST', '/appointments', 'asha', undefined, { doctorId: DEMO_IDS.doctor, startsAt: MON_0915 })).body.reason, 'patient_required');
    assert.equal((await call('GET', `/appointments/mine?patientId=${DEMO_IDS.patientRecord}`, 'asha')).body.appointments.length, 1);
    assert.equal((await call('GET', `/appointments/mine?patientId=${OTHER_PATIENT}`, 'asha')).status, 403);
  });

  it('a doctor books for a patient of their facility, not one registered elsewhere', async () => {
    const { call } = setup();
    await call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    assert.equal((await call('POST', '/appointments', 'doctor', undefined, { patientId: DEMO_IDS.patientRecord, doctorId: DEMO_IDS.doctor, startsAt: MON_0900 })).status, 201);
    assert.equal((await call('POST', '/appointments', 'doctor', undefined, { patientId: OTHER_PATIENT, doctorId: DEMO_IDS.doctor, startsAt: MON_0915 })).status, 403);
  });

  it('an inactive doctor cannot be booked and an unknown caller gets nothing', async () => {
    const { call } = setup();
    assert.equal((await call('POST', '/appointments', 'patient', undefined, { doctorId: 'doc-off', startsAt: MON_0900 })).body.reason, 'no_doctor');
    assert.equal((await call('GET', '/appointments/slots', 'patient', 'stranger')).status, 403);
  });
});

describe('appointments: reschedule, cancel, doctor actions', () => {
  async function booked() {
    const s = setup();
    await s.call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    const r = await s.call('POST', '/appointments', 'patient', undefined, { doctorId: DEMO_IDS.doctor, startsAt: MON_0900 });
    return { ...s, id: r.body.appointment.id as string };
  }

  it('reschedule makes a new booking, cancels the old one and frees its slot', async () => {
    const { call, id } = await booked();
    const r = await call('POST', `/appointments/${id}/reschedule`, 'patient', undefined, { startsAt: MON_0930 });
    assert.equal(r.status, 200);
    assert.equal(r.body.appointment.startsAt, MON_0930);
    assert.equal(r.body.appointment.rescheduledFrom, id);
    assert.equal(r.body.previous.status, 'cancelled');
    assert.equal(r.body.previous.cancelledReason, 'rescheduled');
    const slots = await call('GET', '/appointments/slots', 'patient');
    const starts = slots.body.slots.map((s: { startsAt: string }) => s.startsAt);
    assert.ok(starts.includes(MON_0900), 'old slot is free again');
    assert.ok(!starts.includes(MON_0930));
    // someone else can now take the old slot
    assert.equal((await call('POST', '/appointments', 'doctor', undefined, { patientId: DEMO_IDS.patientRecord, doctorId: DEMO_IDS.doctor, startsAt: MON_0900 })).status, 201, 'the old slot can be booked again');
  });

  it('reschedule to a taken or unpublished time keeps the original booking', async () => {
    const { call, id, repo } = await booked();
    const r = await call('POST', `/appointments/${id}/reschedule`, 'patient', undefined, { startsAt: '2026-11-17T03:30:00.000Z' });
    assert.equal(r.body.reason, 'slot_unavailable');
    assert.equal((await repo.getAppointment(id))?.status, 'booked');
    assert.equal((await call('POST', `/appointments/${id}/reschedule`, 'patient', undefined, { startsAt: MON_0900 })).body.reason, 'same_slot');
  });

  it('cancel frees the slot; a cancelled appointment cannot be cancelled again', async () => {
    const { call, id } = await booked();
    const r = await call('POST', `/appointments/${id}/cancel`, 'patient', undefined, { reason: 'Feeling better' });
    assert.equal(r.status, 200);
    assert.equal(r.body.appointment.status, 'cancelled');
    assert.equal(r.body.appointment.cancelledReason, 'Feeling better');
    const slots = await call('GET', '/appointments/slots', 'patient');
    assert.ok(slots.body.slots.some((s: { startsAt: string }) => s.startsAt === MON_0900));
    assert.equal((await call('POST', `/appointments/${id}/cancel`, 'patient')).body.reason, 'not_active');
  });

  it('another patient, another ASHA and another facility cannot touch the appointment', async () => {
    const { call, id, records } = await booked();
    records.data.profiles.push({ id: 'admin-b', role: 'admin', fullName: 'Admin B', facilityId: OTHER_FACILITY, isActive: true });
    assert.equal((await call('POST', `/appointments/${id}/cancel`, 'patient', OTHER_USER)).status, 403);
    assert.equal((await call('POST', `/appointments/${id}/cancel`, 'asha', 'asha-2')).status, 403);
    assert.equal((await call('POST', `/appointments/${id}/confirm`, 'doctor', OTHER_DOCTOR)).status, 403);
    assert.equal((await call('POST', `/appointments/${id}/confirm`, 'admin', 'admin-b')).status, 403);
  });

  it('patients cannot confirm or complete; the doctor confirms then completes', async () => {
    const { call, id } = await booked();
    assert.equal((await call('POST', `/appointments/${id}/confirm`, 'patient')).status, 403);
    assert.equal((await call('POST', `/appointments/${id}/complete`, 'asha')).status, 403);
    assert.equal((await call('POST', `/appointments/${id}/confirm`, 'doctor')).body.appointment.status, 'confirmed');
    assert.equal((await call('POST', `/appointments/${id}/confirm`, 'doctor')).body.reason, 'not_active');
    assert.equal((await call('POST', `/appointments/${id}/complete`, 'doctor')).body.appointment.status, 'completed');
    assert.equal((await call('POST', `/appointments/${id}/cancel`, 'patient')).body.reason, 'not_active');
  });

  it('no-show only once the time has come', async () => {
    const { call, id } = await booked();
    assert.equal((await call('POST', `/appointments/${id}/no-show`, 'doctor')).body.reason, 'too_early');
  });

  it("the doctor's day list shows the patient's name; the admin sees the facility", async () => {
    const { call } = await booked();
    const d = await call('GET', '/appointments/doctor?date=2026-11-16', 'doctor');
    assert.equal(d.status, 200);
    assert.equal(d.body.appointments.length, 1);
    assert.equal(d.body.appointments[0].patientName, 'Rekha Kumari');
    assert.equal((await call('GET', '/appointments/doctor?date=2026-11-16', 'admin')).body.appointments.length, 1);
    assert.equal((await call('GET', '/appointments/doctor?date=2026-11-17', 'doctor')).body.appointments.length, 0);
    assert.equal((await call('GET', '/appointments/doctor', 'patient')).status, 403);
    assert.equal((await call('GET', '/appointments/doctor?date=2026-11-16', 'doctor', OTHER_DOCTOR)).body.appointments.length, 0);
  });
});

describe('appointments: after the time', () => {
  it('once the appointment has started the patient cannot cancel it, and the doctor can mark no-show', async () => {
    const s = setup();
    await s.call('PUT', '/availability', 'doctor', undefined, MONDAY_HOURS);
    const id = (await s.call('POST', '/appointments', 'patient', undefined, { doctorId: DEMO_IDS.doctor, startsAt: MON_0900 })).body.appointment.id;
    const later = setup(new Date('2026-11-16T05:00:00.000Z'));
    // carry the data over to a router whose clock is later
    later.repo.data.rules = s.repo.data.rules;
    later.repo.data.appointments = s.repo.data.appointments;
    assert.equal((await later.call('POST', `/appointments/${id}/cancel`, 'patient')).body.reason, 'too_late');
    assert.equal((await later.call('POST', `/appointments/${id}/no-show`, 'doctor')).body.appointment.status, 'no_show');
  });
});
