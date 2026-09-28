# Gaps

Read the scored evidence artifact for CONCERNS, FAIL, Invalid or a weak strength vector. Name the first unsatisfied engine rule, failed preflight check, missing evidence, or loose oracle. For a `score` exit 3 with no evidence artifact, read the persisted `runs/<invocationId>/scores/<scoreInvocationId>/<probeId>/score.json` record and its stdout and stderr diagnostics. Treat the exit as a routing fact and read engine evidence for the quality judgment. Read `interpretation.json` for citations and phase; eval-quality remains the only verdict and strength authority.

## Read the strength vector

The vector's denominator is unique qualified probe IDs per class, after each probe's trials are reduced. The current `tea-evaluate score` invokes eval-quality once per probe, so one evidence artifact reports only that probe's class component in `defect`, `gameability` or `zero-action`. `caughtCount / validCount > catchThreshold` alone decides whether that probe is caught. Separately, fewer completed trials than `minimumTrialCount` make its strength non-comparable. A `null` class in one artifact means that artifact did not score a probe of that class; inspect the other artifacts before calling the class uncovered. A class object with `rate: null` means its admitted probe was not exercised. Clean controls and canaries test false positives and viability; they never enter the vector. One `caught` defect proves only that one detection, not a strong contract. Example: a qualified defect probe catches two of five valid trials at `catchThreshold: 0.5`. The strict rule misses that probe; inspect its three uncaught trial observations, tighten the oracle and rerun development. The artifact's defect component describes that probe alone. The current run emits no class-wide catch rate across probes.

## Read a loose oracle

A gameability probe gives a degenerate answer such as "always decline" or a success keyword with no required action. If it fails qualification or does not resolve `caught`, read the oracle's evidence pointers and check tree. Example: an oracle that looks only for "declined" in stdout will accept a refusal for every request. Add a clean control requiring a legitimate approval and an oracle condition that observes the actual reservation decision and tool call. Requalify the gameability probe and rescore; never manufacture a catch in TeA.

## Separate process from outcome

In `interpretation.json`, `process` and `outcome` list findings by the operation phases captured at run time. `firstMaterialError` names the lowest-sequence cited observation of a `material` or `critical` finding, with its operation and phase. Example: a bad validation response at sequence 3 precedes an incorrect final reservation at sequence 7. Repair the validation probe or oracle at sequence 3, then verify both observations after rerun. The interpretation copies engine outcomes and traces citations; it does not score claims or semantic checkpoints. A judgment checkpoint belongs in an anchored rubric criterion judged by a calibrated judge.

## Read held-out results

Read held-out results only from `gap-view.json`, whose held-out rows expose probe ID, class and the engine's reduced outcome object. Example: a row with `probeId: "P-021"`, `probeClass: "defect"` and `outcome.caught: false` means author a new development defect probe and inspect its oracle. Read `outcome.trialVotes` for the individual outcome states and `validCount` and `caughtCount` for the reduction. Keep held-out inputs and records closed. Run the held-out partition only after the adopter reviews development evidence and confirms readiness; do not tune directly to a held-out answer.

## Map engine outcomes to repairs

Use the exact `OUTCOME_STATES` vocabulary from the installed eval-quality package. Each remedy names what to author or inspect; confirm the actual cause in the evidence artifact.

| Outcome state          | Concrete repair                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `caught`               | Keep the seeded probe and its cited oracle evidence; inspect other class trials before claiming strength. |
| `confirmed`            | Keep the historical probe's fail-before and pass-after evidence and oracle; add missing class probes.     |
| `missed`               | Tighten the seeded probe's oracle or signature against the observed mutated channel, then rerun.          |
| `passed-clean-control` | Keep the clean control as a false-positive guard and inspect defect probes separately.                    |
| `false-positive`       | Repair the clean control's oracle so valid behavior passes, then rerun.                                   |
| `abstained`            | Supply admissible evidence and an oracle that can decide the probe's behavior.                            |
| `bypassed`             | Repair the probe route or oracle evidence pointer so the intended behavior is exercised.                  |
| `unreached`            | Repair the probe's interaction plan or target reachability and rerun.                                     |
| `oracle-error`         | Fix the oracle predicate or unresolved evidence pointer; compile and preflight again.                     |
| `judge-error`          | Repair judge configuration, anchored rubric evidence or calibration examples.                             |
| `infrastructure-error` | Restore target or evaluator execution and rerun the probe; preserve diagnostics.                          |
| `not-applicable`       | Check the probe's applicability condition; author a relevant probe for uncovered behavior.                |

## Map discipline and preflight checks to repairs

The discipline keys come from installed `DISCIPLINE_RULES`. The preflight keys come from the installed `preflight-verdict.schema.json`; a failed check invalidates the run.

