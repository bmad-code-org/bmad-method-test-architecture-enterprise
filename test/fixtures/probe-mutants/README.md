# Probe mutants

Each file here is a stored correct run output with exactly one edit, the mutated artifact of one controlled-mutation probe.
`tools/generate-probes.js` derives the `replace-exact` operator from the pair (the stored reference and the mutant), performs the cycle of AD-8 in a disposable copy, and cites the mutant as the probe's `mutatedFailEvidence`.
Do not repair or reformat a file here: the generator holds its digest against the cycle's own, and the probe's oracle has to fail on it.

| Directory                    | Reference                                                                 | The edit                                                                            |
| ---------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `test-review/<row>/`         | `test/replay/test-review/full-recall/verdict.json`                        | the finding for one planted registry row removed                                    |
| `trace/<criterion>/`         | `test/replay/trace/seeded-correct-run/` summary                           | the inventory and the priority band of one gap read as covered                      |
| `nfr/reliability/`           | `test/replay/nfr/gapped-correct-audit/` report                            | the Gate YAML rolls reliability and the overall status up to CONCERNS               |

The nfr performance and maintainability mutants, and every ci mutant, are stored replay cases under `test/replay/`, so they are not repeated here.
`npm run test:test-review-qualification`, `test:trace-qualification` and `test:nfr-qualification` check that each mutant differs from its reference only as the table says and that exactly the intended oracle fails on it.
