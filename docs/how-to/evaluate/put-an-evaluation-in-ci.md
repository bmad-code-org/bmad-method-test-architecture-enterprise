---
title: 'How to Put an Evaluation in CI with TEA'
description: Let Evaluate write the CI plan, run its pull request tier, read the evidence and render the plan into your pipeline with the Framework skill's CI phase
---

# How to Put an Evaluation in CI with TEA

Use the CI plan to run an evaluation on every pull request, every merge, on a schedule and at release, each at the tier that fits its cost.
The `pr` tier replays your accepted baseline with no model call and no secret.
The live tiers run the real target when a pipeline can afford it.

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

Each check in the plan has an `id`, a `tier`, a `trigger`, the `command` that runs it, an `enforcement` and the `evidence` paths it leaves:

```json
{
  "id": "check",
  "tier": "pr",
  "trigger": ["pull-request"],
  "kind": "evaluate",
  "command": ["tea-evaluate", "check", "--evaluation", "evals/refund-check"],
  "enforcement": "block",
  "evidence": ["runs/<invocationId>/checks/check/stdout"],
  "placement": {
    "tier": "pr",
    "defaultTier": "pr",
    "reason": "The check is deterministic and needs no secret, so it runs on every pull request."
  }
}
```

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

Run `check` after every edit to the plan.
It reports a trigger its tier does not use, a `tiers` list that disagrees with the plan, a check the evaluation cannot run and a placement with no reason, each with exit 10.

### 3. Run the Pull Request Tier Yourself

```bash
npm exec --prefix evals -- tea-evaluate ci --evaluation evals/refund-check --tier pr
```

Expected output, with the exact set of checks following your plan:

```text
tea-evaluate ci: scoring run 20261007T091245668Z-181adf58
tea-evaluate ci: P-001: eval-quality score exited 0
tea-evaluate ci: P-003: eval-quality score exited 0
tea-evaluate ci: P-002: eval-quality score exited 0
tea-evaluate ci: strength aggregate: eval-quality aggregate-strength exited 0
check: exit 0 (pass), pass
compile: exit 0 (pass), pass
seal: exit 0 (pass), pass
oracle-agreement: exit 0 (pass), pass
replay: exit 0 (pass), pass
tea-evaluate ci: 5 check(s) of the pr tier ran, 0 blocking, 0 warning; the evidence is in runs/20261007T100241303Z-f2a100b9 (exit 0, /work/app/evals/refund-check/runs/20261007T100241303Z-f2a100b9)
```

`ci` runs every check of the tier in plan order, even after one fails, so the evidence is complete.
It passes each stage's exit through unchanged and computes no verdict of its own: eval-quality's exits and its evidence decide.
The final exit is the most severe blocking result, in this order: 64, 12, 5, 4, 3, 13, 11, 10, 2, 1, then 0.

### 4. Read the Evidence

`ci` writes `runs/<invocationId>/` in the evaluation folder:

- `ci.json` holds the tier, each check's exit, class and enforcement, its warnings and the final exit
- `checks/<id>/exit-code`, `stdout` and `stderr` hold what each check printed
- `replay/` holds the engine's preflight verdict and the scores of the replay

With a `partitionPlan`, the `compile` and `seal` checks run over each view: the development view, the held-out view and the both view.
The development view writes its files under `checks/<id>/`, and the held-out and both views write the same file names under `checks/<id>/held-out/` and `checks/<id>/both/`.
The check's output names each view and its exit, and a held-out plan the engine refuses fails the pull request that wrote it.
What the engine said about the held-out or both view stays in that view's `engine.json`, so the console summary and the development files carry no held-out ID.

Open `ci.json` first.
A failing check names its exit, and the [exit table](/docs/reference/tea-evaluate-cli.md#exit-codes) says what each exit means.

### 5. Know What a Stale Baseline Does

The baseline records the digests of the compiled contract, the corpus, the scoring policy and the strength floors.
When one of them differs from the baseline's, the `pr` tier warns and the `release` tier exits 11 until you accept a re-recorded baseline through a pull request.
The replay still runs against the baseline's own snapshot, so a stale baseline warns without hiding a real drift.

An evaluation that no longer reproduces its baseline exits 13.
Run the evaluation again, read what changed with `compare`, and accept the new baseline in a reviewed commit.

### 6. Render the Plan Into Your Pipeline

Run `bmad-testarch-framework` with CI scope in Create or Edit. The `bmad-testarch-ci` command also works with the same operation.
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
