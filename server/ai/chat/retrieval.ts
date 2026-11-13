/**
 * Small BM25 search over the approved knowledge base. Fast enough to run per
 * message with no vector database; swap for embeddings later behind `search`.
 */
import type { KnowledgeDoc } from './knowledge';

const STOPWORDS = new Set(['a', 'an', 'the', 'is', 'are', 'am', 'i', 'my', 'me', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'it', 'what', 'how', 'do', 'does', 'should', 'can', 'with', 'have', 'has', 'be', 'this', 'that', 'hai', 'ka', 'ki', 'ke', 'me', 'mein', 'kya', 'है', 'का', 'की', 'के', 'में', 'क्या']);

export function tokenize(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface SearchHit {
  doc: KnowledgeDoc;
  score: number;
}

export class KnowledgeIndex {
  private readonly docs: { doc: KnowledgeDoc; tf: Map<string, number>; len: number }[];
  private readonly df = new Map<string, number>();
  private readonly avgLen: number;

  constructor(docs: KnowledgeDoc[], private readonly k1 = 1.2, private readonly b = 0.75) {
    this.docs = docs.map((doc) => {
      // Title and keywords count three times: they are curated and precise.
      const boosted = `${doc.title} ${doc.keywords.join(' ')}`;
      const toks = [...tokenize(doc.body), ...tokenize(boosted), ...tokenize(boosted), ...tokenize(boosted)];
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { doc, tf, len: toks.length };
    });
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  /** Hits must reach `minScore` and at least `relative` × the best score, so weak extra matches are dropped. */
  search(query: string, opts: { limit?: number; minScore?: number; relative?: number } = {}): SearchHit[] {
    const q = [...new Set(tokenize(query))];
    const n = this.docs.length;
    const hits = this.docs.map(({ doc, tf, len }) => {
      let score = 0;
      for (const term of q) {
        const f = tf.get(term);
        if (!f) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * len) / this.avgLen));
      }
      return { doc, score };
    });
    const sorted = hits.filter((h) => h.score >= (opts.minScore ?? 1)).sort((a, b) => b.score - a.score);
    const floor = (sorted[0]?.score ?? 0) * (opts.relative ?? 0.5);
    return sorted.filter((h) => h.score >= floor).slice(0, opts.limit ?? 3);
  }
}
