---
title: 'Story 1.110: Designate one oracle per behavior in the both view'
type: 'feature'
created: '2026-10-05'
status: 'in-review'
baseline_commit: '3fc05ccaee32809bb4c76b80afcd1a29bb7117e9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.110)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.110)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-5, AD-9, AD-22)'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.51.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.104.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.109.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and assigned Story 1.110 to lane 1">

## Intent

**Problem:** The both view of a `partitionPlan` gives a behavior its development oracle and its held-out oracle.
eval-quality designates an oracle for a probe only when the probe's behavior lists exactly one, so a run with no `--partition` scored every probe of such a behavior with no designated oracle.
With none designated, a probe reads `caught: true` only when a finding cites the contract's first-declared oracle, and `caught: false` for a defect claimed against any other oracle, so a probe of the held-out oracle read uncaught in the both run while its own partition's run caught it.

**Approach:** eval-quality 7.2.0 adds `eval-quality score --designated-oracle <O-id>`.
A probe of a both run asks for the one oracle its own partition's view lists for its behavior.
The partition is the held-out one when `heldOutProbes` lists the probe and the development one otherwise, and the oracle comes from `contractView` over that partition, the view the partition's own run compiles.
One method of `HeldInputs` is the only reader of that designation, so the call's arguments and the in-process re-score that `score` compares them with cannot disagree.

## Boundaries & Constraints

**Always:** A development run, a held-out run and a folder with no `partitionPlan` pass nothing, so every committed fixture, baseline and replay of them keeps its bytes.
A development run never opens the held-out plan or `corpus/held-out/`.
A partition view that lists no oracle or several leaves the probe undesignated, as the partition's own run does, and a both view that lists one oracle is designated by the engine.
A message names a probe or a behavior by ID only when the ID has the schema's shape, and quotes no byte of the plan.
TeA compares nothing the engine owns (AD-1): the designation is a flag value, and eval-quality judges the result.

**Never:** Work around a missing engine capability (7.2.0 carries the flag).
Add a field to the evidence artifact or to a TeA schema.
Invent a capability nobody needs (no per-probe contract view: `contractDigest` and `evaluatorConfigurationDigest` enter the trial records and `scoringVersion`, and the strength aggregate requires them equal across probes).

## I/O & Edge-Case Matrix

| Scenario                           | Input / State                                                                                                      | Expected Output / Behavior                                                                                                            | Error Handling |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Both run, two partitions' oracles  | B-002 lists O-002 (development) and O-101 (held-out); P-004 in the development partition, P-003 in `heldOutProbes` | `score` hands P-004 `--designated-oracle O-002` and P-003 `--designated-oracle O-101`; both read `caught: true`, as in their own runs | N/A            |
| Both run, one oracle everywhere    | B-001 lists O-001 in every view                                                                                    | No flag; the engine designates O-001                                                                                                  | N/A            |
| Both run, several in the partition | The partition's view lists two oracles for the behavior (development-only copies of O-002)                         | No flag; the probe reads as in the partition's own run                                                                                | N/A            |
| Development or held-out run        | `--partition development` or `--partition held-out`                                                                | No flag; the held-out plan is not opened by a development `score`                                                                     | N/A            |
| No `partitionPlan`                 | Any existing fixture                                                                                               | No flag; no byte of a committed fixture, baseline or replay changes                                                                   | N/A            |
| Plan unreadable at `score`         | A both run, the held-out plan unparsable                                                                           | Input-check finding naming the plan's path, no score call                                                                             | Exit 10        |
| Folder drifted from the run        | The plan lists another oracle than the run's sealed contract lists under the probe's behavior                      | Input-check finding naming the probe, no score call                                                                                   | Exit 10        |
| Behavior the contract lacks        | A probe names a behavior `contract.json` no longer holds                                                           | Finding naming the probe and the behavior by ID                                                                                       | Exit 10        |
| Call without the designation       | The engine CLI the run calls drops `--designated-oracle`                                                           | The staged artifact differs from the held inputs' re-score; no vote is recorded                                                       | Exit 12        |
| Both baseline replay               | `compare --accept` over a both run, then `ci --tier pr`                                                            | The replay hands the same flags; every probe reads as in the baseline; no stale warning                                               | N/A            |

