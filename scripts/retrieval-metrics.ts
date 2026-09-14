/**
 * Retrieval regression gate.
 * Chunks the corpus, builds the retriever, runs every labelled query and reports
 * recall@k, hit@1/3/k, MRR and precision@k overall and by difficulty.
 * Writes results/retrieval-metrics.json and exits 1 if below evals/data/thresholds.json.
 *
 *   bun scripts/retrieval-metrics.ts [--k 6] [--min-score 0] [--retriever bm25] [--verbose]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { loadCorpus } from "../src/retrieval/chunk.js";
import { hitAtK, mean, precisionAtK, recallAtK, reciprocalRank } from "../src/retrieval/metrics.js";
import { createBm25Retriever, type Retriever } from "../src/retrieval/retriever.js";

interface Label {
  id: string;
  query: string;
  difficulty: "easy" | "paraphrase" | "distractor";
  relevantChunkIds: string[];
}

interface Row {
  id: string;
  difficulty: Label["difficulty"];
  recall: number;
  hit1: boolean;
  hit3: boolean;
  hitK: boolean;
  rr: number;
  precision: number;
  retrieved: string[];
}

interface Aggregate {
  n: number;
  recall: number;
  hit1: number;
  hit3: number;
  hitK: number;
  mrr: number;
  precision: number;
}

const { values: args } = parseArgs({
  options: {
    k: { type: "string", default: "6" },
    "min-score": { type: "string", default: "0" },
    retriever: { type: "string", default: "bm25" },
    verbose: { type: "boolean", default: false },
    corpus: { type: "string", default: "corpus" },
    labels: { type: "string", default: "evals/data/retrieval-labels.yaml" },
    out: { type: "string", default: "results/retrieval-metrics.json" },
  },
});

const k = Number(args.k);
const minScore = Number(args["min-score"]);
const corpusDir = args.corpus ?? "corpus";
const labelsPath = args.labels ?? "evals/data/retrieval-labels.yaml";
const outPath = args.out ?? "results/retrieval-metrics.json";

const chunks = loadCorpus(corpusDir);
const chunkIds = new Set(chunks.map((c) => c.id));
const labels = parseYaml(readFileSync(labelsPath, "utf8")) as Label[];
const thresholds = JSON.parse(readFileSync("evals/data/thresholds.json", "utf8")) as Record<string, number>;

let retriever: Retriever;
if (args.retriever === "bm25") {
  retriever = createBm25Retriever(chunks);
} else {
  console.error(`Unknown retriever ${args.retriever}`);
  process.exit(1);
}

const missing = labels.flatMap((l) =>
  l.relevantChunkIds.filter((id) => !chunkIds.has(id)).map((id) => `${l.id}: ${id}`),
);
if (missing.length > 0) {
  console.error(`Labels reference ${missing.length} chunk id(s) that do not exist:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

const rows: Row[] = labels.map((l) => {
  const retrieved = retriever.search(l.query, { k, minScore }).map((c) => c.id);
  return {
    id: l.id,
    difficulty: l.difficulty,
    recall: recallAtK(retrieved, l.relevantChunkIds, k),
    hit1: hitAtK(retrieved, l.relevantChunkIds, 1),
    hit3: hitAtK(retrieved, l.relevantChunkIds, 3),
    hitK: hitAtK(retrieved, l.relevantChunkIds, k),
    rr: reciprocalRank(retrieved, l.relevantChunkIds),
    precision: precisionAtK(retrieved, l.relevantChunkIds, k),
    retrieved,
  };
});

function aggregate(subset: Row[]): Aggregate {
  return {
    n: subset.length,
    recall: mean(subset.map((r) => r.recall)),
    hit1: mean(subset.map((r) => (r.hit1 ? 1 : 0))),
    hit3: mean(subset.map((r) => (r.hit3 ? 1 : 0))),
    hitK: mean(subset.map((r) => (r.hitK ? 1 : 0))),
    mrr: mean(subset.map((r) => r.rr)),
    precision: mean(subset.map((r) => r.precision)),
  };
}

const overall = aggregate(rows);
const difficulties = ["easy", "paraphrase", "distractor"] as const;
const byDifficulty = Object.fromEntries(difficulties.map((d) => [d, aggregate(rows.filter((r) => r.difficulty === d))]));

const fmt = (v: number): string => v.toFixed(3);
const line = (name: string, a: Aggregate): string =>
  `| ${name} | ${a.n} | ${fmt(a.recall)} | ${fmt(a.hit1)} | ${fmt(a.hit3)} | ${fmt(a.hitK)} | ${fmt(a.mrr)} | ${fmt(a.precision)} |`;

console.log(`Retriever: ${retriever.name}  chunks: ${chunks.length}  queries: ${labels.length}  k=${k}  minScore=${minScore}\n`);
console.log(`| slice | n | recall@${k} | hit@1 | hit@3 | hit@${k} | MRR | precision@${k} |`);
console.log("|---|---|---|---|---|---|---|---|");
console.log(line("overall", overall));
for (const [d, a] of Object.entries(byDifficulty)) console.log(line(d, a));

const misses = rows.filter((r) => !r.hitK || (args.verbose && !r.hit1));
if (misses.length > 0) {
  console.log(`\n${args.verbose ? "Queries not hit at rank 1" : `Queries with no relevant chunk in top ${k}`}: ${misses.length}`);
  for (const r of misses) {
    const label = labels.find((l) => l.id === r.id)!;
    console.log(`  ${r.id} [${r.difficulty}] "${label.query}"`);
    console.log(`    wanted: ${label.relevantChunkIds.join(", ")}`);
    console.log(`    got:    ${r.retrieved.join(", ") || "(nothing)"}`);
  }
}

mkdirSync("results", { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  retriever: retriever.name,
  k,
  minScore,
  chunks: chunks.length,
  queries: labels.length,
  overall: { ...overall, [`recall_at_${k}`]: overall.recall },
  byDifficulty,
  rows,
};
writeFileSync(outPath, JSON.stringify(report, null, 2));

const failures: string[] = [];
const recallThreshold = thresholds[`recall_at_${k}`];
if (recallThreshold !== undefined && overall.recall < recallThreshold) {
  failures.push(`recall_at_${k} ${fmt(overall.recall)} < ${recallThreshold}`);
}
if (thresholds.mrr !== undefined && overall.mrr < thresholds.mrr) {
  failures.push(`mrr ${fmt(overall.mrr)} < ${thresholds.mrr}`);
}
if (failures.length > 0) {
  console.error(`\nBelow threshold: ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`\nWrote ${outPath}. All thresholds met.`);
