# Results log

One row per recorded run, appended by `bun scripts/summarise-results.ts <results.json> --sha <sha> --tier <smoke|full>`.
The nightly workflow appends a `full` row automatically; local rows are added by hand when worth keeping.
Full per-case outputs live in the GitHub Actions artifacts, not in git; only these summaries and
`results/summary-*.json` are committed.

Column notes:

- **pass** counts cases whose every assertion passed. Cases tagged `known_failure: true` in their metadata still count as failures here; they are listed in the README so they are never quietly dropped.
- **recall@6** and **MRR** are the means of the named retrieval metrics over the retrieval category, BM25 over the committed corpus, so they are deterministic.
- **catch / false-positive** is the guardrail catch rate over attack rows and the share of benign lookalike rows that a guard blocked.
- **cost USD** is the sum OpenRouter reported for the system under test on this run; judge cost is not included.
- **mean latency** is over answer-mode cases only and is meaningful only for `full` runs, which disable the cache.

## Retrieval baseline (no LLM involved)

| date | retriever | chunks | queries | recall@6 | MRR | easy | paraphrase | distractor |
|---|---|---|---|---|---|---|---|---|
| 2026-09-14 | bm25 (k1 1.2, b 0.75, minScore 0) | 124 | 44 | 0.955 | 0.890 | 1.000 | 0.938 | 0.917 |
| 2026-09-14 | bm25, same settings, 3 phrasings added from full-run triage (ret-045 to ret-047) | 124 | 47 | 0.894 | 0.833 | 1.000 | 0.789 | 0.917 |

## Runs

| date | sha | tier | pass | grounded | retrieval | tools | guardrails | abstention | budget | recall@6 | MRR | catch / false-positive | cost USD | mean latency | SUT | judge |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-09-14 | local | smoke | 70/70 (100%) | 100% (10/10) | 100% (44/44) | 100% (4/4) | 100% (8/8) | 100% (4/4) | n/a | 0.95 | 0.89 | 100% / 0% | $0.009 | 1495 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
| 2026-09-14 | local | full | 135/142 (95%) | 84% (32/38) | 100% (47/47) | 100% (15/15) | 95% (21/22) | 100% (12/12) | 100% (8/8) | 0.89 | 0.83 | 95% / 0% | $0.038 | 1651 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