</frozen-after-approval>

## Premise Check

What the code and the engine hold, read before the build.

- **The engine flag.** eval-quality 7.2.0 is installed (`node_modules/eval-quality`, `package-lock.json`).
  `eval-quality score --designated-oracle <O-id>` and the `designatedOracleId` option of the application `runScore` are accepted only when the probe's behavior lists the oracle and the contract declares it; otherwise `score` exits 64.
  Absent, the engine's own rule stands: `designatedOracleIdOf` designates an oracle only for a behavior that lists exactly one.
  The flag adds no field to the evidence artifact; the selected votes are already in `reducedProbeOutcomes[].trialVotes`.
  The released flag is the one the story assumed.
- **What an undesignated probe reads.** With no oracle designated, each trial's vote is the first invalidating state across the contract's oracles, else the state of the contract's first-declared oracle.
  A probe therefore scores `caught: true` when a finding cites that first-declared oracle and `caught: false` for a defect claimed against any other oracle.
  The earlier wording "always `caught: false`" was wrong, and every doc line, test name and comment words it this way.
- **Why a per-probe view cannot do it.** A both view with one oracle per probe would be one contract per probe.
  Trial records carry `contractDigest`, and `evaluatorConfigurationDigest` enters `scoringVersion`, which the strength aggregate requires equal across probes.
  The engine flag is the only route that keeps one contract for the run.
- **Where the both view loses the oracle.** `contractView({ partition: 'both' })` appends `heldOutPlan.behaviorOracles[behaviorId]` to each behavior's oracle list.
  B-002 of the `partition-plan` fixture lists O-002 and O-101 there, so the engine designates nothing for P-003 and P-004.
  The development view lists O-002 and the held-out view lists O-101, which is what each partition's own run designates.
- **Every call path.** `eval-quality score` is called from `runScoreCommand` (`score.js`: `score`, and `ci`'s live and replay scoring), from `compare.js` (the input check of `compare --accept`), and from `scoreAttempt` in `run.js` (a sealed-brief agent's qualification attempt).
  Gameability probes are scored by the same `score` call as every other probe.
  `calibration.js` and `arm.js` call no score.
- **Run record.** `run.json` carries `partition` and `heldOutProbes`, so `score` reads those for the partition and the held-out list.
  `score` reads `evaluation.json` for a both run and, under a `partitionPlan`, `contract.json` and the held-out plan.

AC amendments, recorded in `epics.md` and `test-design-epic-1.md`: the criteria hold as written.
The build adds what they leave open: the partition rule, the none-or-several case, the refusals, and the gameability and qualification probes.
A gameability probe's `defectSignature` must admit and be satisfied by the answer at every step an oracle of either partition reads, because the both view answers every step and eval-quality reads a finding at a step the signature does not admit as an unwitnessed claim (the probe scores Invalid, exit 3).

## Code Map

- `cli/lib/evaluate/partition.js` -- `bothViewDesignation` (the pure rule: the oracle `contractView` lists for the probe's behavior in the probe's partition, nothing for a view that lists none or several, nothing when the both view lists one, a probe whose behavior the contract lacks named by shaped IDs) and `loadBothViewDesignation` (over a folder: reads `evaluation.json` and, for a both run under a `partitionPlan` only, `contract.json` and the plan).
- `cli/lib/evaluate/score-inputs.js` -- `HeldInputs.designation(set)` is the one reader.
  `scoreArguments` adds `--designated-oracle`, `reproduce` hands the same oracle to the in-process `runScore`, and `designationFindings` refuses a probe the contract cannot place or an oracle the run's sealed contract does not list under the behavior.
  `holdScoreInputs` and `holdAttemptInputs` take `designate`.
- `cli/lib/evaluate/score.js` -- `holdRunInputs` builds the designation of a run's record, and turns a plan that cannot be read into an input-check finding of rule `designation`; `runScoreCommand` and `compare.js` hold their inputs through it.
- `cli/lib/evaluate/run.js` -- `scoreAttempt` takes `designate` and refuses an undesignable attempt with exit 12 before any engine call; `qualifyEvaluator` derives the designation from the run's own view.
- `cli/lib/evaluate/preflight.js` -- hands the view to the verdict stage, so a both run's qualification sees the same view.
  `cli/lib/evaluate/engine.js` -- the engine-missing message names `>=7.2.0`.
