# Trace Codex evaluation

## Baseline

`before.json` records four Codex runs on commit `cbcf937135585c072846026ea7cacbcedf74182` with `codex-cli 0.162.0` and `gpt-5.6-sol`.
The first seeded run changed AC-9 from source priority P2 to P1, failing five arithmetic checks and making the seeded repetitions unstable.
Coverage arithmetic passed 151/156 checks; classification, gate decisions, citations, and oracle resolution passed in all four runs.
The baseline runner deleted its workspaces.
`before-retention.json` pins recovered summaries and matrices to their digests; prompts and agent streams were unavailable.
The `seeded-codex-source-priority-drift` replay case preserves the failing output for scorer checks.

## Skill changes and evaluation

Trace now records source criterion identities and priorities in a ledger, preserves them through mapping, and checks the matrix against the ledger before scoring coverage.
Mapping instructions require explicit assertion anchors so repeated runs produce stable evidence.

`after-attempt-1.json` records four runs at `bcce79b6`.
All accuracy groups passed, and seeded arithmetic passed 80/80 checks.
The clean runs were unstable because their evidence anchor counts differed, so the aggregate exited 1.
That measured failure prompted the assertion-anchor update.

`after-attempt-2.json` records four runs at `f4045e99` with the same fixtures, model, repetitions, expectations, and thresholds.
All measured accuracy groups passed at 100%, arithmetic passed 156/156 checks, and both fixtures were stable.
The archive retains each staged workspace, prompt, observation, nonempty stream, and invocation result with per-file hashes.
This result measures the mapping skill on this corpus; it predates the later CLI checks for source-ledger and live-evidence integrity.

`after-final.json` records four runs at `3af76c5a` after the CLI and review fixes.
Both seeded runs produced the expected FAIL gate, and both clean runs produced PASS.
Every measured threshold passed at 100%, with stable results across both fixtures.

## Public CLI captures

The `bcce79b6` public runs used `tea-trace --agent codex` on the seeded and clean fixtures.
The seeded run exited 1 with FAIL, and the clean run exited 0 with PASS.
Each had one repetition, so these runs do not measure stability.
The diagnostic harness scored 11/12 run-metadata checks per case because it expects relative matrix links and the public CLI publishes absolute links.

Later public captures at `8ee3aa5c` and `7eabcf92` preserve seeded FAIL/1 and clean PASS/0 results.
Their manifests pin every retained file and the compressed archives.
Raw Codex stderr streams and empty files are omitted; the prompts, observations, results, and trace artifacts remain.
