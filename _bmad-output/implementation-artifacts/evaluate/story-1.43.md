---
title: 'Story 1.43: Keep ungraded framework errors out of target findings'
type: 'bugfix'
created: '2026-10-01'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a776042a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.20, 1.23 and 1.43)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.20 error-row note and the Story 1.43 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-10, AD-21)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.20.md and story-1.23.md (the error-row rule this story supersedes)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The promptfoo fixture evaluator (`test/fixtures/evaluate-promptfoo/evals/summary/evaluator/promptfoo.mjs`) and the Evaluate skill's starter template (`src/workflows/testarch/bmad-testarch-evaluate/assets/evaluators/promptfoo-assertions.mjs`) turn a promptfoo result with no `gradingResult` and a concrete `error` string into a failing judgment row that cites the target's stdout. That result says the framework could not grade the output (an assertion crashed). It does not establish that the target violated an oracle, yet the row scores as a caught target defect.

**Approach:** Both evaluators refuse a result whose `gradingResult` is absent or null, whether or not it carries an `error`, with a diagnostic that names the ungraded framework error. The evaluator exits non-zero, so `tea-evaluate run` ends as evaluator infrastructure failure (exit 12) and writes no sealed trial record for that trial. A graded `pass: false` assertion still maps to a cited target `fail` row and a graded `pass: true` to `pass`. The imported result must carry every expected assertion grade exactly once; a missing, duplicate or malformed grade is a refusal with no trial record even when another assertion graded. The evaluator guide and the promptfoo example teach the boundary. No eval-quality change: this is TeA-side adopter-code and guidance.

## Boundaries & Constraints

**Always:** change the fixture evaluator and the starter template in step, keeping their existing differences (the starter reads `mapping.json`, the fixture hard-codes its keys). Keep every existing refusal (output differing from the cited stdout, an unknown or repeated assertion metadata, a conflicting metric, an incomplete multi-assertion grade, a grade without a boolean `pass`, an empty or invalid `componentResults`). The skill is edited through `/bmad-workflow-builder` Edit run headless on `src/workflows/testarch/bmad-testarch-evaluate/` (Build Rules: skill gates), with the builder Analyze at zero critical and zero high findings (a finding that contradicts a repository test is skipped with the reason in the completion notes). Exercise every revert check once in a scratch copy and record the observation. Pre-existing defects found on the way are fixed in this PR.

**Never:** an ungraded row that becomes a target `fail`, a sealed trial record or a finding; a graded `pass: false` or `pass: true` that becomes infrastructure failure; importing promptfoo into `cli/`; any change to `cli/` behavior, to eval-quality, to `package.json` dependencies, the lockfile or the peer floor; raising a timeout; adding a script that is not chained; weight added to a heavy suite without rebalancing `tools/test-shard-weights.json`.

**Decisions (coordinator, owner-delegated):**