| Discipline rule                | Concrete repair                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `success-indicator-separation` | Add a probe and oracle that read independent success evidence, not the target's success claim alone. |
| `whole-body`                   | Add an oracle check on the full response body and a mutation outside the expected keyword.           |
| `malformed-input`              | Add malformed-input probes and an oracle for rejection before side effects.                          |
| `per-record`                   | Add a multi-record probe and per-record oracle evidence pointers.                                    |
| `sibling-cross-check`          | Add a probe whose sibling fields disagree and an oracle that compares them.                          |
| `omission-and-completeness`    | Add a missing-item probe and an oracle that checks the complete required set.                        |
| `state-change-read-back`       | Add a state mutation probe plus a read-back control and oracle.                                      |

| Preflight check        | Concrete repair                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `interface-present`    | Repair registry wiring and supply a real observation through the authorized interface. |
| `input-sensitivity`    | Add a probe pair whose changed input yields a distinguishable observation.             |
| `state-reset`          | Repair isolation and add a control that proves a fresh starting state.                 |
| `clean-control`        | Repair the clean control's target wiring or oracle until valid behavior passes.        |
| `seeded-faults-scoped` | Narrow the mutation to one adopter-owned target artifact and rerun its probe.          |
| `seeded-fault-fired`   | Choose a mutation that manifests on the signature channel and rerun its probe.         |

## Map AD-10 exits and classes to repairs

Preserve source, exit, stderr, and artifact path. The same numeric exit can name different faults from different tools.

| Source and exit         | AD-10 class                                   | Concrete repair                                                                                                                                                                                     |
| ----------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval-quality 0`        | pass or CONCERNS                              | Read the evidence artifact; add a probe or oracle for any CONCERNS gap.                                                                                                                             |
| `eval-quality 2`        | target behavior failure or evidence integrity | Inspect the failing probe and oracle citations; repair target behavior or evidence lineage.                                                                                                         |
| `eval-quality 3`        | infrastructure or integrity                   | Read persisted preflight checks or score diagnostics, repair the failed evidence or execution input, then rerun.                                                                                    |
| `eval-quality 4`        | contract authoring defect                     | Repair the contract or oracle at the compiler diagnostic.                                                                                                                                           |
| `eval-quality 5`        | runtime fault                                 | Repair invocation or infrastructure and repeat the affected probe.                                                                                                                                  |
| `eval-quality 64`       | wiring defect                                 | Repair CLI paths and supply the required contract or evidence input.                                                                                                                                |
| `tea-evaluate 10`       | authoring defect                              | Run `check`; repair stale index, registry, mutation or probe declaration.                                                                                                                           |
| `tea-evaluate 11`       | evaluation weakness                           | Make the mutation manifest, baseline pass, oracle corroborate, or judge calibration agree; rerun development.                                                                                       |
| `tea-evaluate 12`       | infrastructure                                | Repair workspace, target launch, evaluator output contract or rollback; retain diagnostics.                                                                                                         |
| `tea-evaluate 13`       | evaluation evidence drift                     | For the planned Stage 12 PR replay, inspect produced evidence against the committed baseline before accepting a new baseline. This exit is reserved by AD-10 and is not emitted by the current CLI. |
| `tea-evaluate 64`       | wiring defect                                 | Supply `--evaluation` and a completed invocation ID for score.                                                                                                                                      |
| `eval-quality-gates 1`  | repository policy violation                   | Repair the CI policy or evidence bundle named by the gate.                                                                                                                                          |
| `eval-quality-gates 64` | wiring defect                                 | Repair the gate invocation and its evidence path.                                                                                                                                                   |

## Author, rerun and rescore

For an adopter installation, use the private package's binaries with `npm exec --prefix {tea_evaluations_folder}` as in the run guide. For TeA's own package, use `node cli/evaluate.js` and `./node_modules/.bin/eval-quality` from the repository root as in Stage 6. Keep the same engine installation throughout one run.

1. Name one gap, its engine outcome or failed check, and the cited observation or diagnostic in `{test_artifacts}/evaluate/<evaluationId>/gap-report.md`; record the current invocation ID.
2. Author the missing probe, clean control, oracle, rubric criterion or evidence pointer that addresses that gap. Record a refusal with reason if its channel cannot be observed.
3. Rerun `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate digest --evaluation <evaluation-folder>` to refresh `corpus-index.json`, then `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>`, `npm exec --prefix {tea_evaluations_folder} -- eval-quality compile --in <evaluation-folder>/contract.json --out <evaluation-folder>/compiled-contract.json`, and `npm exec --prefix {tea_evaluations_folder} -- eval-quality seal --in <evaluation-folder>/contract.json --out <evaluation-folder>/sealed-brief.json`; halt and repair any nonzero exit.
4. Rerun `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate run --evaluation <evaluation-folder> --partition development`, then `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate score --evaluation <evaluation-folder> --run <invocationId>` with the new completed invocation ID; read the new evidence and interpretation.
5. Record the repair, prior and new invocation IDs, before and after outcome, per-probe class component and first material error in the gap report. Record an adopter's decline with its reason. Repeat for remaining development gaps until closed or declined.
6. Once the adopter confirms readiness from the development artifacts and recorded gaps, run and score the held-out partition. Record that a run-wide `evaluation.json.strengthFloor` gate is unavailable, make no class-wide strength claim, read held-out only through `gap-view.json`, and open a new development repair for a missed held-out outcome.
