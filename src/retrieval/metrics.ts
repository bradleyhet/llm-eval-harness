/**
 * Ranking metrics shared by the metrics script, the promptfoo assertions and the unit tests.
 * All take the ranked list of retrieved ids (best first) and the list of relevant ids.
 */

export function recallAtK(retrieved: ReadonlyArray<string>, relevant: ReadonlyArray<string>, k: number): number {
  if (relevant.length === 0) return 0;
  const top = new Set(retrieved.slice(0, k));
  let hits = 0;
  for (const id of relevant) if (top.has(id)) hits++;
  return hits / relevant.length;
}

export function precisionAtK(retrieved: ReadonlyArray<string>, relevant: ReadonlyArray<string>, k: number): number {
  if (k <= 0) return 0;
  const rel = new Set(relevant);
  let hits = 0;
  for (const id of retrieved.slice(0, k)) if (rel.has(id)) hits++;
  return hits / k;
}

export function hitAtK(retrieved: ReadonlyArray<string>, relevant: ReadonlyArray<string>, k: number): boolean {
  const rel = new Set(relevant);
  return retrieved.slice(0, k).some((id) => rel.has(id));
}

/** 1 / rank of the first relevant id, 0 if none retrieved. */
export function reciprocalRank(retrieved: ReadonlyArray<string>, relevant: ReadonlyArray<string>): number {
  const rel = new Set(relevant);
  const idx = retrieved.findIndex((id) => rel.has(id));
  return idx === -1 ? 0 : 1 / (idx + 1);
}

export function mean(values: ReadonlyArray<number>): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}
