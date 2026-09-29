# Development evaluation gap report

## Diagnosis and before evidence

The supplied first-stop evidence is `evidence/development-first-stop.json`. P-007 with M-003 stopped in qualification. The mutated `match` step returned `status: findings` and `findings: ["missing-assertion"]` for `cases/clean-assert-match.test.js`. O-003 resolved true and held because its `any` branch accepted that response. The separate `evidence/w1-gameability.json` shows P-009's always-flag response taking the same O-003 allowance. The supplied `evidence/w2-coverage.json` names the first unsatisfied discipline rule as critical `malformed-input`, with `satisfied: false`.

## Authored repair

O-003 now requires the full `match` stdout object to equal `{ "file": "cases/clean-assert-match.test.js", "status": "clean", "findings": [] }`. This makes the valid assertion a strict clean control for both P-007 and P-009.

The `wrong-file-type` interaction plan step now binds `stdin.file` to numeric literal `42` while the operation declares its type as `string`. O-004 checks exit code zero and the complete structured error object for that step. The contract declares `action` and `file` as required stdin keys. P-018 and M-009 add a controlled type-guard mutation: a numeric file reaches path resolution and returns `cannot read test file`; the clean target returns the request-shape error. P-018 qualified, including restored digest and baseline rerun.

The authored and compiled contracts both contain this typed mismatch and the O-004 check. Compiler experiments showed that a direct `type-violating` input-binding property is rejected by the installed schema. These experiments did not alter the final authored binding.

## After development outcome

Final development run: `20260929T042912394Z-58dfda95`. Score invocation: `20260929T042952889Z-e93cfbe1`. `tea-evaluate run` and `tea-evaluate score` exited 0. All 13 scored probes received an eval-quality exit 0. P-007, P-009, and P-018 were qualified and caught in 3 of 3 valid trials each. Their per-probe class components each report `caught: 1`, `exercised: 1`, `rate: 1` for their own class. This is a per-probe measurement.

The final evidence still reports `contractVerdict: CONCERNS` and critical `malformed-input` coverage with `satisfied: false`. The remaining rule is open. The engine did not explain which part of `malformed-input-satisfaction` failed beyond that boolean. A caught malformed-input probe and an addressed typed step did not satisfy its contract-level predicate in this run. No held-out partition was run.

The final `interpretation.json` places the first material finding for P-007 and P-009 at trial-1 sequence 4, `review`, `outcome`, observation `trial-1-strict`; P-018's is trial-1 sequence 8, `trial-1-empty`. Those are the earliest citations in each whole-oracle finding. The changed observations that distinguish the seeded faults are `match` for P-007 and P-009, and `wrong-file-type` for P-018.

## Evidence paths

- `evidence/development-first-stop.json`
- `evidence/w1-gameability.json`
- `evidence/w2-coverage.json`
- `evaluation/runs/20260929T042912394Z-58dfda95/interpretation.json`
- `evaluation/runs/20260929T042912394Z-58dfda95/scores/20260929T042952889Z-e93cfbe1/P-007/evidence-artifact.json`
- `evaluation/runs/20260929T042912394Z-58dfda95/scores/20260929T042952889Z-e93cfbe1/P-009/evidence-artifact.json`
- `evaluation/runs/20260929T042912394Z-58dfda95/scores/20260929T042952889Z-e93cfbe1/P-018/evidence-artifact.json`
