/**
 * promptfoo custom provider (loaded by promptfoo under Node via `file://src/eval/provider.ts`).
 *
 * Modes:
 *   answer     run the full pipeline; output is { answer, context, trace } so assertions can
 *              `transform: output.answer` and RAG graders can `contextTransform` the context.
 *   retrieval  run only the retriever; output is { retrievedIds, hits }. Costs nothing.
 *
 * Only `node:` APIs are used here: promptfoo executes this file with Node, not Bun.
 */
import { resolve } from "node:path";
import { answer, type AnswerResult } from "../assistant/answer.js";
import { createOpenRouterClient, type LlmClient } from "../assistant/openrouter.js";
import { createFixtureStore } from "../fixtures/customers.js";
import { loadCorpus } from "../retrieval/chunk.js";
import { EmbeddingCache, createEmbeddingRetriever } from "../retrieval/embedding-retriever.js";
import { createBm25Retriever, type Retriever } from "../retrieval/retriever.js";

export type RetrieverName = "bm25" | "embedding";

export interface ProviderConfig {
  mode?: "answer" | "retrieval";
  model?: string;
  corpusDir?: string;
  /**
   * `retriever` defaults to bm25, or to the RETRIEVER environment variable when set, so a whole
   * suite can be re-run on the embedding retriever without editing the config. The embedding
   * retriever reads evals/data/embeddings.json only; every query it sees must already be cached
   * (see scripts/embed-cache.ts), or the case errors rather than silently retrieving nothing.
   */
  retrieval?: { k?: number; minScore?: number; retriever?: RetrieverName };
  maxToolRounds?: number;
  temperature?: number;
  maxTokens?: number;
}

interface CallContext {
  vars?: Record<string, unknown>;
}

interface ProviderResponse {
  output?: unknown;
  error?: string;
  tokenUsage?: { total: number; prompt: number; completion: number };
  cost?: number;
  metadata?: Record<string, unknown>;
}

const retrievers = new Map<string, Retriever>();
function getRetriever(corpusDir: string, name: RetrieverName): Retriever {
  const dir = resolve(corpusDir);
  const key = `${name}:${dir}`;
  let r = retrievers.get(key);
  if (!r) {
    if (name === "embedding") {
      const cache = EmbeddingCache.load();
      r = createEmbeddingRetriever(loadCorpus(dir), (text) => cache.get(text));
    } else {
      r = createBm25Retriever(loadCorpus(dir));
    }
    retrievers.set(key, r);
  }
  return r;
}

function resolveRetrieverName(configured: RetrieverName | undefined): RetrieverName {
  const name = configured ?? process.env.RETRIEVER ?? "bm25";
  if (name !== "bm25" && name !== "embedding") throw new Error(`Unknown retriever "${name}" (expected bm25 or embedding)`);
  return name;
}

let llmSingleton: LlmClient | undefined;
function getLlm(): LlmClient {
  if (!llmSingleton) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
    llmSingleton = createOpenRouterClient({ apiKey, title: "llm-eval-harness" });
  }
  return llmSingleton;
}

const store = createFixtureStore();

function parseHistory(raw: unknown): Array<{ role: string; content: unknown }> | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Array<{ role: string; content: unknown }>;
    } catch {
      return [{ role: "user", content: raw }];
    }
  }
  return raw as Array<{ role: string; content: unknown }>;
}

export default class NeobankAssistantProvider {
  private readonly providerId: string;
  private readonly config: ProviderConfig;

  constructor(options: { id?: string; config?: ProviderConfig } = {}) {
    this.config = options.config ?? {};
    this.providerId = options.id ?? `neobank-assistant:${this.config.mode ?? "answer"}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(prompt: string, context?: CallContext): Promise<ProviderResponse> {
    const vars = context?.vars ?? {};
    const query = typeof vars.query === "string" && vars.query.length > 0 ? vars.query : prompt;
    const customerId = typeof vars.customerId === "string" ? vars.customerId : "cust_001";
    const corpusDir = this.config.corpusDir ?? "corpus";
    const k = this.config.retrieval?.k ?? 6;
    const minScore = this.config.retrieval?.minScore ?? 0;
    const retrieverName = resolveRetrieverName(this.config.retrieval?.retriever);
    const retriever = getRetriever(corpusDir, retrieverName);

    if (this.config.mode === "retrieval") {
      const hits = retriever.search(query, { k, minScore });
      const retrievedIds = hits.map((h) => h.id);
      return {
        output: { retrievedIds, hits: hits.map((h) => ({ id: h.id, score: h.score, normalisedScore: h.normalisedScore })) },
        cost: 0,
        metadata: { mode: "retrieval", retriever: retriever.name, retrievedIds, customerId },
      };
    }

    const model = this.config.model ?? process.env.SUT_MODEL ?? "google/gemini-2.5-flash";
    let result: AnswerResult;
    try {
      result = await answer(
        query,
        { customerId, ...(parseHistory(vars.history) ? { history: parseHistory(vars.history)! } : {}) },
        {
          retriever,
          llm: getLlm(),
          store,
          model,
          retrieval: { k, minScore },
          maxToolRounds: this.config.maxToolRounds ?? 3,
          temperature: this.config.temperature ?? 0,
          ...(this.config.maxTokens !== undefined ? { maxTokens: this.config.maxTokens } : {}),
        },
      );
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }

    return {
      output: {
        answer: result.answer,
        context: result.context,
        trace: { toolCalls: result.toolCalls, retrievedIds: result.retrieved.map((c) => c.id), blockedBy: result.blockedBy },
      },
      tokenUsage: {
        total: result.usage.totalTokens,
        prompt: result.usage.promptTokens,
        completion: result.usage.completionTokens,
      },
      cost: result.cost,
      metadata: {
        mode: "answer",
        retriever: retriever.name,
        blockedBy: result.blockedBy,
        blockedReason: result.blockedReason,
        toolCalls: result.toolCalls,
        retrievedIds: result.retrieved.map((c) => c.id),
        hits: result.retrieved.map((c) => ({ id: c.id, score: c.score, normalisedScore: c.normalisedScore })),
        rounds: result.rounds,
        latencyMs: result.latencyMs,
        model: result.model,
        customerId,
      },
    };
  }
}
