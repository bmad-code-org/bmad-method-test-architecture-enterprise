---
title: "Observe the sealed-brief agent evaluator's installed adapter version"
type: 'bugfix'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 3
baseline_commit: '39076311dce7ed3cb1a12f6d33d3591abfc23b2d'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.71.md'
---

<frozen-after-approval reason="owner delegated Story 1.72 build and merge through the Evaluate relay">

## Intent

**Problem:** A sealed-brief evaluator's installed agent CLI can change while its tracked wiring and scoring configuration stay fixed. A run can then judge under an unrecorded adapter version.

**Approach:** Observe the installed adapter version before evaluator calibration and qualification, bind it into the evaluator configuration and run record, and hold it around every agent launch. Fail before an unobserved or changed agent can contribute a vote or sealed trial.

## Boundaries & Constraints

**Always:** Keep vendor version flags and output parsing in `agent-adapters.js`; use the configured executable and a bounded probe independent of `evaluator.timeoutMs`. Recheck before every sealed-brief agent launch, including calibration and qualification, and after each trial before a record is sealed. Keep `score` and replay on recorded evidence only. Make each acceptance criterion fail on an isolated revert.

**Never:** Run a live Claude session, copy scoring logic into TeA, add a tracked version declaration, or probe the CLI during score or replay.

## I/O & Edge-Case Matrix

| Scenario           | Input / State                                                     | Expected Output / Behavior                             | Error Handling |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------ | -------------- |
| Stable agent       | Stub reports one version                                          | Configuration and `run.json` record it; score succeeds | None           |
| Upgrade            | Only stub version changes between runs                            | Configuration digest and scoring version change        | None           |
| Unreadable version | Missing CLI, nonzero exit, no parseable version, or probe timeout | Stop before qualification, no vote or sealed trial     | Exit 12        |
| Mid-run change     | Stub version changes before a launch or after a trial             | Stop before the changed attempt votes or trial seals   | Exit 12        |
| Replay             | Recorded run scored after stub removal                            | Same evidence bytes; no agent launch                   | None           |

</frozen-after-approval>

## Code Map

- `cli/lib/agent-adapters.js`: agent table, command resolution and vendor argv; owns bounded version probes and parsers.
- `cli/lib/run-agent.js::runSupervised`: existing guardian-led process launcher and minimal environment builder; reuse for version reads.
- `cli/lib/evaluate/evaluators.js::configurationFields`: caller-owned decoding parameters; require an observed version for sealed-brief.
- `cli/lib/evaluate/run.js::runTrialSets`, `concludeWithRows`, `qualifyEvaluator`: initial observation, calibration and trial holds, qualification path, and `run.json` evaluator record.
- `cli/lib/evaluate/sealed-brief-agent.js::runSealedBriefAgent`: existing bridged agent launch; keep vendor version knowledge out.
- `test/test-evaluate-evaluators.js`, `test/fixtures/evaluate/evaluators/stub-evaluator-agent.js`: end-to-end stub, config/digest/scoring, failure and timing cases.
- `test/fixtures/evaluate/evaluators/stub-mcp-agent.js`, `stub-api-agent.js`: existing sealed-brief integration stubs expose their stable installed versions.
- `src/workflows/testarch/bmad-testarch-evaluate/references/evaluator.md`, `test/test-evaluate-guidance.js`: sealed-brief guide and exact teaching assertion.

## Tasks & Acceptance

**Execution:**

- [x] Add a failing end-to-end test for two agent versions with identical wiring and a fixed model; prove the baseline digest collision before implementation.
- [x] Add adapter-owned bounded version observation and parsing, using the actual configured executable and agent environment.
- [x] Bind the observed version to `tea.evaluatorAgentVersion`, `run.json`, and all prelaunch and post-trial checks.
- [x] Cover missing, failed, malformed and timed-out probes, mid-run changes, score/replay without a CLI, and vendor-knowledge static boundaries.
- [x] Update the evaluator guide, changelog, sprint row and story outcome; run the builder-equivalent skill checks and repository gates.

**Acceptance Criteria:**

