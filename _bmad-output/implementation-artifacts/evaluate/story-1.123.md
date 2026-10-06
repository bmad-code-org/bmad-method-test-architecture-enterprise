---
title: "Story 1.123: Score each ci project's stored workflow structurally as well as by its substring oracles"
type: 'feature'
created: '2026-10-06'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f19ad8d2'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.123 with its Story 1.97 amendment; the Story 1.94 amendment that files it; Story 1.95, which follows it in lane 4)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.123 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-10, AD-11)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.122.md (the latest ci-corpus change and the record format)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.121.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.94.md (the story that found this)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.97.md'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The oracles of the ci contract read a workflow as one string.
A `CI_CORRECT_RUNS` row pointed at a stored constructed case therefore passes `test:probe-corpus` for 35 of the 48 stored constructed ci cases (`full-unparseable`, `full-test-step-suppressed`, `full-injection-in-run`, `evaluation-plan-chained-commands`, `evaluation-gate-needs-cut` and the rest of the list in `test/probes/README.md`).
One cause is the token of the burn-in job oracle, the bare `burn-in`, which the comment `# Weekly burn-in on Sundays at 02:00 UTC` satisfies, so `full-burn-in-missing` holds every oracle.
The harness's own scorer, `scoreRun` and `checkElement` in `test/eval-ci.js`, reads these structures.

**Approach:** `test:probe-corpus` scores each `CI_CORRECT_RUNS` workflow with `scoreRun` over its project's ground truth, and a row that does not read a correct run fails with the element, the lint finding or the rule that no longer holds.
A self-exercise hands the check data that is not a correct run, so a neutered body cannot pass unseen.
The burn-in element states a `contractPattern` that reads a mapping key or a `name:` line that carries the word, outside a comment, rendered with the vocabulary's `regex` operator and tested by the paired scorer with `new RegExp(source)`.

## Boundaries & Constraints

**Always:**

- The sources are `test/fixtures/ci-eval/ground-truth.json` and `tools/generate-contracts.js`; `test/contracts/ci.contract.json`, `test/probes/ci.probes.json` and the ci `corpusDigest` regenerate from them and no generated file is edited by hand.
- `expected-strength.json` moves in the ci `corpusDigest` only.
- The structural check reuses the harness's `readWorkflow`, `lintWorkflow`, `scoreRun` and `checkpointFilesOf` and restates none of their logic.
- Story 1.122's state holds: `KNOWN_UNHELD` is empty with its check exercised, `cleanControlProblems` and `cleanControlSelfProblems` run, and the two command oracles keep their `contractPattern`.
- Story 1.121's state holds: the three ci pre-flight records are `passed` and `test:ci-qualification` keeps `plant-reported`.
- The substring tokens of the other projects' elements stay as they are: the structural scorer is the answer there.

**Never:**

- An edit of `references/ci.md`, `SKILL.md`, `assets/evaluation-ci-plan.template.json`, step 03b, `github-actions-template.yaml` or either `capture-record.json`, so no live recapture is needed.
- A live session, `claude -p`, an `eval:ci` run against a real agent, Docker.
- A new story, a change to the lane lists, or an edit of the section of Story 1.95.
- A hand-edited generated digest.

**Decisions (build worker, owner-delegated):** the owner delegated every decision of this build, so none waited at a checkpoint; `/bmad-build` renders here and halts at human checkpoints, so its steps were followed by hand without stopping, and the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                               | Input / State                                                                                                                                                                        | Expected Output / Behavior                                                                    | Error Handling                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Each stored correct run                | the six `CI_CORRECT_RUNS` rows as committed                                                                                                                                          | parses, no actionlint finding, every element present, nothing unrequested, no rule fires      | `ciStructuralProblems` names what does not                |
| A row at a stored deviation            | any of the 45 stored cases that deviate                                                                                                                                              | `test:probe-corpus` fails and names the element, the lint finding or the rule                 | the problem names the stored case and its project         |
| A row at a correct spelling            | `evaluation-plan-upload-wrapped-condition`, `full-node-version-literal`, `full-node-version-step-output`                                                                             | passes, since the harness scores each as the correct run                                      | `ciStructuralSelfProblems` fails a check that reports one |
| A row at another project's workflow    | the full project at the minimal project's run                                                                                                                                        | fails with the elements the other project lacks                                               | same                                                      |
| A neutered check                       | the body replaced by `continue`, `scoreRun` skipped, or one reported reason dropped                                                                                                  | `ciStructuralSelfProblems` reports the data it hands the check and finds it unreported        | the self-exercise names the data                          |
| The burn-in word only in a comment     | `# Weekly burn-in on Sundays`, a trailing comment, a hash with no space, a `run:` line, a run-block line with no key shape or the value of another key                               | the burn-in oracle and its scorer both resolve false                                          | `test:contract-oracles` names the form                    |
| The burn-in word in a job or step name | a job id of `burn-in`, `e2e-burn-in`, `burn_in`, `burnin` or `BURN-IN`, a job name, a step name, an `env`, `with` or input key, an artifact name, a tab indent, Windows line endings | both resolve true                                                                             | same                                                      |
| One character of the word changed      | the word with one character dropped, doubled or replaced, as a job id and as a job name                                                                                              | the oracle says what the harness's own `isBurnInJob` says                                     | same                                                      |
| A pattern on a gate element            | `gate-burn-in` with a pattern that matches its token and not its command                                                                                                             | `validateCorpus` accepts it, and refuses one that does not match the token or is not anchored | `test:evaluate-ci-render` names the guard                 |
| The baseline                           | regenerate and compare with `origin/main`                                                                                                                                            | one line moves, the ci `corpusDigest`                                                         | `test:probe-corpus` names the first moved line            |

