/**
 * Curated list of common primary-care medicines for the doctor's prescription
 * search (AI copilot, feature F).
 *
 * SOURCE: National List of Essential Medicines (NLEM) 2022, Ministry of Health
 * and Family Welfare, Government of India: generic names, strengths and dosage
 * forms usually stocked at a PHC. Entries with `nlem: false` are NOT on NLEM
 * 2022 and are listed only so the safety checks recognise them when a doctor
 * types them (e.g. isotretinoin, commonly prescribed fixed-dose combinations).
 *
 * STATUS: needs clinical review. Strengths and forms were transcribed by hand
 * and must be checked against the official NLEM 2022 PDF and the facility's
 * stock list before real use. No doses are suggested: the doctor writes the
 * dose, frequency and duration.
 *
 * `classes` drive the allergy, interaction and pregnancy checks. `aliases`
 * are common Indian brand names or abbreviations, for matching typed text.
 */

export type MedicineForm = 'tablet' | 'capsule' | 'syrup' | 'suspension' | 'injection' | 'inhaler' | 'sachet' | 'drops' | 'ointment';

export type DrugClass =
  | 'penicillin'
  | 'cephalosporin'
  | 'macrolide'
  | 'fluoroquinolone'
  | 'tetracycline'
  | 'sulfonamide_antibiotic'
  | 'nitroimidazole'
  | 'azole_antifungal'
  | 'nsaid'
  | 'aspirin'
  | 'paracetamol'
  | 'opioid'
  | 'ace_inhibitor'
  | 'arb'
  | 'beta_blocker'
  | 'calcium_channel_blocker'
  | 'thiazide'
  | 'loop_diuretic'
  | 'potassium_sparing_diuretic'
  | 'statin'
  | 'antiplatelet'
  | 'vitamin_k_antagonist'
  | 'biguanide'
  | 'sulfonylurea'
  | 'insulin'
  | 'thyroid_hormone'
  | 'antithyroid'
  | 'corticosteroid'
  | 'antihistamine'
  | 'ppi'
  | 'h2_blocker'
  | 'antiemetic'
  | 'antiepileptic'
  | 'benzodiazepine'
  | 'ssri'
  | 'tricyclic'
  | 'retinoid'
  | 'antimetabolite'
  | 'prostaglandin'
  | 'iron'
  | 'calcium'
  | 'rifamycin'
  | 'cardiac_glycoside'
  | 'other';

export interface Medicine {
  id: string;
  /** Generic (INN) name, English. */
  generic: string;
  strengths: string[];
  forms: MedicineForm[];
  classes: DrugClass[];
  /** Brand names and abbreviations people type. Lower case. */
  aliases: string[];
  nlem: boolean;
  source: string;
  reviewStatus: 'needs_clinical_review';
}

const NLEM = 'NLEM 2022 (MoHFW, India)';
const NOT_NLEM = 'Not on NLEM 2022: listed only so safety checks recognise it';

function m(id: string, generic: string, strengths: string[], forms: MedicineForm[], classes: DrugClass[], aliases: string[] = [], nlem = true): Medicine {
  return { id, generic, strengths, forms, classes, aliases, nlem, source: nlem ? NLEM : NOT_NLEM, reviewStatus: 'needs_clinical_review' };
}

