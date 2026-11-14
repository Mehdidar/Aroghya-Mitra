/**
 * DEMO preventive records for the fictional demo cast, shared by the server's
 * in-memory store and the app's offline mode. Every record has source 'demo'
 * or a demo author; nothing here is a real person's data.
 *
 *  - Rekha Kumari: 34 weeks pregnant, gestational hypertension, Td-1 and Td-2
 *    done, three ANC visits, Hb 9.6 g/dL sixteen days ago (the same lab result the doctor copilot shows).
 *  - "Baby of Sita" (ASHA caseload demo_p3): 9 days old, born 2.2 kg.
 */
import { DEMO_IDS } from '../../shared/demo.ts';
import { addDays, toDay } from './dates.ts';
import type { PreventionPerson } from './types.ts';

export const DEMO_CHILD_ID = 'demo_p3';

export interface DemoPreventionSubject {
  patientId: string;
  name: string;
  ashaWorkerId: string;
  /** Children linked to this person (none in the demo: Sita is not in the demo cast). */
  childIds: string[];
  person: PreventionPerson;
}

export function demoPrevention(now: string | Date): DemoPreventionSubject[] {
  const today = toDay(now);
  const ago = (d: number) => addDays(today, -d);
  const lmp = ago(34 * 7);
  const week = (w: number) => addDays(lmp, w * 7);
  const asha = DEMO_IDS.asha;
  const doctor = DEMO_IDS.doctor;

  const rekha: DemoPreventionSubject = {
    patientId: DEMO_IDS.patientRecord,
    name: 'Rekha Kumari',
    ashaWorkerId: asha,
    childIds: [],
    person: {
      id: DEMO_IDS.patientRecord,
      dob: ago(24 * 365 + 40),
      sex: 'female',
      pregnancy: { lmp, gravida: 1 },
      conditions: ['Gestational hypertension'],
      vaccinations: [
        { id: 'demo-vax-rekha-td1', vaccineCode: 'td_pregnancy', dose: 1, givenOn: week(12), givenBy: asha, batch: 'DEMO-TD-01', source: 'demo' },
        { id: 'demo-vax-rekha-td2', vaccineCode: 'td_pregnancy', dose: 2, givenOn: week(16), givenBy: asha, batch: 'DEMO-TD-02', source: 'demo' },
      ],
      screenings: [
        { id: 'demo-scr-rekha-anc1', kind: 'anc', screenedOn: week(11), by: doctor, value: { visit: 1, demo: true } },
        { id: 'demo-scr-rekha-anc2', kind: 'anc', screenedOn: week(20), by: doctor, value: { visit: 2, demo: true } },
        { id: 'demo-scr-rekha-anc3', kind: 'anc', screenedOn: week(28), by: doctor, value: { visit: 3, demo: true } },
        { id: 'demo-scr-rekha-usg', kind: 'ultrasound', screenedOn: week(28), by: doctor, value: { note: 'Antenatal ultrasound, 28 weeks (demo)' } },
        { id: 'demo-scr-rekha-hb', kind: 'hb', screenedOn: ago(16), by: doctor, value: { gdl: 9.6, demo: true } },
        { id: 'demo-scr-rekha-bp', kind: 'bp', screenedOn: ago(1), by: asha, value: { systolic: 150, diastolic: 100, demo: true } },
      ],
      growth: [],
    },
  };

  const dob = ago(9);
  const baby: DemoPreventionSubject = {
    patientId: DEMO_CHILD_ID,
    name: 'Baby of Sita',
    ashaWorkerId: asha,
    childIds: [],
    person: {
      id: DEMO_CHILD_ID,
      dob,
      sex: 'male',
      birthWeightKg: 2.2,
      homeVisits: [addDays(dob, 3), addDays(dob, 7)],
      vaccinations: [
        { id: 'demo-vax-baby-bcg', vaccineCode: 'bcg', dose: 1, givenOn: dob, givenBy: doctor, batch: 'DEMO-BCG-01', source: 'demo' },
        { id: 'demo-vax-baby-opv0', vaccineCode: 'opv', dose: 0, givenOn: dob, givenBy: doctor, batch: 'DEMO-OPV-01', source: 'demo' },
        { id: 'demo-vax-baby-hepb0', vaccineCode: 'hepb', dose: 0, givenOn: dob, givenBy: doctor, batch: 'DEMO-HEPB-01', source: 'demo' },
      ],
      growth: [
        { id: 'demo-gro-baby-d3', measuredOn: addDays(dob, 3), weightKg: 2.15, measuredBy: asha },
        { id: 'demo-gro-baby-d9', measuredOn: today, weightKg: 2.3, measuredBy: asha },
      ],
      screenings: [],
    },
  };
  return [rekha, baby];
}
