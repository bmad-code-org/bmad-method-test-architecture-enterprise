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
