---
title: 'Story 1.104: Count only behavior-linked oracles for success separation'
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_commit: '9e20b8b4f67b3c201cc4008a65c63e184bdba93b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.104)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.104)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-20)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.55.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.102.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and assigned Story 1.104 to lane 3">

## Intent

**Problem:** eval-quality's `success-indicator-separation` rule scanned every oracle in the contract. An oracle that no behavior lists in `behaviors[].oracles` supplies evidence for no behavior, yet it could satisfy the rule, so an orphan check hid a missing success-separation requirement. Story 1.55's independent review found the gap in both branches: the scalar command (exit code 0 beside exact whole stdout) and the structured response (the success indicator beside another roled pointer).

**Approach:** The engine owns the rule. Count an oracle only when some behavior lists it, in both branches, release the engine, then move TeA's peer floor, lockfile and AD-5 record to the release in this pull request. TeA compares nothing (AD-1): the gap is the engine's, read from the evidence artifact's `coverageGaps` the way every other coverage gap is. TeA proves that it surfaces, and that it closes once a behavior lists the oracle.

## Boundaries & Constraints

**Always:** Keep TeA's code free of any oracle-link comparison. Re-record the three accepted fixture baselines on the new engine (a re-record is a fresh run, so run IDs, score directories and derived digests change with the version stamp). Keep the pantry fixture at `PASS`: its O-001 is listed by B-001.

**Never:** Run `npm install` or `npm ci` in a shared `node_modules`. Dispatch TeA's Publish workflow. Touch the engine's main checkout.

## I/O & Edge-Case Matrix

| Scenario                                | Input / State                                                                                     | Expected Output / Behavior                                                                                                                                                       | Error Handling                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Scalar oracle listed by a behavior      | Pantry contract: O-001 checks exit code 0 and exact whole stdout, B-001 lists it                  | `success-indicator-separation` satisfied, `PASS`, no gap                                                                                                                         | N/A                               |
| Scalar oracle listed by no behavior     | The pair moves into O-003 that no behavior lists; O-001 narrows to stdout                         | The P-001 evidence artifact records the rule unsatisfied and `CONCERNS`                                                                                                          | Score exits 0, `ci` warns         |
| Scalar oracle listed once relinked      | O-003 listed under a behavior of its own                                                          | No coverage gap                                                                                                                                                                  | N/A                               |
| Structured oracle listed by no behavior | A routing contract's whole-body oracles stay declared and drop out of every `behaviors[].oracles` | `success-indicator-separation` unsatisfied (`no behavior-linked oracle addresses operation <id>'s success indicator beside another roled pointer at one step, in both channels`) | Evidence artifact records the gap |
| Structured oracle relinked              | The same oracles listed under one behavior                                                        | Satisfied again; any behavior counts                                                                                                                                             | N/A                               |
| Committed contracts                     | Every shipped `contract.json` lists its separating oracle                                         | No shipped contract changes outcome                                                                                                                                              | N/A                               |

</frozen-after-approval>

## Code Map

Engine (`/Users/murat/opensource/bmad-eval-quality`, worktree `/Users/murat/opensource/_wt/evaluate-lane3-eq-1104`, PR #183):

- `src/core/coverage/satisfaction.ts` -- `successIndicatorSeparationSatisfaction`, `scalarCommandWitnessed` and the oracle index; the filter is `behaviorLinkedOracleIds`.

TeA:

- `package.json` (peer floor), `package-lock.json`, `tools/guard-publish.js`, `test/test-guard-publish.js`, `test/test-release-metadata.js`, `cli/lib/evaluate/engine.js` (message), `docs/reference/tea-evaluate-cli.md`, `ARCHITECTURE-SPINE.md` (AD-5 spots; `npx prettier --write`), `eval-quality-facts.md`, `CHANGELOG.md`.
- `src/workflows/testarch/bmad-testarch-evaluate/references/contract.md` (`### success-indicator-separation` says the oracle must be listed by a behavior) and its gate in `test/test-evaluate-guidance.js`.
- `test/test-evaluate-learned-framework.js` (`orphanSuccessOracle`: the scalar branch through `check`, `preflight`, `run` and `score`) and `test/test-contract-oracles.js` (`checkSuccessSeparationLinking`: the structured branch over the routing suites, scored by the engine over the stored runs).
- Baselines `test/fixtures/evaluate/mutation/evals/verdict-ci`, `evaluate-mcp/evals/grader`, `evaluate-api/evals/grader` (`baseline/`): re-recorded with `compare --accept` in disposable copies.

## Tasks & Acceptance

**Execution:**

- [x] Engine `satisfaction.ts` -- count an oracle only when a behavior lists it, in the scalar and the structured branch, with the reason text naming the behavior link
- [x] Engine tests, docs, CHANGELOG, `npm run validate` green; engine review round
- [x] Engine release 7.1.0 -- `npm view eval-quality version`
- [x] TeA floor, lockfile, guard, message, docs reference, AD-5 record and mirrors, CHANGELOG
- [x] TeA scalar test (`test:evaluate-learned-framework`) and structured test (`test:contract-oracles`), each proved by a real revert
- [x] TeA contract guide sentence and its gate
- [x] Re-record the three accepted baselines on 7.1.0; `test:evaluate-ci` passes
- [x] Story record, sprint row 1.104 to `done`, Story 1.102's row and record from `review` to `done`

**Acceptance Criteria:**

