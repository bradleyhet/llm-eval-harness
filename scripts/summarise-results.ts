/**
 * Summarise one promptfoo results file into results/summary-<date>-<sha>.json and append
 * a row to RESULTS.md.
 *
 *   bun scripts/summarise-results.ts results/full.json --sha abc1234 --tier full
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

interface ComponentResult {
  pass?: boolean;
  score?: number;
  assertion?: { type?: string; metric?: string };
}

interface ResultRow {
  success?: boolean;
  score?: number;
  cost?: number;
  latencyMs?: number;
  testCase?: { metadata?: Record<string, unknown> };
  metadata?: Record<string, unknown>;
  gradingResult?: { pass?: boolean; componentResults?: ComponentResult[] };
  response?: { metadata?: Record<string, unknown>; cost?: number };
  namedScores?: Record<string, number>;
}

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sha: { type: "string", default: "local" },
    tier: { type: "string", default: "full" },
    results: { type: "string", default: "RESULTS.md" },
    /** Exit 1 when any case not tagged known_failure failed. Used by the nightly workflow. */
    "fail-on-unexpected": { type: "boolean", default: false },
  },
});

interface ResultsFile {
  results?: { results?: ResultRow[]; stats?: unknown } | ResultRow[];
  config?: { providers?: unknown; defaultTest?: { options?: { provider?: { text?: { id?: string } } } } };
}

// One or more results files (for example results/full.json plus results/retrieval.json) merge into one row.
const inputPaths = positionals.length > 0 ? positionals : ["results/latest.json"];
const inputPath = inputPaths.join(" + ");
let raw: ResultsFile = {};
const rows: ResultRow[] = [];
for (const p of inputPaths) {
  if (!existsSync(p)) {
    console.error(`${p} not found`);
    process.exit(1);
  }
  const file = JSON.parse(readFileSync(p, "utf8")) as ResultsFile;
  rows.push(...(Array.isArray(file.results) ? file.results : (file.results?.results ?? [])));
  if (file.config?.defaultTest?.options?.provider?.text?.id) raw = file;
}
if (rows.length === 0) {
  console.error("No result rows found");
  process.exit(1);
}

const meta = (r: ResultRow): Record<string, unknown> => r.testCase?.metadata ?? r.metadata ?? {};
const passed = (r: ResultRow): boolean => r.success ?? r.gradingResult?.pass ?? false;
const categories = ["grounded", "retrieval", "tools", "guardrails", "abstention", "budget"] as const;

const pct = (n: number, d: number): number => (d === 0 ? 0 : n / d);
const byCategory = Object.fromEntries(
  categories.map((c) => {
    const subset = rows.filter((r) => meta(r).category === c);
    return [c, { n: subset.length, passed: subset.filter(passed).length, passRate: pct(subset.filter(passed).length, subset.length) }];
  }),
);

/**
 * Mean of a named metric over all rows. Component scores are preferred because promptfoo
 * multiplies `namedScores` by the assertion weight, which zeroes the weight-0 assertions on
 * known-failure rows even when they score 1; `namedScores` is only the fallback.
 */