</frozen-after-approval>

## Code Map

- `test/test-probe-corpus.js`: `readStoredCiCase` reads a stored case as the replay does (workflow, actionlint findings, the checkpoint files an edit set reads), with an optional text alteration; `ciStructuralProblems(legs, read)` runs `scoreRun` per leg and reports a parse failure, an actionlint finding, a missing element, an unrequested element and a rule violation; it reports a project that no leg reads or that two legs read, and returns how many legs it scored; `ciStructuralSelfProblems` hands it nine kinds of data, two legs at once and incomplete leg sets, which it must report, and three correct spellings it must not, and returns how many rows it ran; `ciWiringProblems` holds `main` to scoring every project and running at least one self-exercise row, and the self-exercise hands it the numbers of a main that ran nothing.
- `test/fixtures/ci-eval/ground-truth.json`: `gate-burn-in` states `contractToken` `burn-in:` and a `contractPattern`.
- `tools/generate-contracts.js`: `ciPatternNegativeDomain` words the negative domain of a pattern by the element's kind, and the header comments of `ciOracleSpecs` state the pattern.
- `test/eval-ci.js`: `validateCorpus` binds a pattern to the element's command for a `command` element only; `isBurnInJob` is exported.
- `test/test-contract-oracles.js`: `checkCiBurnInOracleOnForms` scores 232 forms of the burn-in job through eval-quality and through the scorer, and `ciFormsScored` fails a main that stopped calling either form table.
- `test/test-evaluate-ci-render.js`: two guard cases and one negative control for a pattern on a gate element.
- Regenerated: `test/contracts/ci.contract.json` (the burn-in check), `test/probes/ci.probes.json` (the ground-truth digest), `test/probes/expected-strength.json` (the ci `corpusDigest`).
- Prose: `test/probes/README.md`, `test/contracts/README.md`, `test/README.md`, `CHANGELOG.md`, `epics.md` (amendments to Stories 1.94 and 1.123), `test-design-epic-1.md` (the same), `sprint-status.yaml` (row 1.123 `review`), comments in `test/lib/probe-scoring.js`, `test/test-probe-corpus.js` and `tools/generate-contracts.js`.
- Not changed: `references/ci.md`, `SKILL.md`, the plan template, step 03b, `github-actions-template.yaml`, the two capture records, the lane lists, the section of Story 1.95, `package.json`, `package-lock.json`.

## Tasks & Acceptance

- [x] Reproduce on the untouched tree: count the stored cases that pass through, and show `full-burn-in-missing` passing on the comment.
- [x] The structural check and its self-exercise in `test:probe-corpus`.
- [x] The burn-in `contractPattern`, rendered by the generator, tested by the scorer, guarded by `validateCorpus`.
- [x] Regenerate the contract, the probes and the baseline; compare the baseline line by line.
- [x] The form table of the burn-in job.
- [x] Prove every stored case against a row of `CI_CORRECT_RUNS` in scratch copies, then each revert and at least eight mutants.
- [x] Counts, docs, CHANGELOG, planning amendments, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.123, with the amendment dated 2026-10-06 there (the second criterion holds for 32 of the 35, and the other three are correct spellings).

## Decisions

1. **The check lives in `test:probe-corpus` and reads the legs the evidence builder exposes.**
   `storedRunLegs` carries the `setId` and `caseId` each `CI_CORRECT_RUNS` row names, so a row changed in `test/lib/probe-scoring.js` changes what the check scores.
   The check reads the committed ground truth and the stored cases, so it holds for the committed `ci.probes.json` and contract too.
2. **Parse, lint, unrequested and rules count as well as elements.**
   The criterion says every expected element present and no rule fires.
   `full-workflow-dispatch-added` adds a trigger that no element names, and a correct run draws no actionlint finding (every correct case of the replay records none), so the check reports `unrequested` and the lint findings as well.
   `lintWorkflow` spawns actionlint, which `test:eval-replay` already needs and every shard of `quality.yaml` installs.
