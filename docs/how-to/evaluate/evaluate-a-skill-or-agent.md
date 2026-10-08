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
It installs the private package that provides `tea-evaluate` and the skill runner:

```bash
npm install --prefix evals
```

The install puts the runner at `evals/node_modules/.bin/tea-skill-runner`.
Every evaluation folder lives under `evals/` by default.
The example project below keeps its skill and its stand-in agent at the project root:

```text
app/
  skill/SKILL.md
  agent.js
  evals/
    node_modules/
    stub-skill-preflight/
      evaluation.json
      requirements.md
      contract.json
      probes/P-001.probe.json
      policy/evaluator-conditions.json
      policy/scoring-policy.json
      corpus-index.json
```

Evaluations with seeded defects add `mutations/`.

### 2. Read the Target Entry the Skill Wrote

The `registry` in `evaluation.json` lists every command a run may start.
A skill target registers the generic runner and names the skill in `launch.skillRoot`:

```json
{
  "interfaceId": "stub-skill",
  "executable": "tea-skill-runner",
  "target": "evals/node_modules/.bin/tea-skill-runner",
  "subcommandPaths": [[]],
  "artifacts": {},
  "environmentKeys": [],
  "maxElapsedMs": 160000,
  "infrastructureExitCodes": [3, 4, 5, 6],
  "egress": [{ "host": "api.anthropic.com", "port": 443, "addresses": ["160.79.104.10", "2607:6bc0::10"] }]
}
```

```json
{
  "launch": { "root": "../..", "skillRoot": "skill" },
  "workspace": { "kind": "copy", "provision": [] }
}
```

`launch.root` is the project root.
Each trial runs in a disposable copy of it, so the `target` path resolves inside the copy and the runner is part of the trial's workspace.
Keep the `target` a path inside `launch.root`.
A project whose workspace is a git checkout ignores `node_modules`, so name the install there:

```json
{ "workspace": { "kind": "git", "provision": ["evals/node_modules"] } }
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

The examples above come from repository fixtures that call no model.
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
tea-evaluate preflight: eval-quality preflight exited 0; its verdict and diagnostics are in runs/20261007T112819775Z-8e531f56 (exit 0, /work/app/evals/stub-skill-preflight/runs/20261007T112819775Z-8e531f56)
```

Preflight launches the real target in a confined disposable copy.
It sends two different requests to prove the output depends on the input, then sends the clean request twice to prove the starting state resets.
Exit 0 means the registry reaches the target and the clean control passes.

### 5. Run and Score

```bash
RUN=$(npm exec --prefix evals -- tea-evaluate run --evaluation evals/stub-skill-preflight 2>&1 | tee /dev/stderr | sed -n 's/.*score --run \([^ ]*\) .*/\1/p')
SCORE=$(npm exec --prefix evals -- tea-evaluate score --evaluation evals/stub-skill-preflight --run "$RUN" 2>&1 | tee /dev/stderr | sed -n 's#.*runs/.*/scores/\([^ ]*\) (exit .*#\1#p')
```

`RUN` holds the ID of the run this command just sealed, taken from the summary line `... score them with tea-evaluate score --run <ID>`, and `SCORE` holds the ID of the score invocation that `score` prints in `runs/<RUN>/scores/<SCORE>`.
The `tee /dev/stderr` keeps the output on your screen, and every later command reads `$RUN` and `$SCORE`, so it follows your own run.
If a variable comes back empty, the command stopped before it sealed or scored a run, and its output says why.

`run` repeats the preflight, qualifies each seeded defect and the clean control, then runs every arm as a set of trials in fresh copies.
This folder holds one clean control and one trial:

```text
tea-evaluate run: probes/P-001.probe.json: qualified; its baseline passed
tea-evaluate run: clean: trial 1 of 1
tea-evaluate run: 1 trial set(s) of 1 trial(s) sealed over clean; score them with tea-evaluate score --run 20261007T112821798Z-9c1c180d (exit 0, /work/app/evals/stub-skill-preflight/runs/20261007T112821798Z-9c1c180d)
```

`score` hands each probe to eval-quality and prints its exit:

```text
tea-evaluate score: scoring run 20261007T112821798Z-9c1c180d
tea-evaluate score: P-001: eval-quality score exited 0
tea-evaluate score: strength aggregate: eval-quality aggregate-strength exited 0
```

A folder with seeded defects adds a `mutated:<id>` set of trials for each one, as [How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md) shows.

### 6. Read the Run

Both commands exit 0 for a PASS, a WAIVED or a CONCERNS verdict.
Read the verdict and the outcome states from the evidence artifacts in the score invocation folder:

```bash
(cd evals/stub-skill-preflight/runs/$RUN/scores/$SCORE &&
  grep -o '"contractVerdict":"[A-Z]*"' P-*/evidence-artifact.json &&
  grep -o '"state":"[a-z-]*"' P-001/evidence-artifact.json | sort -u)
```

```text
"contractVerdict":"CONCERNS"
"state":"passed-clean-control"
```

The clean control reads `passed-clean-control`.
A folder with a seeded defect also shows that defect as `caught`.
The CONCERNS verdict lists coverage gaps that still need probes.
[How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md) shows how to close them.

