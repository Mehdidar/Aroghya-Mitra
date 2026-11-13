import { addDays, dobFromAge, lmpFromWeeks } from '../logic/clinical';
import { evaluateVisit, maxRisk } from '../logic/rules';
import { emptyDB, type AshaDB, type StoredPatient } from '../store/store';
import type { ID, Lang, Patient, Visit, Vitals } from '../types';

/** Demo caseload so the app is explorable offline at the hackathon. Never queued for sync. */
export function buildDemoDB(ashaId: ID, lang: Lang = 'en', now = new Date()): AshaDB {
  const db = emptyDB();
  const iso = now.toISOString();
  const day = (d: number) => addDays(now, d);

  const add = (p: Omit<Patient, 'assignedAshaId'>, visit?: { daysAgo: number; vitals: Omit<Vitals, 'recordedAt'>; followUpIn?: number; notes?: string }) => {
    const patient: StoredPatient = { ...p, assignedAshaId: ashaId, updatedAt: iso, riskLevel: 'none' };
    db.patients[p.id] = patient;
    if (!visit) return;
    const at = day(-visit.daysAgo);
    const v: Visit = {
      id: `demo_visit_${p.id}`,
      patientId: p.id,
      ashaId,
      visitedAt: at,
      status: visit.followUpIn != null ? 'follow_up' : 'completed',
      vitals: { recordedAt: at, ...visit.vitals },
      photos: [],
      notes: visit.notes,
      followUpOn: visit.followUpIn != null ? day(visit.followUpIn - visit.daysAgo) : undefined,
      source: 'manual',
      updatedAt: at,
      syncState: 'synced',
    };
    db.visits[v.id] = v;
    const alerts = evaluateVisit(patient, v, lang);
    for (const a of alerts) db.alerts[a.id] = a;
    patient.riskLevel = maxRisk(alerts.map((a) => a.severity));
  };

  add(
    { id: 'demo_p1', name: 'Rekha Kumari', sex: 'F', dob: dobFromAge(24, 0, now), phone: '9800000001', village: 'Rampur', categories: ['pregnant'], pregnancy: { lmp: lmpFromWeeks(34, now), gravida: 1 } },
    { daysAgo: 1, vitals: { systolic: 150, diastolic: 100, hemoglobin: 9.2, weightKg: 58, symptoms: ['severe_headache', 'swelling_face_hands'], fetalMovement: 'normal' }, followUpIn: 1 },
  );
  add(
    { id: 'demo_p2', name: 'Pooja Yadav', sex: 'F', dob: dobFromAge(27, 0, now), phone: '9800000002', village: 'Rampur', categories: ['pregnant'], pregnancy: { lmp: lmpFromWeeks(22, now), gravida: 2 } },
    { daysAgo: 6, vitals: { systolic: 112, diastolic: 74, hemoglobin: 11.4, weightKg: 54, fetalMovement: 'normal' }, followUpIn: 7 },
  );
  add(
    { id: 'demo_p3', name: 'Baby of Sita', sex: 'M', dob: day(-9), village: 'Rampur', categories: ['newborn'], newborn: { birthWeightKg: 2.2 } },
    { daysAgo: 0, vitals: { respRate: 64, temperatureC: 37.2, weightKg: 2.3 }, followUpIn: 1 },
  );
  add(
    { id: 'demo_p4', name: 'Ramesh Singh', sex: 'M', dob: dobFromAge(67, 0, now), phone: '9800000004', village: 'Bhagwanpur', categories: ['elderly', 'ncd'], conditions: ['hypertension', 'diabetes'] },
    { daysAgo: 12, vitals: { systolic: 164, diastolic: 96, bloodSugarRandom: 238, pulse: 84 }, followUpIn: 10 },
  );
  add(
    { id: 'demo_p5', name: 'Mohd. Aslam', sex: 'M', dob: dobFromAge(41, 0, now), village: 'Bhagwanpur', categories: ['general'] },
    { daysAgo: 3, vitals: { temperatureC: 38.2, weightKg: 51, symptoms: ['cough_2_weeks', 'night_sweats', 'weight_loss'] }, followUpIn: 2 },
  );
  add({ id: 'demo_p6', name: 'Kamla Devi', sex: 'F', dob: dobFromAge(58, 0, now), phone: '9800000006', village: 'Sonpur', categories: ['ncd'], conditions: ['diabetes'] });
  return db;
}
