/**
 * Records types: re-exported from @am/shared under the names P4's code was
 * written with. `RiskLevel`, `Referral` and `RiskAlert` here are the
 * record-level shapes (RecordRiskLevel, RecordReferral, RecordRiskAlert).
 */
export type {
  Role,
  BloodGroup,
  Profile,
  Patient,
  VitalsSource,
  VitalsReading,
  RecordRiskLevel as RiskLevel,
  AshaVisit,
  PrescriptionItem,
  Prescription,
  DoseLog,
  ReportCategory,
  HealthReport,
  Consultation,
  ReferralStatus,
  RecordReferral as Referral,
  RecordRiskAlert as RiskAlert,
  AccessMethod,
  AccessOutcome,
  AccessLog,
  PatientConsent,
  AccessGrant,
} from '../../shared/types.ts';
export { BLOOD_GROUPS, REPORT_CATEGORIES } from '../../shared/types.ts';