function namedMean(metric: string): number | null {
  const values: number[] = [];
  for (const r of rows) {
    const components = (r.gradingResult?.componentResults ?? []).filter(
      (c) => c.assertion?.metric === metric && typeof c.score === "number",
    );
    if (components.length > 0) {
      for (const c of components) values.push(c.score!);
      continue;
    }
    const direct = r.namedScores?.[metric];
    if (typeof direct === "number") values.push(direct);
  }
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

const guardrailRows = rows.filter((r) => meta(r).category === "guardrails");
const attackRows = guardrailRows.filter((r) => meta(r).attack !== "benign");
const benignRows = guardrailRows.filter((r) => meta(r).attack === "benign");
const respMeta = (r: ResultRow): Record<string, unknown> => r.response?.metadata ?? {};
const guardrails = {
  attacks: attackRows.length,
  attacksHandled: attackRows.filter(passed).length,
  catchRate: pct(attackRows.filter(passed).length, attackRows.length),
  benign: benignRows.length,
  benignBlocked: benignRows.filter((r) => respMeta(r).blockedBy != null).length,
  falsePositiveRate: pct(benignRows.filter((r) => respMeta(r).blockedBy != null).length, benignRows.length),
};

const answerRows = rows.filter((r) => respMeta(r).mode === "answer");
const totalCost = rows.reduce((s, r) => s + (r.cost ?? r.response?.cost ?? 0), 0);
const latencies = answerRows.map((r) => Number(respMeta(r).latencyMs ?? r.latencyMs ?? 0)).filter((n) => n > 0);
const meanLatency = latencies.length === 0 ? null : latencies.reduce((a, b) => a + b, 0) / latencies.length;
const sutBase = String(answerRows.map((r) => respMeta(r).model).find(Boolean) ?? process.env.SUT_MODEL ?? "unknown");
// The retriever is part of the system under test; only a non-default one is worth a mention in the row.
const retrieverName = String(rows.map((r) => respMeta(r).retriever).find(Boolean) ?? "bm25");
const sutModel = retrieverName === "bm25" ? sutBase : `${sutBase} (${retrieverName} retriever)`;
const judgeModel = raw.config?.defaultTest?.options?.provider?.text?.id ?? process.env.JUDGE_MODEL ?? "unknown";
const knownFailures = rows.filter((r) => meta(r).known_failure === true && !passed(r)).length;
const unexpectedFailures = rows.filter((r) => meta(r).known_failure !== true && !passed(r));

const summary = {
  generatedAt: new Date().toISOString(),
  sha: args.sha ?? "local",
  tier: args.tier ?? "full",
  source: inputPath,
  cases: rows.length,
  passed: rows.filter(passed).length,
  passRate: pct(rows.filter(passed).length, rows.length),
  knownFailures,
  unexpectedFailures: unexpectedFailures.length,
  unexpectedFailureIds: unexpectedFailures.map((r) => String(meta(r).id ?? "?")),
  byCategory,
  retrieval: { recallAt6: namedMean("recall_at_6"), mrr: namedMean("mrr") },
  guardrails,
  cost: { totalUsd: totalCost, perAnswerCaseUsd: pct(totalCost, answerRows.length) },
  meanLatencyMs: meanLatency,
  models: { sut: sutModel, judge: judgeModel },
};

mkdirSync("results", { recursive: true });
const date = summary.generatedAt.slice(0, 10);
const shortSha = summary.sha.slice(0, 7);
const summaryPath = `results/summary-${date}-${shortSha}.json`;
writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

const f = (v: number | null, digits = 2): string => (v === null ? "n/a" : v.toFixed(digits));
const p = (v: number): string => `${(v * 100).toFixed(0)}%`;
const cat = (c: (typeof categories)[number]): string => {
  const s = byCategory[c]!;
  return s.n === 0 ? "n/a" : `${p(s.passRate)} (${s.passed}/${s.n})`;
};
const row = [
  date,
  shortSha,
  summary.tier,
  `${summary.passed}/${summary.cases} (${p(summary.passRate)})`,
  cat("grounded"),
  cat("retrieval"),
  cat("tools"),
  cat("guardrails"),
  cat("abstention"),
  cat("budget"),
  f(summary.retrieval.recallAt6),
  f(summary.retrieval.mrr),
  `${p(guardrails.catchRate)} / ${p(guardrails.falsePositiveRate)}`,
  `$${totalCost.toFixed(3)}`,
  meanLatency === null ? "n/a" : `${Math.round(meanLatency)} ms`,
  sutModel,
  judgeModel,
].join(" | ");

const resultsPath = args.results ?? "RESULTS.md";
const header = [
  "| date | sha | tier | pass | grounded | retrieval | tools | guardrails | abstention | budget | recall@6 | MRR | catch / false-positive | cost USD | mean latency | SUT | judge |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
].join("\n");
let doc = existsSync(resultsPath) ? readFileSync(resultsPath, "utf8") : "";
if (!doc.includes("| date | sha | tier |")) {
  doc = `${doc.trimEnd()}\n\n## Runs\n\n${header}\n`;
}
doc = `${doc.trimEnd()}\n| ${row} |\n`;
writeFileSync(resultsPath, doc);

console.log(`Wrote ${summaryPath} and appended a row to ${resultsPath}`);
console.log(`| ${row} |`);
if (summary.unexpectedFailures > 0) {
  console.log(`Unexpected failures (${summary.unexpectedFailures}): ${summary.unexpectedFailureIds.join(", ")}`);
}
if (args["fail-on-unexpected"] && summary.unexpectedFailures > 0) {
  process.exit(1);
}
