import { describe, expect, it } from "vitest";

describe("scaffold", () => {
  it("runs under vitest with strict TypeScript", () => {
    const pairs: ReadonlyArray<readonly [string, number]> = [["a", 1]];
    expect(pairs[0]?.[1]).toBe(1);
  });
});
