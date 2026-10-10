---
title: 'How to Evaluate an HTTP API with TEA'
description: Evaluate a web application, an AI feature or an HTTP tool server through its HTTP surface, from the Evaluate conversation to a scored run
---

# How to Evaluate an HTTP API with TEA

Start Evaluate in your coding agent and point it at an HTTP service.
Confirm which requests it may send and which parts of the response count as correct.
Evaluate starts the service in a disposable project copy, sends the approved requests, and checks whether planted defects change the answers.
The scored run shows what passed, which defects the checks caught, and where coverage is weak.
Your coding agent handles the files and commands below after you confirm the requirements; they are here so you can inspect or repeat the run.

A web application or an AI feature behind an HTTP endpoint follows this guide.
The requests pass through a port governed by eval-quality.

A stdio tool server follows [How to Evaluate an MCP Tool Server with TEA](/docs/how-to/evaluate/evaluate-an-mcp-tool-server.md).

## When to Use This

- You ship an HTTP service and want proof that its endpoints answer correctly
- An AI feature sits behind an endpoint and you want its answers checked
- You changed a rule file or setting and want to know whether the responses moved

## Prerequisites

- Node.js 22.20 or later
- A service that starts from a command line and listens on a port you can set
- The method and path of every request the evaluation may send
- The environment variable that holds the service's credential, when it needs one
- A host that can confine processes: macOS with `sandbox-exec` and `log stream`, or Linux with Bubblewrap (`bwrap`) and `strace`

## Steps

### 1. Start the Evaluate Skill

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-evaluate`
- **Codex:** `$bmad-testarch-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

