---
title: 'How to Evaluate a Skill or Agent with TEA'
description: Prove that a skill or an agent behaves as you require, from the Evaluate conversation to a scored run
---

# How to Evaluate a Skill or Agent with TEA

Use the Evaluate skill to get a repeatable score for a skill or an agent.
Evaluate runs the target in disposable copies of your project, plants known defects, and records whether the evaluation catches them.
The tutorial [Evaluate Your First Skill](/docs/tutorials/evaluate-your-first-skill.md) teaches the whole path once.
This page covers what changes for your own target.

## When to Use This

- You wrote a skill and want proof that it follows its own instructions
- You run an agent from a command line and want proof that it makes the right decisions
- You changed a prompt or a rule file and want to know whether the behavior moved

## Prerequisites

- Node.js 22.20 or later
- A host that can confine processes: macOS with `sandbox-exec` and `log stream`, or Linux with Bubblewrap (`bwrap`) and `strace`.
  A host with neither stops `preflight` and `run` with exit 12 and names what is missing.
- For an agent that calls a model: the name of its credential variable and, on Linux, the hosts it connects to

## Steps

### 1. Start the Evaluate Skill

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-evaluate`
- **Codex:** `$bmad-testarch-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

Full invocation rules: [Invoking a TEA Workflow](/docs/reference/commands.md#invoking-a-tea-workflow).

Tell the skill what to evaluate, for example:

```text
Evaluate the skill in skills/refund-review.
```

The skill inspects the target first.
It reads the entry points, the documented promises, the existing tests and the failure history, then classifies the target.
A skill runs through the generic `tea-skill-runner` command.
An agent runs through its own non-interactive command, or through `tea-skill-runner` when it has none.
When a description fits two kinds, the skill asks which behavior you want proven.

The skill then asks six questions that inspection cannot answer:

1. Which decisions matter most
2. Which outputs count as proof
3. Which commands, endpoints and files are in scope
4. Where the behavior changes at a boundary
5. Which time, budget and secret limits apply
6. Which failures happened or would hurt most

It writes your answers as a requirements statement and stops until you confirm it.
The confirmed text becomes `requirements.md`, and the skill records its digest in `evaluation.json`.

After confirmation the skill designs the probes, authors the contract and the oracles, and writes the target entry.
It installs the private package that provides `tea-evaluate`:

```bash
npm install --prefix evals
```

Every evaluation folder lives under `evals/` by default:

```text
evals/stub-skill-preflight/
  evaluation.json
  requirements.md
  contract.json
  probes/P-001.probe.json
  policy/evaluator-conditions.json
  corpus-index.json
```

Evaluations with seeded defects add `mutations/` and `policy/scoring-policy.json`.

### 2. Read the Target Entry the Skill Wrote

The `registry` in `evaluation.json` lists every command a run may start.
A skill target registers the generic runner and names the skill in `launch.skillRoot`:

```json
{
  "interfaceId": "stub-skill",
  "executable": "tea-skill-runner",
  "target": "tea-skill-runner",
  "subcommandPaths": [[]],
  "artifacts": {},
  "environmentKeys": [],
  "maxElapsedMs": 160000,
  "infrastructureExitCodes": [3, 4, 5, 6]
}
```

```json
{ "launch": { "root": "../stub-agent", "skillRoot": "skill" } }
```

An agent target registers the agent's own command, which must print what the oracles read and exit with an infrastructure code when it cannot run:

```json
{
  "interfaceId": "calling-agent",
  "executable": "calling-agent",
  "target": "bin/calling-agent.js",
  "subcommandPaths": [[]],
  "artifacts": {},
  "environmentKeys": [],
  "maxElapsedMs": 30000,
  "infrastructureExitCodes": [3]
}
```

The registry is a default-deny list.
A request for an executable, interface or tool that no entry carries is denied before anything starts.

The two examples above come from repository fixtures that call no model.
For a real agent, three entries change:

- `environmentKeys` lists the credential variable names the agent needs.
  The run passes their host values.
- `egress` lists each host, port and resolved address the agent may reach.
  Linux enforces it, and macOS ignores it.
- The contract's interaction plan names the agent adapter that `tea-skill-runner` starts, such as `claude`.

### 3. Check the Folder

```bash
npm exec --prefix evals -- tea-evaluate check --evaluation evals/stub-skill-preflight
```

```text
tea-evaluate check: /work/app/evals/stub-skill-preflight has no authoring defects
```

`check` exits 10 and lists every defect it finds, one line each.
Fix them and run `check` again before anything else.
The [reference](/docs/reference/tea-evaluate-cli.md#check) lists what `check` validates.

### 4. Preflight the Target

```bash
npm exec --prefix evals -- tea-evaluate preflight --evaluation evals/stub-skill-preflight
```

```text
tea-evaluate preflight: leg "witness-alpha": observed
tea-evaluate preflight: leg "witness-beta": observed
tea-evaluate preflight: leg "preflight-control-observe": observed
tea-evaluate preflight: leg "preflight-control-observe-2": observed
tea-evaluate preflight: eval-quality preflight exited 0; its verdict and diagnostics are in runs/20261007T090439399Z-e34f634f (exit 0, /work/app/evals/stub-skill-preflight/runs/20261007T090439399Z-e34f634f)
```

Preflight launches the real target in a confined disposable copy.
It sends two different requests to prove the output depends on the input, then sends the clean request twice to prove the starting state resets.
Exit 0 means the registry reaches the target and the clean control passes.

Always start `tea-evaluate` through `npm exec --prefix evals --`.
That puts `tea-skill-runner` on the target's `PATH`.
Without it the preflight exits 3, and the leg's observation names the cause:

```text
tea-evaluate preflight: eval-quality preflight exited 3; its verdict and diagnostics are in runs/20261007T090422506Z-d6fd4218 (exit 3, /work/app/evals/stub-skill-preflight/runs/20261007T090422506Z-d6fd4218)
```

```text
sandbox-exec: execvp() of 'tea-skill-runner' failed: No such file or directory
```

The second block is the `stderr` of the first leg in `runs/<invocationId>/observations/001-witness-alpha.json`.

### 5. Run and Score

```bash
npm exec --prefix evals -- tea-evaluate run --evaluation evals/calling-agent-tool-use
npm exec --prefix evals -- tea-evaluate score --evaluation evals/calling-agent-tool-use
```

`run` repeats the preflight, qualifies each seeded defect, then runs every arm as a set of trials in fresh copies:

```text
tea-evaluate run: probes/P-002.probe.json: qualified; the restored digest matched and the baseline passed again
tea-evaluate run: probes/P-001.probe.json: qualified; its baseline passed
tea-evaluate run: clean: trial 1 of 3
tea-evaluate run: clean: trial 2 of 3
tea-evaluate run: clean: trial 3 of 3
tea-evaluate run: mutated:M-001: trial 1 of 3
tea-evaluate run: mutated:M-001: trial 2 of 3
tea-evaluate run: mutated:M-001: trial 3 of 3
tea-evaluate run: 2 trial set(s) of 3 trial(s) sealed over clean, mutated:M-001; score them with tea-evaluate score --run 20261007T091518964Z-9cec058c (exit 0, /work/app/evals/calling-agent-tool-use/runs/20261007T091518964Z-9cec058c)
```

`score` hands each probe to eval-quality and prints its exit:

```text
tea-evaluate score: P-001: eval-quality score exited 0
tea-evaluate score: P-002: eval-quality score exited 0
tea-evaluate score: strength aggregate: eval-quality aggregate-strength exited 0
```

The agent in this fixture has one rule file, `rules/tool.json`, that names the tool it calls.
The seeded defect `M-001` changes that name.
The evaluator in this folder is AgentEvals, so the folder's dependencies must be installed, as [Bring an Existing Suite](/docs/how-to/evaluate/bring-an-existing-suite.md) describes.

### 6. Read the Run

Both commands exit 0 for a PASS, a WAIVED or a CONCERNS verdict.
Read the verdict and the outcome states from the evidence artifacts in the score invocation folder:

```bash
cd evals/calling-agent-tool-use/runs/20261007T091518964Z-9cec058c/scores/20261007T091525229Z-3e5aae16
grep -o '"contractVerdict":"[A-Z]*"' P-*/evidence-artifact.json
grep -o '"state":"[a-z-]*"' P-001/evidence-artifact.json | sort -u
grep -o '"state":"[a-z-]*"' P-002/evidence-artifact.json | sort -u
```

```text
P-001/evidence-artifact.json:"contractVerdict":"CONCERNS"
P-002/evidence-artifact.json:"contractVerdict":"CONCERNS"
"state":"passed-clean-control"
"state":"caught"
```

The clean control reads `passed-clean-control` and the seeded defect reads `caught`.
The CONCERNS verdict lists coverage gaps that still need probes.
[How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md) shows how to close them.

Then read what the run executed under:

```bash
grep '"confinement"\|"egress"' ../../run.json
```

```text
  "confinement": "seatbelt",
  "egress": [],
```

`confinement` is `seatbelt` on macOS, `bubblewrap` on Linux, or `opt-out` when `evaluation.json` sets `"confinement": false`.
Only a `bubblewrap` run holds an agent to its `egress` list.

## If `score` Exits 3 With `mount outside allowlist`

A confined target may read the host except for the evaluation folder.
The audit lists each path it read outside what the trial was granted:

```text
tea-evaluate score: P-001: eval-quality score exited 3
tea-evaluate score: P-001: eval-quality: invalid: isolation manifest violation: mount outside allowlist: <home>/app/node_modules/commander/lib/command.js
tea-evaluate score: strength aggregate: no evidence artifact was copied for P-001, so no class-wide strength is aggregated
```

Executing a tool reads its files, so a runner or toolchain outside the project appears here.
Add each directory the lines name to `systemPaths` on the registry entry that starts the target, using the narrowest directory that holds it:

```json
{ "systemPaths": ["/work/app/node_modules/commander", "/work/app/package.json"] }
```

A path you did not expect, such as a credential file or another project, points to a target that reads beyond its task.
Repair the target, because declaring that path would hide the defect.
Then run `check` and run the evaluation again.

## How You Know It Worked

- `check` prints `has no authoring defects`
- `preflight` exits 0
- `run` exits 0 and prints the `sealed over` line
- `score` exits 0, the clean control reads `passed-clean-control` and each seeded defect reads `caught`
- `run.json` names the confinement you expect

## Related Guides

- [How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md): Close the coverage gaps a run reports
- [How to Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md): Keep an accepted result to compare later runs against
- [How to Choose an Evaluator and Calibrate a Judge](/docs/how-to/evaluate/choose-an-evaluator-and-calibrate-a-judge.md): Pick the layer that reads the target's output

## Reference

- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md): Every command, option and exit code
- [Exit codes](/docs/reference/tea-evaluate-cli.md#exit-codes)
- [File-system confinement](/docs/reference/tea-evaluate-cli.md#file-system-confinement)
- [The evaluation folder](/docs/reference/tea-evaluate-cli.md#the-evaluation-folder)
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): Why runs are confined and scored this way
