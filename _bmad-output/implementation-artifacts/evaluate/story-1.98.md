---
title: 'Story 1.98: The AI-feature evaluation passes its own CI tiers'
type: 'bugfix'
created: '2026-10-04'
baseline_commit: '0336de6f1db80d2bab52da0e60d1da4fb39142f0'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.98)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.98)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-5)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.104.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and assigned Story 1.98 to lane 3">

## Intent

**Problem:** A clean run of the AI-feature evaluation (`test/fixtures/evaluate-authoring/ai-feature/` and its copies `nightly-deploy` and `tagged-release` under `test/fixtures/evaluate-ci-repos/`) ends red on eval-quality 7.1.0. `ci --tier pr` exits 11 (`oracle-agreement` disagrees on P-006 O-004, P-012 O-004, P-009 O-003 and O-004). `ci --tier release` exits 2 (`twin-run` and `held-out` fail the zero-action floor, `held-out` also the gameability floor, all `no-eligible-probe`) and `scheduled` of `nightly-deploy` exits 0 with the same warnings. Neither ci repository commits a `baseline/`.

**Approach:** Repair the oracles, probes and floors at their cause, in `ai-feature` first and mirrored byte for byte into both ci repositories. Disagreement causes: P-006's mutation raises `minimumLength` (strict threshold is twice it) and P-012's mutation rejects every non-restricted answer, so both also violate O-004 while their defect covers only B-002; P-009's degenerate canned response differs from the correct server on the missing, nonstring and strict steps, so it violates O-003 and O-004 beside the B-001 oracle it is built to separate. Floor causes: eval-quality's `vectorEligible` excludes every `expectedClean` probe, so the zero-action controls P-001 to P-004 can never fill a floor, and the held-out partition (P-011, P-012, P-013) holds no gameability probe.

## Boundaries & Constraints

**Always:**

- Every committed change reaches `ai-feature` and both ci copies; `checkRepositoryPlans` in `test/test-evaluate-ci.js` keeps asserting the copies equal it.
- A probe whose one mutation violates the oracles of two behaviors declares a defect per behavior, each with its own manifestation witness; no oracle is dropped or narrowed to hide a disagreement, and the degenerate P-009 answers like the correct server on every step except the one it games.
- A floor stays only for a class that can have an eligible probe in the partition the check runs on. The zero-action floor goes unless the contract has a mandatory-action behavior whose missing action a zero-action defect probe can expose (`references/corpus.md` line 8); read the contract, decide, and record the reason in the story record (the engine admits no eligible `expectedClean` probe, and P-001 to P-004 are all clean controls). The held-out partition gains a gameability probe (real probe, corpus entry, mutation or canned response, qualification, replay) so the gameability floor stays.
- Any oracle added or moved is listed in a behavior's `oracles` (eval-quality 7.1.0 counts only linked oracles).
- Re-record replay bundles with their manifest, corpus-index digests and baselines with the repository's own tooling; record the cause of each repaired disagreement and floor in the story record.
- Write prose so every claim matches real output.

**Never:**

- Edit `SKILL.md`, `references/ci.md` or `assets/evaluation-ci-plan.template.json` under `src/workflows/testarch/bmad-testarch-evaluate/` (the live capture records pin their digests). The skill's `assets/evaluation.json` and `references/corpus.md` may change, since no file holds their digests.
- Run `compare --accept` in the committed tree, run two evaluate suites at once, or run `test:evaluate-mutation`.
- Touch the engine. Signal only your own processes (LANES rule 13).

## I/O & Edge-Case Matrix

| Scenario                                     | Input / State                       | Expected Output / Behavior                                          | Error Handling   |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------- | ---------------- |
| Clean replay, pr tier                        | each repo with committed baseline   | `ci --tier pr` exits 0, `oracle-agreement` agrees on every probe    | N/A              |
| merge, scheduled, release tiers              | same repos                          | each exits 0, `twin-run` and `held-out` pass, no scheduled warnings | N/A              |
| Violated oracle outside the probe's behavior | mutation M-002 or M-006             | the probe's second defect discharges O-004, no `disagrees`          | N/A              |
| Held-out gameability                         | new held-out degenerate probe       | a gameability probe is eligible in the held-out partition           | check reports it |
| Copy drift                                   | a ci repo differs from `ai-feature` | `checkRepositoryPlans` fails                                        | N/A              |

