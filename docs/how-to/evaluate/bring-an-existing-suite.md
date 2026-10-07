---
title: 'How to Bring an Existing Suite into Evaluate with TEA'
description: Use an AgentEvals or promptfoo suite as the evaluation layer, or learn another framework as you go
---

# How to Bring an Existing Suite into Evaluate with TEA

Use this guide when you already grade your target with a framework such as AgentEvals or promptfoo, or when you want a framework Evaluate has not met before.
The framework keeps grading.
Evaluate adds the seeded defects, the held-out probes, the repeatable trials and the eval-quality verdict around it.

The mechanism is a `command` evaluator: an executable in the evaluation folder that wraps the framework, plus three files that make its use repeatable.

## When to Use This

- You own AgentEvals trajectory checks and want them scored against planted defects
- You own promptfoo assertions and want the same
- You want to use another framework and need Evaluate to learn it from its documentation
- A run stopped with `the installed frameworks do not meet evaluator/frameworks.json`

## Prerequisites

- An evaluation folder whose contract, oracles and registry pass `check` and `preflight`, as [How to Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md) produces
- Node.js 22.20 or later
- The framework's primary documentation, which the skill reads
- A framework that grades without a model, to keep the evaluation in the `pr` tier

## Steps

### 1. Ask the Skill to Wrap the Framework

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-evaluate`
- **Codex:** `$bmad-testarch-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

```text
Use AgentEvals as the evaluator for evals/calling-agent-tool-use.
```

For AgentEvals and promptfoo the skill starts from a shipped wrapper.
For another framework it learns the framework first, as step 6 describes.
Either way it writes the same set of files under `evaluator/` and sets `evaluator.kind` to `command` in `evaluation.json`:

```json
{
  "evaluator": {
    "kind": "command",
    "command": "evaluator/trajectory.mjs",
    "timeoutMs": 30000
  }
}
```

### 2. Install the Framework at the Version You Declare

Install the framework as a dependency of the evaluations folder, at one exact version:

```bash
npm install --prefix evals --save-dev --save-exact agentevals@0.0.7
```

Track `evals/package.json` and its lockfile, so a clean install or CI resolves the same release.
The framework must sit in a `node_modules` in the evaluation folder or above it.

### 3. Read the Files the Skill Wrote

An AgentEvals evaluator holds these files:

```text
evaluator/
  trajectory.mjs
  mapping.json
  frameworks.json
  installed-version.mjs
  LEARNED.md
  reference/weather.json
```

`trajectory.mjs` is the wrapper.
It reads `{ "sealedBrief", "observations" }` as JSON on standard input, runs the framework over what the target printed, and prints `{ "rows": [...] }`.
The calling agent in this folder prints its tool calls as the text `trajectory:`, one space and a JSON array, and `reference/weather.json` holds the trajectory the agent must produce:

```json
[
  { "role": "user", "content": "Weather in Austin" },
  {
    "role": "assistant",
    "content": "",
    "tool_calls": [{ "id": "call-1", "type": "function", "function": { "name": "get_weather", "arguments": "{\"city\":\"Austin\"}" } }]
  }
]
```

`mapping.json` binds each row key the wrapper prints to a contract oracle and behavior:

```json
{
  "schemaVersion": 1,
  "keys": {
    "trajectory_strict_match": { "oracleId": "O-001", "behaviorId": "B-001" }
  }
}
```

`frameworks.json` declares the framework, the one version the evaluation expects and a probe that reads the installed version:

```json
{
  "schemaVersion": 1,
  "frameworks": [
    {
      "package": "agentevals",
      "version": "0.0.7",
      "probe": { "command": "evaluator/installed-version.mjs", "args": ["agentevals"] }
    }
  ]
}
```

`LEARNED.md` records the installed `package@version`, the primary sources the wrapper relies on, and a known pass and a known fail that were executed.

`run` reads the installed version before the first trial, before each launch of the evaluator and after each trial.
A different version, a missing package or a package that changed mid-run stops the run with exit 12 and seals no record for the affected trial.

### 4. Check Version Drift

`check` holds `LEARNED.md` and `frameworks.json` to the same version.
After changing the declared version to 0.0.8 without touching `LEARNED.md`, `check` and `run` exit 10:

