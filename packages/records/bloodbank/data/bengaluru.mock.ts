/**
 * MOCK blood bank data for Bengaluru (demo use only).
 *
 * - Institutions are real hospitals in Bengaluru that run blood centres;
 *   coordinates are approximate (to within a few hundred metres).
 * - Phone numbers are deliberately fake (+91 80 0000 xxxx, an unassigned
 *   range) and marked `phoneVerified: false`. Replace them with numbers
 *   checked against e-RaktKosh before any real use.
 * - Stock levels are generated, NOT real availability. They are seeded so the
 *   same bank always gets the same numbers, and roughly follow India's blood
 *   group distribution (O+ and B+ common, AB− rare) and real shelf patterns
 *   (lots of PRBC, few platelets, very little cryo).
 *
 * Why mock: e-RaktKosh (eraktkosh.mohfw.gov.in) publishes stock only through
 * its web search page; there is no documented public API, and its internal
 * endpoints are undocumented and not CORS-enabled. See `../eraktkosh.ts`.
 */
import { BLOOD_GROUPS } from '../../records/types.ts';
import type { BloodGroup } from '../../records/types.ts';
import { BLOOD_COMPONENTS } from '../types.ts';
import type { BloodBank, BloodComponent, StockEntry } from '../types.ts';

type BankSeed = Omit<BloodBank, 'city' | 'phone' | 'phoneVerified' | 'facilityId'> & {
  /** Rough relative size of the centre's inventory. */
  scale: number;
  /** Typical hours since the centre last updated its stock. */
  updateLagHours: number;
};

const SEEDS: BankSeed[] = [
  { id: 'blr-victoria', name: 'Victoria Hospital Blood Centre (BMCRI)', category: 'government', address: 'Fort Road, near K.R. Market', area: 'K.R. Market', location: { lat: 12.9634, lng: 77.5734 }, open24x7: true, scale: 1.4, updateLagHours: 3 },
  { id: 'blr-bowring', name: 'Bowring & Lady Curzon Hospital Blood Centre', category: 'government', address: 'Shivajinagar', area: 'Shivajinagar', location: { lat: 12.9839, lng: 77.6045 }, open24x7: true, scale: 0.9, updateLagHours: 6 },
  { id: 'blr-kcgh', name: 'K.C. General Hospital Blood Centre', category: 'government', address: 'Margosa Road, Malleshwaram', area: 'Malleshwaram', location: { lat: 13.0003, lng: 77.5702 }, open24x7: true, scale: 0.7, updateLagHours: 10 },
  { id: 'blr-nimhans', name: 'NIMHANS Blood Centre', category: 'government', address: 'Hosur Road, Lakkasandra', area: 'Wilson Garden', location: { lat: 12.9431, lng: 77.5963 }, open24x7: true, scale: 1.0, updateLagHours: 4 },
  { id: 'blr-kidwai', name: 'Kidwai Memorial Institute of Oncology Blood Centre', category: 'government', address: 'Dr. M.H. Marigowda Road', area: 'Wilson Garden', location: { lat: 12.9389, lng: 77.5966 }, open24x7: true, scale: 0.8, updateLagHours: 8 },
  { id: 'blr-jayadeva', name: 'Sri Jayadeva Institute of Cardiovascular Sciences Blood Centre', category: 'government', address: 'Bannerghatta Road, Jayanagar 9th Block', area: 'Jayanagar', location: { lat: 12.9178, lng: 77.5996 }, open24x7: true, scale: 1.1, updateLagHours: 2 },
  { id: 'blr-redcross', name: 'Indian Red Cross Society Blood Centre, Karnataka Branch', category: 'red_cross', address: 'Race Course Road', area: 'Gandhinagar', location: { lat: 12.9817, lng: 77.5838 }, open24x7: false, scale: 1.0, updateLagHours: 5 },
  { id: 'blr-rashtrotthana', name: 'Rashtrotthana Blood Centre', category: 'charitable', address: 'Kempegowda Nagar', area: 'Chamarajpet', location: { lat: 12.9510, lng: 77.5697 }, open24x7: true, scale: 1.3, updateLagHours: 1 },
  { id: 'blr-stjohns', name: "St. John's Medical College Hospital Blood Centre", category: 'charitable', address: 'Sarjapur Road, Koramangala', area: 'Koramangala', location: { lat: 12.9298, lng: 77.6197 }, open24x7: true, scale: 1.2, updateLagHours: 2 },
  { id: 'blr-ramaiah', name: 'M.S. Ramaiah Memorial Hospital Blood Centre', category: 'private', address: 'New BEL Road, MSRIT Post', area: 'Mathikere', location: { lat: 13.0285, lng: 77.5680 }, open24x7: true, scale: 1.0, updateLagHours: 3 },
  { id: 'blr-manipal-oar', name: 'Manipal Hospital Blood Centre, Old Airport Road', category: 'private', address: 'HAL Old Airport Road', area: 'Kodihalli', location: { lat: 12.9585, lng: 77.6490 }, open24x7: true, scale: 0.9, updateLagHours: 1 },
  { id: 'blr-aster-cmi', name: 'Aster CMI Hospital Blood Centre', category: 'private', address: 'Sahakar Nagar, Hebbal', area: 'Hebbal', location: { lat: 13.0467, lng: 77.5925 }, open24x7: true, scale: 0.6, updateLagHours: 4 },
  { id: 'blr-fortis-bg', name: 'Fortis Hospital Blood Centre, Bannerghatta Road', category: 'private', address: 'Bannerghatta Road', area: 'Bilekahalli', location: { lat: 12.8955, lng: 77.5985 }, open24x7: true, scale: 0.6, updateLagHours: 7 },
  { id: 'blr-narayana', name: 'Narayana Health City Blood Centre', category: 'private', address: 'Hosur Road, Bommasandra', area: 'Bommasandra', location: { lat: 12.8106, lng: 77.6946 }, open24x7: true, scale: 1.2, updateLagHours: 2 },
  { id: 'blr-sapthagiri', name: 'Sapthagiri Hospital Blood Centre', category: 'private', address: 'Chikkasandra, Hesaraghatta Main Road', area: 'Chikkasandra', location: { lat: 13.0784, lng: 77.5040 }, open24x7: false, scale: 0.4, updateLagHours: 60 },
];

