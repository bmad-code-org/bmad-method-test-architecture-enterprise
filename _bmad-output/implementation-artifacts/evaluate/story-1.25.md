---
title: 'Close seeded weaknesses through the gap loop'
type: 'feature'
created: '2026-09-28'
status: 'in-progress'
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
- [x] `test/fixtures/evaluate-gap-loop/`: create the blinded before fixture, run the maintainer session on an isolated copy, commit the repaired after fixture, source inventory, transcript, gap report and complete replay inputs.
- [x] `test/test-evaluate-gap-loop.js`: reproduce before and after engine evidence byte for byte, verify hidden-input isolation, changed-file accountability, source binding and strong after votes.
- [x] `package.json`, `CHANGELOG.md`, and `sprint-status.yaml`: wire the test into the full and CI-sharded gate, record the user-facing proof, and track the story.

**Acceptance Criteria:**

- Given hidden W1 and W2 seeds, when the blinded maintainer reads before evidence, then its report identifies both by engine evidence and names concrete repairs.
- Given the committed before replay, when the deterministic gate runs, then it reproduces W1's qualification failure and W2's `malformed-input` rule failure without launching a target or model.
- Given the committed after replay, when the gate scores both partitions, then clean controls pass, defects and gameability probes are caught at three of three, verdicts are PASS, and no coverage gap at the confirmed floor remains.
- Given a repair is reverted or an unexplained file changes, when the gate runs, then it fails on the corresponding evidence or changed-file invariant.

## Implementation Notes

- The blind maintainer ran as Codex `gpt-6-sol` high in `/tmp/tea-gap-loop-blind-125`. Its initial files and hashes are committed in `blind-inputs.json`; the exact `gaps.md` it read is under `blind/`. The session read no `SEEDED.md` or held-out probe content. Its file reads and commands are recorded in `session-transcript.md`.
- The before full development run stopped at P-007 with exit 11 because the loosened O-003 accepted the mutation. A focused P-009 qualification then persisted the all-flagging response as `held` under O-003. The before held-out partition scored four probes and recorded a critical `malformed-input` gap and `CONCERNS` verdict. No scored before development verdict exists.
- The blind repair tightened O-003 and restored a distinct type-violating `typed-file` interaction with O-004 direction and check pointers. The committed after evaluation scored all 12 development and four held-out probes. Every clean-control vote was `passed-clean-control`; every defect and gameability vote was `caught`; all score artifacts report `PASS` and zero coverage gaps.
- `test:evaluate-gap-loop` replays direct eval-quality preflight and score calls without a target or model, regenerates P-009's qualification, checks the P-007 first stop, binds raw preflight legs, qualification and rollback evidence to authored inputs, and checks all recorded file hashes. The `npm test` chain includes it, and CI's chain shards discover the added script. `README.md` now states the resulting count of ninety-six scripts.
- Revert checks used temporary fixture copies. Reverting the after contract made replay fail at the authored-contract source binding. Adding an unexplained authored file made the gap report accountability check fail. The committed fixture was restored after each check.
- The owner-approved frozen matrix is wrapped in Prettier ignore comments so its bytes stay unchanged while the story file remains inside the repository formatting gate.

## Spec Change Log

- 2026-09-28: Updated the epic and test-design acceptance wording to match the engine's actual before states: P-007 and P-009 qualification failures plus a scored before held-out W2 gap. The after proof retains both scored partitions.

## Review Triage Log

## Design Notes

W1 intentionally fails development gameability qualification before a development score exists. Partition filtering permits a before held-out run that scores through eval-quality and records W2's coverage gap. Keep its probe files and observations out of the blind session; give that session only a rule summary from the engine evidence. The after state retains full direct preflight and score replay for both partitions.

## Verification

**Commands:**

- `npm run test:evaluate-gap-loop`: passed after the strengthened source-binding checks.
- `npm run test:release-metadata`: passed; package metadata is synchronized.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"`: passed.
- `npm run test:doc-counts`, `npm run test:doc-claims`, and `npm run docs:validate-links`: passed after the README count update.
- `npm run lint:md`, `npm run format:check`, and `npm run test:bmad-output-gated`: passed with the frozen matrix preserved.
- `npm test`: first run reached `test:doc-counts` and exposed the stale README count. After that fix, the coordinator stopped the rerun while it was passing `test:evaluate-check` so the branch can be reconciled with newly merged main. The coordinator will run the final full gate on the combined tree.