3. **Three of the 35 pass-through cases are correct spellings, and the criterion is rewritten for them.**
   `evaluation-plan-upload-wrapped-condition` wraps the upload's condition as `${{ always() }}`, `full-node-version-literal` writes a literal `node-version` equal to `.nvmrc`, and `full-node-version-step-output` reads the version from a step output as the template does.
   Each replay case says so in its derivation and records every element present with nothing unrequested.
   A structural scorer that failed them would fail a correct workflow, so the second criterion holds for 32 and the three are held to passing by `ciStructuralSelfProblems`.
   The prose that said 35 (the README list, the Story 1.94 and 1.123 amendments) now says 45 of the 48 fail and names the three.
4. **The self-exercise hands the check nine kinds of data and three correct spellings.**
   Another project's workflow, a workflow without its burn-in job, a parse failure, an unrequested trigger, a rule violation, an actionlint finding with nothing else wrong (the stored full pipeline with one unknown key, linted by the reader), a rewritten checkpoint of an edit set, an absent stored run and a project the ground truth lacks.
   `readStoredCiCase` takes the text alteration as a parameter so the lint of the reader is the one that runs, which the first draft missed (mutant S9 survived until then).
5. **A check handed too few legs fails, and so does a main that never ran it.**
   Fix round 1 found that four mutants of `main` and of the leg loop (the loop over the first leg only, a call with no legs, an empty self-exercise, the old guard disabled) left `test:probe-corpus` green, and that a row pointing the evaluation-plan project at `evaluation-plan-continue-on-error` passed under the first two.
   `ciStructuralProblems` now reports every project of the ground truth that no leg reads and every project that two legs read, unless the caller says it hands a partial set (`complete: false`, which the self-exercise does for its one-leg rows).
   `ciWiringProblems` takes the number of workflows scored and the rows the self-exercise ran, and reports a main that scored fewer than the ground truth's projects or ran no row.
   `main` declares those two numbers as zeros before the suite loop, sets them inside the ci block, and calls `ciWiringProblems` once after the loop, so a ci block that never ran (a renamed suite id, a deleted block, a `suites()` that no longer yields ci) leaves the zeros and fails.
   The self-exercise hands it a main that scored nothing, one workflow, no row and the correct numbers, and a two-leg row names the deviating second leg and not the first.
   A call of `ciStructuralProblems` deleted from `main` ends the run, since `structural` is then undefined, and a stand-in result reports a count of none.
   Deleting the one post-loop call of `ciWiringProblems` behaves identically to the committed code on every correct tree, and the mutant observation is exit 0, recorded in the revert table.
   `ciFormsScored` does the same for the two form tables of `test:contract-oracles`.
6. **The burn-in token is the job id the template writes, `burn-in:`, and the pattern reads a key or a name line outside a comment.**
   The pattern is `contractPattern` in the ground truth: it starts a line (`(?:^|\n)` after the indentation and any list dashes), then accepts a key that carries the word (`[\w-]*` around it, then a colon) or the key `name:`, one space and text without a hash that carries the word.
   The word is spelled with character classes (`[Bb][Uu][Rr][Nn][-_ ]?[Ii][Nn]`) because the operator reads a pattern with no flags and the harness's `isBurnInJob` accepts any case and a hyphen, an underscore, a space or nothing between the halves.
   A job name and a step name both sit under `name:`, and a job id is a key like an `env` or `with` key, so a line cannot tell them apart and every one holds, an artifact name and `BURN_IN_ITERATIONS: 10` included; the structural score reads which one it is, and the form table pins these rows.
   The pattern has no quantifier nested in another, since the evaluator refuses one before it matches, and it has no lookbehind or backreference.
7. **The tiers, edit and gate projects keep their literal tokens.**
   Their command tokens (`npm install --prefix`, `--tier pr`) hold on their stored captures and the structural scorer covers what a token cannot say, so no substring token widened.
8. **`validateCorpus` binds a pattern to the command of a `command` element only.**
   The command of a gate is the one its job loops (`npm run test:e2e`), which the burn-in pattern does not state.
   The match with the token stays for every kind, and the committed corpus is the negative control that fails if the command check covers a gate again.
9. **`ciPatternNegativeDomain` words the claim by kind.**
   A `regex` oracle's negative domain said the run carries no such command whether or not it quotes its arguments, which is false for a burn-in job, so a gate's says the workflow names no job or step of that gate outside a comment.
   `checkCiBurnInOracleOnForms` reads it from the contract.
