---
title: 'How to Compare Runs and Accept a Baseline with TEA'
description: Compare a scored run with the accepted baseline, read the three outcomes and accept a new baseline through a reviewed pull request
---

# How to Compare Runs and Accept a Baseline with TEA

Ask Evaluate to compare a scored run with the baseline you previously accepted.
It shows whether the evaluation got stronger, weaker, or changed too much for a fair comparison.
You review the result, decide whether to accept a new baseline, and commit it in a reviewed pull request so CI can replay it.
The commands below show what your agent normally runs and let you repeat the comparison.

## When to Use This

- You scored a run and want to know how it relates to the accepted result
- The evaluation has no baseline yet and you want to accept the first one
- You changed the target, the corpus, the contract or the scoring policy and want to record the new result
- `compare` printed `refused` and you need to know why

## Prerequisites

- A run that completed and was scored, as [How to Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md) describes
- A git repository that tracks the evaluation folder, since `baseline/` enters through a commit
- The commit that holds the change you measured

## Steps

### 1. Compare the Most Recent Run

```bash
npm exec --prefix evals -- tea-evaluate compare --evaluation evals/grader-tool-server
```

`compare` reads the evidence of the run's latest score invocation and of the baseline, then prints one of three outcomes.
Each outcome exits 0.
Add `--run <invocationId>` to compare an older run.

### 2. Read the Outcome

`compare` prints one of three outcomes:

| Outcome     | What to do next                                                                      |
| ----------- | ------------------------------------------------------------------------------------ |
| `first-run` | Review the scored run before accepting the first baseline.                           |
| `compared`  | Read the relation for each probe and investigate any regression.                     |
| `refused`   | Review what changed in the evaluation, then decide whether to accept a new baseline. |

For a `compared` result, eval-quality uses `a` for the baseline and `b` for the new run:

| Relation        | Meaning                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| `equivalent`    | The strength vectors are equal                                               |
| `a-dominates-b` | The baseline is at least as strong in every class and stronger in one        |
| `b-dominates-a` | The run is at least as strong in every class and stronger in one             |
| `incomparable`  | Neither side dominates the other, or the evidence cannot decide between them |

A clean control carries no strength vector, so it compares `incomparable` with itself.
Read an `a-dominates-b` line as a regression and find what changed before you accept anything.

For a `refused` result, the message names the change that prevents comparison, such as:

- the partitions differ, such as a held-out run against a baseline accepted from a full run
- the probe sets differ
- a probe's `comparabilityKey` differs, because the scoring policy, the probe set or the corpus changed
- `evalQualityVersion` differs, because a different eval-quality release scored the baseline

Confirm that the new setup is intended before accepting its run as the baseline.

### 3. Accept a Baseline

Check out the commit that holds the change you measured, run and score it, then accept:

```bash
npm exec --prefix evals -- tea-evaluate run --evaluation evals/grader-tool-server
npm exec --prefix evals -- tea-evaluate score --evaluation evals/grader-tool-server
npm exec --prefix evals -- tea-evaluate compare --evaluation evals/grader-tool-server --accept
```

`--accept` replaces `baseline/` with a byte-identical snapshot of the run.
Review and commit the new `baseline/` folder with the change it measures.
Another `run` over an uncommitted `baseline/` records `"dirty": true` in its `run.json`, and the accept refuses a dirty run.

Open a pull request that carries `baseline/` together with the change that moved the target, the corpus, the contract, the policy or the engine.
The reviewer reads the baseline diff next to the cause of every difference.

### 4. Know When an Accept Is Refused

`--accept` refuses a run measured over uncommitted work.
Commit the change, rerun and score it, then accept that run.

A baseline edited by hand fails too.
Restore the file from git, or accept a new run.
[The `compare` reference](/docs/reference/tea-evaluate-cli.md#compare) has the exact refusal messages and acceptance rules.

## How You Know It Worked

- `compare` prints `compared`, and no probe reads `a-dominates-b`
- After an accept, the output says `is the baseline` and `git status` shows `baseline/` as the only new path
- The next `run` records `"dirty": false` once you commit `baseline/`
- `check` prints `has no authoring defects`, which includes the baseline's digests

## Related Guides

- [How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md): Repair a weak run before you accept it
- [How to Put an Evaluation in CI](/docs/how-to/evaluate/put-an-evaluation-in-ci.md): Replay the baseline on every pull request
- [How to Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md): Produce the run to compare

## Reference

- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md): Every command, option and exit code
- [compare](/docs/reference/tea-evaluate-cli.md#compare)
- [ci](/docs/reference/tea-evaluate-cli.md#ci)
- [Exit codes](/docs/reference/tea-evaluate-cli.md#exit-codes)
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): Why a baseline enters only through review
