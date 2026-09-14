# Corella Bank support corpus

Corella Bank is a fictional Australian neobank invented for this evaluation suite. It does not exist. Every product name, policy, fee, limit, interest rate, timeframe, phone number and customer in this folder is made up for testing a retrieval and question answering pipeline. Nothing here describes any real authorised deposit-taking institution, and nothing here should be relied on for any financial decision.

The name was checked against the Australian register of authorised deposit-taking institutions and a web search on 14 September 2026 and matched nothing.

## Layout

Each file is one support topic. The first line is a level one title, followed by an optional overview paragraph and then level two sections. Each level two section is one retrieval chunk with the id `<file-slug>#<heading-slug>`. The overview paragraph, where present, is `<file-slug>#overview`.

`FACTS.md` is the ledger of every concrete fact and the chunk it lives in. Keep it in step with the documents when editing them, because the retrieval labels in `evals/data/retrieval-labels.yaml` point at these chunk ids.

## Deliberately absent

The corpus says nothing about home loans, business accounts, term deposits, cryptocurrency, share trading or credit cards. Questions on those topics are out of corpus by design and the assistant is expected to say it cannot help rather than invent an answer.
