/**
 * Split text at sentence boundaries (including the Devanagari danda । and the
 * Urdu full stop ۔) so that:
 *  - long text fits Sarvam limits (TTS 2500, translate 1000/2000, LID 1000 chars)
 *  - the voice assistant can send the first sentence to TTS as soon as it arrives.
 */

const SENTENCE_END = /([.!?।॥۔؟]+["')\]]*)(\s+|$)/g;

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(SENTENCE_END)) {
    const end = (m.index ?? 0) + m[1].length;
    const piece = text.slice(last, end).trim();
    if (piece) out.push(piece);
    last = end + m[2].length;
  }
  const rest = text.slice(last).trim();
  if (rest) out.push(rest);
  return out;
}

/** Group sentences into chunks of at most maxChars. Very long sentences are hard-split on spaces. */
export function splitText(text: string, maxChars: number): string[] {
  if (maxChars <= 0) throw new RangeError('maxChars must be positive');
  const chunks: string[] = [];
  let current = '';
  const push = () => {
    if (current) chunks.push(current);
    current = '';
  };
  for (const sentence of splitSentences(text)) {
    for (const piece of hardSplit(sentence, maxChars)) {
      if (!current) current = piece;
      else if (current.length + 1 + piece.length <= maxChars) current = `${current} ${piece}`;
      else {
        push();
        current = piece;
      }
    }
  }
  push();
  return chunks;
}

function hardSplit(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence];
  const parts: string[] = [];
  let rest = sentence;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut <= 0) cut = maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Incremental splitter for streamed LLM output: feed deltas and get back
 * complete sentences as soon as they finish. Call flush() at the end.
 */
export class SentenceStream {
  private buffer = '';

  push(delta: string): string[] {
    this.buffer += delta;
    const done: string[] = [];
    let lastEnd = 0;
    for (const m of this.buffer.matchAll(SENTENCE_END)) {
      // Only treat it as finished when followed by whitespace (more text came after).
      if (!m[2]) break;
      const end = (m.index ?? 0) + m[1].length;
      const piece = this.buffer.slice(lastEnd, end).trim();
      if (piece) done.push(piece);
      lastEnd = end + m[2].length;
    }
    this.buffer = this.buffer.slice(lastEnd);
    return done;
  }

  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = '';
    return rest ? [rest] : [];
  }
}
