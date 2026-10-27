---
title: 'How to Put an Evaluation in CI with TEA'
description: Let Evaluate write the CI plan, run its pull request tier, read the evidence and render the plan into your pipeline with the Framework skill's CI phase
---

# How to Put an Evaluation in CI with TEA

**Bottom line:** Use this guide to place an evaluation with an accepted baseline into CI. Ask Evaluate to design and test the tiers, then use the Framework skill's CI phase to apply the approved plan. You approve schedule, cost, credentials, and shipping gates. Model-free pull-request checks reproduce accepted evidence; they do not freshly evaluate the changed target. Live checks belong on suitable trusted events.

## Start with the Evaluate Skill

Use this guide when your evaluation has a scored run and a reviewed, accepted baseline. If it does not, start with [Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md).

Start or resume Evaluate:

- **Claude Code / Cursor / Windsurf:** `/bmad-tea-evaluate`
- **Codex:** `$bmad-tea-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

```text
Plan CI for evals/refund-check using this repository's existing workflows.
Keep pull request checks model-free. Show me the live-run cost,
credential requirements, schedule and publish or deploy jobs to gate.
Test the plan before handing it to Framework with CI scope.
```

The skill inspects your workflows and release process, writes `ci/evaluation-ci-plan.json` and aligns `tiers` in `evaluation.json`. The CLI runs the plan. The Framework skill edits the pipeline. A plan file alone creates no scheduled job or shipping gate.

Your CI runner needs Node.js 22.20 or later and the evaluation tooling declared in `evals/package.json`. Evaluate’s setup installs the TeA CLI and its `eval-quality` scoring engine there, separately from your application’s dependencies. You invoke `tea-evaluate`; it calls `eval-quality` internally. Commit `evals/package.json` and `evals/package-lock.json`, then install the locked dependencies in CI with `npm ci --prefix evals`, including development dependencies. `evals` is the default folder name; substitute the configured evaluations folder if different. See [Prerequisites](/docs/reference/tea-evaluate-cli.md#prerequisites).

## 1. Choose When Each Check Should Run

Review the skill's placements against the repository's actual events, required checks and release flow. It should explain each choice using a workflow file or an answer you supplied.

| Tier        | What it establishes                                                                                  | Typical checks                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pr`        | Current authoring is valid and accepted evidence still reproduces, without new target or model calls | `check`, `compile`, `seal`, `replay`, `oracle-agreement`; `gameability` when applicable; `api-conformance` for HTTP targets |
| `merge`     | The real target still satisfies preflight, when it needs no secret                                   | `preflight-live`                                                                                                            |
| `scheduled` | Fresh trial evidence, held-out performance and comparison with the baseline                          | `twin-run`, `held-out`, `strength-comparison`; `judge-calibration` for rubrics; secret-dependent `preflight-live`           |
| `release`   | Fresh evidence before shipping, with blocking strength floors and baseline freshness                 | The applicable live checks                                                                                                  |

These are starting placements. Keep the deterministic set on `pr`; the runtime rejects live checks there. A target with secrets, or any skill or agent runner, places live preflight on `scheduled` and `release`. With no justified schedule, put the live set on the release event and record why.

A model-free grader does not make an LLM target model-free. Likewise, `evaluator.kind: deterministic` can use a separate model judge for a rubric. Decide placement from the complete execution path.

A tier runs only its own checks. Invoking `ci --tier release` does not also run `pr`. The rendered merge job runs the `pr` step before its `merge` step; review the full pipeline rather than assuming tiers inherit one another.

## 2. Approve the Live Run's Cost and Access

Before enabling a schedule or release job, confirm:

- **Cost and duration:** Account for preflight, clean and mutated arms, repeated trials, held-out probes, calibration and any evaluator qualification. Measure a representative run; trial count times probe count alone can understate the work. Choose a cadence and job timeout you can support.
- **Models and versions:** Keep target, evaluator and judge model selections and recorded snapshots consistent. Pin dependency versions. An alias can change behind the same name.
- **Credentials:** Give each live job only the keys its target and evaluator need. Keep values in CI secrets, not the plan or committed files. Framework reports required credentials; it does not provision them.
- **Runner capabilities:** Verify confinement on the intended runner. Linux live execution needs working Bubblewrap and `strace`, including the required namespaces and ptrace support. Networked targets also need the registry's egress authorization. A package being installed does not prove the runner permits it; see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement).

