# Probe mutants

Each file here is a stored correct run output with exactly one edit, the mutated artifact of one controlled-mutation probe.
`tools/generate-probes.js` derives the `replace-exact` operator from the pair (the stored reference and the mutant), performs the cycle of AD-8 in a disposable copy, and cites the mutant as the probe's `mutatedFailEvidence`.
Do not repair or reformat a file here: the generator holds its digest against the cycle's own, and the probe's oracle has to fail on it.

| Directory                           | Reference                                                                     | The edit                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `test-review/<row>/`                | `test/replay/test-review/full-recall/verdict.json`                            | the finding for one planted registry row removed                                                               |
| `trace/<criterion>/`                | `test/replay/trace/seeded-correct-run/` summary                               | the criterion's band and the inventory read as covered, with the gate criteria that read the inventory         |
| `trace/ac-2/`                       | the same                                                                      | also the gate the P0 band decides (PASS, the P0 criteria met) and the recommendation that named AC-2 removed   |
| `nfr/performance/`                  | `test/replay/nfr/gapped-correct-audit/` report                                | the four threshold lines that read UNKNOWN written as invented targets                                         |
| `nfr/reliability/`                  | the same                                                                      | the Gate YAML rolls reliability and the overall status up to CONCERNS                                          |
| `nfr/maintainability/`              | the same                                                                      | the Maintainability Assessment section deleted                                                                 |
| `ci/trigger-weekly-schedule/`       | `test/replay/ci/full-correct-pipeline/.github/workflows/test.yml`             | the `schedule` trigger and its cron removed                                                                    |
| `ci/permission-contents-read/`      | the same                                                                      | the `permissions` block removed                                                                                |
| `ci/template-copied/`               | `test/replay/ci/minimal-correct-pipeline/.github/workflows/test.yml`          | the template's burn-in job appended, with no other job                                                         |

`npm run test:test-review-qualification`, `test:trace-qualification`, `test:nfr-qualification` and `test:ci-qualification` read each twin from the path the generator's probe cites, check that it differs from its reference only as the table says, and check that exactly the intended oracles flip on it, each from held to violated.
