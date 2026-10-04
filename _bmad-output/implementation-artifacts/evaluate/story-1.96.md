---
title: 'Story 1.96: Check the derivable fields of a CI plan'
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5c08bc1b'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.96; Story 2.4; Story 1.97; Story 1.95)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.96 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-10, AD-11)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-2.4.md (the ci stage whose plan this story validates)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.112.md (the record format)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The ci stage fills fields of `ci/evaluation-ci-plan.json` that follow from other fields, and nothing in `tea-evaluate check` holds them.
A check's `trigger` can name an event its tier does not use, because the schema accepts any non-empty set of the five events.
The `tiers` of `evaluation.json` can disagree with the plan, since nothing under `cli/lib/evaluate/` reads them.
A `<evaluation-folder>` placeholder from the plan template can stay in a `command` or an `evidence` path.
A `preflight-live` entry can carry a `defaultTier` that disagrees with the registry, which hides a deviation from the closing summary.
A check can sit with an empty or missing `reason`, since the runtime asked for one only on a check moved off its default.
A check the evaluation cannot run goes unnoticed: an `api-conformance` entry with no HTTP target exited 64 only when `ci` ran it, and a contract that declares a rubric could omit `judge-calibration` from every live tier.

**Approach:** `ci-plan.js` holds six rules as `ci-plan` findings that exit 10 in `tea-evaluate check` and `tea-evaluate ci`, which both read the plan through `readPlan`.
The rules that need only the plan are `trigger`, `placeholder` and `placement-reason`.
The rules that read the evaluation are `tiers`, `applicability` and the registry half of `placement-default`: `readPlan` reads `evaluation.json` and, for the rubric, the contract, and skips a rule whose file cannot be read, which `check` reports on its own.
`planFindings(plan)` keeps validating a plan alone, so the guide's tagged examples and the template are held to the same code.
The guide's `## Write the plan` drops the manual `trigger` and `tiers` steps and sends the stage to the findings' messages.

## Boundaries & Constraints

**Always:**

- `<invocationId>` stays valid in a `command` or an `evidence` path; `<evaluation-folder>` there is the finding.
- Every committed plan keeps passing, `evaluation.json` `tiers` of the committed fixtures included.
- The plan template ships empty reasons, so `check` fails on it as shipped, and `test:evaluate-guidance` fills the reasons and the folder before it expects the template to validate.
- A rule that reads a file `check` already holds to its own schema skips when that file cannot be read, so `check` names one defect once.
- A development run never opens the held-out plan: `check` hands the rubric decision it already derived to the plan reader.

**Never:**

- A change to the plan schema's structure, to the shape of a finding or to the exit table; the schema's descriptions say what the rules now require.
- A change to `ci.js`, to the enforcement table or to the rendering of `bmad-testarch-ci`.
- The live recapture of the two capture records under `test/fixtures/evaluate-ci-repos/`: the coordinator recaptures once, after lane 3's Story 1.98 merges.
- A new story, a new dependency or a change to the lane lists.