Then read what the run executed under:

```bash
grep -A8 '"confinement"' evals/stub-skill-preflight/runs/$RUN/run.json
```

```text
  "confinement": "seatbelt",
  "egress": [
    {
      "interfaceId": "stub-skill",
      "hosts": [
        "api.anthropic.com:443"
      ]
    }
  ],
```

`confinement` is `seatbelt` on macOS, `bubblewrap` on Linux, or `opt-out` when `evaluation.json` sets `"confinement": false`.
Only a `bubblewrap` run holds an agent to its `egress` list.

## If `preflight` Exits 3 With `mount outside allowlist`

A confined run grants the trial its workspace.
A runner that resolves outside the workspace is read outside the trial's grants, and `preflight` refuses it with exit 3 before any trial; `run` and `score` refuse the same paths from the trials' manifests.
A registry `target` of the bare name `tea-skill-runner`, found through the `evals/node_modules/.bin` that `npm exec` puts on the `PATH`, does this.
`preflight` audits each leg and refuses the paths every leg opened, with the first three and a count of the rest:

```text
tea-evaluate preflight: isolation manifest violation: every preflight leg opened 17 path(s) outside the allowlist (mount outside allowlist: <project>/evals/node_modules/bmad-method-test-architecture-enterprise/cli/lib/agent-adapters.js; mount outside allowlist: <project>/evals/node_modules/bmad-method-test-architecture-enterprise/cli/lib/agent-supervisor-bounds.js; mount outside allowlist: <project>/evals/node_modules/bmad-method-test-architecture-enterprise/cli/lib/agent-supervisor.js; and 14 more), so every trial will too, and `score` refuses a trial that does (exit 3). If they are the files of a target that launches from outside its workspace, use one of two setups: make the registry `target` a path inside `launch.root` (for example `node_modules/.bin/tea-skill-runner` over a copy workspace, or a git workspace with `workspace.provision`), or keep the bare name and list the directories it runs from in `systemPaths`, with the bin directory that holds its link on `PATH`.
```

On macOS the audit lists 17 paths, all under two directories: the TeA package and `commander`.
On Linux it lists 18, the third being the link `node_modules/.bin/tea-skill-runner` in a third directory, `evals/node_modules/.bin`.
Two repairs work, and the first is the one to prefer:

1. Set the registry `target` to the path inside `launch.root`, `evals/node_modules/.bin/tea-skill-runner`, as step 2 shows.
2. Keep the bare name and list the install directories the audit names in `systemPaths` on the entry that starts the target, using the narrowest directory that holds each, and the `evals/node_modules/.bin` directory that holds the runner's link (a Linux audit lists it):

```json
{
  "systemPaths": [
    "/work/app/evals/node_modules/bmad-method-test-architecture-enterprise",
    "/work/app/evals/node_modules/commander",
    "/work/app/evals/node_modules/.bin"
  ]
}
```

With the bare name, the runner must also be on the target's `PATH`, so start `tea-evaluate` through `npm exec --prefix evals --`.
Without that, the preflight exits 3 and the leg's observation in `runs/<invocationId>/observations/001-witness-alpha.json` names the cause:

```text
sandbox-exec: execvp() of 'tea-skill-runner' failed: No such file or directory
```

A path you did not expect, such as a credential file or another project, points to a target that reads beyond its task.
A path that only some legs opened is no refusal: `preflight` prints a note naming it and the legs, and a trial that opens it exits `run` with 3.
A leg whose audit lost reports (the macOS log is lossy under load) is left out of that check and named in a note; when every leg's audit lost reports, `preflight` exits 12 with `the legs yield no audit`, and the fix is to run it again on a quieter host.
Repair the target, because declaring that path would hide the defect.
Then run `check` and run the evaluation again.
The reference describes both setups in [Where the runner lives](/docs/reference/tea-evaluate-cli.md#where-the-runner-lives) and the audit in [File-system confinement](/docs/reference/tea-evaluate-cli.md#file-system-confinement).

## If Your Target Already Has Known Defects

A clean control fails when the target has a defect, and `run` stops with exit 11 and `the clean control's baseline does not pass`.
To record the starting point before you fix the target, declare each failing control in its probe and run with `--before-state`.
Begin the control's `qualification.noKnownDefectStatement` with `Known defect at this revision:` and name the defect:

```json
{
  "route": "clean-control",
  "noKnownDefectStatement": "Known defect at this revision: the review ignores the type checker. This control records the before state."
}
```

```bash
npm exec --prefix evals -- tea-evaluate run --evaluation evals/my-evaluation --before-state
npm exec --prefix evals -- tea-evaluate score --evaluation evals/my-evaluation --run <invocationId>
```

`score` exits 2 and reads each known-failing control as `false-positive`; `eval-quality` computes that, and the summary lines say `BEFORE STATE`.
The result is a measurement and never a baseline: `compare` and `compare --accept` exit 10 on it.
After the fix, change the statement to `No known defect at this revision.`, run without the flag and accept that run.
[The `run` reference](/docs/reference/tea-evaluate-cli.md#record-a-before-state) lists what changes under the flag.

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
