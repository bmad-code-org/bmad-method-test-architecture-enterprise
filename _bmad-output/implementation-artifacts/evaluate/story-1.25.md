---
title: 'Close seeded weaknesses through the gap loop'
type: 'feature'
created: '2026-09-28'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '546f845bfe5d9488aab5ccf80baa0387a6cf029a'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

<!-- prettier-ignore-start -->

<frozen-after-approval reason="owner-delegated Evaluate story intent">

## Intent

**Problem:** Evaluate's gap guidance has not been shown to discover and repair weaknesses hidden from the maintainer session. Story 1.24's test-review suite provides a strong starting point.

**Approach:** Seed a loose clean-review oracle and remove the sole type-violating malformed-input interaction from a copy of that suite. Give a separate maintainer session only the weakened evaluation and its evidence. Commit its diagnosis, repairs, before and after evidence, and a deterministic replay gate.

## Boundaries & Constraints

**Always:** Keep `SEEDED.md` and held-out probe contents outside the maintainer session. Preserve the frozen target and confirmed intake. Let eval-quality decide coverage, outcomes, strength and verdicts. Record every changed file in the gap report and bind replay inputs to their authored source. Use Codex `gpt-6-sol` high for the isolated maintainer session, consistent with the owner's 2026-09-28 direction while the local Claude CLI quota is unavailable.

**Never:** Repair by editing the target, fabricate score artifacts, leak held-out inputs into development evidence, or claim a scored before verdict when gameability qualification stopped the run.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Before W1 | All-flagging response under the weakened review oracle | Gameability qualification fails with primary persisted evidence | Replay asserts the observed failure |
| Before W2 | Review operation lacks its type-violating `typed-file` interaction and matching oracle check | Engine reports an unsatisfied `malformed-input` discipline rule | Diagnostic evidence is committed and replayed |
| After | Maintainer adds the missing oracle condition and malformed-input interaction | Development and held-out partitions score strong under the confirmed policy | Every result is reproduced from committed inputs |

</frozen-after-approval>

<!-- prettier-ignore-end -->

## Code Map

- `test/fixtures/evaluate-authoring/test-review/evaluation/contract.json`: source contract. O-003 decides valid review outputs, O-004 reads malformed inputs, and `typed-file` is the sole type-violating interaction.
- `test/fixtures/evaluate-authoring/test-review/evaluation/probes/P-009.probe.json`: all-flagging gameability challenge whose disciplined oracle is O-003.
- `test/fixtures/evaluate-authoring/test-review/evaluation/corpus/gameability/`: degenerate response step maps track the interaction plan.
- `test/test-evaluate-authoring.js`: existing direct preflight and score replay, source binding and manifest patterns. Reuse its approach without changing Story 1.24's proof.
- `src/workflows/testarch/bmad-testarch-evaluate/references/gaps.md`: the shipped diagnosis and repair guidance. Edit only if the blind session exposes a concrete gap.
- `node_modules/eval-quality/dist/core/coverage/satisfaction.js`: installed engine rule for `malformed-input` requires a type-violating step addressed by an oracle check. Never copy its verdict logic into TeA.
- `node_modules/eval-quality/dist/core/coverage/coverage.js`: the engine's pure `evaluateCoverage` is the W2 before diagnostic; `score` calls the same function, but W1 prevents a live before trial set. Story 1.24 records bind the original contract digest and cannot be rescored against the seeded contract.
- `cli/lib/evaluate/run.js` and `preflight.js`: partition selection precedes gameability qualification. A before held-out run can score P-010 to P-013 and expose W2 in real engine evidence while the before development run separately fails W1. The blind session must receive only a redacted W2 rule summary, never the held-out files or probe content.

## Tasks & Acceptance

**Execution:**

- [x] `_bmad-output/planning-artifacts/evaluate/epics.md` and `test-design-epic-1.md`: clarify W2's exact interaction seed and separate W1 qualification failure from W2 score evidence.
- [x] `src/workflows/testarch/bmad-testarch-evaluate/references/gaps.md` and `eval-quality-facts.md`: record the engine's contract-level `malformed-input` satisfaction requirement exposed by the blocked blind run.
- [x] `test/fixtures/evaluate-gap-loop/`: create the blinded before fixture, run a fresh maintainer session with the corrected guide, preserve the blocked sessions, and capture the repaired after fixture, source inventory, transcript, gap report and complete replay inputs.
- [x] `test/test-evaluate-gap-loop.js`: reproduce before and after engine evidence byte for byte, verify hidden-input isolation, changed-file accountability, source binding, guide regression and strong after votes.
- [x] `package.json`, `CHANGELOG.md`, and `sprint-status.yaml`: wire the test into the full and CI-sharded gate, record the user-facing proof, and track the story.

**Acceptance Criteria:**

- Given hidden W1 and W2 seeds, when the blinded maintainer reads before evidence, then its report identifies both by engine evidence and names concrete repairs.
- Given the committed before replay, when the deterministic gate runs, then it reproduces W1's qualification failure and W2's `malformed-input` rule failure without launching a target or model.
- Given the committed after replay, when the gate scores both partitions, then clean controls pass, defects and gameability probes are caught at three of three, verdicts are PASS, and no coverage gap at the confirmed floor remains.
- Given a repair is reverted or an unexplained file changes, when the gate runs, then it fails on the corresponding evidence or changed-file invariant.