- Given a scalar CLI contract with an exact exit-code and whole-stdout oracle that no behavior references, when the engine evaluates coverage, then it reports `success-indicator-separation` unsatisfied; linking the oracle to a behavior satisfies it, and reverting the behavior-link filter makes the negative fixture fail.
- Given the equivalent structured-response contract, when the engine evaluates coverage, then it rejects an unlinked success and payload oracle and accepts the linked one, while the existing valid scalar and structured cases remain satisfied.
- Given the engine release, when TeA adopts it, then peer floor, lockfile and AD-5 record name it, the pantry fixture retains `PASS` because its oracle is behavior-linked, and the three accepted baselines replay on it.
- Given a TeA evaluation whose separating oracle no behavior lists, when `score` runs, then the evidence artifact records the gap, and listing the oracle closes it.

## Outcome Record

Engine: eval-quality PR #183 released as 7.1.0 (owner-run publish, npm `latest`). `success-indicator-separation` used to scan every oracle in the contract. It now counts an oracle only when some behavior lists it in `behaviors[].oracles`, in the scalar-command branch (exit code 0 beside exact whole stdout) and the structured branch (the success indicator beside another roled pointer at one step, in both channels). A contract whose only separating oracle is unlinked reports the rule unsatisfied; the structured reason text became `no behavior-linked oracle addresses operation <id>'s success indicator beside another roled pointer at one step, in both channels`. No shipped contract changes outcome. The release is a minor because the rule tightens.
Engine review: round 1 (Opus adversarial with real mutations) found no material defects. Applied: a CHANGELOG over-claim removed, a false how-to sentence about a `successIndicator` of null corrected, and a reversed-order scalar test added (the oracle's pointers listed in the other order).
TeA: the peer floor moved to `>=7.1.0` in `package.json`, `package-lock.json`, `tools/guard-publish.js`, `test/test-guard-publish.js` (the accepted ranges now start at 7.1.0, and a row refuses a 7.0.1 floor), `test/test-release-metadata.js`, the engine-missing message, `docs/reference/tea-evaluate-cli.md`, the AD-5 spots of `ARCHITECTURE-SPINE.md` and `eval-quality-facts.md` (which now states the rule's link requirement), and the CHANGELOG. TeA compares no link: both new tests read the engine's `coverageGaps` from the evidence artifact. `test:evaluate-learned-framework` gains `orphanSuccessOracle`: the pantry's pair oracle moves into an O-003 beside a narrowed O-001, and the P-001 evidence records the rule unsatisfied with `CONCERNS`; a second folder lists O-003 under a behavior of its own (the defect probes allow one oracle per behavior, so it gets B-003) and records no gap. `test:contract-oracles` gains `checkSuccessSeparationLinking`: the routing contracts score satisfied, unsatisfied with their whole-body oracles listed by no behavior, and satisfied again with the oracles listed under one behavior. The test-review and trace suites stay out of it: their stored-run builders find oracles through the behaviors' requirement links, so an unlinked oracle stops the builder before the engine scores. `contract.md` tells the author that an oracle counts only when a behavior lists it, and `test:evaluate-guidance` holds the sentence. The three accepted fixture baselines (`evaluate/mutation` verdict-ci, `evaluate-mcp` grader, `evaluate-api` grader) were stamped 7.0.1 and are re-recorded with `compare --accept` on 7.1.0.
Fixtures and suites that the engine change touched: none changed outcome. A scan of every committed `contract.json` found no oracle that no behavior lists. `test:evaluate-learned-framework`, `test:contracts`, `test:port-totality`, `test:evaluate-check`, `test:contract-oracles`, `test:evaluate-dogfood`, `test:probe-corpus`, `test:evaluate-authoring` and `test:evaluate-gap-loop` passed unchanged on 7.1.0 before any TeA edit, and the pantry fixture still scores `PASS` with no gap. Only the three baselines needed a re-record, for the version stamp.
Engine CI found the website advisory exception rejecting npm's cache-only report after `http-cache-semantics` 4.3.0 shipped; it was fixed in the same engine PR.

## Revert observations

- Engine (PR #183): reverting the behavior-link filter satisfies the orphan fixtures of both branches, which fails the engine's orphan tests.
- TeA (checked by editing the installed engine's `satisfaction.js` and restoring it byte for byte): the same revert fails exactly one check of `test:evaluate-learned-framework` ("orphan pair oracle did not record success-indicator-separation: PASS, []") and two checks of `test:contract-oracles`, one per routing contract. Deleting the `contract.md` sentence fails `test:evaluate-guidance` ("contract.md success-indicator-separation lacks ..."). Lowering `package.json`'s peer floor to `>=7.0.1` fails `test:release-metadata` ("its floor must be 7.1.0 or later" and a lockfile root mismatch); lowering `ENGINE_FLOOR` in `tools/guard-publish.js` to 7.0.1 fails `test/test-guard-publish.js` ("accepts a manifest with a peer floor of 7.0.1"). Each was restored after the run.
- Replay: baselines stamped 7.0.1 fail `test:evaluate-ci` against the 7.1.0 engine; the re-recorded ones pass.

## Spec Change Log

- 2026-10-04: the engine shipped the change as 7.1.0, a minor, where the plan said a patch. The AC names the release, and a TeA test line was added to Story 1.104 in `epics.md` and `test-design-epic-1.md`.

## Review Triage Log

- Engine round 1 (Opus adversarial): no material defects; three applied changes listed in the Outcome Record.
- TeA round 1 (Opus adversarial, real mutations): found a CHANGELOG line that quoted a reason text the evidence artifact does not carry (its `coverageGaps` hold the rule and predicates only), a `guard-publish.js` comment that said `check` reports the gap (`score` records it), the `contract.md` success-indicator-separation example checking stdout by containment so it never satisfied the scalar branch it teaches (now exact equality, held by the guidance gate), and the `gaps.md` repair row that did not name the behavior link. All fixed in this PR.
