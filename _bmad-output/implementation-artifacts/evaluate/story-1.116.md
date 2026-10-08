---
title: "Story 1.116: Hold each exit's class against its AD-10 row in the dogfood contract"
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'ec0f6fe9'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.116; Story 1.46)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.116 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-10, AD-15)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.46.md (the dogfood folder and its record)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.113.md (the record format)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/epic-1-proof.md'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** O-003 of the dogfood contract reconciles the `list-exit-table` step's `/exits` records against the reference set `exit-table` by id (`covers-by-key`) and tests each record's class against the table's class vocabulary (`for-all` over `set-membership`).
A complete reply that swaps the classes of `tea-evaluate 11` and `tea-evaluate 12` covers every id and keeps both classes in the vocabulary, so it passes O-003.
CodeRabbit raised it on Story 1.46's PR, and Story 1.46 left it because a reference set holds one key and a contract change supersedes the recorded live PASS.

**Approach:** O-003's `for-all` predicate becomes an `any` of one `all` pair of `equality` checks over `@/id` and `@/class` per row of the table, so each id is held to its own class.
The records of `tea-evaluate 11` and `tea-evaluate 12` compare their class with the answer the `classify-exits` step gave for the same exit, which O-001 holds to the table.
That keeps M-001 and M-002 scoped to O-001: both mutations edit one of those two rows, the listing step reads the same edited table, and a pair holding the row's literal class would make O-003 violate beside O-001 and read `corroboration: disagrees` on P-002 and P-003.
`test:evaluate-dogfood` holds the predicate equal to the table, replays a listing that swaps the two classes and a class changed in `references/gaps.md` with no contract edit, and shows a class vocabulary test alone passing both.
The contract digest moves, so the folder is restamped and the recorded live PASS of Story 1.46 is superseded by the live phase the coordinator starts separately.

## Boundaries & Constraints

**Always:** The new check moves only when a listed class differs from the table, or, for the rows of exits 11 and 12, when the listing disagrees with the `classify-exits` answer.
Each seeded probe violates only the oracles of its own behavior, and every oracle outcome of every probe reads `agrees`.
The reference set `exit-table` and the `/exits` collection location stay as Story 1.46 left them.
No live run: the offline replay over real eval-quality is the gate, and the live preflight, development run and held-out run are the coordinator's second phase.
The engine check runs at start and end.

**Never:** A guide edit (`SKILL.md`, `references/`), a new probe, mutation, behavior, oracle or story, a change to `package.json` or `package-lock.json`, a live Claude Code run, a claim in `epic-1-proof.md` that the live phase has not produced.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                       | Input / State                                                                                   | Expected Output / Behavior                                                           | Error Handling |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------- |
| Clean listing                  | the committed guide, unswapped reply                                                            | the run passes; every oracle `held`                                                  | n/a            |
| Swapped listing                | a complete reply whose records swap the classes of `tea-evaluate 11` and `tea-evaluate 12`      | O-003 `violated` alone; the run stops at the exit-table control (P-006) with exit 11 | exit 11        |
| Vocabulary test alone          | the swapped reply against O-003 as Story 1.46 left it                                           | every oracle `held`, which is why the case discriminates                             | n/a            |
| Class changed in the guide     | the `eval-quality 3` row of `references/gaps.md` reads `runtime fault`, no contract edit        | O-003 `violated`; exit 11 at the control; the guidance test also fails               | exit 11        |
| Class changed, vocabulary only | the same guide edit against O-003 as Story 1.46 left it                                         | every oracle `held`                                                                  | n/a            |
| Seeded row edit                | M-001 (row 11) and M-002 (row 12) over the committed contract                                   | P-002 and P-003 `caught`; only O-001 violated; every `corroboration` `agrees`        | n/a            |
| Dropped row                    | M-004 (row 13 gone)                                                                             | O-003 `caught` by `covers-by-key` as before                                          | n/a            |
| Predicate drift                | O-003's pairs differ from the table's rows, or O-001 stops pinning exits 11 and 12 to the table | `test:evaluate-dogfood` fails naming the drift                                       | test failure   |

</frozen-after-approval>

The frozen block was written for this build from the story's acceptance criteria as amended in `epics.md` on 2026-10-04.

## Code Map

