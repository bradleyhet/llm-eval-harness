import { Bm25Index } from "./bm25.js";
import type { Chunk } from "./chunk.js";

export interface RetrievedChunk extends Chunk {
  /** Raw ranker score. */
  score: number;
  /**
   * The score `minScore` is compared against. BM25 and hybrid: score divided by the top hit's
   * score for this query, in [0, 1]. Embedding: the cosine similarity itself.
   */
  normalisedScore: number;
}

export interface SearchOptions {
  k: number;
  /**
   * Minimum `normalisedScore` to keep a hit. 0 keeps every positive hit.
   * For BM25 and hybrid this is relative to the top hit for the query, not a cosine similarity;
   * for the embedding retriever it is a cosine threshold. The README states this plainly.
   */
  minScore?: number;
}

export interface Retriever {
  readonly name: string;
  search(query: string, opts: SearchOptions): RetrievedChunk[];
}

/** Index text: title and heading are prepended so heading vocabulary counts. Shared by every retriever. */
export function indexText(chunk: Chunk): string {
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

export interface HybridRetrieverOptions {
  /** RRF smoothing constant; 60 is the value from the original paper and the common default. */
  rrfK?: number;
  /** How many hits to take from each underlying retriever before fusing. */
  depth?: number;
}

/**
 * Reciprocal rank fusion over several retrievers: each hit scores 1 / (rrfK + rank) per list,
 * summed across lists. Deterministic given deterministic inputs; ties break by chunk id.
 */
export function createHybridRetriever(retrievers: ReadonlyArray<Retriever>, opts: HybridRetrieverOptions = {}): Retriever {
  const rrfK = opts.rrfK ?? 60;
  return {
    name: "hybrid",
    search(query, searchOpts) {
      const depth = opts.depth ?? Math.max(searchOpts.k * 3, 20);
      const fused = new Map<string, { chunk: Chunk; score: number }>();
      for (const r of retrievers) {
        r.search(query, { k: depth }).forEach((hit, rank) => {
          const entry = fused.get(hit.id) ?? { chunk: hit, score: 0 };
          entry.score += 1 / (rrfK + rank + 1);
          fused.set(hit.id, entry);
        });
      }
      const ranked = [...fused.values()].sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
      const top = ranked[0]?.score ?? 0;
      const minScore = searchOpts.minScore ?? 0;
      const out: RetrievedChunk[] = [];
      for (const { chunk, score } of ranked) {
        if (out.length >= searchOpts.k) break;
        const normalisedScore = top > 0 ? score / top : 0;
        if (normalisedScore < minScore) continue;
        const { id, doc, title, heading, text } = chunk;
        out.push({ id, doc, title, heading, text, score, normalisedScore });
      }
      return out;
    },
  };
}
