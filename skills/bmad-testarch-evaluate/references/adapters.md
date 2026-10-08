# Adapters

Put each execution target in `evaluation.json.registry`, with one entry per interface. Match `interfaceId` to the contract's `permittedInterfaces[].logicalId`, and match the command `executable` and allowed subcommand paths to its operations. Set `launch.root` so every relative target resolves inside the disposable workspace. A bare command name whose files lie outside `launch.root`, the system's own directories and the entry's `systemPaths` (an npm install such as `tea-skill-runner` in `evals/node_modules`) is listed by the allowlist check, which `preflight` applies to the paths every one of its legs opened and `run` to its sealed trials: each refuses it with exit 3 and `isolation manifest violation: ... mount outside allowlist`, before any score. Register such a command by its path inside `launch.root`, or declare its install directories in `systemPaths`. Before `check`, copy `assets/evaluator-conditions.template.json` to `policy/evaluator-conditions.json`. Fill `modelSnapshot` with the model the target runs and `systemPromptDigest` with the digest of its exact system prompt bytes. A `tea-skill-runner` entry requires a real model snapshot; a target without a model uses `modelSnapshot: "none"` and the digest of empty bytes. Use the default deterministic evaluator for this stage. Remove the template's `judge` block when the contract has no rubric. For a rubric, declare `evaluation.json.judge` with its agent adapter, model and timeout, set `judge.model` to the judge's immutable provider model ID, and fill `judge.modelSnapshot` with the same ID; `check` refuses a snapshot that differs. Stage 7 can select another evaluator after its required files exist; rerun `check` and preflight after that change. After the Stage 6 `check`, `compile` and `seal` sequence succeeds, run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate preflight --evaluation <evaluation-folder> --partition development`. Under a `partitionPlan` the flag is required: a preflight with no `--partition` exits 64, since it would build the both view and launch the held-out request during authoring, so run `--partition held-out` only after the development review. A nonzero exit halts this stage and must be reported with its exit code. Under a `partitionPlan` `eval-quality compile` and `eval-quality seal` cover the development view alone (see Compile and seal in `contract.md`). Inspect the verdict and fault files for `interface-not-authorized` or `executable-not-authorized` before calling wiring complete. The runtime gives each registry entry to eval-quality's default-deny policy.

## Target kind to adapter mapping

