/**
 * Server-side entry to the same risk engine the phone runs offline, so the backend can
 * re-verify alerts on sync (never trust client-computed severity blindly) and P4 can
 * re-render reasons in the doctor's language. Pure TypeScript, no React Native imports.
 */
export { evaluateVisit, localizeAlert, maxRisk, RULES, SEVERITY_RANK, urgencyFor } from '../../features/asha/logic/rules';
export { t } from '../../features/asha/data/i18n';
export type { Patient, Referral, RiskAlert, Visit, Vitals } from '../../features/asha/types';
