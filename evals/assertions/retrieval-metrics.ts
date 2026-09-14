import { recallAtK, reciprocalRank } from "../../src/retrieval/metrics.js";
import { asStringArray, getRetrievedIds, result, type AssertionContext, type GradingResult } from "./shared.js";

const K = 6;

/** Score = recall@6 of vars.relevantChunkIds within the retrieved ids. Pass if score >= threshold (promptfoo applies it). */
export function recallAt6(output: unknown, context?: AssertionContext): GradingResult {
  const relevant = asStringArray(context?.vars?.relevantChunkIds);
  const retrieved = getRetrievedIds(output, context);
  if (relevant.length === 0) return result(false, "vars.relevantChunkIds is empty");
  const score = recallAtK(retrieved, relevant, K);
  return { pass: score > 0, score, reason: `recall@${K}=${score.toFixed(2)} (relevant: ${relevant.join(", ")}; got: ${retrieved.slice(0, K).join(", ")})` };
}

/** Score = reciprocal rank of the first relevant id. Informational when weighted 0 in the config. */
export function mrr(output: unknown, context?: AssertionContext): GradingResult {
  const relevant = asStringArray(context?.vars?.relevantChunkIds);
  const retrieved = getRetrievedIds(output, context);
  const score = reciprocalRank(retrieved, relevant);
  return { pass: true, score, reason: `rr=${score.toFixed(2)}` };
}