## Implementation Notes

- The first blind session was discarded during source review: copied Story 1.24 gap and adapter notes plus stale generated contract files exposed repair details and prior held-out outcomes. The historical notes were removed, the before contract's compiled and sealed files were regenerated, and each fresh Codex `gpt-6-sol` high session received 65 sealed inputs with no `SEEDED.md` or held-out probe content.
- Session r2 repaired W1 and caught two new malformed probes but remained at a critical W2 gap. Session r3 received a generic rule description and still could not express the schema's tagged matcher. Their inventories, guide snapshots, reports, transcripts and scored blocker artifacts are preserved under `blind/r2-*` and `blind/r3-*`. The shipped guide now states the engine predicate and shows a generic matcher binding validated by `eval-quality compile`.
- Session r4 used that guide to repair both weaknesses and scored all 12 development probes `PASS`. Its initial files and hashes are in `blind-inputs.json`; the exact guide and isolated corpus index are under `blind/`. After its blind diagnosis succeeded, a separate acceptance follow-up preserved the original raw malformed request and added a distinct typed step. The final blind development score again reported `PASS`, and the committed full-corpus after fixture subsequently scored both partitions.
- The before full development run stopped at P-007 with exit 11 because the loosened O-003 accepted the mutation. A focused P-009 qualification then persisted the all-flagging response as `held` under O-003. The before held-out partition scored four probes and recorded a critical `malformed-input` gap and `CONCERNS` verdict. No scored before development verdict exists.
- The blind repair tightened O-003 and restored a distinct type-violating `typed-file` interaction with O-004 direction and check pointers. The committed after evaluation scored all 12 development and four held-out probes. Every clean-control vote was `passed-clean-control`; every defect and gameability vote was `caught`; all score artifacts report `PASS` and zero coverage gaps.
- `test:evaluate-gap-loop` replays direct eval-quality preflight and score calls without a target or model, regenerates P-009's qualification, checks the P-007 first stop, binds raw preflight legs, qualification and rollback evidence to authored inputs, and checks all recorded file hashes. It recompiles and reseals both authored contracts, compares those bytes to authored generated files and each scored replay, and scans every supplied blind text file for seed-specific repair hints and historical held-out outcomes. The `npm test` chain includes it, and CI's chain shards discover the added script. `README.md` now states the resulting count of ninety-six scripts.
- Revert checks used temporary fixture copies. Reverting the after contract made replay fail at the authored-contract source binding. Adding an unexplained authored file made the gap report accountability check fail. A tampered before compiled contract with updated inventory hashes failed regeneration. Substituting the r3 guide snapshot failed the generic example assertion. The committed fixture was restored after each check.
- The owner-approved frozen matrix is wrapped in Prettier ignore comments so its bytes stay unchanged while the story file remains inside the repository formatting gate.

## Spec Change Log

- 2026-09-28: Updated the epic and test-design acceptance wording to match the engine's actual before states: P-007 and P-009 qualification failures plus a scored before held-out W2 gap. The after proof retains both scored partitions.

## Review Triage Log

| Round | Finding                                   | Verdict and evidence                                                                                                                                                                                                                                               | Route                                                                  |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1     | Blind hunter 1, unchanged baseline inputs | medium: the before fixture binds target and requirements to Story 1.24, while unchanged policy, probes, mutations and manifest can drift without a source comparison.                                                                                              | patch: compare the unaffected authored files to the Story 1.24 source. |
| 1     | Blind hunter 2, probe inventory           | medium: replay derives expected IDs from the fixture, so a removed probe and its records could reduce the proof unnoticed.                                                                                                                                         | patch: pin both partition inventories and classes.                     |
| 1     | Blind hunter 3, P-007 first stop          | medium: the persisted P-007 verdict is checked without recomputing O-003 from its saved mutation observations.                                                                                                                                                     | patch: bind the mutation digest and reevaluate the recorded arm.       |
| 1     | Blind hunter 4, W2 seed                   | medium: the before score proves a gap, while the test does not assert the specific removed interaction and O-004 pointers.                                                                                                                                         | patch: compare the intended seed against the Story 1.24 contract.      |
| 1     | Blind hunter 5, independent access trace  | false: the criterion calls for the supplied-file inventory and the session transcript's file reads. Both are committed and checked. No hidden-file access was found; an operating-system access trace was outside the authorized session mechanism.                | reject.                                                                |
| 1     | Blind hunter 6, alternate leak wording    | false: the final blind input inventory omits held-out probe files, strips the held-out manifest list, excludes historical repair notes, regenerates seeded outputs and hashes every supplied file. The proposed wording variations are not present in those files. | reject.                                                                |
| 1     | Blind hunter 7, O-004 tautology           | medium: a pointer substring can survive a check that no longer requires the typed request's documented error and exit code.                                                                                                                                        | patch: prove the check rejects a changed typed response.               |
| 1     | Blind hunter 8, after gameability verdict | medium: response-map bytes are bound, while the recorded disciplined verdict is trusted.                                                                                                                                                                           | patch: reevaluate O-003 on the recorded degenerate responses.          |
| 1     | Blind hunter 9, trial-record source       | high: score replay uses records without checking their actions-artifact digests against the saved trials and run record digest map.                                                                                                                                | patch: bind both references before scoring.                            |
| 1     | Blind hunter 10, all derived outputs      | false: the amended acceptance criterion promises byte replay for preflight and scored artifacts. The test does that; run summaries, interpretation and gap views are immutable manifest snapshots outside that promise.                                            | reject.                                                                |