Full invocation rules: [Invoking a TEA Skill](/docs/reference/commands.md#invoking-a-tea-skill).

Tell the skill what to evaluate:

```text
Evaluate the HTTP service in server/grader.js.
```

The skill reads the service and its rule files and classifies it as an `api` target.
It asks which requests may be sent, which parts of a response count as proof, and which rule or setting a defect could change.
It writes your answers as a requirements statement and stops until you confirm it.

After confirmation the skill designs the probes, authors the contract and writes the registry entry.
It also writes the HTTP port and its conformance check:

```text
evals/grader-http-service/adapter/http-probe-port.mjs
evals/grader-http-service/adapter/http-probe-port.conformance.mjs
```

The skill installs the evaluation's dependencies under `evals/`.
If preflight reports a missing `eval-quality` package, ask the skill to check that install.

### 2. Read the Registry Entry the Skill Wrote

```json
{
  "kind": "api",
  "interfaceId": "grader",
  "scheme": "http",
  "host": "127.0.0.1",
  "addresses": ["127.0.0.1"],
  "methods": ["GET"],
  "safeMethods": ["GET"],
  "maxRedirects": 0,
  "maxElapsedMs": 30000,
  "maxRequestBytes": 65536,
  "maxResponseBytes": 1048576,
  "server": {
    "target": "server/grader.js",
    "targetArgs": ["--policy=rules/policy.txt"],
    "environmentKeys": ["GRADER_LOG", "GRADER_SECRET", "GRADER_TOKEN"],
    "portEnvironmentKey": "PORT",
    "portFileEnvironmentKey": "PORT_FILE",
    "readyTimeoutMs": 20000
  },
  "auth": { "header": "authorization", "environmentKey": "GRADER_TOKEN", "prefix": "Bearer " }
}
```

- `host`, `addresses`, `methods` and `safeMethods` are the only destinations and verbs the evaluation may use.
  eval-quality decides every request against them, once per request and once per redirect hop.
- `server` starts the service inside the disposable copy.
  It binds a free port for each run.
- `auth` sends the value of `GRADER_TOKEN` as the `authorization` header.

The contract declares an operation for each request the plan sends.
This one is `GET /grade?answer=<text>`, and the plan step binds `answer` to `forty-two`.
An oracle reads the parsed body at `/interactions/grade-run/response-body` and requires `ok` to be `true` and `verdict` to be `accepted`.
The seeded defect `M-001` replaces `mode: strict` with `mode: lenient` in `rules/policy.txt`, and the service then rejects the same answer.

### 3. Run the Port's Conformance Suite

```bash
(cd evals/grader-http-service && node adapter/http-probe-port.conformance.mjs)
```

The suite starts a loopback stub of its own, so it needs no deployed service and no secret.
It exits 0 when all 19 assertions pass.

### 4. Check the Folder and Set the Credential

The host must hold the variable that `auth` names.
Confirm that `GRADER_TOKEN` is available to the run; the agent should check its presence without printing its value.

Export the variables, then check the folder:

```bash
export GRADER_TOKEN=<the service credential>
npm exec --prefix evals -- tea-evaluate check --evaluation evals/grader-http-service
```

```text
tea-evaluate check: /work/app/evals/grader-http-service has no authoring defects
```

The port has passed its conformance check, the credential is available, and `check` has validated the files.
Next, preflight the service and score its trials.

### 5. Preflight, Run and Score

```bash
npm exec --prefix evals -- tea-evaluate preflight --evaluation evals/grader-http-service
RUN=$(npm exec --prefix evals -- tea-evaluate run --evaluation evals/grader-http-service 2>&1 | tee /dev/stderr | sed -n 's/.*score --run \([^ ]*\) .*/\1/p')
SCORE=$(npm exec --prefix evals -- tea-evaluate score --evaluation evals/grader-http-service --run "$RUN" 2>&1 | tee /dev/stderr | sed -n 's#.*runs/.*/scores/\([^ ]*\) (exit .*#\1#p')
```

`RUN` and `SCORE` capture the IDs printed by these commands; later examples use them to read your result.
If either is empty, read the command's output and resolve the failure before continuing.

```text
tea-evaluate preflight: eval-quality preflight exited 0; its verdict and diagnostics are in runs/20261007T092330798Z-925507cf (exit 0, /work/app/evals/grader-http-service/runs/20261007T092330798Z-925507cf)
```

```text
tea-evaluate run: 2 trial set(s) of 3 trial(s) sealed over clean, mutated:M-001; score them with tea-evaluate score --run 20261007T092333549Z-2b79ad72 (exit 0, /work/app/evals/grader-http-service/runs/20261007T092333549Z-2b79ad72)
```

```text
tea-evaluate score: P-001: eval-quality score exited 0
tea-evaluate score: P-002: eval-quality score exited 0
tea-evaluate score: strength aggregate: eval-quality aggregate-strength exited 0
```

### 6. Read the Result

```bash
(cd evals/grader-http-service/runs/$RUN/scores/$SCORE &&
  grep -o '"contractVerdict":"[A-Z]*"' P-*/evidence-artifact.json &&
  grep -o '"state":"[a-z-]*"' P-001/evidence-artifact.json | sort -u &&
  grep -o '"state":"[a-z-]*"' P-002/evidence-artifact.json | sort -u)
```

```text
P-001/evidence-artifact.json:"contractVerdict":"CONCERNS"
P-002/evidence-artifact.json:"contractVerdict":"CONCERNS"
"state":"passed-clean-control"
"state":"caught"
```

The clean control passes and the seeded defect is caught.
The CONCERNS verdict lists checks the corpus does not cover yet, among them a request with a malformed `answer`.
[How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md) closes each one.

## How You Know It Worked

- The conformance suite exits 0
- `check` prints `has no authoring defects`
- `preflight` exits 0
- `score` exits 0
- The clean control reads `passed-clean-control` and the seeded defect reads `caught`

## Related Guides

- [How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md): Close the coverage gaps a run reports
- [How to Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md): Keep an accepted result to compare later runs against
- [How to Evaluate an MCP Tool Server with TEA](/docs/how-to/evaluate/evaluate-an-mcp-tool-server.md): The stdio counterpart

## Reference

- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md): Every command, option and exit code
- [preflight](/docs/reference/tea-evaluate-cli.md#preflight)
- [Exit codes](/docs/reference/tea-evaluate-cli.md#exit-codes)
- [The evaluation folder](/docs/reference/tea-evaluate-cli.md#the-evaluation-folder)
