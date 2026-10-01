# Gaps

Read the scored development evidence artifact for CONCERNS, FAIL, Invalid or a weak strength vector. Name the first unsatisfied engine rule, failed preflight check, missing evidence, or loose oracle. For a development `score` exit 3 with no evidence artifact, read the persisted `runs/<invocationId>/scores/<scoreInvocationId>/<probeId>/score.json` record and its stdout and stderr diagnostics. Treat the exit as a routing fact and read engine evidence for the quality judgment. Read development `interpretation.json` for citations and phase; eval-quality remains the only verdict and strength authority. For a held-out score failure, read only its `gap-view.json` row. An `outcome: null` leaves the held-out cause undisclosed. Hold the held-out loop, author a development probe of the same class, and diagnose its development evidence or score diagnostics; record a blocked gap if the fault cannot be reproduced there.

## Read the strength vector

The vector's denominator is unique qualified probe IDs exercised per class, after each probe's trials are reduced. An admitted probe that was not exercised contributes no denominator; its class rate is `null` if none were exercised. `tea-evaluate score` invokes eval-quality once per probe, so one evidence artifact reports only that probe's class component in `defect`, `gameability` or `zero-action`. `caughtCount / validCount > catchThreshold` alone decides whether that probe is caught. Separately, fewer completed trials than `minimumTrialCount` make its strength non-comparable. The class-wide reading is the aggregate the same invocation copies to `strength-aggregate.json`, which eval-quality's `aggregate-strength` stage mints from those artifacts. Per class it states `eligible`, `exercised`, `caught`, `rate`, `comparable` and the floor decision with its `basis` against the adopter's `evaluation.json.strengthFloor`. Copy those readings and compute no rate or decision. A class with no declared floor reads `undeclared` with basis `no-floor-declared`. Under a declared floor the first match wins, in this order: `no-eligible-probe` (a `null` class has no eligible probe), `not-comparable` (`comparable: false`: fewer trials than `minimumTrialCount` or an oracle unreached), `no-exercised-probe` (`rate: null`: eligible probes and none exercised), `unexercised-probe` (some eligible probe never exercised). None of these is a pass. Only a class that clears all four reads `rate-below-floor` or `rate-meets-floor` from its rate. Clean controls and canaries test false positives and viability; they never enter a denominator. When the `strengthAggregate` pointer's `status` is `absent`, `refused`, `mismatch` or `failed`, no aggregate stands and no class-wide claim does either: read the pointer's reason, repair that cause and rescore. One `caught` defect proves only that one detection, not a strong contract. Example: a qualified defect probe catches two of five valid trials at `catchThreshold: 0.5`. The strict rule misses that probe; inspect its three uncaught trial observations, tighten the oracle and rerun development. The artifact's defect component describes that probe alone, and the aggregate's describes the class.

## Read a loose oracle

A gameability probe gives a degenerate answer such as "always decline" or a success keyword with no required action. If it fails qualification or does not resolve `caught`, read the oracle's evidence pointers and check tree. Example: an oracle that looks only for "declined" in stdout will accept a refusal for every request. Add a clean control requiring a legitimate approval and an oracle condition that observes the actual reservation decision and tool call. Requalify the gameability probe and rescore; never manufacture a catch in TeA.

## Separate process from outcome

In `interpretation.json`, `process` and `outcome` list findings by the operation phases captured at run time. `firstMaterialError` names the lowest-sequence cited observation of a `material` or `critical` finding, with its operation and phase. Example: a bad validation response at sequence 3 precedes an incorrect final reservation at sequence 7. Repair the validation probe or oracle at sequence 3, then verify both observations after rerun. The interpretation copies engine outcomes and traces citations; it does not score claims or semantic checkpoints. A judgment checkpoint belongs in an anchored rubric criterion judged by a calibrated judge.

## Read held-out results

Read held-out results only from `gap-view.json`, whose held-out rows expose probe ID, class and the engine's reduced outcome object. Example: a row with `probeId: "P-021"`, `probeClass: "defect"` and `outcome.caught: false` means author a new development defect probe and inspect its oracle. Read `outcome.trialVotes` for the individual outcome states and `validCount` and `caughtCount` for the reduction. An `outcome: null` leaves the held-out cause undisclosed; reproduce its class failure in development and inspect those diagnostics. Keep held-out inputs and records closed. Run the held-out partition only after the adopter reviews development evidence and confirms readiness; do not tune directly to a held-out answer.

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

| Discipline rule                | Concrete repair                                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `success-indicator-separation` | Add a probe and oracle that read independent success evidence, not the target's success claim alone.                                                             |
| `whole-body`                   | Add an oracle check on the full response body and a mutation outside the expected keyword.                                                                       |
| `malformed-input`              | For each operation declaring a request key, bind `type-violating` on a step input and address that step with an oracle check; qualify a malformed request probe. |
| `per-record`                   | Add a multi-record probe and per-record oracle evidence pointers.                                                                                                |
| `sibling-cross-check`          | Add a probe whose sibling fields disagree and an oracle that compares them.                                                                                      |
| `omission-and-completeness`    | Add a missing-item probe and an oracle that checks the complete required set.                                                                                    |
| `state-change-read-back`       | Add a state mutation probe plus a read-back control and oracle.                                                                                                  |

The engine reads `malformed-input` coverage from the contract. A caught malformed-input probe alone leaves the rule unsatisfied until the planned input binding and addressed check exist for every relevant operation.