/** Share of each group in the Indian donor population (approx.). */
const GROUP_SHARE: Record<BloodGroup, number> = {
  'O+': 0.36, 'B+': 0.31, 'A+': 0.21, 'AB+': 0.07, 'O-': 0.017, 'B-': 0.015, 'A-': 0.012, 'AB-': 0.006,
};

/** Typical units on the shelf per 1.0 of bank scale, per component, before group share. */
const COMPONENT_BASE: Record<BloodComponent, number> = {
  prbc: 160, ffp: 120, whole_blood: 35, platelets_rdp: 30, platelets_sdp: 6, cryo: 12,
};

/** Small deterministic PRNG (mulberry32) so mock stock is stable across runs. */
function rng(seedText: string): () => number {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockBanks(): BloodBank[] {
  return SEEDS.map((s, i) => {
    const { scale: _scale, updateLagHours: _lag, ...bank } = s;
    return {
      ...bank,
      city: 'Bengaluru',
      phone: `+91 80 0000 ${String(1001 + i).padStart(4, '0')}`,
      phoneVerified: false,
      facilityId: null,
    };
  });
}

/** Generated stock for every bank, with update times relative to `now`. */
export function mockStock(now: Date): Map<string, StockEntry[]> {
  const out = new Map<string, StockEntry[]>();
  for (const s of SEEDS) {
    const rand = rng(s.id);
    const lagMs = s.updateLagHours * 3_600_000 * (0.5 + rand());
    const updatedAt = new Date(now.getTime() - lagMs).toISOString();
    const rows: StockEntry[] = [];
    for (const g of BLOOD_GROUPS) {
      for (const c of BLOOD_COMPONENTS) {
        const expected = COMPONENT_BASE[c.key] * s.scale * GROUP_SHARE[g];
        // Rare groups and platelets often hit zero; otherwise vary 40–140% of expected.
        const units = rand() < 0.12 ? 0 : Math.round(expected * (0.4 + rand()));
        rows.push({ bloodGroup: g, component: c.key, units, updatedAt });
      }
    }
    out.set(s.id, rows);
  }
  return out;
}

/** Demo default "you are here": Bengaluru city centre (Vidhana Soudha). */
export const BENGALURU_CENTRE = { lat: 12.9796, lng: 77.5907 };