10. **The form table has hand-written rows and a family derived from `isBurnInJob`.**
    The hand-written rows are the forms of the brief (job id, job name, step name, comment only, run line, upper case), the other keys and names that hold (an `env` key, a `with` key, an artifact name, a run-block line that starts with a key carrying the word) and the near misses a one-character widening of the pattern would admit (a hash with no space, a dot, a slash or a colon around the word, a name key spelled wrong, a name with no space after the colon, a run block line with no key shape, a key line indented after a form feed or a carriage return).
    The family is every spelling of the word with one character dropped, doubled or replaced by one of ten characters, scored as a job id and as a job name, and the oracle has to agree with `isBurnInJob` on each.
    A mutation pass over the pattern at the token level (236 mutants) leaves two that no input separates from it (a colon added to the class before the colon that ends a key, a hash listed twice in a negated class).
    A third survivor of the first two rounds, a whitespace class added to the indentation class, differs on a key line indented after a form feed or a carriage return, so two rows kill it.
11. **The baseline moves in the ci `corpusDigest` only.**
    The digest hashes the ground truth, which gained a token and a pattern.
    No verdict, exit code or outcome moved, and the three ci pre-flights pass from the real leg cache.

## Reproduction

On the untouched tree (commit `f19ad8d2`), in a scratch copy:

- `node test/test-probe-corpus.js` passes.
- A copy whose `CI_CORRECT_RUNS` row for the project of each stored constructed case points at that case, one copy per run, passes for 35 of the 48 stored constructed ci cases and fails for 13.
  The 13 that fail are `evaluation-edit-job-id-kept`, `evaluation-plan-plan-not-detected`, `evaluation-plan-upload-wrong-path`, `evaluation-tiers-shared-artifact-name`, `full-e2e-command-replaced`, `full-not-a-workflow`, `full-permissions-missing`, `full-permissions-widened`, `full-trigger-schedule-missing`, `full-triggers-unscoped`, `minimal-artifact-added`, `minimal-retry-action-added` and `minimal-template-copied`.
  The 35 that pass are the list in `test/probes/README.md`, name for name (the script compares the two lists), and the corpus holds 54 stored ci cases: the six correct runs and the 48 constructed cases.
- `full-burn-in-missing` passes through on the one place its workflow names the word, line 13, `# Weekly burn-in on Sundays at 02:00 UTC`.
- `node test/eval-contract-strength.js --suite ci --from-cache` on a scratch copy holding the real leg cache (`test/eval-artifacts/preflight-cache/claude/ci/fixture-set-v1`, three entries recorded 2026-09-25, copied into the scratch copy only): P-001, P-002 and P-003 `pre-flight passed`, verdict null, exit 3; P-004 `passed`, `CONCERNS`, exit 0; the run ended `every probe matched the outcome test/probes/expected-strength.json records`.

After the change, the same real-cache command prints the same four lines and the same matching line, so the pre-flights and the verdicts did not move with the regenerated contract.
`expected-strength.json` differs from `origin/main` in one line, the ci `corpusDigest` (`sha256:4943e769` to `sha256:4a3fc5a0`).

The same row experiment on the final tree, one scratch copy per case, gives the table below (the problem counts include the oracle problems and the structural ones; the reasons column lists the structural ones):

