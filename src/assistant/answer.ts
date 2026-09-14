import type { CustomerStore } from "../fixtures/customers.js";
import type { RetrievedChunk, Retriever } from "../retrieval/retriever.js";
import { filterOutput, REFUSAL_MESSAGE, sanitiseInput, validateRoles, type HistoryMessage } from "./guardrails.js";
import type { ChatMessage, LlmClient, Usage } from "./openrouter.js";
import { buildSystemPrompt, formatContext, SYSTEM_CANARY } from "./system-prompt.js";
import { executeToolCall, TOOLS, toOpenAiTools, type ToolDefinition, type ToolResult } from "./tools/index.js";

export type BlockedBy = "input-guard" | "role-validation" | "output-guard" | null;

export interface AnswerSession {
  customerId: string;
  history?: HistoryMessage[];
}

export interface AnswerDeps {
  retriever: Retriever;
  llm: LlmClient;
  store: CustomerStore;
  model: string;
  tools?: ReadonlyArray<ToolDefinition>;
  temperature?: number;
  maxTokens?: number;
  maxToolRounds?: number;
  retrieval?: { k: number; minScore?: number };
  canary?: string;
}

export interface ToolTrace {
  round: number;
  name: string;
  args: unknown;
  ok: boolean;
  /** JSON-serialised result or error string, exactly as sent back to the model. */
  output: string;
}

export interface AnswerResult {
  answer: string;
  retrieved: RetrievedChunk[];
  /** Retrieved chunk texts followed by tool outputs: everything the answer may be grounded in. */
  context: string[];
  toolCalls: ToolTrace[];
  blockedBy: BlockedBy;
  blockedReason: string | null;
  /** Number of LLM calls made. */
  rounds: number;
  usage: Usage;
  cost: number;
  latencyMs: number;
  model: string;
}

const EMPTY_USAGE: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };

function addUsage(a: Usage, b: Usage): Usage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cost: a.cost + b.cost,
  };
}

function serialiseToolResult(r: ToolResult): string {
  return r.ok ? JSON.stringify(r.result) : JSON.stringify({ error: r.error });
}

/** Readable form of a tool result for the grading context: one `key: value` line per leaf. */
function describeToolResult(name: string, result: unknown): string {
  const lines: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i + 1}]`));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k);
    } else {
      lines.push(`${path}: ${String(value)}`);
    }
  };
  walk(result, "");
  return `Result of tool ${name}:\n${lines.join("\n")}`;
}

/**
 * The whole pipeline as one plain function: guardrails, retrieval, prompt assembly,
 * tool loop, output filter. Every dependency is injected so the unit tests run it
 * end to end against a stubbed LLM with no network.
 */
export async function answer(query: string, session: AnswerSession, deps: AnswerDeps): Promise<AnswerResult> {
  const started = Date.now();
  const canary = deps.canary ?? SYSTEM_CANARY;
  const base = {
    retrieved: [] as RetrievedChunk[],
    context: [] as string[],
    toolCalls: [] as ToolTrace[],
    rounds: 0,
    usage: EMPTY_USAGE,
    cost: 0,
    model: deps.model,
  };
  const finish = (partial: Partial<AnswerResult> & Pick<AnswerResult, "answer" | "blockedBy" | "blockedReason">): AnswerResult => ({
    ...base,
    ...partial,
    latencyMs: Date.now() - started,
  });

  // 1. Input guard: no LLM call on a hit.
  const sanitised = sanitiseInput(query);
  if (sanitised.blocked) {
    return finish({ answer: REFUSAL_MESSAGE, blockedBy: "input-guard", blockedReason: sanitised.matched });
  }

  // 2. History may only contain user and assistant turns.
  const roles = validateRoles(session.history);
  if (!roles.ok) {
    return finish({ answer: REFUSAL_MESSAGE, blockedBy: "role-validation", blockedReason: roles.reason });
  }

  // 3. Retrieval.
  const k = deps.retrieval?.k ?? 6;
  const searchOpts = deps.retrieval?.minScore === undefined ? { k } : { k, minScore: deps.retrieval.minScore };
  const retrieved = deps.retriever.search(sanitised.text, searchOpts);
  const context: string[] = retrieved.map((c) => c.text);

  // 4. Messages.
  const messages: ChatMessage[] = [
    { role: "system", content: `${buildSystemPrompt({ canary })}\n\n${formatContext(retrieved)}` },
    ...(session.history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content) })),
    { role: "user", content: sanitised.text },
  ];

  // 5. Tool loop.
  const tools = deps.tools ?? TOOLS;
  const openAiTools = toOpenAiTools(tools);
  const maxToolRounds = deps.maxToolRounds ?? 3;
  const toolCalls: ToolTrace[] = [];
  let usage = EMPTY_USAGE;
  let rounds = 0;
  let finalText = "";
  let model = deps.model;

  for (;;) {
    const forceAnswer = rounds >= maxToolRounds;
    const res = await deps.llm.chat({
      model: deps.model,
      messages,
      tools: openAiTools,
      toolChoice: forceAnswer ? "none" : "auto",
      temperature: deps.temperature ?? 0,
      ...(deps.maxTokens !== undefined ? { maxTokens: deps.maxTokens } : {}),
    });
    rounds++;
    usage = addUsage(usage, res.usage);
    model = res.model;
    const calls = res.message.tool_calls ?? [];
    if (calls.length === 0 || forceAnswer) {
      finalText = res.message.content ?? "";
      break;
    }
    messages.push({ role: "assistant", content: res.message.content ?? null, tool_calls: calls });
    for (const call of calls) {
      const result = executeToolCall(call.function.name, call.function.arguments, { customerId: session.customerId }, deps.store, tools);
      const output = serialiseToolResult(result);
      toolCalls.push({ round: rounds, name: call.function.name, args: result.args, ok: result.ok, output });
      if (result.ok) context.push(describeToolResult(call.function.name, result.result));
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: output });
    }
  }

  // 6. Output guard.
  const filtered = filterOutput(finalText, { canary });
  const common = { retrieved, context, toolCalls, rounds, usage, cost: usage.cost, model };
  if (filtered.blocked) {
    return finish({ ...common, answer: filtered.text, blockedBy: "output-guard", blockedReason: filtered.matched });
  }
  return finish({ ...common, answer: filtered.text.trim(), blockedBy: null, blockedReason: null });
}
