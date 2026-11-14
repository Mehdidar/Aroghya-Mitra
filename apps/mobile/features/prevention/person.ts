/** Builds the person for the on-device plan: server copy, ASHA caseload, demo data, plus writes not yet synced. */
import { demoPrevention, toDay, type PreventionPerson, type ScreeningResult } from '@am/patient-ai/prevention/index';
import { sameRecord, type AshaPatient, type Visit } from '@am/shared';

import type { PendingRecord } from './types';

/** Adds queued (unsynced) records so the plan reflects what the worker just entered. */
export function withPending(person: PreventionPerson, patientId: string, queue: PendingRecord[]): PreventionPerson {
  const mine = queue.filter((q) => !q.rejected && sameRecord(q.patientId, patientId));
  if (!mine.length) return person;
  const p: PreventionPerson = { ...person, vaccinations: [...(person.vaccinations ?? [])], growth: [...(person.growth ?? [])], screenings: [...(person.screenings ?? [])] };
  const known = new Set([...p.vaccinations!, ...p.growth!, ...p.screenings!].map((r) => r.id).filter(Boolean));
  for (const q of mine) {
    if (known.has(q.record.id)) continue;
    const r = q.record as Record<string, unknown> & { id: string };
    if (q.kind === 'vaccination') p.vaccinations!.push({ id: r.id, vaccineCode: String(r.vaccineCode), dose: Number(r.dose), givenOn: String(r.givenOn), batch: (r.batch as string) ?? null });
    else if (q.kind === 'growth') p.growth!.push({ id: r.id, measuredOn: String(r.measuredOn), weightKg: (r.weightKg as number) ?? null, heightCm: (r.heightCm as number) ?? null, muacCm: (r.muacCm as number) ?? null });
    else if (q.kind === 'screening') p.screenings!.push({ id: r.id, kind: r.kind as ScreeningResult['kind'], screenedOn: String(r.screenedOn), value: (r.value as Record<string, unknown>) ?? {} });
    else if (q.kind === 'pregnancy') p.pregnancy = { lmp: String(r.lmp) };
  }
  return p;
}

/** The labelled demo records (Rekha, Baby of Sita) when the phone has no server copy. */
export function demoPersonFor(patientId: string, now = new Date()): PreventionPerson | null {
  return demoPrevention(now).find((s) => sameRecord(s.patientId, patientId))?.person ?? null;
}

/** What the ASHA phone already knows about a patient, as a plan person (offline). */
export function personFromAsha(p: AshaPatient, visits: Visit[]): PreventionPerson {
  const screenings: ScreeningResult[] = [];
  const growth: NonNullable<PreventionPerson['growth']> = [];
  for (const v of visits) {
    const on = toDay(v.vitals?.recordedAt ?? v.visitedAt);
    const x = v.vitals;
    if (!x) continue;
    if (x.systolic && x.diastolic) screenings.push({ id: `visit:${v.id}:bp`, kind: 'bp', screenedOn: on, value: { systolic: x.systolic, diastolic: x.diastolic } });
    if (x.hemoglobin) screenings.push({ id: `visit:${v.id}:hb`, kind: 'hb', screenedOn: on, value: { gdl: x.hemoglobin } });
    if (x.bloodSugarFasting) screenings.push({ id: `visit:${v.id}:fbs`, kind: 'sugar', screenedOn: on, value: { mgdl: x.bloodSugarFasting, fasting: true } });
    else if (x.bloodSugarRandom) screenings.push({ id: `visit:${v.id}:rbs`, kind: 'sugar', screenedOn: on, value: { mgdl: x.bloodSugarRandom } });
    if (x.weightKg && (p.categories.includes('newborn') || (p.dob && Date.parse(p.dob) > Date.now() - 6 * 365 * 86_400_000))) growth.push({ id: `visit:${v.id}:w`, measuredOn: on, weightKg: x.weightKg });
  }
  return {
    id: p.id,
    dob: p.dob ? toDay(p.dob) : null,
    sex: p.sex === 'F' ? 'female' : p.sex === 'M' ? 'male' : null,
    pregnancy: p.pregnancy?.lmp ? { lmp: toDay(p.pregnancy.lmp), gravida: p.pregnancy.gravida } : null,
    birthWeightKg: p.newborn?.birthWeightKg ?? null,
    conditions: p.conditions ?? [],
    homeVisits: visits.map((v) => toDay(v.visitedAt)),
    vaccinations: [],
    growth,
    screenings,
  };
}

/** Server/demo person + what the ASHA phone has: records are unioned by id. */
export function mergePersons(base: PreventionPerson | null, extra: PreventionPerson): PreventionPerson {
  if (!base) return extra;
  const byId = <T extends { id?: string }>(a: T[] = [], b: T[] = []) => {
    const ids = new Set(a.map((x) => x.id));
    return [...a, ...b.filter((x) => !x.id || !ids.has(x.id))];
  };
  return {
    ...base,
    dob: base.dob ?? extra.dob,
    sex: base.sex ?? extra.sex,
    pregnancy: base.pregnancy ?? extra.pregnancy,
    birthWeightKg: base.birthWeightKg ?? extra.birthWeightKg,
    conditions: [...new Set([...(base.conditions ?? []), ...(extra.conditions ?? [])])],
    homeVisits: [...new Set([...(base.homeVisits ?? []), ...(extra.homeVisits ?? [])])],
    vaccinations: byId(base.vaccinations, extra.vaccinations),
    growth: byId(base.growth, extra.growth),
    screenings: byId(base.screenings, extra.screenings),
  };
}
