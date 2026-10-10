---
title: 'How to Put an Evaluation in CI with TEA'
description: Let Evaluate write the CI plan, run its pull request tier, read the evidence and render the plan into your pipeline with the Framework skill's CI phase
---

# How to Put an Evaluation in CI with TEA

After you accept a baseline, ask Evaluate to plan which checks run on pull requests, merges, a schedule, and releases.
Review the placements; your coding agent tests the pull request tier and uses the Framework skill to put the plan into your pipeline.
Pull requests replay the accepted baseline, and live tiers run the real target at the times the plan assigns.
You get a CI result with each check's outcome and evidence saved for review.
The commands below show what your agent normally runs and let you repeat it.

## When to Use This

- The evaluation has a scored run and an accepted baseline
- You want a pull request to fail when the evaluation stops reproducing
- You want the live checks (a twin run, the held-out partition, judge calibration, a strength comparison) on a schedule or at release

## Prerequisites

- An evaluation with an accepted baseline, as [How to Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md) describes
- The evaluations folder installed in the pipeline, as [Prerequisites](/docs/reference/tea-evaluate-cli.md#prerequisites) describes
- For the pipeline file: `bmad-testarch-framework` with CI scope, which renders the plan

## Steps

### 1. Ask Evaluate for the CI Plan

The last stage of the Evaluate skill writes `ci/evaluation-ci-plan.json`.
It inspects your repository (the pipeline files, the release flow, the jobs that publish or deploy) and places each check on a tier.
Every placement carries a `reason` that names the file or answer behind it, so a reviewer can read why a check sits where it does.
The skill also sets `tiers` in `evaluation.json` to the tiers the plan uses.

### 2. Read the Plan

Review when each check runs, whether it blocks or warns, and the reason Evaluate gives for placing it there.
Confirm any release or deployment job the plan would wait on.

The tiers hold these checks by default:

| Tier        | Checks                                                                   | Needs                       |
| ----------- | ------------------------------------------------------------------------ | --------------------------- |
| `pr`        | `check`, `compile`, `seal`, `replay`, `gameability`, `oracle-agreement`  | the committed baseline only |
| `merge`     | `preflight-live`, when the target needs no secret                        | the real target             |
| `scheduled` | `twin-run`, `held-out`, `judge-calibration`, `strength-comparison`       | the real target and a model |
| `release`   | the same live checks; a strength floor breach and a stale baseline block | the real target and a model |

On `release`, a probe class below its strength floor exits 2 and a stale baseline exits 11, and both block.
A strength regression found by `strength-comparison` warns on `scheduled` and on `release`.

A tier holds only the checks placed on it, so a pipeline triggered by a merge runs the `pr` tier as well as the `merge` tier.
`api-conformance` joins the `pr` tier for an HTTP API.

The skill runs `check` after each edit to catch invalid placements.
[The plan reference](/docs/reference/tea-evaluate-cli.md#the-plan) lists its fields and validation rules.

### 3. Confirm the Pull Request Tier

```bash
npm exec --prefix evals -- tea-evaluate ci --evaluation evals/refund-check --tier pr
```

The skill runs this command locally before it edits the pipeline.
An exit of 0 means the planned pull request checks passed; the output names each check and its result.
If one blocks, inspect its evidence before you accept the plan.

### 4. Read the Evidence

`ci` writes `runs/<invocationId>/` in the evaluation folder:

- `ci.json` holds the tier, each check's exit, class and enforcement, its warnings and the final exit
- `checks/<id>/exit-code`, `stdout` and `stderr` hold what each check printed
- `replay/` holds the engine's preflight verdict and the scores of the replay

Open `ci.json` first.
A failing check names its exit, and the [exit table](/docs/reference/tea-evaluate-cli.md#exit-codes) says what each exit means.

### 5. Know What a Stale Baseline Does

The baseline records the digests of the compiled contract, the corpus, the scoring policy and the strength floors.
When one of them differs from the baseline's, the `pr` tier warns and the `release` tier exits 11 until you accept a re-recorded baseline through a pull request.
The replay still runs against the baseline's own snapshot, so a stale baseline warns without hiding a real drift.

An evaluation that no longer reproduces its baseline exits 13.
Run the evaluation again, read what changed with `compare`, and accept the new baseline in a reviewed commit.

### 6. Render the Plan Into Your Pipeline

Ask your coding agent to run `bmad-testarch-framework` with CI scope to apply the plan.
It finds the plan and writes one job per tier, each running `tea-evaluate ci --tier <tier>` and uploading the evaluation folder's `runs/` directory whatever the result.
It also waits a publish or deploy job on the tier's evaluation job when the plan lists that job in `gates`.
[Evaluation Plans in the CI guide](/docs/how-to/workflows/setup-test-framework.md#evaluation-plans) describes the rendered jobs.

## How You Know It Worked

- `tea-evaluate ci --tier pr` exits 0 on your branch and prints one line per check
- A pull request that changes the contract, the corpus or the scoring policy shows a stale baseline warning
- A pull request that breaks the replay fails the evaluation job with exit 13
- The pipeline keeps `runs/<invocationId>/` as an artifact after every run

## Related

- [Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md)
- [The `ci` command reference](/docs/reference/tea-evaluate-cli.md#ci)
- [Framework CI Setup](/docs/how-to/workflows/setup-test-framework.md#ci-setup)
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md)
