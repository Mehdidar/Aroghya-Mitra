/**
 * Deterministic parsing of Indian prescription shorthand, so dose timings do not
 * depend only on the model: "1-0-1", "1-1-1", "0-0-1", "1-0-0-1", "½-0-½",
 * OD/BD/TDS/QID/HS/SOS/STAT, and durations like "x 5 days", "1 week", "1/12".
 */

export const DOSE_SLOTS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type DoseSlot = (typeof DOSE_SLOTS)[number];

export interface ParsedFrequency {
  timesPerDay: number;
  slots: DoseSlot[];
  /** Amount per slot when written as a pattern ("1-0-½" → [1, 0, 0.5]). */
  amounts?: number[];
  asNeeded: boolean;
  /** Every N days instead of daily (e.g. weekly = 7). */
  everyNDays?: number;
}

const ABBREVIATIONS: Record<string, ParsedFrequency> = {
  od: { timesPerDay: 1, slots: ['morning'], asNeeded: false },
  qd: { timesPerDay: 1, slots: ['morning'], asNeeded: false },
  qam: { timesPerDay: 1, slots: ['morning'], asNeeded: false },
  hs: { timesPerDay: 1, slots: ['night'], asNeeded: false },
  qhs: { timesPerDay: 1, slots: ['night'], asNeeded: false },
  bd: { timesPerDay: 2, slots: ['morning', 'night'], asNeeded: false },
  bid: { timesPerDay: 2, slots: ['morning', 'night'], asNeeded: false },
  tds: { timesPerDay: 3, slots: ['morning', 'afternoon', 'night'], asNeeded: false },
  tid: { timesPerDay: 3, slots: ['morning', 'afternoon', 'night'], asNeeded: false },
  qid: { timesPerDay: 4, slots: ['morning', 'afternoon', 'evening', 'night'], asNeeded: false },
  qds: { timesPerDay: 4, slots: ['morning', 'afternoon', 'evening', 'night'], asNeeded: false },
  sos: { timesPerDay: 0, slots: [], asNeeded: true },
  prn: { timesPerDay: 0, slots: [], asNeeded: true },
  stat: { timesPerDay: 1, slots: ['morning'], asNeeded: false },
  weekly: { timesPerDay: 1, slots: ['morning'], asNeeded: false, everyNDays: 7 },
};

const WORDS: [RegExp, string][] = [
  [/\bonce (a|per) day\b|\bonce daily\b|\bdaily\b/, 'od'],
  [/\btwice (a|per) day\b|\btwice daily\b/, 'bd'],
  [/\bthrice (a|per) day\b|\bthree times (a|per) day\b/, 'tds'],
  [/\bfour times (a|per) day\b/, 'qid'],
  [/\bat bed ?time\b|\bat night\b/, 'hs'],
  [/\bas needed\b|\bif needed\b|\bwhen required\b/, 'sos'],
  [/\bonce (a|per) week\b|\bweekly\b/, 'weekly'],
];

function parseAmount(s: string): number | null {
  const t = s.trim();
  if (t === '½' || t === '1/2') return 0.5;
  if (t === '¼' || t === '1/4') return 0.25;
  if (t === '1½' || t === '1 1/2') return 1.5;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Parse a frequency string. Returns null when it cannot be understood (the UI should ask the user). */
export function parseFrequency(raw: string | null | undefined): ParsedFrequency | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/[–—]/g, '-').trim();

  // Dash or space pattern: 1-0-1 or 1-0-0-1 (3 slots = morning, afternoon, night; 4 slots add evening).
  // Only dashes separate slots: "x 5 days" after a pattern means duration, not a fourth slot.
  const amount = String.raw`[\d½¼]+(?:\/\d)?`;
  const pattern = new RegExp(String.raw`(?:^|[^\d/])(${amount}\s*-\s*${amount}\s*-\s*${amount}(?:\s*-\s*${amount})?)(?![\d/])`).exec(text);
  if (pattern) {
    const parts = pattern[1].split(/\s*-\s*/).map(parseAmount);
    if (parts.every((p): p is number => p !== null)) {
      const slotsFor: DoseSlot[] = parts.length === 3 ? ['morning', 'afternoon', 'night'] : [...DOSE_SLOTS];
      const slots = slotsFor.filter((_, i) => parts[i] > 0);
      if (slots.length > 0) {
        return { timesPerDay: slots.length, slots, amounts: parts, asNeeded: /sos|prn|as needed/.test(text) };
      }
    }
  }

  const tokens = text.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const hit = ABBREVIATIONS[token];
    if (hit) return { ...hit, slots: [...hit.slots] };
  }
  for (const [re, key] of WORDS) {
    if (re.test(text)) return { ...ABBREVIATIONS[key], slots: [...ABBREVIATIONS[key].slots] };
  }
  return null;
}

/** "5 days", "x 5d", "1 week", "2 wks", "1 month", "1/12" (one month), "1/52" (one week). Null if unknown. */
export function parseDurationDays(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  const text = raw.toLowerCase().trim();
  const fraction = /(\d+)\s*\/\s*(7|52|12)\b/.exec(text);
  if (fraction) {
    const n = Number(fraction[1]);
    const unit = fraction[2] === '7' ? 1 : fraction[2] === '52' ? 7 : 30;
    return n > 0 ? n * unit : null;
  }
  const m = /(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|month|months)\b/.exec(text);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2].startsWith('d') ? 1 : m[2].startsWith('w') ? 7 : 30;
    const days = Math.round(n * unit);
    return days > 0 ? days : null;
  }
  const bare = /^\d+$/.exec(text);
  return bare && Number(bare[0]) > 0 ? Number(bare[0]) : null;
}