```text
evaluator/LEARNED.md: [evaluator] evaluator/LEARNED.md records agentevals@0.0.7, and evaluator/frameworks.json declares agentevals@0.0.8; update both together when the dependency is upgraded
tea-evaluate check: 1 authoring defect(s) in /work/app/evals/calling-agent-tool-use
```

A framework that is not installed stops `run` with exit 12:

```text
tea-evaluate run: the installed frameworks do not meet evaluator/frameworks.json, so no trial runs: could not read the installed autoevals: the version probe of autoevals (evaluator/installed-version.mjs) exited 1: autoevals version probe could not be read: autoevals is not installed in a node_modules directory above /work/app/evals/pantry-summary/evaluator; see framework-versions.json (exit 12, /work/app/evals/pantry-summary/runs/20261007T093033842Z-c432c324)
```

Install the declared version, or upgrade on purpose.
An upgrade is a deliberate change, including the one that `npm install` at the `latest` spec makes.
Read the new version's release notes, run the known pass and the known fail again, update `LEARNED.md` and `frameworks.json` together, commit both and run again.

### 5. Wrap promptfoo Assertions

A promptfoo evaluator holds the assertions in `evaluator/asserts.yaml`:

```yaml
- type: contains
  value: apples
  metric: required-apples
- type: contains
  value: pears
  metric: required-pears
- type: not-contains
  value: shellfish
  metric: forbidden-shellfish
```

Each assertion carries a `metric` equal to one row key in `mapping.json`.
The metric stays the assertion's identity when you reorder the file.
An assertion with no metric, or with a metric that `mapping.json` does not name, stops the trial with `promptfoo returned missing, unknown, or repeated assertion metadata`.
`mapping.json` names one row key for each assertion:

```json
{
  "schemaVersion": 1,
  "keys": {
    "required-apples": { "oracleId": "O-001", "behaviorId": "B-001" },
    "required-pears": { "oracleId": "O-002", "behaviorId": "B-002" },
    "forbidden-shellfish": { "oracleId": "O-003", "behaviorId": "B-003" }
  }
}
```

The wrapper runs promptfoo over the target's captured output and maps each graded assertion to a `pass` or `fail` row.
It admits assertion types that run no adopter code and call no model: `contains`, `icontains`, `contains-all`, `contains-any`, `icontains-all`, `icontains-any`, `equals`, `starts-with`, `regex` and `is-json`, each also with a `not-` prefix.
Any other type stops the trial.
With a `javascript` assertion in `asserts.yaml`, `check` still passes and `run` exits 12:

```text
tea-evaluate run: trial-clean-1 yields no record: the evaluator evaluator/promptfoo.mjs exited 1, so its answer is not read (exit 12, /work/app/evals/promptfoo-summary/runs/20261007T093023294Z-453ad331)
```

The evaluator's `stderr` in the run folder, `evaluator/clean/trial-1.stderr`, names the cause:

```text
Error: promptfoo assertion type "javascript" is refused: only assertions that run no adopter code and call no model are admitted (contains, icontains, contains-all, contains-any, icontains-all, icontains-any, equals, starts-with, regex, is-json, each also with a not- prefix); an assertion that needs code belongs in a command evaluator you own
```

An assertion that needs code belongs in a `command` evaluator you write yourself, where a crash exits non-zero and stops the trial.

### 6. Learn a Framework the Skill Has Not Met

For a framework with no starter, the skill learns it before it writes the wrapper:

1. It reads primary sources only: the framework's documentation, repository, API reference, examples and changelog, and it records a URL or commit for every fact it uses.
2. It installs the version you use and declares the package, version and a version probe in `evaluator/frameworks.json`.
3. It executes a minimal example against a known pass and a known fail with that installed version.
4. It adds a third case the framework cannot grade, such as a malformed assertion or a missing credential, and records how that result arrives.
5. It fills `evaluator/LEARNED.md` with the installed version, each fact with its source, the executed output and any claim that execution contradicted.
6. It maps each framework result to a row key in `evaluator/mapping.json` and writes the wrapper.

The executed example is a real command, so you can reproduce it.
For autoevals the skill runs `ExactMatch` over a known pass and a known fail:

