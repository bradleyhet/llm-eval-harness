/**
 * Ask the assistant one question from the terminal and print the full trace.
 *
 *   bun scripts/ask.ts "What is the monthly fee?" --customer cust_001 [--model google/gemini-2.5-flash] [--json]
 *
 * Bun loads .env automatically, so OPENROUTER_API_KEY and SUT_MODEL come from there.
 */
import { parseArgs } from "node:util";
import { answer } from "../src/assistant/answer.js";
import { createOpenRouterClient } from "../src/assistant/openrouter.js";
import { createFixtureStore } from "../src/fixtures/customers.js";
import { loadCorpus } from "../src/retrieval/chunk.js";
import { createBm25Retriever } from "../src/retrieval/retriever.js";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    customer: { type: "string", default: "cust_001" },
    model: { type: "string" },
    k: { type: "string", default: "6" },
    "min-score": { type: "string", default: "0" },
    history: { type: "string" },
    json: { type: "boolean", default: false },
  },
});

const query = positionals.join(" ").trim();
if (!query) {
  console.error('Usage: bun scripts/ask.ts "question" --customer cust_001');
  process.exit(2);
}
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("OPENROUTER_API_KEY is not set (copy .env.example to .env).");
  process.exit(2);
}

const model = args.model ?? process.env.SUT_MODEL ?? "google/gemini-2.5-flash";
const result = await answer(
  query,
  {
    customerId: args.customer ?? "cust_001",
    ...(args.history ? { history: JSON.parse(args.history) as Array<{ role: string; content: unknown }> } : {}),
  },
  {
    retriever: createBm25Retriever(loadCorpus("corpus")),
    llm: createOpenRouterClient({ apiKey, title: "llm-eval-harness" }),
    store: createFixtureStore(),
    model,
    retrieval: { k: Number(args.k), minScore: Number(args["min-score"]) },
  },
);

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`\n${result.answer}\n`);
  console.log(`blockedBy: ${result.blockedBy ?? "none"}${result.blockedReason ? ` (${result.blockedReason})` : ""}`);
  console.log(`retrieved (${result.retrieved.length}):`);
  for (const c of result.retrieved) console.log(`  ${c.normalisedScore.toFixed(2)}  ${c.id}`);
  console.log(`tool calls (${result.toolCalls.length}):`);
  for (const t of result.toolCalls) console.log(`  round ${t.round}  ${t.name}(${JSON.stringify(t.args)})  ${t.ok ? "ok" : "error"}  ${t.output.slice(0, 160)}`);
  console.log(`rounds: ${result.rounds}  model: ${result.model}`);
  console.log(`tokens: ${result.usage.promptTokens} in / ${result.usage.completionTokens} out  cost: $${result.cost.toFixed(5)}  latency: ${result.latencyMs} ms`);
}