</frozen-after-approval>

## Code Map

Replay recipe (verified): copy a repo to a scratch dir, `git init` and commit, then from the TeA root `node cli/evaluate.js <check|run|score --run <id>|compare --accept|ci --tier T> --evaluation <scratch>/evals/answer-grade` with `GRADER_SECRET=grader-secret-value-0123` and `GRADER_TOKEN=grader-token-value-4567`; `node_modules/eval-quality` and the TeA package must resolve above the scratch dir (symlinks). `run` takes about 1.5 minutes.

- `test/fixtures/evaluate-authoring/ai-feature/evaluation/contract.json` -- B-001..B-004 each list one oracle O-001..O-004 (O-004 strict boundary, lines 308+).
- `.../probes/P-006.probe.json`, `P-012.probe.json` -- defect D-002 (B-002) and D-006; add the B-004 defect and its witness; `mutations/M-002.mutation.json` (minimumLength 8 to 80), `M-006.mutation.json` (`'reject' : 'reject'`).
- `.../corpus/gameability/P-009.json`, `probes/P-009.probe.json` -- degenerate canned response; make every non-restricted step match the correct server.
- `.../evaluation.json` -- `strengthFloor` (lines 49-53), `heldOutProbes`; the same keys sit in both ci repos' `evals/answer-grade/evaluation.json`.
- `cli/lib/evaluate/evaluator.js` lines 185-227 -- why an undischarged violated oracle records `disagrees` (read only).
- `ai-feature/evaluation/replay/` (`manifest.json` holds every file hash), `corpus-index.json`, `compiled-contract.json`, `sealed-brief.json` -- regenerate after any probe or corpus change; `authoring-inputs.sha256` covers `target/*` only.
- `test/test-evaluate-ci.js` (`checkRepositoryPlans` near 2700) and `test/test-evaluate-authoring.js` -- add the pr tier and local live tier cases over both repos with committed baselines; keep authoring green or re-record with the reason.
- `docs/reference/tea-evaluate-cli.md` (about 1384-1449, 1398) -- floors, release behavior, recorded `/private/tmp` argv; `CHANGELOG.md` `[Unreleased]`.

## Tasks & Acceptance

**Execution:**

- [x] Reproduce each red tier on a clean scratch copy before editing (record exit codes in the story record)
- [x] `ai-feature` probes, corpus, floors -- repair the three disagreement causes and the two floor causes, add the held-out gameability probe
- [x] Mirror every change into both ci repos; regenerate digests and replay with the repository's tooling
- [x] Commit `baseline/` for both ci repos recorded with `compare --accept` in disposable copies
- [x] `test/test-evaluate-ci.js`, `test/test-evaluate-authoring.js` -- pr tier and local live tiers expect exit 0 for both repos; prove each repair by a real revert
- [x] Docs reference, CHANGELOG, story record, sprint row 1.98 to `done`, Story 1.104 row and record already done

**Acceptance Criteria:**

