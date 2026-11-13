// Static import map of every locale file: one line per language x namespace.
// To add a namespace (e.g. 'asha'): create locales/<lang>/asha.json for all 7 languages, add the
// imports below and add it to NAMESPACES. Missing keys fall back to English (Kashmiri: Urdu, then English).

import en_common from './en/common.json';
import en_auth from './en/auth.json';
import en_patient from './en/patient.json';
import en_nutrition from './en/nutrition.json';
import hi_common from './hi/common.json';
import hi_auth from './hi/auth.json';
import hi_patient from './hi/patient.json';
import hi_nutrition from './hi/nutrition.json';
import kn_common from './kn/common.json';
import kn_auth from './kn/auth.json';
import kn_patient from './kn/patient.json';
import kn_nutrition from './kn/nutrition.json';
import ur_common from './ur/common.json';
import ur_auth from './ur/auth.json';
import ur_patient from './ur/patient.json';
import ur_nutrition from './ur/nutrition.json';
import ta_common from './ta/common.json';
import ta_auth from './ta/auth.json';
import ta_patient from './ta/patient.json';
import ta_nutrition from './ta/nutrition.json';
import te_common from './te/common.json';
import te_auth from './te/auth.json';
import te_patient from './te/patient.json';
import te_nutrition from './te/nutrition.json';
import ks_common from './ks/common.json';
import ks_auth from './ks/auth.json';
import ks_patient from './ks/patient.json';
import ks_nutrition from './ks/nutrition.json';

export const NAMESPACES = ['common', 'auth', 'patient', 'nutrition'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const resources = {
  en: { common: en_common, auth: en_auth, patient: en_patient, nutrition: en_nutrition },
  hi: { common: hi_common, auth: hi_auth, patient: hi_patient, nutrition: hi_nutrition },
  kn: { common: kn_common, auth: kn_auth, patient: kn_patient, nutrition: kn_nutrition },
  ur: { common: ur_common, auth: ur_auth, patient: ur_patient, nutrition: ur_nutrition },
  ta: { common: ta_common, auth: ta_auth, patient: ta_patient, nutrition: ta_nutrition },
  te: { common: te_common, auth: te_auth, patient: te_patient, nutrition: te_nutrition },
  ks: { common: ks_common, auth: ks_auth, patient: ks_patient, nutrition: ks_nutrition },
} as const;
