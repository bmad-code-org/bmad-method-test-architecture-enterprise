---
title: 'Story 1.56: Prove the malformed CLI refusal against a controlled defect'
type: 'feature'
created: '2026-10-03'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7e3585d9e81219ce6c36771b9a8546df47d8b198'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.56)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.56)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-8, AD-20)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.55.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and explicitly assigned Story 1.56">

## Intent

**Problem:** The pantry suite checks malformed input on a clean target, but its committed defects only test the summary behavior. O-002 has no scored detection evidence against a defective refusal guard.

**Approach:** Add an adopter-owned guard-bypass mutation and separate development and held-out probes. Run them through the existing Autoevals evaluator and published eval-quality engine, proving mutation, rollback, clean control, and three-trial detection.

## Boundaries & Constraints

**Always:** Change the target only in a disposable copy. Witness the defective response, restore original bytes, verify the digest, and rerun the clean baseline. O-002 checks exit code 2, exact stderr, and empty stdout; a failure quotes a permitted observed channel. Keep P-004 clean, both defect partitions comparable, and the contract at PASS with no waiver on eval-quality 6.0.1.

**Never:** Edit the adopter's working tree during a run, hand-edit generated corpus digests or run evidence, add an engine waiver, use Claude, or treat a passing wrapper unit case as scored defect proof. Story 1.42 stays in review pending 1.103.

## I/O & Edge-Case Matrix

| Scenario      | Input / State                                                    | Expected Output / Behavior                       | Error Handling                                              |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Clean refusal | Type-violating request, original guard                           | Exit 2, exact diagnostic on stderr, empty stdout | P-004 passes 3/3                                            |
| Guard bypass  | Same request, M-002 in copied target                             | Summary on stdout and no refusal                 | O-002 fails with observed quote; P-005 and P-006 caught 3/3 |
| Broken proof  | No-op mutation, missing restore, or weakened O-002 channel check | Qualification or focused gate fails              | No PASS evidence accepted                                   |

</frozen-after-approval>

## Code Map

- `test/fixtures/evaluate-learn/target/summarizer.js`: request guard to replace exactly once through M-002; leave committed target clean.
- `test/fixtures/evaluate-learn/evaluation/mutations/M-001.mutation.json` and `probes/P-002.probe.json`, `P-003.probe.json`: patterns for the second mutation and two partitioned B-002 defect probes.
- `test/fixtures/evaluate-learn/evaluation/contract.json`: O-002 already checks the three channels. Expand the authorized mutation boundary and required evidence; keep one behavior-linked oracle.
- `test/fixtures/evaluate-learn/evaluation/evaluator/autoevals-exact.mjs`: stderr ExactMatch plus exit and stdout checks already exist. Preserve its observed-channel failure quote.
- `test/fixtures/evaluate-learn/evaluation/evaluation.json`, `requirements.md`, and `corpus-index.json`: declare the held-out probe, describe the second authorized defect, then regenerate digests through `tea-evaluate digest`.
- `test/test-evaluate-learned-framework.js`: extend hard-coded fixture checks, real preflight and both partition runs. Assert qualification digests, rollback, three trial votes, finding quotes, comparable strength, and PASS without gaps.
- `cli/lib/evaluate/mutation.js` and `preflight.js`: reuse `runMutationCycle` and qualification evidence; do not copy their verification into fixture code.

## Tasks & Acceptance

**Execution:**

- [x] `test/fixtures/evaluate-learn/evaluation/mutations/` and `probes/`: author M-002, P-005 and P-006 for B-002, including a manifestation witness and a channel-addressed signature.
- [x] `test/fixtures/evaluate-learn/evaluation/contract.json`, `requirements.md`, `evaluation.json`, `corpus-index.json`: permit the copied guard edit, record admissible evidence, separate partitions, and update source and corpus digests using owning commands.
- [x] `test/test-evaluate-learned-framework.js`: exercise real preflight, mutation rollback and both scored partitions; cover the matrix and run focused negative controls that fail if application, restore, or an O-002 channel check is removed.
- [x] `CHANGELOG.md`, sprint row and this record: document the shipped proof, exact gates, revert observations, and review decisions.

**Acceptance Criteria:**

- Given M-002 and malformed input, when real preflight qualifies each B-002 probe, then it witnesses the bypass, restores original bytes and digest, and reruns a passing baseline; undoing application or restore fails a focused check.
- Given P-005 in development and P-006 held out, when the authored evaluator and published engine score three trials each, then O-002 catches every trial with a permitted observed quote; removing any required channel check or hard-coding pass fails the focused gate.
- Given the original target, when P-004 runs three trials, then every vote is `passed-clean-control`; both B-001 and B-002 defects have comparable scored strength, and all evidence has `contractVerdict: PASS` with no coverage gap or waiver.
- Given the updated fixture, when the engine export check, `test:evaluate-learned-framework`, `test:atdd-workflow-guidance` after contract change, and `npm test` run, then all pass.