- `package.json`, `package-lock.json`, `tools/guard-publish.js`, `test/test-guard-publish.js`, `test/test-release-metadata.js` -- the peer floor `>=7.2.0`.
- `test/test-evaluate-partition-plans.js` -- the pure cases, the both run's flags and outcomes, the several-oracles layer (`severalOraclesLayer`), the refusals, the dropped-flag shim, the both baseline replay, the qualification attempts and the gameability probes.
  `test/test-evaluate-evaluators.js` -- the static read of `scoreAttempt` requires `designate` and `held.designationFindings(`.
- Twelve accepted baselines re-recorded on 7.2.0; `docs/reference/tea-evaluate-cli.md`, skill `references/corpus.md`, `CHANGELOG.md`, `epics.md`, `ARCHITECTURE-SPINE.md` (AD-5), `eval-quality-facts.md`, `test-design-epic-1.md`, `sprint-status.yaml`.

## Tasks & Acceptance

**Execution:**

- [x] Adopt eval-quality 7.2.0: peer floor, lockfile, guard, engine message, docs, AD-5, facts
- [x] `partition.js`, `score-inputs.js`, `score.js`, `run.js`, `compare.js`, `preflight.js` -- the designation and its one reader
- [x] Cases in `test-evaluate-partition-plans.js` and the static read of `scoreAttempt`
- [x] Re-record the twelve accepted baselines on 7.2.0
- [x] Docs, skill reference through `/bmad-workflow-builder` Edit headless and Analyze, CHANGELOG, epics and test-design amendment, sprint row `review`
- [x] Revert each acceptance check once and record the observation, and the mutant table

**Acceptance Criteria:**

- Given a behavior with a development oracle and a held-out oracle and one probe in each partition, when the evaluation runs with no `--partition`, then each probe is scored against its own partition's oracle and is caught, and the development and held-out runs keep their own scores.
- Given a both baseline accepted by `compare --accept`, when `ci --tier pr` replays it, then both probes are caught, nothing reads as stale, and a replay that reads the both view as stale or uncaught fails the case.
- Given a behavior with two oracles in a partition's view, then the both run matches that partition's own run, and a case that scores `caught: false` for both probes of a behavior with a development and a held-out oracle fails.

## Implementation Notes

- The rule is one pure function over the views the partition's own run compiles.
  `bothViewDesignation` derives the both, development and held-out views with `contractView` before it answers any probe, so a plan that cannot yield a view fails once, up front.
  A probe whose behavior the both view lists with one oracle is left to the engine, which designates it itself; passing the same oracle would be identical and would change the argument list of every committed both baseline.
- The development view is derived with no plan (`contractView` takes `heldOutPlan: null` for it), so the rule never needs the plan to answer for a development probe; a development run does not reach the function at all.
- `HeldInputs.designation(set)` reads the probe from the held bytes and asks the function.
  `scoreArguments`, `reproduce` and `designationFindings` all call it, so the flag the CLI is handed, the oracle the in-process score is given and the check that the run's sealed contract lists that oracle come from one answer.
  The comparison `score` makes after each call (`held-refusal.js`) is the existing guard: a call that drops the flag stages an artifact that differs from the in-process one and exits 12.
- `holdRunInputs` is the one place that builds a run's designation, and `score`, `compare --accept` and the `ci` replay (through `runScoreCommand`) hold their inputs through it.
  A both run's plan or contract that cannot be read is turned into a finding of rule `designation`, so the refusal is an input-check finding (exit 10, no score call).
- The sealed contract is the contract the run compiled, which for a both run is the both view.
  `designationFindings` checks the designated oracle against that contract, so a plan edited after the run (an oracle renamed) is refused by `score` and `compare --accept`, and no probe is scored under an oracle the run never held.
- Gameability probes and evaluator qualification attempts need no code of their own: a gameability probe is scored by the same `score` call as every other probe, and `qualifyEvaluator` derives the function from the run's view and hands it to `scoreAttempt`, which refuses an undesignable attempt with exit 12 before any engine call.
- The gameability layer of the fixture changed: the both view answers every step for every gameability probe, so an oracle either partition reads can be violated by the answer, and eval-quality reads a finding at a step the probe's `defectSignature` does not admit as an unwitnessed claim (the probe scores Invalid, exit 3).
  Both gameability probes of the fixture now share one signature that selects any prompt.
