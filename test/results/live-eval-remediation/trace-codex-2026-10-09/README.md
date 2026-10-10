# Trace Codex evaluation

## Baseline

`before.json` records four live Codex runs: two seeded tenant-export runs and two clean voucher runs. The runner used `codex-cli 0.162.0` and `gpt-5.6-sol` against commit `cbcf937135585c072846026ea7cacbcedf74182d`. The result records `dirty: true`; that provenance is preserved.

Criterion classification, gate decisions, evidence citations, and oracle resolution passed in all four runs. Coverage arithmetic passed 151 of 156 checks. The first seeded run changed AC-9 from the source document's P2 priority to P1. That changed five priority-bucket calculations and made the seeded repetitions unstable. The second seeded run and both clean runs passed their arithmetic checks. There were zero invented criteria, duplicate criteria, clean false positives, incomplete runs, or fixture mutations.

The baseline harness deleted its temporary workspaces. A read-only external capture recovered the final summary and matrix from each repetition. `before-retention.json` records the evidence digest and raw byte SHA-256 of each recovered file. Every summary and matrix matches the corresponding digest in the harness result. Prompts and agent streams were unavailable for this baseline.

The first seeded output is also preserved as the `seeded-codex-source-priority-drift` replay case. Its expected result retains the five arithmetic failures. Running that replay checks the scorer against captured output.

## Repair and verification

Trace now records each source criterion's identity and priority in a ledger during context loading. Mapping preserves those priorities, and analysis checks the matrix against the ledger before calculating coverage. The checklist also follows the deterministic gate rules in Step 5. Gate-eligible runs must write the gate JSON consumed by `tea-trace`.

The after evaluation uses the same fixtures, model, repetitions, scoring expectations, and thresholds. Its `--artifacts-dir` option preserves each attempt's project, prompt, tagged agent observation, stdout, stderr, and available fault details. The result and artifact provenance will identify the exact source commit evaluated.

These runs use TEA's existing diagnostic harness and independent fixture expectations. Their scores describe this corpus. They provide no sealed eval-quality acceptance decision.