For example, an operation can declare a generic `requestKey` in `requestShape.stdin`:

<!-- example:request-shape -->

```json
{ "requiredKeys": [], "permittedKeys": ["requestKey"], "types": { "requestKey": "string" } }
```

A step invoking that operation can bind the key in `inputBinding.stdin`:

<!-- example:input-binding -->

```json
{ "requestKey": { "matcher": "type-violating" } }
```

An oracle check must address that step. These excerpts were validated in their respective contract locations with `eval-quality compile`.

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

| Source and exit         | AD-10 class                                   | Concrete repair                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval-quality 0`        | pass or CONCERNS                              | Read the evidence artifact; add a probe or oracle for any CONCERNS gap.                                                                                                                                                                                                                                                                                                                                                               |
| `eval-quality 2`        | target behavior failure or evidence integrity | Inspect the failing probe and oracle citations; repair target behavior or evidence lineage.                                                                                                                                                                                                                                                                                                                                           |
| `eval-quality 3`        | infrastructure or integrity                   | Read persisted preflight checks or score diagnostics, repair the failed evidence or execution input, then rerun.                                                                                                                                                                                                                                                                                                                      |
| `eval-quality 4`        | contract authoring defect                     | Repair the contract or oracle at the compiler diagnostic.                                                                                                                                                                                                                                                                                                                                                                             |
| `eval-quality 5`        | runtime fault                                 | Repair invocation or infrastructure and repeat the affected probe.                                                                                                                                                                                                                                                                                                                                                                    |
| `eval-quality 64`       | wiring defect                                 | Repair CLI paths and supply the required contract or evidence input.                                                                                                                                                                                                                                                                                                                                                                  |
| `tea-evaluate 10`       | authoring defect                              | Run `check`; repair stale index, registry, mutation or probe declaration.                                                                                                                                                                                                                                                                                                                                                             |
| `tea-evaluate 11`       | evaluation weakness                           | Make the mutation manifest, baseline pass, oracle corroborate, judge calibration or sealed-brief agent qualification agree (read `evaluator-qualification.json` for the arm and development-probe attempt that disagreed; a held-out probe stays behind `gap-view.json`); rerun development.                                                                                                                                          |
| `tea-evaluate 12`       | infrastructure                                | Repair workspace, target launch, evaluator output contract (including a framework result with no grade; see `evaluator.md`), an installed framework that is missing, differs from `evaluator/frameworks.json` or changes during the run (reinstall the declared version, or update `frameworks.json` and `LEARNED.md` together after a deliberate upgrade; see `framework-versions.json` in the run) or rollback; retain diagnostics. |
| `tea-evaluate 13`       | evaluation evidence drift                     | Read the differences the `pr` replay lists and repair what moved them, or run `tea-evaluate compare --accept` once the adopter confirms the new evidence is intended; `ci --tier pr` exits 13 on drift.                                                                                                                                                                                                                               |
| `tea-evaluate 64`       | wiring defect                                 | Supply `--evaluation` and a completed invocation ID for score.                                                                                                                                                                                                                                                                                                                                                                        |
| `eval-quality-gates 1`  | repository policy violation                   | Repair the CI policy or evidence bundle named by the gate.                                                                                                                                                                                                                                                                                                                                                                            |
| `eval-quality-gates 64` | wiring defect                                 | Repair the gate invocation and its evidence path.                                                                                                                                                                                                                                                                                                                                                                                     |

## Author, rerun and rescore

For an adopter installation, use the private package's binaries with `npm exec --prefix {tea_evaluations_folder}` as in the run guide. For TeA's own package, use `node cli/evaluate.js` and `./node_modules/.bin/eval-quality` from the repository root as in Stage 6. Keep the same engine installation throughout one run.

1. Name one gap, its engine outcome or failed check, and the cited observation or diagnostic in `{test_artifacts}/evaluate/<evaluationId>/gap-report.md`; record the current invocation ID.
2. Author the missing probe, clean control, oracle, rubric criterion or evidence pointer that addresses that gap. Record a refusal with reason if its channel cannot be observed.
3. Rerun `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate digest --evaluation <evaluation-folder>` to refresh `corpus-index.json`, then `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>`, `npm exec --prefix {tea_evaluations_folder} -- eval-quality compile --in <evaluation-folder>/contract.json --out <evaluation-folder>/compiled-contract.json`, and `npm exec --prefix {tea_evaluations_folder} -- eval-quality seal --in <evaluation-folder>/contract.json --out <evaluation-folder>/sealed-brief.json`; halt and repair any nonzero exit.
4. Rerun `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate run --evaluation <evaluation-folder> --partition development`, then `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate score --evaluation <evaluation-folder> --run <invocationId>` with the new completed invocation ID; read the new evidence and interpretation.
5. Record the repair, prior and new invocation IDs, before and after outcome, per-probe class component and first material error in the gap report. Record an adopter's decline with its reason. Repeat for remaining development gaps until closed or declined.
6. Once the adopter confirms readiness from the development artifacts, recorded gaps and the development `strength-aggregate.json`, run and score the held-out partition. Record each class's floor decision and basis from that aggregate; a `does-not-meet` class needs a development repair or the adopter's declined reason first, and an `absent`, `refused`, `mismatch` or `failed` aggregate blocks every class-wide claim until a rescore copies one. Read held-out only through `gap-view.json`, and open a new development repair for a missed held-out outcome.
