---
title: 'Story 1.71: Bound a framework version probe with its own timeout'
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '984156e7ba0fbc9eb0ebb50ad3a166cd16c10520'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.71)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.71)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-21)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.70.md'
---

<frozen-after-approval reason="owner delegated Story 1.71 build and merge through the Evaluate relay">

## Intent

**Problem:** A hanging framework version probe inherits the command evaluator's timeout. The run reads the probe repeatedly, so one unreadable dependency can hold the run for the evaluator's full timeout before it fails.

**Approach:** Give each declared probe an optional `probeTimeoutMs` under its `probe` object. Default to 10,000 ms, refuse values outside the integer range 1 to 60,000 at `check`, and launch with the smaller of that value and `evaluator.timeoutMs`. Record the effective bound in `framework-versions.json` and explain its cost in the evaluator guide.

## Boundaries & Constraints

**Always:** Keep the probe on the evaluator's existing launch path with its environment, private working directory and confinement. Apply the same bound to the initial read, every prelaunch and post-trial recheck, and calibration reads. A timeout is an unreadable dependency: `run` exits 12 and seals no affected trial record. An omitted field leaves the tracked declaration bytes and evaluator configuration digest as they were under Story 1.44. Keep the runtime schema and handwritten declaration checks in agreement. Run each acceptance revert once in an isolated copy.

**Never:** Raise `evaluator.timeoutMs`, retry a timed-out probe, run a framework through `cli/`, change eval-quality, or use a live Claude session.

## I/O & Edge-Case Matrix

| Scenario           | Input / State                             | Expected Output / Behavior                                                                  | Error Handling                             |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Legacy declaration | No `probeTimeoutMs`                       | Valid; effective timeout 10,000 ms or evaluator timeout if lower; same configuration digest | None                                       |
| Boundary values    | 1, 60,000, 60,001, zero, fraction, string | First two pass; remaining values fail `check` under `evaluator`                             | Exit 10                                    |
| Hanging probe      | Stub hangs at initial or later read       | Bound named in artifact or fault; no affected sealed record                                 | Exit 12 within bound plus supervisor grace |
| Healthy probe      | Stub reports declared package and version | Same observation and scoring configuration                                                  | None                                       |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/frameworks.js`: validate and retain the optional probe field; calculate the effective timeout and add it to each artifact row.
- `cli/lib/evaluate/schemas/{evaluator-frameworks,framework-versions}.schema.json`: keep both runtime artifact shapes aligned with code.
- `cli/lib/evaluate/check.js::checkFrameworks`: report an invalid bound under `evaluator` while preserving existing shape error rules.
- `cli/lib/evaluate/command-evaluator.js::launchExecutable,observeFrameworks`: pass a probe-specific timeout into the shared supervised launch.
- `cli/lib/evaluate/run.js::frameworkEntries`: all initial, trial and calibration reads share it; update the trial resource ceiling using each effective bound.
- `test/test-evaluate-check.js` and `test/test-evaluate-evaluators.js`: declaration contract, real run timeout, artifact, digest and read-position cases. The `test:evaluate-agents` group runs framework end-to-end cases.
- `src/workflows/testarch/bmad-testarch-evaluate/assets/evaluators/{agentevals,promptfoo}-frameworks.json`, `references/evaluator.md`, and `test/test-evaluate-guidance.js`: templates and exact guide assertions.

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/evaluate/frameworks.js`, its schemas and `check.js`: validate 1..60,000 and record the effective timeout.
- [x] `cli/lib/evaluate/command-evaluator.js` and `run.js`: enforce the bound at every framework read and calculate resource ceilings from it.
- [x] `test/test-evaluate-check.js`, `test/test-evaluate-evaluators.js` and the probe fixture: prove boundary, timed read, legacy digest and artifact behavior, including read-position reversions.
- [x] Evaluate skill templates, guide and `test/test-evaluate-guidance.js`: show the field, default, maximum and total run cost.
- [x] `CHANGELOG.md`, sprint row and this story record: document the delivered behavior and gates.

**Acceptance Criteria:**

- Given a command evaluator's framework declaration, when `check` reads an omitted, minimum, maximum or invalid `probeTimeoutMs`, then valid declarations pass and invalid ones exit 10 under `evaluator`; accepting 60,001 fails the check test.
- Given a hanging probe and a longer evaluator timeout, when `run` reads it initially or during a trial or calibration, then the probe stops at its effective bound, the run exits 12 within that bound plus stated cleanup grace, and no affected record is sealed; reverting the dedicated bound at any read position fails its timed case.
- Given a probe timeout longer than the evaluator timeout, when the probe hangs, then the evaluator's shorter timeout applies and the artifact names it; removing the cap fails the case.
- Given a healthy legacy declaration, when the run observes the package, then its configuration digest matches Story 1.44 and its recorded version is unchanged; adding the default to the digested declaration fails the digest check.
- Given the evaluator guide and two starter declarations, when guidance tests run, then the 10 second default, 60 second maximum, run read counts and field are present; deleting each teaching fails its check.

## Implementation Notes