- Given a stable sealed-brief agent, when `run` completes, then configuration and `run.json` record its installed version, and changing only that observation changes the digest and scoring version.
- Given an unreadable version, when `run` prepares the evaluator, then it exits 12 before qualification and seals no trial.
- Given a version change before a launch or after a trial, when `run` rechecks, then it exits 12 without a vote for an affected attempt or a sealed affected record.
- Given a recorded run, when the agent CLI is removed, then `score` and replay produce the same evidence without launching it.
- Given the sealed-brief guide, when guidance tests run, then they require the adapter version, upgrade, fresh qualification and `LEARNED.md` teaching.

## Implementation Notes

- `agent-adapters.js` owns the CLI version argv and parser for the supported bridged adapters. Its observation uses the configured executable, the agent's minimal environment, a private scratch working directory, the existing supervisor and a 3,000 ms bound independent of `evaluator.timeoutMs`. The resource ceiling shares the supervisor's 5,000 ms cleanup bound and, on Windows, its 90,000 ms Job Object setup plus 15,000 ms startup slack.
- `run` observes the version before rubric calibration or evaluator qualification, binds it to `tea.evaluatorAgentVersion`, and records it as `run.json.evaluator.version`. It rechecks around calibration and row conversion, after each qualification attempt and after each trial. The trial ceiling includes the three bounded version reads and supervisor cleanup; sealed resource use includes post-attempt and post-trial reads. An unreadable or changed observation exits 12 before an affected vote or trial set is sealed.
- The stub reports a version through its custom adapter, can fail or hang on that read, and can move the reported version at specific read positions. The end-to-end case first reproduced the baseline digest collision: four of six assertions failed before the runtime binding. The focused cases then passed after implementation, including scoring the same recorded evidence bytes after removing the stub executable.
- An unrelated full-gate run aborted in macOS Node's native `fs.cpSync` while the baseline comparison test copied a temporary Git loose-object directory that vanished during traversal. `test/lib/evaluate-baseline.js::copyOf` now lets Git copy `.git` and overlays the working tree and ignored run evidence without traversing `.git`; the isolated comparison suite passed after this repair.
- The first complete gate reached the MCP suite after the new evaluator cases passed and exposed a missing `--version` response in the older MCP fixture agent. The HTTP API fixture used the same sealed-brief adapter pattern. Both fixture agents now return a stable version before reading their bridge config or stdin. Arms, CI and calibration use `evaluation.judge`, so their shared rubric-judge stub needs no sealed-brief version contract. The MCP and API suites passed after this repair; the complete gate was restarted.
- Codex-equivalent workflow-builder Edit and Analyze: read the installed builder's process and five lens specifications, appended the Story 1.72 direction and analysis event to the skill memlog, and ran quick validation, prompt metrics, workflow integrity, path standards and script scan. The edited `references/evaluator.md` has zero path findings; the path scan's inherited findings lie elsewhere. The five-lens delta report has zero critical, high, medium or low findings at `src/workflows/testarch/bmad-testarch-evaluate/.analysis/2026-10-02-story-1-72/skill-analysis-report.html`. No official builder invocation was available in this Codex runtime.
- Isolated acceptance reverts used an exported copy of HEAD with the implementation files overlaid and the repository's installed dependencies linked. Removing the version binding failed four upgrade assertions, including the configuration digest and scoring version. Removing the prelaunch read let the changed agent launch. Removing the post-attempt and post-trial reads failed their read-position assertions. Accepting an unparseable probe response let the malformed stub qualify and seal trials, failing three unreadable-version assertions. Removing the guide's fresh-qualification teaching failed its exact guidance marker.
- An earlier sequential `npm test` gate passed before the final review fix. The later local full run hit seven 180-second evaluator harness timeouts under heavy host load while another lane ran its full gate. Focused version (63/63), accounting (4/4), delimiter (5/5), and existing confined (24/24) evaluator cases passed afterward. The rebased PR CI is the full gate for the final tree. The earlier macOS confinement suite retried one observed-mounts case after the kernel log lost two reports, then passed; Story 1.81 tracks that existing audit limitation.
- The independent review found that a custom command's incidental dependency version can satisfy the generic one-token parser. Story 1.76 now defines an explicit keyed custom response and revert checks; its backlog row and lane queue entry are part of this PR.
- The final test reviewer found that qualification resource use omitted the post-attempt version read. A delayed-read qualification case failed before the accounting fix and passed afterward. The adversarial and architecture reviewers passed their final checks.
- The post-rebase integration review found that the merged Windows supervisor can spend up to 105,000 ms in Job Object setup before the version probe's agent clock begins. The prior 8,000 ms per-read ceiling could understate a Windows trial's sealed wall-clock allowance. Shared supervisor bounds now give Windows 113,000 ms per read; the cross-platform ceiling check exercises both values. The acceptance behavior is unchanged.
- The final native Codex integration and evidence lenses passed after that fix. On the rebased tree, the focused version gate, API, MCP, preflight, CLI, comparison, documentation build and static gates passed. PR CI covers the complete final tree.

