---
title: 'How to Evaluate an MCP Tool Server with TEA'
description: Evaluate a stdio MCP tool server through its tool calls, from the Evaluate conversation to a scored run
---

# How to Evaluate an MCP Tool Server with TEA

Use the Evaluate skill to prove that the tools of a stdio MCP server return what you require.
Evaluate starts the server in a disposable copy of your project, calls its tools, plants known defects in the server's rules or configuration, and records whether the evaluation catches them.
A server reached over HTTP follows [How to Evaluate an HTTP API with TEA](/docs/how-to/evaluate/evaluate-an-http-api.md).

## When to Use This

- You built an MCP server and want proof that each tool returns the right result
- You changed a tool's rules and want to know whether its answers moved
- An agent depends on the server and you want its tool results checked before you evaluate the agent

## Prerequisites

- Node.js 22.20 or later
- A server that runs from a command line and speaks MCP over standard input and output
- The names of the tools the evaluation may call
- The names of the environment variables the server reads
- A host that can confine processes: macOS with `sandbox-exec` and `log stream`, or Linux with Bubblewrap (`bwrap`) and `strace`

## Steps

### 1. Start the Evaluate Skill

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-evaluate`
- **Codex:** `$bmad-testarch-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

Full invocation rules: [Invoking a TEA Workflow](/docs/reference/commands.md#invoking-a-tea-workflow).

Tell the skill what to evaluate:

```text
Evaluate the MCP tool server in server/grader.js.
```

The skill reads the server and its rule files, then classifies it.
A stdio server is a tool-use system reached through the `mcp` interface.
The skill asks which tools the evaluation may call, which outputs count as proof, and which rule or setting a defect could change.
It writes your answers as a requirements statement and stops until you confirm it.

After confirmation the skill designs the probes, authors the contract, writes the registry entry and installs the private package that provides `tea-evaluate`:

```bash
npm install --prefix evals
```

### 2. Read the Registry Entry the Skill Wrote

`evaluation.json` lists the server in its `registry`:

```json
{
  "kind": "mcp",
  "interfaceId": "grader",
  "target": "server/grader.js",
  "targetArgs": ["--policy=rules/policy.txt"],
  "tools": ["grade_answer", "describe_policy"],
  "environmentKeys": ["GRADER_LOG", "GRADER_SECRET"],
  "maxElapsedMs": 30000
}
```

- `target` and `targetArgs` start the server inside the disposable copy.
- `tools` is a default-deny list.
  A call to a tool outside it is denied before the server sees it.
- `environmentKeys` names the variables the server may receive.
- `maxElapsedMs` bounds each call.

The contract declares an operation for each tool the plan calls and a plan step that calls it:

```json
{
  "stepId": "grade-run",
  "interfaceId": "grader",
  "operationId": "grade-answer",
  "inputBinding": { "arguments": { "answer": { "literal": "forty-two" } } }
}
```

An oracle reads the tool result at `/interactions/grade-run/response-body`.
In this fixture it requires `ok` to be `true` and `verdict` to be `accepted` under the strict policy in `rules/policy.txt`.
The seeded defect `M-001` replaces `mode: strict` with `mode: lenient` in that file, and the server then rejects the same answer.

### 3. Check the Folder

```bash
npm exec --prefix evals -- tea-evaluate check --evaluation evals/grader-tool-server
```

```text
tea-evaluate check: /work/app/evals/grader-tool-server has no authoring defects
```

`check` exits 10 and lists every defect.
Repair them before the next step.

### 4. Preflight the Server

```bash
npm exec --prefix evals -- tea-evaluate preflight --evaluation evals/grader-tool-server
```

```text
tea-evaluate preflight: probes/P-002.probe.json: qualifying through M-001 in /tmp/tea-evaluate-qualify-P-002-<id>/target
tea-evaluate preflight: probes/P-002.probe.json: qualified; the restored digest matched and the baseline passed again
...
tea-evaluate preflight: leg "manifest-lenient": observed
tea-evaluate preflight: eval-quality preflight exited 0; its verdict and diagnostics are in runs/20261007T091045310Z-20b1681c (exit 0, /work/app/evals/grader-tool-server/runs/20261007T091045310Z-20b1681c)
```

Preflight starts the real server in a confined copy.
It applies the seeded defect, confirms the server then answers wrongly, restores the original bytes and confirms the digest matches.
Exit 0 means the server starts, answers through the tools the plan calls and passes the clean control.

A tool that the registry does not list fails here.
With `grade_answer` removed from `tools`, `check` still passes and the preflight exits 10:

```text
tea-evaluate preflight: probes/P-002.probe.json: M-001: the baseline arm was denied by the registry (tool-not-authorized): forbidden-target in ProbeRequest: tool "grade_answer" is not among the authorized tools for interface "grader" (exit 10, /work/app/evals/grader-tool-server/runs/20261007T091103278Z-c674ab76)
```

Add the tool name back to `tools` after you confirm that the evaluation may call it.

### 5. Run and Score

```bash
RUN=$(npm exec --prefix evals -- tea-evaluate run --evaluation evals/grader-tool-server 2>&1 | tee /dev/stderr | sed -n 's/.*score --run \([^ ]*\) .*/\1/p')
SCORE=$(npm exec --prefix evals -- tea-evaluate score --evaluation evals/grader-tool-server --run "$RUN" 2>&1 | tee /dev/stderr | sed -n 's#.*runs/.*/scores/\([^ ]*\) (exit .*#\1#p')
```

`RUN` holds the ID of the run this command just sealed, taken from the summary line `... score them with tea-evaluate score --run <ID>`, and `SCORE` holds the ID of the score invocation that `score` prints in `runs/<RUN>/scores/<SCORE>`.
The `tee /dev/stderr` keeps the output on your screen, and every later command reads `$RUN` and `$SCORE`, so it follows your own run.
If a variable comes back empty, the command stopped before it sealed or scored a run, and its output says why.

```text
tea-evaluate run: clean: trial 1 of 3
...
tea-evaluate run: mutated:M-001: trial 3 of 3
tea-evaluate run: 2 trial set(s) of 3 trial(s) sealed over clean, mutated:M-001; score them with tea-evaluate score --run 20261007T091047070Z-ef078a64 (exit 0, /work/app/evals/grader-tool-server/runs/20261007T091047070Z-ef078a64)
```

```text
tea-evaluate score: scoring run 20261007T091047070Z-ef078a64
tea-evaluate score: P-001: eval-quality score exited 0
tea-evaluate score: P-002: eval-quality score exited 0
tea-evaluate score: strength aggregate: eval-quality aggregate-strength exited 0
```

### 6. Read the Result

```bash
(cd evals/grader-tool-server/runs/$RUN/scores/$SCORE &&
  grep -o '"contractVerdict":"[A-Z]*"\|"rule":"[a-z-]*"' P-*/evidence-artifact.json &&
  grep -o '"state":"[a-z-]*"' P-001/evidence-artifact.json | sort -u &&
  grep -o '"state":"[a-z-]*"' P-002/evidence-artifact.json | sort -u)
```

```text
P-001/evidence-artifact.json:"contractVerdict":"CONCERNS"
P-001/evidence-artifact.json:"rule":"whole-body"
P-001/evidence-artifact.json:"rule":"malformed-input"
P-001/evidence-artifact.json:"rule":"per-record"
P-001/evidence-artifact.json:"rule":"omission-and-completeness"
P-002/evidence-artifact.json:"contractVerdict":"CONCERNS"
P-002/evidence-artifact.json:"rule":"whole-body"
P-002/evidence-artifact.json:"rule":"malformed-input"
P-002/evidence-artifact.json:"rule":"per-record"
P-002/evidence-artifact.json:"rule":"omission-and-completeness"
"state":"passed-clean-control"
"state":"caught"
```

The clean control passes and the seeded defect is caught, which proves the evaluation can see the one defect it plants.
The CONCERNS verdict names four checks the corpus does not cover yet, such as a malformed `answer` argument.
[How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md) closes each one.

## How You Know It Worked

- `check` prints `has no authoring defects`
- `preflight` exits 0 and no line names `tool-not-authorized`
- `score` exits 0
- The clean control reads `passed-clean-control` and the seeded defect reads `caught`

## Related Guides

- [How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md): Close the coverage gaps a run reports
- [How to Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md): Keep an accepted result to compare later runs against
- [How to Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md): Evaluate the agent that calls the server

## Reference

- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md): Every command, option and exit code
- [preflight](/docs/reference/tea-evaluate-cli.md#preflight)
- [Exit codes](/docs/reference/tea-evaluate-cli.md#exit-codes)
- [The evaluation folder](/docs/reference/tea-evaluate-cli.md#the-evaluation-folder)
