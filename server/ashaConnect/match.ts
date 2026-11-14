/**
 * Which ASHA should look after a patient.
 *
 * Rule (the way a PHC assigns in practice: one ASHA per village, ~1 per 1000
 * people): an active ASHA who covers the patient's village or pincode, and
 * among those the one with the fewest patients. With no area match, the
 * least-loaded active ASHA of the same PHC is only a SUGGESTION for the admin;
 * the server never auto-assigns without an area match.
 */
import type { AshaSuggestion, ConnectStaff, ServiceArea } from './types.ts';

/** "  Rampur Village, " → "rampur". Lower-case, no punctuation, no filler words. */
export function areaKey(area: string): string {
  return area
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,;:()\-_/]+/g, ' ')
    .replace(/\b(village|gram|gaon|ward|no|number|post|po|taluk|tehsil|district|dist)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clean, de-duplicated display names for an ASHA's area list (max 20, each ≤ 60 characters). */
export function cleanAreas(areas: unknown): string[] {
  if (!Array.isArray(areas)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of areas) {
    if (typeof a !== 'string') continue;
    const name = a.replace(/\s+/g, ' ').trim().slice(0, 60);
    const key = areaKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 20) break;
  }
  return out;
}

/** True when a patient's free-text area names this service area (whole words, either way round). */
export function areaMatches(patientArea: string | null | undefined, area: ServiceArea): boolean {
  if (!patientArea) return false;
  const p = areaKey(patientArea);
  if (!p || !area.key) return false;
  if (p === area.key) return true;
  const words = new Set(p.split(' '));
  // "Rampur, Hebbal" matches the area "Rampur"; a 6-digit pincode matches exactly.
  return area.key.split(' ').every((w) => words.has(w));
}

export function suggestAshas(input: {
  patientArea: string | null;
  patientFacilityId: string | null;
  ashas: ConnectStaff[];
  areas: ServiceArea[];
  caseloads: Map<string, number>;
}): AshaSuggestion[] {
  const active = input.ashas.filter((a) => a.isActive && (!input.patientFacilityId || !a.facilityId || a.facilityId === input.patientFacilityId));
  const covering = new Set(input.areas.filter((ar) => areaMatches(input.patientArea, ar)).map((ar) => ar.ashaId));
  const load = (id: string) => input.caseloads.get(id) ?? 0;
  return active
    .map((a): AshaSuggestion => ({ ashaId: a.id, fullName: a.fullName, match: covering.has(a.id) ? 'area' : 'facility', caseload: load(a.id) }))
    .sort((a, b) => Number(b.match === 'area') - Number(a.match === 'area') || a.caseload - b.caseload || a.fullName.localeCompare(b.fullName));
}
