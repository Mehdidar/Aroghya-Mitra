/**
 * Who may open a patient's history. Mirrors `public.p4_can_view_patient()` in
 * `supabase/migrations/4001_p4_records.sql`; keep the two in step.
 *
 *  - patient: only their own record
 *  - doctor:  patients registered at their facility, patients referred to them
 *             or their facility (open referral), or patients whose QR they
 *             scanned while "Share history" was on (grant still valid and
 *             consent still on)
 *  - admin:   patients registered at their facility
 *  - asha:    not here; P3 owns ASHA access to their assigned patients
 *  - any deactivated account: nothing
 */
import type { Profile } from '../../features/records/types.ts';
import type { RecordsRepository } from './repository.ts';

export type AccessBasis = 'self' | 'facility' | 'referral' | 'qr_grant' | 'admin_facility';
export type AccessDenial = 'inactive_account' | 'no_patient' | 'not_permitted';

export type AccessDecision = { allowed: true; basis: AccessBasis } | { allowed: false; reason: AccessDenial };

export async function resolveAccess(
  repo: RecordsRepository,
  viewer: Profile,
  patientId: string,
  now: Date,
): Promise<AccessDecision> {
  if (!viewer.isActive) return { allowed: false, reason: 'inactive_account' };
  const patient = await repo.getPatient(patientId);
  if (!patient) return { allowed: false, reason: 'no_patient' };

  const sameFacility = patient.facilityId !== null && patient.facilityId === viewer.facilityId;

  switch (viewer.role) {
    case 'patient':
      return patient.userId === viewer.id ? { allowed: true, basis: 'self' } : deny();
    case 'admin':
      return sameFacility ? { allowed: true, basis: 'admin_facility' } : deny();
    case 'doctor': {
      if (sameFacility) return { allowed: true, basis: 'facility' };
      if (await repo.hasOpenReferralTo(patientId, viewer)) return { allowed: true, basis: 'referral' };
      const grant = await repo.findActiveGrant(patientId, viewer.id, now);
      if (grant) {
        const consent = await repo.getConsent(patientId);
        if (consent?.shareHistory) return { allowed: true, basis: 'qr_grant' };
      }
      return deny();
    }
    default:
      return deny();
  }
}

function deny(): AccessDecision {
  return { allowed: false, reason: 'not_permitted' };
}