- `probe.probeTimeoutMs` is optional in the tracked declaration. The runtime retains it only when written, defaults to 10,000 ms at launch, and caps it by `evaluator.timeoutMs`. Every framework read uses `observeFrameworks`, so the same supervised launch, environment, private working directory and confinement apply at the initial, trial and calibration reads. The initial `framework-versions.json` row names `effectiveProbeTimeoutMs`, including when that read times out. A later timeout names its effective bound in the fault.
- The trial resource ceiling sums two effective reads of each framework per trial. The test uses one explicit 25,000 ms bound and one omitted 10,000 ms bound to hold this calculation.
- A probe fault stops later declared probes. The skipped frameworks still receive rows with their effective bounds, null observations and a skip fault, so the initial artifact remains valid and explains the incomplete observation. A timeout fault names `evaluator.timeoutMs` when it caps the probe. The version 1 artifact schema accepts historical rows without the new field, while every current write includes it. The public CLI reference shows the field and both bounds.
- The omitted-field timed case uses a 30,000 ms evaluator bound against the 10,000 ms default probe bound. Its 19,000 ms assertion fails if a probe inherits the evaluator bound. The evaluator guide gives the total budget as each framework's effective bound times its initial, trial and calibration read count, summed across frameworks.
- A healthy declaration with no new field retained the Story 1.44 configuration digest `sha256:13d3e8c6a106d3dc802b2d2e57b39e8e4c149e31cfbdb0981eb163fcd081d4a2`. The same fixture produced that digest with Story 1.44's source in an isolated copy. This was the Story 1.71 baseline; Story 1.50 updates the integration-test pin for engine 6.0.
- Codex-equivalent workflow-builder Edit: read the installed builder at `/Users/murat/opensource/.agents/skills/bmad-workflow-builder/SKILL.md`, its Build Process, prompt canon, quality principles, standard fields, workflow patterns, working-state patterns, complexity patterns and customization guide; read Evaluate's existing append-only memlog and resolved its `workflow` customization (empty hooks, facts, build standards and eval requirement). Inspected the evaluator guide's framework declaration section and both starter declarations, edited those three files, and appended the Story 1.71 direction through `_bmad/scripts/memlog.py`. The guide stays in the existing evaluator stage, and `SKILL.md` remains 1,927 tokens against the builder's 2,000 desired and 3,000 budget. `test:evaluate-guidance`, `test:install`, `test:evaluate-boundaries` and `test:direction` checked the authored behavior, package layout, boundary and imports.
- Codex-equivalent workflow-builder Analyze: ran `quick_validate.py` (pass), `prepass-prompt-metrics.py` (1,927 `SKILL.md` tokens), `prepass-workflow-integrity.py` (pass, zero issues), `scan-path-standards.py` (exit 1, 111 high findings), and `scan-scripts.py` (pass, no skill scripts). The path scan counted 102 findings in older ignored `.analysis/` outputs, four in the required ignored `.memlog.md`, and five in unchanged active text (`SKILL.md`, `adapters.md`, `harness.md`, `run.md`). None points to the three Story 1.71 skill edits; the existing path scanner baseline remains open. Reviewed the delta under the builder's leanness, architecture, determinism, customization and enhancement lens specifications: each returned no new finding. The renderer produced an excellent delta report with zero critical, high, medium or low findings at `src/workflows/testarch/bmad-testarch-evaluate/.analysis/2026-10-02-story-1-71/skill-analysis-report.html`, with its JSON, prepasses, scanners and Markdown twin in the same run folder. The report covers the Story 1.71 delta; the raw path scan records the inherited lint result.

## Spec Change Log

## Review Triage Log

| Round 1 finding                                                 | Verdict and evidence                                                                                                                                                                                                                                                                                | Route                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Blind: later framework probes run after a timeout               | Medium. `observeFrameworks` keeps iterating after a fault, so two hanging packages take two bounds and contradict the guide's first-unreadable-read claim.                                                                                                                                          | Patch                    |
| Blind: scratch setup and cleanup sit outside the process timer  | Low. `launchExecutable` creates and removes scratch outside `runSupervised`; the 9,000 ms test allowance covers the supervisor and local setup. A filesystem stall beyond it is possible but has no demonstrated normal-use case, and timing all synchronous filesystem calls needs a wider design. | Reject                   |
| Blind: trial ceiling excludes supervisor and scratch overhead   | False. `maxWallClockMinutes` is the declared sum of operation budgets; no runtime or scorer check treats it as the measured elapsed time. The previous formula also excluded process setup.                                                                                                         | Reject                   |
| Blind: timeout diagnostic hides the evaluator cap               | Low. The fault states the effective value but does not say which setting capped it. A short suffix gives the adopter the relevant setting.                                                                                                                                                          | Patch                    |
| Blind: public CLI reference still teaches the evaluator timeout | Medium. `docs/reference/tea-evaluate-cli.md` says the probe runs under `timeoutMs` and omits the new declaration field.                                                                                                                                                                             | Patch                    |
| Blind: schema version 1 rejects old version 1 artifacts         | Medium. The artifact schema now requires `effectiveProbeTimeoutMs`; an old `framework-versions.json` with schemaVersion 1 fails it. Keep the field optional in validation while new writes include it.                                                                                              | Patch                    |
| Blind: 9,000 ms timing allowance is too broad                   | False. It is the stated startup and cleanup allowance; a run inside that bound satisfies the timed acceptance check. The revert to the evaluator timeout fails it.                                                                                                                                  | Reject                   |
| Blind: omitted timeout has no hanging runtime case              | Medium. The healthy legacy case checks the digest and recorded bound, but a hanging omitted-field declaration has no timed launch assertion.                                                                                                                                                        | Patch                    |
| Blind: initial timeout artifact diagnostics are not asserted    | Low. The initial case checks its bound but leaves `observed`, `fault` and output unexamined.                                                                                                                                                                                                        | Patch                    |
| Edge: later probes run after an earlier fault                   | Medium. Same defect as the first blind finding, confirmed in `observeFrameworks`.                                                                                                                                                                                                                   | Patch with first finding |
| Edge: `hang` with `--flip-at` and no counter changed behavior   | False. The baseline fixture already entered the `flipAt > 0` counter branch and failed without `--counter`, before its hang statement.                                                                                                                                                              | Reject                   |
| Verification: no successful capped-ceiling case                 | Medium. The ceiling test uses only bounds below the evaluator timeout; the hanging cap test ends before a manifest exists. An incorrect declared-bound sum can pass both.                                                                                                                           | Patch                    |

