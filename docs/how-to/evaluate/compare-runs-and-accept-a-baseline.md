---
title: 'How to Compare Runs and Accept a Baseline with TEA'
description: Compare a scored run with the accepted baseline, read the three outcomes and accept a new baseline through a reviewed pull request
---

# How to Compare Runs and Accept a Baseline with TEA

Use `tea-evaluate compare` to set a scored run beside the baseline you accepted earlier.
The baseline is the committed record of a run you reviewed.
CI replays it to prove the evaluation still reproduces, and a later run compares against it to show whether the target got stronger or weaker.

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

#### `first-run`

The folder holds no `baseline/`:

```text
tea-evaluate compare: comparing run 20261007T091652474Z-2e1d4685
tea-evaluate compare: first-run: baseline/ holds no baseline to compare run 20261007T091652474Z-2e1d4685 with; accept it with tea-evaluate compare --accept (exit 0, /work/app/evals/grader-tool-server/runs/20261007T091652474Z-2e1d4685)
```

Review the run, then accept it in step 3.

#### `compared`

The baseline and the run measure the same thing, and `compare` prints one line per probe:

```text
tea-evaluate compare: comparing run 20261007T091703186Z-e2a944af
P-001: incomparable (a is the baseline, b is run 20261007T091703186Z-e2a944af)
P-002: equivalent (a is the baseline, b is run 20261007T091703186Z-e2a944af)
tea-evaluate compare: compared: 2 probe(s) of run 20261007T091703186Z-e2a944af with the baseline of run 20261007T091652474Z-2e1d4685 (exit 0, /work/app/evals/grader-tool-server/runs/20261007T091703186Z-e2a944af)
```

The relation comes from eval-quality, with the baseline as `a` and the run as `b`:

| Relation        | Meaning                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| `equivalent`    | The strength vectors are equal                                               |
| `a-dominates-b` | The baseline is at least as strong in every class and stronger in one        |
| `b-dominates-a` | The run is at least as strong in every class and stronger in one             |
| `incomparable`  | Neither side dominates the other, or the evidence cannot decide between them |

A clean control carries no strength vector, so it compares `incomparable` with itself.
That is the expected line for `P-001`.
Read an `a-dominates-b` line as a regression and find what changed before you accept anything.

#### `refused`

The two sides do not measure the same thing, so no relation between them would mean anything.
Changing `catchThreshold` in `policy/scoring-policy.json` and running again produces:

```text
tea-evaluate compare: comparing run 20261007T091707337Z-7cb6ab11
tea-evaluate compare: refused: probe P-001: comparabilityKey differs (sha256:72e6deef...f2c2 vs sha256:a4ce6908...c4f6): the two results do not measure the same scoring policy and probe set, so no relation between them is meaningful; probe P-002: comparabilityKey differs (sha256:c43ee147...7b2f vs sha256:31979267...6edf): the two results do not measure the same scoring policy and probe set, so no relation between them is meaningful (exit 0, /work/app/evals/grader-tool-server/runs/20261007T091707337Z-7cb6ab11)
```

The reason names the cause.
A run is refused when:

- the partitions differ, such as a held-out run against a baseline accepted from a full run
- the probe sets differ
- a probe's `comparabilityKey` differs, because the scoring policy, the probe set or the corpus changed
- `evalQualityVersion` differs, because a different eval-quality release scored the baseline

For each cause the answer is the same.
Decide that the new setup is the intended one, then accept the new run as the baseline in step 3.

### 3. Accept a Baseline

Check out the commit that holds the change you measured, run and score it, then accept:

```bash
npm exec --prefix evals -- tea-evaluate run --evaluation evals/grader-tool-server
npm exec --prefix evals -- tea-evaluate score --evaluation evals/grader-tool-server
npm exec --prefix evals -- tea-evaluate compare --evaluation evals/grader-tool-server --accept
```

```text
tea-evaluate compare: accepting run 20261007T091652474Z-2e1d4685
tea-evaluate compare: accepted: run 20261007T091652474Z-2e1d4685 (score invocation 20261007T091655530Z-5568ed59) is the baseline, 45 file(s) under baseline/ (exit 0, /work/app/evals/grader-tool-server/runs/20261007T091652474Z-2e1d4685)
```

`--accept` replaces `baseline/` with a byte-identical snapshot of the run.
It is the only command that writes there.
`baseline/baseline.json` is the manifest.
It names the accepted run, its score invocation, the partition, the eval-quality version and the digests of the corpus, the contract and the policy.

The new folder is untracked:

```bash
git status --short
```

```text
?? evals/grader-tool-server/baseline/
```

Commit it before anything else.
Another `run` over an uncommitted `baseline/` records `"dirty": true` in its `run.json`, and the accept refuses a dirty run.

Open a pull request that carries `baseline/` together with the change that moved the target, the corpus, the contract, the policy or the engine.
The reviewer reads the baseline diff next to the cause of every difference.

### 4. Know When an Accept Is Refused

`--accept` refuses a run measured over uncommitted work.
After `run --from-working-tree` over a local edit, the accept exits 10 and writes nothing:

```text
tea-evaluate compare: accepting run 20261007T091711743Z-75ac0996
run.json: [dirty] records dirty true; a run measured over uncommitted work is never accepted as a baseline
tea-evaluate compare: run 20261007T091711743Z-75ac0996 is dirty; nothing was written under baseline/ (exit 10, /work/app/evals/grader-tool-server/runs/20261007T091711743Z-75ac0996)
```

No flag overrides this.
Commit the change and run again.

A baseline edited by hand fails too.
After appending one space to `baseline/run.json`, `check` and `compare` both exit 10 before they read any evidence:

```text
baseline/run.json: [baseline-digest] digests to sha256:5e65d382ea9e19f8a807716882636abfd75ca06648195a37c9800cd2f9fc2492; baseline.json records sha256:c2476f76d454061cb24fcc707837b3b90b75eaf6f725ae0665bd53dc63755b74, so the file is not the one that was accepted
```

Restore the file from git, or accept a new run.

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
