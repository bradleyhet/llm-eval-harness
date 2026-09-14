/**
 * Minimal, dependency-free BM25 (Okapi) over pre-tokenised documents.
 * Deterministic by construction: same corpus and query always give the same ranking,
 * ties broken by document insertion order.
 */

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does", "for", "from",
  "have", "how", "i", "if", "in", "is", "it", "its", "my", "of", "on", "or", "that", "the",
  "their", "there", "this", "to", "was", "what", "when", "where", "which", "who", "will",
  "with", "you", "your",
]);

/** Very light stemmer: plurals and a few common suffixes. Enough for a support corpus. */
function stem(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("sses")) return token.slice(0, -2);
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/'s\b/g, "")
    .split(/[^a-z0-9$]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

export interface Bm25Options {
  k1?: number;
  b?: number;
}

export interface ScoredDoc {
  id: string;
  score: number;
}

export class Bm25Index {
  private readonly k1: number;
  private readonly b: number;
  private readonly ids: string[] = [];
  private readonly lengths: number[] = [];
  private readonly termFreqs: Map<string, number>[] = [];
  private readonly docFreq = new Map<string, number>();
  private readonly avgLength: number;

  constructor(docs: ReadonlyArray<{ id: string; text: string }>, opts: Bm25Options = {}) {
    this.k1 = opts.k1 ?? 1.2;
    this.b = opts.b ?? 0.75;
    let total = 0;
    for (const doc of docs) {
      const tokens = tokenize(doc.text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1);
      this.ids.push(doc.id);
      this.lengths.push(tokens.length);
      this.termFreqs.push(tf);
      total += tokens.length;
    }
    this.avgLength = docs.length === 0 ? 0 : total / docs.length;
  }

  get size(): number {
    return this.ids.length;
  }

  private idf(term: string): number {
    const n = this.docFreq.get(term) ?? 0;
    if (n === 0) return 0;
    const total = this.ids.length;
    return Math.log(1 + (total - n + 0.5) / (n + 0.5));
  }

  /** Score every document for `query`; return the top `k` with positive scores, best first. */
  search(query: string, k: number): ScoredDoc[] {
    const terms = Array.from(new Set(tokenize(query)));
    if (terms.length === 0 || this.ids.length === 0) return [];
    const scored: ScoredDoc[] = [];
    for (let i = 0; i < this.ids.length; i++) {
      const tf = this.termFreqs[i]!;
      const len = this.lengths[i]!;
      let score = 0;
      for (const term of terms) {
        const f = tf.get(term);
        if (!f) continue;
        const idf = this.idf(term);
        const norm = (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * len) / this.avgLength));
        score += idf * norm;
      }
      if (score > 0) scored.push({ id: this.ids[i]!, score });
    }
    // Array.prototype.sort is stable, so equal scores keep insertion order.
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