- Engine change: none. Lane 3 owns releases; nothing here needs a new export.
- The refusal message contains the literal `ungraded framework error` (and the framework's `error` string when there is one). It replaces `promptfoo returned neither a grade nor a concrete error`, which only guarded the old conversion.
- The stale fallback text in the graded-failure branch (`promptfoo returned an ungraded error for observed stdout`) goes away: a graded fail without a `reason` carries `Assertion failed.`.
- The superseded Story 1.20 rule is marked in the plan text of Story 1.20 (`epics.md`, `test-design-epic-1.md`, the Story 1.20 and 1.23 records stay as history and are not rewritten), dated 2026-10-01, wherever it still states that an ungraded result becomes a failing row.

## I/O & Edge-Case Matrix

| Scenario                                             | Input / State                                                        | Expected Output / Behavior                                                       | Error Handling |
| ---------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| Ungraded row with an `error` string and cited stdout | `gradingResult` absent, `error` set, `response.output` equals stdout | evaluator refuses naming the ungraded framework error; `run` exits 12, no record | exit 12        |
| Ungraded row without an `error`                      | `gradingResult` absent or null, no `error`                           | same refusal                                                                     | exit 12        |
| Ungraded multi-assertion row                         | three expected assertions, no `gradingResult`                        | same refusal, no partial rows                                                    | exit 12        |
| Graded `pass: false` component                       | `componentResults` with one `pass: false`                            | cited target `fail` row with its observed quote                                  | n/a            |
| Graded `pass: true` component                        | `componentResults` all `pass: true`                                  | `pass` rows                                                                      | n/a            |
| Partial grade set                                    | one of three assertions graded, others missing                       | refusal, no record, even though one assertion succeeded                          | exit 12        |
| Duplicate or malformed grade                         | a repeated assertion, a component with no boolean `pass`             | refusal, no record                                                               | exit 12        |

</frozen-after-approval>

## Code Map

- `test/fixtures/evaluate-promptfoo/evals/summary/evaluator/promptfoo.mjs`: `rowsFromResults`, the `!graded` branch and the graded-failure comment fallback.
- `src/workflows/testarch/bmad-testarch-evaluate/assets/evaluators/promptfoo-assertions.mjs`: the same branch and fallback in the starter.
- `src/workflows/testarch/bmad-testarch-evaluate/references/evaluator.md`: the guide section on framework evaluators; add the failure boundary with a runnable example (tagged `<!-- example:... -->` block if the guidance test extracts that kind).
- `test/test-evaluate-promptfoo.js` (`test:evaluate-promptfoo`): `resultShapes` (the old ungraded-row assertions at the `ungradedMulti` and `errored` cases flip to refusals), plus an end-to-end case where `tea-evaluate run` over a project whose evaluator meets an ungraded row exits 12 with no sealed trial record.
- `test/test-evaluate-guidance.js` (`test:evaluate-guidance`): `checkFrameworkTemplate('promptfoo-assertions.mjs', ...)` renders the starter; add the ungraded, graded-fail and graded-pass cases there and assert the guide names the failure boundary by exact heading.
- `CHANGELOG.md` (`### Fixed` under `[Unreleased]`), `epics.md` and `test-design-epic-1.md` (the superseded-rule marks), `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml` (row `review` at PR open; `done` before merge).

## Tasks & Acceptance

**Execution:**

- [x] Fixture evaluator and starter refuse an ungraded row; stale fallback text removed -- AC 1, 2
- [x] `test:evaluate-promptfoo` cases: ungraded rows (with error, without, multi), graded fail, graded pass, partial, duplicate and malformed grade sets, and the `tea-evaluate run` exit 12 with no sealed record -- AC 1, 2, 3
- [x] `test:evaluate-guidance` cases through the rendered starter, and the guide section with its runnable example -- AC 1, 2, 4
- [x] CHANGELOG, plan marks, sprint row, story record with every revert observation -- AC 5

**Acceptance Criteria:**

- A row with no `gradingResult` makes the fixture evaluator and the rendered starter refuse with a diagnostic naming the ungraded framework error; `tea-evaluate run` exits 12 and writes no sealed trial record for it (revert: restoring the fail-row conversion makes the row a target `fail` and a sealed record exists, so the case fails).
- A graded `pass: false` still maps to a cited target `fail` row and a graded `pass: true` to `pass`, in both evaluators (revert: rejecting graded failures, or passing them as `pass`, changes the expected rows).
- The imported result must carry every expected assertion grade exactly once; missing, duplicate and malformed grades, including a partial set where one assertion graded, stop the trial with no record (revert: permitting a partial set writes a record).
- The evaluator guide and the promptfoo example explain that an ungraded framework row stops the evaluation while a graded failing assertion supplies target evidence; the guidance test asserts the exact section heading and the runnable example (revert: removing the distinction fails the assertion).
- `test:evaluate-promptfoo` and `test:evaluate-guidance` exercise the fixture and the rendered starter against an ungraded row, a graded fail and a graded pass, and the completion notes record each revert check.

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0 (at the start and at the end)
- `npm run test:evaluate-promptfoo && npm run test:evaluate-guidance && npm run test:evaluate-evaluators && npm run test:evaluate-learned-framework && npm run test:evaluate-check` -- expected: green
- `npm run test:evaluate-boundaries && npm run test:direction && npm run test:shards && npm run test:ci-coverage && npm run test:doc-counts && npm run test:changelog` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check` -- expected: green
- `npm test` -- expected: green (CI shards)

## Implementation Notes

- `test/fixtures/evaluate-promptfoo/evals/summary/evaluator/promptfoo.mjs` and `src/workflows/testarch/bmad-testarch-evaluate/assets/evaluators/promptfoo-assertions.mjs` change in step.
  The `!graded` branch of `rowsFromResults` no longer builds fail rows: it throws `promptfoo returned an ungraded framework error (<first line of the framework's error, at most 200 characters, or "no error reported">); the evaluation stops without a judgment`.
  The old `neither a grade nor a concrete error` guard is gone with the conversion it protected.
  The branch sits where the old one did, after the cited-output, assertion-metadata and `componentResults` checks, so every existing refusal keeps its message and its precedence.
  A graded failure without a `reason` carries `Assertion failed.`; the stale `promptfoo returned an ungraded error for observed stdout` fallback is removed from both files.
  A result that carries both an `error` string and a complete grade set still maps its graded rows (the installed promptfoo sets `error` on every failed assertion).
- The starter went through `/bmad-workflow-builder` Edit run headless on `src/workflows/testarch/bmad-testarch-evaluate/`.
  Edited there: `assets/evaluators/promptfoo-assertions.mjs`, `references/evaluator.md` (new `## Separate ungraded framework errors from graded target failures` between the framework landscape and the learn procedure, with the two tagged examples `promptfoo-ungraded` and `promptfoo-graded-fail`, the stderr path of the diagnostic and the invocation of `--map-results`; step 4 of the learn procedure asks for a third executed case the framework cannot grade, step 6 asks the wrapper to exit non-zero on it) and `references/gaps.md` (the `tea-evaluate 12` repair names a framework result with no grade).
  The memlog (`.memlog.md`, gitignored) carries the direction and the analyze event.
- `test/test-evaluate-promptfoo.js`: `resultShapes` flips the old ungraded-row assertions to refusals (absent and null `gradingResult`, with an error, with a multi-line error, with a blank error, without one, next to a graded result, no judgment rows printed) and adds the graded pass rows, a graded fail with its observed quote, a graded fail with no reason (`Assertion failed.`), one-of-three and two-of-three grade sets, a complete grade set beside an `error` string, and the real crashed JavaScript assertion mapped as a graded fail.
  `ungradedRuns` runs `tea-evaluate preflight` and `run` over three projects whose evaluator is rewritten after promptfoo returns (an ungraded row with an error, a one-of-three grade set, a grade without a boolean `pass`): exit 12, the diagnostic in `evaluator/clean/trial-1.stderr`, and no `trial-sets.json` or `trial-sets/` in the run directory; `pipeline` gained the positive control that a clean run does have them.
  A repeated grade and an ungraded row without an error are covered by the `--map-results` units alone, which keeps the suite light.
- `test/test-evaluate-guidance.js`: `FAILURE_BOUNDARY` heading, eight markers and the two tagged examples asserted in `checkEvaluatorGuidance`, with three negative cases (heading removed, example tag removed, exit 12 sentence removed).
  `checkPromptfooFailureBoundary` runs the guide's own two examples through the rendered starter and adds the ungraded rows (error, none, null, blank, multi-assertion, after a graded result), a graded pass, a graded fail with and without a reason, and the partial, two-of-three, repeated, non-boolean and missing-`pass` grade sets, each expecting a non-zero exit with the named diagnostic and no `rows` on stdout.
  The gaps exit 12 pointer and the two learn-procedure sentences are pinned too.
- `tools/test-shard-weights.json`: `test:evaluate-promptfoo` 44 to 71, from the local wall time 20.0 to 32.4 seconds scaled by the 44-second CI measure (about 2.2 times local).
  `test:evaluate-guidance` stays 52.2 (local 30.2 seconds before and after).
  No timeout was raised and no script was added.
- Plan text: the Story 1.20 error-row clauses in `epics.md` (a superseded line after the Story 1.20 acceptance criteria) and in `test-design-epic-1.md` (the section note and the first table row) are marked, dated 2026-10-01; the Story 1.20 and 1.23 records are untouched.
  `evaluation-framework-facts.md` still said the importer handled an error row with a fail row "so that failure remains visible"; it carries an amendment dated 2026-10-01 (a stale statement of the superseded rule, fixed on the way).
- `CHANGELOG.md` `### Fixed` entry added.
  `sprint-status.yaml`: row `1-43` is `review`.
- Matrix audit: ungraded with an error, ungraded without one, ungraded multi-assertion (`resultShapes`, `checkPromptfooFailureBoundary`, and the first `ungradedRuns` case through `run`); graded `pass: false` and `pass: true` (both evaluators); partial grade set (`resultShapes`, the guidance units, the `ungradedRuns` one-of-three case); repeated and malformed grades (units in both files, the non-boolean case through `run`).
  Each ran and passed in the verification output.

### Departures from the plan text

- The installed promptfoo (0.123.1) grades a thrown JavaScript assertion as a failing component, with `gradingResult.pass: false`, `componentResults[0].pass: false` and the crash text as `reason` (and an `error` field, which it also sets on every ordinary failed assertion; `failureReason` is 1 in both cases).
  Such a result is graded, so it still maps to a cited target `fail` row, as the intent says a graded `pass: false` must.
  The existing `errored` case deleted `gradingResult` to build an ungraded row; it now maps the real crashed result as a graded fail and builds the ungraded row from it by deletion.
  The ungraded shape is reachable from the installed version only through the rows the intent names (absent or null `gradingResult`), which no test can make promptfoo emit for a deterministic assertion; the end-to-end refusal cases rewrite the result in the evaluator after promptfoo returns, so they exercise the real `run` path over a rewritten result.
  Reported to the coordinator as a finding (see Left undone).
- The guide does not claim an assertion crash arrives ungraded; its example says "promptfoo could not grade this output".
- Of the five end-to-end shapes the matrix could give (`run` per scenario), three run through `tea-evaluate run`; the other two (an ungraded row without an error, a repeated grade) stay in the `--map-results` units, since each `run` case costs about 4.5 seconds local and the refusal path is the same function.
- The refusal diagnostic carries the first line of the framework's error, at most 200 characters: a promptfoo error text is a full stack trace and the evaluator's stderr file would otherwise hold pages of it.

## Revert observations

Each exercised once by undoing the change in a scratch copy of the tree (`cp -c`, `.git` and `node_modules` included, the working tree left as built), running the named test, and restoring the file.
The unmodified scratch copy passes: `test:evaluate-promptfoo` 153 checks, `test:evaluate-guidance` green.
The guidance test stops a template block at its first failed assertion, so its counts are the reported failures (one message per gate).

- AC 1, the fixture's fail-row conversion restored (the `HEAD` file): 17 of 153 `test:evaluate-promptfoo` checks fail, among them the ungraded run case (the evaluator diagnostic is empty and the run sealed `trial-sets.json` and `trial-sets/P-001`, `P-002` records).
- AC 1, the starter's fail-row conversion restored: `test:evaluate-guidance` reports 1 failure (`promptfoo template accepted the guide ungraded example`).
- AC 2, graded failures rejected: 12 of 136 `test:evaluate-promptfoo` checks fail (the run is cut short); the starter fails `test:evaluate-guidance` at its first pipeline run (`run exited 12`).
- AC 2, graded failures passed as `pass`: 10 of 143 fail in the fixture (the mutation is no longer caught, `eval-quality score` exits 2); the starter fails `test:evaluate-guidance` at `score exited 2`.
- AC 2, the stale fallback text restored: 1 of 153 in the fixture (`a graded fail without a reason carried stale text`); 1 failure in `test:evaluate-guidance` for the starter.
- AC 3, a partial grade set permitted (the three completeness checks removed): 8 of 153 fail in the fixture, including the `run` case (it seals records); the starter fails with `promptfoo template accepted a partial grade set`.
- AC 3, only the repeated-grade check removed: 1 of 153 in the fixture and 1 failure in the guidance test, both on the diagnostic text; the omitted-assertion check still refuses the same input, so a repeated grade stays refused.
  The repeated-grade check and the omitted-assertion check both removed: 2 of 153 (the repeated grade is accepted and prints rows); the starter fails with `promptfoo template accepted a repeated grade`.
- AC 3, the boolean `pass` check removed: 7 of 153 fail in the fixture, including the `run` case; the starter fails with `promptfoo template accepted a grade without a boolean pass`.
- AC 4, the whole section removed: 14 `test:evaluate-guidance` failures; the heading renamed: 12; the `promptfoo-ungraded` tag removed: 3; the `promptfoo-graded-fail` tag removed: 2; the exit 12 sentence removed: 2; `each exactly once` reworded: 1; the ungraded example given a `gradingResult`: 2.
- Not an acceptance criterion but pinned: the gaps exit 12 pointer removed: 1 failure; the learn-procedure step 4 sentence removed: 1; the step 6 sentence removed: 1.

## Gates

- Engine check (`evaluateTarget` is a function) exit 0 at the start and at the end.
- Green on the last state of the tree: `test:evaluate-promptfoo` 153 checks, `test:evaluate-guidance`, `test:evaluate-learned-framework` 117, `test:evaluate-check` 811, `test:evaluate-boundaries` 412, `test:evaluate-evaluators` (group `evaluators`) 482, `test:evaluate-agents` 264, `test:direction`, `test:shards` 117, `test:ci-coverage` (103 steps), `test:doc-counts`, `test:doc-claims`, `test:doc-count-sources`, `test:changelog`, `test:release-metadata`, `lint`, `lint:md`, `format:check`, `docs:validate-links`.
- `git diff --stat -- cli package.json package-lock.json` is empty: no `cli/` change, no dependency or lockfile change.
- Unrun: the full `npm test` (CI shards).
- This record's frozen table was reflowed by Prettier (whitespace only) so `format:check` passes with the file tracked.

## Build review

Builder Analyze (delta, five lenses) found 0 critical, 0 high, 7 medium and 6 low.

### Fixed

- Enhancement 1: the learn procedure had no executed case for a result the framework cannot grade; step 4 asks for it and step 6 asks the wrapper to exit non-zero on it.
- Enhancement 2 and architecture 3: the exit 12 route was generic; the section names the stderr file and the reproduce step, and the `gaps.md` exit 12 repair names a framework result with no grade.
- Determinism 3: the examples gave no invocation; the section names `node promptfoo-assertions.mjs --map-results` and the mapping key.

### Skipped

- Leanness 1 (drop the graded-fail example): the acceptance criteria and `test-design-epic-1.md` require runnable examples of both sides of the boundary, and `test:evaluate-guidance` asserts both tags.
- Leanness 2 and 4, architecture 2 and 4 (low): the restated sentence and the heading/marker placement are pinned by the guidance test, and a carve of `evaluator.md` or `SKILL.md` would repoint it.
- Leanness 3 (SKILL.md Stage 6 duplication), architecture 1 (`corpus.md` size), determinism 1 and 2 (requirements digest by hand, calibration `scorerInput` by hand): pre-existing, outside this edit, and pinned by repository tests; determinism 2 is Story 1.67.
- Path scan (`scan-path-standards.py`): two high findings (`SKILL.md` bare `_bmad` in a convention line, `references/adapters.md` explanatory `../`) are identical on the unmodified tree and sit in files this story did not touch; recorded as the baseline.

## Left undone, reported

- Story 1.70 (new, end of lane 1): with the installed promptfoo a thrown JavaScript assertion is a graded failing component (see Departures), and promptfoo sets `error` on every failed assertion, so neither `error` nor the result shape tells a crash from a violated oracle. The starter and its guide will admit only deterministic built-in assertion types that run no adopter code and call no model, and the wrapper will refuse any other type with exit 12 naming it. Added to `epics.md` (the section, the Epic Dependencies row with the later rows renumbered 71 to 77, the lane 1 list, the story-count sentences, seventy-seven stories and Stories 1.27 to 1.70, and a pointer from Story 1.43), `test-design-epic-1.md` and `sprint-status.yaml` (`backlog`, and the end of `lane-1`).
- The pre-existing medium findings above (SKILL.md Stage 6, `corpus.md` size, the hand-run requirements digest).
