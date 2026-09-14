/**
 * Every text the embedding retriever can be asked to look up, so the committed vector cache can
 * be checked for completeness and refilled from one place: corpus chunk index texts, labelled
 * retrieval queries, and each eval-case query as the input guard sanitises it (the pipeline
 * retrieves on the sanitised text; a query the guard blocks never reaches retrieval).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { sanitiseInput } from "../assistant/guardrails.js";
import { loadCorpus } from "../retrieval/chunk.js";
import { indexText } from "../retrieval/retriever.js";

export interface EmbeddingTexts {
  chunkTexts: string[];
  labelQueries: string[];
  evalQueries: string[];
  /** Eval queries the input guard blocks; they are not embedded. */
  blockedEvalQueries: number;
  /** Everything above, in order, duplicates included. */
  all: string[];
}

export interface EmbeddingTextsOptions {
  corpusDir?: string;
  labelsPath?: string;
  testsDir?: string;
}

export function collectEmbeddingTexts(opts: EmbeddingTextsOptions = {}): EmbeddingTexts {
  const corpusDir = opts.corpusDir ?? "corpus";
  const labelsPath = opts.labelsPath ?? "evals/data/retrieval-labels.yaml";
  const testsDir = opts.testsDir ?? "evals/tests";

  const chunkTexts = loadCorpus(corpusDir).map(indexText);
  const labels = parseYaml(readFileSync(labelsPath, "utf8")) as Array<{ query: string }>;
  const labelQueries = labels.map((l) => l.query);

  const evalQueries: string[] = [];
  let blockedEvalQueries = 0;
  for (const file of readdirSync(testsDir).filter((f) => f.endsWith(".yaml")).sort()) {
    const cases = parseYaml(readFileSync(join(testsDir, file), "utf8")) as Array<{ vars?: { query?: unknown } }>;
    for (const c of cases) {
      const query = c.vars?.query;
      if (typeof query !== "string" || query.length === 0) continue;
      const sanitised = sanitiseInput(query);
      if (sanitised.blocked) {
        blockedEvalQueries += 1;
        continue;
      }
      evalQueries.push(sanitised.text);
    }
  }

  return { chunkTexts, labelQueries, evalQueries, blockedEvalQueries, all: [...chunkTexts, ...labelQueries, ...evalQueries] };
}
