/**
 * Fill evals/data/embeddings.json with a vector for every text the embedding retriever can be
 * asked about (see src/eval/embedding-texts.ts for what that covers).
 *
 * Needs OPENROUTER_API_KEY (Bun loads .env) only when something is missing; otherwise it is a
 * no-op that reports coverage. Run it after editing the corpus, labels or datasets, then commit
 * the cache so CI and `RETRIEVER=embedding` runs stay key-free.
 *
 *   bun scripts/embed-cache.ts
 */
import { createOpenRouterEmbedder } from "../src/assistant/openrouter.js";
import { collectEmbeddingTexts } from "../src/eval/embedding-texts.js";
import { EmbeddingCache, fillEmbeddingCache } from "../src/retrieval/embedding-retriever.js";

const texts = collectEmbeddingTexts();
const cache = EmbeddingCache.load();
const missing = cache.missing(texts.all);
console.log(
  `Texts: ${texts.chunkTexts.length} chunks, ${texts.labelQueries.length} labelled queries, ${texts.evalQueries.length} eval queries ` +
    `(${texts.blockedEvalQueries} blocked by the input guard, skipped); ${new Set(texts.all).size} distinct, ${missing.length} missing from ${cache.path}.`,
);
if (missing.length === 0) {
  console.log("Cache is complete.");
  process.exit(0);
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("OPENROUTER_API_KEY is not set (copy .env.example to .env).");
  process.exit(1);
}
const filled = await fillEmbeddingCache(cache, texts.all, createOpenRouterEmbedder({ apiKey, title: "llm-eval-harness" }));
console.log(`Fetched ${filled.fetched} vectors (${filled.promptTokens} tokens, $${filled.cost.toFixed(4)}); cache now ${cache.size} vectors.`);