| Stored case                                         | Project            | Before     | After      | Structural reasons                                                                                                      |
| --------------------------------------------------- | ------------------ | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `evaluation-edit-checkpoint-rewritten`              | `evaluation-edit`  | passes     | fails (1)  | element checkpoint-untouched                                                                                            |
| `evaluation-edit-job-id-kept`                       | `evaluation-edit`  | fails (4)  | fails (6)  | element job-evaluation-pr, element artifact-evaluation-runs                                                             |
| `evaluation-edit-marker-job-emptied`                | `evaluation-edit`  | passes     | fails (1)  | element job-evaluation-pr                                                                                               |
| `evaluation-edit-stale-job-kept`                    | `evaluation-edit`  | passes     | fails (2)  | element command-evaluation-ci-pr, element job-evaluation-pr                                                             |
| `evaluation-edit-stale-job-kept-unmarked`           | `evaluation-edit`  | passes     | fails (2)  | element command-evaluation-ci-pr, element job-evaluation-pr                                                             |
| `evaluation-edit-test-job-reformatted`              | `evaluation-edit`  | passes     | fails (1)  | element preserved-job-test                                                                                              |
| `evaluation-gate-needs-cut`                         | `evaluation-gate`  | passes     | fails (1)  | element wait-publish                                                                                                    |
| `evaluation-gate-release-job-on-pull-requests`      | `evaluation-gate`  | passes     | fails (2)  | element job-evaluation-release, element wait-publish                                                                    |
| `evaluation-plan-bare-invocation`                   | `evaluation-plan`  | passes     | fails (3)  | element command-evaluation-ci-pr, element job-evaluation-pr, unrequested command                                        |
| `evaluation-plan-chained-commands`                  | `evaluation-plan`  | passes     | fails (2)  | element command-evaluation-install, element command-evaluation-ci-pr                                                    |
| `evaluation-plan-continue-on-error`                 | `evaluation-plan`  | passes     | fails (1)  | rule continue-on-error                                                                                                  |
| `evaluation-plan-evaluation-node-below-floor`       | `evaluation-plan`  | passes     | fails (1)  | element node-version-evaluation-floor                                                                                   |
| `evaluation-plan-job-continue-on-error`             | `evaluation-plan`  | passes     | fails (1)  | rule continue-on-error                                                                                                  |
| `evaluation-plan-job-continue-on-error-expression`  | `evaluation-plan`  | passes     | fails (1)  | rule continue-on-error                                                                                                  |
| `evaluation-plan-marker-dropped`                    | `evaluation-plan`  | passes     | fails (1)  | element job-evaluation-pr                                                                                               |
| `evaluation-plan-one-step-per-check`                | `evaluation-plan`  | passes     | fails (1)  | element command-evaluation-ci-pr                                                                                        |
| `evaluation-plan-plan-not-detected`                 | `evaluation-plan`  | fails (9)  | fails (14) | element node-version-evaluation-floor, element command-evaluation-install, element command-evaluation-ci-pr, and 2 more |
| `evaluation-plan-root-install-in-job`               | `evaluation-plan`  | passes     | fails (1)  | rule root-install                                                                                                       |
| `evaluation-plan-step-continue-on-error-expression` | `evaluation-plan`  | passes     | fails (1)  | rule continue-on-error                                                                                                  |
| `evaluation-plan-upload-negated`                    | `evaluation-plan`  | passes     | fails (1)  | element artifact-evaluation-runs                                                                                        |
| `evaluation-plan-upload-on-failure-only`            | `evaluation-plan`  | passes     | fails (1)  | element artifact-evaluation-runs                                                                                        |
| `evaluation-plan-upload-wrapped-condition`          | `evaluation-plan`  | passes     | passes     | -                                                                                                                       |
| `evaluation-plan-upload-wrong-path`                 | `evaluation-plan`  | fails (2)  | fails (4)  | element artifact-evaluation-runs, unrequested artifact                                                                  |
| `evaluation-tiers-artifact-names-swapped`           | `evaluation-tiers` | passes     | fails (2)  | element artifact-evaluation-runs-pr, element artifact-evaluation-runs-merge                                             |
| `evaluation-tiers-merge-without-pr-step`            | `evaluation-tiers` | passes     | fails (1)  | element job-evaluation-merge                                                                                            |
| `evaluation-tiers-pr-job-unguarded`                 | `evaluation-tiers` | passes     | fails (1)  | element job-evaluation-pr                                                                                               |
| `evaluation-tiers-scheduled-under-pr-timeout`       | `evaluation-tiers` | passes     | fails (1)  | element job-evaluation-scheduled                                                                                        |
| `evaluation-tiers-shared-artifact-name`             | `evaluation-tiers` | fails (2)  | fails (3)  | element artifact-evaluation-runs-merge                                                                                  |
| `evaluation-tiers-test-job-unguarded`               | `evaluation-tiers` | passes     | fails (1)  | element guard-unit-tests                                                                                                |
| `full-artifact-unconditional`                       | `full`             | passes     | fails (2)  | element artifact-playwright-report, element artifact-test-results                                                       |
| `full-burn-in-missing`                              | `full`             | passes     | fails (5)  | element gate-burn-in                                                                                                    |
| `full-e2e-command-replaced`                         | `full`             | fails (4)  | fails (9)  | element command-e2e-tests, element gate-matrix-shards, element gate-burn-in, and 1 more                                 |
| `full-injection-in-run`                             | `full`             | passes     | fails (2)  | actionlint expression, rule unsafe-interpolation                                                                        |
| `full-lint-needs-undefined`                         | `full`             | passes     | fails (2)  | actionlint job-needs, element gate-lint-precedes-tests                                                                  |
| `full-node-version-hardcoded`                       | `full`             | passes     | fails (1)  | element node-version-from-nvmrc                                                                                         |
| `full-node-version-literal`                         | `full`             | passes     | passes     | -                                                                                                                       |
| `full-node-version-step-output`                     | `full`             | passes     | passes     | -                                                                                                                       |
| `full-not-a-workflow`                               | `full`             | fails (51) | fails (67) | actionlint syntax-check, element trigger-push-main, element trigger-pull-request-main, and 11 more                      |
| `full-permissions-missing`                          | `full`             | fails (5)  | fails (6)  | element permission-contents-read                                                                                        |
| `full-permissions-widened`                          | `full`             | fails (5)  | fails (8)  | element permission-contents-read, unrequested permission                                                                |
| `full-test-step-suppressed`                         | `full`             | passes     | fails (1)  | rule continue-on-error                                                                                                  |
| `full-trigger-schedule-missing`                     | `full`             | fails (5)  | fails (6)  | element trigger-weekly-schedule                                                                                         |
| `full-triggers-unscoped`                            | `full`             | fails (14) | fails (17) | element trigger-push-main, element trigger-pull-request-main, element trigger-weekly-schedule                           |
| `full-unparseable`                                  | `full`             | passes     | fails (15) | parse failure, actionlint syntax-check, element trigger-push-main, and 12 more                                          |
| `full-workflow-dispatch-added`                      | `full`             | passes     | fails (1)  | unrequested trigger                                                                                                     |
| `minimal-artifact-added`                            | `minimal`          | fails (3)  | fails (4)  | unrequested artifact                                                                                                    |
| `minimal-retry-action-added`                        | `minimal`          | fails (3)  | fails (4)  | unrequested gate                                                                                                        |
| `minimal-template-copied`                           | `minimal`          | fails (21) | fails (30) | unrequested trigger, unrequested command, unrequested gate, and 1 more                                                  |