| Target kind                  | Interface kind                          | Adapter                                                                  | Source repository example                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skill`                      | `cli`                                   | `createCommandLineAdapter` through the skill runner                      | [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate/preflight/evaluation.json)                                                                                                                                                                                                      |
| `agent`                      | `cli`                                   | `createCommandLineAdapter` through the adopter's non-interactive command | [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-tool-use-agent/evals/tool-use/evaluation.json)                                                                                                                                                                                  |
| `workflow`                   | target's own `cli`, `api` or `mcp` kind | adapter for that kind, with ordered plan steps                           | [source fixture: contract.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-workflow/evals/records/contract.json)                                                                                                                                                                                             |
| `tool-use`: calling agent    | `cli`                                   | `createCommandLineAdapter`; emit tool-call trajectory on stdout          | [source fixture: calling-agent.js](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-tool-use-agent/bin/calling-agent.js)                                                                                                                                                                                           |
| `tool-use`: tool server      | `mcp`                                   | `createMcpAdapter` for a stdio MCP server                                | [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-mcp/evals/grader/evaluation.json)                                                                                                                                                                                               |
| `ai-feature`                 | `api`                                   | adopter-owned `EnvironmentProbePort` over HTTP                           | [source fixture: http-probe-port.mjs](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-api/evals/grader/adapter/http-probe-port.mjs)                                                                                                                                                                               |
| `tool-use`: server over HTTP | `api`                                   | the same HTTP port and target policy                                     | [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-api/evals/grader/evaluation.json) (HTTP transport)                                                                                                                                                                              |
| `test-review-mechanism`      | kind of how it runs, usually `cli`      | skill runner or its own command                                          | [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate/preflight/evaluation.json) (runner transport); [source fixture: test-review-eval](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/tree/main/test/fixtures/test-review-eval) (seeded and clean corpus) |

These examples live in this repository's source tree. Copy or adapt them into the evaluated project's own workspace before preflight. Record `targetKind` in `evaluation.json` only. Contract interfaces use `cli`, `api` or `mcp`. For a tool server reached over HTTP, use `api`, since the MCP adapter is for stdio. For test review, choose the runner that actually evaluates the seeded test source and capture its verdict from that runner's observation.

## Skill runner

Set `targetKind: "skill"`, `interface: "cli"`, and `launch.skillRoot` to the skill inside the evaluated project. The runner receives `--skill-root` pointing into the disposable copy and the probe prompt on stdin. The runner calls an agent that reaches its model provider, so on Linux list the provider's host, port and addresses in `egress` on its registry entry, as the entries below do: an entry that lists none gives a confined target a loopback only.
The installed starter `assets/evaluation.json` uses the sample name `reservation-review-runner`, the runner path `evals/node_modules/.bin/tea-skill-runner` and a `launch.root` of `../..`, the project root above an `evals/<evaluationId>` folder; replace the sample launch paths with the evaluated project's paths before running it.
The runner is a program the target process executes, so register it as a path inside `launch.root`: the install under `{tea_evaluations_folder}` that `npm install --prefix {tea_evaluations_folder}` makes, at `<{tea_evaluations_folder} relative to launch.root>/node_modules/.bin/tea-skill-runner`.
With the default `evals` folder and `launch.root` at the project root, the `target` is `evals/node_modules/.bin/tea-skill-runner`, as the entry below shows.
A `copy` workspace carries that install along with the project.
A `git` workspace holds only tracked files, so list the install folder in `workspace.provision` (`"provision": ["evals/node_modules"]`), which copies it into every workspace read-only.
The alternative keeps the bare name `tea-skill-runner` as the `target` and declares the install directories in `systemPaths` on the entry: `evals/node_modules/bmad-method-test-architecture-enterprise`, `evals/node_modules/commander` and the bin directory `evals/node_modules/.bin` that holds the runner's link, as absolute paths, which the audit lists and `preflight` refuses with exit 3 when they are missing.
The runner must also be on the target's `PATH` then, so start `tea-evaluate` through `npm exec --prefix {tea_evaluations_folder} --`.
The working [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate/preflight/evaluation.json) is a `preflight` fixture: it registers the bare name, which `preflight` refuses over a local install unless the entry's `systemPaths` lists where the runner is installed.
Its executable is `tea-skill-runner`, its logical interface is `stub-skill`, its `launch.root` is the sibling folder `stub-agent` and its `launch.skillRoot` is `skill`, with the stub agent at [source fixture: agent.js](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate/stub-agent/agent.js).
For a skill evaluation that runs, scores and compares, read [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-tutorial/evaluation/evaluation.json), which registers the runner at `node_modules/.bin/tea-skill-runner` over a `copy` workspace.

<!-- example:registry -->

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
  "egress": [
    {
      "host": "api.anthropic.com",
      "port": 443,
      "addresses": ["160.79.104.10", "2607:6bc0::10"]
    }
  ]
}
```

## Agent's own non-interactive command

If the adopter has a command that accepts a prompt without an interactive session, register that exact executable and target. A command that calls a model provider or any outside service lists its host in `egress` on its entry on Linux, for the same reason. The command must print a machine-readable observation and distinguish infrastructure exits from behavior failures. The fixture command at [source fixture: calling-agent.js](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-tool-use-agent/bin/calling-agent.js) is launched by this entry. When an agent has no own non-interactive command, wrap it with the shipped generic `tea-skill-runner`. If the agent has no skill directory, put its task and instructions in a `SKILL.md` wrapper under the target project. Set `launch.root` to the project subtree containing both the wrapper and the agent implementation. Omit `launch.skillRoot` for `targetKind: "agent"`, so controlled mutations can reach implementation files outside the wrapper. Bind the contract's `--skill-root` option to the wrapper path inside the disposable copy. Use the registry shape in the Skill runner section, with `executable` set to `tea-skill-runner` and `target` set to the runner's path inside `launch.root`, and pass the agent adapter options and probe prompt through that runner.

<!-- example:registry -->

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

The fixture command makes no network call; a real agent command that calls its model provider adds an `egress` item for it to this entry on Linux.

## Tool-use calling agent

