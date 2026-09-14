import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The summariser is a script, so it is exercised end to end on a tiny results file.
 * promptfoo multiplies namedScores by the assertion weight, which zeroes weight-0 assertions on
 * known-failure rows; the summariser must read the raw component score instead.
 */
const dir = mkdtempSync(join(tmpdir(), "summarise-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const retrievalRow = (id: string, score: number, weight: number | undefined, retriever: string): unknown => ({
  success: true,
  score: 1,
  cost: 0,
  testCase: { metadata: { id, category: "retrieval", known_failure: weight === 0 } },
  response: { metadata: { mode: "retrieval", retriever } },
  namedScores: { recall_at_6: score * (weight ?? 1), mrr: score },
  gradingResult: {
    pass: true,
    componentResults: [
      { pass: true, score, assertion: { type: "javascript", metric: "recall_at_6", ...(weight === undefined ? {} : { weight }) } },
      { pass: true, score, assertion: { type: "javascript", metric: "mrr" } },
    ],
  },
});

function run(rows: unknown[], name: string): string {
  const input = join(dir, `${name}.json`);
  const results = join(dir, `${name}.md`);
  writeFileSync(input, JSON.stringify({ results: { results: rows } }));
  execFileSync("bun", ["scripts/summarise-results.ts", input, "--sha", `t${name}`, "--tier", "test", "--results", results], {
    encoding: "utf8",
  });
  rmSync(`results/summary-${new Date().toISOString().slice(0, 10)}-t${name}.json`, { force: true });
  return readFileSync(results, "utf8").trim().split("\n").at(-1)!;
}

describe("summarise-results", () => {
  it("uses the raw component score for weight-0 named metrics", () => {
    const row = run([retrievalRow("a", 1, undefined, "bm25"), retrievalRow("b", 1, 0, "bm25")], "w0");
    // recall@6 and MRR columns: both rows scored 1, so the mean is 1.00, not 0.50.
    expect(row).toContain("| 1.00 | 1.00 |");
    expect(row).not.toContain("retriever)");
  });

  it("marks a non-default retriever in the SUT column", () => {
    const row = run([retrievalRow("a", 0.5, undefined, "embedding")], "emb");
    expect(row).toContain("| 0.50 | 0.50 |");
    expect(row).toContain("(embedding retriever)");
  });
});
