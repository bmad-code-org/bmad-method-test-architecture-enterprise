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

The skill discusses determinism, whether a model runs, how much of the target's process you need to see, whether oracles compare with reference outputs, rubric needs, language fit, licence, version drift, cost per trial and the CI tier the evaluation belongs in.
It records the reasons next to the folder.

### 2. Declare the Kind

A `command` evaluator names its executable inside the folder:

```json
{
  "evaluator": {
    "kind": "command",
    "command": "evaluator/autoevals-exact.mjs",
    "timeoutMs": 30000,
    "environmentKeys": []
  }
}
```

A sealed-brief agent names its adapter:

```json
{ "evaluator": { "kind": "sealed-brief-agent", "agent": "claude", "model": "claude-sonnet-5-5", "timeoutMs": 30000 } }
```

`evaluator.model` selects the model the agent runs, and `evaluator.modelSnapshot` in `policy/evaluator-conditions.json` records it, so both hold the same immutable ID.
`check` exits 10 when they differ.

A records evaluator names the folder where your harness seals its records:

```json
{ "evaluator": { "kind": "records", "records": "sealed-records" } }
```

Run `check` after each change.
It lists what the chosen kind still needs.
For a sealed-brief agent without its files, `check` exits 10:

```text
evaluation.json: [evaluator] evaluation.json's evaluator is a sealed-brief agent, which chooses its own calls, and the file declares no evaluatorQualification (attempts and minimumAgreement); run qualifies the agent on each arm before its verdicts count
evaluator/mapping.json: [evaluator] evaluation.json's evaluator is sealed-brief-agent, whose judgment rows convert through evaluator/mapping.json, and the folder has none
policy/evaluator-conditions.json: [evaluator] evaluation.json's evaluator is a sealed-brief agent, and policy/evaluator-conditions.json names no evaluator.modelSnapshot, the model every evaluator call runs and every run records as a fixed condition
```

For a records evaluator without its folder, `check` exits 10:

```text
evaluation.json: [evaluator] evaluator.records names sealed-records, which is not a directory the evaluation folder holds, reached through no link; the records evaluator reads the harness's sealed records there
```

A `command` evaluator that wraps a framework follows [How to Bring an Existing Suite](/docs/how-to/evaluate/bring-an-existing-suite.md).

Rerun `preflight` after the change, then run and score one clean control and one seeded defect.
Rely on the layer once eval-quality reads the control as `passed-clean-control` and the defect as `caught`.

### 3. Declare the Rubric Judge

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

With the `deterministic` evaluator, `evaluation.json` wires the judge and the minimum agreement it must reach:

```json
{
  "judge": { "agent": "claude", "model": "claude-sonnet-5-5", "timeoutMs": 120000 },
  "judgeCalibration": { "minimumAgreement": 0.9 }
}
```

`policy/evaluator-conditions.json` records the model the judge runs as a fixed condition of every run:

```json
{
  "schemaVersion": 1,
  "modelSnapshot": "none",
  "systemPromptDigest": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "judge": { "modelSnapshot": "claude-sonnet-5-5" }
}
```

`judge.model` selects the model, and `judge.modelSnapshot` records which model that was, so both hold the same provider model ID.
Give an immutable ID such as `claude-sonnet-5-5`.
An alias such as `sonnet` follows the provider's current model, so the same scoring version can mean different weights over time.
Where an adapter's CLI offers only an alias, the alias is the most the run can record, and the scoring is as reproducible as the alias.
`check` exits 10 when `judge.modelSnapshot` differs from `judge.model`, and its finding names both values.

`check` refuses a `judge` block when the contract declares no rubric, and when the evaluator scores rubrics itself.

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

`runs/<invocationId>/judge-calibration.json` reports each criterion:

```json
{
  "minimumAgreement": 0.9,
  "criteria": [
    {
      "rubricId": "R-101",
      "criterionId": "RC-101",
      "agreement": 0.5,
      "largestLevelDistance": 1,
      "items": [
        { "expectedLevel": 1, "actualLevel": 1, "levelDistance": 0 },
        { "expectedLevel": 1, "actualLevel": 1, "levelDistance": 0 },
        { "expectedLevel": 0, "actualLevel": 1, "levelDistance": 1 },
        { "expectedLevel": 0, "actualLevel": 1, "levelDistance": 1 }
      ]
    }
  ]
}
```

This report came from a stand-in judge that answers the highest level every time.
Two of four items match, so agreement is 0.5.

Read the items that disagree.
Each one has a cause you can repair:

- The anchors do not separate the levels.
  Ask the skill to sharpen them, then rerun.
- A label is wrong.
  Correct the label with the skill and rerun.
- The judge model is too weak for the scale.
  Choose a stronger model, set its immutable ID in `judge.model` in `evaluation.json`, set the same ID in `judge.modelSnapshot` in `policy/evaluator-conditions.json` and rerun.
  Changing only `judge.modelSnapshot` records a model the judge does not run, and `check` refuses it.

The calibration file's digest and the minimum agreement join the evaluator configuration, so changing either changes the scoring version.
A lower `minimumAgreement` accepts a judge that disagrees more often, so lower it only after you decide the labels were too strict.

With a minimum the judge meets, `run` continues into the trials and exits 0:

```text
tea-evaluate run: 2 trial set(s) of 3 trial(s) sealed over clean, mutated:M-001; score them with tea-evaluate score --run 20261007T091454931Z-494fa0d8 (exit 0, /work/app/evals/verdict-mutation/runs/20261007T091454931Z-494fa0d8)
```

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