```bash
node --input-type=module -e "import {ExactMatch} from 'autoevals'; const expected='Summary for List pantry: apples, pears\n'; for (const [label,output] of [['known-pass',expected],['known-fail','Summary for List pantry: apples\n']]) { const result=await ExactMatch({output,expected}); console.log(JSON.stringify({label,input:{output,expected},result})); }"
```

```text
{"label":"known-pass","input":{"output":"Summary for List pantry: apples, pears\n","expected":"Summary for List pantry: apples, pears\n"},"result":{"name":"ExactMatch","score":1}}
{"label":"known-fail","input":{"output":"Summary for List pantry: apples\n","expected":"Summary for List pantry: apples, pears\n"},"result":{"name":"ExactMatch","score":0}}
```

A framework result that carries no grade says only that the framework could not judge the output.
The wrapper writes no row for it and exits non-zero, so the run stops with exit 12 and a framework error does not count against the target.

### 7. Run and Score

```bash
RUN=$(npm exec --prefix evals -- tea-evaluate run --evaluation evals/pantry-summary 2>&1 | tee /dev/stderr | sed -n 's/.*score --run \([^ ]*\) .*/\1/p')
SCORE=$(npm exec --prefix evals -- tea-evaluate score --evaluation evals/pantry-summary --run "$RUN" 2>&1 | tee /dev/stderr | sed -n 's#.*runs/.*/scores/\([^ ]*\) (exit .*#\1#p')
```

`RUN` holds the ID of the run this command just sealed, taken from the summary line `... score them with tea-evaluate score --run <ID>`, and `SCORE` holds the ID of the score invocation that `score` prints in `runs/<RUN>/scores/<SCORE>`.
The `tee /dev/stderr` keeps the output on your screen, and every later command reads `$RUN` and `$SCORE`, so it follows your own run.
If a variable comes back empty, the command stopped before it sealed or scored a run, and its output says why.

```text
tea-evaluate run: 6 trial set(s) of 3 trial(s) sealed over clean, mutated:M-001, mutated:M-002; score them with tea-evaluate score --run 20261007T090533030Z-498d99b8 (exit 0, /work/app/evals/pantry-summary/runs/20261007T090533030Z-498d99b8)
tea-evaluate score: eval-quality score ran for 6 probe(s) of run 20261007T090533030Z-498d99b8; each call's diagnostics and evidence are in runs/20261007T090533030Z-498d99b8/scores/20261007T090543074Z-c212cfd9 (exit 0, /work/app/evals/pantry-summary/runs/20261007T090533030Z-498d99b8)
```

Read the verdicts as [How to Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md) shows:

```bash
(cd evals/pantry-summary/runs/$RUN/scores/$SCORE &&
  grep -o '"contractVerdict":"[A-Z]*"' P-*/evidence-artifact.json)
```

```text
P-001/evidence-artifact.json:"contractVerdict":"PASS"
P-002/evidence-artifact.json:"contractVerdict":"PASS"
P-003/evidence-artifact.json:"contractVerdict":"PASS"
P-004/evidence-artifact.json:"contractVerdict":"PASS"
P-005/evidence-artifact.json:"contractVerdict":"PASS"
P-006/evidence-artifact.json:"contractVerdict":"PASS"
```

## How You Know It Worked

- `check` prints `has no authoring defects`, which includes the match between `LEARNED.md` and `frameworks.json`
- The framework's known pass reads `passed-clean-control` and its known fail reads `caught` after `score`
- `run` exits 0 without a framework error in `evaluator/<arm>/trial-<n>.stderr`
- The installed version equals the declared version

## Related Guides

- [How to Choose an Evaluator and Calibrate a Judge](/docs/how-to/evaluate/choose-an-evaluator-and-calibrate-a-judge.md): Compare the four evaluator kinds
- [How to Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md): Keep the scored result as the baseline
- [How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md): Interpret a weak result

## Reference

- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md): Every command, option and exit code
- [run](/docs/reference/tea-evaluate-cli.md#run)
- [Exit codes](/docs/reference/tea-evaluate-cli.md#exit-codes)
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): Why a framework is a fixed condition of every run
