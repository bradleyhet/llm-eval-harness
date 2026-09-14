import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { loadCorpus, type Chunk } from "../src/retrieval/chunk.js";
import {
  EMBEDDING_CACHE_PATH,
  EmbeddingCache,
  cosine,
  createEmbeddingRetriever,
  decodeVector,
  encodeVector,
  normalise,
} from "../src/retrieval/embedding-retriever.js";
import { createHybridRetriever, indexText, type RetrievedChunk, type Retriever } from "../src/retrieval/retriever.js";

const chunk = (id: string): Chunk => ({ id, doc: "d", title: "T", heading: id, text: `text ${id}` });
const vec = (...xs: number[]): Float32Array => normalise(xs);

describe("vector helpers", () => {
  it("normalises to unit length and leaves a zero vector alone", () => {
    const v = normalise([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
    expect([...normalise([0, 0])]).toEqual([0, 0]);
  });

  it("computes cosine independent of magnitude", () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([5, 0]))).toBeCloseTo(1);
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 2]))).toBeCloseTo(0);
    expect(cosine(new Float32Array([1, 1]), new Float32Array([-1, -1]))).toBeCloseTo(-1);
    expect(() => cosine(new Float32Array([1]), new Float32Array([1, 2]))).toThrow(/mismatch/);
  });

  it("round-trips a vector through the little-endian base64 encoding", () => {
    const v = new Float32Array([0.25, -1.5, 3.0e-5, 1]);
    expect([...decodeVector(encodeVector(v))]).toEqual([...v]);
  });
});

describe("EmbeddingCache", () => {
  it("reports missing texts once each and serves what it holds", () => {
    const cache = new EmbeddingCache("unused.json", "m", 2);
    cache.set("a", vec(1, 0));
    expect(cache.missing(["a", "b", "b", "c"])).toEqual(["b", "c"]);
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("b")).toBeUndefined();
    expect(() => cache.set("x", vec(1, 0, 0))).toThrow(/2-dimensional/);
  });
});

describe("createEmbeddingRetriever", () => {
  const chunks = [chunk("a"), chunk("b"), chunk("c")];
  const vectors = new Map<string, Float32Array>([
    [indexText(chunks[0]!), vec(1, 0)],
    [indexText(chunks[1]!), vec(1, 1)],
    [indexText(chunks[2]!), vec(0, 1)],
    ["towards a", vec(1, 0.2)],
  ]);
  const lookup = (t: string): Float32Array | undefined => vectors.get(t);

  it("ranks by cosine and exposes the cosine as normalisedScore", () => {
    const hits = createEmbeddingRetriever(chunks, lookup).search("towards a", { k: 3 });
    expect(hits.map((h) => h.id)).toEqual(["a", "b", "c"]);
    expect(hits[0]!.normalisedScore).toBe(hits[0]!.score);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it("applies minScore as a cosine threshold and honours k", () => {
    const r = createEmbeddingRetriever(chunks, lookup);
    expect(r.search("towards a", { k: 3, minScore: 0.5 }).map((h) => h.id)).toEqual(["a", "b"]);
    expect(r.search("towards a", { k: 1 }).map((h) => h.id)).toEqual(["a"]);
  });

  it("throws on a chunk or query with no cached vector rather than falling back", () => {
    expect(() => createEmbeddingRetriever([...chunks, chunk("z")], lookup)).toThrow(/No cached embedding for 1 chunk/);
    expect(() => createEmbeddingRetriever(chunks, lookup).search("never embedded", { k: 3 })).toThrow(/No cached embedding for query/);
  });
});

describe("createHybridRetriever", () => {
  const fake = (name: string, order: string[]): Retriever => ({
    name,
    search: (_q, opts) =>
      order.slice(0, opts.k).map((id, i): RetrievedChunk => ({ ...chunk(id), score: order.length - i, normalisedScore: 1 })),
  });

  it("fuses by reciprocal rank so a chunk in both lists outranks a single first place", () => {
    const hybrid = createHybridRetriever([fake("x", ["a", "b", "c"]), fake("y", ["b", "c", "d"])]);
    const hits = hybrid.search("q", { k: 4 });
    expect(hits.map((h) => h.id)).toEqual(["b", "c", "a", "d"]);
    expect(hits[0]!.normalisedScore).toBe(1);
    expect(hits.every((h) => h.normalisedScore <= 1)).toBe(true);
  });

  it("honours k and a relative minScore", () => {
    const hybrid = createHybridRetriever([fake("x", ["a", "b", "c"]), fake("y", ["b", "c", "d"])]);
    expect(hybrid.search("q", { k: 2 }).map((h) => h.id)).toEqual(["b", "c"]);
    expect(hybrid.search("q", { k: 4, minScore: 0.99 }).map((h) => h.id)).toEqual(["b"]);
  });
});

/** The committed cache must cover every corpus chunk and labelled query, or CI's comparison is stale. */
describe("committed embedding cache", () => {
  const cache = EmbeddingCache.load(EMBEDDING_CACHE_PATH);
  const chunks = loadCorpus("corpus");
  const labels = parseYaml(readFileSync("evals/data/retrieval-labels.yaml", "utf8")) as Array<{ query: string }>;

  it("has a vector for every chunk and every query", () => {
    const missing = cache.missing([...chunks.map(indexText), ...labels.map((l) => l.query)]);
    expect(missing, "run `bun run retrieval:metrics --retriever embedding` with OPENROUTER_API_KEY set and commit evals/data/embeddings.json").toEqual([]);
  });

  it("holds unit-length vectors of the declared width", () => {
    const v = cache.get(indexText(chunks[0]!))!;
    expect(v.length).toBe(cache.dimensions);
    expect(cosine(v, v)).toBeCloseTo(1);
    expect(Math.sqrt([...v].reduce((a, x) => a + x * x, 0))).toBeCloseTo(1, 4);
  });
});
