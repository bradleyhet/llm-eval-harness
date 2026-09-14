/**
 * Optional embedding retriever (plan milestone M9): cosine similarity over precomputed vectors.
 *
 * Vectors for every corpus chunk and every labelled query are fetched once through OpenRouter
 * (`google/gemini-embedding-001`, truncated server-side to 768 dimensions) and committed to
 * `evals/data/embeddings.json`, keyed by a hash of the exact text. Reading the cache needs no key,
 * so the BM25 vs embedding vs hybrid comparison is as deterministic and CI-safe as BM25 itself.
 * A text with no cached vector is an error, never a silent fallback: the metrics script fills the
 * cache when a key is present and fails loudly when it is not.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Embedder } from "../assistant/openrouter.js";
import type { Chunk } from "./chunk.js";
import { indexText, type RetrievedChunk, type Retriever } from "./retriever.js";

export const EMBEDDING_MODEL = "google/gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_CACHE_PATH = "evals/data/embeddings.json";

interface CacheFile {
  model: string;
  dimensions: number;
  encoding: "float32-le-base64";
  /** sha256(text) -> base64 of the unit-length vector as little-endian float32. */
  vectors: Record<string, string>;
}

export function textKey(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Scale to unit length so a dot product is a cosine. A zero vector stays zero. */
export function normalise(v: ReadonlyArray<number>): Float32Array {
  const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
  const out = new Float32Array(v.length);
  if (norm === 0) return out;
  for (let i = 0; i < v.length; i++) out[i] = (v[i] ?? 0) / norm;
  return out;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** Explicit little-endian encoding so the committed file is byte-identical across machines. */
export function encodeVector(v: Float32Array): string {
  const buf = Buffer.alloc(v.length * 4);
  for (let i = 0; i < v.length; i++) buf.writeFloatLE(v[i] ?? 0, i * 4);
  return buf.toString("base64");
}

export function decodeVector(s: string): Float32Array {
  const buf = Buffer.from(s, "base64");
  const out = new Float32Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

export class EmbeddingCache {
  private readonly vectors = new Map<string, Float32Array>();

  constructor(
    readonly path: string,
    readonly model: string,
    readonly dimensions: number,
  ) {}

  /** Load the cache if it exists and was built with the same model and width; otherwise start empty. */
  static load(path = EMBEDDING_CACHE_PATH, model = EMBEDDING_MODEL, dimensions = EMBEDDING_DIMENSIONS): EmbeddingCache {
    const cache = new EmbeddingCache(path, model, dimensions);
    if (!existsSync(path)) return cache;
    const file = JSON.parse(readFileSync(path, "utf8")) as Partial<CacheFile>;
    if (file.model !== model || file.dimensions !== dimensions || file.encoding !== "float32-le-base64") return cache;
    for (const [key, encoded] of Object.entries(file.vectors ?? {})) cache.vectors.set(key, decodeVector(encoded));
    return cache;
  }

  get size(): number {
    return this.vectors.size;
  }

  get(text: string): Float32Array | undefined {
    return this.vectors.get(textKey(text));
  }

  set(text: string, vector: Float32Array): void {
    if (vector.length !== this.dimensions) {
      throw new Error(`Expected ${this.dimensions}-dimensional vector, got ${vector.length}`);
    }
    this.vectors.set(textKey(text), vector);
  }

  /** The distinct texts among `texts` with no cached vector, in first-seen order. */
  missing(texts: ReadonlyArray<string>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of texts) {
      const key = textKey(t);
      if (seen.has(key) || this.vectors.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }

  /** Write with sorted keys so re-runs produce stable diffs. */
  save(): void {
    const vectors: Record<string, string> = {};
    for (const key of [...this.vectors.keys()].sort()) vectors[key] = encodeVector(this.vectors.get(key)!);
    const file: CacheFile = { model: this.model, dimensions: this.dimensions, encoding: "float32-le-base64", vectors };
    writeFileSync(this.path, `${JSON.stringify(file, null, 1)}\n`);
  }
}

export interface FillResult {
  fetched: number;
  promptTokens: number;
  cost: number;
}

/**
 * Embed every text in `texts` that the cache lacks, normalise, store and save.
 * Returns zeros without touching the network when nothing is missing.
 */
export async function fillEmbeddingCache(
  cache: EmbeddingCache,
  texts: ReadonlyArray<string>,
  embedder: Embedder,
  batchSize = 32,
): Promise<FillResult> {
  const missing = cache.missing(texts);
  const result: FillResult = { fetched: 0, promptTokens: 0, cost: 0 };
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    const res = await embedder.embed({ model: cache.model, input: batch, dimensions: cache.dimensions });
    batch.forEach((text, j) => cache.set(text, normalise(res.vectors[j] ?? [])));
    result.fetched += batch.length;
    result.promptTokens += res.usage.promptTokens;
    result.cost += res.usage.cost;
  }
  if (result.fetched > 0) cache.save();
  return result;
}

export interface EmbeddingRetrieverOptions {
  /** Drop chunks whose id ends in `#overview` from the index, as for BM25. */
  excludeOverview?: boolean;
}

/**
 * Build a cosine retriever over `chunks`. Every chunk must have a vector in `lookup` at
 * construction, and every query must have one at search time; a miss throws so a stale cache is
 * never mistaken for a retrieval result.
 */
export function createEmbeddingRetriever(
  chunks: ReadonlyArray<Chunk>,
  lookup: (text: string) => Float32Array | undefined,
  opts: EmbeddingRetrieverOptions = {},
): Retriever {
  const indexed = opts.excludeOverview ? chunks.filter((c) => !c.id.endsWith("#overview")) : chunks;
  const missing: string[] = [];
  const entries = indexed.map((chunk) => {
    const vector = lookup(indexText(chunk));
    if (!vector) missing.push(chunk.id);
    return { chunk, vector: vector ?? new Float32Array(0) };
  });
  if (missing.length > 0) {
    throw new Error(`No cached embedding for ${missing.length} chunk(s): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`);
  }

  return {
    name: "embedding",
    search(query, searchOpts) {
      const q = lookup(query);
      if (!q) throw new Error(`No cached embedding for query: ${JSON.stringify(query)}`);
      const minScore = searchOpts.minScore ?? 0;
      const scored = entries
        .map(({ chunk, vector }) => ({ chunk, score: cosine(q, vector) }))
        .filter(({ score }) => score > 0 && score >= minScore)
        .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
        .slice(0, searchOpts.k);
      return scored.map(({ chunk, score }): RetrievedChunk => ({ ...chunk, score, normalisedScore: score }));
    },
  };
}