Evaluate the agent's decision through `cli`. Have its stdout carry the tool-call trajectory, including chosen tool, arguments and result handling, so an oracle can read it. [source fixture: contract.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-tool-use-agent/evals/tool-use/contract.json) declares that observation. The fixture uses the same command registry entry as the preceding agent example; keep this separate classification in `evaluation.json.targetKind: "tool-use"` when the question is tool selection.

<!-- example:registry -->

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

The fixture command makes no network call; a real agent command that calls its model provider adds an `egress` item for it to this entry on Linux.

## Tool server over MCP

Use `kind: "mcp"` and list only the stdio server's permitted tool names. The runtime builds `McpTargetAuthorization`, then sends calls through `createMcpAdapter`. A denied tool name must remain a visible preflight fault. The live fixture is [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-mcp/evals/grader/evaluation.json), backed by [source fixture: grader.js](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-mcp/server/grader.js).

<!-- example:registry -->

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

## AI feature over HTTP

Use `kind: "api"` for an HTTP surface. Copy `assets/http-probe-port.mjs` and `assets/http-probe-port.conformance.mjs` into the evaluation's `adapter/` directory, then run `adapter/http-probe-port.conformance.mjs` there. The adopter owns the transport; eval-quality's `evaluateTarget` makes allow and deny decisions for address, method, scheme, redirects and ceilings. The fixture at [source fixture: http-probe-port.mjs](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-api/evals/grader/adapter/http-probe-port.mjs) runs this port against [source fixture: grader.js](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-api/server/grader.js). The server reports its bound port through `PORT_FILE`, avoiding a guessed port.

<!-- example:registry -->

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

## Workflow over its target kind

Choose the adapter for the workflow's actual interface. The working CLI fixture [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-workflow/evals/records/evaluation.json) registers create and read commands. Its contract's `interactionPlan` has `read-back` after `create`; `read-back.inputBinding.option.id` uses `{ "captured": "/interactions/create/stdout/id" }`. The first step mints a fresh ID, so a fixed literal would fail. The scorer uses the earlier observation from the same arm for the captured value. A skipped create or absent ID leaves no read-back observation and a visible skip reason.

<!-- example:registry -->

```json
{
  "interfaceId": "records",
  "executable": "records",
  "target": "bin/records.js",
  "subcommandPaths": [["create"], ["read"]],
  "artifacts": {},
  "environmentKeys": ["RECORDS_LOG", "RECORDS_OMIT_ID"],
  "maxElapsedMs": 30000,
  "infrastructureExitCodes": [3]
}
```

## Tool server over HTTP

When a tool server exposes HTTP, use the `api` registry shape and the adopter-owned `EnvironmentProbePort` in the AI feature example. Authorize its real methods and address. [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate-api/evals/grader/evaluation.json) proves the HTTP transport and dynamic port setup; it is a grader service fixture, not a tool server behavior fixture. The oracle for a tool server must judge the returned tool result and any protocol behavior the contract promises. Set `server.target` to the adopter's server inside `launch.root`, then set `server.portEnvironmentKey` and `server.portFileEnvironmentKey` to the keys that server uses. A bound port reported in the file is supplied to the port at run time.

<!-- example:registry -->

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

## Test-review mechanism

Classify its corpus by seeded test smells and clean tests. The source repository has seeded examples at [source fixture: checkout.spec.ts](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/test-review-eval/seeded/checkout.spec.ts) and [source fixture: orders.service.spec.ts](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/test-review-eval/seeded/orders.service.spec.ts), a clean control at [source fixture: profile.spec.ts](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/test-review-eval/clean/profile.spec.ts), and labels in [source fixture: ground-truth.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/test-review-eval/ground-truth.json). For a test-review skill, use the skill runner registry shape above and set `targetKind: "test-review-mechanism"`; for an own command, use the agent command shape. [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate/preflight/evaluation.json) proves only the skill runner transport. The adopter's review contract must define the seeded defects, clean control, and verdict observation. The example below is the stub runner transport that `preflight` runs, with the runner registered at its path inside `launch.root`; set `interfaceId`, `launch.root`, and `launch.skillRoot` to the review target's values when adapting it.

<!-- example:registry -->

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
  "egress": [
    {
      "host": "api.anthropic.com",
      "port": 443,
      "addresses": ["160.79.104.10", "2607:6bc0::10"]
    }
  ]
}
```
