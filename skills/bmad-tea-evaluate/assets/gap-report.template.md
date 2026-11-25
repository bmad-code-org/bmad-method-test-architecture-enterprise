# Gap report: reservation review skill

## Evaluation brief

Write this section last, in plain words, for a reader who has not seen the evaluation, and refresh it after every rescore. Copy every verdict, count and rate from eval-quality's artifacts; compute none. Replace each example line with the facts of this evaluation.

- **What was tested:** the reservation review skill, through `tea-skill-runner`, on B-001 (approve an eligible request and cite the rule) and B-002 (decline an over-limit request without attempting a reservation).
- **Verdict:** CONCERNS on the development partition, from the evidence artifact of score invocation `<scoreInvocationId>`.
- **What it means:** the skill behaves correctly on every probe that ran, but the contract still has a coverage gap, so the result is not yet strong enough to gate a release.
- **Caught:** P-005 (B-002, the limit rule relaxed) caught 3 of 3 valid trials; P-004 (a degenerate "always decline" answer) was caught by the B-001 oracle.
- **Not caught:** the `malformed-input` discipline rule is unsatisfied; G-001 below records the repair in progress.
- **Limits:** the held-out partition has not run yet; the target's tool calls are read from stdout only; three trials per arm, the policy's minimum.
- **Next step:** close G-001, rerun and rescore development, then ask the adopter to confirm readiness for the held-out run.
- **Links:** run `<invocationId>`, score `<scoreInvocationId>`, `runs/<invocationId>/gap-view.json`, `runs/<invocationId>/scores/<scoreInvocationId>/strength-aggregate.json`, `ci/evaluation-ci-plan.json` and the pull request.

## What the target got wrong

Say in plain words what the evaluation showed the target itself doing wrong, one line per target finding of `<evaluation-folder>/target-findings.json`. Write "None found" when it records an empty list.

- **T-001:** the skill approved an eligible request without citing the rule in one of three trials, because SKILL.md asks for the citation only in its closing example.
- **T-002:** the requirements say an over-limit request is declined before any reservation is attempted, and SKILL.md never says when to call the reservation tool.

## Improvement opportunities

Every target finding with its decision, as `target-findings.json` records it. The adopter decides each once, at the end of Stage 11: this PR, a new PR with a handoff, or declined with a reason.

| Finding | Source                                  | Evidence                                                                                 | Target artifact                      | Proposed change                                                            | Disposition                 |
| ------- | --------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- | --------------------------- |
| T-001   | intermittent behavior (B-001, critical) | run `<invocationId>`, score `<scoreInvocationId>`, P-001 trial 2 of 3                    | `skills/reservation-review/SKILL.md` | Require the rule citation in every approval, ahead of the closing example. | this PR                     |
| T-002   | authoring (B-002, material)             | `requirements.md`: "An over-limit request is declined without attempting a reservation." | `skills/reservation-review/SKILL.md` | Check the limit before calling the reservation tool.                       | new PR: `target-handoff.md` |

## Net improvements

Each applied change with its before and after numbers, copied from the scored run the finding came from and the one rerun with every this-PR change applied. Compute none. Write "None applied" when no finding was decided this PR.

- **T-001:** P-001 passed 2 of 3 trials in run `<invocationId>` and 3 of 3 in rerun `<invocationId>`; `compare` reports `<relation>` for P-001 against the accepted baseline.

## Gaps

### G-001: the malformed-input rule is unsatisfied

- **Engine outcome or failed check:** a `coverageGaps` entry for `malformed-input` with `waiverId: null`, from `eval-quality 0` (CONCERNS).
- **Cited observation or diagnostic:** the evidence artifact's `coverageGaps` for operation `review-reservation`.
- **Prior invocation:** run `<invocationId>`, score `<scoreInvocationId>`.
- **Repair:** bind `type-violating` on `stdin.requestKey` in a new step and address it with an oracle check.
- **New invocation:** run `<invocationId>`, score `<scoreInvocationId>`.
- **Before and after:** CONCERNS with one open coverage gap, then PASS with none; P-005's defect component unchanged.

## Held-out results

Copy each held-out row as `gap-view.json` gives it: probe ID, class and outcome. Never copy a held-out input or expected answer.
