import { z } from "zod";
import { formatCents, type Customer } from "../../fixtures/customers.js";

/**
 * The four read-only tools the assistant may call.
 * None of them takes a customer identifier: the session decides whose data is visible,
 * mirroring row-level security as the only authorisation boundary in production.
 * Every schema is strict, so a model that invents a `customerId` argument gets a validation error.
 */

export interface ToolContext {
  customer: Customer | undefined;
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  execute(args: z.infer<S>, ctx: ToolContext): unknown;
}

const accountTypeFilter = z
  .enum(["everyday", "saver", "joint-everyday", "all"])
  .default("all")
  .describe("Which account type to include. Defaults to all.");

function define<S extends z.ZodType>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def;
}

const NO_CUSTOMER = { customerFound: false as const, note: "No customer is attached to this session." };

export const getAccountSummary = define({
  name: "get_account_summary",
  description: "Return the balances and details of the current customer's own accounts. Cannot look up other customers.",
  schema: z.object({ accountType: accountTypeFilter }).strict(),
  execute({ accountType }, { customer }) {
    if (!customer) return NO_CUSTOMER;
    const accounts = customer.accounts
      .filter((a) => accountType === "all" || a.type === accountType)
      .map((a) => ({
        type: a.type,
        nickname: a.nickname,
        bsb: a.bsb,
        number: a.number,
        balance: formatCents(a.balanceCents),
        available: formatCents(a.availableCents),
        openedOn: a.openedOn,
      }));
    return { customerFound: true, accounts };
  },
});

export const listRecentTransactions = define({
  name: "list_recent_transactions",
  description: "List the current customer's most recent transactions, newest first. Cannot look up other customers.",
  schema: z
    .object({
      limit: z.number().int().min(1).max(20).default(5).describe("How many transactions to return, 1 to 20."),
      accountType: accountTypeFilter,
      includePending: z.boolean().default(true).describe("Whether pending (unsettled) transactions are included."),
    })
    .strict(),
  execute({ limit, accountType, includePending }, { customer }) {
    if (!customer) return NO_CUSTOMER;
    const accountIds = new Set(
      customer.accounts.filter((a) => accountType === "all" || a.type === accountType).map((a) => a.id),
    );
    const transactions = customer.transactions
      .filter((t) => accountIds.has(t.accountId) && (includePending || t.status === "posted"))
      .sort((a, b) => b.postedOn.localeCompare(a.postedOn))
      .slice(0, limit)
      .map((t) => ({
        postedOn: t.postedOn,
        description: t.description,
        amount: formatCents(t.amountCents),
        status: t.status,
        account: customer.accounts.find((a) => a.id === t.accountId)?.nickname ?? t.accountId,
      }));
    return { customerFound: true, transactions };
  },
});

export const getCardStatus = define({
  name: "get_card_status",
  description: "Return the status and controls of the current customer's own cards. Cannot look up other customers.",
  schema: z
    .object({
      cardType: z.enum(["physical", "virtual", "all"]).default("all").describe("Which card type to include."),
    })
    .strict(),
  execute({ cardType }, { customer }) {
    if (!customer) return NO_CUSTOMER;
    const cards = customer.cards
      .filter((c) => cardType === "all" || c.type === cardType)
      .map((c) => ({
        type: c.type,
        last4: c.last4,
        status: c.status,
        expiry: c.expiry,
        internationalEnabled: c.internationalEnabled,
        contactlessEnabled: c.contactlessEnabled,
        linkedAccount: customer.accounts.find((a) => a.id === c.linkedAccountId)?.nickname ?? c.linkedAccountId,
      }));
    return { customerFound: true, cards };
  },
});

export const getKycStatus = define({
  name: "get_kyc_status",
  description: "Return the current customer's identity verification (KYC) status and any outstanding items.",
  schema: z.object({}).strict(),
  execute(_args, { customer }) {
    if (!customer) return NO_CUSTOMER;
    return { customerFound: true, kyc: customer.kyc };
  },
});

export const TOOLS: ReadonlyArray<ToolDefinition> = [getAccountSummary, listRecentTransactions, getCardStatus, getKycStatus];
