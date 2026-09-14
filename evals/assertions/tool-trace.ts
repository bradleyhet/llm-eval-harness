import { asStringArray, getMetadata, result, type AssertionContext, type GradingResult } from "./shared.js";

/**
 * Checks the tool trace against vars.expectTools (all must have been called successfully),
 * vars.forbidTools (none may appear) and vars.expectNoTools (no calls at all).
 */
export default function toolTrace(_output: unknown, context?: AssertionContext): GradingResult {
  const calls = getMetadata(context).toolCalls ?? [];
  const called = calls.map((c) => c.name);
  const okCalled = new Set(calls.filter((c) => c.ok).map((c) => c.name));
  const problems: string[] = [];

  const expectTools = asStringArray(context?.vars?.expectTools);
  for (const name of expectTools) if (!okCalled.has(name)) problems.push(`expected a successful call to ${name}`);

  const forbidTools = asStringArray(context?.vars?.forbidTools);
  for (const name of forbidTools) if (called.includes(name)) problems.push(`forbidden tool ${name} was called`);

  const expectNoTools = context?.vars?.expectNoTools === true || context?.vars?.expectNoTools === "true";
  if (expectNoTools && called.length > 0) problems.push(`expected no tool calls, got ${called.join(", ")}`);

  const summary = called.length === 0 ? "no tool calls" : `called: ${called.join(", ")}`;
  return problems.length === 0 ? result(true, summary) : result(false, `${problems.join("; ")} (${summary})`);
}
