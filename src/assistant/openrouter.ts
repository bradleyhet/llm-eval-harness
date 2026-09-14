/**
 * Thin fetch client for OpenRouter's OpenAI-compatible chat completions endpoint.
 * Requests `usage.include` so every response carries the dollar cost OpenRouter charged.
 * No SDK: the surface we use is small and this keeps the provider loadable under plain Node.
 */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatTool[];
  toolChoice?: "auto" | "none";
  temperature?: number;
  maxTokens?: number;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** USD as reported by the provider; 0 when not reported. */
  cost: number;
}

export interface ChatResponse {
  message: ChatMessage;
  finishReason: string;
  usage: Usage;
  model: string;
}

export interface LlmClient {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export interface OpenRouterOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Optional attribution headers OpenRouter shows in its dashboard. */
  referer?: string;
  title?: string;
  timeoutMs?: number;
}

interface RawError {
  error?: { message?: string; code?: number | string };
}

interface RawResponse extends RawError {
  model?: string;
  choices?: Array<{ message?: ChatMessage; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
}

/** POST a JSON body to `${baseUrl}${path}` and parse the JSON reply, surfacing OpenRouter errors. */
async function postJson<T extends RawError>(opts: OpenRouterOptions, path: string, body: unknown): Promise<T> {
  const baseUrl = (opts.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
  };
  if (opts.referer) headers["HTTP-Referer"] = opts.referer;
  if (opts.title) headers["X-Title"] = opts.title;

  const res = await fetchImpl(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  let raw: T;
  try {
    raw = JSON.parse(text) as T;
  } catch {
    throw new Error(`OpenRouter returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || raw.error) {
    throw new Error(`OpenRouter error ${raw.error?.code ?? res.status}: ${raw.error?.message ?? text.slice(0, 200)}`);
  }
  return raw;
}

export function createOpenRouterClient(opts: OpenRouterOptions): LlmClient {
  return {
    async chat(req) {
      const body: Record<string, unknown> = {
        model: req.model,
        messages: req.messages,
        temperature: req.temperature ?? 0,
        usage: { include: true },
      };
      if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
      if (req.tools && req.tools.length > 0) {
        body.tools = req.tools;
        body.tool_choice = req.toolChoice ?? "auto";
      }

      const raw = await postJson<RawResponse>(opts, "/chat/completions", body);
      const choice = raw.choices?.[0];
      if (!choice?.message) throw new Error("OpenRouter response had no choices");

      return {
        message: choice.message,
        finishReason: choice.finish_reason ?? "unknown",
        usage: {
          promptTokens: raw.usage?.prompt_tokens ?? 0,
          completionTokens: raw.usage?.completion_tokens ?? 0,
          totalTokens: raw.usage?.total_tokens ?? 0,
          cost: raw.usage?.cost ?? 0,
        },
        model: raw.model ?? req.model,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Embeddings. Same endpoint family (`/embeddings`, OpenAI-compatible); OpenRouter does not list
// embedding models under `/models`, but `google/gemini-embedding-001` is served and priced.
// ---------------------------------------------------------------------------

export interface EmbedRequest {
  model: string;
  input: string[];
  /** Matryoshka truncation requested from the server; omit for the model's native width. */
  dimensions?: number;
}

export interface EmbedResponse {
  /** One vector per input, in input order. Not unit-length: callers normalise. */
  vectors: number[][];
  usage: { promptTokens: number; cost: number };
  model: string;
}

export interface Embedder {
  embed(req: EmbedRequest): Promise<EmbedResponse>;
}

interface RawEmbedResponse extends RawError {
  model?: string;
  data?: Array<{ index?: number; embedding?: number[] }>;
  usage?: { prompt_tokens?: number; cost?: number };
}

export function createOpenRouterEmbedder(opts: OpenRouterOptions): Embedder {
  return {
    async embed(req) {
      const body: Record<string, unknown> = { model: req.model, input: req.input, usage: { include: true } };
      if (req.dimensions !== undefined) body.dimensions = req.dimensions;

      const raw = await postJson<RawEmbedResponse>(opts, "/embeddings", body);
      const data = raw.data ?? [];
      if (data.length !== req.input.length) {
        throw new Error(`OpenRouter returned ${data.length} embeddings for ${req.input.length} inputs`);
      }
      const vectors: number[][] = new Array<number[]>(req.input.length);
      data.forEach((d, i) => {
        const idx = d.index ?? i;
        if (!d.embedding || idx < 0 || idx >= vectors.length) throw new Error("OpenRouter embedding response malformed");
        vectors[idx] = d.embedding;
      });
      return {
        vectors,
        usage: { promptTokens: raw.usage?.prompt_tokens ?? 0, cost: raw.usage?.cost ?? 0 },
        model: raw.model ?? req.model,
      };
    },
  };
}