- eval-quality credits a probe's manifestation witness to the oracle it is handed.
  A held-out probe handed the development oracle therefore still reads `caught: true` in the `partition-plan` fixture (O-002 reads `caught` beside O-101), so no case can pin the partition rule through the outcome alone; the `--designated-oracle` argument in each score call record is the pin, and the mutant table shows the cases that hold it.
  Without any designation both B-002 probes read `caught: false`, since the contract's first-declared oracle is O-001.
- The both baseline of the replay case is accepted from a plain `score`.
  A score through a substituted engine program (the dropped-flag shim) writes call records that name the substitution, and a replay without the shim reproduces them differently, so the case scores once more without the shim before `compare --accept`.
- The accepted-baseline replay compares twelve files since Story 1.91 (four probes' call records and evidence, the aggregate and its record); the case pins `12 baseline file(s) compared, 0 difference(s)`.
- The twelve accepted baselines were re-recorded with the scripts of the earlier Story 1.104 recipe over clean disposable copies (`check`, `run`, `score`, `compare --accept` through `node cli/evaluate.js`), one fresh run each, so run IDs, score directories and derived digests changed with the version stamp: `evaluate-api/evals/grader`, `evaluate-mcp/evals/grader`, `evaluate-workflow/evals/records`, `evaluate-tool-use-agent/evals/tool-use`, `evaluate-promptfoo/evals/summary`, `evaluate-learn/evaluation`, `evaluate/mutation/evals/verdict-ci`, `evaluate-authoring/ai-feature/evaluation`, `evaluate-authoring/test-review/evaluation`, `evaluate-gap-loop/after/evaluation` and `evaluate-ci-repos/{tagged-release,nightly-deploy}/evals/answer-grade`.
  The recordings carry the neutral path forms of Story 1.91, and `git grep '/Users/'` over the baselines finds nothing.
- The `replay/` bundles of the gap-loop `after`, AI-feature and test-review evaluations still name the engine release that recorded them (7.1.0), as the `before` bundles name 4.3.0 and 6.0.0.
  A replay bundle is a committed record of a run, no suite compares its stamp with the installed engine, and Story 1.104 left them in place for the same reason (`test:evaluate-authoring` and `test:evaluate-gap-loop` passed unchanged on the new engine).
  Only a baseline is compared (`test:evaluate-pr-<key>`, `test:evaluate-ci`, `test:evaluate-ci-repositories`).

## Revert Observations

Each acceptance check was undone once in a scratch copy of the tree (`mut-1.110-build-<name>`, `node_modules` linked, one change per mutant).
The copy ran trimmed forms of `test-evaluate-partition-plans.js`: the pure cases, the preflight, run and score flow, the evaluator qualification attempts and the gameability flow, so each mutant stopped at its first failing assertion.

| Revert                                                          | What the case observed                                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The helper returns nothing for every probe (P1, P1o)            | The both run's score call records hold no `--designated-oracle` where the case expects O-101 for P-003 and O-002 for P-004. With that assertion removed, P-003 and P-004 both read `caught: false`, since the first-declared oracle of the contract is O-001. |
| A held-out probe is handed the development oracle (P2, P2o)     | The call record of P-003 names O-002 where the case expects O-101. With that assertion removed the outcome stays `caught: true` (eval-quality credits the witness to the designated oracle), so the argument assertion is the check that holds the rule.      |
| The in-process held-input check drops the designation (I1)      | `score` of the both run exits 12, P-003 and P-004 with no evidence artifact: the staged artifact differs from the one the held inputs produce.                                                                                                                |
| The CLI call drops the flag the check holds (I2)                | The same exit 12. The dropped-flag shim case holds this from outside: an engine program that removes `--designated-oracle` makes `score` exit 12 for P-003 and P-004, and the same program with no removal exits 0.                                           |
| The ci replay scores with no designation (S5)                   | `ci --tier pr` exits 13: the replay's evidence and call records differ from the accepted baseline's.                                                                                                                                                          |
| A both view that lists one oracle is designated by TeA too (P3) | The pure case: B-001 probes were handed O-001.                                                                                                                                                                                                                |

## Mutant table

Every new check, rule and branch was reverted or broken once in a scratch copy, and every mutant failed a case; P7, P9 and C1 survived the first pass and gained the cases named below.
The run order of a mutant is pure cases, flow, qualification attempts, gameability flow, and for R2 the `held-attempts` group.

| Mutant                                                                                   | Case that failed                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1: the helper returns nothing for every probe                                           | The both run's call records hold no `--designated-oracle` (flow); the pure `designationsOf()` case (P1b); the outcome assertion (P1o).                          |
| P2: a held-out probe is handed the development oracle                                    | The both run's call record of P-003 names O-002 (flow); with that assertion removed, the drift case (exit 0 where 10 is expected, since O-002 is still listed). |
| P2b: a development probe is handed the held-out oracle                                   | The pure `designationsOf()` case.                                                                                                                               |
| P3: a both view that lists one oracle is designated by TeA too                           | The pure case: B-001 probes were handed O-001.                                                                                                                  |
| P4: the first of several partition oracles is designated                                 | The pure case over a development view with two oracles: P-004 was handed one.                                                                                   |
| P5: a partition view with no oracle list throws                                          | The pure case over a behavior with no `oracles` in the source: `TypeError` on `length`.                                                                         |
| P6: a development or held-out run designates                                             | The pure case: the development run derived a both view, which needs the plan (`PartitionPlanError`).                                                            |
| P7: a folder with no `partitionPlan` refuses or designates a probe                       | The pure case with a probe of a behavior the contract lacks. The first pass left this mutant alive, since no designation can differ there.                      |
| P8: a development or held-out score opens the folder                                     | The pure case over a folder that does not exist: `evaluation.json cannot be read`.                                                                              |
| P9: a both run with no plan reads `contract.json` and the plan                           | The unplanned folder's case with an unparsable `contract.json` (flow). The first pass left it alive, for the same reason as P7.                                 |
| P10, P10b: a probe or behavior ID of any shape is printed                                | The pure case with `canary-probe` and `canary-behavior`.                                                                                                        |
| P11: a probe of a behavior the contract lacks is not refused                             | The pure case with `B-999`.                                                                                                                                     |
| I1: the in-process held-input check drops the designation                                | `score` of the both run exits 12 (flow).                                                                                                                        |
| I2: the CLI call drops the designation                                                   | `score` of the both run exits 12 (flow).                                                                                                                        |
| I3: an oracle the run's sealed contract does not list is not refused                     | The drift case: the renamed plan reached the engine and `score` exited 12 where 10 is expected.                                                                 |
| I4, I5, S1, S3: a designation problem is not reported, or the findings are not asked for | The unreadable-plan case: exit 0 where 10 is expected.                                                                                                          |
| S2: `score` holds its inputs with no designation                                         | The both run's call records hold no flag.                                                                                                                       |
| S4: every probe of the run is a development probe                                        | The both run's call records: P-003 was handed O-002.                                                                                                            |
| S5: the ci replay scores with no designation                                             | `ci --tier pr` exits 13 (the replay's evidence differs from the baseline's).                                                                                    |
| C1: `compare --accept` holds its inputs with no designation                              | The case that runs `compare --accept` over the renamed plan: it was accepted. The first pass left this alive until the case was added.                          |
| R1: a qualification attempt is scored with no designation                                | The evaluator attempt case: P-003 and P-004 attempts were handed no oracle.                                                                                     |
| R2: a qualification attempt skips the designation findings                               | `test:evaluate-held-attempts`: the static read of `scoreAttempt` does not call `held.designationFindings(`.                                                     |
| R3: every qualification attempt is a development attempt                                 | The evaluator attempt case: P-003's attempts were handed O-002.                                                                                                 |
| G1: the helper returns nothing (gameability probes of a both run)                        | The both-view gameability case: P-005 and P-006 read uncaught and were handed no oracle.                                                                        |

## Spec Change Log

## Completion Notes

Observed beside the story: eval-quality credits a probe's manifestation witness to whichever oracle it is handed, so in the `partition-plan` fixture a held-out probe handed the development oracle still reads `caught: true`.
The partition rule is therefore pinned by the `--designated-oracle` argument in the score call records, and the Revert Observations table says what each revert showed.
The released engine flag is the one the story assumed: accepted only for an oracle the probe's behavior lists, exit 64 otherwise, and no field added to the evidence artifact.

AC amendments recorded in `epics.md` and `test-design-epic-1.md`: the criteria hold as written, and the amendment states the partition rule, the undesignated cases, the refusals, and the gameability and qualification probes.

Gates run on the final tree: `test:evaluate-partition-plans` (634 s here; the same suite on `main` measures 595 s on this machine, so the cases add about 40 s), `-arms`, `-ci`, `-authoring`, `-gap-loop`, `-learned-framework`, `-api`, `-mcp`, `-workflow`, `-tool-use`, `-promptfoo`, `test:evaluate-ci-repositories:tagged-release-pr` and `:nightly-deploy-pr`, the ten `test:evaluate-pr-<key>` suites, `-guidance`, `-compare`, `-run`, `-preflight`, `-check`, `-partitions`, `-calibration`, `-held-inputs`, `-held-attempts`, `-evaluators`, `-records`, `-agents`, `-private`, `-aggregate`, `-interpret`, `-dogfood`, `-boundaries`, `-ci-render`, `test:eval-replay`, `test:guard-publish`, `test:release-metadata`, `test:contract-oracles`, `test:shards`, `test:ci-coverage`, `eslint . --max-warnings 0`, `format:check`, `lint:md` and `docs:validate-links`, all exit 0.
`npm test` was not run; CI carries it.
CI shard impact: the weight of `test:evaluate-partition-plans` in `tools/test-shard-weights.json` moves from 890 to 950, the old weight scaled by the ratio of the two measurements on this machine (634 s to 595 s).
The suite stays alone on its shard, and no npm script was added or removed.

The skill reference `references/corpus.md` went through the `/bmad-workflow-builder` Edit flow headless (memlog entries of Story 1.110, `quick_validate`, `scan-path-standards` and `scan-scripts` run).
`SKILL.md` and `references/ci.md` are untouched, since both are `sessionRead` keys of the committed live capture records, so `test:evaluate-ci` replays unchanged.
Builder Analyze (all five lenses, `.analysis/2026-10-05-r110/`, gitignored): 0 critical, 2 high.
Fixed in `corpus.md`: the predicate antecedent of the signature sentence (leanness-1), the order of the both-view sentence with `contract.json` and the plan file named (leanness-2, determinism-3), the several-oracle outcome stated as no designated oracle with `caught` only through the first-declared oracle (leanness-3, architecture-2), architecture-1.
Skipped, with the reason: leanness-4, architecture-4 and enhancement-4 ask to carve `corpus.md`, which is 17k tokens before this change, and the carve needs a `SKILL.md` Stage 3 routing edit while `SKILL.md` is a `sessionRead` key of the committed capture records that `test:evaluate-ci` pins by digest; architecture-3 (paragraph placement) and determinism-1 (a check rule would be new CLI behavior); enhancement-1 and enhancement-3 (a worked example needs a new tagged fixture that `test:evaluate-guidance` validates).

A real defect found on the way and fixed in this change: the static read of `scoreAttempt` in `test-evaluate-evaluators.js` planted its checks at the old signature, so after the `designate` parameter none of its plants landed (`test:evaluate-held-attempts` failed).
It now plants at the new signature and requires `designate,` and `held.designationFindings(`, so a qualification attempt that skips the designation check fails the group (mutant R2).

## Verification

**Commands:**

- `npm run test:evaluate-partition-plans && npm run test:evaluate-arms` -- expected: pass
- `npm run test:evaluate-ci && npm run test:evaluate-authoring && npm run test:evaluate-gap-loop && npm run test:eval-replay` -- expected: pass, no replay byte changes
- `npm run test:evaluate-pr-ai-feature` and the nine other `test:evaluate-pr-<key>` suites -- expected: pass on the baselines re-recorded on 7.2.0
- `npx eslint . --max-warnings 0 && npm run format:check && npm run lint:md && npm run docs:validate-links` -- expected: pass
