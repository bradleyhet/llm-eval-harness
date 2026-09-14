/**
 * Retrieval regression gate and retriever comparison.
 * Chunks the corpus, builds each requested retriever, runs every labelled query and reports
 * recall@k, hit@1/3/k, MRR and precision@k overall and by difficulty.
 * Writes results/retrieval-metrics.json (bm25) or results/retrieval-metrics-<name>.json and
 * exits 1 if any retriever is below evals/data/thresholds.json.
 *
 *   bun scripts/retrieval-metrics.ts [--k 6] [--min-score 0] [--retriever bm25,embedding,hybrid] [--verbose]
 *
 * `embedding` and `hybrid` read precomputed vectors from evals/data/embeddings.json. Texts missing
 * from that cache are fetched through OpenRouter when OPENROUTER_API_KEY is set (Bun loads .env)
 * and the cache is rewritten; without a key the run fails and says what to do.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { createOpenRouterEmbedder } from "../src/assistant/openrouter.js";
import { loadCorpus } from "../src/retrieval/chunk.js";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EmbeddingCache,
  createEmbeddingRetriever,
  fillEmbeddingCache,
} from "../src/retrieval/embedding-retriever.js";
import { hitAtK, mean, precisionAtK, recallAtK, reciprocalRank } from "../src/retrieval/metrics.js";
import { createBm25Retriever, createHybridRetriever, indexText, type Retriever } from "../src/retrieval/retriever.js";

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

const RETRIEVER_NAMES = ["bm25", "embedding", "hybrid"] as const;
type RetrieverName = (typeof RETRIEVER_NAMES)[number];

const { values: args } = parseArgs({
  options: {
    k: { type: "string", default: "6" },
    "min-score": { type: "string", default: "0" },
    retriever: { type: "string", default: "bm25" },
    verbose: { type: "boolean", default: false },
    corpus: { type: "string", default: "corpus" },
    labels: { type: "string", default: "evals/data/retrieval-labels.yaml" },
    out: { type: "string" },
  },
});

const k = Number(args.k);
const minScore = Number(args["min-score"]);
const corpusDir = args.corpus ?? "corpus";
const labelsPath = args.labels ?? "evals/data/retrieval-labels.yaml";

const names = (args.retriever ?? "bm25").split(",").map((s) => s.trim()).filter(Boolean);
const unknown = names.filter((n) => !(RETRIEVER_NAMES as ReadonlyArray<string>).includes(n));
if (unknown.length > 0 || names.length === 0) {
  console.error(`Unknown retriever ${unknown.join(", ")}. Choose from ${RETRIEVER_NAMES.join(", ")} (comma-separated).`);
  process.exit(1);
}
if (args.out !== undefined && names.length > 1) {
  console.error("--out applies to a single retriever; drop it to write one file per retriever.");
  process.exit(1);
}

const chunks = loadCorpus(corpusDir);
const chunkIds = new Set(chunks.map((c) => c.id));
const labels = parseYaml(readFileSync(labelsPath, "utf8")) as Label[];
const thresholds = JSON.parse(readFileSync("evals/data/thresholds.json", "utf8")) as Record<string, number>;

const missingIds = labels.flatMap((l) =>
  l.relevantChunkIds.filter((id) => !chunkIds.has(id)).map((id) => `${l.id}: ${id}`),
);
if (missingIds.length > 0) {
  console.error(`Labels reference ${missingIds.length} chunk id(s) that do not exist:\n  ${missingIds.join("\n  ")}`);
  process.exit(1);
}

/** Load the vector cache and fill any gaps through OpenRouter. Only called when a retriever needs it. */
async function loadEmbeddings(): Promise<EmbeddingCache> {
  const cache = EmbeddingCache.load();
  const texts = [...chunks.map(indexText), ...labels.map((l) => l.query)];
  const missing = cache.missing(texts);
  if (missing.length === 0) {
    console.log(`Embeddings: ${cache.size} cached vectors (${EMBEDDING_MODEL}, ${EMBEDDING_DIMENSIONS}d) cover all ${texts.length} texts.\n`);
    return cache;
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error(
      `${missing.length} of ${texts.length} texts have no vector in ${cache.path}. ` +
        "Set OPENROUTER_API_KEY and re-run locally to refresh the cache, then commit it.",
    );
    process.exit(1);
  }
  const filled = await fillEmbeddingCache(cache, texts, createOpenRouterEmbedder({ apiKey, title: "llm-eval-harness" }));
  console.log(
    `Embeddings: fetched ${filled.fetched} vectors (${filled.promptTokens} tokens, $${filled.cost.toFixed(4)}); cache now ${cache.size} vectors in ${cache.path}.\n`,
  );
  return cache;
}

const needsEmbeddings = names.some((n) => n !== "bm25");
const cache = needsEmbeddings ? await loadEmbeddings() : undefined;

function buildRetriever(name: RetrieverName): Retriever {
  const bm25 = createBm25Retriever(chunks);
  if (name === "bm25") return bm25;
  const embedding = createEmbeddingRetriever(chunks, (text) => cache!.get(text));
  if (name === "embedding") return embedding;
  return createHybridRetriever([bm25, embedding]);
}

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

const difficulties = ["easy", "paraphrase", "distractor"] as const;
const fmt = (v: number): string => v.toFixed(3);
const line = (name: string, a: Aggregate): string =>
  `| ${name} | ${a.n} | ${fmt(a.recall)} | ${fmt(a.hit1)} | ${fmt(a.hit3)} | ${fmt(a.hitK)} | ${fmt(a.mrr)} | ${fmt(a.precision)} |`;

mkdirSync("results", { recursive: true });
const failures: string[] = [];

for (const name of names as RetrieverName[]) {
  const retriever = buildRetriever(name);
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

  const overall = aggregate(rows);
  const byDifficulty = Object.fromEntries(difficulties.map((d) => [d, aggregate(rows.filter((r) => r.difficulty === d))]));

  const detail = name === "bm25" ? "" : ` (${EMBEDDING_MODEL}, ${EMBEDDING_DIMENSIONS}d, cosine${name === "hybrid" ? ", RRF with bm25" : ""})`;
  console.log(`Retriever: ${retriever.name}${detail}  chunks: ${chunks.length}  queries: ${labels.length}  k=${k}  minScore=${minScore}\n`);
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

  const outPath = args.out ?? (name === "bm25" ? "results/retrieval-metrics.json" : `results/retrieval-metrics-${name}.json`);
  const report = {
    generatedAt: new Date().toISOString(),
    retriever: retriever.name,
    ...(name === "bm25" ? {} : { embeddingModel: EMBEDDING_MODEL, embeddingDimensions: EMBEDDING_DIMENSIONS }),
    k,
    minScore,
    chunks: chunks.length,
    queries: labels.length,
    overall: { ...overall, [`recall_at_${k}`]: overall.recall },
    byDifficulty,
    rows,
  };
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}.\n`);

  const recallThreshold = thresholds[`recall_at_${k}`];
  if (recallThreshold !== undefined && overall.recall < recallThreshold) {
    failures.push(`${name}: recall_at_${k} ${fmt(overall.recall)} < ${recallThreshold}`);
  }
  if (thresholds.mrr !== undefined && overall.mrr < thresholds.mrr) {
    failures.push(`${name}: mrr ${fmt(overall.mrr)} < ${thresholds.mrr}`);
  }
}

if (failures.length > 0) {
  console.error(`Below threshold: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("All thresholds met.");
