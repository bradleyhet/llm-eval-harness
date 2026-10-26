import { execFileSync, spawnSync } from "node:child_process";
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

const answerRow = (id: string, success: boolean): unknown => ({
  success,
  testCase: { metadata: { id, category: "grounded", known_failure: false } },
  response: { metadata: { mode: "answer" } },
});

/** Runs the weekly gate (--fail-on-unexpected) on a first run and, optionally, a re-run of its failures. */
function gate(first: unknown[], rerun: unknown[] | null, name: string): { status: number | null; stdout: string } {
  const input = join(dir, `${name}.json`);
  writeFileSync(input, JSON.stringify({ results: { results: first } }));
  const args = ["scripts/summarise-results.ts", input, "--sha", `t${name}`, "--tier", "test", "--results", join(dir, `${name}.md`)];
  args.push("--fail-on-unexpected");
  if (rerun) {
    const rerunPath = join(dir, `${name}-rerun.json`);
    writeFileSync(rerunPath, JSON.stringify({ results: { results: rerun } }));
    args.push("--rerun", rerunPath);
  }
  const { status, stdout } = spawnSync("bun", args, { encoding: "utf8" });
  rmSync(`results/summary-${new Date().toISOString().slice(0, 10)}-t${name}.json`, { force: true });
  return { status, stdout };
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

  it("fails the gate on an unexpected failure when there is no re-run", () => {
    expect(gate([answerRow("a", false), answerRow("b", true)], null, "g0").status).toBe(1);
  });

  it("passes the gate when every unexpected failure passes on the re-run", () => {
    const { status, stdout } = gate([answerRow("a", false), answerRow("b", true)], [answerRow("a", true)], "g1");
    expect(status).toBe(0);
    expect(stdout).toContain("Passed on re-run (1): a");
  });

  it("fails the gate on a case that fails the re-run too", () => {
    const { status, stdout } = gate([answerRow("a", false), answerRow("b", false)], [answerRow("a", true), answerRow("b", false)], "g2");
    expect(status).toBe(1);
    expect(stdout).toContain("Failed again or not re-run (1): b");
  });

  it("fails the gate on a case missing from the re-run", () => {
    expect(gate([answerRow("a", false)], [], "g3").status).toBe(1);
  });
});
