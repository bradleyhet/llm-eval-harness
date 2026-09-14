import { describe, expect, it } from "vitest";
import { executeToolCall, TOOLS, toOpenAiTools } from "../src/assistant/tools/index.js";
import { createFixtureStore, CUSTOMERS, otherCustomersCanaries } from "../src/fixtures/customers.js";

const store = createFixtureStore();
const session = { customerId: "cust_001" };

describe("tool definitions", () => {
  it("exposes the four read-only tools as strict OpenAI function schemas", () => {
    const tools = toOpenAiTools();
    expect(tools.map((t) => t.function.name)).toEqual([
      "get_account_summary",
      "list_recent_transactions",
      "get_card_status",
      "get_kyc_status",
    ]);
    for (const t of tools) {
      expect(t.function.parameters.type).toBe("object");
      expect(t.function.parameters.additionalProperties).toBe(false);
      expect(JSON.stringify(t.function.parameters)).not.toContain("customerId");
    }
  });
});

describe("executeToolCall", () => {
  it("returns the session customer's accounts", () => {
    const r = executeToolCall("get_account_summary", "{}", session, store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const result = r.result as { customerFound: boolean; accounts: Array<{ type: string; balance: string }> };
    expect(result.customerFound).toBe(true);
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts.find((a) => a.type === "everyday")?.balance).toBe("$4,183.27");
  });

  it("filters by account type and honours limit and includePending", () => {
    const r = executeToolCall("list_recent_transactions", { limit: 2, accountType: "everyday", includePending: false }, session, store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const result = r.result as { transactions: Array<{ status: string; postedOn: string }> };
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions.every((t) => t.status === "posted")).toBe(true);
    expect(result.transactions[0]!.postedOn >= result.transactions[1]!.postedOn).toBe(true);
  });

  it("returns zero rows for a session whose customer does not exist", () => {
    for (const tool of TOOLS) {
      const r = executeToolCall(tool.name, {}, { customerId: "cust_999" }, store);
      expect(r.ok).toBe(true);
      if (r.ok) expect((r.result as { customerFound: boolean }).customerFound).toBe(false);
    }
  });

  it("rejects an invented customerId argument instead of honouring it", () => {
    const r = executeToolCall("get_account_summary", { customerId: "cust_002" }, session, store);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Invalid arguments/);
  });

  it("rejects out-of-range and malformed arguments", () => {
    expect(executeToolCall("list_recent_transactions", { limit: 500 }, session, store).ok).toBe(false);
    expect(executeToolCall("get_card_status", "{not json", session, store).ok).toBe(false);
    expect(executeToolCall("no_such_tool", {}, session, store).ok).toBe(false);
  });

  it("never leaks another customer's canaries through any tool for any session", () => {
    for (const customer of CUSTOMERS) {
      const others = otherCustomersCanaries(customer.id);
      for (const tool of TOOLS) {
        const r = executeToolCall(tool.name, {}, { customerId: customer.id }, store);
        const text = JSON.stringify(r);
        for (const canary of others) expect(text, `${tool.name} for ${customer.id} leaked ${canary}`).not.toContain(canary);
      }
    }
  });
});

describe("fixtures", () => {
  it("canaries are unique across customers", () => {
    const all = CUSTOMERS.flatMap((c) => c.canaries);
    expect(new Set(all).size).toBe(all.length);
  });
});