## Spec Change Log

## Review Triage Log

| Layer / finding                          | Verdict | Evidence and route                                                                                                                                                                                                                                               |
| ---------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blind 1, version token ownership         | medium  | `parseInstalledVersion` accepts one semantic version anywhere in custom output, so a dependency version can be mistaken for the adapter's own response. A strict custom response contract is a separate migration; Story 1.76 records the fix and revert checks. |
| Blind 2, argument delimiter              | medium  | `versionArgv` appends `--version` after `agentArgs`, so a standalone `--` can send it to a normal command path. Patch with a prelaunch refusal and a focused test.                                                                                               |
| Blind 3, supervisor grace                | medium  | The supervisor can spend termination grace after the 3,000 ms probe timeout, while `trialCeilingMs` budgets only 3,000 ms per read. Patch the resource ceiling and its assertion.                                                                                |
| Blind 4, final read resource use         | medium  | `runTrial` captures `elapsedMs` before the post-trial version read, and the sealed manifest and records use that value. Patch sealed resource use to include the read.                                                                                           |
| Blind 5, deleted tracked file            | medium  | `copyOf` clones committed files and overlays existing working-tree files; it never removes a tracked file deleted in the source. Patch the test helper and verify a deleted file stays deleted.                                                                  |
| Blind 6, detached source HEAD            | medium  | `git clone` chooses the source repository's default branch, which can differ from a detached source HEAD. Patch the helper to preserve the source commit and state.                                                                                              |
| Blind 7, public CLI reference            | low     | The sealed-brief evaluator section in `docs/reference/tea-evaluate-cli.md` omits the version probe and recorded fields. Patch the reference.                                                                                                                     |
| Blind 8, accepted-baseline replay        | medium  | The new case repeats `score` in the original project after CLI removal; it does not execute a copied accepted baseline. Patch the end-to-end test.                                                                                                               |
| Edge 1, deleted tracked file             | medium  | The same clone-and-overlay path restores deleted tracked files. Patch with Blind 5.                                                                                                                                                                              |
| Edge 2, nested Git metadata              | low     | The `path.basename(source) !== '.git'` filter excludes every nested `.git` path. Patch the filter to exclude only the source repository's root metadata.                                                                                                         |
| Verification 1, declared environment     | medium  | The probe code passes `environmentKeys` into `buildMinimalEnv`, but no version case requires a declared key. Patch the stub-driven test so removing the pass-through fails.                                                                                      |
| Verification 2, final calibration change | medium  | The runtime rechecks after calibration, but the movement cases cover a change before calibration and during attempts and trials. Patch a last-calibration-call case to prove exit 12 precedes a disagreement exit 11.                                            |
| Final review, qualification resource use | medium  | The post-attempt version read precedes `sealProbeTrials` but is absent from `trial.elapsedMs`, so qualification records understate wall-clock use. Patch the accounting and add a delayed-read assertion for the qualification record.                           |
| Post-rebase integration, Windows ceiling | medium  | The Windows supervisor may spend 105 seconds in bounded Job Object setup before the agent clock. Share the supervisor constants with the version resource ceiling, test the Windows value on every host, and document the platform allowance.                    |

## Verification

**Commands:**

- `npm run test:evaluate-evaluators` and `npm run test:evaluate-guidance`: contract and guidance checks pass.
- `npm run test:evaluate-mcp` and `npm run test:evaluate-api`: integration fixture checks pass after adding version responses.
- `npm test`: an earlier full gate passed; the final local run encountered seven load-sensitive 180-second evaluator harness timeouts. Focused diagnostic suites passed afterward; PR CI on the rebased tree is pending.
- `npm run docs:validate-links`, `npm run docs:build`, `npm run lint:md`, `npm run format:check`: documentation gates pass.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"`: published engine check passes.
