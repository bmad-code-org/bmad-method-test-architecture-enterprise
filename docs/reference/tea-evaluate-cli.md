---
title: 'tea-evaluate CLI'
description: 'The Evaluate runtime: check, digest, preflight, run and score an evaluation folder, its disposable workspaces, controlled mutations, historical and gameability probes, rubric judge, evaluation layers and trial sets, and the generic skill runner, with their rules and exit codes'
---

# tea-evaluate CLI

`tea-evaluate` is the runtime behind the Evaluate workflow (`bmad-testarch-evaluate`).
It validates an evaluation folder and digests its corpus, so a stale index or a malformed artifact fails before anything runs, and it drives an evaluation's preflight against the real target, qualifying each seeded probe in a disposable workspace first: a controlled mutation through a proved rollback, a historical defect across the commit that fixed it.
It then runs every arm a probe needs (clean, mutated, historical and gameability) as sealed trial sets, judged by the evaluation layer the folder declares (TeA's deterministic evaluator with a rubric judge, an executable of your own, an agent reading the sealed brief, or records your own harness sealed), and hands them to `eval-quality score`, one call per probe.
This release ships five subcommands, `check`, `digest`, `preflight`, `run` and `score`; the compare and CI subcommands arrive with later Evaluate stories.
TeA also ships `tea-skill-runner`, the command an evaluation registers to run a skill.

## Prerequisites

- Node.js 22.20 or later, with TeA installed (`npm install --save-dev bmad-method-test-architecture-enterprise`), which provides the `tea-evaluate` bin.
- `eval-quality` 4.6.0 or later, installed beside TeA in the project that runs Evaluate (`npm install --save-dev eval-quality`).
  TeA declares it as an optional peer dependency, so a project that installs TeA only for its other workflows never receives it.
  Without it, `tea-evaluate` exits 12 and names the missing package.

`tea-evaluate` reads no BMAD configuration.
Every subcommand takes `--evaluation <path>`, naming the evaluation folder or its `evaluation.json`, and exits 64 when that flag is missing or resolves to no `evaluation.json`.
Nothing defaults to the working directory.

## The evaluation folder

```text
<evaluationId>/
  evaluation.json               # TeA manifest: target kind, interface, registry, launch, workspace, arms, trials, tiers, strength floor
  contract.json                 # the Behavioral Evaluation Contract
  probes/P-NNN.probe.json       # one committed probe per file, authored fields only
  mutations/M-NNN.mutation.json # one controlled mutation per file
  policy/scoring-policy.json    # eval-quality's scoring policy; required once a probe takes the controlled-mutation, historical or gameability route, and by run
  policy/evaluator-conditions.json # the model a run uses (and its rubric judge's or sealed-brief evaluator's), as a fixed condition; left out when no model runs
  policy/judge-calibration.json # labelled examples for every rubric criterion and anchored level; required when the contract has rubrics
  evaluator/                    # a command or sealed-brief-agent evaluator: mapping.json, and a command evaluator's executable
  adapter/                      # an api evaluation's HTTP port and its conformance file, rendered from the skill's templates
  corpus/                       # the corpus the probes run against
  corpus/gameability/P-NNN.json # a gameability probe's degenerate response, one response per plan step
  corpus-index.json             # written by tea-evaluate digest
  baseline/                     # committed qualified probes and baseline/qualification/ evidence
  runs/<invocationId>/          # written by each tea-evaluate invocation; gitignored
  .gitignore                    # ignores runs/ (the skill's assets/evaluation-folder.gitignore)
```

The runtime owns the schemas of `evaluation.json`, the committed probe, the mutation file, the degenerate response, `policy/evaluator-conditions.json`, `evaluator/mapping.json`, the judgment rows an evaluator answers and the report a sealed-brief agent's qualification writes (`evaluator-qualification.json`); they ship under `cli/lib/evaluate/schemas/` in the TeA package.
`contract.json` and `policy/scoring-policy.json` meet the schemas eval-quality publishes.

For a held-out set, put committed probe IDs in `evaluation.json` as `"heldOutProbes": ["P-002"]`. Each ID must name a committed probe, cannot name a clean control, and must leave a development probe for every affected behavior. Omit the field when every probe belongs to development.

Classify each permitted contract operation in `evaluation.json` under `operationPhases`, for example `"operationPhases": { "judge-request": "outcome" }`. Use `process` for an intermediate step and `outcome` for a result the behavior is judged on. `check` exits 10 when a permitted operation has no phase or a phase key names no permitted operation. Sealed observations identify an operation by ID alone, so operation IDs must be unique across interfaces.

When the contract declares rubrics, set `"judgeCalibration": { "minimumAgreement": 0.9 }` in `evaluation.json` and create `policy/judge-calibration.json`:

```json
{
  "items": [
    { "rubricId": "R-101", "criterionId": "RC-101", "response": "Response at level 0", "expectedLevel": 0 },
    { "rubricId": "R-101", "criterionId": "RC-101", "response": "Response at level 1", "expectedLevel": 1 }
  ]
}
```

Provide at least one item at every anchored level of every criterion. The file must be a regular file inside `policy/`; a link or named pipe is refused. `check` exits 10 for missing coverage or threshold.
A `records` evaluator with rubrics also needs the judgments your harness's own scorer made over these same items, written beside its records (see [The evaluation layer](#the-evaluation-layer)).

The calibration response follows the criterion's evidence channel. `stdout`, `stderr`, and artifact examples default to text when the pointer names the whole channel. Set `"responseKind": "json"` and write the whole JSON channel value in `response` for a JSON root. A pointer into JSON requires the whole channel value as JSON. Headers and call inputs require a JSON object. A response body that looks like JSON is parsed as JSON; set `"responseKind": "text"` when its literal text should be judged.

## check

```bash
npx tea-evaluate check --evaluation evals/my-evaluation
```

`check` prints one line per finding, `<file>: [<rule>] <message>`, and lists every finding.
A control, line-separator or bidirectional formatting character in a finding is printed as an escape (`\n`, `\u202E`), and a file name holding one is quoted, so no file name can print a line of its own.
It exits 0 when there are none and 10 when there is at least one.
The rules:

| Rule                       | Refuses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stale-index`              | a `corpus-index.json` whose digest differs from the folder's current bytes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `schema-version`           | an `evaluation.json` version the installed TeA does not know; the message names the installed TeA version and the versions it knows, and is reported alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `runtime-owned-field`      | a committed probe carrying a field the runtime writes: lineage, the attested digests, the system identifier, evidence references, the rollback flag, or a qualification field the mutation file owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `mutation-operator`        | a mutation whose operator is not `replace-exact` with exactly one occurrence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `provisioned-target`       | a mutation target inside a directory the workspace provisions, which every workspace holds read-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `web-interface`            | a contract interface of kind `web`; a web application is evaluated through `api`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `written-file-signature`   | a defect signature addressing a file the target wrote: the `artifact` channel, or a predicate pointer under `/interactions/<id>/artifact` on any channel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `oracle-count`             | a behavior discharged by a defect or gameability probe that does not declare exactly one oracle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `id-pattern`               | a probe, defect, behavior, oracle or mutation ID off its pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `qualification-digest`     | a public reference under `baseline/qualification/` whose recorded digest does not match the file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `clean-control`            | a clean control that is not `zero-action` with an expected-clean flag and no defects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `infrastructure-exit-code` | a defect signature or manifestation witness an infrastructure exit code could satisfy (see [The registry](#the-registry))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `unregistered-executable`  | a `cli` signature or a witness naming a target no registry entry declares                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `skill-root`               | a mutation whose `targetArtifact` is not inside `launch.skillRoot`, a `tea-skill-runner` leg or plan step whose `skill-root` is not `launch.skillRoot`, or a skill root inside a provisioned directory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `skill-runner`             | a `tea-skill-runner` registry entry that does not declare exit codes 3 to 6, or a leg or plan step for it with no literal `timeout-ms` below the entry's `maxElapsedMs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `trials`                   | an `evaluation.json` `trials` below the scoring policy's `minimumTrialCount`, so every trial set `run` seals would fall short of the minimum the scores read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `arms`                     | a probe whose arm `arms` does not declare (a clean control needs `clean`, a probe on the `controlled-mutation` route `mutated`, one on the `historical` route `historical`, a gameability probe `gameability`), or an arm `arms` declares that no probe runs on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `mutation-route`           | a probe on the `controlled-mutation` route that seeds no defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `evaluator-conditions`     | a registry entry that runs `tea-skill-runner`, which always runs an agent, with no `policy/evaluator-conditions.json` naming the model the run uses, or a `modelSnapshot` of `none` beside a `systemPromptDigest` other than `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, the digest of the empty byte string                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `gameability`              | a probe on the `gameability` route that is not a `gameability`-class probe with `expectedClean: false` and no defects, a `naiveOracle` of the probe's own behavior, or a degenerate response that is absent, answers a step the plan does not declare, leaves one unanswered, answers a step with a response of the other kind, or exits an infrastructure code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `historical`               | a probe on the `historical` route without `expectedClean: false`, that seeds no defect, or one whose `source` is not `natural`; one naming neither or both of `fixCommit` and `deployments`, one deployment without the other, one release for both, a deployment beside a registry entry that is not an HTTP entry, origins that are not an http or https origin for each HTTP interface of the registry and no other, or a deployment's `report` naming an operation the contract does not declare on an `api` interface the registry serves, one the contract marks as changing state, one that needs an input, or a pointer that is no JSON pointer                                                                                                                                                                                                                                                                                                                                                                                       |
| `judge`                    | a contract rubric under the deterministic evaluator with no `judge` in `evaluation.json` or no `judge.modelSnapshot` in `policy/evaluator-conditions.json`, a `judge` block in either file beside a contract with no rubric or beside any other evaluator kind, which scores the rubric itself, so nothing would use it, or a `judge` naming an adapter TeA lacks, the `custom` adapter with no `agentCommand`, or a `model` its adapter refuses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `held-out`                 | a held-out ID that names no committed probe, names a clean control, or leaves an affected behavior without a development probe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `operation-phases`         | a permitted operation with no phase, an undeclared operation with a phase, or an operation ID reused across interfaces when sealed observations cannot identify the interface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `judge-calibration`        | missing or malformed labelled calibration, uncovered rubric criteria or anchored levels, a missing minimum agreement threshold, and, for a `records` evaluator whose contract declares a rubric, `calibration-judgments.json` or `evaluator-configuration.json` that is absent, unreadable or does not verify (see [The evaluation layer](#the-evaluation-layer))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `evaluator`                | a `command` or `sealed-brief-agent` evaluator with no `evaluator/mapping.json`, or one binding an oracle, behavior or rubric criterion the contract does not declare, an oracle to a behavior that does not declare it, levels other than the criterion's anchored scale levels, an oracle or criterion under two keys, or leaving a rubric criterion unbound; a link or special file under `evaluator/`; a `command` executable that is not a regular executable file; a `sealed-brief-agent` on an adapter TeA lacks or one with no bridged run, the `custom` adapter with no `agentCommand`, a `model` its adapter refuses, `agentArgs` that reopen what the bridged run closes, or no `evaluator.modelSnapshot` in `policy/evaluator-conditions.json`; an `evaluator` block there beside the `deterministic` or `records` kind; a `sealed-brief-agent` whose `evaluation.json` declares no `evaluatorQualification`, or an `evaluatorQualification` beside any other kind; a `records` directory that is absent or reached through a link |
| `adapter`                  | a registry that declares an HTTP target while the folder holds no regular `adapter/http-probe-port.mjs` in a real `adapter/` directory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

An evaluator of an unknown kind, and a `command` or `sealed-brief-agent` evaluator with no `timeoutMs`, fail the `evaluation.json` schema (`schema`).
Beside those twenty-seven rules, `check` reports a file that does not parse (`json`), one that fails the runtime's schemas (`schema`) or eval-quality's (`engine-schema`), a file not named for its ID (`file-name`), a probe naming a behavior, mutation or naive oracle that does not exist, or an `interface` naming a kind the contract does not declare (`reference`), a folder with no `contract.json`, or with no `policy/scoring-policy.json` once a probe takes the `controlled-mutation`, `historical` or `gameability` route (`missing-file`), a `policy/evaluator-conditions.json` off the runtime's schema (`schema`), an ID declared twice in one file (`duplicate-id`), a registry that declares one interface and executable pair twice, names one interface as entries of two kinds or as two HTTP targets, names an HTTP `host` otherwise than a URL spells it, letter case aside, sends an `auth` header over `http` to an address eval-quality's `staysOnHost` says leaves the host, serves an interface as a kind other than the one the contract declares, holds tool servers eval-quality's `parseMcpTargetPolicy` refuses, a tool name it does not admit or two servers for one interface among them, or holds an HTTP entry, or a `deployments` origin of one, whose authorization eval-quality's `parseProbeTargetPolicy` refuses, with the parser's reason in the finding (`registry`), a symbolic link or file where `corpus/`, `probes/` or `mutations/` or an entry inside them should be (`corpus-file`), which `digest` refuses with exit 10 as well, and a symbolic link or other non-regular entry under `baseline/` (`baseline-file`).
A `baseline/qualification/` reference must resolve to a regular file inside the folder.

## The registry

`evaluation.json`'s `registry` is the execution-target registry: every command a run may spawn, every stdio MCP tool server it may start and every HTTP target it may reach, one registry entry each, in the shapes the runtime's `evaluation.json` schema defines.
The runtime builds eval-quality's default-deny command target policy, MCP target policy and HTTP target policy from it for the workspace each call runs in, so a request naming an interface, executable, tool, address or method the registry does not carry is denied before a process starts or a request is sent.
TeA's own harness declares its commands in the same shape and goes through the same builder.

A command entry:

```json
{
  "interfaceId": "tea-atdd-runner",
  "executable": "tea-atdd-runner",
  "target": "cli/atdd-runner.js",
  "subcommandPaths": [[]],
  "artifacts": { "scaffold": "tests/api/reservations.spec.ts" },
  "environmentKeys": ["ANTHROPIC_API_KEY", "HOME", "USER"],
  "maxElapsedMs": 1260000,
  "infrastructureExitCodes": [1, 3, 4, 5, 6]
}
```

- `interfaceId`, `executable`: the logical interface and executable a contract operation names; the pair is unique in the registry.
- `target`: a POSIX path relative to the evaluated project's root, or a bare command name resolved through the adapter's own `PATH`; never absolute, with no `.`, `..` or empty segment, no trailing slash, and no control, line-separator or bidirectional formatting character.
  The runtime's target check refuses a relative target that is missing, is not a regular file, or lacks its executable bit.
- `subcommandPaths`: the exact subcommand paths allowed; `[[]]` allows none.
- `artifacts`: the default path of each contract artifact, relative to the run's working directory, under the same path rules as `target`.
- `environmentKeys`: the keys a request may carry into the process; `PATH` is refused.
- `maxElapsedMs` (at most 2147483647), and optional `maxOutputBytes` (8 MiB by default): ceilings a run may lower.
- `infrastructureExitCodes`: the exit codes by which the target reports that it could not run.
  TeA's own per-workflow runners declare 1 (an uncaught exception) and 3 to 6; `tea-test-review`, which exits 1 on a failing verdict, declares 2 and 3; `tea-skill-runner` never exits 1 and declares 3 to 6.

A tool-server entry (`kind: "mcp"`) serves an `mcp` interface of the contract:

```json
{
  "kind": "mcp",
  "interfaceId": "grader",
  "target": "server/grader.js",
  "targetArgs": [],
  "tools": ["grade_answer", "describe_policy"],
  "environmentKeys": ["GRADER_TOKEN"],
  "maxElapsedMs": 30000
}
```

- `interfaceId`: the logical interface the contract declares with kind `mcp`; eval-quality's policy admits one entry per interface, since for a tool server the interface is the server.
- `target`, `targetArgs`: what starts the server, under the same path rules as a command's `target`, and its argument vector; the server works in the workspace the call runs in, so a relative path in `targetArgs` resolves there, and no argument may be an absolute path, carry one after `=`, name a `file:` URL, or hold a `..` segment, which would run or read your live tree in place of the workspace.
- `tools`: the tools a call may name, in the server's own spelling; a tool absent from the list is denied (`tool-not-authorized`) before the server starts, even when the server publishes it.
- `environmentKeys`: the keys whose host values the server starts with, over the host's `PATH`; a tool call carries only its arguments, so a credential reaches the server here. Each value of eight characters or more is replaced by `[redacted]` wherever it appears in what the server answers, in a string, an object key or a number (one whose text holds the value, or one of eight characters or more that the value read as a number equals).
  The forms replaced are the value as written and each form one or two levels of JSON escaping give it: `JSON.stringify`'s string body, with `/` written `\/` or not, and with every non-ASCII character, every `<`, `>` and `&`, or both written `\uXXXX` in lower- or upper-case hex, or none of them.
  A shorter value, one the server splits across fields, and any other encoding of it (base64, URL encoding, a third level of escaping) are not replaced. `PATH` is refused.
- `maxElapsedMs` and optional `maxOutputBytes`: the ceilings of one call, from the server's start through the handshake, the call and its teardown.

Each tool-server entry becomes one of eval-quality's `McpTargetAuthorization`s, checked by its own `parseMcpTargetPolicy` (at `check`, and again before any server starts), and every call goes through eval-quality's `createMcpAdapter`: one session per call over stdio, protocol `2025-06-18`, the server's process group torn down after it.
A leg of an `mcp` operation sends its literal `arguments`, and a plan step its bound ones (see [The interaction plan](#the-interaction-plan)), and the run records the call's arguments as `callInputs.arguments`, the tool's structured result as `responseBody` and its error flag as `responseStatus` (1 or 0), so an oracle reads `/interactions/<step>/response-body/...`.
A tool that answers with its error flag set is an observation.
A server whose process ends the session after the handshake and before it answers a call, by exiting or by a signal, is an observation too: eval-quality's `mcp` observation carries a signed `exitCode` beside `isError` true and an absent result, and the run records it with `responseStatus` 1, an absent `responseBody` and the `exitCode`, on the record's `exit-code` channel (`null` on every answered call), so an oracle reads `/interactions/<step>/exit-code` and a defect signature may name `exit-code` as its `observableChannel`.
A mutation that crashes a tool server is caught through that observation as a command that crashes is.
The exit code follows a command's convention: a signal is its number made negative, and the runtime applies a command's rule to it, so an end by a signal from outside (hang-up, interrupt, quit, kill or terminate) stops the run with exit 12 and any other code, a plain exit or a signal of the server's own such as an abort or a segmentation fault, is recorded.
A server that cannot start, refuses its handshake, ends or errors before or during the handshake, crosses a ceiling, or writes a line that is no JSON-RPC message is a target that could not run (exit 12), and its fault keeps the adapter's cause, scrubbed, a value the cause cuts short included.
The record reads the tool's `structuredContent`: a tool that answers with text `content` alone is recorded with an absent body, so an oracle has nothing to read (eval-quality's `mcp` kind describes a structured result).
`evaluation.json`'s `interface` must be a kind the contract declares (`check` rule `reference`).

An HTTP entry (`kind: "api"`) serves an `api` interface of the contract, through the evaluation's own HTTP port (see [The HTTP port](#the-http-port)):

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
    "environmentKeys": ["GRADER_TOKEN"],
    "portEnvironmentKey": "PORT",
    "portFileEnvironmentKey": "PORT_FILE",
    "readyTimeoutMs": 20000
  },
  "auth": { "header": "authorization", "environmentKey": "GRADER_TOKEN", "prefix": "Bearer " }
}
```

- `scheme`, `host`, `addresses`, `methods`, `safeMethods`, `maxRedirects` and the three ceilings: the fields of one authorization of eval-quality's HTTP target policy, which its `evaluateTarget` reads for every request and every redirect.
  The schema holds each at its JSON type alone, and eval-quality's own `parseProbeTargetPolicy` decides every rule over it (the schemes, the port range, the methods, the non-empty address and method lists, an address being an IP literal, the ceilings' minimums), so a rule eval-quality adds or changes reaches `check` with no copy in TeA.
  A duplicate address, method, safe method or `deployments` origin passes: the parser accepts duplicates and `evaluateTarget` takes the first authorization that matches.
  `check` hands the parser the policy each entry becomes, exactly as the runtime builds it: the entry's own authorization (a started server's at a placeholder port, since its real one is chosen at the call) and one authorization per `deployments` origin, each read alone.
  An authorization the parser refuses is a `registry` finding that names the entry or the deployment and carries the parser's reason, with its pointers read from `/authorizations/0`.
  The runtime builds each call's policy through the same parser before any service starts, so a registry built without `check` over a field the parser refuses stops the call with the parser's fault (exit 12).
  `host` is written as a URL spells it, letter case aside (an IPv4 address in dotted decimal, an IPv6 address compressed and unbracketed, a name in punycode), since the port hands the policy the hostname of the URL it sends to, and the policy reads both hosts in lower case with one trailing dot dropped; `check` refuses another spelling (`registry`) and names the URL's.
  `addresses` names the exact addresses the host may resolve to; a loopback, private, link-local or metadata address is allowed only when named, and any other is denied (`address-not-authorized`) before a request is sent.
  One HTTP entry serves one interface.
- `port`: a deployed target's port, reached as it is.
- `deployments`: other origins the interface is deployed at, each `{ "scheme", "host", "port", "addresses" }`, which a historical probe on the deployment route reaches (see [Historical probes](#historical-probes)).
  Each is an authorization of the interface with the entry's methods, redirects, ceilings and auth; `check` holds its `host` and, under `auth` over `http`, its addresses to the rules of the entry's own, and hands the parser each one as an authorization of its own.
  An origin listed twice passes, as a duplicate address does.
  A deployment joins the policy of its own deployment arm alone: every other call of the run, a redirect included, is decided over the entry's own authorization.
- `server`, in place of `port`: a service the runtime starts from the workspace for each call, as it starts a command or a tool server, so the code that answers is the workspace's, a mutation included.
  `target` and `targetArgs` follow a tool server's rules, `environmentKeys` names the keys whose host values it starts with, and `portEnvironmentKey` and the optional `portFileEnvironmentKey` the keys its port handoff uses (see [A started service's port](#a-started-services-port)).
  It starts only once the port's policy has allowed the call and the runtime's own `evaluateTarget` call agrees, through eval-quality's command mechanism in a process group of its own, which ends with the call; the call is sent once the address eval-quality allowed accepts a connection on the service's port, within `readyTimeoutMs`, and `maxElapsedMs` counts from then.
- `auth`: a header every request of the interface carries, holding `prefix` and the host's value for `environmentKey`; the port adds it, no request record carries it, and no redirect to another origin receives it.
  `preflight` and `run` exit 10 when the host does not set that key, since a call with no credential would read its refusal as the target's behavior.
  Over `scheme: "http"` every address must be one eval-quality's `staysOnHost` keeps on this host, since the header would otherwise cross the network in clear text; `check` refuses any other (`registry`), the NAT64 (`64:ff9b::7f00:1`) and IPv4-compatible (`::127.0.0.1`) spellings of a loopback address included, since a connection to either goes through a translator and leaves the host.
  A credentialed target at any other address, a private one such as a docker-compose service included, is served over `https` with `scheme: "https"`; when a private certificate authority signed its certificate, set `NODE_EXTRA_CA_CERTS` in the host's environment to that authority's PEM file, which the port's process inherits.

Each value a started service's keys and an auth header carry, of eight characters or more, is scrubbed from every answer and cause as a tool server's are, and from a fault's message and cause lowercased as well, since a URL lowercases the host a redirect names and a denial quotes it.
A failure quotes the last 2000 characters of what the port's process or a started service printed, scrubbed whole before the cut, so the cut never leaves part of a secret.
A request records its `path`, `query`, `header` and `body` inputs as `callInputs`, and the answer's status, headers and body as `responseStatus`, `responseHeaders` and `responseBody`, so an oracle reads `/interactions/<step>/response-body/...`; every answer is an observation, at any status.
A service that exits before it accepts a connection, does not accept one within `readyTimeoutMs`, crosses a ceiling, or stops during a call is a target that could not run (exit 12), its cause kept scrubbed.
A service not accepting within `readyTimeoutMs` is reported with the last connection attempt's error code: `ECONNREFUSED` while nothing listens on the port, and `EADDRNOTAVAIL` when the host has no local port left to connect from.
A path value that reads as `.` or `..` is refused before anything is sent, since a URL would resolve it into another path than the one the call records.

An infrastructure exit code says the target could not run, so it cannot be evidence of a behavior.
`check` resolves each defect signature and each manifestation witness through eval-quality's own `resolveCheck` over an observation that carries one of those codes and no output, with the contract's reference sets in scope, and refuses the probe when the expression could hold (`true` or `insufficient-evidence`) or cannot be resolved at all.
`exit-code != 0` against a runner that exits 3 when its agent is missing would read every broken installation as a caught defect.
Address an exit code, stream or body only the defect produces.

### Denial reasons

A denied call is recorded with eval-quality's `forbidden-target` fault and, from eval-quality 4.2.0, the `reason` its policy gave, for a command, a tool call and an HTTP request alike.
The reason sits beside the fault's code and detail in a leg's `faults/` file, a qualification's or trial's fault and a sealed-brief agent's bridge calls, and `preflight` and `run` exit 10 and name it.
A CI policy or a test keys on the `reason`.

| Reason                           | The policy denied                                                     |
| -------------------------------- | --------------------------------------------------------------------- |
| `interface-not-authorized`       | a call to an interface the registry does not authorize for that kind  |
| `executable-not-authorized`      | a command whose executable is not listed                              |
| `subcommand-not-authorized`      | a command whose subcommand is not listed                              |
| `environment-key-not-authorized` | a command request carrying an environment key its entry does not list |
| `tool-not-authorized`            | a tool the server's entry does not list, even when the server has it  |
| `scheme-not-authorized`          | an HTTP request whose scheme the entry does not admit                 |
| `host-not-authorized`            | an HTTP request whose host the entry does not admit                   |
| `port-not-authorized`            | an HTTP request whose port the entry does not admit                   |
| `address-not-authorized`         | an HTTP request whose resolved address the entry does not list        |
| `address-unparseable`            | an HTTP request whose resolved address cannot be parsed               |
| `method-not-authorized`          | an HTTP request whose method the entry does not list                  |

## The HTTP port

An `api` evaluation carries its own HTTP port: `adapter/http-probe-port.mjs`, rendered unchanged from the Evaluate skill's template, beside `adapter/http-probe-port.conformance.mjs`.
TeA holds no HTTP client of its own.
The port's default export builds eval-quality's environment-probe port from configuration alone (where each interface is, eval-quality's HTTP target policy, auth headers and a transport), and eval-quality's `evaluateTarget` decides every allow or deny, once per request and once per redirect hop, so the port classifies no address and a fix to the policy reaches it with eval-quality.
It resolves a host once per hop, to its first address, and sends to the address eval-quality allowed with the host in the Host header.

`tea-evaluate` never loads the port into its own process.
For each call it starts the port file as a Node process of its own, whose last lines hand the port to TeA's host, which serves the call over file descriptor 3, a channel the runtime opens for its protocol alone; keep those lines when you edit the file.
What the port prints on its standard output and error is its own: the runtime keeps both, up to 1 MiB together, and quotes their end when a call fails, so a `console.log` in the port breaks nothing, and printing past that ceiling ends the call.
The port's process starts with the host's `PATH` and `NODE_EXTRA_CA_CERTS` alone (the latter lets it trust an https target a private authority signed), receives the call's configuration and the auth value of the call's own interface alone on that channel, and ends with the call.
Each call holds the file to the bytes `preflight` or `run` asked for the protocol, and a changed file stops the run (exit 12).
`preflight` and `run` start the port once before anything else and exit 10 when it does not answer as TeA's host, and 12 when its process cannot start or answer in time.
A port that answered then and breaks the protocol during a call (a line on its channel that is no message, output past a ceiling, no answer within the call's ceiling, or an answer eval-quality's own `ProbeObservation` parser does not read or that answers another request) stops the run with exit 12 (`port-contract-violation` for the answer), as an evaluator emitting output outside its import contract does; such an answer is never judged as the target's behavior.
The port file imports `eval-quality` and TeA's package as bare names, which Node resolves from the port file's own location: a `node_modules` in the evaluation folder or a folder above it must hold both, as the project's own install of TeA with its `eval-quality` peer does (see [Prerequisites](#prerequisites)).
A `tea-evaluate` run from a global install or through `npx`, with neither installed above the evaluation folder, leaves the port unable to start (exit 10 at `preflight`).

`node adapter/http-probe-port.conformance.mjs`, run from the evaluation folder, runs eval-quality's environment-probe conformance suite over the port against a loopback stub it starts and closes itself, so it needs no deployed target and no secret, and exits 0 only when every assertion passes.

### A started service's port

A registry `server` receives its port in one of two handoffs.

With `portFileEnvironmentKey`, the service reports the port it bound.
The runtime passes `0` in `portEnvironmentKey` and the path of a file in a private directory in `portFileEnvironmentKey`; the service binds a port the system chooses and writes that port's number to the file once it listens (in Node, `server.listen(0)`, then `server.address().port` written to the file).
The runtime sends only once the file names a port, a whole number from 1 to 65535, that accepts a connection while the service runs, and the port probes the call again at that port, so eval-quality's policy decides there before anything is sent.
No other process can answer on a port the service holds.
A service that writes no port within `readyTimeoutMs`, or writes anything other than a port number, is a target that could not run (exit 12).
The runtime reads the file without following a link and without waiting on it, so a link, a named pipe, a device or a file longer than 16 bytes in its place counts as anything other than a port number.
The file's directory is on the run's list of private directories, so a signal that ends the run removes it.

Without `portFileEnvironmentKey`, the runtime chooses the port, for a service that cannot report its own.
It takes a free port, releases it just before the service starts, and passes its number in `portEnvironmentKey`.
A port another process already listens on when the service is to start is refused, and an answer that arrives after the service ended other than with exit code 0 is refused, since no service of the run gave it; both stop the run with exit 12.
This handoff leaves a window: another process can take the port between its release and the service binding it, and when that process answers before the service's failure to bind is reported, its answer is recorded as the service's.
Name `portFileEnvironmentKey` whenever the service can report its port.

In either handoff, an answer the port gives before the call's service is ready, as from a port that never asks the runtime to start the service, is refused (exit 12).
`check` refuses (`registry`) a `portFileEnvironmentKey` equal to `portEnvironmentKey`, and either key named in `environmentKeys`, since the runtime sets both.

## The launch

`evaluation.json`'s `launch` says where the target lives.

```json
{
  "root": "../..",
  "skillRoot": "skills/my-skill"
}
```

- `root`: the evaluated project's root, relative to the evaluation folder.
  It is POSIX, may climb out of the folder with `..`, and is never absolute.
  It resolves from the folder's real location: an `--evaluation` path through a symbolic link reaches the same root as the folder's own path.
  Registry targets, the skill root and every mutation's `targetArtifact` resolve against it, and `preflight` runs its arms and legs in disposable workspaces made from it (see [The workspace](#the-workspace)).
- `skillRoot`: the skill directory, holding `SKILL.md`, relative to `root`, with no `.` or `..` segment.
  Required when the evaluation's target kind is `skill`; it is the `--skill-root` every skill-runner leg must pass, and `check` refuses a mutation outside it or a leg passing another (`skill-root`).

## The workspace

Every mutation and every arm and leg of a run happens in a disposable workspace, so the runtime itself writes nothing into your tree.
Every process a target starts runs confined to that workspace (see [File-system confinement](#file-system-confinement)), so a write outside it is refused.
In a run that opted out of confinement, a target that writes outside its workspace anyway (through an absolute path, or through the git state a worktree shares with your repository) is detected afterwards, and the run exits 12, as the end of this section describes; a confined run keeps the same checks.
`evaluation.json`'s `workspace` chooses the first one, the pristine workspace:

- `kind: git`, with `launch.root` inside a git repository that has a commit: a detached worktree at `HEAD`, made with `git worktree add --detach` and your repository's hooks disabled.
  The evaluated commit is recorded, and uncommitted changes are left out of the run, which says so on stderr.
  `launch.root` must be tracked at that commit, and must hold no git submodule, which a worktree checks out empty (exit 12; pass `--from-working-tree` to copy the checked-out tree instead).
- `kind: copy`, or `kind: git` with `launch.root` outside any git repository: a temp copy of `launch.root`, without `.git`, identified by its tree digest; no commit is recorded, since no commit names those bytes.
- `preflight --from-working-tree`: a temp copy of the working tree, uncommitted work included, whatever the kind.
  It is the one workspace recorded as `dirty: true`, and a dirty run cannot become a baseline.
  A run is recorded dirty as well when the evaluation folder, which it reads from your working tree, holds uncommitted work.

Every other workspace of the run (one per seeded probe's qualification, one per mutation, and for `run` one for the clean controls' qualification and one per trial) reproduces the pristine one: a worktree of the same commit, or a copy of what the pristine copy held when it was made, whose tree digest must match.
The pristine copy keeps that snapshot beside itself, without its provisioned directories, since the legs run in it and a target that writes (a workflow step that stores a record, say) changes it; a snapshot changed after it was made no longer matches, and the reproduction exits 12.
A reproduction copies the provisioned directories the pristine copy held when it was made from its read-only copies, and no other; one planted in the snapshot, or a read-only copy moved out of the pristine copy, exits 12.
The evaluation folder is left out of every workspace, so nothing the runtime hands a target holds the contract, the probes or which defect a mutation plants.
Each `workspace.provision` directory (for example `node_modules`, which a worktree lacks) is copied into the workspace, as a copy-on-write clone where the file system offers one, and its write bits are removed, so a write under it fails unless the writer restores the bits first (root ignores them).
A mutation cannot target a file inside it (`provisioned-target`), and a provisioned directory that is itself a symbolic link is refused with exit 12.
Every symbolic link under `launch.root` in the workspace resolves inside the workspace: a link into the project is re-pointed at the same place in the workspace, and a link that leads out of the project is refused with exit 12, as is a FIFO, a socket or a device, or a temp directory (`TMPDIR`) inside `launch.root`, or inside the repository holding it unless the repository ignores that directory.
Each link is resolved as the system resolves it, so a `..` after a link climbs from the link's target.
A workspace is removed when the command ends, a worktree's entry in your repository included, and also on `SIGINT`, `SIGTERM`, `SIGHUP` or `SIGQUIT`, which stop the running leg and then end the command by the same signal.
Each workspace has a workspace marker and a sidecar ownership marker outside the target subtree, plus an ownership journal under the evaluation's ignored `runs/` directory. A killed run can leave a temporary copy or a detached worktree and its Git registration. The next preflight for the same evaluation checks the held journal, markers, project identity and owner process, then reports and reclaims verified scratch from a dead run before reading your project's state. The sidecar marker survives interrupted directory removal. A live or unverifiable owner's workspace remains in place. The journal records the original temporary directory, so recovery still works after `TMPDIR` changes.

A worktree shares your repository's git directory (its refs, configuration, hooks, `info/` and objects); a confined target can read it and cannot write it, and in a run that opted out a target running git in the worktree can change it, which the run detects afterwards and exits 12.
`preflight` reads your project before the workspaces are made and again after the qualification and after the legs: in a git repository, `git status` (tracked and untracked paths), the content of every path it names, every ref, and the common git directory without its object store, reflogs, worktree records, index and submodule or LFS stores; outside one, the tree digest of `launch.root` without the evaluation's `runs/`.
A change exits 12, no qualified probe is written and the probe list handed to the CLI is removed, so a target that writes into your tree, commits, tags or reconfigures the repository fails the run.
The rollback cycle records the real directory that holds the `targetArtifact` when it plans the mutation, and writes and reads the target only from inside that directory, entered and confirmed to be the one it recorded, so a path swapped for a symbolic link, even by a process the target left running, cannot carry the runtime's own write out of the workspace; a swap or a hard-linked target it sees stops the cycle with exit 12, and the mutation and the restore each write a new file.
Gitignored paths are not read.

`runs/<invocationId>/run.json` records what was evaluated: the TeA and eval-quality versions, the commit (`null` for a copy), `dirty`, the workspace's kind, commit, tree and tree digest, the path of every workspace that ran legs, the file-system confinement the targets ran under (`confinement`: `seatbelt`, `bubblewrap` or `opt-out`), and whether your project was unchanged.
It lists each probe the run refused, with its reason, under `refused` (see [Historical probes](#historical-probes)).
A completed `run` adds the contract, corpus, sealed brief and evaluator configuration digests, the matcher `seed`, the runner (each registry entry's interface, executable and target, or a tool server's interface, target, arguments and tools), the evaluator and the model, the rubric judge (`null` when the contract declares no rubric or the evaluator is not the deterministic one; otherwise its adapter, model, model snapshot, instruction digest and number of calls), the trial count, the start time and duration, and `completed: true`.

### File-system confinement

`preflight` and `run` confine every process they start, before any of them starts, through the mechanism the host provides:

- macOS: Seatbelt, through `/usr/bin/sandbox-exec` and a profile the runtime generates for each call.
- Linux: Bubblewrap, through `bwrap` on `PATH` (`apt-get install bubblewrap`), in an unprivileged user namespace with a read-only view of `/`, a process-id namespace and procfs of its own, and an empty `/run/user`.
  What a target leaves running ends with it, and killing the `bwrap` the runtime started ends what that process forked.

The runtime first confines a trivial process through the mechanism, since a host can carry the executable and still refuse it (a kernel that forbids unprivileged user namespaces).
A host with neither mechanism, or one whose mechanism refuses, stops the command with exit 12 and names the reason.
`sandbox-exec` cannot apply a profile inside a Seatbelt sandbox that restricts anything, so a `tea-evaluate` started from a sandboxed shell (an agent's tool, say) is refused on macOS; run it from an unsandboxed terminal.
A temp directory (`TMPDIR`) inside the evaluation folder, or an evaluation folder or temp directory whose path holds a quote, a backslash or a line break, is refused the same way, since no profile can carry it.
Set `"confinement": false` in `evaluation.json` to run the targets unconfined instead; `run.json` then records `"confinement": "opt-out"`, and a confined run records `"seatbelt"` or `"bubblewrap"`.

Each target runs confined, and so does every process it starts, one still running after the target exits, one started with `setsid` and one left behind by a killed target included. A confined process:

- writes its workspace's checkout and nothing else, apart from the private directories the runtime hands it (the file a started HTTP service reports its port in, the audit report below, and a temp directory of its own for each call, which `TMPDIR`, `TMP` and `TEMP` name and which is removed when the call ends);
- can neither read nor write anything under the evaluation folder: `contract.json`, `probes/`, `mutations/`, `corpus/`, `evaluator/`, `runs/` and the rest; Seatbelt answers `EPERM`, and Bubblewrap covers the folder with an empty read-only file system, so a read answers `ENOENT` and a write `EROFS`;
- reads the rest of the host, the project's git directory included, since Node, git and your toolchain read from the system.
  That git directory holds every committed file of the evaluated commit, the evaluation folder's among them: the confinement withholds the evaluation folder's files on disk, and a target that runs `git show` against the commit still reads the committed contract;
- cannot change its worktree's git state: `git add`, `git commit`, `git stash` and `git checkout -b` write the index, objects and refs in the project's git directory, outside the workspace, and fail; a target that must commit opts out;
- cannot start a setuid program under Seatbelt (`ps` and `sudo` on macOS), which the system refuses to any sandboxed process; `pgrep` lists processes there;
- cannot confine a process of its own through `sandbox-exec`, which applies no profile inside a restricting sandbox.

Every other process the run starts to run your code or an agent (a `command` evaluator, a sealed-brief agent and the bridge relay it starts, the rubric judge, the evaluation's HTTP port) runs with the evaluation folder read-only, `evaluator/` and `runs/` included, so no process of the run can swap a file of the evaluation layer between the runtime's re-read of it and the evaluator's launch (see [The evaluation layer](#the-evaluation-layer)), or rewrite the run's evidence.
An evaluator that writes a cache beside itself under `evaluator/` fails its write in a confined run; it may write its working directory, your home directory and the rest of the host.

Each trial also audits what its targets open.
Every Node process of the trial loads TeA's audit through `NODE_OPTIONS` (`--require` of `cli/lib/evaluate/confinement-guard.cjs`), which reports each path the process hands Node's `fs` functions to open, read, list or write outside what the trial was granted: its workspace, the Node installation it runs from, the operating system's own directories (`/System`, `/usr`, `/bin`, `/sbin`, `/dev`, `/etc`, `/lib` and their like), and the `systemPaths` of the target's registry entry.
A path is judged and reported by its real path, so a link in the workspace that leads outside it reports the path it leads to.
A read of a path that does not exist, and a metadata probe (`stat`, `access`), are not reported; a write outside the grants and every access to the evaluation folder are reported, refused or not, the evaluation folder even under a declared system path.
The module loader's own lookups (`require` and `import` resolve paths through Node's internal bindings) are not seen.
The trial set's isolation manifest lists the reported paths as `observedMounts`; none is an allowed mount, so `score` exits 3 (Invalid) with eval-quality's isolation violation, one `mount outside allowlist` reason per path.
A registry entry names what its target legitimately reads outside the workspace as absolute `systemPaths`:

```json
{
  "interfaceId": "verdict",
  "executable": "verdict",
  "target": "bin/verdict.js",
  "subcommandPaths": [[]],
  "artifacts": {},
  "environmentKeys": [],
  "maxElapsedMs": 20000,
  "infrastructureExitCodes": [3],
  "systemPaths": ["/opt/verdict-rules"]
}
```

A tool-server entry and an HTTP entry (for its started service) take `systemPaths` the same way.
The audit grants a process the system paths of the target it runs, so `check` refuses two entries that start the same target with different `systemPaths`.
The audit is written by the target's own processes and covers Node processes alone; the mechanism is what refuses, whatever the process.
The report file is the one file of the audit a target may write.
The runtime reads the report when each confined call ends, and a report it cannot open or one cut shorter than an earlier read found it counts against the trial for the rest of the run.
A Bubblewrap that fails before it starts the target (a refused bind, say) ends the call as an infrastructure error naming Bubblewrap's message, since no target ran.
A report cut shorter than an earlier read found it, or padded past what the runtime reads, is listed as its own path in `observedMounts`; a target that rewrites the file to the same length can still hide a line from it.
A Bubblewrap target shares the host's network namespace, so that a started HTTP service stays reachable, and with it any abstract Unix socket on the host, a desktop session's D-Bus among them.
Story 1.63 moves the audit onto a channel the runtime holds and closes that route.

A confined run's isolation manifests account for each forbidden input with a note naming the confinement that withheld it (`Withheld as well by macOS Seatbelt (sandbox-exec) file-system confinement: ...`, or `Linux Bubblewrap (bwrap)`); an opted-out run's note says the runtime does not sandbox the target's file system.
`score` over an opted-out run says so in its summary line, and its `score.json` records the run's `confinement`, so an opted-out verdict is marked as one.

## The interaction plan

Every arm runs the contract's `interactionPlan` once, one request for each step it issues: a qualification arm, a trial, and a gameability trial, which answers each step from its degenerate response.

### Binding kinds

Each key of a step's `inputBinding` channels is sent as its binding says:

- `literal`: the value as written.
- `captured`: the value its pointer (`/interactions/<stepId>/<channel>/<key>`) resolves to on the observation the named earlier step recorded in the same arm, read by eval-quality's own `makeResolveOperand`, the reading `eval-quality score` gives the pointer; a workflow binds a later step to an identifier an earlier step minted this way.
- `matcher: any`: a deterministic value of the declared JSON type. The value is derived from the run seed, step, channel and key. Pass `--seed <value>` to repeat the same bytes, and read the seed from `run.json`.
- `matcher: type-violating`: a value whose JSON type differs from the declared type. String transports refuse this matcher because they cannot carry the differing type.
- `principal`: the runtime reads the host credential named by `evaluation.json`'s `principalMappings.<name>.environmentKey`, applies its optional prefix, and sends it through the mapped registry interface. The contract carries the principal name only. Persisted requests and `callInputs` replace the credential with `{ "principal": "<name>" }`, and the observation records the same opaque label in `principal`.

A step's observation records the values it was sent as its `callInputs`, so a captured value is the one the earlier observation carried, a JSON `null` and a number included.
`eval-quality compile` holds a captured pointer to one key of the channel the named step's operation describes, whose declared type is a scalar equal to the bound parameter's, and refuses a pointer naming a step the plan does not declare (`unreachable-check-evidence`).

### Step order

A step runs after the step its `after` clause names and after every step its captured bindings read, and otherwise in plan order, so a step may come before the step it reads in the plan.
Each observation's `sequence` counts the steps in the order they were issued, which is the order `eval-quality score` holds a captured value and an `after` clause to.
`eval-quality compile` refuses a plan whose capture and `after` edges form a cycle (`binding-cycle`) and an `after` clause naming a step with one of its own (`nested-temporal-clause`), and `preflight` and `run` pass its exit 4 and its message through before any arm runs.

### Steps not issued

A step is not issued when its `after` step was not issued, or when one of its captured bindings resolves to nothing: the step it reads was not issued, or that step's observation lacks the value (a field its output does not hold, or output that is not JSON).
A step is not issued either when a captured value is one the request cannot carry as the target printed it: a value holding a `__proto__` key, which eval-quality's request parser drops, a header or environment value that is no string, a header value holding a control character or one past U+00FF, or a path value that is `.` or `..`, which the evaluation's HTTP port refuses, or a command argument, option or environment value holding a NUL character, which no process argument or variable can.
A command step with a captured binding is not issued either when the value makes its launch too large for the system's argument and environment limit.
The limit is the system's: eval-quality's launch decides it and reports the refusal as a `port-failure` whose `portFailureReason` is `launch-too-large`, the runtime computes no size, and the step is recorded as `captured-value-unsendable` naming each of its captured bindings in the `argument`, `option` and `environment` channels, since a refused launch cannot say which value was too large; a captured `stdin` value is written after the launch and is never named.
Such a step sends no request and records no observation, and the arm's evidence lists it in `steps` in its place as `{ "stepId", "operationId", "skipped" }`, whose `reason` is `after-step-not-issued` (naming the `after` step), `captured-value-absent` (naming each binding and its pointer) or `captured-value-unsendable` (naming each binding, its pointer and why).
A command step with no captured binding in those channels that the system refuses for its size still stops the run with exit 12, since the contract itself cannot be sent, and the fault it records carries the `portFailureReason`.
The runtime computes no outcome from it: eval-quality reads the missing observation as it reads any evidence that does not exist, so an oracle over the step resolves over absent evidence, and a seeded probe whose defect signature names the step's operation is `not-applicable` in a trial that never issued it, which never counts toward `caught`.
A qualification arm is judged over the same absent evidence, so a clean arm whose step was not issued does not pass when an oracle needs that step, and the run exits 11 as for any clean arm that does not pass.
A trial's records and isolation manifest count only the calls it made.

## Controlled mutations

A mutation is `mutations/M-NNN.mutation.json`: a `targetArtifact` relative to `launch.root` (not to the repository, when `launch.root` is a subdirectory of it) and a `replace-exact` operator whose `find` text must occur in that file exactly once, overlapping occurrences counted.
A probe that seeds a defect on the `controlled-mutation` route names its mutation, and `preflight` qualifies it through six steps in a workspace of its own, before any preflight leg runs, so nothing its arms leave behind reaches another probe or a leg:

1. The clean arm: every interaction plan step once, with its bindings (see [The interaction plan](#the-interaction-plan)), through the registry.
   Each oracle of the behaviors the probe discharges is resolved by eval-quality's `resolveCheck` over the arm's observations, and every one must hold.
2. The mutation, applied in the workspace.
3. The mutated arm, in which at least one of those oracles must be violated.
4. The original bytes, restored with the file's original mode, also when the mutated arm could not run.
5. The restored file's digest and mode, which must equal the pre-mutation ones.
6. The clean arm again, until it passes, at most `1 + reExecutionCap` times (`reExecutionCap` from `policy/scoring-policy.json`).

`rollbackVerified` is true only when step 5's digest and mode match and step 6 passes.
The evidence goes to `runs/<invocationId>/qualification/<probeId>/`: `baseline-pass.json` and `mutated-fail.json` (each arm's requests, observations and oracle resolutions), `rollback.json` (`preDigest`, `mutatedDigest` and `restoredDigest` of the `targetArtifact`, each `sha256:` and the hex SHA-256 of its bytes, and every re-run), and `fault.json` when an arm could not run.
The qualified probe, with the runtime's digests and references to that evidence, is checked against eval-quality's probe schema and its qualification gate, handed to `eval-quality preflight`, and written to `runs/<invocationId>/probes/` only once your project is confirmed unchanged after the legs.
A step that fails writes no qualified probe:

| Exit | Cause                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10   | the `find` text occurs in the target other than exactly once, the target is not a regular file, an arm's request is one the registry does not authorize, or the qualified probe fails eval-quality's checks               |
| 11   | the clean arm does not pass, or the mutated arm does not fail                                                                                                                                                             |
| 12   | the mutation or the restore cannot be written, the restored digest or mode differs, an arm cannot run or exits an infrastructure code, the restored workspace does not pass again within the cap, or your project changed |

A restored workspace that no longer passes is an unfit harness (exit 12): the target is byte for byte what it was, and eval-quality reads a re-execution cap exceeded as a harness that does not reproduce its result, never as a weak contract.
Each mutation then gets a mutated workspace of its own, whose `targetArtifact` digest must equal the one the cycle measured.
A seeded probe on a route other than `controlled-mutation` or `historical` exits 12 before any workspace is made.

## Historical probes

A historical probe seeds a real defect that a release fixed: its defects carry `source: natural`, and its qualification names the fix boundary in one of two ways.
A probe that names `fixCommit` runs from worktrees at two git revisions of the evaluated project; a probe that names `deployments` runs against two deployments of a target reachable only over HTTP, which no worktree can launch.
`check` refuses a probe that names neither or both (`historical`).

### From worktrees

The qualification names the fix commit by its hexadecimal id (7 to 40 lowercase hex digits), never a ref, which would move as history advances:

```json
{ "route": "historical", "fixCommit": "4f9c2d1" }
```

The post-fix revision is that commit and the pre-fix revision its first parent, both by full identifier.
A `fixCommit` that names no commit in a repository with its full history, or that resolves through a branch or tag of the same spelling, is an authoring defect: the command exits 10 naming the probe.
The probe is refused, with its reason, when the pristine workspace is a copy rather than a git worktree (a `copy` workspace, a target outside git, or `--from-working-tree`); in a shallow clone, when `fixCommit` or its parent is not in the shallow history (fetch the full history to qualify it); when it is not an ancestor of the evaluated commit (or git cannot tell, when the reason is git's own error); when it has no parent (a one-commit repository, say); or when the target cannot run at a revision, before or at the fix: its worktree lacks `launch.root` or holds a submodule under it, the skill root is not a directory, or a registry target is missing or not executable, the same checks a launch meets (links followed, provisioned copies included). Both revisions' worktrees are checked before either arm runs.

`preflight` qualifies the probe in two worktrees of its own, before any leg runs: the interaction plan once at the pre-fix revision, where the oracles of the probe's behaviors must be violated (`fail-before.json`), and once at the fix commit, where they must hold (`pass-after.json`).
The qualified probe records `fixCommitDigest` (`sha256:` and the SHA-256 of the fix commit's full identifier) and as its `artifactDigest` the tracked tree of the implementation root at the pre-fix revision, where the defect lives.
Each defect's manifestation-witness leg runs in a worktree at the pre-fix revision, and `run` runs the probe's trials on the arm `historical:<preFixSha>`, each in a fresh worktree at that revision.

### Against deployments

The qualification names a pre-fix and a post-fix deployment: the release identifier each runs, how it reports that release, and the origin each HTTP interface of the registry answers at in it.

```json
{
  "route": "historical",
  "deployments": {
    "preFix": {
      "release": "grader-1.4.2",
      "report": { "operationId": "report-release", "pointer": "/release" },
      "origins": { "grader": "https://grader-1-4-2.staging.example.test" }
    },
    "fix": {
      "release": "grader-1.4.3",
      "report": { "operationId": "report-release", "pointer": "/release" },
      "origins": { "grader": "https://grader.example.test" }
    }
  }
}
```

- `release`: the identifier the deployment runs, as you name your releases (a version, a tag, a build id): a letter or digit, then letters, digits, `.`, `_`, `+` or `-`, at most 128 characters.
  The run asks each deployment which release it runs (see `report`) and refuses the probe when the answer is another identifier, so name the release each deployment reports.
  `check` refuses one release for both deployments.
- `report`: how the deployment reports its release, `{ "operationId", "pointer" }`, both required.
  `operationId` names an operation of an `api` interface of the contract that the registry serves over HTTP; the request goes to the origin this deployment names for that interface.
  It is a permitted operation of the contract like any other, so `operationPhases` in `evaluation.json` names its phase, and adding it changes the compiled contract.
  The request reads a release and goes to each live deployment before any arm runs, so `check` refuses an operation the contract marks as changing state.
  It is sent with no bound inputs, so `check` refuses an operation whose path template has a parameter or whose request shape requires a key in any channel.
  One operation reports one interface's release: the run holds that interface's deployment to the declared `release` and asks the deployment's other interfaces nothing.
  `pointer` is an RFC 6901 JSON pointer into the JSON body of the answer; `check` refuses one that is empty, has no leading `/`, or holds a `~` that is not `~0` or `~1`.
- `origins`: `scheme://host[:port]` for every HTTP interface of the registry and no other, spelled exactly so with at most a trailing `/`: no path, query, fragment, credentials or surrounding space.
  The authority is the one a URL keeps, letter case aside (an IPv4 address in dotted decimal, an IPv6 address as the URL writes it, a name in punycode), so the origin a run records is the one it reaches.
  Each origin must be one the registry authorizes for its interface: the entry's own origin, when the entry names a deployed `port`, or an origin its `deployments` list names (see [The registry](#the-registry)).

`check` refuses a probe that names one deployment without the other, and one in an evaluation whose registry holds an entry that is not an HTTP entry, since a deployment is reached over HTTP alone.
It also refuses a pre-fix origin that reaches a post-fix one, for the same interface or another, read by scheme, host (lower-cased, one trailing dot dropped, an IP address as eval-quality's `parseAddress` reads it, so `[::ffff:7f00:1]` is `127.0.0.1`) and port, since the fail-before arm would then reach the post-fix deployment.
Before either arm runs, the runtime resolves each origin's host once, to its first address, as the port does, within the entry's `maxElapsedMs` and the 15 seconds a port call gets beyond it, and asks eval-quality's `evaluateTarget` which of those authorizations allows the origin, at the first method the entry authorizes.
A deployment none of them allows refuses the probe, the reason naming each authorization's denial in eval-quality's words (`port-not-authorized`, say).
An origin whose scheme, host or port no authorization admits is refused before its host is resolved, as the port denies an unresolved host; a host some authorization admits that does not resolve in time leaves the deployment unreachable, which stops the run with exit 12.
The authorization eval-quality allowed is the whole policy of the deployment's arm for its interface, so a redirect to any other origin, the other deployment's included, is denied.
Once both deployments are allowed, and before either arm runs, the runtime sends each deployment, the pre-fix one first, its `report` request through the evaluation's HTTP port, with the same eval-quality policy decision, redirects, ceilings and auth header every call meets, and reads the string at the pointer of a 2xx answer with a JSON body (the port reads a body as JSON under an `application/json` or `+json` content type).
It refuses the probe when that string is not the declared `release`, naming both identifiers, so the digests a qualified probe records name the releases each deployment reported before the arms ran.
A request the policy denies, and an answer with no string at the pointer (a status other than 2xx, a body the port reads as no JSON, or anything but a string at the pointer), refuse the probe too, the reason naming eval-quality's denial, or the pointer and what it found; in each case no arm runs, and a pre-fix refusal leaves the post-fix deployment unasked.
A reported identifier is quoted in the refusal as JSON writes it, with each character outside printable ASCII escaped and at most 160 characters.
The report call is no trial: it records no evidence artifact and counts against no trial budget.
A call that reaches no answer (a refused or reset connection, an ended process) or passes a ceiling of the registry entry (the answer's size, its time, its redirects) stops the run with exit 12 as it does for any call, and so does a contract violation of the port.
No worktree is made, so the route needs no git history: it runs from a `copy` workspace and under `--from-working-tree` alike.

`preflight` qualifies the probe against the two deployments, before any leg runs, once each has reported the release it runs (`run.json`'s `releases` records, for each qualified probe, each side's declared and reported identifier): the interaction plan once against the pre-fix deployment, where the oracles of the probe's behaviors must be violated (`fail-before.json`, naming the release and its origins), and once against the post-fix one, where they must hold (`pass-after.json`).
No server starts for a call to a deployment, and the evidence of a leg or trial that reached one names its origins.
The qualified probe records `artifactDigest` as `sha256:` and the SHA-256 of the pre-fix release identifier, and `fixCommitDigest` as the same over the post-fix one.
Each defect's manifestation-witness leg reaches the pre-fix deployment, and `run` runs the probe's trials on the arm `historical:<release>`, named by the pre-fix release, each trial's HTTP calls reaching the pre-fix deployment; `run.json`'s `deployments` names the arm's origins.
One arm runs one target, so two probes on one arm label at two targets (a worktree and a deployment, or two sets of pre-fix origins) exit 10, as do two labels that differ only in letter case, whose trial directories would meet on a case-insensitive file system.
`check` refuses every such boundary first (neither boundary, deployments beside a `fixCommit`, one deployment, one release for both, a registry entry that is not an HTTP entry, origins off the registry's HTTP interfaces, a shared origin, or a `report` that names an undeclared operation, one the contract marks as changing state, one that needs an input, or a pointer that is no JSON pointer); the runtime refuses the same boundaries again with exit 12, as defence in depth.

### Either route

A refused probe is listed in `run.json`'s `refused` and in `runs/<invocationId>/refused/<probeId>.json`, stays out of the probe list `eval-quality preflight` reads and out of the trial sets, and the rest of the run goes on; a refusal alone does not fail the run, though a run whose every probe was refused has nothing to seal and exits 12.
Either qualification arm going the other way exits 11, since the probe does not straddle the fix; an arm that cannot run exits 12, and one the registry refuses 10.
The qualified probe records `oracleStableAcrossRevisions` as true: both arms are judged by the one compiled contract the run read before any arm ran.

## digest

```bash
npx tea-evaluate digest --evaluation evals/my-evaluation
```

`digest` writes `corpus-index.json`: every file under `corpus/`, `probes/` and `mutations/` as a path relative to the folder and the SHA-256 of its bytes, sorted by path.
It prints the corpus digest, which is eval-quality's artifact digest over that index, so any byte change in the corpus, the probes or the mutations moves it.
Run it after every change to those folders; `check` refuses a stale index.

## preflight

```bash
npx tea-evaluate preflight --evaluation evals/my-evaluation [--from-working-tree]
```

`preflight` asks whether the environment can measure anything at all, against the real target, before a run spends a trial on it.
Each invocation writes `runs/<invocationId>/` inside the evaluation folder, and creates `runs/.gitignore` ignoring everything under `runs/` the first time.
The steps run in order, each stopping the run with its own exit:

1. `check` over the folder; any finding exits 10 and is printed as `check` prints it.
2. The evaluation must be one this release runs: every seeded probe on the `controlled-mutation` or `historical` route (exit 12 otherwise, and a retry cannot pass); and when the registry declares an HTTP target, the evaluation's HTTP port, started once and asked which protocol it speaks, must answer as TeA's host (exit 10 otherwise, and 12 when its process cannot start or answer in time; see [The HTTP port](#the-http-port)).
3. The pristine workspace (see [The workspace](#the-workspace)), with every registry target present and executable in it (exit 12 otherwise), and `run.json`.
4. `eval-quality compile` and `eval-quality seal` over the run's own copy of `contract.json`, writing `eval-contract.json` and `sealed-evaluator-brief.json`; a non-zero exit the CLI documents is passed through.
5. Each seeded probe qualified through its controlled mutation (see [Controlled mutations](#controlled-mutations)) or across its fix boundary, a fix commit or a pair of deployments (see [Historical probes](#historical-probes)), exiting 10, 11 or 12 when a step fails; a historical probe with no revisions to address, naming a deployment the registry does not authorize, or naming one that reports another release than the one it declares or whose report request is denied or answered with no string at the pointer, is refused and left out.
   Each gameability probe qualified over its degenerate response with no target launched (see [Gameability probes](#gameability-probes)), exiting 11 when the naive oracle rejects it or the disciplined oracle accepts it; `run` reuses the result.
6. The legs: eval-quality's `runPreflight` plans them from the contract and the qualified probes (every sensitivity-witness leg, the minted control legs, and each defect's manifestation-witness leg) and drives them through the adapter the registry authorizes, eval-quality's command-line adapter for a command, its MCP adapter for a tool call, and the evaluation's own HTTP port for an HTTP request.
   A manifestation witness's leg runs in its mutation's mutated workspace, or on the historical route in a worktree at the pre-fix revision or against the pre-fix deployment, and every other leg in the pristine workspace, each through an authorization whose working directory is that workspace.
   Each command request carries the host's values for the environment keys its registry entry permits, each tool server and each started HTTP service starts with the host's values for its entry's keys, and each HTTP request carries its entry's auth header.
   Every observation is written to `observations/` as it arrives, with the request, the workspace and the working directory beside it; a request's environment is recorded as its keys only, and every injected or server environment value and every auth value of eight characters or more is replaced by `[redacted]` in the observation's strings, object keys and numbers, as written and in the JSON-escaped forms [the registry](#the-registry) lists.
   A leg the registry does not authorize is refused by the adapter before it starts: the fault is written to `faults/` and the command exits 10.
   A leg that cannot run at all (a budget exceeded, a process that fails to start) is written there too and exits 12, as does any other failure that stops the legs.
   A leg that exits one of its entry's `infrastructureExitCodes` is an observation like any other: the CLI's verdict reads it (a control leg that exits non-zero fails `clean-control`, exit 3), which AD-10 classifies as infrastructure from the persisted verdict.
   A qualification arm step that exits one stops the cycle with exit 12, since an arm has no verdict to classify it.
7. `eval-quality preflight --contract contract.json --probes probes.json --observations observations.json --run-id <invocationId>` over the files in the run directory, `probes.json` holding the qualified probes.
   Its `preflight-verdict.json` is the verdict, and its exit code is the command's exit code, verbatim: 0 when the preflight passed, 3 when it failed.

`runPreflight` computes a verdict of its own, and `preflight` discards it: every verdict comes from the CLI over files you can rerun by hand from the run directory.
`engine/<stage>.json` records each stage's executable, argv, exit code, stdout and stderr.
A stage that cannot start, is killed by a signal, or exits with a code eval-quality does not document for that stage exits 12.
The documented codes: `compile` and `seal` 0, 4, 5 and 64; `preflight` 0, 3, 4, 5 and 64; `score` 0, 2, 3, 4, 5 and 64.
Exit 1 is a CONCERNS promoted by `--strict`, which `tea-evaluate` never passes, so it is left out.
The environment variable `ENGINE_CLI_ENV` names in `cli/lib/evaluate/engine.js` substitutes another executable for the eval-quality CLI, which is how TeA's own test proves the verdict's source with a shim that logs its argv; a substitution is announced on stderr and recorded in each stage's record.

### The run directory

A target can reach `runs/<invocationId>/`, so the runtime guards every write and read it makes there.
`runs/` must be a directory and `runs/.gitignore` a file, never a link.
The run directory is created afresh, and every directory in it is created by the runtime, recorded by device and inode, and held open until the command ends.
A held directory keeps its inode even after it is removed, so no directory made later can take its number, which some file systems (Linux's ext4 and overlayfs among them) otherwise hand to the next directory made.
Each file is written from inside its recorded directory, as a new file created without following a link.
Before and after each write the runtime confirms the directory is the one it made at the place it made it: the same device and inode, and the same path the system reports for it.
So an entry a target planted where the runtime writes stops the command with exit 12, and so does a directory the target replaced, swapped for a link, or moved elsewhere (into your project, say) with a link left in its place; the write never goes through it.
A file written while its directory was being moved is removed again before the command stops, and a removal that fails is named in the exit message.
`run.json`, the one file rewritten, is replaced by renaming a new file over it.
An engine stage writes its output into a private temp directory made for the call, whose path its record's argv shows, and the runtime copies the output in.
The runtime keeps the digest of every file it writes and reads a file back only when its bytes are the ones it wrote, opening it without blocking, so a FIFO swapped in for a file is refused at once.
Before the preflight verdict, and for `run` again after the trials and before `run.json` says completed, the run directory must hold exactly the entries the runtime wrote, each file with the bytes it wrote; an entry it did not write, one that is gone or changed kind, or a file with other bytes exits 12.

## run

```bash
npx tea-evaluate run --evaluation evals/my-evaluation [--from-working-tree] [--partition development|held-out]
```

`run` measures the evaluation: it runs every arm a probe needs `trials` times and seals every trial as a record `eval-quality score` reads.
Omitting `--partition` runs both development and held-out probes. `--partition development` or `--partition held-out` selects that set before preflight, qualification and trials. An unknown partition exits 64; selecting an empty held-out set exits 10.
It needs `policy/scoring-policy.json` (exit 10 without it), and every probe on the `clean-control`, `controlled-mutation`, `historical` or `gameability` route (a canary exits 12, since a retry cannot pass).
The steps run in order in one invocation, each stopping the run with its own exit:

1. The whole preflight, as `preflight` runs it, in the same `runs/<invocationId>/`; a verdict that does not pass ends the run with its exit, and no trial runs.
2. Each clean control qualified: one clean arm in a workspace of its own, whose oracles for the control's behavior must hold (exit 11 otherwise), its evidence under `qualification/<probeId>/baseline-pass.json`.
3. A `sealed-brief-agent` qualified on the clean arm and on each mutated arm, before any trial (see [Qualifying a sealed-brief agent](#qualifying-a-sealed-brief-agent)); agreement below `evaluatorQualification.minimumAgreement` exits 11 with no trial set.
4. Each arm a probe needs, `trials` times: the clean arm (`conditionArm: clean`) for the clean controls, one mutated arm per mutation (`mutated:<mutationId>`) for the probes it seeds, one historical arm per pre-fix revision (`historical:<preFixSha>`) or pre-fix deployment (`historical:<release>`), and one gameability arm per gameability probe (`gameability:<probeId>`).
   Every trial runs the interaction plan once, with its bindings (see [The interaction plan](#the-interaction-plan)), in a workspace of its own that reproduces the pristine one (the mutation applied for a mutated arm and its digest held to the one the qualification measured) or, on a historical arm, the pre-fix worktree, a deployment arm's HTTP calls reaching the pre-fix deployment; a gameability trial answers the plan from the degenerate response and launches nothing.
   The evaluation layer judges the trial (see [The evaluation layer](#the-evaluation-layer)); under the default deterministic evaluator, when the contract declares a rubric, the rubric judge scores the trial once (see [The rubric judge](#the-rubric-judge)).
   Its requests, observations, oracle resolutions or judgment rows, and any judge reply go to `trials/<arm>/trial-<n>.json`.
   A trial step that exits one of its registry entry's `infrastructureExitCodes`, or that a signal from outside stops (hang-up, interrupt, quit, kill or terminate), is a target that could not run: the trial yields no record and the run exits 12 (a qualification arm step stops its cycle the same way).
   A command step that crashes by a signal of its own (an abort, a segmentation fault) is an observation its oracles judge, and its record keeps the negative exit code; a tool server whose process ends the session during a call is an observation the same way, recorded with its exit code on the `exit-code` channel; a signal from outside stops either kind of step with exit 12 (see [The registry](#the-registry)).
   Your project is read again after every trial and every evaluator attempt (exit 12 on any change, with no trial set written).
5. Every selected probe has its trial set, or the run exits 12, and the run directory holds exactly what the runtime wrote (see [The run directory](#the-run-directory)).
6. One trial set per probe under `trial-sets/<probeId>/`: `record-<n>.json` per trial and `isolation-manifest.json`, with `evaluator-configuration.json` for the whole run, each checked against the schema eval-quality publishes before it is written, and each written as eval-quality's canonical serialization; the contract and sealed-brief digests they carry were taken when `compile` and `seal` wrote those files, before any target ran.
7. `trial-sets.json`, the index `score` reads.
   Your project is then read once more and the run directory verified again; a change to either exits 12, and the run is recorded as not completed, with its `trial-sets.json` removed.
   Only then does the run's last write replace `run.json` with `completed: true` and the digests of every file `score` reads.
   A run that stopped holds no `trial-sets.json`; when the runtime cannot remove it or record the end in `run.json` (a run directory moved away, say), the exit message says so, and `run.json` still does not say `completed: true`.

`run.json` records how every `preflight` and `run` invocation ended (`outcome`: the stage, the exit and the message; for an interrupting signal, the stage `signal` and the signal's name), and a `run` records `completed`, true only for a run that sealed its trial sets.
The scoring policy, the evaluator conditions and the corpus index are read once, before anything runs, and the policy `run` copies to `scoring-policy.json` is the one the trials used, its digest in `run.json`.
The workspaces leave the evaluation folder out, so the run reads it from your working tree: uncommitted work in it (an edit, a deletion or an untracked file) makes `run.json` record `dirty: true` and `evaluationFolder.dirty: true`, since no commit names what the run measured.

The deterministic evaluator, the default evaluation layer, judges every trial with eval-quality's `resolveCheck`.
A record carries a disposition for every oracle the contract declares, since eval-quality holds each one required, citing the observations its check reads.
It carries one `defect` finding for each violated oracle of the behaviors the probe discharges (its own and its defects'), attributed to that probe and behavior at the behavior's severity and confidence 1, quoting the whole of the first stream, body or written-file channel the oracle reads on a cited observation (an exit code only when none holds text), so eval-quality's own witness match and quotation audit decide what the finding proves.
A violated oracle of another behavior files no finding against the probe, since eval-quality would read it as the probe's false positive or an unwitnessed claim; its `violated` disposition stands, and eval-quality records that oracle's corroboration as `disagrees`.
The trial's observations carry `provenance: evaluator-chosen`: under this evaluator the interaction plan is the evaluator's own exercise of the target, and eval-quality's witness match counts only evaluator-chosen observations.
The records of one set share one `runId` (the invocation's identifier and the probe's), number `trialIndex` from 1 to `trials`, carry `mode: contract-scoring`, and carry one `evaluatorRecommendation` for the whole set, since eval-quality holds it equal across a set: FAIL when any trial filed a finding, CONCERNS when one left an oracle of the probe's behaviors unsettled, PASS otherwise. So a trial whose own oracles all held carries its set's FAIL; in contract scoring eval-quality reads the recommendation into no verdict.

The isolation manifest records what the trials were granted and what the runtime observed: the workspace each trial ran in and its read-only provisioned directories as the allowed mounts, the registry's commands and tools as the tool allowlist (`<interface>/<executable>` or `<interface>/<tool>`), the commands and tool calls the runtime made for the plan as the observed tool calls, the tool-call and wall-clock ceilings the runtime enforces, and the largest safe integer (9007199254740991, the most the schema admits for a token ceiling) for the token and cost ceilings.
For CLI targets, each issued step can report target use on one stderr line: `TEA_EVALUATE_USAGE_JSON:{"inputTokens":7,"outputTokens":11,"costUsd":"0.00125"}`. Token counts must be nonnegative safe integers and cost must be a nonnegative decimal string. `tea-skill-runner` translates supported agent CLI reports into this line while keeping the agent's answer on stdout. A malformed or repeated report stops the run with a target-report error. The sealed record stores the sum of that trial's issued step reports, and the isolation manifest stores the exact sum of its trials. Qualification and preflight calls do not count.
When a target gives no complete report, the closed record and manifest schemas still hold zero for missing use. `run.json` lists the affected trial and step in `unreportedResourceUse`. An empty list means every issued target call reported use, including an explicit measured zero. API and MCP calls have no usage report contract and appear as unreported when issued.
The observed mounts are the paths the confinement's audit saw the trials' targets open outside what they were granted (see [File-system confinement](#file-system-confinement)), none in a clean run and none in a run that opted out, which observes no file-system access.
The runtime does not sandbox the network and observes no network access, so the network allowlist and the observed network targets are empty.
Each forbidden input's note says what the runtime hands the target and names the confinement that withheld the rest, or, in a run that opted out, that the runtime does not sandbox the target's file system.
The evaluator configuration carries the `sealedBriefDigest` of the run's sealed brief, and `decodingParameters["tea.evaluatorKind"]`, the evaluation layer's kind.
Its `modelSnapshot` and `systemPromptDigest` come from `policy/evaluator-conditions.json`, which an evaluation whose target or evaluator uses a model commits (`check` requires it, naming a model other than `none`, once a registry entry runs `tea-skill-runner`, which always runs an agent); under a sealed-brief agent they are the agent's `evaluator.modelSnapshot` and the digest of the runtime's evaluator template (see [The evaluation layer](#the-evaluation-layer)):

```json
{
  "schemaVersion": 1,
  "modelSnapshot": "the-model-snapshot-your-target-runs",
  "systemPromptDigest": "sha256:<64 hex digits>"
}
```

A run that uses no model leaves the file out and records `modelSnapshot: "none"` and the digest of the empty byte string, since the published schema requires both.
Each probe is written to `probes/` with the digests AD-7 names: `commitDigest` is the evaluated commit (`sha256:` and the SHA-256 of its identifier; a copy's tree digest), `artifactDigest` the `targetArtifact` bytes (a clean control's and a gameability probe's is its `implementationDigest`, a historical probe's the tracked tree at its pre-fix revision, or, against deployments, `sha256:` and the SHA-256 of its pre-fix release identifier), and `implementationDigest` the tracked tree of `launch.skillRoot`, or `launch.root`, at that commit, the SHA-256 of `git ls-tree -r -z <commit>:<directory>` with the evaluation folder's entries left out (for a copy, the tree digest of that directory without its provisioned directories).

### Gameability probes

A gameability probe shows that a degenerate, compliant-looking response satisfies a naive oracle and is rejected by the disciplined one.
eval-quality keeps its `degenerateResponse` as prose, so the response's bytes are committed at `corpus/gameability/<probeId>.json`, one response for every interaction plan step, and the committed probe names its naive oracle, an oracle of another behavior; the disciplined oracle is the one oracle of the probe's own behavior.
A command step's response is its streams and exit code, which eval-quality's command-line adapter reads as it reads a real run's, so JSON-shaped output is JSON a later step's captured binding or an oracle can point into:

```json
{
  "schemaVersion": 1,
  "steps": { "judge-run": { "stdout": "verdict: pending\n", "stderr": "", "exitCode": 0 } }
}
```

A tool-call step's response is the tool's error flag and, when it returns one, its structured result:

```json
{
  "schemaVersion": 1,
  "steps": { "grade-run": { "isError": false, "structuredResult": { "ok": true, "verdict": "pending" } } }
}
```

An HTTP step's response is its status and, when it has them, its headers and its body as text, which the evaluation's HTTP port reads as it reads a real answer, so a JSON content type makes the body JSON.
Nothing is sent: every host a request names resolves to the first address of its interface's entry, so eval-quality's policy decides every host, spelling included, and every method, scheme and port as on a real arm:

```json
{
  "schemaVersion": 1,
  "steps": {
    "grade-run": {
      "status": 200,
      "headers": { "content-type": "application/json" },
      "body": "{\"ok\":true,\"verdict\":\"pending\"}"
    }
  }
}
```

```json
{ "route": "gameability", "degenerateResponse": "Prints a verdict line without judging the request.", "naiveOracle": "O-002" }
```

`preflight` and `run` answer the plan from that file with no target launched, as a synthetic observation, each step through the registry's authorizations as on a real arm, so a step the registry does not grant is denied (exit 10, the qualification's fault in `qualification/<probeId>/fault.json`), and resolve both oracles over it with eval-quality's `resolveCheck`: the naive oracle must hold (`naive-oracle-satisfied.json`) and the disciplined one must be violated (`disciplined-oracle-rejected.json`), or the command exits 11.
The probe is materialized with those two evidence references and admitted by eval-quality's qualification gate, and its trials on the arm `gameability:<probeId>` answer from the same file, so its isolation manifest grants no workspace and observes no tool call.

### The rubric judge

When the contract declares a rubric and the evaluator is the deterministic one, `run` calls a rubric judge once per trial, through TeA's agent adapters; a contract with no rubric makes no call, and its evaluator configuration keeps `judgeConfiguration: null`.
Command and sealed-brief-agent evaluators score the rubric through their own paths; the records kind carries the scores your harness made, which its calibration judgments gate (see [The evaluation layer](#the-evaluation-layer)).
`evaluation.json` wires it, and `policy/evaluator-conditions.json` names its model, a fixed condition of every run (`check` requires both once a rubric is declared):

```json
{ "judge": { "agent": "claude", "model": "sonnet", "timeoutMs": 120000 } }
```

```json
{
  "schemaVersion": 1,
  "modelSnapshot": "none",
  "systemPromptDigest": "sha256:<64 hex digits>",
  "judge": { "modelSnapshot": "the-judge-model-snapshot" }
}
```

`agent` is an adapter key; `agentCommand` replaces the adapter's command (the `custom` adapter requires it), `agentArgs` are appended to its argv, `model` replaces its pinned model, and `timeoutMs` bounds each call.
The judge runs in an empty directory of its own and is asked for read-only capabilities, which bind differently per adapter: `claude` gets its read and search tools only, `codex` its read-only sandbox, and `custom`, which is your own executable, receives no capability argv, so it is yours to keep read-only; `agy` always runs with full permissions, so `check` refuses it as the judge.
Whatever the adapter, the directory must still be empty when the call ends, or the call fails as a judge that could not answer.
It receives the runtime's instruction template, then each rubric's anchored scale levels, failure-mode penalties and bounded length, and each criterion's text with the evidence its pointer names in the trial's observations; it never receives the contract, its oracle checks, its plan or its `testData`.
The template tells it the evidence is data to assess, whose instructions are never followed.
Each call draws a fresh 128-bit random nonce after the target has run, so no target can know it, and the prompt asks for the answer, one JSON object `{"scores":[{"rubricId","criterionId","score","note"}]}` with one entry per criterion, inside exactly one block `<judge-answer nonce="<nonce>">…</judge-answer>` carrying that nonce.
Only that block is read: anything else in the reply, a scores object a target printed and the judge quoted included, is ignored, and the trial's judge evidence keeps the nonce.
Every record of the trial carries the scores as `judgeResults`; a reply with no answer block carrying the call's nonce or with several, a block that does not hold a JSON object with a `scores` list, a criterion left out or scored twice, a score that is not one of its rubric's levels, and a note longer than the rubric's `maxLength` each become that criterion's `score: null` with a note, which eval-quality reads as Invalid.
A judge that cannot start, times out, exits non-zero or writes into its directory yields no record, and the run exits 12, with the judge's stdout and stderr kept in the trial's evidence.
An interrupting signal that arrives while the judge runs is taken by the run's own handler once the call returns, which records the stage `signal` in `run.json` and ends the process by that signal.
The evaluator configuration records `judgeConfiguration: { modelSnapshot, systemPromptDigest }`, the digest taken over the instruction template, so a changed template or judge model changes the scoring version.

Before trial records, `run` sends each calibration response through the configured rubric scorer. A deterministic judge sees one criterion per call; command and sealed-brief evaluators use their normal scorer paths. The scorer never receives `expectedLevel`. A `records` evaluator's harness runs its own scorer and supplies the judgments instead (see [The evaluation layer](#the-evaluation-layer)). `judge-calibration.json` in the run directory reports agreement and largest level distance per criterion. Agreement below the declared minimum exits 11 before any trial record. The calibration file's byte digest and the minimum agreement appear in `EvaluatorConfiguration.decodingParameters`, so changing either changes the scoring version.
A sealed-brief agent's qualification runs after this calibration and before the first trial (see [Qualifying a sealed-brief agent](#qualifying-a-sealed-brief-agent)).

### The evaluation layer

`evaluation.json`'s `evaluator` chooses what judges the trials (the deterministic evaluator above when none is declared).
Every kind reaches `eval-quality score` as sealed run records, and the runtime checks no quote, citation or signature match: eval-quality's ingest does.

| `kind`               | What judges                                                            | Fields                                                                        |
| -------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `deterministic`      | TeA's `resolveCheck` evaluator, with the rubric judge                  | none                                                                          |
| `command`            | your executable under `evaluator/`, once per trial                     | `command`, `args`, `environmentKeys`, `timeoutMs`                             |
| `sealed-brief-agent` | an agent reading the sealed brief, acting through the runtime's bridge | `agent`, `agentCommand`, `agentArgs`, `model`, `environmentKeys`, `timeoutMs` |
| `records`            | sealed run records your harness wrote                                  | `records`, their directory                                                    |

**Judgment rows.** A `command` evaluator and a sealed-brief agent answer each trial with `{ "rows": [...], "recommendation"?: "PASS" }`; `evaluator/mapping.json` binds each key to an oracle and behavior or a rubric criterion and its levels:

```json
{
  "key": "verdict-accepted",
  "outcome": "fail",
  "observationIds": ["trial-1-judge-run"],
  "quote": "verdict: rejected",
  "quoteChannel": "stdout",
  "confidence": 0.9,
  "comment": "It rejected a request it had to accept."
}
```

```json
{
  "schemaVersion": 1,
  "keys": {
    "verdict-accepted": { "oracleId": "O-001", "behaviorId": "B-001" },
    "verdict-quality": { "rubricId": "R-101", "criterionId": "RC-101", "levels": [1, 2, 3] }
  }
}
```

`outcome` is `pass`, `fail` or `score` (with `score`, one of the levels); every row cites an observation; a `fail` row carries `quote`, `quoteChannel` (eval-quality's quotation channels), `confidence` and `comment`, and `artifactId` appears on the `artifact` channel only.
A key the mapping lacks, or one given twice, fails the row schema.
A `fail` row is its oracle's `violated` disposition and, in the records of a probe one of whose behaviors declares the oracle, a `defect` finding for the first such behavior, as the deterministic evaluator files it (`F-001` onward, that behavior's severity, `comment` as `summary`, `evidenceArtifacts: []`, one quoted-evidence entry); a key's `behaviorId` names a behavior that declares its oracle, and an oracle two behaviors declare takes one key; a `pass` row is `held`; an oracle with no row is `not-attempted`; a `score` row is its criterion's judge result, and a bound criterion with no row is `score: null`, which eval-quality reads as Invalid.
A probe's recommendation in a trial is the evaluator's own or FAIL when the rows filed a finding against it, and a set records its trials' most severe.
TeA's rubric judge never runs under these kinds.
An evaluator that cannot start, exits other than 0, outlives `timeoutMs`, answers off the row schema, puts a score row on an oracle key or a pass or fail row on a rubric key, scores off the levels, answers a string that is not well-formed Unicode (a lone surrogate), or answers no row while the mapping binds an oracle yields no record and exit 12.
Its answer is read from its stdout as UTF-8, a byte sequence that is not UTF-8 reading as U+FFFD; what it printed is kept byte for byte in `runs/<invocationId>/evaluator/<arm>/trial-<n>.stdout` and `.stderr`, with `.json` beside them holding the fault (and for an agent, its prompt, nonce and bridge calls), either way.

**The layer's files.** In a git repository the evaluation layer is the files git tracks under `evaluator/`, with their working-tree bytes: a file git does not track (an interpreter's cache, an editor's backup, a note) is no part of it and moves no digest, so `git add` every file the evaluator needs, and `check` refuses a mapping or command git does not track.
Outside a repository it is every regular file under `evaluator/`, so a stray file there changes the scoring version.
Either way a link, a special file or a path through a linked directory is refused, and `check` names a submodule under `evaluator/` as one, since its files are another repository's.
`run` reads the layer's files once, before anything runs, and takes the digests and the mapping from those bytes.
It reads them again before each launch of the evaluator and after each trial, and a file gone, changed or added to the layer stops the run there with exit 12 and no record, since the digests would name bytes that did not run.
In a confined run no process of the run can write under `evaluator/` at all (see [File-system confinement](#file-system-confinement)), so no file can be swapped between that read and the launch and restored unseen; in a run that opted out, such a swap goes unseen.

**A command evaluator** runs under TeA's agent supervisor (its own process group, `SIGTERM` at `timeoutMs`, `SIGKILL` 2 s later, its group killed when it ends), with the agents' base environment and your `environmentKeys`, and receives `{ "sealedBrief", "observations" }` on stdin, the observations the record will carry (`evaluator-chosen`).
The executable runs from its folder, `evaluator/`, so module resolution works as usual: a package in your project's `node_modules` or a sibling file it reads resolves as it does outside a run.
Its working directory is an empty private directory the run removes however it ends, an interrupting signal included.
In a confined run it cannot write under `evaluator/`, so a cache it writes beside itself fails there (Python skips its `__pycache__` quietly); in a run that opted out such a cache must be gitignored, or the adopter-tree check after the trial sees your tree change and stops the run with exit 12, and outside a git repository it must write nothing under the project.
A model it calls is named as `policy/evaluator-conditions.json`'s `evaluator.modelSnapshot`.

**A sealed-brief agent** gets the evaluator instructions, a nonce-tagged answer block (as the rubric judge does), the sealed brief and the mapping's keys (a rubric key with its criterion and levels); nothing else of the evaluation.
The runtime runs the plan first, recorded `baseline` and never shown to the agent; the agent then calls the bridge, a stdio MCP server with one tool per interface of the brief, shaped by kind (`cli`: `arguments`, the whole command line, and `stdin`; `api`: `method`, `path`, `body`; `mcp`: `tool`, `arguments`).
An `api` call's `body`, when given, is a JSON object.
In a `cli` call, `--name=value` is an option, `--name` takes the next word only when an operation declares it non-boolean, and other words, and all after `--`, are positional; a repeated option is refused, since eval-quality's request carries one value per option.
`stdin` reaches the target as written, and the record's `callInputs.stdin` is the JSON object it parses to or, for other text, the text under the operation's one stdin key.
The registry's adapters deny an unlisted executable, subcommand, interface, tool, address or method before anything launches or is sent, recorded with eval-quality's fault code, its reason and its detail: an `mcp` call goes through the tool-server entry's `McpTargetAuthorization` for the arm's copy, and the operation it matches is the one declaring its tool name; an `api` call goes through the evaluation's HTTP port over the HTTP entry's policy for the arm's copy, and the operation it matches is the one declaring its method and a path template its path fits, whose parameters and query string become the call's `path` and `query` inputs.
A call matching exactly one operation (by its declared keys) is recorded `evaluator-chosen` and answered with its `observationId`; any other authorized call stays in the evidence as unmatched, with no ID to cite.
Every call counts against `budgets.maxToolCalls` per trial, and none runs after the agent ends.
A call carrying the trial's answer nonce is refused unsent and uncounted, so the agent cannot hand it to the target.
On a gameability arm a call goes through the same adapter or port and authorizations with nothing launched or sent, so an ungranted one is denied as on any arm, and every other is answered from the degenerate response.
A call the target could not run exits 12, and the exit message names that call's fault, followed by the agent's own failure when the agent then failed.
A plan step and an agent call with the same bindings both match the step, so declare cardinality `any` on a step an agent may repeat.
The bridge admits one connection, presenting a token its process reads from its environment; its configuration reaches the adapter as a private file.
A target running as your user can read that token before the agent connects: the confinement withholds the evaluation folder, and the bridge's private directory lies outside it.
`claude` runs with no built-in tool, the bridge alone, no user or project settings and no saved transcript (`--tools ""`, `--mcp-config <file>`, `--strict-mcp-config`, `--setting-sources ""`, `--no-session-persistence`), and `check` refuses `agentArgs` that reopen any of them; `custom` receives `--mcp-config <file>`, and keeping to the bridge is its own contract; other adapters are refused.
`evaluator.modelSnapshot` names the agent's model, recorded as the configuration's `modelSnapshot` beside the digest of the evaluator template (instructions, answer line, heading, tool descriptions and call shapes), and as `judgeConfiguration` when a rubric key is bound; a target model named at the top level is kept as `tea.targetModelSnapshot`.
Before its first trial the agent is qualified on the clean arm and on each mutated arm (see [Qualifying a sealed-brief agent](#qualifying-a-sealed-brief-agent)).

**A records evaluator** reads, inside the folder and through no link, `<records>/evaluator-configuration.json` and, per probe the run qualifies, `<records>/<probeId>/*.json` records (name order) and an optional `isolation-manifest.json`.
`run` qualifies and preflights as usual, checks each file's published schema, the configuration's and records' `sealedBriefDigest` against this run's brief, and one `runId` and the qualified arm per set (exit 10 with nothing copied otherwise), and copies the bytes into `trial-sets/` for `score`.
Take the brief from `eval-quality seal`, which is deterministic; nothing ties the records to the target's state at this run.

When the contract declares a rubric, the records carry rubric scores your harness's scorer made, and they count only once that scorer has passed the same calibration gate as every other scorer.
Your harness runs its own scorer over each labelled item in `policy/judge-calibration.json`, handing it the response and nothing of the label, and writes what the scorer saw and answered to `<records>/calibration-judgments.json`:

```json
{
  "schemaVersion": 1,
  "scorerConfigurationDigest": "sha256:...",
  "items": [
    {
      "rubricId": "R-101",
      "criterionId": "RC-101",
      "scorerInput": { "observationId": "calibration", "...": "the observation the runtime derives from the item" },
      "answer": 1
    }
  ]
}
```

- `items` holds one entry per labelled item, in the labelled file's order. `answer` is an anchored level of the criterion, or `null` when the scorer gave none, which counts as a disagreement.
- `scorerInput` is exactly the label-free observation the runtime derives from the labelled item: the same observation `run` hands any other scorer, with the operation ID the contract's interaction plan gives the criterion's step (`calibration` when it has none). It is compared whole, so an extra key, a label such as `expectedLevel`, or a different response fails. For a criterion whose evidence is the `stdout` of step `judge-run`, and the contract's interaction plan gives that step operation `judge-request`, the response `Response at level 1` is the observation `{ "observationId": "calibration", "sequence": 1, "operationId": "judge-request", "provenance": "evaluator-chosen", "principal": null, "callInputs": { "path": null, "query": null, "header": null, "body": null, "argument": null, "option": null, "environment": null, "stdin": null, "arguments": null }, "responseBody": null, "responseHeaders": null, "responseStatus": null, "stdout": { "kind": "text", "value": "Response at level 1" }, "stderr": { "kind": "absent" }, "exitCode": null, "artifacts": {} }`.
- `scorerConfigurationDigest` is eval-quality's `digestArtifact` (kind `EvaluatorConfiguration`) over the imported `evaluator-configuration.json` with `tea.judgeCalibrationDigest` and `tea.judgeCalibrationMinimumAgreement` removed from its `decodingParameters`. The full configuration's digest covers the labelled file's digest, which the judgments cannot name before the labelled file is final, so the two bindings are checked separately.
- The configuration binds `decodingParameters["tea.judgeCalibrationDigest"]` to the digest of `policy/judge-calibration.json`'s bytes (eval-quality's `digestBytes`) and `decodingParameters["tea.judgeCalibrationMinimumAgreement"]` to `evaluation.json`'s `judgeCalibration.minimumAgreement`. A changed item or minimum changes the configuration digest and the scoring version.

`check` and `run` verify the judgments and bindings with one function, so they agree. A judgments file or configuration that is absent, not JSON, a link, off this shape, or bound to another digest, minimum or scorer configuration is an authoring defect: `check` reports it under the `judge-calibration` rule and `run` exits 10 before it reads or copies any record.
`check` stops there. `run` then sends a verified file through the same gate as every other scorer: it computes exact agreement and the largest level distance per criterion itself, writes `judge-calibration.json` in the run directory, and exits 11 below the minimum before any record is copied.
A `records` evaluation whose contract declares no rubric never reads a judgments file.

The honest limit: the runtime verifies that the judgments bind to the configuration and to label-free input.
It cannot prove that your harness ran its scorer to produce the answers, and it does not run or replay that scorer.
A harness that wants that proof runs its scorer through a `command` evaluator.

**Fixed conditions.** `decodingParameters` carries `tea.evaluatorKind` for every kind (so deterministic digests differ once from the release before), and for the row-converting kinds `tea.evaluatorTreeDigest` over the layer's files, `tea.evaluatorWiring` (the `evaluation.json` block), and `tea.evaluatorExecutableDigest` and `tea.evaluatorModelSnapshot` for a command or `tea.evaluatorAgent` and `tea.evaluatorModel` for an agent: a changed file, argument, model or timeout changes the scoring version.
The isolation manifest adds the evaluator's timeout and an agent's call budget to its ceilings and the agent's calls to its use; target reported tokens and cost are included in actual resource use, while absent reports remain zero and are listed in `run.json.unreportedResourceUse`.

### Qualifying a sealed-brief agent

A sealed-brief agent chooses its own calls, so two runs over one seeded defect can differ.
One run may send the standard input a defect signature selects on, and the next may send none, which eval-quality reads as an Invalid mutated set.
`evaluation.json` therefore declares how many times `run` exercises the agent before its verdicts count, and how often the attempts must agree (both set by you; no template fills them):

```json
{
  "evaluator": { "kind": "sealed-brief-agent", "agent": "claude", "timeoutMs": 300000 },
  "evaluatorQualification": { "attempts": 3, "minimumAgreement": 0.9 }
}
```

`attempts` is an integer of at least 2 and `minimumAgreement` a number from 0 to 1.
`check` exits 10 under `evaluator` when a `sealed-brief-agent` declares no `evaluatorQualification`, and when any other kind declares one, since nothing would use it.

After judge calibration and before the first trial, `run` runs the agent `attempts` times on the clean arm and on each mutated arm.
An attempt runs the arm's plan and the agent once, in a workspace of its own (its label starts with `attempt-`), and judges every probe of the arm.
It writes nothing under `trials/` or `evaluator/`: its files are under `evaluator-qualification/<arm>/attempt-<n>/`.
The attempt's record of one trial for each probe is scored alone by `eval-quality score`, with the run's contract, preflight verdict, policy and evaluator configuration.
An exit 0 or 2 carries an evidence artifact (one record below a `minimumTrialCount` above 1 reads as CONCERNS), so the artifact exists for every attempt eval-quality can read.
`evaluator-qualification.json` in the run directory reports, per arm and probe, each attempt's `exitCode`, its `evidence` artifact, its `outcome` and whether it `agrees`:

- The outcome is the state in the evidence artifact's `reducedProbeOutcomes[].trialVotes[]`, copied unchanged; the runtime computes none.
- An attempt agrees when its outcome is `passed-clean-control` on the clean arm and `caught` on a mutated arm.
- An attempt eval-quality reads as Invalid exits 3 and emits no artifact.
  It is recorded with `exitCode: 3`, `evidence: null`, `outcome: null` and the engine's `invalid:` stderr lines in `invalid`, and counts as disagreeing.
- A probe's agreement is the fraction of its attempts that agree, and an arm's agreement is the lowest agreement among its probes.
- Historical and gameability arms are not qualified.
- The report lists held-out probes beside development ones, as the trial sets do; read it for the development probes and the arm agreements, and read a held-out probe through `gap-view.json`.
- An attempt's model calls appear in its own `isolation-manifest.json` and in no trial set's use, since qualification calls do not count toward the trials.

An attempt `eval-quality score` cannot score stops the run with exit 12 before any report is judged: a call that cannot run, an exit other than 0, 2 or 3, no evidence artifact, or no single trial vote for the probe.
An arm whose agreement is below `minimumAgreement` exits 11 as an evaluation weakness, naming the arm and `evaluator-qualification.json`, with no trial record and no `trial-sets.json`.
The two numbers appear in `EvaluatorConfiguration.decodingParameters` as `tea.evaluatorQualificationAttempts` and `tea.evaluatorQualificationMinimumAgreement`, so changing either changes the scoring version.

## score

```bash
npx tea-evaluate score --evaluation evals/my-evaluation [--run <invocationId>]
```

`score` scores the trial sets of a completed run: the one `--run` names, or the most recent `run` invocation.
A run that did not complete (its `run.json` does not say `completed: true`, or it has no `trial-sets.json`) has nothing to score, and `score` exits 64 naming where it stopped, or that it records no end because it is still running or was stopped before it could record one; so does a `--run` naming no run or a `preflight` invocation, and a folder with no run.
Every input is read from the run directory once, as a regular file opened without blocking and without following a link (a FIFO or a link there is a finding, never waited on), held in memory, and checked first:

- `trial-sets.json` against the runtime's own schema (`cli/lib/evaluate/schemas/trial-sets.schema.json`): at least one set, a probe identifier on eval-quality's pattern, and every path inside the run directory;
- the compiled contract, the scoring policy the run copied, the preflight verdict, the evaluator configuration, and each set's probe, records and isolation manifest against the schema eval-quality publishes for it;
- each set against its run: the index names the probes the run sealed, each once, and each record once; each set's `runId` is the one the run derives from its invocation and the probe; each probe file names its probe; every record carries the set's `runId` and arm and the run's contract, sealed brief and evaluator configuration digests; each record's actions and isolation-manifest references are public, name files inside this run directory (the manifest reference its set's own manifest) and digest the files they name (a `records` run's records are your harness's own, so its run IDs, references and digests are left to eval-quality, and the index must name exactly the records the run copied); and the record count, the corpus digest, and the digests of the compiled contract, the policy, the preflight verdict, the evaluator configuration, each probe file, each record and each isolation manifest are the ones `run.json` recorded (under `artifacts` and `policyDigest`), so a file the run did not seal, or one rewritten or copied in from another run, is refused.
- `operation-phases.json` as a regular file with the digest `run.json` recorded; its phase map must equal `run.json.operationPhases`. The run writes both from its checked `evaluation.json` before completion, so later edits to the source manifest do not relabel sealed observations.
- every finding, including one from a `records` evaluator, must cite at least one observation in its sealed record and carry quoted evidence. A missing citation or quote exits 10 before eval-quality scores the run.

`score` holds each of these files to the digest `run.json` recorded, and keeps the bytes it checked until the command ends (see [Score input integrity](#score-input-integrity)).

Any finding exits 10, names the file, and runs no `score` call.
Each `eval-quality: invalid: <reason>` line a call writes to stderr is also printed, prefixed with its probe.
An isolation manifest that is absent is passed on as absent and never filled in, so eval-quality reads that trial set as Invalid.

A probe the run refused has no trial set; `score` prints each one with its reason and records them under `refused` in its aggregate `score.json`, and its exit does not change.
Then `eval-quality score` runs once per probe, with every trial's `--record`, the set's `--isolation-manifest`, the run's `--evaluator-configuration` and the run's corpus digest, and writes the evidence artifact to the private staging file `--out` names (see [Score output integrity](#score-output-integrity)).
Each call goes to `runs/<invocationId>/scores/<scoreInvocationId>/<probeId>/`: `score.json` (its executable, argv, exit code, stdout and stderr, kept whether or not an evidence artifact was emitted) and `evidence-artifact.json` when there is one, with `score.json` beside the probes summarizing each call's exit.
The same run directory receives `partitions.json` and `gap-view.json`. Both group scored probes under `development` and `held-out`; each available outcome is copied from the probe's evidence artifact. A probe without an evidence artifact has `outcome: null`. The development gap view includes the authored probe. Each held-out gap entry contains only `probeId`, `probeClass`, and `outcome`, so its rationale, defect summary, test-data binding, and mutation text stay hidden.
It also receives `interpretation.json`. Each trial names its sealed record path and contains its findings with recorded observation citations (`observationId`, `sequence`, `operationId`, `provenance`, `phase`), each finding's quoted evidence and its oracle's compiled-contract evidence pointers. The trial's `process` and `outcome` lists reference finding IDs by their cited observation phases; a finding citing both phases appears in both lists. `firstMaterialError` names the lowest-sequence citation from a `material` or `critical` finding, or is `null`. Each probe names its evidence artifact path, scorer exit code, score record path and failure detail. These fields remain available when eval-quality emits no evidence artifact. The `engine` object copies outcomes, reduced outcomes, strength and the applicable verdict from that artifact; it is `null` when there is no artifact.
Every call's exit is eval-quality's own: 0 (PASS, WAIVED or CONCERNS), 2 FAIL, 3 Invalid, 4 a structural failure, 5 a runtime fault, 64 usage.
`score` exits with the most severe of them, in the order 64, 5, 4, 3, 2, 0, and the call that produced it is on record; rerunning `eval-quality score` by hand on a persisted argv gives the same exit and byte-identical evidence.
A call that cannot run, is killed or exits with a code the CLI does not document is recorded, the other calls still run, and `score` exits 12.

### Score output integrity

Every score artifact lands inside the run directory, and `score` writes it through the same held directories `run` uses.
`score` holds the existing run directory, adopts a real `scores` directory or creates it, and creates each invocation directory and probe directory exclusively.
A link or any other entry at `scores`, at an invocation directory, at a probe directory or at a file `score` is about to write stops the write, and so does a directory a process replaces with a link or moves away while `score` runs.
A link at `runs/`, which `run` refuses as well, stops `score` the same way.
`score` then exits 12 naming the entry, before any byte reaches a path outside the run directory; a link at `scores` stops it before any eval-quality call.
A normal repeated `score` succeeds and keeps every earlier invocation directory as it was.
The engine's `--out` names a private staging file outside the evaluation folder, which `score` removes after each call.
The staged artifact is copied in as `evidence-artifact.json` only when it meets eval-quality's published schema, names the run's corpus digest and carries an outcome for the probe, and the copy is read back from the held directory.
An artifact that fails that copy check is not copied, its reason is on the probe's entry in the invocation's `score.json`, and `score` exits 12.
The copy check is the first gate; whether the staged artifact is the engine's own is decided by the second, in [Score input integrity](#score-input-integrity).
Each probe's `score.json` records the argv exactly as it ran, the staging path included, so rerunning `eval-quality score` by hand on that argv with a fresh `--out` gives byte-identical evidence.

### Score input integrity

`score` reads every input of the run once, as a regular file without following a link, digests the bytes with eval-quality's `digestBytes`, compares the digest with the one `run.json` recorded, and keeps those bytes in memory until the command ends.
The inputs are the compiled contract, the preflight verdict, the evaluator configuration, the scoring policy, and each set's probe, records and isolation manifest.
The checks above parse the held bytes, and `partitions.json`, `gap-view.json` and `interpretation.json` are built from them, so nothing a process writes to the run directory after the check reaches a view.
A manifest the check found absent is passed to eval-quality as absent whatever appears there later.
The protection starts when `score` reads the inputs: a file rewritten together with its digest in `run.json` before `score` starts verifies as the run's own, and only confinement keeps a target from writing the run directory at all (see [File-system confinement](#file-system-confinement)).

Two checks follow every `eval-quality score` call, before anything is copied:

- `score` reads every input again and digests it. A file that changed, stopped being a regular file or appeared where the check found none exits 12 naming the file, so a rewrite that eval-quality read and a process kept is refused.
- `score` scores the held bytes in process with eval-quality's library the way the CLI scores a probe and compares the call with what the CLI does with those bytes. The staged artifact must equal the result serialized with the library's `serializeArtifact` byte for byte, and a call that stages no artifact must match a result with no artifact, whatever it exited. The call's exit must be the one the held bytes give: the ladder's exit for a result, 4 for a structural failure, 5 for a runtime fault, 64 for a private-storage manifest reference. The `eval-quality:` lines on the call's stderr must be the ones the result would print (the qualification failures and, for an Invalid result, its basis, which is how an exit 3 gets its reason); when the library refuses the held bytes, only the exit is compared, since the CLI renders that error itself. A rewrite that eval-quality read and a process then restored, a well-formed artifact with altered outcomes or the same artifact in other bytes, an artifact removed or staged afresh, and an exit or reason that does not follow from the held bytes, exit 12 naming the mismatch.

Neither check supplies a verdict, an exit code or an artifact: the re-score compares and refuses, and the eval-quality CLI still decides every enforced verdict.
The comparison covers the artifact, the exit and the `eval-quality:` stderr lines, the three things `score` copies or classifies from; the call's stdout and its other stderr text are recorded as they came and are not compared.
A refused call copies no evidence; its reason is on the probe's entry in the invocation's `score.json`, the other probes still run, and `score` exits 12.
The recorded argv names the run directory's own files, so rerunning `eval-quality score` by hand on it with a fresh `--out` reproduces the persisted evidence byte for byte on a run no process changed.

## tea-skill-runner

```bash
tea-skill-runner --skill-root skills/my-skill --agent <adapter> < prompt.txt
```

`tea-skill-runner` is the command an evaluation registers for a skill target.
It reads the prompt on standard input, tells the agent where the skill is (`--skill-root`, a directory holding `SKILL.md` inside the working directory), runs one headless agent turn through TeA's agent adapters, and prints what the agent printed.
The agent receives a short preamble naming the skill root, then the prompt exactly as read; a prompt that is not valid UTF-8 is a usage error.
It never looks for a skill anywhere else, and it names no vendor: `--agent` is required.
The skill root and its `SKILL.md` must resolve inside the working directory, symbolic links included.
The other options are those of TeA's own runners: `--agent-cmd`, `--agent-arg`, `--env-pass`, `--model`, `--timeout-ms`, and `--capability` (`read-only`, `scoped-artifact-writes` or `command-execution`; `scoped-artifact-writes` by default).

| Exit | Meaning                                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | the agent ran to completion                                                                                                                                                                                               |
| 2    | usage: a missing or malformed option, an empty prompt or one that is not UTF-8, or a skill root outside the working directory                                                                                             |
| 3    | configuration: an unknown agent, or a skill root that does not exist or holds no `SKILL.md`                                                                                                                               |
| 4    | transport: the agent failed to start or exited non-zero, a process supervising it ended before the agent or without reporting, standard output closed before the reply was written, or the runner met an unexpected error |
| 5    | timeout: the agent outlived `--timeout-ms`; its process group got `SIGTERM`, then `SIGKILL` 2 s later if it was still running                                                                                             |
| 6    | parser: reserved by the shared runner table                                                                                                                                                                               |

A registry entry for the runner declares `infrastructureExitCodes` 3 to 6, and `check` holds it to that.
Its target is the bin name `tea-skill-runner`, which `npm exec` resolves from the evaluation's installed TeA, or a path to `skill-runner.js`.
The agent runs in its own process group.
When the agent exits, every process left in that group receives `SIGKILL` at once.
The group is also stopped when `--timeout-ms` runs out, when the runner's process group receives `SIGINT`, `SIGTERM`, `SIGHUP` or `SIGQUIT` (a terminal's Ctrl-C or `Ctrl-\` included), and when the runner or the supervisor process between it and the agent dies, by `SIGKILL` included.
Stopping sends the group the signal received (`SIGTERM` for a timeout or a death), and the group `SIGKILL` 2 s later if it is still running.
An agent the `SIGKILL` ends is reported as killed by `SIGKILL` once it outlived the grace period after the signal that asked it to stop; a `SIGQUIT` can end that way wherever the system hands core files to a collector, since writing the core can take longer than the grace period.
A Ctrl-Z suspends the runner, and the agent runs on, bounded by `--timeout-ms` and the runner's end.
Once resumed, the runner reports how the agent ended, however long it was suspended.
Three processes supervise the agent: one in the runner's process group, a leader in a session of its own, and a guardian that leads the agent's process group. The guardian's lifeline closes even if the supervisor and leader receive `SIGKILL` together; it then stops its group. The runner reports a transport failure within the wall clock plus the 5 s backstop and 2 s grace period.
The agent's standard input, output and error are pipes the group leader owns, and the leader copies the runner's input to the agent and the agent's output to the runner.
Once the agent exits, the leader copies what those pipes still hold and closes each one when it reaches its end, stays empty for 100 ms, or has been read for 2 s of the time the runner keeps up with it; output any process writes after that is lost.
A process that leaves the group, such as a daemon that starts its own session, keeps running, and the runner does not wait for it.
If the group leader has not ended 5 s after `--timeout-ms` runs out (it was stopped with `SIGSTOP`, say), the other kills it and the agent's group, and the runner exits 4.
On Windows, which has no process groups, the timeout and the signals reach the agent alone, and nothing the agent started is stopped.
Set every leg's `--timeout-ms` below the entry's `maxElapsedMs`, so the runner reports a timeout as exit 5.
At the ceiling, the adapter kills the runner's process group, records the leg as a fault, and `preflight` exits 12.
Exit 2 is left out on purpose: a usage error is a defect in the evaluation's own wiring, and its preflight and oracles see it as a failed run.

## Exit codes

| Exit | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | success; for `preflight`, the preflight passed; for `run`, every trial set sealed; for `score`, every probe scored with no FAIL or Invalid                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2    | `score` only: eval-quality's FAIL, passed through                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3-5  | `preflight`, `run` and `score`: an eval-quality stage's own exit, passed through verbatim (3 is a failed preflight or an Invalid score, 4 a contract defect, 5 a runtime fault); a sealed-brief agent qualification's `score` exit 3 is recorded as an Invalid attempt, and any of its exits other than 0, 2 or 3 stops the run with 12; `score` passes a call's exit through only while the call's staged artifact (or the lack of one), exit and reason lines are what the held inputs produce (see [Score input integrity](#score-input-integrity))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 10   | authoring defect: `check` found at least one finding, a historical probe's `fixCommit` names no commit in a full-history repository, `digest` met an entry it cannot index, `preflight` or `run` met a leg or trial the registry does not authorize or a mutation that cannot be applied exactly once, `run` found no scoring policy, a clean control whose behavior declares no oracle or a probe eval-quality's checks refuse, an evaluation layer it cannot use (a mapping or `evaluator/` that changed since `check`), or a `records` evaluator's records missing or off their schema or its calibration judgments absent or unverifiable, or `score` met a run artifact off its schema or out of agreement with its run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11   | evaluation weakness: a `run` judge calibration, or a `records` evaluator's imported calibration, whose agreement falls below `judgeCalibration.minimumAgreement`, a `run` sealed-brief agent whose agreement on an arm falls below `evaluatorQualification.minimumAgreement`, a `preflight` or `run` mutation whose clean arm does not pass or whose mutated arm does not fail, a historical probe that does not fail before its fix or pass after it, a `run` clean control whose baseline does not pass, or a `preflight` or `run` gameability probe whose degenerate response the naive oracle rejects or the disciplined oracle accepts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 12   | infrastructure: eval-quality is not installed where the runtime can reach it, or a `preflight` or `run` workspace that cannot be made, a target that cannot launch, a qualification arm step or trial that exits an infrastructure code, is stopped by a signal from outside or cannot run, a restore that fails, a restored workspace that does not pass again, a leg that cannot run, a mutated trial whose digest differs from the qualification's, a probe with no trial set, a rubric judge that cannot answer, an evaluator that cannot start, exits other than 0, outlives its `timeoutMs` or answers outside the judgment-rows contract, an evaluator call whose target could not run, a run whose every probe was refused, a change to your project during the run, or a run directory holding an entry the runtime did not write, a file whose bytes differ from the ones it wrote, or a directory the target replaced or moved, or a sealed-brief agent attempt `eval-quality score` cannot score (a call that cannot run, an exit other than 0, 2 or 3, no evidence artifact, or no single trial vote); for `score`, a call that could not run or exited with a code eval-quality does not document, a link or other entry at a score directory or output file, a score directory a process replaced or moved while `score` ran, or a staged evidence artifact that fails eval-quality's published schema, names another corpus or carries no outcome for its probe (see [Score output integrity](#score-output-integrity)), an input that changed or appeared while a call ran, or a call whose staged artifact, exit or `eval-quality:` diagnostic lines the held inputs do not reproduce (see [Score input integrity](#score-input-integrity)) |
| 64   | wiring defect: no `--evaluation` resolves, or the command line is malformed; for `preflight`, `run` and `score`, also an eval-quality stage's own 64, passed through (a qualification's `score` call that exits 64 stops the run with 12); for `score`, no run to score, a `--run` naming no run or a `preflight` invocation, or a run that did not complete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