**Decisions (build worker, owner-delegated):** the owner delegated every decision of this build, so none waited at a checkpoint; the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                   | Input / State                                                                                                                                             | Expected Output / Behavior                                                   | Error Handling |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------- |
| Trigger its tier lacks     | a `pr` check naming `schedule`, or any event the tier does not use                                                                                        | `check` and `ci` exit 10 with `[trigger]`, and `ci` runs nothing             | exit 10        |
| Trigger subsets            | `scheduled` naming `manual-dispatch` alone, `release` naming `release` and `manual-dispatch`                                                              | valid                                                                        | n/a            |
| Declared tiers drift       | `evaluation.json` lists a tier the plan does not use, or omits one it uses                                                                                | exit 10 with `[tiers]` naming the tier to add or remove                      | exit 10        |
| Tiers in another order     | the same set, any order                                                                                                                                   | valid                                                                        | n/a            |
| Left-over placeholder      | `<evaluation-folder>` in a `command` item or an `evidence` path                                                                                           | exit 10 with `[placeholder]` naming the field                                | exit 10        |
| Run id placeholder         | `<invocationId>` in an `evidence` path                                                                                                                    | valid                                                                        | n/a            |
| Port check, no HTTP target | `api-conformance` over a registry with no HTTP entry                                                                                                      | exit 10 with `[applicability]`                                               | exit 10        |
| Rubric without calibration | a rubric in `contract.json` or the held-out plan, live checks on `scheduled` or `release`, no `judge-calibration` there                                   | exit 10 with `[applicability]` naming each tier that lacks it                | exit 10        |
| Release-only live set      | the same rubric, live checks on `release` alone, `judge-calibration` on `release`                                                                         | valid                                                                        | n/a            |
| No-secret target           | no `environmentKeys`, no skill or agent runner, `preflight-live` with a `defaultTier` other than `merge`                                                  | exit 10 with `[placement-default]`                                           | exit 10        |
| Secret target              | `environmentKeys` (command, server or `auth` key), a `tea-skill-runner` entry or a `skill` or `agent` target kind, `preflight-live` defaulting to `merge` | exit 10 with `[placement-default]`                                           | exit 10        |
| Check without a reason     | an empty, blank or missing `reason`, on the default tier or off it                                                                                        | exit 10 with `[placement-reason]`                                            | exit 10        |
| Unreadable evaluation      | `evaluation.json` absent, not JSON, or a registry or `tiers` of the wrong type                                                                            | the rules that read it are skipped, no crash                                 | n/a            |
| Unreadable contract        | `contract.json` or the held-out plan unreadable                                                                                                           | the rubric rule is skipped                                                   | n/a            |
| Development run            | `check` for a `development` partition over a held-out rubric                                                                                              | the held-out plan stays unopened                                             | n/a            |
| Template as shipped        | `assets/evaluation-ci-plan.template.json`                                                                                                                 | `placeholder` and `placement-reason` findings; valid once the stage fills it | n/a            |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/ci-plan.js`: `TIER_TRIGGERS`, the `trigger`, `placeholder`, `placement-default` and `placement-reason` rules in `placementFindings`, `evaluationFindings` (`tiers`, `applicability`), `evaluationFacts` and `readFolderJson`; `planFindings(plan, facts)` and `readPlan(folder, options)`.
- `cli/lib/evaluate/registry.js`: `isSkillRunnerEntry`, `SKILL_RUNNER_BIN` and `entryEnvironmentKeys` (moved or added here so `ci-plan.js` and `check.js` share one definition; `principalMappingProblems` uses `entryEnvironmentKeys`).
- `cli/lib/evaluate/check.js`: imports the moved helpers and hands `checkCiPlan` the rubric decision it derived.
- `cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json`: two descriptions only.
- `src/workflows/testarch/bmad-testarch-evaluate/references/ci.md`: `## Write the plan`, one line in `## Place each check`.
- `test/test-evaluate-ci.js`: `checkDerivableFields` and the helpers `derivedProblem`, `derivedValid`, `copyEvaluation`, `prOnly`, `rulesOf`; `writePlan` keeps `evaluation.json` `tiers` equal to the plan's; the live-tier cases name `defaultTier: 'scheduled'` for a merge `preflight-live` over the verdict fixture.
- `test/test-evaluate-guidance.js`: `filledTemplate`, the shipped-template rule check and the new `ci.md` markers with their corrupted-guide cases.
- `test/test-evaluate-partition-plans.js`: `setTiers`; a rubric project's plan gains `judge-calibration` on both live tiers.
- Fixtures: `test/fixtures/evaluate/mutation/evals/verdict-ci/` (plan and `evaluation.json` `tiers`), `test/fixtures/ci-eval/evaluation-tiers/evals/router/ci/evaluation-ci-plan.json` (reasons).
- `docs/reference/tea-evaluate-cli.md`, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-10), `sprint-status.yaml` (row 1.96 `review`).
- Not changed: `ci.js`, the plan template, `SKILL.md`, the capture records, the lane lists and the counts Story 1.95 gates.

## Tasks & Acceptance