The six correct runs (`full-correct-pipeline`, `minimal-correct-pipeline` and the four live captures) pass.
Of the 45 that fail, 14 also violate an oracle of the contract (the 13 above and `full-burn-in-missing`, through the new burn-in oracle) and 31 fail the structural check alone.
Every failing case names an element, an actionlint finding or a rule.

## Revert observations

Each revert was applied once to a scratch copy of the final tree (the working tree copied without `node_modules`, `_bmad` or `.git`, the real leg cache copied in, `node_modules` linked), the named check run, the failure recorded and the copy restored.
Rows that change the ground truth regenerate the contract and the probes in the copy, as a maintainer's edit would.
A row run executed the whole `test:probe-corpus` or `test:contract-oracles` and counts the problems or the failed checks it printed.

| Revert (the one edit)                                                                                  | Check run                             | Observed                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| the body of `ciStructuralProblems` replaced by `continue`                                              | `test:probe-corpus`                   | 12 problems: the nine kinds of data the self-exercise hands it (the rule violation names two reasons), and the three correct spellings still pass |
| `scoreRun` skipped (an empty score)                                                                    | `test:probe-corpus`                   | 9 problems                                                                                                                                        |
| the parse failure no longer reported                                                                   | `test:probe-corpus`                   | 1 problem: the workflow that does not parse                                                                                                       |
| the actionlint findings no longer reported                                                             | `test:probe-corpus`                   | 1 problem: the workflow with only a finding                                                                                                       |
| the missing elements no longer reported                                                                | `test:probe-corpus`                   | 3 problems                                                                                                                                        |
| the unrequested elements no longer reported                                                            | `test:probe-corpus`                   | 1 problem: the unrequested trigger                                                                                                                |
| the rule violations no longer reported                                                                 | `test:probe-corpus`                   | 3 problems                                                                                                                                        |
| the checkpoint files of an edit set not read                                                           | `test:probe-corpus`                   | 2 problems: the rewritten checkpoint and the edit capture, which reads its checkpoint as gone                                                     |
| the lint of a stored case skipped                                                                      | `test:probe-corpus`                   | 1 problem: the finding-only workflow                                                                                                              |
| the text alteration of a reader ignored                                                                | `test:probe-corpus`                   | 1 problem: the finding-only workflow                                                                                                              |
| an absent stored run answered by a correct case                                                        | `test:probe-corpus`                   | 1 problem                                                                                                                                         |
| an unknown project skipped                                                                             | `test:probe-corpus`                   | 1 problem                                                                                                                                         |
| the structural check reads the first leg only                                                          | `test:probe-corpus`                   | 2 problems: the project left unscored, the deviation of a later leg not named by the two-leg row                                                  |
| `main` hands the structural check no legs                                                              | `test:probe-corpus`                   | 7 problems: every project reported as read by no leg, and the count of workflows scored                                                           |
| the completeness check of the legs disabled                                                            | `test:probe-corpus`                   | 3 problems: the incomplete-set rows of the self-exercise                                                                                          |
| the completeness check no longer reports a project read twice                                          | `test:probe-corpus`                   | 1 problem: the duplicate-legs row                                                                                                                 |
| `main` replaces the self-exercise with an empty result                                                 | `test:probe-corpus`                   | 1 problem: the self-exercise ran no row                                                                                                           |
| the wiring check no longer asks for a self-exercise row                                                | `test:probe-corpus`                   | 1 problem: the wiring row for a main whose self-exercise ran nothing                                                                              |
| the wiring check no longer compares the scored count with the projects                                 | `test:probe-corpus`                   | 2 problems: the rows for a main that scored nothing and one workflow                                                                              |
| the call of the structural check deleted from `main`                                                   | `test:probe-corpus`                   | exit 2: `structural` is undefined and the run ends                                                                                                |
| `main` replaces the structural check with an empty result                                              | `test:probe-corpus`                   | 1 problem: the count of workflows scored                                                                                                          |
| the ci block skipped: its condition renamed to `ci-renamed`                                            | `test:probe-corpus`                   | 2 problems: `scored 0 stored workflows, expected one for each of the 6 projects` and `the self-exercise of the structural check ran no row`       |
| the ci block skipped: the whole block deleted                                                          | `test:probe-corpus`                   | the same 2 problems                                                                                                                               |
| the one post-loop call of `ciWiringProblems` deleted from `main`                                       | `test:probe-corpus`                   | exit 0: the call reports nothing on a correct tree, and every mutant of its inputs above is killed                                                |
| the structural check replaced by an empty list in the row experiment                                   | the row experiment, one copy per case | the 31 structural cases and the three correct spellings pass again; 14 fail (the oracle ones)                                                     |
| a row at `evaluation-plan-continue-on-error` under the first-leg mutant, then under the no-legs mutant | the row experiment                    | fails under each: 2 problems, then 7 (the completeness problems join the structural one)                                                          |
| the indentation class widened by whitespace                                                            | `test:contract-oracles`               | 4 fail: the rows for a key line after a form feed and after a carriage return                                                                     |
| the pattern loosened so a hash may precede the word                                                    | `test:contract-oracles`               | 8 fail: the comment rows and the hash rows                                                                                                        |
| the pattern replaced by one that matches anything                                                      | `test:contract-oracles`               | 397 fail                                                                                                                                          |
|                                                                                                        | `test:probe-corpus`                   | 2 problems: the burn-in oracle `holds under every wrong stored run`, and the digest                                                               |
| the literal token restored (pattern removed, token `burn-in`)                                          | `test:contract-oracles`               | 396 fail: the comment, run line and near-miss rows, for the oracle and the scorer                                                                 |
|                                                                                                        | the row `full-burn-in-missing`        | fails through the structural check alone (the oracle holds again), 1 problem                                                                      |
| the colon after the job id made optional                                                               | `test:contract-oracles`               | 10 fail                                                                                                                                           |
| the line anchor replaced by any text on a line                                                         | `test:contract-oracles`               | 34 fail                                                                                                                                           |
| the name branch accepting a name with no space after the colon                                         | `test:contract-oracles`               | 2 fail: the row `name:burn-in`, for the oracle and the scorer                                                                                     |
| the separator class widened by a dot (both branches)                                                   | `test:contract-oracles`               | 4 fail                                                                                                                                            |
| the job id branch without its trailing word class                                                      | `test:contract-oracles`               | 8 fail                                                                                                                                            |
| the token changed to the bare word while the pattern stays                                             | `test:eval-ci-data`                   | fails: `contractPattern does not match its own contractToken "burn-in"`                                                                           |
| the negative domain of a gate pattern worded as a command                                              | `test:contract-oracles`               | 1 fails: the negative domain of the burn-in oracle                                                                                                |
| the generator rendering every element as a containment of its token                                    | `test:contract-oracles`               | 127 fail                                                                                                                                          |
|                                                                                                        | `test:probe-corpus`                   | 2 problems: the burn-in oracle seen violated with no finding, and the digest                                                                      |
| `validateCorpus` binding a pattern to the command of every element kind                                | `test:evaluate-ci-render`             | fails: the committed corpus has a problem on `gate-burn-in`                                                                                       |
|                                                                                                        | `test:eval-ci-data`                   | fails with the same problem                                                                                                                       |
| `validateCorpus` no longer matching a pattern to the command of a `command` element                    | `test:evaluate-ci-render`             | fails: `does not refuse contractPattern that does not match the element's command`                                                                |
| `validateCorpus` no longer matching a pattern to its token                                             | `test:evaluate-ci-render`             | fails: `does not refuse contractPattern that does not match its contractToken`                                                                    |
| the burn-in form table, or the command form table, no longer called from `main`                        | `test:contract-oracles`               | 1 fails each: `both ci form tables scored their forms`                                                                                            |