## Implementation Notes

- M-002 replaces the request guard once in a disposable copy. P-005 runs in development and P-006 is held out. Each probe has its own manifestation witness and a stdout signature for the type-violating request. The committed target retains the original guard.
- The requirements statement admits exit code, whole stderr and whole stdout for malformed requests. O-002 still uses one oracle with three conjunctive exact equalities. The contract permits the copied guard edit. `tea-evaluate digest` regenerated the nine-entry corpus index, and `tea-evaluate check` supplied the requirements digest recorded in the manifest and contract.
- The source requirements statement and the evaluation copy carry the same current requirements and retain the Story 1.26 attribution. The contract is revision 5; its parent is the published engine's `digestArtifact` of the HEAD revision 4 contract, `sha256:380f58fa178c521ca0ec39161ce77206c8864b829610abd15591fce331177630`.
- Both requirements copies date the guard-bypass extension to Story 1.56 on 2026-10-03. The original 2026-09-29 confirmation stays attributed to Story 1.26. Published eval-quality `digestBytes` gives the amended requirements `sha256:d42b2f7534aaef8b7d3d9fbca840b9182c135d46dfd612b4b9d2ffbfef98f605`, recorded in both manifest and contract.
- Real preflight qualified both B-002 probes. Each qualification records baseline refusal at exit 2, empty stdout and exact stderr; mutated response at exit 0, summary stdout and empty stderr; distinct pre and mutated digests; restored digest equal to the original; and a passing baseline rerun. A no-op M-002 fails preflight. A blocked restore exits 12 in `runMutationCycle`. The focused assertion rejects removal of each O-002 equality.
- Development P-005 and held-out P-006 each score three `caught` votes, with O-002 findings quoting an observed channel. P-004 scores three `passed-clean-control` votes. B-001 and B-002 defect evidence reports comparable strength with a defect rate of 1. Every scored probe reports `contractVerdict: PASS` and no coverage gaps or waiver.

## Spec Change Log

## Review Triage Log

- Blind Hunter, `LEARNED.md`: **low, patch**. Its pipeline result still ends at the Story 1.55 four-artifact state, so a reader would miss this fixture's second mutation and new scores. Append the dated result without rewriting historical evidence.
- Blind Hunter, `gap-report.md`: **low, patch**. Its repair account says the exploratory mutation and probes were removed; the current fixture now commits a guard-bypass mutation and two probes. Append the Story 1.56 outcome while retaining the historical account.
- Blind Hunter, `inspection-record.md`: **low, patch**. The B-002 surface table omits stdout as a defect-signature channel, even though the new probes use it. Update the table and mutation history.
- Blind Hunter, O-002 removal negative control: **false, rejected**. The focused test directly requires all three equality operands and their evidence targets at lines 261-273, so removing any committed channel check fails the gate. The separate wrapper tests exercise unexpected stdout, missing stderr, and wrong exit code through the evaluator; scoring a deliberately invalid contract is not required by this story's gate criterion.
- Blind Hunter, hard-coded malformed refusal pass: **false, rejected**. `frameworkControlsJudgment` supplies an Autoevals refusal score of zero and asserts the refusal row is `fail`; a hard-coded `pass` makes the focused test fail. `installedApi` and the wrapper source check also guard the real scorer call.
- Blind Hunter, P-006 same scored request as P-005: **low, rejected**. The contract's single `reject-malformed` interaction binds a type-violating prompt and yields the same deterministic request in each run. The story asks for separate development and held-out defect probes against one controlled guard bypass; P-005 and P-006 are separately qualified and scored in their assigned partitions. A different scored request needs a new interaction plan and would add complexity without changing this one-defect detection claim.
- Blind Hunter, P-005 witness input: **medium, patch**. Its raw `42` witness differs from the serialized type-violating prompt scored in all three trials. Aligning witness bytes with the scored request makes qualification directly prove the scored manifestation.
- Blind Hunter, pending `npm test` recorded as passed: **low, rejected as a spec-edit finding**. The verification command list is aspirational while the observed paragraph says the host slot is pending. Record the actual full-gate result when lane 2 releases the slot.
- Verification Gap Reviewer, pending `npm test` recorded as passed: **low, rejected as a spec-edit finding**. This is the same inconsistent verification status observed independently; the actual full-gate result will settle it.

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- published export exists.
- `npm run test:evaluate-learned-framework` -- clean control, both defects and rollback assertions pass.
- `npm run test:atdd-workflow-guidance` -- regenerated contract guidance stays valid.
- `npm test` -- full local gate passes in the coordinated host slot.

**Observed:** Published engine export check, `tea-evaluate check`, direct preflight, `test:evaluate-learned-framework` (162 checks), `test:atdd-workflow-guidance`, `lint`, `lint:md`, and `format:check` passed. The coordinated full `npm test` slot remains pending.
