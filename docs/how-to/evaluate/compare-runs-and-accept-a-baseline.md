---
title: 'How to Compare Runs and Accept a Baseline with TEA'
description: Compare compatible scored runs, review changes and limitations, and preserve a chosen measurement as a baseline in a reviewed pull request
---

# How to Compare Runs and Accept a Baseline with TEA

**Bottom line:** Use this guide after scoring a run, either to compare it with an existing baseline or to preserve the first one. Ask the Evaluate skill to explain the evidence and any limits on comparison. You decide whether to retain the result, then accept and commit it through review. **Accepting a baseline preserves a measurement; it does not approve the target's quality or certify that the evaluation is strong.**

## Start with the Evaluate Skill

Have a completed, scored run from [How to Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md) or the equivalent guide for your target. For acceptance, the measured changes must be committed and the run must record `dirty: false`.

- **Claude Code / Cursor / Windsurf:** `/bmad-tea-evaluate`
- **Codex:** `$bmad-tea-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

```text
Compare the latest scored run for evals/grader-tool-server with
the accepted baseline. Explain any refusal, weaker probe or
incomparable result, and summarize verdicts and strength floors.
Show what changed and what remains unproven before I decide
whether to accept it.
```

The skill guides the review and runs `tea-evaluate`; `eval-quality` supplies the strength relations. [Manual commands](#manual-commands) are below.

## 1. Choose the Run You Mean

By default, `compare` selects the most recent `run` invocation and its latest score invocation. Use `--run <runId>` when you need a specific completed run. Rescoring that run changes which score invocation is selected; `compare` has no score-ID selector.

Have the skill identify the run, score invocation, partition and measured revision. Development and held-out runs cover different probes. An incomplete or unscored run has nothing to compare.

Keep two review questions separate:

1. **What did this measurement establish?** Read verdicts, coverage gaps, clean controls, detection outcomes and class-wide strength floors.
2. **How does its strength compare with the baseline?** Read the comparison only when both sides are compatible.

The second answer cannot replace the first. Two equally weak results can be equivalent.

## 2. Read the Comparison Outcome

Plain `compare` is read-only. It reports one of three normal outcomes, all with **exit 0**:

| Outcome     | Meaning and next step                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `first-run` | No baseline exists. Review this result on its own before deciding to retain it.                |
| `compared`  | The comparison proceeded. Read every probe's relation and the underlying evidence.             |
| `refused`   | The measurements are incompatible. Read the reason; no stronger-or-weaker conclusion was made. |

A zero exit therefore does not mean improvement, no regression or acceptance.

For `compared`, **`a` is the baseline and `b` is the selected run**:

| Relation        | How to read it                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `equivalent`    | The compared strength vectors are equal.                                                                                    |
| `a-dominates-b` | The baseline is at least as strong in every compared class and stronger in at least one. Investigate the regression.        |
| `b-dominates-a` | The new run is at least as strong in every compared class and stronger in at least one. Review what produced the gain.      |
| `incomparable`  | Neither side dominates, or the available evidence cannot support an ordering. Investigate rather than treating it as a tie. |

These are per-probe strength relations, not one overall product-quality ranking. A clean control has no strength vector and compares `incomparable` even with itself. For other probes, insufficient or non-comparable evidence may also prevent an ordering.

Check the run-wide `strength-aggregate.json` separately. A floor can be `does-not-meet` even when `score` exits 0. Neither an `equivalent` relation nor an improved probe removes that gap.

## 3. Understand a Refused Comparison

The CLI refuses the normal comparison when:

- The partitions differ, such as development versus held-out or `both`.
- The probe sets differ.
- A probe's `comparabilityKey` differs, for example after changing the scoring policy, probe set or corpus.
- The runs record different `evalQualityVersion` values.

Adding probes or changing policy may cause an expected refusal. Review the new result against the revised requirements and explain why a new baseline is needed; a refused comparison does not establish improvement.

Conversely, a comparison that proceeds is not a causal experiment. Review changes to the target, model, evaluator, configuration and execution conditions. A dominance relation describes the recorded evidence; it does not establish which change caused it or how the system will behave in production.

An integrity failure is different from the normal `refused` outcome. Missing artifacts, invalid files or baseline digest mismatches exit nonzero and need repair before comparison. Do not edit stored evidence to make the keys or digests agree.

## 4. Decide Whether This Is the Baseline You Want

You own the requirements, accepted limitations and release policy. Before accepting, have the skill summarize:

- The measured change and exact run being retained.
- Verdicts, missed probes, false positives and unresolved coverage gaps.
- Each declared strength floor and its decision.
- Regressions, incomparable probes or reasons comparison was refused.
- Any changed requirement, threshold, evaluator or engine version.

Use [Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md) for issues you want repaired first. Record deliberately retained limitations so future reviewers know what this baseline means.

**Acceptance is not a quality gate.** The CLI permits score exits `0`, `2` (`FAIL`) and `3` (`Invalid`) at its score-record check, provided the run also passes all acceptance checks. A weak result can therefore be retained. An Invalid result still needs every required evidence artifact and replay input; many invalid measurements cannot meet those conditions.

Retaining a result does not convert FAIL or Invalid into PASS, establish trustworthy detection from invalid evidence, or waive a release requirement. The separate `--before-state` workflow is also not an acceptable baseline: both comparison and acceptance refuse a before-state run.

## 5. Accept and Commit the Reviewed Measurement

The normal sequence is:

1. Commit the target and evaluation changes you intend to measure.
2. Run and score that committed setup. Review the new evidence and compare it with the existing baseline, if any.
3. Confirm the selected run is the one you want retained, then ask the skill to accept it.
4. Review the resulting `baseline/` diff and commit it in the same pull request as the changes it measures.

`compare --accept` replaces `baseline/`. It preserves the required replay inputs, qualification evidence and latest score invocation byte for byte, then adds `baseline.json` with the accepted IDs and digests. It does not copy every diagnostic or derived view from the run.

The command does not commit, open a pull request, enforce review or require an improving comparison. You and your repository provide those review steps.

Commit the accepted `baseline/` before the next run. Uncommitted changes in the evaluation folder, including the baseline, make that run dirty and prevent its acceptance. Do not change `run.json` to clear the flag: commit the intended changes and measure again.

## Manual Commands

Replace the example folder with yours. To review the most recent scored run:

```bash
npm exec --prefix evals -- tea-evaluate compare --evaluation evals/grader-tool-server
```

For a new measurement, start from the intended committed setup and run:

```bash
npm exec --prefix evals -- tea-evaluate run --evaluation evals/grader-tool-server
```

After it completes, copy the printed run ID. Run the next commands separately and inspect their output:

```bash
RUN_ID=$(command ls evals/grader-tool-server/runs | tail -n 1) # the newest run
npm exec --prefix evals -- tea-evaluate score --evaluation evals/grader-tool-server --run "$RUN_ID"
npm exec --prefix evals -- tea-evaluate compare --evaluation evals/grader-tool-server --run "$RUN_ID"
```

The default run selects both partitions. When you need a development-only or held-out run, use `--partition development` or `--partition held-out`; review development before opening held-out results. Keep the selected partition consistent with the baseline you intend to compare.

Only after your acceptance decision:

```bash
npm exec --prefix evals -- tea-evaluate compare --evaluation evals/grader-tool-server --run "$RUN_ID" --accept
npm exec --prefix evals -- tea-evaluate check --evaluation evals/grader-tool-server
```

If a command fails, inspect the diagnostic rather than continuing blindly. A score exit of 2 or 3 warrants an explicit evidence review even though acceptance may be technically possible.

## If Acceptance Is Refused

Common causes are a dirty or before-state run, missing evidence, changed sealed inputs, unusable replay files or a failed score invocation. A score exit outside `0`, `2` and `3`, or a strength aggregate recorded as `failed`, `refused` or `mismatch`, blocks acceptance. Repair the cause and rescore or rerun as directed.

If a baseline file was edited by hand, restore the accepted bytes from Git or deliberately accept a new eligible run. If staging or swapping fails, read the diagnostic before retrying; it reports recovery problems and where the previous baseline remains. See [acceptance rules and recovery](/docs/reference/tea-evaluate-cli.md#accepting-a-baseline) for details.

## How You Know It Worked

- The acceptance output names the intended run and latest score invocation as the baseline.
- `check` finds no authoring defects, including baseline digest errors.
- The reviewed pull request explains the measured changes and retained limitations alongside the `baseline/` diff.

That establishes a recorded reference point. [Put the evaluation in CI](/docs/how-to/evaluate/put-an-evaluation-in-ci.md) to replay it and enforce the checks and blocking policy you chose.

## Related Guides

- [How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md): Investigate weaknesses before deciding what to retain
- [How to Put an Evaluation in CI](/docs/how-to/evaluate/put-an-evaluation-in-ci.md): Replay the baseline and gate checks
- [How to Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md): Produce the run to compare

## Reference

- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md): Commands, options and fields
- [compare](/docs/reference/tea-evaluate-cli.md#compare)
- [ci](/docs/reference/tea-evaluate-cli.md#ci)
- [Exit codes](/docs/reference/tea-evaluate-cli.md#exit-codes)
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): What a baseline and a pass establish