- `test/evaluations/bmad-testarch-evaluate/contract.json`: O-003's `check` (the `for-all` predicate), `commentary` and `direction` (scope, negative domain, the two `classify-exits` evidence targets); B-003's `description`, `observableSuccessCriterion` and `riskLinks`.
- `test/evaluations/bmad-testarch-evaluate/requirements.md` (B-003's sentence, the admissible-evidence sentence on the `exit11` and `exit12` answers, the boundary condition and the feared failure), `corpus/README.md` (the P-006 row and the `per-record` sentence), `probes/P-006.probe.json` (`rationale`).
- Restamped: `requirements.md`'s digest in `contract.json` (`sourceSpecDigest`) and `evaluation.json` (`requirements.digest`); `corpus-index.json` through `tea-evaluate digest`.
- `test/test-evaluate-dogfood.js`: the static pair assertion and the O-001 pin, the scoping assertions over every scored probe, `SWAPPING_RUNNER`, `replayOf`, the `trim` option taking a probe ID, the five replay cases, and the `no-quantifier` revert variant dropping the targets only the pairs read.
- `epics.md` (Story 1.116 amendment), `test-design-epic-1.md` (Story 1.116 rows), `CHANGELOG.md`, `sprint-status.yaml`, this record.
- Not changed: the skill's guides and `SKILL.md`, the seeds M-001 to M-005, the other probes, `docs/` (no text describes how O-003 checks classes), `epic-1-proof.md` (the live phase writes its section), `package.json`, `package-lock.json`, the dogfood evaluation's CI plan and `tiers`.

## Tasks & Acceptance

- [x] Reproduce through the real CLI on the unchanged code: the replay of a listing that swaps the two classes.
- [x] `contract.json`: the pairs, the commentary and direction, B-003's text; the requirements, README and P-006 text; the restamp.
- [x] `test:evaluate-dogfood`: the cases, each with its revert check below.
- [x] Docs grep, `epics.md`, `test-design-epic-1.md`, `CHANGELOG.md`, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.116, with the amendment dated 2026-10-04 there.
The live preflight, development run and held-out run recorded in `epic-1-proof.md` belong to the second phase and are not part of this build.

## Reproduction

Run first on the unchanged code (`dc9df4d0`, extracted with `git archive` to a scratch directory under the scratchpad, `node_modules` and `_bmad` linked), through the real CLI and over real eval-quality.
The tree fails `check` on the `tiers` finding described under Gates, so the scratch copy alone set `tiers` to `["pr"]` to let `run` start.
The replay's trial of the exit-table control (P-006) with the reader's reply swapping the classes of `tea-evaluate 11` and `tea-evaluate 12` exited 0 with no oracle violated: `swapped {"exit":0,"violated":[]}`, beside the clean listing's `clean {"exit":0,"violated":[]}`.
That is CodeRabbit's finding: both ids are covered and both classes are in the vocabulary, so O-003 passes.

## Decisions

1. **The pairing is the third engine kind: a `for-all` whose predicate is an `any` of per-row `all` pairs.**
   `eval-contract.schema.json` has `covers-by-key` with one `expectedKey` and one `actualKey`, so a second reference set can check that a class is present in the listing and cannot tie it to an id.
   An `all` of one `equality` per id has no element to address: the bound-element pointer `@/` is legal only inside a quantifier, so each pair needs the `for-all` anyway.
   The `any` over rows lets each record satisfy the pair of its own id, and a record whose id and class come from two different rows satisfies none.
2. **The pairs stay in O-003 and do not move to a step of their own.**
   A per-behavior step would ask the same table question of the same mutated guide, so a seeded edit of row 11 or 12 would change that step's reply as it changes the listing's, and its oracle would violate beside O-001.
   The scoping comes from what the pair compares against, which a new step cannot change.
   B-003 keeps one oracle (NFR5), and the listing step stays the one place a record is read.
3. **Rows 11 and 12 compare against the `classify-exits` answers, and every other row against its literal class.**
   M-001 and M-002 each edit one of those rows.
   The preflight's `seeded-faults-scoped` reads the witness relation on clean legs and qualified both probes before and after, so it does not show the problem.
   The scoring does: with the literal class in the pair, P-002's O-003 outcomes were `confirmed`, `violated` and `disagrees` in all five trials, because the engine finds no defect finding that cites O-003 on a probe whose signature names the `classify-exits` field.
   A baseline holding a `disagrees` outcome is a block at the `pr` tier replay (AD-10, exit 11), which Story H.1 will run.
   Under the cross-step pair the same trials read O-003 `held` and `agrees`.
   O-001 stays the absolute holder of exits 11 and 12 (it equals each answer to the table's class), so the pair of those two rows is a consistency check between two questions the skill answers from one table.
   The cost: a wrong `classify-exits` answer with a correct listing also violates O-003.
   Both oracles fail on a real defect in that case, so no verdict changes.
   A listing and a `classify-exits` answer that carry the same wrong class fail O-001 alone, which is what M-001 and M-002 seed (the scoping assertion holds it), so for those two rows B-003's class criterion is held together with B-001's.
   In a live run the two answers come from separate model calls, and a disagreement between them violates O-003 on a clean control and stops it at qualification (exit 11); the live phase measures how often that happens.
   The same exposure holds in the mutated arms of P-002 and P-003: two calls that disagree on row 11 or 12 under M-001 or M-002 violate O-003, no defect finding cites it, and the engine records `corroboration: disagrees`, which still scores `PASS` and blocks a `pr` tier replay at exit 11.
   The live proof therefore holds, on every live evidence artifact, that each oracle outcome reads `agrees` and that a seeded probe violates only the oracles of its own behavior, the two scoping assertions of the replay.
4. **The class vocabulary test is dropped, since the pairs contain it.**
   A record whose class is outside the vocabulary matches no pair.
   `test:evaluate-dogfood` still builds the vocabulary test (as `vocabularyOnly`) to show it passing the swapped listing and the changed guide row.
5. **O-003's direction names the two `classify-exits` pointers.**
   `compile` refuses a contract whose `evidenceTargets` are not contained in the check (`direction-check-misaligned`, exit 4), which the `no-quantifier` and `vocabularyOnly` variants hit and now drop the targets with the pairs.
6. **The swapped reply is a runner wrapper in the replay, and the failing cases read the run's own exit.**
   `SWAPPING_RUNNER` runs the reader and swaps the two classes in the JSON before printing, so the guide stays correct and only the listing is wrong.
   The run refuses a clean control whose baseline violates its own oracle (exit 11, `the clean control's baseline does not pass`), so `replayOf` reads the violation from `qualification/P-006/baseline-pass.json` in that case and from the clean trial's records otherwise.
7. **The guide case changes the `eval-quality 3` row to `runtime fault`.**
   A swap of rows 11 and 12 in the guide fails earlier, at the preflight's `input-sensitivity` check (exit 3), so it needs no case of its own.
   Changing a row to another class of the vocabulary is the edit a vocabulary test cannot see, and the guidance test's own AD-10 table check fails on it as well.
8. **No seeded probe for a listing swap.**
   P-007 already seeds B-003 through the dropped row, and the pairs are held by a trial of the control.
   A new mutation would need its own live qualification, and nothing in the acceptance criteria asks for one.
9. **The restamp touched three files and no other.**
   Editing `requirements.md` moved its digest, restamped by hand into `contract.json` (`sourceSpecDigest`) and `evaluation.json` (`requirements.digest`), as Story 1.46 did.
   Editing `corpus/README.md` and `probes/P-006.probe.json` moved the corpus digest, restamped by `tea-evaluate digest` into `corpus-index.json`.
   The contract's own digest is recorded only in run records (`epic-1-proof.md` names `sha256:1592b16f…` for Story 1.46's development run), so no committed stamp names it.
   The scoring policy, the evaluator conditions, the suite manifest (`test:eval-schemas`) and every other probe and mutation carry no digest of the contract and did not change.
   `check`, `eval-quality compile` and `eval-quality seal` exit 0 on the result.
10. **No documentation text changes.**
    A search of `docs/`, `src/` and the Evaluate references for O-003, the exit table, `covers-by-key` and per-record class checks finds one line that describes the suite (`docs/explanation/eval-quality-adoption-guide.md`), which states probe counts the story leaves as they are.

## Implementation Notes

- The pairs are generated from the table's rows in order, 13 alternatives, 11 distinct classes.
  The three `wiring defect` rows (`eval-quality 64`, `tea-evaluate 64`, `eval-quality-gates 64`) show why a vocabulary test cannot hold a class to its source: any of them passes under any other's id.
- `test:evaluate-dogfood` reads the table from `references/gaps.md`, so a row added or reclassified there fails the static pair assertion until the contract follows.
- The scoping assertions run over the nine scored probes of the existing replay, so they add no run.
  The five new replay cases are single-trial runs of P-006 and each takes about seven seconds.

## Revert observations

Every row ran once on a scratch copy of the final tree under the scratchpad directory (`.git` removed, `node_modules` and `_bmad` linked), the named change applied, `node test/test-evaluate-dogfood.js` run there, and the scratch copy removed.
The test stops at its first failed assertion, so each row records that assertion.

| Revert (the one edit)                                                                                          | Observed                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-003 back to the vocabulary test, evidence targets restored (the check removed)                               | 1 assertion fails first: `O-003 pairs each record with the class its row of the exit table gives it`; the in-test case on this contract shows the swapped listing exit 0 with no oracle violated  |
| Rows 11 and 12 hold the literal class (the pairs kept, the cross-step comparison removed; test's pin disabled) | 1 assertion fails: `P-002 records an oracle outcome whose corroboration is not agrees` (O-003 violated beside O-001 in five of five trials)                                                       |
| One class of the `references/gaps.md` table changed (`eval-quality 3` to `runtime fault`), no contract edit    | `test:evaluate-dogfood` fails on the pair assertion (1 failure); `test:evaluate-guidance` fails on `gaps.md AD-10 exit mapping changed` (1 failure); the replay case exits 11 with O-003 violated |
| The class vocabulary alone against the changed guide row, and against the swapped listing                      | both replay cases read exit 0 with no oracle violated, so the cases discriminate                                                                                                                  |
| The `for-all` or `covers-by-key` removed from O-003 (Story 1.46's variants)                                    | still `CONCERNS` with `per-record` and `omission-and-completeness`; the `per-record` variant also drops the pairs' evidence targets so `compile` accepts the edit                                 |

The reproduction on the unchanged tree is the before state of the first row: the swapped listing passes (`exit 0`, no oracle violated).

## Gates

Run on the final tree, one host-heavy gate at a time.
No full local `npm test`: the hook and CI carry the chain.

The build started from `dc9df4d0`, where `test:evaluate-pr-suite`, `test:evaluate-dogfood` and `test:evaluate-authoring` failed on a `[tiers]` finding of the CI plan check (Story 1.96).
`ec0f6fe9` (#348) declared the tiers of the pr-only evaluations, and the final tree is rebased onto it.
The gates below ran green on the committed tree:

- `npm run test:evaluate-dogfood`: green, with the five new replay cases, the scoping assertions and the pair assertion.
- `npm run test:evaluate-pr-suite`: `check`, `compile` and `seal` exit 0 and `tea-evaluate ci --tier pr` exits 0.
- `npm run test:evaluate-check` 1,232 checks, `test:evaluate-authoring`, `test:evaluate-guidance`, `test:doc-counts`, `test:doc-claims`, `test:bmad-output-gated`, `test:changelog`, `lint`, `lint:md`, `format:check`: green.
- `test:evaluate-ci`, `test:evaluate-gap-loop`, `test:eval-schemas`, `test:shards` 183 and `test:ci-coverage`: green on the build tree before the rebase.
- `node cli/evaluate.js check`, `eval-quality compile` and `eval-quality seal` over the folder: exit 0.

`npm run docs:validate-links` and `npm run docs:build` did not run: no file under `docs/` changed.
The live proof (Stage 6 preflight, development run and held-out run through the local Claude Code CLI) is recorded in `epic-1-proof.md`.
Live proof, measured at PR #352 head `6ff6384c0773ade3421a75e30c819a336b398a65` from a clean standalone clone (`dirty: false`): preflight exit 0 with five seeded probes qualified and each rollback proved, the development and held-out runs exit 0, all four clean controls `passed-clean-control` and all five seeded probes `caught` in five of five trials, nine evidence artifacts `PASS` with `exitCode: 0`, every oracle outcome `agrees`, and each seeded probe violating only its own behavior's oracle (P-002 and P-003 O-001 alone, P-005 O-002, P-007 O-003, P-009 O-004); `eval-quality score` run directly reproduces all nine byte for byte.
`git diff -- package.json package-lock.json` is empty.
The engine check (`evaluateTarget` is a function) ran at the start and the end: exit 0.

## Build review

Round 0: one subagent reviewed the uncommitted change in three lenses (design, test quality, compliance), read only, in place of `/bmad-code-review`.
It also ran two scratch copies of the replay (the tier line forced to `["pr"]`) and confirmed the design: the literal-class variant fails only the corroboration assertion, with O-003 `disagrees` on P-002.
Every finding was checked against the files before it was acted on.

| Finding                                                                                                                                                      | Verdict | Route                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium: for rows 11 and 12 a listing and an answer with the same wrong class pass O-003, and nothing states it                                               | valid   | Stated in Decision 3 and in the `epics.md` amendment: that case fails O-001 alone, which M-001 and M-002 seed and the scoping assertion holds, so B-003's criterion is held with B-001's |
| Medium: the cross-step pair couples B-003 to B-001, and in a live run two model calls that disagree violate O-003 on a clean control                         | valid   | Stated in Decision 3: the coupling is the price of the scoping, no verdict changes on a real defect, and the live phase measures the disagreement rate                                   |
| Low: the preflight's `seeded-faults-scoped` and `seeded-fault-fired` assertions pass under the literal variant, so the epics text that credits them is wrong | valid   | The `epics.md` amendment names the corroboration and violated-oracle assertions as the guard and says the preflight qualifies both seeds under either design                             |
| Low: the CHANGELOG sentence says both cases fail under a vocabulary test, which reverses the meaning                                                         | valid   | Reworded: a vocabulary test alone passes both, so the cases fail it                                                                                                                      |
| Low: "in place of the pairs" in a revert cell is an "instead of" tail                                                                                        | valid   | Reworded in `test-design-epic-1.md`                                                                                                                                                      |
| Low: `requirements.md` kept the phrase "out of scope" in a paragraph the diff touched                                                                        | valid   | Reworded to "inadmissible"; the requirements, contract and `evaluation.json` digests restamped, `corpus-index.json` regenerated                                                          |
| Low: the README's per-record bullet omitted the cross-step rows                                                                                              | valid   | The bullet names them                                                                                                                                                                    |
| Low: AC bullet 3 asks for live records the diff does not hold                                                                                                | checked | No change: the live preflight, development run and held-out run are the coordinator's second phase, and `epic-1-proof.md` gets no section until they have run                            |

Round 0 left no finding open.
Round 1 (Opus, three lenses on PR #352 at `6ff6384c`, read only, each in its own scratch worktree):

| Lens        | Result  | Findings                                                                                                                                                                                                        |
| ----------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| adversarial | changes | Medium: Decision 3 named the live risk for the clean control only; under M-001 or M-002 two calls that disagree on row 11 or 12 record `corroboration: disagrees`, which a `PASS` verdict does not show. Valid. |
| tests       | pass    | Twelve mutants, each run by the lens on `node test/test-evaluate-dogfood.js`; every one fails where it should (recounted below). The suite runs in 70 seconds.                                                  |
| compliance  | changes | Low: Gates described the tree before the rebase onto `ec0f6fe9`, and `baseline_commit` named `dc9df4d0`. Valid. Low: one "never `SKILL.md`" tail in the lane 5 text of `epics.md`. Valid.                       |

All three findings are fixed in the round 1 push: Decision 3 and the `epics.md` amendment state the mutated-arm exposure and require every live oracle outcome to read `agrees` with a seeded probe violating only its own behavior's oracles; Gates, `baseline_commit` and the lane 5 sentence are corrected.
The adversarial lens also ran ten replies through the real CLI: a duplicate id with a wrong or a right class, row 11 relabelled as id 12, an extra record, a missing class, row 11 given the exit 12 answer, a case-only and a trailing-space difference, and a `classify-exits` reply that is not JSON.
Each exits 11 with O-003 alone violated.
A listing and a `classify-exits` answer that carry the same wrong class, four cases, leave O-001 alone violated, as the amendment states.

The tests lens's mutants, recounted:

| Mutant                                                                             | Result                                                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| O-003 back to the vocabulary-only `set-membership`                                 | exit 1 at the static pair assertion                                                         |
| the same with the static assertion disabled                                        | exit 1 at the swapped-listing case: `{exit: 0, violated: []}`                               |
| literal class on rows 11 and 12                                                    | exit 1 at the static pair assertion                                                         |
| the same with the static assertion disabled                                        | exit 1 at `P-002 records an oracle outcome whose corroboration is not agrees` (`['O-003']`) |
| the same with the scoping loop removed too                                         | exit 0 in 78.5 seconds: the scoping assertion is the only guard of that design              |
| the swap runner does no swap                                                       | exit 1 at the swapped-listing case                                                          |
| the swap runner sets `status: refused` and keeps the classes                       | exit 1 at the vocabulary-only case (`{exit: 11, violated: [O-003]}`)                        |
| `eval-quality 3` changed to `runtime fault` in the guide                           | exit 1 at the static pair assertion; with it disabled, exit 1 at preflight (`exited 11`)    |
| `tea-evaluate 11` changed to `infrastructure` in the guide                         | exit 1 at the O-001 pin assertion                                                           |
| the swap runner also sets the `classify-exits` `exit11` answer to `infrastructure` | exit 1 at the vocabulary-only case (`{exit: 0, violated: [O-001]}`)                         |

The coordinator runs the later rounds on the open PR.
