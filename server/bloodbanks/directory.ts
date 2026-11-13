/**
 * Parses the official Blood Bank Directory (National Health Portal / NIHFW,
 * published on AIKosh and data.gov.in under GODL) into blood_banks rows.
 *
 * The file's headers have varied between releases ("Blood Bank Name" vs
 * "Blood Center Name", "Contact No" vs "Contact", …), so columns are found by
 * aliases. Rows without a usable name, address or coordinates are skipped and
 * counted, never guessed.
 */
export interface DirectoryRow {
  id: string;
  name: string;
  category: 'government' | 'charitable' | 'private' | 'red_cross';
  address: string;
  area: string;
  city: string;
  lat: number;
  lng: number;
  phone: string | null;
  phone_verified: boolean;
  open_24x7: boolean;
  source: 'manual';
  is_active: boolean;
}

/** RFC 4180 CSV (quoted fields, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/^﻿/, '').replace(/[^a-z0-9]/g, '');
const ALIASES: Record<string, string[]> = {
  name: ['bloodbankname', 'bloodcentername', 'bloodcentrename', 'name', 'hospitalname'],
  state: ['state', 'statename'],
  district: ['district', 'districtname'],
  city: ['city', 'cityname', 'town'],
  address: ['address', 'fulladdress'],
  pincode: ['pincode', 'pin', 'areapincode'],
  phone: ['contactno', 'contact', 'contactnumber', 'phone', 'phoneno', 'telephone'],
  mobile: ['mobile', 'mobileno', 'mobilenumber'],
  helpline: ['helpline', 'helplineno'],
  category: ['category', 'type', 'bloodbanktype', 'ownership'],
  service: ['servicetime', 'timing', 'timings', 'workinghours'],
  licence: ['licenseno', 'licenceno', 'licensenumber', 'license'],
  lat: ['latitude', 'lat'],
  lng: ['longitude', 'long', 'lng', 'lon'],
};

export function columnMap(header: string[]): Record<string, number> {
  const h = header.map(norm);
  const out: Record<string, number> = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const i = h.findIndex((c) => names.includes(c));
    if (i >= 0) out[key] = i;
  }
  return out;
}

function category(raw: string): DirectoryRow['category'] {
  const c = raw.toLowerCase();
  if (/red\s*cross/.test(c)) return 'red_cross';
  if (/charit|vol|ngo|trust/.test(c)) return 'charitable';
  if (/gov|public|state|central|ut|municipal|esi|army|railway/.test(c)) return 'government';
  return 'private';
}

/** First plausible Indian phone number in the text (landline or mobile), digits and a leading + only. */
export function firstPhone(...vals: (string | undefined)[]): string | null {
  for (const v of vals) {
    for (const part of (v ?? '').split(/[,;/|]| or /i)) {
      const d = part.replace(/[^\d+]/g, '');
      const digits = d.replace(/^\+?91/, '').replace(/^0/, '');
      if (digits.length >= 10 && digits.length <= 11) return d.startsWith('+') ? d : `+91${digits}`;
    }
  }
  return null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export interface ImportResult {
  rows: DirectoryRow[];
  skipped: { reason: string; count: number }[];
  missingColumns: string[];
}

export function directoryRows(text: string, filter: { state?: string; district?: string } = {}): ImportResult {
  const [header, ...data] = parseCsv(text);
  const col = columnMap(header ?? []);
  const missingColumns = ['name', 'address', 'lat', 'lng'].filter((k) => col[k] === undefined);
  const skip = new Map<string, number>();
  const bump = (r: string) => skip.set(r, (skip.get(r) ?? 0) + 1);
  const rows: DirectoryRow[] = [];
  const seen = new Set<string>();
  if (missingColumns.length) return { rows, skipped: [], missingColumns };
  const get = (r: string[], k: string) => (col[k] !== undefined ? (r[col[k]] ?? '').trim() : '');
  const has = (v: string, want?: string) => !want || v.toLowerCase().includes(want.toLowerCase());
  for (const r of data) {
    if (!has(get(r, 'state'), filter.state) || !(has(get(r, 'district'), filter.district) || has(get(r, 'city'), filter.district))) { bump('outside the chosen state/district'); continue; }
    const name = get(r, 'name');
    const address = get(r, 'address');
    const lat = Number(get(r, 'lat'));
    const lng = Number(get(r, 'lng'));
    if (!name || !address) { bump('no name or address'); continue; }
    // India's bounding box: anything outside is a data-entry error, not a location.
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 6 || lat > 37.5 || lng < 68 || lng > 97.5) { bump('missing or impossible coordinates'); continue; }
    const id = `nhp-${slug(get(r, 'licence') || `${name}-${get(r, 'pincode')}`)}`;
    if (seen.has(id)) { bump('duplicate'); continue; }
    seen.add(id);
    const phone = firstPhone(get(r, 'phone'), get(r, 'mobile'), get(r, 'helpline'));
    rows.push({
      id,
      name,
      category: category(get(r, 'category')),
      address,
      area: get(r, 'city') || get(r, 'district') || '',
      city: get(r, 'district') || get(r, 'city') || '',
      lat,
      lng,
      phone,
      // Listed in the official directory; the app still says "check before you go".
      phone_verified: phone !== null,
      open_24x7: /24/.test(get(r, 'service')),
      source: 'manual',
      is_active: true,
    });
  }
  return { rows, skipped: [...skip].map(([reason, count]) => ({ reason, count })), missingColumns };
}
