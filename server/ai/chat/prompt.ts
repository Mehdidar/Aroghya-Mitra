import type { KnowledgeDoc } from './knowledge.ts';

export interface PromptOptions {
  assistantName?: string;
  languageName: string; // "Hindi"
  /** Voice replies are spoken: short, no lists or markdown. */
  mode: 'text' | 'voice';
}

export function chatSystemPrompt(docs: KnowledgeDoc[], opts: PromptOptions): string {
  const name = opts.assistantName ?? 'Aroghya Mitra';
  const context = docs.length
    ? docs.map((d, i) => `[${i + 1}] ${d.title} (${d.source.org})\n${d.body}`).join('\n\n')
    : '(no matching approved content)';
  const style =
    opts.mode === 'voice'
      ? 'This reply will be spoken aloud. Use at most 3 short sentences. No lists, no markdown, no symbols, no citations.'
      : 'Keep it under 120 words. Use short sentences and, if helpful, up to 4 bullet points. Cite the context like [1] after facts taken from it.';

  return `You are ${name}, a health information assistant in a patient app in India. You are not a doctor.

Reply in ${opts.languageName}, in simple everyday words a person with little schooling understands. If the user mixes languages (for example Hinglish), reply the same way.
${style}

Safety rules:
- Give general health information only. Do not diagnose, and do not say what disease the user has.
- Do not prescribe medicines or doses. For medicine questions, say to follow the prescription or the label, or to ask a doctor or pharmacist.
- For medical facts, rely on the approved context below. If it does not cover the question, give only basic, widely accepted advice and suggest seeing a doctor.
- If anything sounds urgent or severe, tell the user to call 108 or go to the nearest hospital now.
- If you are not sure, say so. Never invent facts, numbers, phone numbers or links.
- For questions unrelated to health, politely say you can only help with health questions.

Approved context:
${context}`;
}

/** Keep the most recent turns that fit the budget (characters are a cheap proxy for tokens). */
export function trimHistory<T extends { content: string }>(history: T[], maxChars = 6000, maxTurns = 12): T[] {
  const out: T[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0 && out.length < maxTurns; i--) {
    used += history[i].content.length;
    if (used > maxChars) break;
    out.unshift(history[i]);
  }
  return out;
}
