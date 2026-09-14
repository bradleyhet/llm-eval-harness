import { describe, expect, it } from "vitest";
import { hitAtK, mean, precisionAtK, recallAtK, reciprocalRank } from "../src/retrieval/metrics.js";

const retrieved = ["x", "rel1", "y", "rel2", "z", "w"];

describe("retrieval metrics", () => {
  it("recallAtK counts relevant ids inside the top k", () => {
    expect(recallAtK(retrieved, ["rel1", "rel2"], 6)).toBe(1);
    expect(recallAtK(retrieved, ["rel1", "rel2"], 3)).toBe(0.5);
    expect(recallAtK(retrieved, ["nope"], 6)).toBe(0);
    expect(recallAtK(retrieved, [], 6)).toBe(0);
  });

  it("precisionAtK divides by k", () => {
    expect(precisionAtK(retrieved, ["rel1", "rel2"], 4)).toBe(0.5);
  });

  it("hitAtK and reciprocalRank use the first relevant position", () => {
    expect(hitAtK(retrieved, ["rel2"], 3)).toBe(false);
    expect(hitAtK(retrieved, ["rel2"], 4)).toBe(true);
    expect(reciprocalRank(retrieved, ["rel1", "rel2"])).toBe(0.5);
    expect(reciprocalRank(retrieved, ["nope"])).toBe(0);
  });

  it("mean of empty is 0", () => {
    expect(mean([])).toBe(0);
    expect(mean([1, 3])).toBe(2);
  });
});
