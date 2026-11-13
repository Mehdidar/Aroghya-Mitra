import type { BloodGroup } from '../records/types.ts';

export type { BloodGroup };

/** Components as listed on e-RaktKosh. */
export type BloodComponent = 'whole_blood' | 'prbc' | 'ffp' | 'platelets_rdp' | 'platelets_sdp' | 'cryo';

export const BLOOD_COMPONENTS: readonly { key: BloodComponent; label: string; short: string }[] = [
  { key: 'whole_blood', label: 'Whole Blood', short: 'WB' },
  { key: 'prbc', label: 'Packed Red Blood Cells', short: 'PRBC' },
  { key: 'ffp', label: 'Fresh Frozen Plasma', short: 'FFP' },
  { key: 'platelets_rdp', label: 'Random Donor Platelets', short: 'RDP' },
  { key: 'platelets_sdp', label: 'Single Donor Platelets (apheresis)', short: 'SDP' },
  { key: 'cryo', label: 'Cryoprecipitate', short: 'Cryo' },
];

export type BloodBankCategory = 'government' | 'charitable' | 'private' | 'red_cross';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BloodBank {
  id: string;
  name: string;
  category: BloodBankCategory;
  address: string;
  area: string;
  city: string;
  location: LatLng;
  phone: string | null;
  /** False for demo numbers: the UI must label them and not imply they are real. */
  phoneVerified: boolean;
  open24x7: boolean;
  /** Facility whose admin may edit this bank's stock. */
  facilityId: string | null;
}

export interface StockEntry {
  bloodGroup: BloodGroup;
  component: BloodComponent;
  units: number;
  updatedAt: string;
}

export type DataSource = 'mock' | 'eraktkosh' | 'supabase';

export interface BloodBankQuery {
  bloodGroup?: BloodGroup;
  component?: BloodComponent;
  /** Sort by and show distance from here. */
  near?: LatLng;
  radiusKm?: number;
  /** Hide banks with no units of the selected group/component. Default true when a filter is set. */
  onlyAvailable?: boolean;
  sort?: 'distance' | 'units' | 'updated';
  limit?: number;
}

export interface BloodBankResult {
  bank: BloodBank;
  /** Units matching the selected group and component (all of them if no filter). */
  unitsAvailable: number;
  /** Stock rows matching the filter, most units first. */
  matchingStock: StockEntry[];
  distanceKm: number | null;
  /** Newest update among the bank's stock rows. */
  lastUpdated: string | null;
  /** Older than the staleness threshold: show the time prominently. */
  isStale: boolean;
  source: DataSource;
}
