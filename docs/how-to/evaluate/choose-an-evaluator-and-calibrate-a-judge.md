---
title: 'How to Choose an Evaluator and Calibrate a Judge with TEA'
description: Pick the evaluation layer that reads your target's output and prove that a rubric judge scores the way you label
---

# How to Choose an Evaluator and Calibrate a Judge with TEA

Ask Evaluate in your coding agent how to judge the target's output: built-in checks, your own command, an agent, or records from your harness.
Confirm the evaluator choice and label example answers if the contract uses a rubric.
The skill sets up the evaluator and checks the judge's scores against those labels before a run can proceed.
The files and commands below show what your agent normally handles and let you repeat its work.

The evaluator reads what the target produced; eval-quality turns its judgments into a verdict.

## When to Use This

- Your oracles are checks over exit codes, output text or response bodies and you want the simplest layer
- You already own code or a framework that grades your target's output
- A behavior needs a scale such as "names exactly one verdict" and a judge must apply it
- A run stopped with `judge calibration agreement fell below` and exit 11

## Prerequisites

- An evaluation folder whose contract, oracles and registry pass `check` and `preflight`
- The Evaluate skill, to author the files below with you
- For a model judge or a sealed-brief agent: the model's immutable provider ID and its credentials

## Steps

### 1. Choose the Evaluator Kind

`evaluation.json` names the layer in `evaluator.kind`.
A folder that names none uses `deterministic`.

| Kind                 | Who judges                                                                | Needs a model           | Choose it when                                                    |
| -------------------- | ------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------- |
| `deterministic`      | TeA resolves the contract's checks over the captured observations         | Only for a rubric judge | Every oracle is a check over a channel, and you want a `pr` tier  |
| `command`            | Your executable reads the sealed brief and observations and prints rows   | Optional                | You own grading code or wrap a framework such as AgentEvals       |
| `sealed-brief-agent` | An agent chooses its own calls through TeA's bridge and judges the result | Yes                     | Judging needs an agent that explores the target                   |
| `records`            | Your own harness runs the target and seals the records                    | Depends on the harness  | You already run the target in a harness and want its records kept |

Start the Evaluate skill and ask it to choose with you:

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-evaluate`
- **Codex:** `$bmad-testarch-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

```text
Choose the evaluator for evals/refund-review.
```

The skill weighs what evidence you need, whether a model must judge it, and whether the choice fits your CI schedule and budget.
It records the reasons next to the folder.

### 2. Review the Evaluator Setup

The skill records the choice in `evaluation.json` and runs `check` to catch missing files or conflicting settings.
A `command` evaluator names the grading program, a sealed-brief agent names its model, and a `records` evaluator names the output from your own harness.
Confirm that the selected program, model or records folder is the one you intend to use.

A `command` evaluator that wraps a framework follows [How to Bring an Existing Suite](/docs/how-to/evaluate/bring-an-existing-suite.md).
[The evaluation layer](/docs/reference/tea-evaluate-cli.md#the-evaluation-layer) lists the fields for each kind.

Rerun `preflight` after the change, then run and score one clean control and one seeded defect.
Rely on the layer once eval-quality reads the control as `passed-clean-control` and the defect as `caught`.

### 3. Review the Rubric Judge

A contract scores a judgment with a rubric.
Each criterion names the evidence it reads, and each scale level carries an anchor that says what earns it:

```json
{
  "id": "R-101",
  "scaleLevels": [
    { "level": 0, "anchor": "stdout names no verdict, or names more than one." },
    { "level": 1, "anchor": "stdout names exactly one verdict, accepted or rejected." }
  ],
  "failureModePenalties": [{ "name": "verdict-hedged", "description": "stdout names two verdicts, which scores as naming none." }],
  "maxLength": 200,
  "criteria": [{ "id": "RC-101", "text": "Does the answer name the one verdict it reached?", "evidence": "/interactions/judge-run/stdout" }]
}
```

With the `deterministic` evaluator, confirm the model and the minimum agreement it must reach:

```json
{
  "judge": { "agent": "claude", "model": "claude-sonnet-5-5", "timeoutMs": 120000 },
  "judgeCalibration": { "minimumAgreement": 0.9 }
}
```

Use an immutable model ID when the provider offers one, so later runs use the same model.
The skill records that ID with the evaluation and checks that the recorded value matches the model it runs.
[The rubric judge](/docs/reference/tea-evaluate-cli.md#the-rubric-judge) explains the configuration.

### 4. Label the Calibration Examples

You label responses with the level each deserves in `policy/judge-calibration.json`.
Write at least one example for every anchored level of every criterion, including the failing ones:

```json
{
  "items": [
    { "rubricId": "R-101", "criterionId": "RC-101", "response": "verdict: accepted", "expectedLevel": 1 },
    { "rubricId": "R-101", "criterionId": "RC-101", "response": "verdict: rejected", "expectedLevel": 1 },
    { "rubricId": "R-101", "criterionId": "RC-101", "response": "verdict: accepted and rejected", "expectedLevel": 0 },
    { "rubricId": "R-101", "criterionId": "RC-101", "response": "no verdict here", "expectedLevel": 0 }
  ]
}
```

The judge receives each response without its `expectedLevel`.

### 5. Run and Read the Calibration

```bash
npm exec --prefix evals -- tea-evaluate run --evaluation evals/verdict-mutation
```

`run` sends every example through the judge before it records a single trial.
When agreement falls below your minimum, `run` stops with exit 11:

```text
tea-evaluate run: judge calibration agreement fell below 0.9; see judge-calibration.json (exit 11, /work/app/evals/verdict-mutation/runs/20261007T091256520Z-703c4c1e)
```

`judge-calibration.json` shows which examples disagreed with your labels.
In this example, a stand-in judge gives the highest level to every answer.
It matches two of four labels, so its agreement is 0.5 against a required 0.9.

Read the items that disagree.
Each one has a cause you can repair:

- The anchors do not separate the levels.
  Ask the skill to sharpen them, then rerun.
- A label is wrong.
  Correct the label with the skill and rerun.
- The judge model is too weak for the scale.
  Choose a stronger model and ask the skill to update the recorded ID before rerunning.

The calibration file's digest and the minimum agreement join the evaluator configuration, so changing either changes the scoring version.
A lower `minimumAgreement` accepts a judge that disagrees more often, so lower it only after you decide the labels were too strict.

When the judge meets the minimum, `run` continues into the trials.

## How You Know It Worked

- `check` prints `has no authoring defects` for the chosen kind
- `run` passes calibration and exits 0
- `judge-calibration.json` in the run folder shows an agreement at or above your minimum for every criterion
- The known pass reads `passed-clean-control` and the known defect reads `caught` after `score`

## Related Guides

- [How to Bring an Existing Suite](/docs/how-to/evaluate/bring-an-existing-suite.md): Wrap AgentEvals, promptfoo or another framework in a `command` evaluator
- [How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md): Interpret a weak result after scoring
- [How to Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md): The full first run

## Reference

- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md): Every command, option and exit code
- [run](/docs/reference/tea-evaluate-cli.md#run)
- [Exit codes](/docs/reference/tea-evaluate-cli.md#exit-codes)
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): Why judges are calibrated and what held-out probes add
