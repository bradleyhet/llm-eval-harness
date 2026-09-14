/**
 * Four pure guardrail functions. They are a tripwire, not a semantic firewall:
 * the regex layer catches the obvious, the model and the tool scoping catch the rest,
 * and the evals measure both the catch rate and the false-positive rate by layer.
 */

export const REFUSAL_MESSAGE =
  "I can't help with that request. I can help with questions about Corella Bank accounts, cards, transfers, fees, security and disputes.";

export const MAX_INPUT_CHARS = 2000;

/** Character-class range built from code points so the source stays readable and ASCII-only. */
function cpRange(from: number, to: number): string {
  return `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`;
}

/** Zero-width and bidi control characters used to hide text from regexes (U+200B..U+200F, U+202A..U+202E, U+2060..U+2064, U+FEFF). */
const INVISIBLE = new RegExp(
  `[${cpRange(0x200b, 0x200f)}${cpRange(0x202a, 0x202e)}${cpRange(0x2060, 0x2064)}${String.fromCodePoint(0xfeff)}]`,
  "g",
);
/** ASCII control characters other than tab, newline and carriage return. */
const CONTROL = new RegExp(
  `[${cpRange(0x00, 0x08)}${cpRange(0x0b, 0x0c)}${cpRange(0x0e, 0x1f)}${String.fromCodePoint(0x7f)}]`,
  "g",
);

export interface InjectionPattern {
  id: string;
  pattern: RegExp;
}

/**
 * Ordered list of prompt-injection signatures. Each is deliberately narrow so that
 * ordinary banking language ("ignore a pending transaction", "reset my password",
 * "what system do you use") passes through untouched.
 */
export const INJECTION_PATTERNS: ReadonlyArray<InjectionPattern> = [
  { id: "ignore-instructions", pattern: /\b(ignore|disregard|forget|override)\b[^.?!\n]{0,40}\b(previous|prior|above|earlier|all|any|your|the|these|system)\b[^.?!\n]{0,20}\b(instructions?|rules?|prompts?|guidelines?|constraints?|programming)\b/i },
  { id: "new-persona", pattern: /\b(you are now|from now on,? you are|from now on,? act as|pretend (that )?you are|pretend to be|act as if you (are|were|have|had)|roleplay as|imagine you are)\b/i },
  { id: "prompt-leak", pattern: /\b(reveal|show|print|repeat|output|display|dump|leak|tell me|what (is|are|was))\b[^.?!\n]{0,30}\b(your|the|its)\b[^.?!\n]{0,20}\b(system|hidden|initial|original|secret|internal|developer)\b[^.?!\n]{0,10}\b(prompt|instructions?|message|rules?)\b/i },
  { id: "prompt-leak-direct", pattern: /\b(system prompt|hidden prompt|initial prompt|your instructions verbatim|instructions above)\b/i },
  { id: "jailbreak-keyword", pattern: /\bDAN\b/ },
  { id: "jailbreak-keyword-ci", pattern: /\b(developer mode|god mode|jailbreak|jailbroken|do anything now|unfiltered mode|no restrictions mode)\b/i },
  { id: "role-tag", pattern: /(^|\n)\s*\[?\s*(system|assistant|developer)\s*\]?\s*:/i },
  { id: "markup-tag", pattern: /<\/?\s*(system|instructions?|developer|admin|sudo)\b[^>]*>/i },
  { id: "new-instructions", pattern: /\b(new|updated|real|actual|true) (instructions?|rules?|system prompt)\s*[:=]/i },
  { id: "secret-extraction", pattern: /\b(api[ _-]?keys?|secret keys?|environment variables?|env vars?|\.env\b|credentials you (use|have))\b/i },
  { id: "privilege-claim", pattern: /\b(i am|i'm|this is) (the|your|a|an) (developer|administrator|admin|engineer|operator|creator|owner) (of|at|for|who)\b[^.?!\n]{0,40}\b(corella|this (bot|assistant|system|app))\b/i },
  { id: "safety-off", pattern: /\b(disable|turn off|bypass|remove|switch off)\b[^.?!\n]{0,20}\b(safety|guardrails?|filters?|restrictions|content policy|checks)\b/i },
  { id: "other-customer-lookup", pattern: /\b(look ?up|show|fetch|pull|find|get|access|open)\b[^.?!\n]{0,30}\b((another|other|different|any) (customer|account holder|user|client)|someone else'?s?)\b/i },
];

export type SanitiseResult =
  | { blocked: false; text: string; truncated: boolean }
  | { blocked: true; text: string; truncated: boolean; matched: string };

/**
 * Strip invisible and control characters, cap the length, then screen against
 * the injection signatures. Never throws.
 */
export function sanitiseInput(raw: string): SanitiseResult {
  const cleaned = raw.normalize("NFKC").replace(INVISIBLE, "").replace(CONTROL, "").trim();
  const truncated = cleaned.length > MAX_INPUT_CHARS;
  const text = truncated ? cleaned.slice(0, MAX_INPUT_CHARS) : cleaned;
  for (const { id, pattern } of INJECTION_PATTERNS) {
    if (pattern.test(text)) return { blocked: true, text, truncated, matched: id };
  }
  return { blocked: false, text, truncated };
}

export interface HistoryMessage {
  role: string;
  content: unknown;
}

export type RoleValidation = { ok: true } | { ok: false; reason: string };

/** Only `user` and `assistant` may appear in caller-supplied history; anything else is a spoof. */
export function validateRoles(history: ReadonlyArray<HistoryMessage> | undefined): RoleValidation {
  if (!history) return { ok: true };
  for (const [i, m] of history.entries()) {
    if (m.role !== "user" && m.role !== "assistant") {
      return { ok: false, reason: `history[${i}] has disallowed role "${String(m.role)}"` };
    }
    if (typeof m.content !== "string") {
      return { ok: false, reason: `history[${i}] content must be a string` };
    }
  }
  return { ok: true };
}

/** Patterns that must never reach a customer. */
export const SECRET_PATTERNS: ReadonlyArray<InjectionPattern> = [
  { id: "openrouter-key", pattern: /sk-or-v1-[a-f0-9]{16,}/i },
  { id: "generic-sk-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { id: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._-]{24,}/ },
  { id: "private-key-block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "env-assignment", pattern: /\b(OPENROUTER_API_KEY|GOOGLE_AI_API_KEY|JUDGE_MODEL|SUT_MODEL)\s*[=:]/ },
];

export type OutputFilterResult =
  | { blocked: false; text: string }
  | { blocked: true; text: string; matched: string };

/**
 * Screen the model's answer for leaked secrets and the system-prompt canary.
 * A hit replaces the whole answer with the refusal message.
 */
export function filterOutput(text: string, opts: { canary?: string } = {}): OutputFilterResult {
  if (opts.canary && text.includes(opts.canary)) {
    return { blocked: true, text: REFUSAL_MESSAGE, matched: "system-canary" };
  }
  for (const { id, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) return { blocked: true, text: REFUSAL_MESSAGE, matched: id };
  }
  return { blocked: false, text };
}
