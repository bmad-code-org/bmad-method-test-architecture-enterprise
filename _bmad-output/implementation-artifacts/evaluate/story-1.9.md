---
title: 'Story 1.9: Qualify gameability and historical probes, and judge rubrics'
type: 'feature'
created: '2026-09-25'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '87b3ea4f8fcc08536b35cae3558388ab039a112e'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.8, 1.9, 1.17, 1.21)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.9 section, R1-19)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-6, AD-7, AD-8, AD-10, AD-19)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.8.md (Implementation Notes: run directory, provenance, judgment)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `tea-evaluate run` refuses `gameability` and `historical` probes with exit 12 and never runs a rubric judge, so shortcut answers go unmeasured, a target with no launchable mutation cannot be probed, and a contract's rubrics are sealed with `judgeResults: []` and `judgeConfiguration: null`.

**Approach:** Add the `gameability:<probeId>` arm (no launch: the committed degenerate response answers every plan step as a synthetic observation, and the naive and disciplined oracles are resolved over it with `resolveCheck`), the `historical:<preFixSha>` arm (fail-before at the fix commit's parent, pass-after at the fix commit, witness legs routed to the parent, refusal recorded with its reason), and a rubric judge that runs once per trial through `cli/lib/agent-adapters.js` only when the contract declares a rubric.
Each materialized probe qualifies through eval-quality's `qualifyProbe` with no failure code; `score.js` stays unchanged.

## Boundaries & Constraints

**Always:** every verdict comes from the eval-quality CLI over persisted, schema-validated files; every new run-directory write goes through `run-directory.js`; the adopter's tree is never written; trials run in fresh workspaces; a contract with no rubric makes zero agent calls and keeps `judgeConfiguration: null`, so every existing fixture digest is unchanged; vendor knowledge stays in `cli/lib/agent-adapters.js`.

**Never:** judge calibration or `tea.judgeCalibrationDigest` (Story 1.21); pluggable evaluator kinds, judgment rows or `tea.evaluatorKind` (Story 1.17); canary arms; `compare` or `ci` (Epic 2); a new subcommand; any change to the controlled-mutation cycle or the clean-arm revision (HEAD).

**Decisions (coordinator, owner-delegated):**

- The degenerate response's bytes are committed at `corpus/gameability/<probeId>.json` (per plan step `{ stdout, stderr, exitCode }`), since eval-quality keeps `degenerateResponse` as prose; the committed gameability qualification gains a TeA-only `naiveOracle` (an oracle of another behavior); the disciplined oracle is the probe behavior's own.
- The naive oracle must hold and the disciplined oracle must be violated over the synthetic observation, else exit 11.
- The historical post-fix revision is the authored `fixCommit`, the pre-fix revision its first parent; the arm label carries the pre-fix full SHA; `artifactDigest` is the tracked tree at the pre-fix revision; `fixCommitDigest` is the digest of the fix commit's full SHA.
- A historical probe is refused, with its reason, when `fixCommit` has no parent, does not resolve, is not an ancestor of HEAD, or the pristine workspace is not a git worktree; a refused probe stays out of the preflight probe list, `probes.json` and the trial sets, and is listed in `run.json` and `runs/<id>/refused/<probeId>.json`; refusal alone does not fail the run.
- Judge wiring lives in `evaluation.json` `judge` (`agent`, optional `agentCommand`, `agentArgs`, `model`, `timeoutMs`); its model snapshot in `policy/evaluator-conditions.json` `judge.modelSnapshot`; `judgeConfiguration` is `{ modelSnapshot, systemPromptDigest }` with the digest over the runtime's judge instruction template. `check` exits 10 when a rubric is declared with no judge block or no judge snapshot.
- The judge receives the instruction template, each rubric's scale anchors, penalties and criterion text, and the evidence each criterion points at; never the contract, oracle checks or `testData`. It must return one score per declared criterion; an unparseable reply, a missing criterion or an off-scale score becomes `score: null` with a note (eval-quality turns that Invalid); an agent failure yields no record and exit 12.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Gameability | probe P-003 on B-001, naive O-002 (B-002), corpus file | no gameability launch; both evidence files; probe qualifies; `score` `caught` | naive violated or disciplined held: exit 11 |
| Historical | temp repo, fix commit, natural defect | fail-before at parent, pass-after at fix; witness leg `cwd` at parent; probe qualifies | fail-before holds: exit 11 |
| One-commit repo | historical probe, no parent | probe refused with reason in `run.json` and `refused/`; the rest runs | N/A |
| Rubric | contract with R-001 | one judge call per trial; `judgeResults` per criterion; `judgeConfiguration` recorded | agent failure: exit 12, no record |
| No rubric | any Story 1.8 fixture | zero judge calls; `judgeConfiguration: null` | N/A |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/run.js` -- `RUNNABLE_ROUTES` and `refusal()` (:62, :113-122) drop the two routes; arms built at :413-427, `runTrial` at :296-382, unarmed guard at :437-445 (exclude refused probes), configuration at :473, records at :544; clean-control qualification (:197-288) is the model for inline materialization.
- `cli/lib/evaluate/preflight.js` -- `QUALIFIED_ROUTE` and refusal (:85, :446-452); seeded probes filter (:146-156); witness routes map (:723-736) via `mutatedRoute` (:913-942) returns `{ label, cwd, port }`; reuse `runArmFor` (:983-1001), `admissionRefusal` (:895, calls `engine.qualifyProbe`), `attestedDigests`, `referenceTo`, `armVerdict`; `recordingPort` (:180-221) writes `workspace` and `cwd`.
- `cli/lib/evaluate/workspace.js` -- `createWorkspace` (:475) gains a `commit` option on the no-basis worktree path; `runGit` (:329), `trackedTreeDigest` (:298); `sharedStateDigest` already excludes `worktrees/`.
- `cli/lib/evaluate/arm.js` -- `runArm` (:179-238) takes any `{ probe(request) }` port: the gameability arm passes a synthetic port answering from the corpus file.
- `cli/lib/evaluate/evaluator.js` -- `evaluateOracles` (:71) wraps `resolveCheck`; `judgeTrial` (:208) unchanged; `channelText` (:114) may be exported for judge evidence.
- `cli/lib/evaluate/mutation.js` -- `qualifiedProbe` (:475) is the model for the historical and gameability builders.
- `cli/lib/evaluate/records.js` -- `evaluatorConfiguration` hardcodes `judgeConfiguration: null` (:158), `sealedRunRecord` `judgeResults: []` (:326): add parameters with those defaults.
- `cli/lib/evaluate/judge.js` (new) -- `judgeRubrics`, exported for Story 1.21 to reuse unchanged; calls `runAgent` (`cli/lib/run-agent.js:111`) with the adapter key from `cli/lib/agent-adapters.js`.
- `cli/lib/evaluate/check.js` -- `ARM_OF_ROUTE` / `USES_OF_ARM` (:85-89), `checkArmsAndTrials` (:910-931), committed-field guard (:109-125); new rules for the gameability corpus file and naive oracle, historical natural defects, and the judge block.
- `cli/lib/evaluate/schemas/` -- `evaluation.schema.json` (`arms` enum :89-97, new `judge`), `committed-probe.schema.json` (gameability :65-71 gains `naiveOracle`; historical :50-51 has `fixCommit`), `evaluator-conditions.schema.json` (optional `judge`).
- `node_modules/eval-quality/dist/core/schemas/probe-qualification.js:47-57` and `:99-113` -- historical and gameability qualification shapes; `dist/core/score/qualification.js` -- historical admissible only with `natural` defects.
- `test/test-evaluate-run.js:1215-1239` and `test/test-evaluate-preflight.js:1040-1057` -- the exit-12 refusal cases that flip; `makeProject`/`git` (:171, :198); `test/lib/scratch-directories.js`; fixture `test/fixtures/evaluate/mutation/` (stub `bin/verdict.js`, B-001/O-001).

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/evaluate/workspace.js`, `preflight.js`, `run.js`, new `cli/lib/evaluate/historical.js` -- revisions, refusal, fail-before and pass-after qualification, witness routing, `historical:<sha>` trials.
- [x] new `cli/lib/evaluate/gameability.js`, `run.js` -- synthetic port, naive and disciplined evidence, materialized probe, `gameability:<id>` trials.
- [x] new `cli/lib/evaluate/judge.js`, `records.js`, `run.js` -- the rubric judge, `judgeResults`, `judgeConfiguration`.
- [x] `cli/lib/evaluate/check.js`, `cli/lib/evaluate/schemas/` -- new rules and fields, each a `test:evaluate-check` case.
- [x] `test/test-evaluate-arms.js`, fixtures under `test/fixtures/evaluate/` (a stub judge through the `custom` adapter, a launch marker recording the workspace label), `package.json` `test:evaluate-arms` in the `npm test` chain (which CI's `chain` matrix runs since the CI change below); flip the two refusal cases.
- [x] `docs/reference/tea-evaluate-cli.md`, CHANGELOG, sprint-status (1.8 `done`, 1.9 `review`), planning amendments (AD-7 arm label, historical `artifactDigest`, judge fields; AD-8 route trigger; Story 1.9 criterion names the new fields).

**Acceptance Criteria:** epics.md Story 1.9; each revert check in test-design-epic-1.md's Story 1.9 table is exercised once and recorded below.

## Implementation Notes

- **Implemented directly**, as Story 1.8 was: this build runs as a subagent of the coordinator.
- **Shared admission helpers.** `armVerdict`, `referenceTo` and `admissionRefusal` moved from `preflight.js` into `cli/lib/evaluate/admission.js` (re-exported by `preflight.js`), since `historical.js` is loaded by `preflight.js` and would otherwise import it back in a cycle.
- **Historical route** (`historical.js`, `preflight.js`). `fixCommit` is a hexadecimal commit id (final review round 1: a ref moves as history advances); one that names no commit in a full-history repository exits 10, and in a shallow clone the missing commit or parent refuses the probe naming the shallow history. `historicalRevisions` refuses, with the reason, a pristine workspace that is not a git worktree, a fix commit that is not an ancestor of the evaluated commit, one with no parent, and a revision where the target cannot run (a root that is not a directory at either revision, checked with `git cat-file -t`, a submodule or a non-executable registry target at the pre-fix revision). The one-commit test names the commit's own id and writes the probe after the commit, as uncommitted work the run reads. A refusal goes to `run.refused` and `refused/<probeId>.json`, and the probe stays out of the qualification, `probes.json` and the arms. Qualification runs the plan in `qualify-<probeId>-fail-before` (at the parent) and `qualify-<probeId>-pass-after` (at the fix), through `createWorkspace`'s new `commit` option. `oracleStableAcrossRevisions` is `true`: both arms are judged by the one compiled contract the run read before any arm ran. A pre-fix revision that holds no `launch.root` or skill root is refused, and a `merge-base --is-ancestor` failure other than status 1 refuses with git's own error. One worktree per pre-fix revision (`historical-<sha>`) takes the witness legs, and the `historical:<sha>` arm's trials reproduce it as their basis.
- **Gameability route** (`gameability.js`, `preflight.js`, `run.js`). Qualified in the shared pipeline before the verdict, as seeded probes are, so `preflight` and `run` both exit 11 on a response that does not game the naive oracle, and `run` reuses the result; a gameability probe seeds no defect, so it never enters the preflight probe list (the preflight's sensitivity-witness legs still launch the target in the pristine workspace; the arm itself launches nothing). The degenerate response is read once by the shared pipeline, after `check` and before any workspace is made. Its schema is the new runtime-owned `degenerate-response.schema.json` (`{ schemaVersion: 1, steps: { <stepId>: { stdout, stderr, exitCode } } }`). A gameability probe's `artifactDigest` is its `implementationDigest`, as a clean control's is; AD-7 is amended for it.
- **Judge** (`judge.js`). `judgeRubrics` decides the no-rubric case itself (no call, no `evaluation.judge` read), so Story 1.21 can call it over calibration items unchanged. The judge runs through `run-agent.js` with `capabilities: ['read-only']` in an empty temp directory removed after the call. The prompt is `JUDGE_INSTRUCTIONS` followed by one JSON block of rubrics (levels, anchors, penalties, `maxLength`, criteria with their resolved evidence); evidence is resolved with eval-quality's `makeResolveOperand`, and no pointer, step ID, oracle or `testData` is sent. Each call draws a 128-bit random nonce after the target ran, the per-call material asks for the answer in exactly one `<judge-answer nonce="<nonce>">` block, and `judgeResultsFrom(contract, reply, nonce)` reads that block and nothing else, so a scores object a target prints, however shaped, never becomes a score (final review round 4 replaced the earlier quote-matching rules, which rounds 1 to 4 defeated); the nonce is kept in the trial's judge evidence and out of every scoring-version input (the evaluator configuration and the template digest do not carry it). After each call the runtime yields two macrotasks so a pending interrupting signal reaches the run's handler, and a judge that left anything in its directory fails the call. `check` refuses an adapter that cannot run read-only (`runsReadOnly: false` in the adapter table). A trial no judge scored keeps Story 1.8's evidence bytes (no `judge` key), so every no-rubric artifact digest is unchanged.
- **Check rules.** `gameability`, `historical` and `judge` are new; `arms` now maps each arm to its own route (`mutated` to `controlled-mutation`, where it used to count any seeded probe, which a historical probe now is); a historical probe needs the scoring policy (its arms are judged within `regexMatchStepBudget`). `judge` validates the adapter through `AGENT_ADAPTERS` and `resolveModel` from `cli/lib/agent-adapters.js`, so no vendor name is copied into the runtime.
- **Exit 12 when every probe was refused**, a case the spec does not name: with no arm, the run has no trial set to seal, and `trial-sets.schema.json` requires at least one. Documented in the CLI reference and covered by `test:evaluate-arms`.
- **Refusal cases flipped.** `test:evaluate-run`'s gameability refusal became a canary refusal (still exit 12), and `test:evaluate-preflight`'s historical refusal became a canary that seeds a defect; `test:evaluate-arms` covers both routes running, `preflight` on a historical probe included, and a `--from-working-tree` run refusing it.
- **Fixtures.** `bin/verdict.js` gains the `VERDICT_MARKER` launch marker (workspace label, checkout `HEAD`, request), added to the fixture registry's `environmentKeys`; `test/fixtures/evaluate/stub-judge.js` is the `custom`-adapter judge (`--log`, `--capture`, `--mode fail|off-scale|missing|garbage`).
- **Skill assets.** The two `assets/` edits (the evaluator-conditions template's `judge` block and the README lines on it and on `parentDigest`) were made directly, as Story 1.8's were; builder Analyze gates them on the coordinator's side (0 critical, 0 high as reported).

### Revert checks exercised

Each change was undone once through an environment switch planted in the runtime, the suite run, the failure observed, and the file restored byte for byte.

- Gameability arm launching the target (the degenerate branch of `runTrial` skipped): "the gameability arm launched the target", with marker lines from `trial-gameability-P-003-1..3`; 9 failures.
- Historical pre-fix revision routed to HEAD (`historicalRevisions` returning the evaluated commit as `preFix`): "a historical run exited 11; expected 0", the fail-before arm holding; 5 failures.
- An unconditional judge call (the no-rubric guard in `judgeRubrics` removed): since the build review's Analyze follow-up no judge can be wired beside a contract with no rubric, so the guard is the unit case, where the stub judge's call log is no longer absent ("judgeRubrics called the judge for a contract with no rubric"). Observed once with the guard removed in round 1, when the end-to-end case still wired a judge: "a contract with no rubric called the judge 6 times; expected none"; 11 failures.

## Spec Change Log

- 2026-09-25: ARCHITECTURE-SPINE.md AD-7 amended three times: the `historical:<revision>` label is the pre-fix full commit id and the gameability response and `naiveOracle` are named; the judge fields (`evaluation.json` `judge`, `judge.modelSnapshot`, `judgeConfiguration`, `judgeResults`); the probe digests for a gameability probe (`implementationDigest`) and a historical one (the tracked tree at the pre-fix revision, and `fixCommitDigest`).
- 2026-09-25: ARCHITECTURE-SPINE.md AD-8 amended: the historical route is triggered by the probe's `fixCommit`, with the refusal reasons and where a refusal is recorded.
- 2026-09-25: epics.md Story 1.9's three criteria amended to name the new fields, files and check rules.
- 2026-09-25 (coordinator, before the build): `implementation-artifacts/evaluate/epic-1-context.md` recompiled with bmad-build's compile-epic-context, since the planning files had changed after its last compile in Story 1.4 (the Stories 1.5 to 1.8 amendments and the appended Stories 1.27 to 1.31).
- 2026-09-25, build review round 1: AD-8 and the Story 1.9 historical criterion gain two refusal reasons (the launch or skill root absent at the pre-fix revision; git's own error when ancestry cannot be read), and state `oracleStableAcrossRevisions` is recorded `true` because both arms are judged by the one compiled contract the run read before any arm ran; the gameability criterion states `preflight` qualifies gameability probes before its verdict. No known-bad state to avoid; KEEP: the three arm modules and the judge's reply handling.

## Review Triage Log

### Build review round 1 (step 4: blind hunter B, edge-case hunter E, verification gap V, test review T; all opus)

| ID | Verdict | Finding | Evidence and route |
| --- | --- | --- | --- |
| V1 | medium | no run mixes a qualified controlled-mutation probe with a qualified historical probe | `makeHistoricalProject` drops P-002 and `mutations/`; `run.js` `entry.mutation?.mutationId` and the preflight route pick never meet a mix; patch: a mixed end-to-end case |
| V2, B5, T2 | medium | the `does not resolve` and `not an ancestor` refusals have no case | the test reviewer disabled the ancestor guard and the suite stayed 131/131; patch: two refusal cases |
| B1 | medium | `oracleStableAcrossRevisions` compares two copies of one list, so it cannot be false, and the docs say the contract lives outside both revisions | both phases take the same `oracleIds`; TeA's own layout keeps the evaluation folder in the repository; patch: record `true` with the reason the code holds (both arms are judged by the one compiled contract of the run), and correct the docs wording |
| B2 | medium | a judge that fails leaves no stdout or stderr in the evidence | `JudgeError` is built with neither and `runAgent` only prints the stderr tail; patch: carry the streams onto the fault evidence |
| B3 | low | the rubric's `maxLength` bound on a note is asked for and never held | `judgeResultsFrom` accepts any note length; patch: a note over the bound unscores that criterion with a note saying why |
| B4 | medium | the judge template does not tell the judge the evidence is data | target stdout reaches the prompt verbatim, and a gaming target can address the judge; patch: one template sentence |
| B6 | low | the pass-after exit 11 has no case | only a fail-before that holds is run; patch: a fix commit that does not fix |
| B7, V-other, T4 | low | stub judge modes `missing` and `garbage` are never used | grep finds no caller; patch: one end-to-end `garbage` case asserting `score: null` and eval-quality's Invalid |
| B8 | low | `naiveOracle` has no pattern | schema is bare `string`; patch: the oracle ID pattern |
| B9 | low | docs, CHANGELOG and `check.js` header omit the historical `expectedClean` rule | `checkProbe` refuses it; patch: name it |
| B10 | medium | `preflight` does not qualify gameability probes, so it can pass where `run` exits 11 | gameability qualification runs only after the verdict; patch: qualify gameability in the shared pipeline before the verdict, as seeded probes are |
| B11 | medium | the skill's `evaluator-conditions` template has no `judge` block while `check` requires one for any rubric | template read: `schemaVersion`, `modelSnapshot`, `systemPromptDigest` only; patch: add `judge.modelSnapshot: null` and its README line |
| B12 | low | `epic-1-context.md` rewrite is not logged | the coordinator recompiled it because planning changed after it was built (Stories 1.5 to 1.8 amendments, 1.27 to 1.31); logged in the Spec Change Log |
| B13 | low (reversed after the Analyze pass) | a declared `judge` with no rubric passes silently | first read as false; builder Analyze's determinism-1 showed the harm: an adopter copying the template for a rubric-less contract gets a generic schema error, and filled wiring is silently ignored; patch: `check`'s `judge` rule refuses a judge block beside a contract with no rubric, and the README says to delete it |
| E1 | false | `judge.modelSnapshot` could differ from the model the adapter runs | `resolveModel` returns an alias (`sonnet`) or `null`, never a snapshot, so no comparison is possible; the snapshot is the adopter's attested fixed condition, as the target's `modelSnapshot` already is |
| E2 | low | `run.json` records a `null` judge model when the adapter default runs | `run.js` writes `evaluation.judge.model ?? null`; patch: record `resolveModel`'s answer |
| E3, E4 | medium | a pre-fix revision without `launch.root` or the skill root stops the whole run with 12 | `make` throws `WorkspaceRefusal`, and `trackedTreeDigest` runs after both arms; patch: refuse the probe, with the reason, when either root is absent at the pre-fix revision, before any arm |
| E5 | false | provisioned directories in a pre-fix worktree come from the current tree | provisioned directories are untracked dependencies by definition, so no revision holds them; the current copy is the only one there is |
| E6 | low | a reply with prose holding `}` after the JSON object is read as unparseable | `replyObject` slices first `{` to last `}`; patch: try each balanced object from the first `{` |
| E7 | low | a shallow clone reads as "not an ancestor" | `merge-base --is-ancestor` exits 128 on missing history; patch: status 1 alone means not an ancestor, anything else refuses with git's own error |
| E8 | false | the pre-fix worktree leaks when its targets cannot launch | `make` pushes every workspace into the run's cleanup list (`preflight.js:469-480`) |
| E9 | false | a behavior with several oracles qualifies when any one rejects | `check`'s oracle-count rule holds a behavior a probe discharges to exactly one oracle, gameability included |
| E10 | false | the judge could read the evaluation folder through its tools | it runs `read-only` in an empty temp directory and is given no path into the evaluation; the criterion is about what the prompt carries |
| E11 | false | a run whose every probe is refused exits 12 | a run with nothing to seal exits 12 since Story 1.8 (C-H2); the refusal itself still does not fail a run that has anything else to seal |
| T1 | low | the prompt test never checks the penalties | the reviewer emptied `failureModePenalties` and the suite stayed green; patch: assert a penalty description and an anchor |
| T3 | low | only the last judge prompt is scanned, and `testData.cleanup` is not in the withheld list | the stub overwrites `--capture`; patch: capture every prompt and scan each |
| T5 | low | a weak gameability run that stops before its run directory exists throws and hides the second case | `path.join(null, …)`; patch: the guard lines 331-334 use |
| T6 | low | the fixture rubric shares `R-001`/`RC-001` with the template's example | patch: rename to `R-101`/`RC-101` |

### Builder Analyze (skill gate)

`/bmad-workflow-builder` Analyze ran headless on `src/workflows/testarch/bmad-testarch-evaluate/` after round 1, since the round changed `assets/`: zero critical and zero high findings, five medium and eight low.
The pre-pass's "missing ## Overview section" (high) is skipped as in Story 1.8: no testarch skill carries one and the Goal and Role lines do that job.

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| architecture-1 | medium | `assets/README.md` says to leave `evaluator-conditions.json` out when no model runs, while `check` requires `judge.modelSnapshot` for any rubric | fixed: the file is left out only when no model runs anywhere, and the README gives the judge-only shape |
| determinism-1 | low | a judge block beside a rubric-less contract is silently ignored, and the untouched template fails with a generic schema error | fixed: `check`'s `judge` rule refuses it and the README says to delete the block (B13 above) |
| architecture-3 | low | the README says every template null is the adopter's choice, while `parentDigest: null` is a valid final value | fixed: the README names the exception |
| architecture-2 | medium | the `references/harness.md` placeholder says the stage generates the evaluator configuration and isolation manifest, which `run` writes | skipped: the stage guides are placeholders Story 1.14 fills, and its harness criterion already assigns the templates |
| customization-1, customization-2, enhancement-1 to enhancement-3, leanness-1 to leanness-4 | medium, low | pre-existing `SKILL.md` and `customize.toml` wording and resume behavior, unchanged by this story | skipped: the prompt content belongs to Stories 1.12 to 1.14, and the customization findings are shared by every TEA skill |

### Final review round 1 (relay step 4: adversarial A, edge cases E, test quality T, compliance C; all opus, on 33ed5e8)

All fixed in 00221cf unless the row says otherwise.
CodeRabbit's one thread (the layout comment omitting gameability) is C4; it was answered and resolved on the pull request.

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| A1 | high | a target printing its own `{"scores":[...]}` had its forged score taken when the judge quoted the evidence first | fixed: a reply carrying more than one scores object unscores every criterion; arms case with a forging target and an echoing judge (round 2 found the single-object variant: see there) |
| A2 | medium | a `fixCommit` that names no commit dropped the probe silently, and `score` never said so | fixed: exit 10 in a full-history repository, a shallow-history refusal otherwise, and `score` reports every refused probe |
| A3, E-L1 | low | `fixCommit` accepted moving refs | fixed: a hexadecimal commit id is required (schema and `check`) |
| E-M1 | medium | a signal during a judge call was lost or reported as an infrastructure failure | fixed: two `setImmediate` turns after `runAgent`, then the run's abort signal is honoured as a stop from outside; SIGINT case |
| E-M2, C3 | medium | "read-only" was not held for `agy` or `custom` | fixed: `agy` carries `runsReadOnly: false` and `check` refuses it as judge; a judge that leaves anything in its empty directory fails with exit 12; the CLI reference says what binds per adapter |
| E-L2 | low | a revision without a root, target or tree stopped the run with 12 | fixed for roots at both revisions and targets and submodules at the pre-fix revision (round 2 found the fix-revision half: see there) |
| E-L3 | low | a shallow clone was misreported as "no parent" or "does not resolve" | fixed with A2 |
| E-L4 | low | the template example's IDs could equal a real contract's | fixed: placeholders |
| C1 | medium | the remote-deployment half of the historical route is not delivered and no story owned it | AD-8 and the Story 1.9 criterion-2 amendment say so honestly; Story 1.32 appended to Epic 1 |
| C2 | low | Story 1.17's criteria did not scope the new `judge` rule | fixed: dated amendment, the rule and the judge call bind only the `deterministic` evaluator kind |
| C4 | low | the layout comment omitted gameability's scoring-policy requirement | fixed |
| C5 | low | the `assets/` edits went in by hand, outside the builder | recorded: the two data-file edits were gated by builder Analyze (0 critical, 0 high), as Story 1.8's were |
| C6 | low | the record contradicted itself on the template and on status, and 1.5, 1.7 and 1.8 still read `in-review` | fixed |
| T1 | medium | the runtime's own `admissionRefusal` gate was never exercised | fixed: stub-engine unit cases for both builders, exit 10 |
| T2 | medium | the prompt scan checked a hand list | fixed: every string leaf of `contract.json` except the rubric's own text |
| T3 | low | round-1 fix E2 was untested | fixed: `recordedJudgeModel` unit cases |
| T4 | low | round-1 fix E7 was untested | fixed: injected-git unit case for status 128 |
| T5 | low | four `check` clauses had no case | fixed |
| T6 | low | the judge's isolation was untested | fixed: cwd log, `hang` and `write` modes |
| T7 | low | the end-to-end zero-call count could not fail | fixed: relabelled, and the unit case is the R1-19 guard |

### Final review round 2 (adversarial A, edge cases E, test quality T, compliance C; all opus, on d18f40a)

All fixed in the commit after d18f40a unless the row says otherwise.

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| A1, E3 | high | a shard's coverage could be missing from the merge while CI stayed green (all five leave-one-out merges passed the thresholds) | fixed: each shard writes a manifest of the scripts it ran, the upload errors on no files, and the coverage job refuses unless manifests for every shard together name exactly the chain |
| A2, E2, T1 | high | `exclude`, `include`, a job or step `if`, `continue-on-error`, `\|\| true` and `--list` passed both guards while dropping a shard or its failures | fixed: the guard reads the parsed job and step and refuses each, plus `shell` and a workflow without `pull_request`; one case per bypass |
| A3, E1 | medium | a chain part that is not `npm run <name>` was dropped silently | fixed: the parser refuses it by name |
| A4 | medium | a judge that only quoted the target's forged scores object had it taken | fixed: a scores object whose text appears in the evidence the judge was given is never taken |
| A5, E5 | medium | the target and submodule checks covered only the pre-fix revision | fixed: both revisions' worktrees meet the launch checks before either arm runs |
| E4, A6 | medium | a symlinked target, a target under a provisioned directory and a symlinked skill root were refused with a false reason | fixed: the checks run on the revision's worktree through `registry.targetProblems`, which follows links and sees provisioned copies |
| A7 | low | a branch spelled like a commit id resolved through the branch | fixed: the resolved id must start with the spelling, else exit 10 |
| A8, E6b | low | an out-of-range heartbeat interval fired every millisecond | fixed: 0.05 to 3600 seconds, with a fallback in the CLI and exit 64 in the heartbeat |
| E6a | low | a script named `..` made the raw coverage directory the temp root, which the tool then removed | fixed: raw directories are named by position |
| T2 | medium | the submodule and non-executable refusals had no case | fixed: seven refusals beside a running clean control |
| T3 | low | the judge's `signal?.aborted` branch and `signal` stage mapping could not run, since the signal handler re-kills the process | fixed: the dead branch is removed and the yields stay |
| T4 | low | the SIGINT case could read an empty pid file and signal its whole process group | fixed: the stub renames its pid file into place and the case signals only a positive pid |
| T-other | low | a script a signal ends had no shard case | fixed |
| C1 | medium | the story record did not log final review round 1 or the CI change | fixed: the round 1 table and this section |
| C2 | medium | the plan still required a `quality.yaml` step per script and named the `validate` job | fixed: dated amendments to the Build Rule, the criteria from Story 1.9 on, AD-11, AD-15 and both test designs; Stories 1.2 to 1.8, already done, keep their wording |
| C3 | low | README and `publish.yaml` still described `test:cli` as its own job, and publish ran it twice | fixed |
| C4 | low | Stories 1.28 to 1.32 had criteria with no revert check, and Story 1.17's amendment had no test-design row | fixed |
| C5 | medium | the evaluator-conditions schema description contradicted the judge rule | fixed |
| Analyze determinism-1 | medium | the README asked for the empty-byte digest without its value, and `check` held only its pattern | fixed: `check` requires the literal beside `modelSnapshot: none` and the README states it |
| Analyze architecture-5 | low | the README summary omitted the judge block | fixed |
| Analyze architecture-4, leanness-5 | low | no stage guide routes to the assets README | skipped: the stage guides are placeholders Stories 1.13 and 1.14 fill |

The weights were refreshed from the first sharded run's timings (shards had measured 184 to 340 seconds of tests; the refreshed plan puts each at about 236 seconds).

### Final review round 3 (bounded to regressions and material defects: regressions by execution R, material read-only M; both opus, on e3b1ba6)

Both fixed in the commit after e3b1ba6; every other round 1 and round 2 fix was re-checked and holds, and epics.md was confirmed intact (38 stories, 447 criteria, no heading dropped or duplicated) after the round 2 edit collision.

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| R1, M1 | medium | the round 2 quoted-evidence rule matched text, so a judge that re-spaced or reordered the target's forged object and declined to answer had it taken | fixed: evidence values are scanned for scores objects and compared canonically (keys sorted, deep equality); unit cases for compact, pretty-printed and reordered copies, each observed failing on the previous code (4 of 236) |
| R2 | medium | the shard guard's run-line pattern allowed a backslash-escaped quote that let `\|\| true` out of a flag value, and `defaults.run` or `working-directory` passed | fixed: no backslash, `!` or line break in a flag value, and `defaults.run` on the job or workflow and `working-directory` on the step are refused; one case each |

CI on e3b1ba6, with the refreshed weights, took 5 minutes 16 seconds end to end (shards 3m28s to 4m49s).

### Final review round 4 (bounded check of the round 3 fixes, opus, on ddb54a2)

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| J1 to J3 | medium | canonical quote matching was still defeated: a forged object inside a string field of object evidence, one nested inside another scores-bearing object, a reordered scores list, and a copy with a key dropped or added | redesigned: each judge call draws a 128-bit nonce after the target ran, and only the one `<judge-answer nonce="...">` block carrying it is read; the quote-matching code is deleted; ten forged shapes plus a guessed-nonce block never reach `judgeResults` |
| G1 | medium | the shard guard accepted a `pull_request` trigger narrowed by `types`, `paths`, `paths-ignore`, `branches-ignore` or a narrow `branches` list, and `needs` on the chain job | fixed: each is refused, with a case |
| G2 | skipped | `env` entries such as `NODE_OPTIONS` or `BASH_FUNC_*` can turn a failing shard green | out of the guard's scope, now stated in its header and the chain-job comment: it holds the configuration against drift, and a hostile editor of the workflow could change the guard in the same pull request |

### CI wall time (owner request during final review round 1, d18f40a)

The `coverage` job ran the whole chain serially under c8 and hit its 20-minute timeout on 33ed5e8 (Story 1.8's took 19 minutes).
The owner asked for parallelization.
`tools/test-shards.js` splits the `npm test` chain five ways by committed weights, `chain (1/5)` to `chain (5/5)` replace `validate` and `cli`, and `coverage` merges every shard's raw V8 coverage.
Suite 7 of the test-review CLI took 9.4 minutes because the CLI's heartbeat orphaned a `sleep 15` that held its stderr open; the heartbeat is now one Node process that also exits when the CLI is gone, the file runs in about 14 seconds, and `test:cli` joined the chain.
The first sharded run on d18f40a took 6 minutes 45 seconds end to end.

## Verification

**Commands:**

- `npm run test:evaluate-arms` -- expected: every case passes over real eval-quality 4.1.4.
- `npm test` -- expected: green.

**Results:**

- the Build Rules engine check -- exit 0 at the start and at the end on eval-quality 4.1.4; `git diff -- package.json package-lock.json` names no `file:` or `.tgz` spec
- `npm run test:evaluate-arms` -- 131 checks at the first build, 232 after final review round 2, over the real eval-quality 4.1.4
- `npm test` -- exit 0 at each commit of the pull request (the pre-commit hook runs it); the first full run stopped at `test:doc-counts` (README's chain length) and at `lint` (two autofixable test-file findings); the chain is eighty-five scripts after the CI change
- CI on d18f40a (the first sharded run) -- every job green, 6 minutes 45 seconds end to end
- `npm run test:release-metadata`, `npm run docs:validate-links`, `npm run docs:build`, `npm run lint`, `npm run lint:md`, `npm run format:check` -- exit 0
