# Development gap report

## Diagnosis and before evidence

The supplied development run stopped during P-007 qualification. `evidence/development-first-stop.json` records the mutated `assert.match` case returning `{"status":"findings","findings":["missing-assertion"]}` while O-003 resolved `true` and held. O-003 admitted that erroneous whole stdout alongside the clean stdout for the same valid assertion. The earlier invocation ID was not supplied.

`evidence/w1-gameability.json` shows the same oracle holding for P-009's always-flag response. The provided diagnostic marks its disciplined-oracle-rejected phase as held. `evidence/w2-coverage.json` identifies `malformed-input` as the first unsatisfied critical coverage rule. The original contract used a literal raw string for the wrong-file-type step, so its plan lacked a `type-violating` binding on a declared request key.

## Repair

In `evaluation/contract.json`, O-003 now requires the exact clean stdout for the valid `assert.match` case. The original `wrong-file-type` step keeps its raw JSON stdin. A distinct `typed-file` step binds the declared `file` request key with the `type-violating` matcher and a literal `action`. O-004 now checks the error response and exit code for both steps. Both gameability response maps include the typed step. I regenerated `corpus-index.json`, `compiled-contract.json`, and `sealed-brief.json`.

## After development outcome

An intermediate development invocation, `20260929T043419685Z-5d865dcf`, and score invocation, `20260929T043457320Z-94f603cf`, exited 0. After the separate typed step was added, final development invocation `20260929T043819597Z-66d1b7ae` completed with exit 0. All 12 probes qualified, including P-007 and P-009. Final score invocation `20260929T043858881Z-20778eea` exited 0. Every probe's evidence artifact reports `contractVerdict: PASS` and `coverageGaps: []`; the preflight checks are satisfied.

P-007 and P-009 each caught 3 of 3 valid trials. Their individual defect and gameability components, respectively, are `caught: 1`, `exercised: 1`, `rate: 1`. P-005, P-006, P-008, and P-017 also caught 3 of 3. P-001 through P-004, P-014, and P-016 passed as clean controls in all three trials. The first material error recorded for P-007 and P-009 is F-001 at sequence 4, `review` outcome phase. That citation is the first observation in O-003's grouped check; the decisive mismatch is the `match` stdout at sequence 5.

The final clean trial records the raw `wrong-file-type` request as text `{"action":"review","file":42}` and the `typed-file` request as parsed JSON with `action: "review"` and numeric `file: 42`. Both receive the documented error. The score artifacts report no remaining coverage gaps, including the previously unsatisfied malformed-input rule. These are per-probe scores; the run provides no class-wide strength rate. Only the development partition was run and scored. Target files and `target/intake-answers.md` remained frozen.

## Files changed

Authored: `evaluation/contract.json`, `evaluation/corpus/gameability/P-009.json`, `evaluation/corpus/gameability/P-017.json`, `gap-report.md`, `session-transcript.md`.

Generated: `evaluation/corpus-index.json`, `evaluation/compiled-contract.json`, `evaluation/sealed-brief.json`, and the retained `evaluation/runs/20260929T043419685Z-5d865dcf/` and `evaluation/runs/20260929T043819597Z-66d1b7ae/` trees. Each tree contains 153 generated files.

## Changed files

- `evaluation/compiled-contract.json`
- `evaluation/contract.json`
- `evaluation/corpus-index.json`
- `evaluation/corpus/gameability/P-009.json`
- `evaluation/corpus/gameability/P-017.json`
- `evaluation/sealed-brief.json`
