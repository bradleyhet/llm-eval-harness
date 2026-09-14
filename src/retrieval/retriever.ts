import { Bm25Index } from "./bm25.js";
import type { Chunk } from "./chunk.js";

export interface RetrievedChunk extends Chunk {
  /** Raw ranker score. */
  score: number;
  /** Score divided by the top hit's score for this query, in [0, 1]. */
  normalisedScore: number;
}

export interface SearchOptions {
  k: number;
  /**
   * Minimum normalised score to keep a hit. 0 keeps every positive hit.
   * For BM25 this is relative to the top hit for the query, not a cosine similarity;
   * the README states this plainly.
   */
  minScore?: number;
}

export interface Retriever {
  readonly name: string;
  search(query: string, opts: SearchOptions): RetrievedChunk[];
}

/** Index text: title and heading are prepended so heading vocabulary counts. */
function indexText(chunk: Chunk): string {
  return `${chunk.title}\n${chunk.heading}\n${chunk.text}`;
}

export interface Bm25RetrieverOptions {
  k1?: number;
  b?: number;
  /** Drop chunks whose id ends in `#overview` from the index. */
  excludeOverview?: boolean;
}

export function createBm25Retriever(chunks: ReadonlyArray<Chunk>, opts: Bm25RetrieverOptions = {}): Retriever {
  const indexed = opts.excludeOverview ? chunks.filter((c) => !c.id.endsWith("#overview")) : chunks;
  const byId = new Map(indexed.map((c) => [c.id, c] as const));
  const bm25Opts = { ...(opts.k1 !== undefined ? { k1: opts.k1 } : {}), ...(opts.b !== undefined ? { b: opts.b } : {}) };
  const index = new Bm25Index(indexed.map((c) => ({ id: c.id, text: indexText(c) })), bm25Opts);
  return {
    name: "bm25",
    search(query, opts) {
      const hits = index.search(query, opts.k);
      const top = hits[0]?.score ?? 0;
      const minScore = opts.minScore ?? 0;
      const out: RetrievedChunk[] = [];
      for (const hit of hits) {
        const normalisedScore = top > 0 ? hit.score / top : 0;
        if (normalisedScore < minScore) continue;
        const chunk = byId.get(hit.id);
        if (!chunk) continue;
        out.push({ ...chunk, score: hit.score, normalisedScore });
      }
      return out;
    },
  };
}
