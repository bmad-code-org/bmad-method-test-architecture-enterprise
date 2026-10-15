---
title: 'How to Read the Gaps and Fix Them with TEA'
description: Distinguish evaluation weaknesses from target defects and invalid measurements, repair development gaps with the Evaluate skill, and review the new evidence
---

# How to Read the Gaps and Fix Them with TEA

**Bottom line:** Use this guide when a run stops, a score reports concerns, or a declared strength floor is not met. Ask the Evaluate skill to trace one problem to its evidence, propose a small repair and rerun development. First decide whether the problem is in the target, the evaluation or the measurement. You approve what correct behavior means and any change to that standard; a greener result alone is not a repair.

## Start with the Evaluate Skill

Have the evaluation folder and command output or run ID ready. A failed preflight is enough to start.

- **Claude Code / Cursor / Windsurf:** `/bmad-tea-evaluate`
- **Codex:** `$bmad-tea-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

```text
Inspect the latest development result for evals/test-review-json-stdin.
Show the first gap and the evidence behind it. Tell me whether it is
a target defect, an evaluation weakness or an invalid measurement.
Propose one repair without weakening the confirmed requirements.
Keep held-out details closed until I approve the development result.
```

The skill authors the evaluation; `tea-evaluate` executes and records it; `eval-quality` supplies verdicts and strength measurements. [Manual commands](#manual-commands) are below.

## 1. Identify What Failed

Keep the command, exit code, diagnostic and artifact path together. The number alone is not a diagnosis.

| What the evidence shows                                                | What to do                                                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| The unchanged target violates a confirmed requirement                  | Investigate a target defect. Keep the requirement and arrange a target repair.          |
| Known good and bad behavior are not reliably distinguished             | Repair the probe, oracle, evaluator or calibration. This is an evaluation weakness.     |
| Execution, evidence integrity or isolation cannot support a conclusion | Repair the measurement setup and rerun. Do not count it as a catch or a target failure. |

An **oracle** checks recorded evidence. A failed clean control can mean a wrong oracle, faulty wiring or a defective target. Inspect the observation before choosing a repair.

Useful routing clues:

- **Exit 10:** an authoring or input defect, such as a stale digest or invalid record.
- **Exit 11:** an evaluation weakness, such as failed mutation qualification or insufficient judge agreement.
- **Exit 12:** execution or evidence-verification infrastructure failed.
- **`score` exit 2:** `eval-quality` returned `FAIL`; read its reasons.
- **`score` exit 3:** `Invalid`; the measurement cannot support the intended conclusion.
- **`score` exit 0:** may mean `PASS`, `WAIVED` or `CONCERNS`. Read the verdict and coverage gaps.

**A caught deliberate defect is a successful test of the evaluation.** Generated runs use contract-scoring mode, so the evaluation can earn `PASS` by catching a broken target. That does not mean the broken target passed its behavioral requirement.

## 2. Trace One Development Gap to Evidence

Ask the skill to identify the probe, behavior, oracle and observation before editing. It uses:

- `runs/<runId>/scores/<scoreId>/<probeId>/evidence-artifact.json` for the engine's verdict, outcomes and coverage gaps.
- `runs/<runId>/interpretation.json` to trace findings to recorded observations and their process or outcome phase.
- The probe's `score.json` for stdout, stderr and failure details when no evidence artifact was produced.
- Qualification evidence under `runs/<runId>/qualification/` when preflight could not establish the clean, defective and restored behavior.

`interpretation.json` does not grade findings. Its `firstMaterialError` is the earliest observation cited by a material or critical finding, not proof of the root cause.

For example, a test-review probe may report:

```text
P-007: M-003: the mutated arm did not fail (held)
```

Qualification did not establish the intended distinction. Check whether the mutation produced wrong behavior and whether the oracle observed it; the message alone does not prove a loose oracle.

Suppose the evidence shows that the mutated reviewer falsely reported `missing-assertion` for a valid test file. If the confirmed requirement says this file must receive a clean answer, but the oracle accepts both answers, the oracle is too loose. That is a concrete evaluation gap.

## 3. Repair the Cause Without Moving the Goal

Have the skill remove the false finding from the allowed answers. Retain a clean control and requalify the mutation: the clean arm must pass, the defective arm must fail, and restoration must recover the original file and clean behavior.

Other gaps call for different repairs:

| Gap                                                           | Focus the repair on                                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A qualified defect is missed                                  | The observed channel, defect signature and oracle predicate                                                                 |
| A compliant-looking answer gets credit without doing the work | A gameability probe and an oracle over substantive evidence                                                                 |
| A valid answer is rejected                                    | The clean control, requirement and oracle's allowed behavior                                                                |
| A rubric scorer disagrees with approved labels                | Anchors, labels, scorer configuration and [calibration](/docs/how-to/evaluate/choose-an-evaluator-and-calibrate-a-judge.md) |
| Evidence is missing or the intended step is unreached         | The interaction plan, adapter, evidence pointer or target reachability                                                      |

The normal repair changes the evaluation folder. A real target defect needs a separately agreed target change. An isolation violation may require fixing target behavior; adding access just to hide it is not a repair.

You approve changes to requirements, labels, thresholds or scope. Record why the standard changed. Do not loosen an oracle, relabel a bad answer or lower a floor merely to get green.

## 4. Review Coverage and Run-Wide Strength

After rerunning development, inspect both the per-probe verdicts and `strength-aggregate.json` in the latest score directory.

A `CONCERNS` verdict can identify missing contract coverage. Ask for an addition that satisfies the rule:

| Rule                           | Typical addition                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `malformed-input`              | A wrong-type input binding and an oracle addressing that step for every relevant operation |
| `whole-body`                   | An oracle covering every required response key and a defect outside the success keyword    |
| `per-record`                   | Multiple records with evidence checked per record                                          |
| `omission-and-completeness`    | A missing-item probe and a check over the complete required set                            |
| `success-indicator-separation` | Evidence independent of the target's own success claim                                     |
| `state-change-read-back`       | A state-changing action followed by a read-back check                                      |
| `sibling-cross-check`          | Inconsistent sibling fields and an oracle comparing them                                   |

A caught probe alone may not satisfy a structural coverage rule. Check the contract's declarations.

The strength aggregate reports distinct qualified probes by `defect`, `gameability` and `zero-action`. Trials reduce to a result per probe; clean controls and canaries do not inflate the denominator. Read each declared floor's `decision` and `basis`:

- `meets`: the class cleared the required checks and its rate reached the floor.
- `does-not-meet`: inspect the basis, such as `rate-below-floor`, `no-eligible-probe`, `not-comparable` or an unexercised probe.
- `undeclared`: no floor was set for that class. This is not a pass for that class.

For example, clean controls labelled `zero-action` cannot satisfy a zero-action strength floor. Add an eligible probe where an action is required. If that class genuinely does not apply, you may remove its floor and document the scope decision; removal does not demonstrate improved detection.

Floor decisions do not change `score`'s exit code. If the aggregate pointer is `absent`, `refused`, `mismatch` or `failed`, resolve that cause before making a class-wide strength claim.

## 5. Check Held-Out Results After Review

After repairing or explicitly declining development gaps with reasons, review the evidence and floors. Confirm readiness before held-out execution.

During the repair loop, read held-out results only through `runs/<runId>/gap-view.json`:

- `caught: true` records a detection for that probe under the engine's reduction rules.
- `caught: false` calls for a new development probe of the same class, then diagnosis there.
- `outcome: null` leaves the cause undisclosed. Reproduce the class failure in development; if you cannot, record the gap as blocked.

Read held-out results only from `gap-view.json` in the scored run folder. Set `RUN` to the ID printed by `run`:

```bash
(cd "evals/test-review-json-stdin/runs/$RUN" &&
  node -p "require('./gap-view.json')['held-out'].map((r) => r.probeId + ' ' + r.probeClass + (r.outcome ? ' caught=' + r.outcome.caught + ' ' + r.outcome.caughtCount + '/' + r.outcome.validCount : ' outcome withheld')).join('\\n')")
