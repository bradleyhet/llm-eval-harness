import { z } from "zod";
import type { CustomerStore } from "../../fixtures/customers.js";
import { TOOLS, type ToolDefinition } from "./definitions.js";

export { TOOLS } from "./definitions.js";
export type { ToolDefinition, ToolContext } from "./definitions.js";

/** OpenAI-compatible tool list, the shape OpenRouter's chat completions endpoint accepts. */
export interface OpenAiTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export function toOpenAiTools(tools: ReadonlyArray<ToolDefinition> = TOOLS): OpenAiTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: z.toJSONSchema(t.schema, { target: "draft-7" }) as Record<string, unknown>,
    },
  }));
}

export interface Session {
  customerId: string;
}

export type ToolResult =
  | { ok: true; name: string; args: unknown; result: unknown }
  | { ok: false; name: string; args: unknown; error: string };

/**
 * Validate and run one tool call. `rawArgs` may be the JSON string the model produced
 * or an already-parsed object. Never throws: every failure becomes `{ ok: false, error }`
 * so the model sees it as a tool result and can recover.
 */
export function executeToolCall(
  name: string,
  rawArgs: string | Record<string, unknown> | undefined,
  session: Session,
  store: CustomerStore,
  tools: ReadonlyArray<ToolDefinition> = TOOLS,
): ToolResult {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { ok: false, name, args: rawArgs, error: `Unknown tool: ${name}` };

  let parsedArgs: unknown = rawArgs ?? {};
  if (typeof rawArgs === "string") {
    try {
      parsedArgs = rawArgs.trim() === "" ? {} : JSON.parse(rawArgs);
    } catch {
      return { ok: false, name, args: rawArgs, error: "Tool arguments were not valid JSON." };
    }
  }

  const validated = tool.schema.safeParse(parsedArgs);
  if (!validated.success) {
    const issues = validated.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return { ok: false, name, args: parsedArgs, error: `Invalid arguments: ${issues}` };
  }

  try {
    const result = tool.execute(validated.data, { customer: store.getCustomer(session.customerId) });
    return { ok: true, name, args: validated.data, result };
  } catch (err) {
    return { ok: false, name, args: validated.data, error: err instanceof Error ? err.message : String(err) };
  }
}