- Given each ci repository with its committed baseline, when `ci --tier pr` runs, then it exits 0 and no oracle disagrees.
- Given each repository, when `ci --tier release` and `scheduled` run locally, then `twin-run` and `held-out` pass, `nightly-deploy` `scheduled` shows no warning, and all exit 0.
- Given any single repair reverted (a second defect removed, P-009's canned step restored, a floor restored, the held-out gameability probe removed), when the suites run, then one fails by name.
- Given the story, when `test:evaluate-ci`, `test:evaluate-authoring` and `npm test` run, then they pass.

## Reproduction

Each repository was copied to a scratch directory with `eval-quality` 7.1.0 and the TeA package linked above it, then checked, run, scored, accepted with `compare --accept` and run through every tier of its plan, before any edit.

| Repository       | `check` | `run` | `score` | `compare --accept` | `ci --tier pr` | `merge` | `scheduled`                                    | `release` |
| ---------------- | ------- | ----- | ------- | ------------------ | -------------- | ------- | ---------------------------------------------- | --------- |
| `nightly-deploy` | 0       | 0     | 0       | 0                  | 11             | 0       | 0, three warnings on `twin-run` and `held-out` | 2         |
| `tagged-release` | 0       | 0     | 0       | 0                  | 11             | 0       | 0, no checks in its plan                       | 2         |

`pr`: `oracle-agreement` read 12 oracle outcomes (4 oracle and probe pairs, 3 trials each) with corroboration `disagrees` in both repositories: P-006 O-004, P-012 O-004, P-009 O-003 and P-009 O-004. `release` and `scheduled`: `twin-run` read `[strength-floor] twin run: the zero-action class does not meet its strength floor 1 (rate null, no-eligible-probe)`, and `held-out` read the same for `zero-action` and for `gameability`. `scheduled` of `nightly-deploy` exits 0 because its floor checks are warnings there.

## Outcome Record

Causes and repairs, each recorded in the `gap-report.md` of the AI-feature evaluation and mirrored byte for byte into both repositories (`probes/`, `corpus/`, `corpus-index.json`; `evaluation.json` differs only by tiers, launch root and keys, as before).

- **P-006 and P-012 O-004.** M-002 raises `minimumLength` from 8 to 80 and M-006 relabels every accepted grade as `reject`. Each therefore violates O-004 as well as O-002, because the doubled strict threshold (160) and the strict boundary answer fall with the normal one, while the probe declared a defect for B-002 only. Each probe now declares a second defect for B-004 (D-009 and D-010) with its own manifestation witness, so the evaluator files a finding for each behavior's oracle and none is left a disagreement.
- **The signature.** A first attempt that added only the defects scored P-006 Invalid (exit 3, `oracle O-002: unwitnessed detection claim`): eval-quality's witness match is per probe, and every defect finding that cites an observation of the home operation has to cite one the probe's single `defectSignature` admits. Each signature is now an `any` over the relations of the probe's two witnesses (selector: any `answer`; the normal-mode branch asks for no `strict` query parameter because a call without a query records `query: null`).
- **Witnesses that differ by reason.** M-002 and M-006 reject the same inputs. A preflight over both partitions, which is what `ci` runs, failed `seeded-faults-scoped` for D-006 and D-010 ("the manifestation witness fires on clean leg \"p-006-manifest-decision-reject\""), where the separate partition runs of Story 1.24 never met it. Every witness now also reads the reason only its mutation produces: `too-short` for M-002 and `accepted` for M-006. D-006 witnesses B-002's own request, the normal-minimum answer, in place of the strict answer it sent before.
- **P-009 O-003 and O-004.** The degenerate answer matched the correct server only on `valid-boundary` and `raw-invalid-json`. On `short`, `strict-boundary`, `strict-short`, `missing` and `nonstring` it answered `pass` or `accepted` without the `mode` field or the 400 the server sends, so it violated O-003 and O-004 beside O-001, the oracle it games. It now answers like the correct server on every step but `restricted`.
- **The zero-action floor.** The contract holds four behaviors (B-001 to B-004) that each respond to a request. None is a mandatory action whose absence a zero-action defect probe could expose (`references/corpus.md`, line 8), and P-001 to P-004 are clean controls, which eval-quality's `vectorEligible` leaves out of the strength vector (`probeClass !== 'canary' && !probe.expectedClean`). No probe of that class can be eligible, so the floor is gone from `strengthFloor`.
- **The held-out gameability floor.** P-015 is a gameability probe for B-004, listed in `heldOutProbes`: its degenerate answer reports `mode: strict` and applies no doubled minimum (`corpus/gameability/P-015.json`, naive oracle O-002). Qualification reads `its degenerate response satisfies O-002 and violates O-004`, and its three trials are `caught`.
- **Replay.** `replay/` was recorded again with `run --partition development`, `run --partition held-out` and `score`, then assembled by copying each run directory (the same layout Story 1.24 committed: no `engine/`, no `trials/` for development, only `evidence-artifact.json` from each score) with a new `manifest.json`. Development run `20261004T143742886Z-a7f14729`, score `20261004T143850660Z-53197c63`: 11 `PASS`. Held-out run `20261004T143852642Z-06c40312`, score `20261004T143928049Z-5b94894e`: 4 `PASS`. Every oracle outcome `agrees`, `defect` and `gameability` read `meets`, `zero-action` reads `undeclared`.
- **Baselines.** `compare --accept` over a clean copy of each repository, recorded on 7.1.0: `nightly-deploy` run `20261004T144023597Z-67d79329`, score `20261004T144203474Z-44a111aa`; `tagged-release` run `20261004T144225272Z-a3e01a36`, score `20261004T144408030Z-ba5f0ef5`. Both carry the recording machine's paths until a later release re-accepts them without them (Story 1.91).
- **Capture records.** Both repositories' `evaluation.json` differ from the bytes the live session wrote by this repair, so each record declares a `migrations` entry for Story 1.98, and the guard in `test:evaluate-ci` reverses it (the zero-action floor back after `defect`, `P-015` off `heldOutProbes`) and compares the rebuilt bytes with the session's digest. Four new guard cases refuse a Story 1.98 migration declared twice, one over a file that never carried the repair, and a floor or held-out edit beyond it.
- **Suites.** `test:evaluate-ci-repositories` is new and chained after `test:evaluate-ci`: the live tiers of both repositories take several minutes each, and `test:evaluate-ci` already weighs 434 seconds in the shard weights, so they get a shard slot of their own. It copies each repository, links the packages its adapter imports, runs each tier its plan places and expects exit 0, no warning, an agreeing `oracle-agreement` and, on `scheduled` and `release`, `meets` for `defect` and `gameability` in the twin run and the held-out partition with `zero-action` undeclared. `test:evaluate-authoring` gains, for both Story 1.24 replays (the AI-feature and the test-review evaluation): every oracle outcome of the scored trials reads `agrees`; in every scored trial the oracles a mutation violates belong to exactly the behaviors its defects declare, and the oracles a degenerate answer violates belong to exactly its probe's behavior; every declared floor has an eligible probe in the development and the held-out partition. The behaviors come from the oracle outcomes of the scored evidence, which hold every contract oracle with its disposition; the qualification evidence lists only the oracles of the declared behaviors, so a check over it could not fail. The `oracleEvidence` of a probe with several defects holds the one mutated-fail reference once per defect.
- **Docs.** The CLI reference says which floors an evaluation can declare and that the held-out partition needs a probe of each. The README's chain count is 116. The CHANGELOG entry sits under `[Unreleased]`.

## Review round 1

Three reviewers found that the behavior-set assertions of `test:evaluate-authoring` could not fail, that the stated reason for leaving the skill starter alone was false, and that the starter and the test-review fixture carried the defects this story repaired in the AI-feature evaluation. Each is fixed in this pull request.

- **The assertions.** The qualification evidence (`mutated-fail.json`, `disciplined-oracle-rejected.json`) lists the oracles of the declared behaviors only (`preflight.js` and `gameability.js` judge against those), so the earlier checks over it passed on the pre-repair fixture. They now read the scored evidence, and the corroboration check requires `agrees` for every outcome. The `isAiFeature` gates are gone, so every fixture the suite covers holds to them.
- **The premise.** The live capture records pin `SKILL.md`, `references/ci.md` and `assets/evaluation-ci-plan.template.json` and no file holds a digest of `assets/evaluation.json` or `references/corpus.md` (`git grep` over both SHA-256 values finds nothing), so the sentence that left the starter alone for its digest was false. The frozen boundary is amended to allow those two files (Spec Change Log).
- **The starter.** `assets/evaluation.json` declared `strengthFloor` `zero-action: 1`, and `references/corpus.md` never said that a `zero-action` floor needs a `zero-action` defect probe (an `expectedClean` probe never counts, `vectorEligible`) in each partition the floor is read on, nor that a `gameability` floor needs a gameability probe in the held-out list. An adopter who followed the starter ended at `ci --tier release` exit 2 `no-eligible-probe`. The starter now declares `defect` alone, `corpus.md` states both rules and the matching `heldOutProbes` rule, the Workflow kind's held-out example says its `zero-action` probe leaves the `defect` floor to another held-out probe (round 2 adds that probe), and `docs/reference/tea-evaluate-cli.md` agrees. The edit followed the builder's Edit process headless; Analyze (five lenses) found 0 critical and 0 high, and the medium findings that named this change were adopted. `test:evaluate-guidance` pins each new sentence and the starter's floor.
- **The test-review fixture.** Its held-out replay held 15 `disagrees` outcomes (P-010 O-002, P-012 O-002, P-013 O-001, O-002 and O-003, three trials each). M-005 (P-010) and M-007 (P-012) make a disabled test also report `missing-assertion`, which violates O-002 beside the declared oracle; M-008 (P-013) refuses every valid request, which violates O-001, O-002 and O-003 beside O-004. Each probe now declares a defect for each behavior its mutation violates (D-014 to D-018) with a witness that reads what its mutation answers, and a signature that is an `any` over its witnesses. The zero-action floor is gone (P-001 to P-004, P-014 and P-016 are all `expectedClean`, and no behavior is a mandatory action), and P-015 is a held-out gameability probe for B-003 (every valid test flagged as disabled) with its corpus entry. `corpus-index.json` and the replay with its manifest were recorded again (development run `20261004T153853981Z-9917552f`, held-out run `20261004T153935491Z-36dee75e`; 12 and 5 `PASS`, every outcome `agrees`, `defect` and `gameability` `meets`), `gap-report.md` has the repair section, and a run of both partitions together preflights all 17 probes and scores each `PASS`. The fixture commits no baseline. `test:evaluate-gap-loop` copies the Story 1.24 evaluation, so its accounting of what differs from the blind-loop copy lists the Story 1.98 files.
- **The capture guard.** `reverseStory98Migration` refuses a file that still declares the `zero-action` floor, and no case exercised that branch. A case now sends such a file with `P-015` appended and expects `declared migration could have produced`. With the branch deleted the guard said `[]` for that file, so the case fails there.

## Revert observations

Each revert ran the suite over real bytes and restored them; the suites pass again afterwards. The two behavior-set messages quoted below are the round 1 wording; review round 2 replaces them (see its section). The `test:evaluate-authoring` checks run over the fixtures of `origin/main` (5c08bc1b, recorded before the repair) in a scratch tree that links the repository's `cli/` and `node_modules/`, with each check alone and the floors reduced to `defect` so that no other check fails first.

- **A second defect removed (AI-feature P-006).** The pre-repair evidence holds O-004 `disagrees` for P-006, and the scored trials violate B-002 and B-004 where its one defect declares B-002: `test:evaluate-authoring` fails `development P-006 mutation violates the oracles of behaviors its defects do not declare` (corroboration alone: `development P-006 has an oracle whose judgment the evidence does not corroborate`, `O-004 disagrees` three times).
- **P-009's canned steps restored.** The pre-repair evidence violates B-001, B-003 and B-004 where P-009 games B-001: `development P-009 degenerate response violates the oracles of behaviors other than B-001`. The tier effect is the reproduction above: P-009 O-003 and O-004 `disagrees`, `ci --tier pr` exits 11.
- **The AI-feature floor restored.** `zero-action: 1` back in `evaluation.json`: `ai-feature declares a zero-action floor that its development partition holds no eligible probe for`. The tier effect is the reproduction: `release` exits 2 on `no-eligible-probe`.
- **The AI-feature held-out gameability probe removed.** `P-015` off `heldOutProbes`: `ai-feature P-015 section/partition mismatch`.
- **The test-review replay before its repair.** Over `origin/main`'s bytes, corroboration alone fails `held-out P-010 has an oracle whose judgment the evidence does not corroborate` (`O-002 disagrees` three times), and the mutation check alone fails `held-out P-010 mutation violates the oracles of behaviors its defects do not declare` (violated B-001 and B-002, declared B-001). The gameability check passes there: P-009 and P-017 already violate only their own behavior.
- **The test-review floor restored and its held-out gameability probe removed.** `test-review declares a zero-action floor that its development partition holds no eligible probe for`; `test-review P-015 section/partition mismatch`.
- **The capture guard.** In `nightly-deploy`'s `evaluation.json`, the floor back after `defect`, and `P-015` off `heldOutProbes`, each stop `test:evaluate-ci` at `nightly-deploy: evaluation.json differs from the AI-feature evaluation beyond tiers, launch and keys`, before the capture-record guard runs. The guard's own cases fail where they should: with the `zero-action` branch of `reverseStory98Migration` deleted, `a Story 1.98 migration over an evaluation.json that declares the zero-action floor beside the held-out gameability probe did not fail with "declared migration could have produced"; the guard said []`.

## Review round 2

Two reviewers found that the corpus guide stated the floor rule for the held-out list alone, that its own worked kinds broke the rule it teaches, that the Workflow sentence was unpinned, and that one behavior-set message of `test:evaluate-authoring` was wrong when it fired alone. Each is fixed in this pull request.

- **The floor rule.** The twin run repeats the partition `baseline/` recorded (`twinSettings` in `cli/lib/evaluate/ci.js`), which is the whole corpus for a `both` baseline only; `compare --accept` takes the most recent run, and the skill's flow produces development and held-out baselines. `references/corpus.md` (lines 8, 11 and 19) now says that a `zero-action` floor needs a `zero-action` defect probe in that partition and in `heldOutProbes`, that every class `strengthFloor` declares needs an eligible probe in the development partition and in `heldOutProbes` (hold one probe of the class out and keep another in development, or declare no floor for the class), and that `strengthFloor.gameability` waits until both partitions hold a gameability probe, because one probe cannot sit in both. `docs/reference/tea-evaluate-cli.md` states the same.
- **The worked kinds.** The engine's `vectorEligible` leaves out canaries and every `expectedClean` probe, and `decide` in `aggregate-strength.js` reads `no-eligible-probe` for a class with no eligible probe. A script over the engine's own `buildStrengthVector` (`core/score/strength.js`) with each kind's worked probes split into the development partition and the held-out list reads, for all six kinds: `defect` eligible in both partitions. The Workflow kind had none in the held-out list, since P-006 is a `zero-action` defect probe and P-007, the only probe of B-002, has to stay in development (a held-out behavior keeps a development probe). It now holds out P-008, a `defect` probe of B-002 (M-003, unseen reservation R-19, the P-007 relation over a new input), and its held-out sentence names it. The other five kinds keep P-006 alone as held out. Listing P-004 beside P-006 would leave the development partition with no gameability probe, so a twin run over a development baseline would read `no-eligible-probe` for a declared `gameability` floor; the guide instead leaves that floor undeclared until a second gameability probe exists, and the starter declares `defect` alone. The guide ships fragments and a placeholder contract, so there is no runnable evaluation to copy. The real flow over the Skill-derived AI-feature evaluation is `test:evaluate-ci-repositories` (round 1: every tier exits 0), and the per-kind check is now in `test:evaluate-guidance`: every starter floor class needs a non-clean probe of its class in each worked partition, which fails for any kind whose development or held-out list loses its `defect` probe.
- **The pins.** `test:evaluate-guidance` pins every new or rewritten sentence of the three rules, the five Workflow sentences, the P-008 lead-in and the four CLI reference sentences, and checks P-008's class, behavior, mutation, severity, witness and signature. In a scratch copy I removed each of the 19 sentences from its file and ran the suite: all 19 runs failed, each naming the missing sentence. The claim that the suite pins each new sentence is true.
- **The messages.** The behavior-set check is two assertions per trial, printing `trial n violates the oracles of [..] where the probe declares [..]`: `<label> <subject> violates a behavior the probe does not declare` and `<label> <subject> leaves a declared behavior held` (subject: mutation, degenerate response or clean control). They run before the corroboration assertion, so each fires alone for its own case; the corroboration assertion catches an outcome that is `not-evaluable` or disagrees for another reason. The round 1 message ("violates the oracles of behaviors its defects do not declare") fired for the second case too, which it described wrongly.

### Round 2 revert observations

- **A violated behavior the probe does not declare.** Over the pre-repair fixture of `origin/main` (floors reduced to `defect`): `development P-006 mutation violates a behavior the probe does not declare: trial 1 violates the oracles of [B-002, B-004] where the probe declares [B-002]`.
- **A declared behavior no trial violates.** In a scratch copy of the AI-feature evaluation, P-006 declares a third defect for B-003 whose witness only M-002 satisfies (its own leg ID), `corpus-index.json` regenerated, `run --partition development` and `--partition held-out` recorded and scored (exits 0), the replay assembled with the manifest: `development P-006 mutation leaves a declared behavior held: trial 1 violates the oracles of [B-002, B-004] where the probe declares [B-002, B-003, B-004]`. The round 1 test over the same bytes failed with `development P-006 mutation violates the oracles of behaviors its defects do not declare`, which names the wrong case.
- **Suites run after the edits:** `test:evaluate-guidance` and `test:evaluate-authoring` pass. `test:evaluate-gap-loop`, `test:evaluate-ci`, `test:evaluate-dogfood`, `test:doc-counts`, `test:doc-claims` and `test:changelog` run in CI on this round's bytes.
- **Analyze.** One agent ran the five lenses over the `corpus.md` diff and checked the worked Workflow and Skill corpora against the engine: 0 critical, 0 high.

## Verification

- `ci --tier pr`, `merge`, `scheduled` and `release` over a copy of each repository with its committed baseline (`npm run test:evaluate-ci-repositories`, 8 minutes 39 seconds after review round 1): every tier exits 0 with no warning, `tagged-release` runs `pr`, `merge` and `release` (its plan places no `scheduled` check), `nightly-deploy` runs all four, and `oracle-agreement` reads `0 oracle outcome(s) that disagree or cannot be evaluated`.
- `npm run test:evaluate-authoring`: both suites replay byte for byte under the new assertions, which read the scored evidence and cover both fixtures.
- `npm run test:evaluate-ci`: 30 cases pass in 4 minutes 3 seconds, the capture-record guard with its five new cases among them.
- `node cli/evaluate.js check` over the AI-feature evaluation: no authoring defects; `digest` indexes 39 files; the test-review evaluation checks clean and its `digest` indexes 44.
- Also run and passing after review round 1: `test:evaluate-guidance`, `test:evaluate-gap-loop`, `test:evaluate-boundaries`, `test:evaluate-dogfood`, `test:ci-coverage` (116 chained steps), `test:ci-coverage-filters`, `test:shards`, `test:suite-manifest`, `test:doc-counts`, `test:doc-claims`, `test:changelog`, `test:release-metadata`, `test:schemas`, `test:conflict-markers`, `test:bmad-output-gated`, `lint`, `lint:md`, `format:check`, `docs:validate-links` and `docs:build`.
- Not run here: the full `npm test` chain, whose other scripts do not read a file this story changed. A first held-out attempt of the replay recording stopped at qualification with exit 12 (`another process listens on 127.0.0.1 port ...`) while other sessions ran suites on the same machine, and the retry passed; the shard weight of `test:evaluate-ci-repositories` is the local wall time (530 seconds) until a CI run refreshes it.

## Spec Change Log

- 2026-10-04: the repository tiers run in a new suite, `test:evaluate-ci-repositories`, in place of `test/test-evaluate-ci.js`, for its wall time. `test-evaluate-ci.js` keeps the capture-record guard. `epics.md` and `test-design-epic-1.md` record it under Story 1.98.

- 2026-10-04 (review round 1): the premise for leaving the skill alone was false. The live capture records pin the digests of `SKILL.md`, `references/ci.md` and `assets/evaluation-ci-plan.template.json` only; no file holds the digest of `assets/evaluation.json` or `references/corpus.md`. The `Never` boundary now forbids editing the three pinned files and allows the two others, and the starter and the corpus guide are repaired. `epics.md` and `test-design-epic-1.md` record it under Story 1.98.

## Review Triage Log
