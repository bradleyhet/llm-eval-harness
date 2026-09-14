import { describe, expect, it } from "vitest";
import { Bm25Index, tokenize } from "../src/retrieval/bm25.js";
import type { Chunk } from "../src/retrieval/chunk.js";
import { createBm25Retriever } from "../src/retrieval/retriever.js";

describe("tokenize", () => {
  it("lowercases, drops stopwords and short tokens, and stems plurals", () => {
    expect(tokenize("The Cards are replaced")).toEqual(["card", "replac"]);
    expect(tokenize("What is my daily limit?")).toEqual(["daily", "limit"]);
  });
});

const docs = [
  { id: "a", text: "monthly fee on the everyday account is zero" },
  { id: "b", text: "monthly fee on the saver account is five dollars" },
  { id: "c", text: "international transfers take three business days" },
];

describe("Bm25Index", () => {
  it("ranks the document sharing the rarest query terms first", () => {
    const index = new Bm25Index(docs);
    const hits = index.search("saver account monthly fee", 3);
    expect(hits[0]?.id).toBe("b");
    expect(hits.map((h) => h.id)).toContain("a");
    expect(hits.map((h) => h.id)).not.toContain("c");
  });

  it("returns nothing for an empty or stopword-only query", () => {
    const index = new Bm25Index(docs);
    expect(index.search("", 3)).toEqual([]);
    expect(index.search("the of and", 3)).toEqual([]);
  });

  it("is deterministic across rebuilds", () => {
    const a = new Bm25Index(docs).search("transfers days", 3);
    const b = new Bm25Index(docs).search("transfers days", 3);
    expect(a).toEqual(b);
  });
});

describe("createBm25Retriever", () => {
  const chunks: Chunk[] = docs.map((d) => ({ id: d.id, doc: "d", title: "T", heading: d.id, text: d.text }));

  it("normalises scores against the top hit and applies minScore", () => {
    const r = createBm25Retriever(chunks);
    const all = r.search("saver account monthly fee", { k: 6 });
    expect(all[0]?.normalisedScore).toBe(1);
    const strict = r.search("saver account monthly fee", { k: 6, minScore: 0.99 });
    expect(strict.map((c) => c.id)).toEqual(["b"]);
  });

  it("respects k", () => {
    const r = createBm25Retriever(chunks);
    expect(r.search("account fee", { k: 1 })).toHaveLength(1);
  });
});
