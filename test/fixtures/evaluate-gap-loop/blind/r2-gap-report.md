# Development gap report

## Diagnosis and before evidence

The first development stop was qualification of P-007 under M-003. The recorded `mutated-fail` observation reported `missing-assertion` for `cases/clean-assert-match.test.js`, but O-003 resolved true and held. O-003 accepted either a clean response or that exact false positive for the `match` step. The separate P-009 gameability diagnostic showed the same response and O-003 again resolved true. This admitted an always-flag answer.

The supplied engine coverage summary reported one unsatisfied rule: `malformed-input`, severity `critical`, relevance predicate `malformed-input-relevance`, satisfaction predicate `malformed-input-satisfaction`.

## Changes

O-003 now requires the complete clean JSON response for `assert.match`. O-004 now checks the complete error JSON body for every invalid request and unreadable-file step. P-018 and M-009 exercise a non-string `file` request whose weakened guard returns the wrong error. P-019 and M-010 exercise raw invalid JSON whose mutated parse-error handler returns a clean review. The CLI stdin declaration and interaction bindings now use raw request bytes so the text manifestation witness for P-019 is admissible. Existing seeded and gameability probe signatures were aligned with those bindings. The target and intake answers were not edited.

## Development outcomes

The first completed run after the O-003 repair was `20260929T035801825Z-b5cb51ff`, scored by `20260929T035839151Z-e5c0085e`. P-007 and P-009 qualified and each caught all 3 valid trials. Every probe score exited 0. Each evidence artifact still reported `CONCERNS` with only `malformed-input` coverage unsatisfied.

The latest completed development run was `20260929T041030384Z-f42b06f1`, scored by `20260929T041118138Z-95557dd4`. All 14 probes qualified, all score calls exited 0, and seeded defects P-005 through P-008 plus P-018 and P-019 each caught 3 of 3 trials. Gameability probes P-009 and P-017 each caught 3 of 3 trials. Six clean controls passed all 3 trials. Each scored artifact still reports `CONCERNS` with the sole `malformed-input` gap, `critical`, `satisfied: false`. The P-019 artifact reports a per-probe defect strength component of 1 caught out of 1 exercised; this is not a class-wide rate.

The coverage predicate remains unsatisfied despite malformed JSON, wrong-type input, complete error-body checks, and seeded faults that the oracle catches. The redacted coverage summary provides no more specific condition. This is an open gap, and no PASS or run-wide strength claim is supported. No held-out partition was run.

## Intermediate diagnostics

P-019 initially failed preflight because a text stdin witness was not admissible when the operation declared no required stdin key. After raw stdin wiring, preflight reported `seeded-faults-scoped` failed because the P-019 manifestation relation also matched the clean `witness-clean` leg. The final relation checks the unique mutated full response, and the latest run passed preflight.

The development runs and scores in `evaluation/runs/` retain the qualifying traces, preflight verdicts, score records, evidence artifacts, and interpretation files. No target, intake, held-out probe, or held-out record was changed or opened.

## Authored files changed

- `evaluation/contract.json`, `evaluation/compiled-contract.json`, `evaluation/sealed-brief.json`, `evaluation/corpus-index.json`
- `evaluation/probes/P-005.probe.json`, `P-006.probe.json`, `P-007.probe.json`, `P-008.probe.json`, `P-009.probe.json`, `P-017.probe.json`, `P-018.probe.json`, `P-019.probe.json`
- `evaluation/mutations/M-009.mutation.json`, `M-010.mutation.json`

The existing P-005 through P-009 and P-017 probe changes align their manifestation witnesses and signatures with the raw stdin declaration. `evaluation.json` and the other existing probe files were serialized during the experiment, with no intended semantic change. Generated run artifacts are retained under `evaluation/runs/`.