The edge-case and verification-gap lenses reported no additional findings. The first full gate on this review head was stopped during `test:evaluate-arms` so the seven replay assertions can be patched before a final complete run.

PR #259's three independent final review lenses found three further valid gaps. The two new guide JSON fragments lacked Build Rule example tags and engine validation; they are now tagged, assembled into a real contract, compiled by `test:evaluate-guidance`, and guarded by tag-removal and matcher-corruption revert cases. The saved controlled-mutation baseline, mutated, and rollback re-pass verdicts were trusted; replay now reevaluates every saved phase through the authored oracles and checks its recorded oracle rows. The changed Stage 11 guide also required a recorded builder Edit and Analyze equivalent, completed below. All three reviewers found no further material issue in their assigned lenses.

## Builder Edit and Analyze

The installed slash builder is unavailable as a callable Codex skill. I followed `.claude/skills/bmad-workflow-builder/SKILL.md` Edit and `references/scan-orchestration.md` Analyze directly on `src/workflows/testarch/bmad-testarch-evaluate`, without claiming an official builder invocation. `uv run _bmad/scripts/resolve_customization.py --skill .claude/skills/bmad-workflow-builder --project-root . --key workflow` returned no extra gates. I ran `quick_validate.py`, `prepass-prompt-metrics.py`, `prepass-workflow-integrity.py`, `scan-path-standards.py`, and `scan-scripts.py` from `.claude/skills/bmad-workflow-builder/scripts/`, each with the skill directory argument. Quick validation and integrity passed with zero issues; the script scan passed with no scripts. Prompt metrics measured `SKILL.md` at 1,968 tokens and `gaps.md` at 2,808, both within thresholds.

The path scanner reported 14 high findings: two unchanged tracked lines in `SKILL.md:20` and `references/adapters.md:22`, and 12 ignored local `.analysis/` or `.memlog.md` files. `git diff origin/main` showed no changes to either tracked source line; `git ls-files` showed none of the ignored files. The changed `gaps.md` had zero path findings, so there are zero new critical or high findings. Independent Analyze lenses for leanness, architecture, determinism, customization, and enhancement found zero findings on the changed guide. `npm run test:evaluate-guidance` passed with the tagged examples compiled through eval-quality. AD-17 module validation does not apply because no module layout or metadata files changed.

## Design Notes

W1 intentionally fails development gameability qualification before a development score exists. Partition filtering permits a before held-out run that scores through eval-quality and records W2's coverage gap. Keep its probe files and observations out of the blind session; give that session only a rule summary from the engine evidence. The after state retains full direct preflight and score replay for both partitions.

The second blind session demonstrated that caught malformed-input probes can leave this contract rule unsatisfied. Installed eval-quality requires a planned `type-violating` input binding and an oracle check addressing that step for every operation declaring a request key. The third session could state that requirement but authored a numeric literal. The fourth session received a schema-valid generic JSON example and closed the gap without historical solution files. Its first `PASS` artifact is preserved separately from the final distinct-interaction development run.

## Outcome

The fresh blind repair closed W1 and W2. The committed after fixture retains separate raw and typed malformed interactions. Its 12 development and four held-out score artifacts all report `PASS`, with zero unsatisfied gaps, 30 caught trial votes and 18 passed-clean-control votes. The deterministic replay reproduces the before failures and both after partitions from committed evidence. Coordinator review and the final combined `npm test` remain pending.

## Verification

**Commands:**

- `npm run test:evaluate-gap-loop`: passed on the final fixture, including direct preflight and score replay, generated contract binding, historical blocker evidence, blind input scanning, distinct malformed steps and 3/3 votes.
- `npm run test:evaluate-guidance`: passed with the revised Stage 11 guide.
- `npm run test:release-metadata`: passed; package metadata is synchronized.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"`: passed.
- `npm run test:doc-counts`, `npm run test:doc-claims`, and `npm run docs:validate-links`: passed after the README count update.
- `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`, and `npm run test:bmad-output-gated`: passed. The first focused `lint` attempt found a switch-case style error in the new test; it was fixed and lint passed on the final tree.
- `npm run docs:build`: passed on the rebased branch in the coordinator session, including link validation and the 45-page Starlight build.
- `npm test`: the earlier run exposed a stale README count, which was corrected. The coordinator stopped a later combined run after the blind input leak was found. The final full gate is pending on the reconciled tree.
