# Results log

One row per recorded run, appended by `bun scripts/summarise-results.ts <results.json> --sha <sha> --tier <smoke|full>`.
The nightly workflow appends a `full` row automatically; local rows are added by hand when worth keeping.
Full per-case outputs live in the GitHub Actions artifacts, not in git; only these summaries and
`results/summary-*.json` are committed.

Column notes:

- **pass** counts cases whose every weighted assertion passed. Grounded, tool and guardrail cases tagged `known_failure: true` still count as failures here. Retrieval known-failure rows carry a weight-0 recall assertion, so they count as passes and the miss shows in **recall@6** instead; this is why the retrieval column can read 100% while recall@6 is below 1. All known failures are listed in the README so they are never quietly dropped.
- **recall@6** and **MRR** are the means of the named retrieval metrics over the retrieval category, BM25 over the committed corpus, so they are deterministic. The embedding and hybrid rows in the baseline table come from the committed vector cache in `evals/data/embeddings.json` and are equally deterministic. They are read from each assertion's raw component score, because promptfoo scales `namedScores` by assertion weight and the known-failure rows carry a weight-0 recall assertion (fixed 2026-09-14; BM25 rows are unaffected because those rows scored 0 under BM25 anyway).
- **catch / false-positive** is the guardrail catch rate over attack rows and the share of benign lookalike rows that a guard blocked.
- **cost USD** is the sum OpenRouter reported for the system under test on this run; judge cost is not included.
- **mean latency** is over answer-mode cases only and is meaningful only for `full` runs, which disable the cache.

## Retrieval baseline (no LLM involved)

| date | retriever | chunks | queries | recall@6 | MRR | easy | paraphrase | distractor |
|---|---|---|---|---|---|---|---|---|
| 2026-09-14 | bm25 (k1 1.2, b 0.75, minScore 0) | 124 | 44 | 0.955 | 0.890 | 1.000 | 0.938 | 0.917 |
| 2026-09-14 | bm25, same settings, 3 phrasings added from full-run triage (ret-045 to ret-047) | 124 | 47 | 0.894 | 0.833 | 1.000 | 0.789 | 0.917 |
| 2026-09-14 | embedding (gemini-embedding-001 via OpenRouter, 768d, cosine, minScore 0) | 124 | 47 | 0.968 | 0.929 | 0.969 | 0.947 | 1.000 |
| 2026-09-14 | hybrid (reciprocal rank fusion k 60, depth 20, over bm25 + embedding) | 124 | 47 | 0.957 | 0.885 | 1.000 | 0.895 | 1.000 |
| 2026-09-14 | bm25, same settings, ret-048 added from the embedding-retriever full run (gr-031) | 124 | 48 | 0.896 | 0.826 | 1.000 | 0.800 | 0.917 |
| 2026-09-14 | embedding, same settings, 48 queries | 124 | 48 | 0.948 | 0.910 | 0.969 | 0.900 | 1.000 |
| 2026-09-14 | hybrid, same settings, 48 queries | 124 | 48 | 0.958 | 0.870 | 1.000 | 0.900 | 1.000 |

## Runs

| date | sha | tier | pass | grounded | retrieval | tools | guardrails | abstention | budget | recall@6 | MRR | catch / false-positive | cost USD | mean latency | SUT | judge |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-09-14 | local | smoke | 70/70 (100%) | 100% (10/10) | 100% (44/44) | 100% (4/4) | 100% (8/8) | 100% (4/4) | n/a | 0.95 | 0.89 | 100% / 0% | $0.009 | 1495 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
| 2026-09-14 | local | full | 135/142 (95%) | 84% (32/38) | 100% (47/47) | 100% (15/15) | 95% (21/22) | 100% (12/12) | 100% (8/8) | 0.89 | 0.83 | 95% / 0% | $0.038 | 1651 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
| 2026-09-14 | 791eed0 | full | 138/142 (97%) | 92% (35/38) | 100% (47/47) | 100% (15/15) | 95% (21/22) | 100% (12/12) | 100% (8/8) | 0.89 | 0.83 | 95% / 0% | $0.038 | 698 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
| 2026-09-14 | 49de9af | full | 138/142 (97%) | 92% (35/38) | 100% (47/47) | 100% (15/15) | 95% (21/22) | 100% (12/12) | 100% (8/8) | 0.89 | 0.83 | 95% / 0% | $0.038 | 818 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
| 2026-09-14 | e8b6280 | full | 138/142 (97%) | 95% (36/38) | 98% (46/47) | 100% (15/15) | 95% (21/22) | 100% (12/12) | 100% (8/8) | 0.97 | 0.93 | 95% / 0% | $0.038 | 1743 ms | google/gemini-2.5-flash (embedding retriever) | openrouter:anthropic/claude-sonnet-5 |
| 2026-09-14 | dee174c | full | 138/143 (97%) | 89% (34/38) | 100% (48/48) | 100% (15/15) | 95% (21/22) | 100% (12/12) | 100% (8/8) | 0.90 | 0.83 | 95% / 0% | $0.038 | 892 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
| 2026-09-14 | 339ec05 | full | 138/143 (97%) | 89% (34/38) | 100% (48/48) | 100% (15/15) | 95% (21/22) | 100% (12/12) | 100% (8/8) | 0.90 | 0.83 | 95% / 0% | $0.038 | 994 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
| 2026-09-15 | f343384 | full | 139/143 (97%) | 92% (35/38) | 100% (48/48) | 100% (15/15) | 95% (21/22) | 100% (12/12) | 100% (8/8) | 0.90 | 0.83 | 95% / 0% | $0.038 | 849 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
| 2026-09-16 | 86b1af2 | full | 138/143 (97%) | 89% (34/38) | 100% (48/48) | 100% (15/15) | 95% (21/22) | 100% (12/12) | 100% (8/8) | 0.90 | 0.83 | 95% / 0% | $0.038 | 975 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
| 2026-09-17 | 012f1ea | full | 138/143 (97%) | 89% (34/38) | 100% (48/48) | 100% (15/15) | 95% (21/22) | 100% (12/12) | 100% (8/8) | 0.90 | 0.83 | 95% / 0% | $0.038 | 1068 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
| 2026-09-18 | d37889a | full | 139/143 (97%) | 92% (35/38) | 100% (48/48) | 100% (15/15) | 95% (21/22) | 100% (12/12) | 100% (8/8) | 0.90 | 0.83 | 95% / 0% | $0.038 | 780 ms | google/gemini-2.5-flash | openrouter:anthropic/claude-sonnet-5 |