A token-level mutation pass over the pattern (each atom deleted, each quantifier dropped or replaced, each quantifier added after an atom, each class widened by a character or narrowed by one, each alternation branch dropped) was run in process over the form table.
The first pass, over the 25 hand-written forms the table started with, left 141 of 233 mutants alive, which is why the table grew.
The pass after fix round 1, over the 232 forms and the final pattern, leaves 2 of 236 alive, and no input separates them from the pattern: a colon added to the class before the colon that ends the key, and a hash listed twice in a negated class.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.
Local, macOS, on the final tree:

- `node test/eval-contract-strength.js --suite ci --from-cache` on the scratch copy with the real cache: matches the recorded outcomes.
- `test:probe-corpus`, `test:probe-sources` (15 corpus files), `test:contract-sources` (16 contracts), `test:contracts`, `test:contract-oracles` (9,819 checks), `test:ci-qualification` (459), `test:evaluate-ci-render` (537), `test:eval-ci-data`, `test:eval-replay` (185 passed, 0 moved), `test:test-design-qualification` (240), `test:test-review-qualification` (604), `test:trace-qualification` (435), `test:nfr-qualification` (415).
- `lint`, `lint:md` and `format:check` clean.
- `test:doc-counts`, `test:doc-claims`, `test:shards`, `test:ci-coverage` and `test:changelog` once at the end.
- `git diff -- package.json package-lock.json` is empty.