export const MEDICINES: Medicine[] = [
  // Analgesics, antipyretics, NSAIDs
  m('paracetamol', 'Paracetamol', ['500 mg', '650 mg', '125 mg/5 ml'], ['tablet', 'syrup'], ['paracetamol'], ['crocin', 'dolo', 'calpol', 'pcm', 'acetaminophen']),
  m('ibuprofen', 'Ibuprofen', ['200 mg', '400 mg', '100 mg/5 ml'], ['tablet', 'suspension'], ['nsaid'], ['brufen', 'ibugesic', 'combiflam']),
  m('diclofenac', 'Diclofenac', ['50 mg', '75 mg/ml'], ['tablet', 'injection'], ['nsaid'], ['voveran', 'voltaren']),
  m('aspirin', 'Acetylsalicylic acid (aspirin)', ['75 mg', '150 mg', '325 mg'], ['tablet'], ['aspirin', 'antiplatelet'], ['ecosprin', 'disprin', 'asa']),
  m('tramadol', 'Tramadol', ['50 mg'], ['capsule', 'tablet'], ['opioid'], ['ultracet', 'tramazac']),
  // Antibiotics
  m('amoxicillin', 'Amoxicillin', ['250 mg', '500 mg', '125 mg/5 ml'], ['capsule', 'suspension'], ['penicillin'], ['mox', 'novamox', 'amoxil']),
  m('co_amoxiclav', 'Amoxicillin + clavulanic acid', ['500 mg + 125 mg', '200 mg + 28.5 mg/5 ml'], ['tablet', 'suspension'], ['penicillin'], ['augmentin', 'clavam', 'moxclav', 'co-amoxiclav']),
  m('ampicillin', 'Ampicillin', ['500 mg'], ['injection'], ['penicillin']),
  m('cloxacillin', 'Cloxacillin', ['250 mg', '500 mg'], ['capsule'], ['penicillin']),
  m('benzathine_penicillin', 'Benzathine benzylpenicillin', ['6 lakh IU', '12 lakh IU'], ['injection'], ['penicillin'], ['penidure', 'bicillin']),
  m('cefalexin', 'Cefalexin', ['250 mg', '500 mg'], ['capsule'], ['cephalosporin'], ['cephalexin', 'sporidex']),
  m('cefixime', 'Cefixime', ['200 mg', '100 mg/5 ml'], ['tablet', 'suspension'], ['cephalosporin'], ['taxim-o', 'zifi']),
  m('ceftriaxone', 'Ceftriaxone', ['250 mg', '1 g'], ['injection'], ['cephalosporin'], ['monocef']),
  m('azithromycin', 'Azithromycin', ['250 mg', '500 mg', '200 mg/5 ml'], ['tablet', 'suspension'], ['macrolide'], ['azithral', 'azee', 'zithrox']),
  m('clarithromycin', 'Clarithromycin', ['250 mg', '500 mg'], ['tablet'], ['macrolide'], ['claribid']),
  m('erythromycin', 'Erythromycin', ['250 mg', '500 mg'], ['tablet'], ['macrolide']),
  m('ciprofloxacin', 'Ciprofloxacin', ['250 mg', '500 mg'], ['tablet'], ['fluoroquinolone'], ['ciplox', 'cifran']),
  m('doxycycline', 'Doxycycline', ['100 mg'], ['capsule'], ['tetracycline'], ['doxy']),
  m('cotrimoxazole', 'Sulfamethoxazole + trimethoprim (co-trimoxazole)', ['400 mg + 80 mg', '800 mg + 160 mg'], ['tablet'], ['sulfonamide_antibiotic'], ['septran', 'bactrim', 'co-trimoxazole']),
  m('metronidazole', 'Metronidazole', ['200 mg', '400 mg'], ['tablet'], ['nitroimidazole'], ['flagyl', 'metrogyl']),
  m('nitrofurantoin', 'Nitrofurantoin', ['50 mg', '100 mg'], ['capsule'], ['other'], ['martifur']),
  m('fluconazole', 'Fluconazole', ['50 mg', '150 mg'], ['tablet'], ['azole_antifungal'], ['forcan', 'zocon']),
  m('albendazole', 'Albendazole', ['400 mg'], ['tablet'], ['other'], ['zentel']),
  m('rifampicin', 'Rifampicin', ['150 mg', '450 mg'], ['capsule'], ['rifamycin'], ['rcinex', 'r-cin']),
  m('isoniazid', 'Isoniazid', ['100 mg', '300 mg'], ['tablet'], ['other'], ['inh']),
  // Diabetes
  m('metformin', 'Metformin', ['500 mg', '1000 mg'], ['tablet'], ['biguanide'], ['glycomet', 'glucophage', 'obimet']),
  m('glimepiride', 'Glimepiride', ['1 mg', '2 mg'], ['tablet'], ['sulfonylurea'], ['amaryl', 'glimestar']),
  m('glibenclamide', 'Glibenclamide', ['2.5 mg', '5 mg'], ['tablet'], ['sulfonylurea'], ['daonil', 'glyburide']),
  m('insulin_soluble', 'Human insulin (soluble)', ['40 IU/ml', '100 IU/ml'], ['injection'], ['insulin'], ['actrapid', 'huminsulin r']),
  // Blood pressure, heart
  m('amlodipine', 'Amlodipine', ['2.5 mg', '5 mg', '10 mg'], ['tablet'], ['calcium_channel_blocker'], ['amlong', 'amlip', 'stamlo', 'norvasc']),
  m('nifedipine', 'Nifedipine', ['10 mg', '20 mg (SR)'], ['tablet', 'capsule'], ['calcium_channel_blocker'], ['depin', 'calcigard']),
  m('labetalol', 'Labetalol', ['100 mg', '5 mg/ml'], ['tablet', 'injection'], ['beta_blocker'], ['labebet', 'lobet']),
  m('atenolol', 'Atenolol', ['25 mg', '50 mg'], ['tablet'], ['beta_blocker'], ['tenormin', 'aten']),
  m('metoprolol', 'Metoprolol', ['25 mg', '50 mg'], ['tablet'], ['beta_blocker'], ['metolar', 'betaloc']),
  m('methyldopa', 'Methyldopa', ['250 mg'], ['tablet'], ['other'], ['aldomet', 'alphadopa']),
  m('enalapril', 'Enalapril', ['2.5 mg', '5 mg', '10 mg'], ['tablet'], ['ace_inhibitor'], ['envas', 'enam']),
  m('ramipril', 'Ramipril', ['2.5 mg', '5 mg'], ['tablet', 'capsule'], ['ace_inhibitor'], ['cardace']),
  m('telmisartan', 'Telmisartan', ['20 mg', '40 mg'], ['tablet'], ['arb'], ['telma', 'telsar', 'telmikind']),
  m('losartan', 'Losartan', ['25 mg', '50 mg'], ['tablet'], ['arb'], ['losar', 'repace']),
  m('hydrochlorothiazide', 'Hydrochlorothiazide', ['12.5 mg', '25 mg'], ['tablet'], ['thiazide'], ['hctz', 'aquazide']),
  m('furosemide', 'Furosemide', ['40 mg', '10 mg/ml'], ['tablet', 'injection'], ['loop_diuretic'], ['lasix', 'frusemide']),
  m('spironolactone', 'Spironolactone', ['25 mg', '50 mg'], ['tablet'], ['potassium_sparing_diuretic'], ['aldactone']),
  m('atorvastatin', 'Atorvastatin', ['10 mg', '20 mg', '40 mg'], ['tablet'], ['statin'], ['atorva', 'lipitor', 'storvas']),
  m('clopidogrel', 'Clopidogrel', ['75 mg'], ['tablet'], ['antiplatelet'], ['clopilet', 'plavix']),
  m('warfarin', 'Warfarin', ['1 mg', '2 mg', '5 mg'], ['tablet'], ['vitamin_k_antagonist'], ['warf', 'coumadin']),
  m('digoxin', 'Digoxin', ['0.25 mg'], ['tablet'], ['cardiac_glycoside'], ['lanoxin']),
  // Thyroid, steroids, allergy, respiratory
  m('levothyroxine', 'Levothyroxine', ['25 mcg', '50 mcg', '100 mcg'], ['tablet'], ['thyroid_hormone'], ['thyronorm', 'eltroxin', 'thyrox']),
  m('carbimazole', 'Carbimazole', ['5 mg', '10 mg'], ['tablet'], ['antithyroid'], ['neomercazole']),
  m('prednisolone', 'Prednisolone', ['5 mg', '10 mg', '20 mg'], ['tablet'], ['corticosteroid'], ['wysolone', 'omnacortil']),
  m('cetirizine', 'Cetirizine', ['10 mg', '5 mg/5 ml'], ['tablet', 'syrup'], ['antihistamine'], ['cetzine', 'alerid', 'okacet']),
  m('chlorphenamine', 'Chlorphenamine', ['4 mg'], ['tablet'], ['antihistamine'], ['cpm', 'chlorpheniramine', 'piriton']),
  m('salbutamol', 'Salbutamol', ['2 mg', '4 mg', '100 mcg/dose'], ['tablet', 'inhaler'], ['other'], ['asthalin', 'ventolin', 'albuterol']),
  m('budesonide', 'Budesonide', ['100 mcg/dose', '200 mcg/dose'], ['inhaler'], ['corticosteroid'], ['budecort', 'pulmicort']),
  // Gut
  m('omeprazole', 'Omeprazole', ['20 mg'], ['capsule'], ['ppi'], ['omez', 'ocid']),
  m('pantoprazole', 'Pantoprazole', ['40 mg'], ['tablet'], ['ppi'], ['pan', 'pantocid', 'pantop']),
  m('famotidine', 'Famotidine', ['20 mg', '40 mg'], ['tablet'], ['h2_blocker'], ['famocid']),
  m('ondansetron', 'Ondansetron', ['4 mg', '2 mg/ml'], ['tablet', 'injection'], ['antiemetic'], ['emeset', 'ondem']),
  m('domperidone', 'Domperidone', ['10 mg'], ['tablet'], ['antiemetic'], ['domstal']),
  m('ors', 'Oral rehydration salts (ORS)', ['WHO formula'], ['sachet'], ['other'], ['electral']),
  m('zinc', 'Zinc sulphate', ['20 mg'], ['tablet'], ['other'], ['zinconia']),
  // Pregnancy, nutrition
  m('ifa', 'Ferrous salt + folic acid (IFA)', ['60 mg elemental iron + 500 mcg folic acid', '100 mg elemental iron + 500 mcg folic acid'], ['tablet'], ['iron'], ['iron + folic acid', 'iron folic', 'autrin', 'dexorange', 'ferrous sulphate']),
  m('folic_acid', 'Folic acid', ['400 mcg', '5 mg'], ['tablet'], ['other'], ['folvite']),
  m('calcium_d3', 'Calcium carbonate + vitamin D3', ['500 mg + 250 IU'], ['tablet'], ['calcium'], ['shelcal', 'calcium', 'gemcal']),
  m('magnesium_sulphate', 'Magnesium sulphate', ['50% w/v'], ['injection'], ['other'], ['mgso4']),
  m('oxytocin', 'Oxytocin', ['10 IU/ml'], ['injection'], ['other'], ['pitocin']),
  m('misoprostol', 'Misoprostol', ['200 mcg'], ['tablet'], ['prostaglandin'], ['cytotec', 'misoprost']),
  // Nervous system
  m('phenytoin', 'Phenytoin', ['100 mg', '50 mg/ml'], ['tablet', 'injection'], ['antiepileptic'], ['eptoin', 'dilantin']),
  m('valproate', 'Sodium valproate', ['200 mg', '500 mg'], ['tablet'], ['antiepileptic'], ['valparin', 'encorate', 'valproic acid']),
  m('carbamazepine', 'Carbamazepine', ['100 mg', '200 mg'], ['tablet'], ['antiepileptic'], ['tegretol', 'mazetol']),
  m('diazepam', 'Diazepam', ['5 mg', '5 mg/ml'], ['tablet', 'injection'], ['benzodiazepine'], ['valium', 'calmpose']),
  m('amitriptyline', 'Amitriptyline', ['10 mg', '25 mg'], ['tablet'], ['tricyclic'], ['tryptomer']),
  m('fluoxetine', 'Fluoxetine', ['20 mg'], ['capsule'], ['ssri'], ['fludac', 'prozac']),
  // Others (safety checks)
  m('methotrexate', 'Methotrexate', ['2.5 mg'], ['tablet'], ['antimetabolite'], ['folitrax']),
  m('allopurinol', 'Allopurinol', ['100 mg'], ['tablet'], ['other'], ['zyloric']),
  m('isotretinoin', 'Isotretinoin', ['10 mg', '20 mg'], ['capsule'], ['retinoid'], ['isotroin', 'accutane'], false),
];