Round 2 review tightened the omitted-field timing case: its old 15,000 ms evaluator timeout could fit inside the 10,000 ms probe bound plus 9,000 ms allowance. The case now sets the evaluator timeout to 30,000 ms. The guide and exact guidance marker now multiply each effective bound by the initial, trial and calibration reads before summing across frameworks.

| Round 2 finding                                                                   | Verdict and evidence                                                                                                                                                                                        | Route |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Verification: omitted-field timing case could pass a wrong evaluator-bound launch | Medium. A 15,000 ms launch fit inside the old 19,000 ms allowance while diagnostic and artifact assertions could still report 10,000 ms. The evaluator bound is now 30,000 ms, which misses that allowance. | Patch |
| Verification: total probe cost wording could imply one bound per framework        | Low. A framework is read once initially and twice per trial and calibration launch, so its effective bound contributes for every read. The guide and marker now state the multiplication and sum.           | Patch |

## Verification

- `npm run test:evaluate-check`: 1,053 checks passed before the review patch. `npm run test:evaluate-guidance`: passed before the review patch. `npm run test:evaluate-agents`: 367 checks passed before the review patch. The review patch's end-to-end red run failed 9 of 46 checks, confirming the second probe launch, missing cap hint, historical schema rejection and stale public reference. After the patch, `node test/test-evaluate-evaluators.js --probe-timeouts-only` passed 46 checks, `--probe-ceiling-only` passed 5 checks and `--frameworks-only` passed 124 checks.
- The round 2 focused run `node test/test-evaluate-evaluators.js --probe-timeouts-only '--only=omitted field'` passed 15 checks. `npm run test:evaluate-guidance` passed with the multiplied total budget marker.
- `npm run test:evaluate-boundaries`: 442 checks passed. `npm run test:direction`: 301 files scanned, zero violations. `npm run test:install`: 977 checks passed in the local sequential gate before it was stopped. `npm run lint`, `npm run lint:md` and `npm run format:check` passed before the final story and test assertions; they will rerun with the final gate.
- Acceptance reverts ran in isolated copies of the project with the repository's existing `node_modules` linked into each copy. Removing the 60,000 ms maximum made `check` accept 60,001 and the boundary case failed. Reverting the dedicated launch bound made all six read-position cases fail; the initial hang took 18,381 ms against a 450 ms bound. Removing only the evaluator cap made its probe run for 63,280 ms against the required 3,000 ms cap. Adding the default field to the legacy tracked declaration moved its configuration digest to `sha256:3a7cc5123385693900c65709e357dcc137edfd970392373772f20ecfd5d7a158`, and the pinned digest test failed. Removing the guide's default, maximum and read-count statements one at a time made `test:evaluate-guidance` fail on their exact markers.
- The sequential local `npm test` was stopped after it passed the installation, guidance, authoring, gap-loop and check stages. The subsequent full local `npm test` exited 0 after all suites and lint and format gates; it included 494 evaluator checks, 389 agent-target checks and the 10,000 ms omitted-field hang. The macOS confinement audit retried one missing kernel log observation under its documented lossy-report rule, then passed all 717 checks. `npm run docs:validate-links`, `npm run docs:build`, `npm run lint:md` and `npm run format:check` passed on the final implementation before this record update. Round 2 runtime review found no further defect; the two verification and wording findings above were fixed.

**Commands:**

- `npm run test:evaluate-check` and `npm run test:evaluate-agents` for contract and end-to-end reads.
- `npm run test:evaluate-guidance` for guide and starter behavior.
- `npm test` for the full gate; `npm run docs:validate-links` and `npm run docs:build` if public docs change.
