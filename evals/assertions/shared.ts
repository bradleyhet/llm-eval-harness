/**
 * Helpers shared by the javascript assertions. promptfoo calls each assertion as
 * `fn(output, context)`; the raw provider response (before any `transform`) is reachable
 * through `context.providerResponse`, which is where the trace metadata lives.
 */

export interface ToolTraceEntry {
  round: number;
  name: string;
  args: unknown;
  ok: boolean;
  output: string;
}

export interface ProviderMetadata {
  mode?: string;
  blockedBy?: string | null;
  blockedReason?: string | null;
  toolCalls?: ToolTraceEntry[];
  retrievedIds?: string[];
  rounds?: number;
  latencyMs?: number;
  model?: string;
  customerId?: string;
}

export interface AssertionContext {
  vars?: Record<string, unknown>;
  metadata?: ProviderMetadata;
  providerResponse?: { output?: unknown; metadata?: ProviderMetadata };
}

export interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
}

export function getMetadata(context: AssertionContext | undefined): ProviderMetadata {
  return context?.providerResponse?.metadata ?? context?.metadata ?? {};
}

export function getRawOutput(output: unknown, context: AssertionContext | undefined): unknown {
  return context?.providerResponse?.output ?? output;
}

export function getAnswer(output: unknown, context: AssertionContext | undefined): string {
  if (typeof output === "string") return output;
  const raw = getRawOutput(output, context);
  if (raw && typeof raw === "object" && "answer" in raw) return String((raw as { answer: unknown }).answer ?? "");
  return typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
}

export function getRetrievedIds(output: unknown, context: AssertionContext | undefined): string[] {
  const candidates: unknown[] = [output, getRawOutput(output, context), getMetadata(context).retrievedIds];
  for (const c of candidates) {
    if (Array.isArray(c) && c.every((x) => typeof x === "string")) return c as string[];
    if (c && typeof c === "object" && Array.isArray((c as { retrievedIds?: unknown }).retrievedIds)) {
      return (c as { retrievedIds: string[] }).retrievedIds;
    }
  }
  return [];
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* fall through to comma split */
    }
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function result(pass: boolean, reason: string, score = pass ? 1 : 0): GradingResult {
  return { pass, score, reason };
}
