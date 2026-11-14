import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findMedicine, MEDICINES, medicineLabel, searchMedicines } from '../catalog.ts';
import { INTERACTIONS } from '../interactions.ts';
import { PREGNANCY_RULES, pregnancyFromRecord } from '../safety.ts';
import { allAcknowledged, checkPrescription } from '../warnings.ts';

const notPregnant = { pregnant: false, weeks: null };

test('the lists are curated, sourced and all marked for clinical review', () => {
  assert.ok(MEDICINES.length >= 60);
  assert.equal(new Set(MEDICINES.map((m) => m.id)).size, MEDICINES.length, 'unique ids');
  for (const m of MEDICINES) {
    assert.equal(m.reviewStatus, 'needs_clinical_review');
    assert.match(m.source, /NLEM 2022/);
    assert.ok(m.strengths.length && m.forms.length && m.classes.length, m.id);
  }
  for (const i of INTERACTIONS) {
    assert.equal(i.reviewStatus, 'needs_clinical_review');
    assert.ok(i.source.length > 5 && i.effect && i.advice, i.id);
    for (const side of [...i.a, ...i.b]) {
      if (!side.startsWith('class:')) assert.ok(MEDICINES.some((m) => m.id === side), `${i.id}: ${side} is in the catalogue`);
    }
  }
  for (const r of PREGNANCY_RULES) assert.equal(r.reviewStatus, 'needs_clinical_review');
});

test('findMedicine matches generic names, brands and the longest name', () => {
  assert.equal(findMedicine('Labetalol 100 mg')?.id, 'labetalol');
  assert.equal(findMedicine('Tab. Augmentin 625')?.id, 'co_amoxiclav');
  assert.equal(findMedicine('Amoxicillin + clavulanic acid 625 mg')?.id, 'co_amoxiclav');
  assert.equal(findMedicine('amoxicillin 500 mg')?.id, 'amoxicillin');
  assert.equal(findMedicine('Dolo 650')?.id, 'paracetamol');
  assert.equal(findMedicine('Iron + folic acid')?.id, 'ifa');
  assert.equal(findMedicine('Something unknown'), null);
  assert.equal(searchMedicines('amlo')[0]?.id, 'amlodipine');
  assert.ok(searchMedicines('telma').some((m) => m.id === 'telmisartan'), 'brand search');
  assert.deepEqual(searchMedicines('a'), [], 'one letter is too short');
  assert.equal(medicineLabel(findMedicine('aspirin')!, '75 mg', 'tablet'), 'Acetylsalicylic acid 75 mg tablet');
});

test('penicillin allergy: amoxicillin and co-amoxiclav are contraindicated, cephalosporins are a caution', () => {
  const w = checkPrescription({ items: [{ name: 'Amoxicillin 500 mg' }, { name: 'Augmentin 625' }, { name: 'Cefalexin 500 mg' }, { name: 'Paracetamol 500 mg' }], allergies: ['Penicillin'], pregnancy: notPregnant, currentMedicines: [] });
  const allergy = w.filter((x) => x.kind === 'allergy');
  assert.deepEqual(allergy.filter((x) => x.severity === 'contraindicated').map((x) => x.medicines[0]).sort(), ['Amoxicillin 500 mg', 'Augmentin 625']);
  assert.deepEqual(allergy.filter((x) => x.severity === 'caution').map((x) => x.medicines[0]), ['Cefalexin 500 mg']);
  assert.ok(!w.some((x) => x.medicines.includes('Paracetamol 500 mg')));
  assert.ok(w.every((x) => x.needsClinicalReview));
});

test('an allergy recorded by drug name covers its class', () => {
  const w = checkPrescription({ items: [{ name: 'Ampicillin 500 mg injection' }], allergies: ['Amoxicillin (rash)'], pregnancy: notPregnant, currentMedicines: [] });
  assert.equal(w[0]?.kind, 'allergy');
  assert.equal(w[0]?.severity, 'contraindicated');
  const named = checkPrescription({ items: [{ name: 'Metformin 500 mg' }], allergies: ['Metformin'], pregnancy: notPregnant, currentMedicines: [] });
  assert.equal(named[0]?.ruleId, 'named');
  assert.deepEqual(checkPrescription({ items: [{ name: 'Metformin 500 mg' }], allergies: ['None known'], pregnancy: notPregnant, currentMedicines: [] }), []);
});