Keep privileged credentials away from untrusted pull request code. Review fork behavior, workflow permissions and protected environments before enabling live jobs. Do not disable confinement merely to make CI green. The plan places work; it is not a dollar-spend limiter or a substitute for your platform's access controls.

## 3. Validate and Try the Plan

Ask the skill to run these commands, or repeat them yourself from the repository root:

```bash
npm exec --prefix evals -- tea-evaluate check --evaluation evals/refund-check
npm exec --prefix evals -- tea-evaluate ci --evaluation evals/refund-check --tier pr
```

Replace the folder with your own. Stop and repair authoring findings before the tier run. `check` catches invalid placements, missing reasons, incompatible triggers and a `tiers` list that disagrees with the plan.

An exit of 0 from `ci` means there was no blocking result. Warnings can still exist. Read the check-by-check summary and evidence before accepting the plan.

Run each live tier on a machine with its target, dependencies and authorized credentials. For example:

```bash
npm exec --prefix evals -- tea-evaluate ci --evaluation evals/refund-check --tier scheduled
```

Only run a tier the plan defines. Record any tier you could not test and why; a successful local `pr` run does not verify the live runner or its credentials.

## 4. Read the Evidence and Decide What to Fix

Open `runs/<invocationId>/ci.json` first. It records the tier, every check's exit and action, warnings and the final exit. Then follow:

- `checks/<id>/exit-code`, `stdout` and `stderr` for individual checks
- `replay/` for replayed preflight and score evidence
- The live run directories named by the checks for fresh trial and score evidence

`ci` continues through the tier's checks after a failure so you can inspect the full result. It enforces stage exits and eval-quality evidence rather than inventing a new verdict.

Distinguish these cases:

- **Replay drift, exit 13:** Replaying the baseline no longer reproduces its saved evidence. Investigate the difference.
- **Stale baseline:** Current contract, corpus, scoring policy or strength floors differ from the accepted snapshot. This warns on `pr` and blocks `release` with exit 11. Replay still uses the baseline's own snapshot.
- **Weak live strength:** A class below its floor warns on `scheduled` and blocks `release` with exit 2. A strength regression reported by `strength-comparison` warns on both tiers.
- **CONCERNS:** The scored verdict is a warning, including on release. A zero CI exit therefore does not necessarily mean every contract verdict is PASS.
- **Invalid score evidence, exit 3:** Repair integrity or isolation before interpreting it. Invalid evidence cannot establish target behavior.
- **Setup or execution failure:** Missing baselines, authoring defects and infrastructure failures need their own repair. They do not establish a target defect. Use the [exit table](/docs/reference/tea-evaluate-cli.md#exit-codes).

After an intentional change, run and score fresh evidence, inspect `compare`, and approve any replacement baseline in a reviewed change. Do not make `compare --accept` an automatic step that clears a red pipeline.

## 5. Apply and Verify the Pipeline

Ask your coding agent to run `bmad-tea-framework` with **CI scope**, in Edit mode for an existing pipeline or Create mode for a new one. Name the plan and the workflow containing the publish or deploy job you want gated.

Review the generated diff. It should:

1. Install the evaluation dependencies and invoke `tea-evaluate ci --evaluation <folder> --tier <tier>` for each planned tier.
2. Match jobs to the intended pull request, merge, schedule, release and manual events.
3. Upload the evaluation folder's `runs/` after success or failure, using `if: always()` on GitHub Actions. Keep access appropriate for captured target output and held-out evidence.
4. Make each approved `gates` job wait for the relevant evaluation job. A parallel evaluation job does not stop publishing unless that dependency exists.

The renderer reports missing job names or gates it cannot safely apply. Resolve those reports instead of treating the plan's `gates` field as proof of enforcement. Confirm required checks in the CI platform's settings too; workflow files alone do not establish branch protection.

Verify the first real pipeline run, including a controlled blocking case: the evidence must remain downloadable, the required check must block as intended, and a gated publish or deploy job must not proceed. See [Evaluation Plans](/docs/how-to/workflows/setup-test-framework.md#evaluation-plans) for rendering rules and [Framework CI Setup](/docs/how-to/workflows/setup-test-framework.md#ci-setup) for the workflow.

## Related

- [Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md)
- [The `ci` command reference](/docs/reference/tea-evaluate-cli.md#ci)
- [The plan reference](/docs/reference/tea-evaluate-cli.md#the-plan)
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md)
