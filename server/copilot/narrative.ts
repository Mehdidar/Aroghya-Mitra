/**
 * Optional AI-written narrative for the patient summary. Written ONLY from the
 * deterministic `facts` (summary.ts), then checked: a narrative that contains a
 * number or a medicine that is not in the facts is thrown away, never shown.
 * The app labels it "AI draft — verify against the record".
 */
import type { LlmCall } from '../ai/extractStructured.ts';
import { MEDICINES } from '../../packages/records/medicines/catalog.ts';

export const NARRATIVE_SYSTEM = `You write a short clinical summary for a doctor at an Indian primary health centre.
Use ONLY the facts given. Do not add any diagnosis, number, date, medicine, test or advice that is not in the facts. Do not speculate.
Write 3 to 5 plain English sentences: who the patient is, active problems, current treatment, the most important recent findings and what is open (alerts, referrals, follow-up).
Copy numbers exactly as written in the facts. No markdown, no headings, no lists.`;

export type NarrativeResult = { ok: true; text: string } | { ok: false; reason: 'no_model' | 'model_error' | 'unverified' | 'empty'; detail?: string };

const numbersIn = (s: string) => new Set((s.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));

/** Numbers and catalogue medicines in `text` that do not appear in `facts`. */
export function unsupportedClaims(text: string, facts: string[]): string[] {
  const source = facts.join('\n');
  const sourceLower = source.toLowerCase();
  const known = numbersIn(source);
  const bad: string[] = [];
  for (const n of numbersIn(text)) if (!known.has(n)) bad.push(n);
  const lower = text.toLowerCase();
  for (const m of MEDICINES) {
    const names = [m.generic.replace(/\s*\(.*\)\s*/, '').toLowerCase(), ...m.aliases.filter((a) => a.length >= 5)];
    for (const name of names) {
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(lower) && !re.test(sourceLower)) bad.push(name);
    }
  }
  return [...new Set(bad)];
}

export async function writeNarrative(facts: string[], llm: LlmCall | null, signal?: AbortSignal): Promise<NarrativeResult> {
  if (!llm) return { ok: false, reason: 'no_model' };
  let text: string;
  try {
    text = (await llm([{ role: 'system', content: NARRATIVE_SYSTEM }, { role: 'user', content: `Facts:\n- ${facts.join('\n- ')}` }], { signal })).trim();
  } catch (e) {
    return { ok: false, reason: 'model_error', detail: (e as Error).message.slice(0, 200) };
  }
  text = text.replace(/^```\w*\s*|```$/g, '').replace(/^"|"$/g, '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  const bad = unsupportedClaims(text, facts);
  if (bad.length) return { ok: false, reason: 'unverified', detail: bad.join(', ') };
  return { ok: true, text: text.slice(0, 1500) };
}
