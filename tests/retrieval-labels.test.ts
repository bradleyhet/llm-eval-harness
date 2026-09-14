import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { loadCorpus } from "../src/retrieval/chunk.js";

interface Label {
  id: string;
  query: string;
  difficulty: string;
  relevantChunkIds: string[];
}

/** Corpus edits must not silently orphan labels: every labelled chunk id has to exist. */
describe("retrieval labels", () => {
  const chunks = loadCorpus("corpus");
  const ids = new Set(chunks.map((c) => c.id));
  const labels = parseYaml(readFileSync("evals/data/retrieval-labels.yaml", "utf8")) as Label[];

  it("has a non-trivial corpus and label set", () => {
    expect(chunks.length).toBeGreaterThanOrEqual(80);
    expect(labels.length).toBeGreaterThanOrEqual(35);
  });

  it("uses unique label ids", () => {
    expect(new Set(labels.map((l) => l.id)).size).toBe(labels.length);
  });

  it.each(["easy", "paraphrase", "distractor"])("has %s queries", (difficulty) => {
    expect(labels.filter((l) => l.difficulty === difficulty).length).toBeGreaterThan(0);
  });

  it("references only chunk ids that exist in the corpus", () => {
    const orphaned = labels.flatMap((l) =>
      l.relevantChunkIds.filter((id) => !ids.has(id)).map((id) => `${l.id} -> ${id}`),
    );
    expect(orphaned).toEqual([]);
  });
});