export const MEDICINE_LIST_SOURCE = { list: 'NLEM 2022, MoHFW India', count: MEDICINES.length, status: 'needs clinical review' } as const;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syrup|inj|injection)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const wordHit = (text: string, needle: string) => {
  if (!needle) return false;
  const i = text.indexOf(needle);
  if (i < 0) return false;
  const before = i === 0 ? ' ' : text[i - 1];
  const after = text[i + needle.length] ?? ' ';
  return !/[a-z]/.test(before) && !/[a-z]/.test(after);
};

/** The catalogue entry a typed or chosen medicine name refers to ("Labetalol 100 mg", "Augmentin 625"), or null. */
export function findMedicine(name: string, list: Medicine[] = MEDICINES): Medicine | null {
  const text = norm(name);
  if (!text) return null;
  let best: { med: Medicine; len: number } | null = null;
  for (const med of list) {
    const names = [norm(med.generic), norm(med.generic.replace(/\s*\(.*\)\s*/, '')), med.id.replace(/_/g, ' '), ...med.aliases.map(norm)];
    for (const n of names) {
      // Longest match wins, so "amoxicillin + clavulanic acid" beats "amoxicillin".
      if (wordHit(text, n) && (!best || n.length > best.len)) best = { med, len: n.length };
    }
  }
  return best?.med ?? null;
}

/** Search for the picker: generic names first, then aliases. */
export function searchMedicines(query: string, limit = 8, list: Medicine[] = MEDICINES): Medicine[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const scored: { med: Medicine; score: number }[] = [];
  for (const med of list) {
    const g = norm(med.generic);
    let score = 0;
    if (g.startsWith(q)) score = 3;
    else if (g.split(' ').some((w) => w.startsWith(q))) score = 2;
    else if (med.aliases.some((a) => a.startsWith(q))) score = 1;
    if (score) scored.push({ med, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.med.generic.localeCompare(b.med.generic)).slice(0, limit).map((s) => s.med);
}

/** "Amlodipine 5 mg tablet": what the picker writes into the name field. Medicine names stay in English. */
export function medicineLabel(med: Medicine, strength?: string | null, form?: MedicineForm | null): string {
  const name = med.generic.replace(/\s*\(.*\)\s*/, ' ').trim();
  return [name, strength ?? null, form ?? null].filter(Boolean).join(' ');
}
