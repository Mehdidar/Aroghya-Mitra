/**
 * ASHA connect wire types: a copy of server/ashaConnect/types.ts (the app does not import server code).
 * Keep the two in step.
 */
/** A village / ward / pincode an ASHA covers. `key` is the normalised form used for matching. */
export interface ServiceArea {
  ashaId: string;
  facilityId: string | null;
  area: string;
  key: string;
}

/** How a patient came to be on an ASHA's list (or off it). */
export type AssignMethod = 'area_match' | 'admin' | 'qr_scan' | 'unassigned';

export interface AssignmentEvent {
  id: string;
  patientId: string;
  /** The new ASHA; null when the patient was taken off every list. */
  ashaId: string | null;
  previousAshaId: string | null;
  method: AssignMethod;
  reason: string | null;
  byId: string | null;
  createdAt: string;
}

/** A patient who asked for an ASHA and is waiting for the PHC to assign one. */
export interface ConnectRequest {
  patientId: string;
  area: string;
  requestedAt: string;
}

export type MessageKind = 'text' | 'visit_request' | 'call_request';
export type RequestStatus = 'open' | 'accepted' | 'done' | 'declined';
export type VisitWhen = 'today' | 'tomorrow' | 'this_week';

export interface AshaMessage {
  id: string;
  patientId: string;
  /** The ASHA the message is for (or from). Null if the patient had no ASHA when they wrote. */
  ashaId: string | null;
  from: 'patient' | 'asha';
  senderId: string;
  kind: MessageKind;
  body: string;
  /** Visit and call requests only. */
  visitWhen: VisitWhen | null;
  status: RequestStatus | null;
  /** When the ASHA said she will come (accepted visit requests). */
  scheduledFor: string | null;
  /** A patient message that names an emergency sign (packages/patient-ai/safety). */
  urgent: boolean;
  emergencyCategories: string[];
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
}

/** What a patient sees about their ASHA. Only real profile data: no invented phone numbers. */
export interface AshaCard {
  id: string;
  fullName: string;
  phone: string | null;
  areas: string[];
  lastVisitAt: string | null;
}

/** Minimal rows the connect module needs from the records tables. */
export interface ConnectPatient {
  id: string;
  userId: string | null;
  fullName: string;
  phone: string | null;
  area: string | null;
  facilityId: string | null;
  ashaWorkerId: string | null;
  createdAt: string;
}

export interface ConnectStaff {
  id: string;
  fullName: string;
  phone: string | null;
  facilityId: string | null;
  isActive: boolean;
}

/** One candidate ASHA for a patient, best first. */
export interface AshaSuggestion {
  ashaId: string;
  fullName: string;
  /** 'area' = she covers the patient's village; 'facility' = same PHC, no area match. */
  match: 'area' | 'facility';
  caseload: number;
}

/** Admin board row per ASHA. */
export interface AshaLoad {
  id: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  areas: string[];
  caseload: number;
  highRisk: number;
  openRequests: number;
}

/** Admin board row per patient. */
export interface PatientAssignment {
  id: string;
  fullName: string;
  area: string | null;
  ashaId: string | null;
  ashaName: string | null;
  highRisk: boolean;
  /** Set when the patient asked for an ASHA from their phone and is still waiting. */
  requestedAt: string | null;
  suggestion: AshaSuggestion | null;
  lastChange: Pick<AssignmentEvent, 'method' | 'createdAt' | 'reason'> | null;
}

/** What an ASHA sees after scanning a patient's QR card: what she needs for a home visit, no more. */
export interface ScanSummary {
  patient: {
    id: string;
    fullName: string;
    ageYears: number | null;
    sex: 'female' | 'male' | 'other' | null;
    area: string | null;
    phone: string | null;
    bloodGroup: string | null;
    allergies: string[];
    conditions: string[];
    pregnancyWeeks: number | null;
  };
  /** Most recent reading of each kind, with when and who recorded it. */
  latestVitals: {
    recordedAt: string;
    source: string;
    systolic: number | null;
    diastolic: number | null;
    hemoglobin: number | null;
    temperatureC: number | null;
    spo2: number | null;
    bloodSugarMgDl: number | null;
    weightKg: number | null;
  } | null;
  /** Symptoms reported in the last 30 days, newest first. Codes from visits; text from the patient's own messages. */
  symptoms: { at: string; source: 'asha_visit' | 'patient_message' | 'consultation'; codes: string[]; text: string | null }[];
  openAlerts: { level: string; reason: string; createdAt: string }[];
  medicines: { name: string; dosage: string; frequency: string }[];
  lastConsultation: { at: string; doctorName: string | null; diagnosis: string | null; followUpDate: string | null } | null;
  lastAshaVisit: { at: string; ashaName: string | null; notes: string | null } | null;
  assignedAsha: { id: string; fullName: string } | null;
}

export type Fail = { ok: false; reason: string; status: 400 | 403 | 404 | 409 };