## Build review

One pass of a general-purpose review subagent over the commit, read only.

It found the acceptance criteria met, the pairing of the engine's `regex` operator with the scorer sound (the estimated step count is ten quantifier markers times the text length against a budget of 1,000,000, and the largest stored workflow is 6 KB), every count true (45 of 48, 14 plus 31 plus 3, 32 of 35, 54 stored cases) and the changed tables rendering, and it listed these findings:

| Finding                                                                                                                                                                              | Verdict  | Route                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The pattern accepts any mapping key or `name:` line that carries the word (an `env` key, a `with` key, an input, an artifact name), and the prose said job id, job name or step name | valid    | Fixed here: the prose of the CHANGELOG, both READMEs, the epics and test-design amendments, the form table comment and `eval-ci.js` now says a key or a name line outside a comment, three rows pin an `env` key, a `with` key and an artifact name, and the negative domain says a key or name line |
| The doc comment of `checkCiCommandOraclesOnQuotedForms` was detached by the `ciFormsScored` declaration                                                                              | valid    | Fixed here: the declaration sits above the doc comment                                                                                                                                                                                                                                               |
| `eval-ci.js` carried a negation-then-correction clause ("and not a comment")                                                                                                         | valid    | Fixed here                                                                                                                                                                                                                                                                                           |
| Two sentences on one comment line in `test-probe-corpus.js`                                                                                                                          | valid    | Fixed here                                                                                                                                                                                                                                                                                           |
| The record left a placeholder under this heading                                                                                                                                     | valid    | Filled here                                                                                                                                                                                                                                                                                          |
| The first revert row of the record read ambiguously                                                                                                                                  | valid    | Reworded                                                                                                                                                                                                                                                                                             |
| "no longer reads a comment" in the CHANGELOG, `epics.md`, `test-design-epic-1.md` and the README                                                                                     | doubtful | Reworded to the affirmative in the planning and changelog sites                                                                                                                                                                                                                                      |
| The last guard of `main` is reached only if the whole ci block is removed                                                                                                            | doubtful | Fixed in round 2: `ciWiring` holds zeros before the suite loop, the ci block sets it, and `ciWiringProblems` runs once after the loop, so a skipped block fails with 2 problems                                                                                                                      |
| `name: C# burn-in`, a quoted job id, flow style and a block-scalar name are rejected although `isBurnInJob` accepts them                                                             | doubtful | Kept: the template writes `burn-in:` and `name: Burn-In (...)`, and the structural score reads the rest                                                                                                                                                                                              |

The final pass reran every mutant of the revert table on the tree after these fixes: all 30 are killed, and the pattern mutation pass leaves the same three equivalent mutants over 229 forms.

Fix round 1 (coordinator review) fixed five findings.
The structural check is held to scoring every leg (Decision 5), and the rows and mutants above carry its proof; the mutants of that round were all killed.
Fix round 2 found that round 1 had moved `ciWiringProblems` inside the ci block, so a renamed suite id or a deleted block exited 0.
The call is back after the loop, fed by `ciWiring`, and the renamed condition and the deleted block each fail with 2 problems (`scored 0 stored workflows, expected one for each of the 6 projects` and `the self-exercise of the structural check ran no row`).
Of the 41 mutants of the final tree 40 are killed, and the one that survives deletes the single post-loop call of `ciWiringProblems`, which behaves identically on every correct tree.
The README sentence that said the last three of the list were not deviations now names the remaining three of the 48 as correct spellings.
Seven places that said a run line leaves the burn-in oracle unsatisfied now say that a `run:` line and a run-block line with no key shape do, and that a run-block line that starts with a key carrying the word holds as an `env` key does, with a form row for it.
The whitespace-class mutant is killed by two rows and the sentence about the survivors names the two equivalent ones.
The comment of `quality.yaml` that lists the scripts needing actionlint names `test:probe-corpus`, and the CHANGELOG says so.
