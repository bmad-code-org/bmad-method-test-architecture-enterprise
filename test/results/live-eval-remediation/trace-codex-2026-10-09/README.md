# Trace Codex evaluation

## Baseline

`before.json` records four live Codex runs: two seeded tenant-export runs and two clean API-token lifecycle runs. The runner used `codex-cli 0.162.0` and `gpt-5.6-sol` against commit `cbcf937135585c072846026ea7cacbcedf74182d`. The result records `dirty: true`; that provenance is preserved.

Criterion classification, gate decisions, evidence citations, and oracle resolution passed in all four runs. Coverage arithmetic passed 151 of 156 checks. The first seeded run changed AC-9 from the source document's P2 priority to P1. That changed five priority-bucket calculations and made the seeded repetitions unstable. The second seeded run and both clean runs passed their arithmetic checks. There were zero invented criteria, duplicate criteria, clean false positives, incomplete runs, or fixture mutations.

The baseline harness deleted its temporary workspaces. A read-only external capture recovered the final summary and matrix from each repetition. `before-retention.json` records the evidence digest and raw byte SHA-256 of each recovered file. Every summary and matrix matches the corresponding digest in the harness result. Prompts and agent streams were unavailable for this baseline.

The first seeded output is also preserved as the `seeded-codex-source-priority-drift` replay case. Its expected result retains the five arithmetic failures. Running that replay checks the scorer against captured output.

## Repair and verification

Trace now records each source criterion's identity and priority in a ledger during context loading. Mapping preserves those priorities, and analysis checks the matrix against the ledger before calculating coverage. The checklist also follows the deterministic gate rules in Step 5. Gate-eligible runs must write the gate JSON consumed by `tea-trace`.

The after evaluation uses the same fixtures, model, repetitions, scoring expectations, and thresholds. Its `--artifacts-dir` option preserves each attempt's project, prompt, tagged agent observation, stdout, stderr, and available fault details. The result and artifact provenance will identify the exact source commit evaluated.

These runs use TEA's existing diagnostic harness and independent fixture expectations. Their scores describe this corpus. They provide no sealed eval-quality acceptance decision.

## Public command integration

The two public archives retain actual `tea-trace --agent codex` invocations against the same seeded and clean fixtures at commit `bcce79b6ff24d311bc95c81e679abb4d50aefc23`, with adapter default `gpt-5.6-sol`. The agent workspace excludes ground truth. Each compressed JSON archive stores retained files as base64; its manifest pins the archive and every retained file's bytes. Raw Codex stderr streams and empty files are omitted. The filenames keep Windows checkouts within their path budget.

The seeded invocation exited 1 with FAIL, and the clean invocation exited 0 with PASS. Both preserved source and tests. Criterion classification, gate criteria, arithmetic, oracle metadata, citations, rejected evidence, waiver handling, and live-evidence checks passed. The saved diagnostic score records 11 of 12 run-metadata checks per case: the public command uses an absolute published matrix link, while the diagnostic harness expects its relative staging link. The raw score retains this convention difference. These two integrations provide one repetition each; they do not measure stability.

## First diagnostic after attempt

`after-attempt-1.json` preserves the four-run after attempt at bcce79b6 unchanged. Every measured accuracy group passed at100%, with zero false positives, invented or duplicate criteria, incomplete runs, or source mutations. The seeded repetitions were stable and their arithmetic passed80/80 checks. The clean repetitions used six and fifteen valid evidence anchors, respectively. The harness includes citation counts in its stability signature, so the clean case was unstable and the aggregate exited1. The compressed archive pins all four staged workspaces, prompts, observations, nonempty streams, and invocation output. This attempt is retained as a measured failure. A followup makes assertion anchors explicit in the mapping instructions and repeats the evaluation with the same thresholds.

## Second diagnostic after attempt

`after-attempt-2.json` records four completed runs at f4045e99 with the same model, corpus, repetitions, scoring expectations, and thresholds.
Every measured accuracy group passed at 100%; arithmetic passed 156/156 checks.
Both cases were stable across their repetitions, with zero invented or duplicate criteria, clean false positives, incomplete runs, or fixture mutations.
The archive retains all four staged workspaces, requests, observations, nonempty streams, and invocation output with per-file byte pins.
This measurement preceded the later public-command source-ledger and fresh-live-failure validation repairs.
It supplies diagnostic evidence for the mapping skill at its recorded source commit.