test('interactions: on the form and against current medicines, each once', () => {
  const w = checkPrescription({ items: [{ name: 'Ibuprofen 400 mg' }, { name: 'Ciprofloxacin 500 mg' }], allergies: [], pregnancy: notPregnant, currentMedicines: ['Warfarin 5 mg', 'Iron + folic acid'] });
  const ids = w.filter((x) => x.kind === 'interaction').map((x) => x.ruleId).sort();
  assert.deepEqual(ids, ['quinolone_cations', 'warfarin_ciprofloxacin', 'warfarin_nsaid']);
  assert.equal(w[0].severity, 'major', 'worst first');
  const again = checkPrescription({ items: [{ name: 'Ibuprofen 400 mg' }, { name: 'Ciprofloxacin 500 mg' }], allergies: [], pregnancy: notPregnant, currentMedicines: ['Warfarin 5 mg', 'Iron + folic acid'] });
  assert.deepEqual(again.map((x) => x.id), w.map((x) => x.id), 'stable ids');
});

test('ACE inhibitor + ARB, statin + clarithromycin, duplicates', () => {
  const w = checkPrescription({ items: [{ name: 'Enalapril 5 mg' }, { name: 'Telmisartan 40 mg' }, { name: 'Clarithromycin 500 mg' }], allergies: [], pregnancy: notPregnant, currentMedicines: ['Atorvastatin 10 mg', 'Telma 40'] });
  const rules = w.map((x) => x.ruleId);
  assert.ok(rules.includes('ace_arb_dual'));
  assert.ok(rules.includes('statin_macrolide'));
  assert.ok(w.some((x) => x.kind === 'duplicate' && x.medicines.includes('Telma 40')));
});

test('pregnancy: ACE inhibitors, ARBs, statins, warfarin, isotretinoin flagged; NSAIDs only from 20 weeks', () => {
  const at = (weeks: number | null) => ({ pregnant: true, weeks });
  const items = ['Enalapril 5 mg', 'Losartan 50 mg', 'Atorvastatin 10 mg', 'Warfarin 5 mg', 'Isotretinoin 20 mg', 'Nifedipine 10 mg', 'Labetalol 100 mg'].map((name) => ({ name }));
  const w = checkPrescription({ items, allergies: [], pregnancy: at(34), currentMedicines: [] }).filter((x) => x.kind === 'pregnancy');
  assert.deepEqual(w.map((x) => x.medicines[0]).sort(), ['Atorvastatin 10 mg', 'Enalapril 5 mg', 'Isotretinoin 20 mg', 'Losartan 50 mg', 'Warfarin 5 mg']);
  assert.ok(w.every((x) => x.severity === 'contraindicated'));

  const nsaid = (weeks: number | null) => checkPrescription({ items: [{ name: 'Ibuprofen 400 mg' }], allergies: [], pregnancy: at(weeks), currentMedicines: [] }).filter((x) => x.kind === 'pregnancy');
  assert.equal(nsaid(12).length, 0, 'before 20 weeks no NSAID flag');
  assert.equal(nsaid(24).length, 1);
  assert.match(nsaid(null)[0].message, /not recorded/, 'unknown weeks still warns, and says so');
  assert.equal(checkPrescription({ items: [{ name: 'Enalapril 5 mg' }], allergies: [], pregnancy: notPregnant, currentMedicines: [] }).length, 0);
});

test('unrecognised medicines are flagged, and acknowledgement needs every warning', () => {
  const w = checkPrescription({ items: [{ name: 'Herbal tonic' }, { name: 'Amoxicillin 500 mg' }], allergies: ['penicillin'], pregnancy: notPregnant, currentMedicines: [] });
  assert.ok(w.some((x) => x.kind === 'unrecognised'));
  assert.equal(allAcknowledged(w, [w[0].id]), false);
  assert.equal(allAcknowledged(w, w.map((x) => x.id)), true);
  assert.equal(allAcknowledged([], []), true);
});

test('pregnancyFromRecord reads conditions and the newest week', () => {
  assert.deepEqual(pregnancyFromRecord(['Gestational hypertension'], ['BP 150/100 at 34 weeks with headache', 'Gestational hypertension, 28 weeks']), { pregnant: true, weeks: 34, basis: 'Gestational hypertension' });
  assert.deepEqual(pregnancyFromRecord(['Type 2 diabetes'], ['Fever for 2 weeks']), { pregnant: false, weeks: null, basis: null });
  assert.equal(pregnancyFromRecord([], ['Antenatal visit, 20 weeks']).weeks, 20);
});
