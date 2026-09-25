---
title: 'Story 1.8: Run the clean and mutated arms and score them'
type: 'feature'
created: '2026-09-24'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 2
baseline_commit: '1f53e9095061ab66f3c35abd9b98baf0f50cf8fe'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.8, 1.9, 1.17)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.8 section, R1-02, R1-10)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-6, AD-7, AD-10, AD-12)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `tea-evaluate` stops at a preflight verdict: nothing runs the clean and mutated arms as trial sets, seals them as run records, or hands them to `eval-quality score`, so an adopter gets no `passed-clean-control`, no `caught` and no strength vector.

**Approach:** Add `tea-evaluate run`, which performs the whole preflight (qualification, legs, the CLI's verdict) and then runs each arm `trials` times in fresh workspaces, judges every trial with the deterministic evaluator over `resolveCheck`, and writes one trial set per probe (sealed records, an isolation manifest, one evaluator configuration per run, `run.json`).
Add `tea-evaluate score`, which validates those files against eval-quality's published schemas and calls `eval-quality score` once per probe, persisting each call's exit code, stdout and stderr, and passing the exit through.

## Boundaries & Constraints

**Always:** every verdict comes from the eval-quality CLI over persisted files; every artifact is validated against eval-quality's published schemas before it reaches the CLI; the adopter's tree is never written; each trial runs in a workspace of its own reproducing the pristine one; trial requests come only from the interaction plan's literal bindings; an absent isolation manifest is passed through as absent, never filled.

**Never:** gameability, historical or canary arms and rubric judges (Story 1.9); a pluggable evaluator kind (Story 1.17); `compare` or `ci` (Epic 2); a new subcommand beyond `run` and `score` (AD-5 fixes seven).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Clean and mutated | stub project, clean control P-001, seeded P-002 on M-001, `trials` 3 | `run` exit 0 with two trial sets of three records; `score` exit 0, P-001 `passed-clean-control`, P-002 `caught`, comparable strength | N/A |
| Infrastructure trial | a trial step exits a registry infrastructure code | no record for it, `run` exits 12, `score` refuses the incomplete run | evidence kept |
| Missing manifest | a trial set's isolation manifest deleted | `score` exits 3, the persisted stderr is non-empty, no evidence artifact | N/A |
| Tampered artifact | a persisted record fails its published schema | `score` exits 10 before any engine call | N/A |
| Too few trials | `trials` below the policy's `minimumTrialCount` | `check` exits 10 | N/A |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/preflight.js` -- the pipeline `run` reuses: check, pristine workspace, compile and seal, qualification, legs, the CLI verdict; gains a continuation that runs while the workspaces are live.
- `cli/lib/evaluate/arm.js` -- `runArm`; gains the observation provenance.
- `cli/lib/evaluate/evaluator.js` -- `evaluateOracles`; gains the per-trial judgment (every contract oracle, findings with verbatim quotes).
- `cli/lib/evaluate/records.js` -- `sealedRunRecord`, `isolationManifest`, `evaluatorConfiguration`, `createArtifactValidator`.
- `cli/lib/evaluate/engine-cli.js` -- `runEngineStage`; gains a record path per call, so each `score` call is kept by probe.
- `cli/lib/evaluate/mutation.js` -- `qualifiedProbe`, `applyReplaceExact`, reused unchanged.
- `cli/lib/evaluate/workspace.js` -- `createWorkspace`, `treeDigest`, `runGit`.
- `cli/lib/evaluate/check.js` -- new rules for `trials`, `arms` and `policy/evaluator-conditions.json`.
- `node_modules/eval-quality/dist/core/score/witness.js:162` -- the witness match counts only `evaluator-chosen` observations.
- `node_modules/eval-quality/dist/core/score/score.js:180-212` -- a trial set's records must agree on `runId`, `mode`, `evaluatorRecommendation` and the evaluator configuration digest.

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/evaluate/run.js`, `cli/lib/evaluate/score.js`, `cli/evaluate.js` -- the two subcommands.
- [x] `cli/lib/evaluate/preflight.js`, `arm.js`, `evaluator.js`, `records.js`, `engine-cli.js`, `workspace.js` -- the shared pipeline, trial judgment and AD-7 digests.
- [x] `cli/lib/evaluate/check.js`, `cli/lib/evaluate/schemas/` -- the new rules and the evaluator-conditions and trial-sets schemas.
- [x] `src/workflows/testarch/bmad-testarch-evaluate/assets/` -- the scoring-policy and evaluator-conditions templates and the evaluation-folder `.gitignore` template.
- [x] `test/test-evaluate-run.js`, `test/fixtures/evaluate/` -- the cases; `package.json`, `.github/workflows/quality.yaml`, `.gitignore`.
- [x] `docs/reference/tea-evaluate-cli.md`, `README.md`, CHANGELOG, sprint-status, planning amendments.

**Acceptance Criteria:** epics.md Story 1.8; each revert check in test-design-epic-1.md's Story 1.8 table is exercised once.

## Implementation Notes

- **Implemented directly.** The workflow's implementation subagent was not used: this build already runs as a subagent of the coordinator, and the design was settled during investigation.
- **eval-quality gap, found and fixed upstream.** `eval-quality score` 4.1.2 on the Invalid rung emits no evidence artifact and writes the ladder's `basis` nowhere, so a trial set with its isolation manifest omitted exits 3 with empty stdout and stderr (`node_modules/eval-quality/dist/cli/run.js:331-337` drops `result.ladder.basis`, built at `dist/core/score/ladder.js:419-441`, while the usage text at `dist/cli/run.js:115` says diagnostics go to stderr).
  The build stopped and reported it; the coordinator fixed it in eval-quality #162 (one `eval-quality: invalid: <reason>` stderr line per basis entry, shipping as 4.1.3).
  The omitted-manifest case asserts non-empty persisted stderr as the criterion says; it fails on 4.1.2 and passes once the pin is 4.1.3.
- **One invocation for the whole measurement.** `run` is the preflight pipeline carried past a passing verdict while the workspaces are live (`runPipeline` in `preflight.js`, with a `prepare` refusal step and an `afterVerdict` continuation), so the preflight verdict `score` reads, the qualified probes and the trial sets share one `runs/<invocationId>/` (AD-12's bundle). `preflight` changes where it shares the pipeline: `run.json` records the invocation's `outcome` and whether the evaluation folder holds uncommitted work (then `dirty: true`), a qualified probe's `implementationDigest` is the tracked tree, and a qualification arm step a signal from outside stops exits 12.
- **Clean controls.** eval-quality's `score` parses the full `Probe` schema, whose `clean-control` route needs baseline-pass evidence, so `run` qualifies every clean control on one clean arm in a workspace of its own (its behavior's oracles must hold, exit 11 otherwise) and materializes it; a clean control's `artifactDigest` is its `implementationDigest`, since it seeds nothing. Clean controls stay out of the CLI preflight's probe list, which Story 1.6 held to seeded probes.
- **Trials.** Each trial runs in a fresh workspace reproducing the pristine one, so no residue of one trial reaches the next (the stub's lenient runs leave `residue.txt`); a mutated trial re-applies the mutation and holds its digest to the qualification's.
  An arm runs `trials` times and every probe on it is judged from the same trial; one trial set per probe, since `score` scores one probe per call and a finding naming another probe is dangling.
- **Judgment.** `judgeTrial` disposes every contract oracle (eval-quality holds each one required) and files one `defect` finding per violated oracle for the probe under score, quoting the whole first stream, body or file channel the oracle reads on the cited observation (an exit code only when nothing else holds text), so eval-quality's witness match and quotation audit decide what it proves.
- **Provenance.** eval-quality's witness match counts only `evaluator-chosen` observations (`dist/core/score/witness.js:162`) and its tutorial records mark scripted exercises that way, so a scored trial's observations are `evaluator-chosen`; qualification arms stay `baseline`. AD-7, Story 1.8 and Story 1.17 carry dated amendments.
- **Set-level recommendation.** eval-quality holds `evaluatorRecommendation` equal across a trial set (`dist/core/score/score.js:180-212`), so the recommendation is computed over the set (FAIL on a violated oracle, CONCERNS on an unsettled one, PASS otherwise).
- **Isolation manifest.** It lists each trial's workspace and read-only provisioned directories as the mounts granted, the registry's commands as the tool allowlist and the commands the runtime ran for the plan as the observed tool calls, the tool-call and wall-clock ceilings the runtime enforces, and the schema's largest value for tokens and cost, which the runtime does not bound. Use is recorded as zero tokens and cost; a live target's spend is Story 1.29.
  After final review round 1, `observedMounts` is empty: the runtime observes no file-system access, and the published schema's only honest shape for "nothing observed" is an empty list (the network lists already took it), since the grants would claim an observation never made. Story 1.31 confines the target and fills it from the confinement's report.
- **The run directory (final review round 1).** A target can reach `runs/` through the worktree's shared git directory, so every write into `runs/<invocationId>/` goes through `cli/lib/evaluate/run-directory.js`: the directory is created afresh, each subdirectory exclusively and recorded by device and inode, each file created by bare name inside its confirmed directory with `O_EXCL | O_NOFOLLOW`, `run.json` replaced by a rename, engine stage outputs written to a private temp directory and copied in, and every read held to the digest taken at write time.
  `verify` walks the directory without following links before the preflight verdict, after the trials and after the last write, and any entry the runtime did not write, or any file whose bytes changed, exits 12. The contract and sealed-brief digests are taken right after `compile` and `seal`, before any target runs.
  A run is `completed: true` only after the index, `run.json`, a last tree read and a last verification; any other end records `completed: false` and removes the index. `run.json` anchors the compiled contract, every record and every isolation manifest, and `score` holds each to its digest, each set's `runId` to the one the invocation derives, and every reference to this run directory.
- **Evaluator conditions.** AD-7 names `policy/evaluator-conditions.json` as the committed fixed-condition input, and the Build Rules require a live target's model in `modelSnapshot`, so `run` reads it (runtime-owned schema, `check` holds it) and falls back to `none` and the empty-string digest when it is absent.
- **AD-7 digests.** A worktree's `implementationDigest` is now the SHA-256 of `git ls-tree -r -z <commit>:<skill or target root>` without the evaluation folder's entries (`trackedTreeDigest`), which the test recomputes with git; Story 1.7's digest walked the checked-out files, which the test could not recompute from git, and it left the evaluation folder in when a copy of the tree held it. A copy keeps its tree digest.
- **`score`.** It validates every persisted input against eval-quality's published schemas before any call (exit 10), passes an absent manifest on as absent, runs one call per probe with `--out`, keeps each call's argv, exit and streams in `scores/<scoreInvocationId>/<probeId>/score.json`, and exits with the most severe call's own exit (64, 5, 4, 3, 2, 0).
- **Check rules.** `trials` (below `minimumTrialCount`) and `arms` (a probe whose arm is not declared) keep `run` from sealing short sets or skipping a probe; the mutation fixture's `trials` rose from 1 to 3.
- **Gaps closed on the way.** `cli/evaluate.js`'s `EXIT_CODES` lacked 11, which the runtime already exited with; it is declared now, and `test:doc-claim-sources` lists it. The epics overview still said thirty-one stories after 1.27 and 1.28 were appended; it now says thirty-four.

### Revert checks exercised

Each change was undone once in a scratch copy of the final tree (node_modules linked), the named suite run, the failure observed, and the copy restored; every one fails.

- `runId` shared by the two sets: "the trial sets' runIds [...] are not one each" (test-design: a reused `runId` fails the uniqueness check).
- A hard-coded request: "the target received something other than the plan's bound literal: request: Judge something else." and the call-input check, 16 failures.
- The evaluator swapped for one that files nothing: "a rejected verdict's findings are []" and every quotation unit, 11 failures.
- A stale `sealedBriefDigest`: "the evaluator configuration carries a sealedBriefDigest other than the persisted sealed brief" and every record's; dropping `score`'s sealed-brief anchor: "score over a record with another sealed brief exited 4; expected 10".
- `modelSnapshot` left empty: the configuration fails its published schema, so `run` exits 12 ("run exited 12; expected 0").
- The infrastructure-code guard removed: "a run whose second clean trial exits an infrastructure code exited 0; expected 12" and records written; the outside-stop guard removed: "a step SIGKILL stopped was not refused" and the killed qualification exits 11; every signal read as infrastructure: "stoppedFromOutside does not tell a stop from outside from a crash" and the SIGABRT unit throws.
- The exit computed in the runtime (`score` returning 0): the shimmed 4, the FAIL's 2 and the Invalid's 3 each read 0.
- Validation before the CLI removed: "score over a record off its schema exited 4; expected 10" and the shim logged a call.
- stdout and stderr swapped in the persisted record: "P-001's persisted stdout is \"known-bytes stderr P-001.probe.json\"".
- The tracked tree taken over the whole commit: the subdirectory project's digest differs from `packages/app`'s tree, and a commit beside it moves it.
- The `runs/` entry removed from the template: "the evaluation-folder .gitignore template does not ignore runs/"; the root entry removed: both fixture paths reported.
- Provenance back to `baseline`: every trial observation reported, and eval-quality then scores P-002 `not-applicable` (11 failures).
- A default manifest filled in for the omitted one: "score filled in an isolation manifest the trial set does not have", and eval-quality's reason becomes a `runId` disagreement instead of the absent manifest.
- A value in the policy template: "the scoring-policy template carries severityFloor \"material\"".
- Findings filed for every violated oracle: the two-behavior run turns P-002 Invalid and the units fail (7 failures).
- A per-trial recommendation: "P-002's records recommend [\"FAIL\",\"PASS\",\"FAIL\"]" and eval-quality refuses the set (exit 3, trial-set field disagreement).
- The tree read only after all trials: "a run whose trial wrote into the project exited 0; expected 12".
- The evaluation folder never dirty: "a run reading an uncommitted evaluation folder records dirty false".
- `score`'s reference check dropped: "score over a record whose actions reference is private exited 4; expected 10"; its probe-set anchor dropped: "score over an index that drops a probe the run sealed exited 4; expected 10".
- `check`'s `trials`, `mutation-route`, `evaluator-conditions` and unused-arm rules removed: each named check case reports no finding for its rule.
- The Invalid-stderr criterion itself was observed failing on eval-quality 4.1.2 ("the persisted P-002 score stderr is empty") before the pin moved to 4.1.3.

## Spec Change Log

- 2026-09-24: ARCHITECTURE-SPINE.md AD-7's provenance bullet amended: a scored trial's observations under the deterministic evaluator (and a `command` evaluator) carry `evaluator-chosen`.
- 2026-09-24: epics.md Story 1.8, the evaluator criterion, amended for provenance and the set-level recommendation; the `.gitignore` criterion amended to `test/fixtures/evaluate*/**/runs/`, since the runtime's fixtures nest their evaluation folders.
- 2026-09-24: epics.md Story 1.17, the `command` evaluator criterion, amended: its judged observations are `evaluator-chosen` and its recommendation is taken over the whole set.
- 2026-09-24: test-design-epic-1.md Story 1.8 rows amended: the pre-CLI validation case corrupts a persisted record and asserts no shim call; the ignore case names the nested fixture path.
- 2026-09-24: Story 1.29 (record what a live run spends) appended to Epic 1, with its test-design section, dependency row and sprint-status row.
- 2026-09-24, final review round 1: epics.md Story 1.8's request clause amended: `testData` lives on the contract, this release sends literal bindings, and any other binding stops the run with exit 12 (C1); test-design Story 1.8's request row corrected to match.
- 2026-09-24, final review round 1: Story 1.30 (send `principal` and `matcher` bindings) and Story 1.31 (sandbox the target's file system) appended to Epic 1, each with acceptance criteria and revert checks, a test-design section, a dependency row and a `backlog` sprint-status row; the overview counts thirty-six stories.
- 2026-09-24, final review round 1: ARCHITECTURE-SPINE.md AD-10's exit table gains `score`'s 64 and 12 and exit 12 for a run directory the runtime did not write alone (C3); AD-7's isolation-manifest bullet amended for the observed lists and the run directory, and its provenance amendment notes that eval-quality 4.1.4's schema states the role reading.
- 2026-09-24, final review round 1: test-design Story 1.8 gains rows for the run directory and for `score`'s anchors.
- 2026-09-24, final review round 1: the eval-quality pin and peer floor moved to 4.1.4 at the coordinator's direction (package.json, the lockfile, guard-publish and release-metadata floors, the roadmap claim, the CLI reference, the engine's install hint, eval-quality-facts.md, AD-7, epics.md and CHANGELOG).
- 2026-09-24, final review round 2: epics.md Story 1.31 gains the case clause and revert check on its platform-refusal criterion (X7) and a criterion confining processes the target leaves running, with its case and revert check (A1); its test-design section gains a row for each.
- 2026-09-24, final review round 2: ARCHITECTURE-SPINE.md AD-7's run-directory amendment reworded to what the code holds (the write confirmation before and after, `completed` written last, and the anchors holding only while nothing else can write the run directory until Story 1.31); AD-10's exit 12 row names a directory the target replaced or moved (X6, A1, A2, A3).
- 2026-09-24, final review round 2: test-design Story 1.8's run-directory and anchor rows cover the round 2 cases, and a row for `score`'s regular-file reads is added.

## Review Triage Log

### Builder Analyze (skill gate)

`/bmad-workflow-builder` Analyze ran headless on `src/workflows/testarch/bmad-testarch-evaluate/` (the pre-pass scripts and five lenses): zero critical and zero high findings, eight medium and five low.
The pre-pass's "missing ## Overview section" (high) is skipped: no testarch skill carries one (all ten use Goal and Role) and no repository test requires it.

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| architecture-2 | medium | `assets/README.md` placed the threshold choice "at intake" while Story 1.14 gives it to the harness stage | fixed: the README names no stage |
| architecture-5 | low | "every value in a filled copy is the adopter's own" while the template prefills `confidenceThreshold` and the caps | fixed: the README says those carry eval-quality's published defaults, which the adopter may change |
| architecture-3, enhancement-2 | medium | no stage is assigned to copy the templates into an evaluation folder | fixed in the plan: Story 1.14's harness criterion amended (dated) to write both policy files from the templates and install the `.gitignore` template, held by its guidance test; the stage guides are placeholders Story 1.14 fills |
| determinism-1 | medium | `systemPromptDigest` is typed by hand | fixed in the plan: the same amendment has the harness compute it with eval-quality's `digestBytes` over the prompt's bytes; the runtime reads it as the adopter's attested fixed condition |
| leanness-1, customization-1, architecture-1, enhancement-1, architecture-4, leanness-2, leanness-3, customization-2 | medium, low | pre-existing wording and resume behavior in `SKILL.md` and `customize.toml`, unchanged from main | skipped: the prompt content belongs to the stage stories (1.12 to 1.14) that write it through the builder, customization-1 and customization-2 are shared by every TEA skill, and Story 1.8 edits only `assets/` |

### Test review (`bmad-testarch-test-review`, opus)

Each finding was checked against the suite first; the reviewer proved each by a reverted copy.

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | the records' `sealedBriefDigest` was never asserted, and eval-quality does not cross-check it | fixed: every record's `sealedBriefDigest` and `contractDigest`, and every manifest's contract and configuration digests, are held to the persisted brief, the compiled contract and the configuration |
| F2 | medium | the set-level recommendation was unit-tested only, and every arm's trials agreed | fixed: the stub's `VERDICT_WHEN`/`VERDICT_DO` accepts in `trial-mutated-M-001-2` only; all three P-002 records carry FAIL, P-001's PASS, and the engine scores the set (votes caught, confirmed, caught) |
| F3 | medium | "most severe" could not be told from "last probe" | fixed: the shim takes a per-probe exit; P-001 exits 4 and P-002 2, and the command exits 4 |
| F4 | medium | pre-CLI validation was tested for records only | fixed: a tamper case per kind (record, manifest, configuration, probe, policy, compiled contract, preflight verdict), each exit 10 naming the file with no shim call |
| F5 | medium | the `trackedTreeDigest` branch for a root below the repository's top never ran | fixed: a project under `packages/app/` preflights; its digest is that directory's tracked tree, unmoved by a commit beside it and moved by one inside it |
| F6 | medium | untested failure paths | fixed: a trial writing into the project (12), a clean control's failing baseline (11), a `trial-sets.json` path out of the run directory (10), no policy and no probe (10), a gameability probe (12), no run to score (64), an index of another version (10); skipped: a mutated trial whose digest differs from the qualification's, which no stub can reach since every workspace reproduces the pristine one and the mutation is deterministic, and which the same guard in `mutatedRoute` already holds |
| F7 | medium | a missing file crashed the suite and dropped the collected failures | fixed: `written` records a missing file as a failed check, and `runCase` turns an exception into one |
| F8 | low | the shim case ran on state the previous case had changed | fixed: the shim and tamper cases run before the FAIL and Invalid cases, and assert the `--isolation-manifest` and `--evaluator-configuration` paths |
| F9 | low | assertions against constants or the authored contract | fixed: digests compared with the compiled contract, the constant comparison dropped, both model fields asserted |
| F10 | low | a developer's global excludes file could mask the ignore checks; two spawns had no timeout | fixed: `core.excludesFile=/dev/null`, and a timeout on each |
| F11 | low | the stub's header paragraph split the policy list, and the workspace match was a substring | fixed: the paragraph follows the list, and the match is the workspace directory's exact label |
| F12 | low | `judgeTrial`'s quotation fallbacks and shared-oracle severity were untested | fixed: an empty stdout and an exit-code oracle quote the exit code, and an oracle two behaviors declare is filed under the first at the higher severity |

### Code review (`bmad-code-review`, opus, four layers) and adversarial review (`bmad-review`, opus, by execution)

Both read the working tree after the test review; each finding was checked against the code, and the reviewers' executed repros were rerun where the fix needed one.
C is the code review, A the adversarial review.

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| C-H1, A2 | high | every violated contract oracle became a finding against whichever probe was scored, so a defect in another behavior read as the clean control's false positive or the seeded probe's unwitnessed claim (Invalid) | fixed: findings only for oracles of the behaviors the probe discharges (its own and its defects'), at that behavior's severity; every oracle keeps its disposition, and eval-quality records the unmatched one's corroboration `disagrees`; clean controls qualify on the same scope; test: B-002/O-002, violated on every run, leaves P-001 `passed-clean-control` and P-002 `caught`, with O-002 `disagrees` |
| C-H2 | high | a `controlled-mutation` probe with no defect was dropped silently, and a run with nothing to score passed green | fixed: `check`'s `mutation-route` rule, `run` stops with 12 when a committed probe has no trial set, and `score` refuses an index with no set (schema); tests for each |
| A1 | high | a target a signal ended was judged as a product verdict | fixed: `runArm` treats a negative or missing exit code as a target that could not run (12, no record); test: the stub ends by SIGKILL in P-002's qualification arm |
| A3, A4, C-M2 | high, medium | `trial-sets.json` was trusted: a `probeId` could climb out of the score directory, a set could name another probe's file, and a crafted `probeId` could forge an output line | fixed: a runtime-owned `trial-sets.schema.json` (at least one set, probe IDs on eval-quality's pattern, every path inside the run directory), each set's probe file must name its probe, and printed probe IDs are escaped; tests: a climbing `probeId`, another probe's file, an empty index, a truncated file |
| A5 | medium | the run directory's copies were not held to the run | fixed: before any call `score` holds each record's `runId` and arm to its set, its actions and manifest references to their files' digests, the record count and corpus digest to `run.json`, and the copied policy to the digest `run.json` recorded; tests for each |
| A6 | medium | a run read uncommitted evaluation-folder edits while recording `dirty: false` | fixed: uncommitted work under the evaluation folder records `dirty: true` and `evaluationFolder.dirty: true`, and the log says the run reads it; the policy, conditions and corpus index are read once before anything runs; test: an untracked note in the folder |
| A7 | medium | an oracle over several steps quoted the first cited step, which could be the passing one | fixed: the quotation looks across every cited observation, stream, body and file channels before exit codes; unit test over two steps |
| A8, C-L1 | medium, low | `score` over a stopped run exited 12 (infrastructure), `run.json` recorded no stop, and `--run` naming a preflight said "did not complete" | fixed: `run.json` records every invocation's `outcome` and a `run`'s `completed`; a run that did not complete, a `--run` naming a preflight, and no run all exit 64, naming where the run stopped; the default stays the most recent run, never falling back to an older one silently; tests for each |
| A9 | low | one undocumented engine exit dropped every result collected | fixed: each call is caught, recorded, the rest still run, the aggregate is written in `finally`, and the command exits 12 |
| A10, C-L2 | low | a tree change during trials said "no qualified probe is written" and was read only after every trial | fixed: the tree is read after every trial, and the message says no trial set is written; test: the run stops after the first trial |
| A11 | low | a finding's behavior and severity could come from different behaviors | fixed by C-H1: the probe's own behavior and its severity; unit test |
| A12 | low | a declared arm no probe used ran nothing, silently | fixed: `check`'s `arms` rule refuses a declared arm with no probe on it (any seeded probe uses `mutated`, a clean control `clean`); test |
| A13 | low | the set recommendation stamps FAIL on a trial whose own oracles held | skipped in code, documented: eval-quality holds the recommendation equal across a set and reads it into no contract-scoring verdict; the recommendation is now the probe's own (FAIL only on a finding against it), and the CLI reference says what a trial's FAIL means |
| C-M1 | medium | a model-using run could be sealed as `modelSnapshot: none` | fixed: `check`'s `evaluator-conditions` rule requires `policy/evaluator-conditions.json` once a registry entry runs `tea-skill-runner`; the preflight fixture declares its stub's `none`; test |
| C-M3 | medium | the Invalid diagnostics need an unshipped engine | fixed: eval-quality 4.1.3 shipped (#162); the devDependency pin and the peer floor are 4.1.3 everywhere they are named |
| C-M4 | medium | `how-tea-is-tested.md` still said running and scoring arrive later | fixed |
| C-M5 | medium | untested paths: a failing preflight verdict under `run`, the default run among several, a clean-only run | fixed: a shimmed preflight exit 3 stops `run` with 3 and no trial; two runs, and bare `score` scores the newest; a clean-controls-only run |
| C-M6 | medium | no evidence of builder Analyze or revert checks | fixed: Analyze is recorded above; revert checks below |
| C-M7 | medium | provenance relabelling, decision needed | kept, with the reasoning in the Implementation Notes and AD-7's amendment: eval-quality's own tutorial records (its repository's `examples/tutorials/tool-use/sealed-run-record.json` and `baseline-steps.json`) mark a scripted exercise `evaluator-chosen`, the only provenance its witness match counts; its schema's "deterministic test" wording for `baseline` sits against that, which the final report raises with the coordinator for eval-quality to settle |
| C-M8 | medium | two AD-7 digest decisions unamended | fixed: AD-7 and Story 1.8 amended (dated) for the evaluation folder left out of the tracked tree and a clean control's `artifactDigest` |
| C-L3 | low | "the largest value the schema admits" was false for cost | fixed: the code, CLI reference and Story 1.29 say the largest safe integer |
| C-L4 | low | the policy was copied and the corpus digested after the trials | fixed with A6: both are read before anything runs |
| C-L5 | low | the vendor/ implementation-digest check no longer tested provisioned exclusion, since the tracked tree never holds `vendor/` | fixed: the check is reworded, and two copy-workspace projects prove a copy's digest leaves `vendor/` out |
| C-L6 | low | the exit tables lacked several `run` exits | fixed in `cli/evaluate.js` and the CLI reference |
| C-L7 | low | pre-existing: a stage failure printed its stderr as one line with literal `\n` | fixed: the first line is the outcome on stdout, and each further line goes to stderr, escaped |
| C-deferred | low | `networkAllowlist: []` claims no network was granted while the runtime does not sandbox it | skipped: with nothing observed the schema's only honest shape is two empty lists, and `records.js` states that the manifest claims nothing it cannot observe |
| C-deferred | low | an unsupported route exits 12 | skipped: Story 1.7's precedent, pinned by its tests |

### Second review round (opus, by execution, after the fixes above)

No high findings; each was checked against the code first.

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| R2-M1 | medium | the run-integrity checks left the records' sealed-brief digest, private references, a probe dropped from the index, the probe files, the preflight verdict and the evaluator configuration unanchored, and duplicate record paths reached the engine | fixed: `run.json` records `artifacts` (the digests of the preflight verdict, the evaluator configuration and each probe file, keyed by probe), and `score` holds the index to the sealed probe set, each file to its digest, every record's contract, sealed brief and configuration digests to `run.json`, refuses a non-public reference and a record named twice; a tamper case for each |
| R2-M2 | medium | treating every signal-ended step as infrastructure meant a mutation that crashes the target could never qualify, while eval-quality keeps the signed code on purpose | fixed: only a stop from outside (hang-up, interrupt, quit, kill, terminate) or no code at all is infrastructure (`stoppedFromOutside`); a crash by the target's own signal is an observation its oracles judge; units for both over `runArm` |
| R2-L1 | low | a staged rename out of the evaluation folder went undetected | fixed: the rename-aware walk `adopterTreeState` uses; unit case |
| R2-L2 | low | the conditions rule accepted `modelSnapshot: none` for a skill runner | fixed: refused; the preflight fixture names `stub-agent-fixture`; check case |
| R2-L3 | low | the index path pattern admitted a trailing slash | fixed |
| R2-L4 | low | the Invalid reasons never reached the terminal | fixed: each `eval-quality: invalid:` line is printed with its probe; the omitted-manifest case asserts it |

### Final review round 1 (four review lenses, CI, CodeRabbit; after the PR was pushed)

Every finding was reproduced by a reviewer and verified again against c882bfa before the fix.
F1 and F2 share one root cause: the target can reach `runs/<invocationId>/` through the worktree's shared git directory, and the runtime wrote and re-read run-directory files after the last tree check.

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | critical | a planted `trial-sets/P-001/record-1.json` link carried the sealed record into `rules/policy.txt`, and `run` and `score` exited 0 | fixed: `run-directory.js` writes every run-directory file exclusively without following links inside directories it made and confirmed by device and inode, replaces `run.json` by a rename, copies engine outputs in from a private temp directory, and verifies the exact entries before the verdict, after the trials and after the last write; `runs/` and `runs/.gitignore` must not be links; tests: the `plant` stub case (exit 12, `git status` empty, policy bytes unchanged), and the linked `runs/` and `.gitignore` cases |
| F2 | high | the sealed brief, compiled contract, verdict and trial evidence were digested after the targets ran, so a rewritten contract was scored | fixed: contract and sealed-brief digests taken right after `compile` and `seal`, every read held to the digest taken at write time, and the run directory verified before any trial set is written; test: the `forge` stub case (exit 12 naming `eval-contract.json`, no trial set) |
| F3 | medium | `FORBIDDEN_INPUT_NOTE` claimed the inputs were never in reach, and `observedMounts` copied the grants | fixed: the note states what the runtime withholds and that it does not sandbox the target's file system; `observedMounts` is empty, decided from the published schema: its observed lists feed `outsideAllowlist`, the runtime observes no file access, and an empty list is the one honest "nothing observed" (the network lists already take it), where the grants would claim an observation; `observedToolCalls` stays the commands the runtime ran, which it observes; Story 1.31 appended to own the sandbox; test: the manifest claims no observed mount |
| F4 | low | `run.json` said `completed: true` before `trial-sets.json` existed | fixed: the index is written first, `completed: true` only after a last tree read and verification, and any unsealed end records `completed: false` and removes the index; test: the `wrap-run-directory.cjs` case fails the last verification and asserts exit 12, `completed: false`, no index and `score` 64 |
| C1 | medium | the literal-only binding restriction had no amendment and no owner for `principal` and `matcher` | fixed in the plan: Story 1.8's clause amended (dated), test-design's request row corrected, Story 1.30 appended with criteria, revert checks, test-design section, dependency row and `backlog` row |
| C2 | low | the CHANGELOG pin entry ended naming 4.1.2 | fixed: it names 4.1.4, the pin the coordinator moved this round to |
| C3 | low | AD-10 lacked `score`'s 64 and 12 | fixed: AD-10 amended (dated), with exit 12 for a run directory the runtime did not write alone |
| E1 | medium | a set copied from another run passed with its runId in the index | fixed: `score` requires `set.runId` to be `<invocationId>-<probeId>`, every reference inside this run directory, and the manifest reference to name the set's own manifest; tests: the cross-run copy in the clean-only case (each reason asserted) and an out-of-run actions reference |
| E2 | medium | records and manifests were not anchored in `run.json` | fixed: `artifacts.records`, `artifacts.isolationManifests` and `artifacts.contract` recorded and checked, a file with no recorded digest a finding; tests: a record rewritten to a pass, a manifest rewritten with its records' references, a compiled contract edited after the run; checking record observations against the cited trial evidence is skipped, since the anchored record digest already refuses any change to them |
| E3 | low | the CLI reference sentence read as if a crash yields no record; the test header said 12 | fixed: the sentence split as proposed, the header says 64 |
| E4 | low | a signal left `run.json` with no outcome, and `score` said "stopped" for a live run | fixed: the signal handler records `outcome` (stage `signal`, the signal's name) and `completed: false` and retracts the index and probe list; `score` requires `completed: true` and says "still running or was stopped"; bare `score` choosing the newest completed run is skipped: A8 decided the default stays the most recent run and never falls back silently; tests: the interrupted preflight cases assert the recorded signal, and a run.json with no end exits 64 |
| CI1 | flake | the forwarded-`SIGQUIT` case read `SIGKILL` on CI | fixed at the cause, below; tests: the forwarded case accepts both endings for `SIGQUIT` only, each naming `SIGQUIT`, and a stub agent that outlives a forwarded `SIGQUIT` (`STUB-OUTLIVE`) proves the report; loop proof below |
| CR1 | review thread | anchor each record in `run.json` and check it in `score` | fixed with E2; the coordinator replies and resolves the thread |
| T1 | medium | a zeroed `--corpus-digest` survived | fixed: each evidence artifact's `scoringVersionInputs.corpusDigest` equals the run's |
| T2 | medium | allowlist-as-observation and zero tool calls survived | fixed: the happy project registers a second command the plan never calls; the manifest grants two and observed one, with `actualResourceUse.toolCalls` equal to plan steps times trials |
| T3 | low | `durationMs: 1` and a constant trial count survived | fixed: `durationMs` at least the trials' summed `elapsedMs`, and the clean-only case runs `trials: 4` |
| T4 | low | keeping one line per captured stream survived | fixed: the shim prints three lines per stream, the last without a newline, compared in full |
| T5 | low | two `SEVERITY` reorderings survived | fixed: `combinedExit([4,5])` and `combinedExit([3,4])` asserted |
| T6 | low | a test-built configuration validated against the vendor schema | fixed: the loop is deleted; the generated configuration's own validation keeps the criterion |
| T7 | low | `observedMounts === allowedMounts` held by construction | fixed with F3: the manifest is asserted to claim no observed mount |
| cosmetic | low | the test header said the shim case checks the configuration | fixed: the header names what the shim case asserts |

**CI1 root cause.** The only `SIGKILL` source in that case is the group leader's grace timer, 2 s after it signals the group, so the agent was still alive 2 s after the forwarded `SIGQUIT`.
`SIGQUIT`'s default action writes a core file; on a Linux CI runner the kernel hands cores to a collector through a pipe whatever the core size limit, the dump of a Node process can outlast 2 s under load, and a `SIGKILL` that lands mid-dump becomes the recorded exit signal.
`SIGINT`, `SIGTERM` and `SIGHUP` end the agent at once, and macOS keeps no cores by default, which is why it passed locally.
The leader's report now carries `stoppedBy`, the signal that asked the group to stop, and the runner reports "killed by signal SIGKILL once it outlived the grace period after a SIGQUIT to its process group".
Proof: a copy of c882bfa's supervisor with a stub that outlives `SIGQUIT` (standing in for a slow dump) printed CI's exact line ("was killed by signal SIGKILL.") in 3 of 3 runs; the fixed code passed 30 of 30 real forwarded-`SIGQUIT` runs and 10 of 10 outliving runs with every core loaded by `yes`.

**Added after review, and why.** eval-quality moved to 4.1.4 (pin and floor) at the coordinator's direction, since 4.1.4's schema states the provenance role reading AD-7 relies on; `test:guard-publish` gains a 4.1.3-floor refusal.

### Revert checks, final review round 1

Each guard was undone in a scratch copy (node_modules linked), the named suite run, and the copy restored; every one fails.

- Writes following links (`'w'`, recursive mkdir, no identity check, verification off): "the adopter's tree changed under a planted link: M rules/policy.txt", the reviewer's F1 reproduction.
- The verification after the trials removed: the planted run exits 12 without naming the entry, and the forged run writes trial sets.
- The read-back digest check and verification removed: "a run whose target rewrote the compiled contract exited 0; expected 12".
- The index retraction removed: "a run whose last verification failed kept trial-sets.json"; the last verification removed: that run exits 0, records `completed: true`, and `score` exits 0.
- The runId derivation removed: the cross-run case no longer names the derived runId; the run-directory reference check removed: the out-of-run reference and cross-run cases lose their reason.
- The record anchor removed: "score over a record rewritten to a pass exited 4" and the engine was called; the manifest anchor removed: the rewritten manifest is not named; the contract anchor removed: "score over a compiled contract edited after the run exited 4".
- `completed` not required: "score over a run whose run.json records no end exited 4; expected 64".
- `observedMounts` back to the grants, `observedToolCalls` to the allowlist, `toolCalls: 0`, a zeroed corpus digest, `durationMs: 1`, `trialCount: 3`, first-line capture, and each `SEVERITY` reordering: each named check fails.
- `runs/` checked with `stat`: "a run whose runs/ is a link exited 12 and wrote [".gitignore"]".
- The signal handler's `run.json` write removed: "the preflight interrupted by SIGTERM recorded undefined".
- `stoppedBy` dropped from the report: "a runner whose agent outlived a forwarded SIGQUIT exited 4; expected the grace SIGKILL reported with the SIGQUIT".

### Final review round 2 (fixcheck and attacks lenses, executed on 219c6a6 with eval-quality 4.1.4)

Each finding was reproduced by a reviewer and verified again against 219c6a6 before the fix; the coordinator's decisions for A1 and X6 are applied as written.
X6 and A3 share one root cause: `inDirectory` confirmed a directory by device and inode after entering it by path, so a directory moved elsewhere with a link left in its place passed.

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| X1 | medium | the forwarded-`SIGQUIT` case accepted the grace `SIGKILL` line, which a leader that never signals the group also prints | fixed: the stub agent's `STUB-WITNESS` starts a process in the agent's group that records each stopping signal it receives, its pid file appearing only once its handlers are in place; the loop accepts the `SIGKILL` ending for `SIGQUIT` only when the witness recorded the `SIGQUIT` (it had the whole grace period to), and the outliving case asserts the witness recorded it; guarding test: `test:evaluate-preflight` |
| X2 | medium | the device and inode check was untested | fixed: the `link-trials` stub case swaps `trials/clean` for a link to `rules/` during `trial-clean-2` (exit 12 naming the directory, `rules/` unchanged, `git status` empty), and the `recreate-trials` case replaces it with a directory of the target's own, which only the device and inode check refuses before the write (nothing written into it); `trial-clean-2`, since `trials/clean` does not exist until trial 1's evidence is written |
| X3 | medium | the "no recorded digest" finding was untested | fixed: a record copied as `record-9.json`, rewritten to a pass and named in the index in its original's place exits 10 with "has no digest in run.json" and no engine call |
| X4 | low | the tree read before sealing was untested | fixed: `wrap-run-directory.cjs` now takes `TEA_EVALUATE_VERIFY_AT` and `TEA_EVALUATE_VERIFY_DO`; the `touch` act appends to the tracked `rules/policy.txt` at the after-the-trials verification, and the run exits 12 ("changed during the sealing"), records `completed: false`, keeps no index, and `score` exits 64 |
| X5 | low | the manifest reference's path comparison was untested | fixed with the test (preferred over dropping the claim): P-001's record naming P-002's manifest, its digest intact, exits 10 with "is not its set's" |
| X6 | low | the CLI reference, CHANGELOG and AD-7 amendment claimed no write lands outside the run directory, which a moved directory defeated | fixed at the cause with A3, then reworded to claim exactly what the code holds: a directory replaced, swapped for a link or moved behind a link stops the command before the runtime writes through it, and a file written while its directory was being moved is removed again, a failed removal named; "only the runtime writes" is gone from the reference, the module header and AD-7; AD-10's exit 12 row names a directory the target replaced or moved |
| X7 | low | Story 1.31's platform-refusal criterion named no case | fixed: the criterion gains "and a case asserts the refusal and the recorded opt-out" with its revert check, and the test-design row names both cases |
| A1 | medium | a process the target leaves running rewrote P-002's records and `run.json`'s anchors after `run` exited; `score` exited 2 | reworded as the coordinator decided, in the CLI reference and CHANGELOG: "`score` holds each file to the digest `run.json` recorded; a process that can write the run directory after the run, a target's leftover process included, can rewrite both, and Story 1.31 closes that"; the AD-7 amendment says the same; Story 1.31 gains a criterion (leftover processes confined until they end or the run ends, with a case whose leftover process rewrites a sealed record and its anchor after `run` exits and `score` refuses the run, and its revert check) and a test-design row; no engine change, since full containment needs the sandbox |
| A2 | medium | `completed: true` was written before the last tree read and verification, and a retraction that failed was swallowed | fixed: the tree read and verification run first and `completed: true` is the run's last write; `runPipeline` tries each retraction step on its own and appends every one it cannot take to the outcome message ("the run directory does not record this end, since the runtime could not ..."); guarding test: the `move-root` act moves the run directory away before the last verification, and the run exits 12 naming the end it could not record, no `run.json` says completed, and `score` exits 64 |
| A3 | low | a leftover process moved `trials/` into the project behind a link and trial 2's evidence landed there | fixed: `confirm` also requires the path the system reports for the working directory (Node caches `process.cwd()` until the next `chdir`, so it enters `.` again first) to be the recorded one, before and after each write; a write whose directory moved during the write is undone (`unlinkSync`, `rmdirSync` for a directory) before the refusal; guarding tests: the `move-trials` stub case (exit 12 naming where `trials/clean` now lies, the moved directory holding only trial 1's evidence) and a writer unit that moves the directory out from inside the write (refused, the file removed) |
| A4 | low | reads opened a FIFO without `O_NONBLOCK`, and `score` read with plain `readFileSync` | fixed: `READ` adds `O_NONBLOCK`; `score` reads every input through `regularFileBytes` (non-blocking, no link followed, `fstat` must say a regular file), a FIFO or link a finding; guarding tests: a writer unit reads a file swapped for a FIFO in a child process with a 20 s deadline, and `score` over a record swapped for a FIFO exits 10 naming it within 30 s, with no engine call |

### Revert checks, final review round 2

Each guard was undone in a scratch copy (node_modules linked), the named suite run, and the copy restored.

Every one fails.

- X1, `stop` back to `if (signal !== 'SIGQUIT') signalGroup(signal);`: both `SIGQUIT` cases fail, "its witness recorded []" and "the agent's group never received the forwarded SIGQUIT".
- X2, the device and inode check off: the `link-trials` and `recreate-trials` cases fail, "a run wrote trial evidence into a trials/clean the target made"; with the reported-path check also off, "a run wrote through a link into the project's rules/" and `git status` shows `?? rules/trial-2.json`.
- X3, the unrecorded-digest finding dropped: "score over a record the run never sealed exited 4", and the engine was called.
- X4, the tree read before sealing removed: the run exits 0, records `completed: true`, keeps the index, and `score` exits 0.
- X5, the set's-own-manifest comparison removed: the case loses its reason.
- A3, the reported-path check off: the `move-trials` case finds `clean/trial-2.json` in the moved directory, the writer unit's write is not refused, and the moved-root case loses its named end; the check after the write off alone: the writer unit leaves the file where the directory went.
- A2, `completed: true` written before the last tree read and verification: the moved run's `run.json` says completed and `score` exits 0; the failed retraction swallowed again: the exit message no longer names the end the runtime could not record.
- A4, `O_NONBLOCK` dropped from `READ`: the FIFO read unit times out (ETIMEDOUT); `score` reading with a blocking open: `score` over the FIFO record never returns within its 30 s deadline.

## Verification

**Commands:**

- the Build Rules engine check -- exit 0 at the start (eval-quality 4.1.2) and at the end (4.1.3); `git diff -- package.json package-lock.json` names no `file:` or `.tgz` spec outside the registry
- `npm test` -- exit 0 (82 checks; `test:evaluate-run` 286 checks in about 30 s, `test:evaluate-check` 408, `test:evaluate-mutation` 417, `test:evaluate-preflight` 222, `test:evaluate-boundaries` 296); the first full run stopped at `test:schema-versions` on a literal `schemaVersion` in `run.js`, now read from the runtime's schema
- `npm run test:release-metadata`, `npm run docs:validate-links`, `npm run docs:build` -- exit 0
- `/bmad-workflow-builder` Analyze on the skill -- zero critical and zero high findings (Review Triage Log)
- `npm run eval:preflight` -- run once live through the local Claude Code CLI: 35 legs run and 155 answered from the cache, 6038 s in the model, exit 2 with the six test-design moves Story 1.7 recorded and Story 1.27 owns (P-008 to P-010 now pass where the baseline records `seeded-fault-fired`; P-012 to P-014 fail `seeded-faults-scoped`); every other suite reduces to `test/probes/expected-strength.json`, the NFR and CI suites and `fragment-selection/bmad-testarch-ci` included

**Final review round 1:**

- the Build Rules engine check -- exit 0 on eval-quality 4.1.4; `git diff -- package.json package-lock.json` names no `file:` or `.tgz` spec outside the registry
- `npm test` -- exit 0 (`test:evaluate-run` 331 checks, `test:evaluate-preflight` 225, `test:evaluate-mutation` 417, `test:evaluate-check` 408, `test:evaluate-boundaries` 296); the first full run stopped at `test:evaluate-boundaries` on identifiers named after the `seal` stage and at `test:direction` on a writer method named `import`, both renamed
- `npm run test:release-metadata`, `npm run docs:validate-links`, `npm run docs:build`, `npm run lint`, `npm run lint:md`, `npm run format:check` -- exit 0
- the forwarded-`SIGQUIT` case looped 30 times with every core loaded, 30 of 30 passing

**Final review round 2:**

- `npm test` -- exit 0 (`test:evaluate-run` 359 checks, `test:evaluate-preflight` 230, `test:evaluate-mutation` 417, `test:evaluate-check` 408, `test:evaluate-boundaries` 296)
- `npm run lint`, `npm run format:check`, `npm run lint:md`, `npm run docs:validate-links`, `npm run docs:build` -- exit 0
- eval-quality stays at 4.1.4, the pin and floor; package.json and the lockfile are unchanged
