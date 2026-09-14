import { describe, expect, it } from "vitest";
import { chunkMarkdown, slugify } from "../src/retrieval/chunk.js";

describe("slugify", () => {
  it("lowercases, hyphenates runs of punctuation and trims", () => {
    expect(slugify("Monthly Account Fee")).toBe("monthly-account-fee");
    expect(slugify("  Fees & Limits (2026)! ")).toBe("fees-limits-2026");
    expect(slugify("What's a chargeback?")).toBe("what-s-a-chargeback");
  });
});

const doc = `# Fees and Limits

Short overview line.

## Everyday Account Fee

The Everyday account has no monthly fee.

### Detail

Nested headings stay in the parent chunk.

## Saver Account Fee

The Saver account costs $5 a month.
`;

describe("chunkMarkdown", () => {
  it("splits on H2, keeps H3 inside its parent, and emits an overview chunk", () => {
    const chunks = chunkMarkdown("fees-and-limits", doc);
    expect(chunks.map((c) => c.id)).toEqual([
      "fees-and-limits#overview",
      "fees-and-limits#everyday-account-fee",
      "fees-and-limits#saver-account-fee",
    ]);
    expect(chunks[1]?.text).toContain("Nested headings stay");
    expect(chunks.every((c) => c.title === "Fees and Limits")).toBe(true);
  });

  it("omits the overview chunk when nothing precedes the first H2", () => {
    const chunks = chunkMarkdown("x", "# Title\n\n## Only\n\nBody.");
    expect(chunks.map((c) => c.id)).toEqual(["x#only"]);
  });

  it("rejects duplicate H2 headings in one file", () => {
    expect(() => chunkMarkdown("x", "# T\n\n## A\n\na\n\n## A\n\nb")).toThrow(/Duplicate chunk id/);
  });

  it("handles CRLF line endings", () => {
    const chunks = chunkMarkdown("x", "# T\r\n\r\n## A\r\n\r\nbody\r\n");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe("body");
  });
});