```

Keep held-out inputs, records and answers closed while repairing. A [`partitionPlan`](/docs/reference/tea-evaluate-manifest.md#held-out-probes-and-partition-plans) can separate held-out requests from development execution; selecting development probes alone does not.

Repeated held-out feedback can still influence later changes. A held-out pass is bounded evidence, not proof of exhaustive coverage.

## Manual Commands

The skill refreshes digests, validates the contract, reruns qualification and scores development. To repeat the core loop, replace the example folder and run ID:

```bash
npm exec --prefix evals -- tea-evaluate digest --evaluation evals/test-review-json-stdin
npm exec --prefix evals -- tea-evaluate check --evaluation evals/test-review-json-stdin
npm exec --prefix evals -- tea-evaluate preflight --evaluation evals/test-review-json-stdin --partition development
npm exec --prefix evals -- tea-evaluate run --evaluation evals/test-review-json-stdin --partition development
```

Run these one at a time and stop on a nonzero exit. Refresh the index after changes to `corpus/`, `probes/` or `mutations/`. `run` repeats preflight. Score the completed run, which `score` takes as the most recent run:

```bash
npm exec --prefix evals -- tea-evaluate score --evaluation evals/test-review-json-stdin
```

After development approval, use `run --partition held-out` and score its new run ID. Preserve the old and new IDs with the gap, repair and observed result. Never edit sealed run evidence to change an outcome.

## How You Know It Worked

The new evidence demonstrates the intended distinction between good and bad behavior. Coverage and strength gaps are closed or recorded as limitations. Review held-out outcomes before [accepting a baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md).

## Related Guides

- [How to Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md): Preserve a reviewed measurement
- [How to Choose an Evaluator and Calibrate a Judge](/docs/how-to/evaluate/choose-an-evaluator-and-calibrate-a-judge.md): Repair disagreement with approved labels
- [How to Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md): The first run

## Reference

- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md): Commands, options and fields
- [digest](/docs/reference/tea-evaluate-cli.md#digest)
- [score](/docs/reference/tea-evaluate-cli.md#score)
- [Exit codes](/docs/reference/tea-evaluate-cli.md#exit-codes)
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): Qualification, held-out probes and the limits of a pass