- [x] `ci-plan.js`: the six rules, the facts `readPlan` reads and the skip paths.
- [x] `registry.js`, `check.js`: the shared helpers and the rubric decision.
- [x] `ci.md`: the manual `trigger` and `tiers` steps dropped, the findings named.
- [x] Committed plans: the reasons, the `preflight-live` default and the `tiers` the rules ask for.
- [x] `test:evaluate-ci`: the case `the derivable fields`; `test:evaluate-guidance`: the template as the stage fills it; `test:evaluate-partition-plans`: its rubric projects.
- [x] Reference, CHANGELOG, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md`, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.96, with the amendment dated 2026-10-04 there.

## Decisions

1. **Rules live where the plan and the evaluation can express them.**
   The schema cannot say that a trigger belongs to a tier, that `tiers` equal a set derived from the checks, or that a `defaultTier` follows a registry, and a schema failure would carry rule `schema` where the story names six rules.
   So all six are `ci-plan.js` findings, and the schema keeps its structure.
2. **`readPlan` reads the evaluation, `planFindings(plan)` does not.**
   `check` and `ci` both call `readPlan`, so they report one set.
   `planFindings(plan, facts)` takes the facts as an argument and runs the plan-only rules without them, which keeps the guide's tagged examples and the template validated by the same code.
3. **A rule skips what it cannot read.**
   `check` already reports an `evaluation.json` or a contract that fails its schema, so a cross-file rule stays quiet there and one defect is named once.
   The registry helpers ignore a malformed `environmentKeys` or `auth`, so no input crashes the plan reader.
4. **The rubric rule reads the live tiers the plan uses.**
   The tagged-release repository has no schedule, so its live set sits on `release` alone and needs `judge-calibration` there only.
   The rule asks for the check on each of `scheduled` and `release` that holds a live check and names the tier that lacks it; `epics.md` carries the amendment.
5. **A rubric is `contract.json`'s or the held-out plan's.**
   The both view of `partition.js` unions them, so a rubric only the held-out plan declares needs calibration on the live tiers.
   `check` hands the plan reader the rubric decision it derived, so a `development` run leaves the held-out plan unopened (Story 1.51) and `check` and `ci` agree whenever the plan is readable.
6. **"Needs a secret" is read from the registry and the target kind.**
   A command or server entry's `environmentKeys`, an HTTP entry's server keys and `auth.environmentKey`, an entry that launches `tea-skill-runner`, and a `targetKind` of `skill` or `agent` each mean the target needs a secret, which is the guide's rule that a skill or agent target always needs the runner's credentials.
   A registry that cannot be read leaves `placement-default` to its table check.
7. **The `trigger` rule allows a subset of the tier's events.**
   `scheduled` allows `schedule` and `manual-dispatch` and `release` allows `release` and `manual-dispatch`, so a plan that names `manual-dispatch` alone is valid, and the rule keys on `placement.tier`, the tier `ci` selects by.
8. **`placement-reason` asks every check for a reason.**
   The message differs for a default placement and a moved one, and the template, which ships empty reasons, fails `check` until the stage writes them.
9. **The verdict fixture's plan carries a deviation.**
   Its registry names `VERDICT_*` keys, so the target needs a secret by the rule, and its `merge` `preflight-live` records `defaultTier: scheduled` with a reason that says the stub holds no real secret.
   Its `evaluation.json` `tiers` now name the four tiers its plan uses.
10. **The shared helpers move to `registry.js`.**
    `isSkillRunnerEntry` served `check.js` alone, and `ci-plan.js` needs it, so one definition lives beside `kindOf`.
11. **`api-conformance` over an evaluation with no HTTP target exits 10 from the plan.**
    `ci.js` keeps its exit 64 for the registry it cannot read, which `test:evaluate-ci` holds with an `evaluation.json` that names no registry; the reference, the CHANGELOG and AD-10 say so.
12. **The guide names the findings and drops the manual steps.**
    `references/ci.md` no longer tells the model to set `trigger` to match the tier or to set `evaluation.json` `tiers`; it tells the stage to apply the repair each `check` message names.
    The guide was edited directly, with the guidance test pinning each sentence, and then held to the `bmad-workflow-builder` Edit flow's checks: `quick_validate` ok, `scan-scripts` 0 findings, and `scan-path-standards` 6 findings that match `origin/main` byte for byte and none in `references/ci.md`.
    A read-only Analyze pass over the skill found 0 critical and 1 high on an edited line, a sentence the guidance test pins, which the edit restored.

## Implementation Notes

- `evaluationFacts` returns `tiers`, `hasHttpTarget`, `needsSecret` and `declaresRubric` (a function, read only when a live tier lacks `judge-calibration`).
- `writePlan` in `test/test-evaluate-ci.js` sets `evaluation.json` `tiers` from the plan unless `syncTiers` is false, so cases that edit a plan stay quiet on the `tiers` rule and the cases about it set the mismatch themselves.
- The committed repository plans (`tagged-release`, `nightly-deploy`) needed no change: their reasons, defaults, triggers and `tiers` already satisfy the rules.
- `test:evaluate-ci` cases `the plans of two repositories` and `the capture-record guard` fail on this branch until the coordinator recaptures: both compare the digest of `references/ci.md` with the one the capture records pin (`tagged-release: references/ci.md changed since the live session read it; run the session again`).
  With that one comparison neutralized in a scratch copy, both cases pass, so the digest is the only failure.
  The capture records are untouched.

## Revert observations

Each revert was applied once to a scratch copy of the final tree under the scratchpad directory, the named case run and the copy restored.
The case `the derivable fields` stops at its first failing assertion, so the count is one failed case and the cell names the assertion.
`--only="the derivable fields"` runs it (`node test/test-evaluate-ci.js`).

| Revert (the one edit)                                                          | Case run                  | Observed                                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `trigger` rule off                                                             | `the derivable fields`    | 1 case fails: "a pr check naming schedule: ci exited 0"                                                         |
| `release` loses `manual-dispatch` in `TIER_TRIGGERS`                           | `the derivable fields`    | 1 case fails: "release naming release,manual-dispatch" is refused with `[trigger]`                              |
| `tiers` rule off                                                               | `the derivable fields`    | 1 case fails: "a declared tier the plan does not use: ci exited 0"                                              |
| `tiers` rule runs over a plan with no check                                    | `the derivable fields`    | 1 case fails on the empty-plan assertion                                                                        |
| `placeholder` rule off                                                         | `the derivable fields`    | 1 case fails: "a placeholder in a command: ci exited 0"                                                         |
| `placeholder` flags any `<`                                                    | `the derivable fields`    | 1 case fails: a valid plan is refused for `<invocationId>` in `evidence[0]`                                     |
| `applicability` over `api-conformance` off                                     | `the derivable fields`    | 1 case fails: "api-conformance over an evaluation with no HTTP target: ci exited 64"                            |
| `applicability` over a rubric off                                              | `the derivable fields`    | 1 case fails: "a rubric with no judge calibration on either live tier: []"                                      |
| The rubric rule asks for calibration on both live tiers whatever the plan uses | `the derivable fields`    | 1 case fails: "a rubric over a release-only live set with no judge calibration" names `scheduled` as well       |
| The contract read for the rubric is the development view                       | `the derivable fields`    | 1 case fails: "a held-out rubric needs judge calibration on a live tier"                                        |
| `placement-default` registry branch off                                        | `the derivable fields`    | 1 case fails: "a merge preflight defaulting to merge for a target with environmentKeys: ci exited 0"            |
| `targetKind` `skill` or `agent` ignored                                        | `the derivable fields`    | 1 case fails: "a skill target: []"                                                                              |
| A `tea-skill-runner` entry ignored                                             | `the derivable fields`    | 1 case fails: "the skill runner: []"                                                                            |
| `environmentKeys` ignored                                                      | `the derivable fields`    | 1 case fails: "a server key: []"                                                                                |
| An HTTP entry's server and `auth` keys ignored                                 | `the derivable fields`    | 1 case fails: "a server key: []"                                                                                |
| `placement-reason` only off the default tier                                   | `the derivable fields`    | 1 case fails: "an empty reason on a default placement: ci exited 0"                                             |
| `check` stops handing the plan reader its rubric decision                      | `the derivable fields`    | 1 case fails: "a development run opened the held-out plan"                                                      |
| The verdict plan's merge `preflight-live` back to `defaultTier: merge`         | `the committed plans`     | 1 case fails: "verdict: the committed plan fails validation"                                                    |
| The verdict `evaluation.json` `tiers` back to `["pr"]`                         | `the committed plans`     | 1 case fails: "verdict: the committed plan fails validation"                                                    |
| One reason emptied in the router plan                                          | `test:evaluate-ci-render` | 1 of 339 checks fails                                                                                           |
| The template ships a reason                                                    | `test:evaluate-guidance`  | 1 failure: "template check on pr ships a reason the stage did not write"                                        |
| The template ships every reason                                                | `test:evaluate-guidance`  | 19 failures, one of them "passes the placement-reason rule as shipped, so check would not ask the stage for it" |
| `references/ci.md` back to the text before the story                           | `test:evaluate-guidance`  | 16 failures, ten of them naming `ci.md`: the new markers are missing                                            |

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.
Local, macOS, on the final tree:

- `test:evaluate-check` 1,232 checks, `test:evaluate-ci-render` 360, `test:evaluate-guidance`, `test:evaluate-partition-plans`, `test:evaluate-evaluators` 800, `test:evaluate-boundaries` 500, `test:direction`, `test:evaluate-dogfood`, `test:evaluate-authoring`: green.
- `test:evaluate-ci`: every case green when run by name except two, `the plans of two repositories` and `the capture-record guard`.
  Both compare the digest of `references/ci.md` with the one the two capture records pin, so they fail until the coordinator recaptures the records once, after lane 3's Story 1.98 merges and main is merged here.
  With that one comparison neutralized in a scratch copy of the tree, both pass.
- `test:doc-counts`, `test:doc-claims`, `test:shards` (183), `test:ci-coverage`, `test:changelog`, `test:bmad-output-gated`: green.
- `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`: green.
- `git diff -- package.json package-lock.json` is empty.

## Build review

Round 0: one subagent reviewed the commit read only in three lenses (correctness, test quality, compliance), in place of `/bmad-code-review`.
Every finding was checked against the code before it was acted on.

| Finding                                                                                                                                                                         | Verdict | Route                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Medium: `entryEnvironmentKeys` and `evaluationFacts` could throw on a registry entry with `auth: null` or `environmentKeys` that is no array, and a string key read as a secret | valid   | Fixed here: the helper keeps only string names from arrays, and a test case feeds seven hostile `evaluation.json` shapes to `readPlan` |
| Medium: `check` opened the held-out plan during a `development` run through the rubric rule                                                                                     | valid   | Fixed here: `check` hands `readPlan` the rubric decision it derived, and a case spies on `fs.readFileSync` for a `development` run     |
| Low: the `tiers` rule asked a plan with no check to remove every tier                                                                                                           | valid   | Fixed here: the rule skips a plan with no check, with a case                                                                           |
| Low: `trigger` judged against `entry.tier` where the other rules read `placement.tier`                                                                                          | valid   | Fixed here                                                                                                                             |
| Low: schema descriptions said a reason is needed only when the tier differs from the default                                                                                    | valid   | Fixed here                                                                                                                             |
| Low: `SKILL_RUNNER_SCRIPT` exported with no user                                                                                                                                | valid   | Fixed here                                                                                                                             |
| Medium: `ci.md` said `check` derives and writes what it only reports                                                                                                            | valid   | Fixed here: the guide says `check` holds the fields to what they must be and the stage applies the repair each message names           |
| Low (tests): a fixture-property assertion and a duplicate valid case passed whether or not the rule worked                                                                      | valid   | Fixed here: the valid case adds an `<invocationId>` path of its own and the fixture assertion is gone                                  |

Builder Analyze (five lenses over the whole skill, read only, run as a subagent through `bmad-workflow-builder`): 0 critical and 1 high.
The high was on an edited line and contradicted a sentence `test:evaluate-guidance` pins ("the runtime refuses it without a reason"); the edit was reverted, so the guide keeps the sentence.
The medium findings on edited lines name enhancements beyond the six rules (checks for the no-op `judge-calibration` and `gameability` entries, a scaffold command for the plan), and none is a defect of this story's work.

Round 1 on the open pull request (two Opus lenses, adversarial with test quality, and story with AD and docs compliance).
Every finding was checked against the code before it was acted on.

| Finding                                                                                                                                                                                                 | Verdict | Route                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium: the registry cases of `the derivable fields` ran on an agent target, so the model-kind short circuit hid the entry-shape guards, and the plan held no `preflight-live` for the rules to fire on | valid   | Fixed here: the cases run on a `tagged-release` copy whose `preflight-live` default is `release`, with a control that fails over a readable registry, and a direct `principalMappingProblems` case covers the shared key reader |
| Medium: an `environmentKeys` that is no list read as "no secret" and fired `placement-default` over a registry `check` rejects                                                                          | valid   | Fixed here: `evaluationFacts` leaves `needsSecret` unset when any entry's keys are no list                                                                                                                                      |
| Medium: the exit-code header of `cli/evaluate.js` listed the old `ci` exit 10 and exit 64 causes                                                                                                        | valid   | Fixed here                                                                                                                                                                                                                      |
| Medium: AD-10 kept `api-conformance` with no HTTP target under exit 64, and AD-11's amendment named the wrong rules as readers of `evaluation.json`                                                     | valid   | Fixed here: AD-10 gained a dated amendment and AD-11's sentence names `tiers`, `applicability` and the registry half of `placement-default`                                                                                     |
| Low: Decision 12 credited the owner's brief with a direct skill edit                                                                                                                                    | valid   | Fixed here: the record names the procedure and the validators run over the skill                                                                                                                                                |

Reverts proved once each on a scratch copy of the final tree under the scratchpad, against `test:evaluate-ci --only=derivable`:

| Reverted line                                                       | Result                                                                        |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| the object-entry guard in `evaluationFacts`                         | fails: `Cannot read properties of null (reading 'environmentKeys')`           |
| the `environmentKeysAreLists` guard                                 | fails: the HTTP entry with `auth: null` reports a `placement-default` finding |
| the `Array.isArray` guard in `names` of `registry.js`               | fails: `(value ?? []).filter is not a function`                               |
| the `auth?.environmentKey` optional chain in `entryEnvironmentKeys` | fails: `Cannot read properties of undefined (reading 'environmentKey')`       |

Round 2 (one Opus lens, regressions only) found one low defect: the second `principalMappingProblems` shape had no `kind: 'api'`, so it read as a command entry and never reached the HTTP branch of `entryEnvironmentKeys`.
Fixed here: the shape carries `kind: 'api'`, and the old inline key reader restored in `principalMappingProblems` fails the case.

CodeRabbit round 1 raised two threads.
`isSkillRunnerEntry` read only the basename of `target`, so a registry entry that names `tea-skill-runner` as its `executable` beside another target read as no secret and let a `merge` default pass: valid, fixed here in the shared helper (it also widens the `check` rules that look for the runner), with a `placement-default` case that fails when the `executable` test is removed.
The other thread asked for the recapture of both capture records with the guide edit: valid, and it is the last push of this story, after lane 3's Story 1.98 (#340) has merged and main is merged here, since both stories write `evals/answer-grade/` in the same two fixtures.

## Live recapture

The recapture followed Story 1.98's merge (6b6abf49), so both scratch copies held the repaired AI-feature evaluation's files in `evals/answer-grade/`.
Both sessions ran on this host (macOS) with Claude Code 2.1.289, one at a time, `claude -p "<prompt>" --model claude-sonnet-5-5 --allowedTools Read Write Edit Glob Grep Bash --permission-mode acceptEdits --output-format json` from the scratch repository, with no API key in the environment.
The prompt is the one the committed records held, byte for byte.
`permission_denials` is empty in both outputs.
Each scratch copy held the committed repository without `capture-record.json`, the plan, `runs/` and `baseline/`, the skill copied from the working tree with the `ci.md` edit, `_bmad/tea/config.yaml` with `tea_evaluations_folder: evals`, the CLI and the two packages linked into `evals/node_modules`, `tiers` reset to `["pr", "scheduled"]`, and one scored run (15 trial sets of 3 trials) with no baseline.

| Session          | Model               | Turns | Duration           | Outcome                                                                                                                                                                                                                                                       |
| ---------------- | ------------------- | ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tagged-release` | `claude-sonnet-5-5` | 19    | 301,256 ms (5m01s) | 11 checks: seven on `pr`, `preflight-live` on `merge`, `twin-run` and `held-out` (block) and `strength-comparison` (warn) on `release`; `tiers` `pr`, `merge`, `release`; `tea-evaluate check` clean at the end; tier exits `pr`, `merge` and `release` all 0 |
| `nightly-deploy` | `claude-sonnet-5-5` | 18    | 564,714 ms (9m25s) | 14 checks: seven on `pr`, `preflight-live` on `merge`, the three live checks on `scheduled` (all `warn`) and again on `release`; `tiers` `pr`, `merge`, `scheduled`, `release`; `tea-evaluate check` clean at the end; tier exits all four 0                  |

Neither session's output names a finding of the new derivable-field rules; both end with `check` clean, so the plans the sessions wrote already hold `trigger`, `tiers`, `placement-default`, `placement-reason` and `applicability` as the guide asks.
Every `reason` line of both plans is worded anew, and no tier, enforcement, command or evidence changed from the committed plans.
`evaluation.json` came back from both sessions byte-identical to the committed file (`tiers` at the plan's tiers).
Each session accepted the latest scored run as the baseline in its scratch copy and wrote an inspection record there; neither is committed.
The records took `model`, `turns` and `durationMs` from the output JSON, `claudeCodeVersion` from `claude --version`, the digests from the files, and `repositoryRead` from `test/lib/evaluate-ci-repos.js`.
Both sessions ran after Story 1.98, so the records declare no `migrations` entry and `wrote` digests `evaluation.json` as it stands.
`checkCaptureRecordGuard` builds the record of a session that ran before Story 1.98 and Story 1.42 from the committed one, with both migrations declared, and runs every guard case over it, plus a case that a record declaring a migration over the file as it stands fails `is not the file the live session wrote`.
