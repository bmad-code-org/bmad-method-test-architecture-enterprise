---
title: 'tea-evaluate Manifest'
description: 'The evaluation.json fields, partition plans, registry, HTTP port, launch, workspace, interaction plan and probe routes that tea-evaluate reads'
---

# tea-evaluate Manifest

This page holds the manifest semantics of an evaluation folder: what each `evaluation.json` field means and how `tea-evaluate` reads it.
The commands, their options and their exit codes are in the [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md) reference.

## The evaluation.json fields

The Evaluate skill writes `evaluation.json` with you.
Its fields are listed below.
The top level is closed: a field that is not listed here fails `check` under the `schema` rule.

| Field                    | Required                                   | What it holds                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`          | yes                                        | `2`. A version the installed TEA does not know exits 10 under `check`, before anything else is read.                                                                                                                                        |
| `evaluationId`           | yes                                        | The evaluation's kebab-case identifier.                                                                                                                                                                                                     |
| `requirements`           | yes, `check` refuses a folder without it   | `{ "path": "requirements.md", "digest": "sha256:..." }`. The digest is the one `npm exec --prefix evals -- tea-evaluate digest --evaluation <folder> --file requirements.md` prints, and the contract's `sourceSpecDigest` has to equal it. |
| `targetKind`             | yes                                        | What is evaluated: `agent`, `skill`, `workflow`, `tool-use`, `ai-feature` or `test-review-mechanism`.                                                                                                                                       |
| `interface`              | yes                                        | The interface kind the contract declares: `cli`, `api` or `mcp`. A web application is evaluated through `api`.                                                                                                                              |
| `operationPhases`        | when the contract declares operations      | The phase of every permitted operation, `process` or `outcome`, keyed by interface and then operation ID (see [Operation phases](#operation-phases)).                                                                                       |
| `registry`               | yes, at least one entry                    | Every command a run may spawn, every tool server it may start and every HTTP target it may reach (see [The registry](#the-registry)).                                                                                                       |
| `principalMappings`      | no                                         | Maps a contract principal name to a host credential: `{ "<name>": { "interfaceId", "environmentKey", "prefix"? } }`. The file names the variable that holds the credential.                                                                 |
| `launch`                 | yes                                        | `root`, the evaluated project's root relative to the folder, and `skillRoot` for a skill target (see [The launch](#the-launch)).                                                                                                            |
| `workspace`              | yes                                        | `kind`, `git` or `copy`, and `provision`, the directories copied into every workspace read-only (see [The workspace](#the-workspace)).                                                                                                      |
| `confinement`            | no                                         | `false` runs the targets unconfined and records `opt-out`. Omitted or `true` confines (see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement)).                                                 |
| `arms`                   | yes                                        | The arms a run executes: `clean`, `mutated`, `historical` and `gameability`. Every probe needs its arm declared, and every declared arm needs a probe.                                                                                      |
| `heldOutProbes`          | no                                         | The committed probe IDs reserved from the development partition (see [Held-out probes and partition plans](#held-out-probes-and-partition-plans)).                                                                                          |
| `partitionPlan`          | no                                         | `developmentOnlySteps` and `heldOutPlan`, which keep a request meant for held-out probes out of the development partition.                                                                                                                  |
| `judgeCalibration`       | when the contract declares rubrics         | `{ "minimumAgreement": 0.9 }`, the exact agreement a rubric scorer needs against your labelled examples (see [Judge calibration labels](/docs/reference/tea-evaluate-evaluators.md#judge-calibration-labels)).                              |
| `judge`                  | a rubric under the deterministic evaluator | The rubric judge: `agent`, `timeoutMs`, and optionally `agentCommand`, `agentArgs` and `model` (see [The rubric judge](/docs/reference/tea-evaluate-evaluators.md#the-rubric-judge)).                                                       |
| `evaluator`              | no                                         | The evaluation layer: `kind` is `deterministic` (the default), `command`, `sealed-brief-agent` or `records` (see [The evaluation layer](/docs/reference/tea-evaluate-evaluators.md#the-evaluation-layer)).                                  |
| `evaluatorQualification` | with a `sealed-brief-agent` evaluator      | `attempts`, at least 2, and `minimumAgreement` (see [Qualifying a sealed-brief agent](/docs/reference/tea-evaluate-evaluators.md#qualifying-a-sealed-brief-agent)).                                                                         |
| `trials`                 | yes                                        | Trials per probe per arm. It has to be at or above the scoring policy's `minimumTrialCount`.                                                                                                                                                |
| `tiers`                  | yes                                        | The CI tiers the evaluation takes part in: `pr`, `merge`, `scheduled` or `release`. They equal the tiers the CI plan places a check on.                                                                                                     |
| `strengthFloor`          | yes                                        | The minimum catch rate per probe class, from 0 to 1: `defect`, `gameability` and `zero-action`. `canary` is not a class and `check` refuses it.                                                                                             |

A complete `evaluation.json` for a one-skill evaluation, where the skill decides whether a refund is within the refund limit.
The runner sits in the evaluations folder's install (`evals/node_modules`), inside `launch.root`, which is one of the two setups [Where the runner lives](/docs/reference/tea-evaluate-cli.md#where-the-runner-lives) describes:

```json
{
  "schemaVersion": 2,
  "evaluationId": "refund-check",
  "requirements": {
    "path": "requirements.md",
    "digest": "sha256:1ff6fd24bc3e328dfc4ca28e8ef66464c40fd9e1361435fd966bd205e9f1fc77"
  },
  "targetKind": "skill",
  "interface": "cli",
  "registry": [
    {
      "interfaceId": "refund-skill",
      "executable": "tea-skill-runner",
      "target": "evals/node_modules/.bin/tea-skill-runner",
      "subcommandPaths": [[]],
      "artifacts": {},
      "environmentKeys": [],
      "maxElapsedMs": 100000,
      "infrastructureExitCodes": [3, 4, 5, 6]
    }
  ],
  "launch": {
    "root": "../..",
    "skillRoot": "skill"
  },
  "workspace": {
    "kind": "copy",
    "provision": []
  },
  "arms": ["clean", "mutated"],
  "trials": 3,
  "tiers": ["pr"],
  "strengthFloor": {
    "defect": 1
  },
  "operationPhases": {
    "refund-skill": {
      "review-refund": "outcome"
    }
  }
}
```

## Held-out probes and partition plans

For a held-out set, put committed probe IDs in `evaluation.json` as `"heldOutProbes": ["P-002"]`.
Each ID must name a committed probe, cannot name a clean control, and must leave a development probe for every affected behavior.
Omit the field when every probe belongs to development.

To keep a request meant only for held-out probes out of the development partition, declare a `partitionPlan` beside `heldOutProbes`:

```json
{
  "partitionPlan": {
    "developmentOnlySteps": ["development-run"],
    "heldOutPlan": "corpus/held-out/plan.json"
  }
}
```

Without it, every partition runs the whole `contract.json` plan, and `run --partition` filters only the scored probes.
With it, each step is shared (in `contract.json`, run by every partition), development-only (in `contract.json` and named by `developmentOnlySteps`) or held-out (only in the held-out plan, `held-out-plan.schema.json`: `schemaVersion` 1, `interactionPlan`, `oracles`, optional `rubrics`, `waivers` and `mappings`, and `behaviorOracles`, the oracle IDs each behavior gains in the held-out view).
The file sits directly under `corpus/held-out/`, so `corpus-index.json` digests it.
A plan step carries no `partition` field.

One view over those files is the only contract a run compiles, seals, launches and records, so `contract.json` in the run directory, `eval-contract.json`, the sealed brief, the observations, the trial records and a baseline copied from the run carry only that partition's steps:

| `--partition` | steps launched                    | oracles                                                                                            | rubric criteria                                                                                                         | evaluator mapping rows                                                         | gameability answers                                                                              |
| ------------- | --------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `development` | `contract.json`'s plan, untouched | `contract.json`'s oracles, untouched; the held-out plan is never opened                            | `contract.json`'s rubrics, untouched                                                                                    | `evaluator/mapping.json`, untouched                                            | `corpus/gameability/<probeId>.json`; the held-out answers are never opened                       |
| `held-out`    | shared plus held-out              | the oracles that read a development-only step leave with it; the plan's oracles join each behavior | the criteria that read a development-only step leave with it, a rubric left with none goes, and the plan's rubrics join | the rows that bind what the view dropped leave, and the plan's `mappings` join | `corpus/gameability/` for the shared steps, `corpus/held-out/gameability/` for the held-out ones |
| none (`both`) | every step                        | every oracle, and each behavior gains the oracles the plan lists for it                            | every criterion of `contract.json`, and the plan's rubrics                                                              | every row of `evaluator/mapping.json`, and the plan's `mappings`               | both files, every step                                                                           |

A rubric criterion belongs to the partition whose steps its evidence pointer reads.
A criterion in `contract.json` that reads a shared step is in every view, and one that reads a development-only step is in the development and both views.
A criterion in the held-out plan's `rubrics` is in the held-out and both views, and its evidence names a shared or a held-out step.
A plan rubric's ID differs from every rubric ID of `contract.json`, and a plan rubric carries its own scale, penalties and `maxLength`.
Each partition's run compiles, calibrates and scores the criteria of its own view, and the judge is handed those criteria only.
`policy/judge-calibration.json` is one file for every partition: a run judges the items of the criteria its view holds and leaves the rest to the partition that owns them.
`evaluation.json` declares the judge once, so a contract whose only rubrics sit in the held-out plan still declares it, and a development run over it calls no judge.
`check` names a criterion that no view can reach by its criterion ID, its rubric ID and the step it reads, and names a calibration item of a criterion no view declares.
A criterion of the plan is named by `rubricId/criterionId` only when both IDs have the schema's shape, and by its position in the plan's `rubrics` otherwise; the plan's evidence pointers, channels and scale levels never reach a finding.

A waiver names a discipline rule and no oracle, so its `condition`, the one field of a waiver that reads a step, places it.
A `condition` is a sentence, and every `/interactions/<stepId>` pointer in it names a step wherever the pointer sits, with or without a path after the step, so a waiver that names a development-only step anywhere, beside a shared step or alone, is in the development and both views.
A waiver in `contract.json` whose condition reads a shared step, or no step, is in every view, and one whose condition reads a development-only step is in the development and both views.
A waiver in the held-out plan's `waivers` is in the held-out and both views, and a step its condition reads is a shared or a held-out one.
A plan waiver's ID differs from every waiver ID of `contract.json`, and a waiver that reads a held-out step belongs in the plan, because the development view would name the step.
The engine compiles each view with the waivers that view holds, so a waiver the engine finds incomplete fails the partitions that hold it and leaves the others compiling.
`check` names a waiver that no view can reach by its waiver ID and the step it reads; a step that a plan waiver's condition reads is named only when it is a development-only step.
A waiver is named by its ID only when the ID has the shape `W-nnn`, and by its position in `waivers` otherwise; a plan waiver's rule, rationale, condition and approval never reach a finding.

An evaluator other than the deterministic one binds oracles and criteria to the keys it prints through `evaluator/mapping.json`, and the mapping follows the contract view.
A row of `evaluator/mapping.json` that binds an oracle or criterion of `contract.json` is in the development and both views, and in the held-out view unless the held-out view drops what it binds (an oracle that reads a development-only step, a criterion that does).
A row in the held-out plan's `mappings` is in the held-out and both views.
It has the shape of a row of `evaluator/mapping.json` plus its `key` (`{ "key", "oracleId", "behaviorId" }` or `{ "key", "rubricId", "criterionId", "levels" }`), binds an oracle or criterion the held-out view declares and no other key binds, and has a key that differs from every key of `evaluator/mapping.json` and from the other plan rows' keys.
A held-out oracle's or criterion's row belongs in the plan, because `evaluator/mapping.json` is read by the development partition, and `check` of every partition names a row of that file which binds an oracle, behavior or criterion `contract.json` lacks.

Each partition's mapping is derived beside its contract view: the development view is the file's own bytes, the held-out view is always serialized so its bytes move only with the rows it holds, and the both view of a plan with no `mappings` is the file's bytes.

A run's evaluator layer holds its view's mapping only: the rows the runtime validates a printed key against and converts, the keys a sealed-brief agent is shown, and the `tea.evaluatorTreeDigest` the run records, which digests the view's mapping in place of the file, so a development run's digest depends on no held-out row and a held-out run's on no development-only one.
A `command` evaluator receives `{ "sealedBrief", "observations" }` and never the mapping, so what it receives follows the view through the brief and the observations, and a key its partition's mapping lacks fails the row schema (exit 12).
The development partition reads, executes and digests the files under `evaluator/`, so a command evaluator derives a held-out key from its input and spells none.
A `records` evaluator reads no mapping, and a record of its harness carries the oracles it disposes, the oracle and behavior a finding names, the criteria it scores, the plan steps its observations record and the observations its dispositions and findings cite.
Under a `partitionPlan` a harness names an observation `<label>-<stepId>`, or `<label>-call-<n>` for a call the agent chose, with the label `trial-<n>`, `attempt-<n>`, `baseline`, `degenerate`, `mutated` or `re-pass-<n>` (as in `trial-2-shared-run`).
The import admits an observation only when its ID is `<label>-<a step the run's view declares>` or `<label>-call-<n>`, because a development run never opens the plan and cannot know a held-out step ID.
It refuses every other ID, and a record that names an oracle, behavior or criterion the run's view does not declare, or a disposition or finding that cites an observation its record does not hold (exit 10, nothing copied), by where it sits (`oracleDispositions[2]`, `findings[0].oracleId`, `findings[1].behaviorId`, `judgeResults[0]`, `observations[3]`, `findings[1].observationIds[0]`), never by the ID.
`check` refuses a step whose ID has the form `call-<n>`, in `contract.json` or in the held-out plan, under a `partitionPlan`, because its observation would look like an agent's chosen call.
A records evaluator beside a rubric and a `partitionPlan` is refused, because the harness's calibration judgments answer one labelled file for one contract; a development `check`, `preflight` and `run` refuse it whenever `contract.json` declares the rubric.
`check` names a plan row by its place in `mappings` and never by its key, names the oracle, behavior and criterion IDs the plan's schema shaped, and never prints the levels of a plan rubric.

A gameability probe's degenerate response splits where the plan does.
`corpus/gameability/<probeId>.json` answers the steps of `contract.json`, the shared and the development-only ones, and `corpus/held-out/gameability/<probeId>.json`, beside the held-out plan, answers the steps of the held-out plan; it has the shape of the first file and is required when the plan declares a step.
A probe's arm answers only the steps of the view it runs: the development view reads the first file and never opens the second, the held-out view takes the shared steps from the first and its own from the second, and the both view takes every step from both.
Every gameability probe answers every step of the plan, because the both view runs each probe over the whole plan whichever partition the probe belongs to.
A held-out probe's `naiveOracle` is an oracle of `contract.json` the held-out view keeps: one that reads a development-only step leaves that view, and `check` names it.
`check` names an answer by the probe and the step ID: a development-only or shared answer left out, or a held-out step answered in `corpus/gameability/<probeId>.json`, a held-out answer left out, a missing `corpus/held-out/gameability/<probeId>.json`, or one that answers a step the held-out plan does not declare, that answers it with a response of the other kind, or exits an infrastructure code.
It names a step of the held-out plan by its ID only when the ID has the schema's shape, and by its place in the file otherwise (`steps entry 1`); a held-out answers file's own text, a parser's message and a schema error's key never reach a finding.
A development `preflight` and `run` read no byte of the held-out plan or of `corpus/held-out/gameability/`, and a corpus-index comparison for them leaves the whole `corpus/held-out/` directory out, so an answers file they cannot read stops only a held-out or both run and `check`.
The comparison decides each entry by its path before any listing, so it neither lists nor opens what `corpus/held-out/` holds, and a link, a FIFO or a directory nobody may open there does not stop a development run.
The adopter-tree reading that brackets a run lists that directory and takes only the size, modification time and mode of its files, with the error code of a path it cannot reach, and reads no byte.
`check` and a held-out or both run refuse such an entry by path (exit 10), and refuse a directory spelled in another case, such as `corpus/held-out/Gameability/` or `corpus/Held-Out/` for the plan, since the directory's on-disk spelling decides; a development run seals both spellings.
A held-out or both run records the held-out answers' path and digest in the response record of the probe's qualification and trial evidence, and a development run's record names `corpus/gameability/<probeId>.json` alone.

With no `partitionPlan` every view is the folder's own bytes.
A development run neither parses the held-out plan nor hashes anything under `corpus/held-out/` for the corpus-index comparison, so a plan the run cannot read stops only a held-out or both run, `check` and the `compile` and `seal` checks of `ci` (exit 10).
`check` compiles nothing.
The `compile` and `seal` checks of the `pr` tier of [`ci`](/docs/reference/tea-evaluate-cli.md#ci) run the engine over the development, held-out and both views, so a held-out plan the engine refuses fails the pull request that wrote it, and the engine's `compile` over the held-out view also runs inside `preflight` and `run`.

A held-out probe's behavior names exactly one oracle in the held-out view.
A behavior with a development oracle and a held-out oracle lists both in the both view, and eval-quality designates an oracle for a probe only when its behavior lists exactly one.
A run with no `--partition` therefore gives `eval-quality score` the oracle of each probe's own partition through `--designated-oracle` (eval-quality 7.2.0 or later), so the both view scores each probe as that partition's own run does.
A probe is in the held-out partition when `heldOutProbes` lists it and in the development partition otherwise.
Its oracle is the one oracle its partition's view lists for its behavior, derived by `contractView` as the partition's own run derives it.
When that view lists no oracle or several, nothing is passed and the probe reads as it does in the partition's own run, and when the both view lists exactly one oracle eval-quality designates it itself.
A development run, a held-out run and a folder with no `partitionPlan` pass nothing, so their scores, baselines and replays stay byte for byte as they were.
`score` reads the folder's `contract.json` and, under a `partitionPlan`, held-out plan for a both run only, and `compare --accept` scores through the same call.
A `ci` replay of a both baseline scores each probe under the oracle the baseline's own call record names (its `--designated-oracle` argument) and reads no view of the folder, so the designation is the same in the baseline and the replay, and a folder changed since the baseline is the stale-baseline rule's to report (a warning on `pr`, exit 11 on `release`).
The in-process re-score that `score` compares with every call (see [Score output integrity](/docs/explanation/why-evaluate-confines-the-target.md#score-output-integrity)) is given the same oracle as the call, so a call that dropped it is refused as a staged artifact that differs from the held inputs' (exit 12).
An evaluator qualification attempt of a both run is scored under the same designation.
A held-out plan, `evaluation.json` or `contract.json` that cannot be read or cannot yield the both view, and, under a `partitionPlan`, a probe whose behavior the folder's contract does not hold, are input-check findings of a live `score` or `compare --accept` (exit 10, no score call).
So is a probe whose behavior the folder's both view lists with other oracles than the contract the run sealed, where that can change the designation: the sealed list names several oracles (the run may have designated one), or the folder designates an oracle.
A plan that dropped, added or renamed an oracle, a `contract.json` that gained one and a removed `partitionPlan` are all refused for a behavior whose sealed list names several.
A sealed list of exactly one oracle is designated by the engine from the sealed contract whatever the folder says, so a folder that changed such a behavior (or, with no `partitionPlan`, no longer holds it) is scored, and a baseline replay reports it as stale.
A finding names paths and IDs of the schema's shape and quotes nothing the plan holds.
The both view answers every step of the plan for a gameability probe, so an oracle its answers violate at a step, a held-out oracle beside a development one, files a finding that cites the probe.
eval-quality reads a finding whose observation the probe's `defectSignature` does not admit or satisfy as an unwitnessed claim and scores the designated probe Invalid (exit 3), so give the signature's selector the `any` matcher on the channel that differs by step, and make the answer at every step an oracle reads satisfy its predicate.

## Operation phases

Classify each permitted contract operation in `evaluation.json` under `operationPhases`, keyed by its interface and then its operation ID, for example `"operationPhases": { "verdict": { "judge-request": "outcome" } }`.
Use `process` for an intermediate step and `outcome` for a result the behavior is judged on.
An operation ID is unique only within its interface, so two interfaces may declare the same one and each pair has its own phase, for example `"operationPhases": { "notes-cli": { "read-note": "process" }, "notes-api": { "read-note": "outcome" } }`.
Each sealed observation and each interaction plan step names its `interfaceId` beside its `operationId`.
`check` exits 10, and names the pair, when a declared pair has no phase, a phase names a pair the contract does not declare, or a phase is neither `process` nor `outcome`.
`evaluation.json` `schemaVersion` is 2; a version 1 file, which carried a flat map, exits 10 on its schema version.

## The registry

`evaluation.json`'s `registry` is the execution-target registry: every command a run may spawn, every stdio MCP tool server it may start and every HTTP target it may reach, one registry entry each, in the shapes the runtime's `evaluation.json` schema defines.
The runtime builds eval-quality's default-deny command target policy, MCP target policy and HTTP target policy from it for the workspace each call runs in, so a request naming an interface, executable, tool, address or method the registry does not carry is denied before a process starts or a request is sent.

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
  A runner whose files lie outside `launch.root` is read outside the trial's grants, and `preflight` refuses it with exit 3 before any trial (see [Where the runner lives](/docs/reference/tea-evaluate-cli.md#where-the-runner-lives)).
- `subcommandPaths`: the exact subcommand paths allowed; `[[]]` allows none.
- `artifacts`: the default path of each contract artifact, relative to the run's working directory, under the same path rules as `target`.
- `environmentKeys`: the keys a request may carry into the process; `PATH` is refused.
- `maxElapsedMs` (at most 2147483647), and optional `maxOutputBytes` (8 MiB by default): ceilings a run may lower.
- `infrastructureExitCodes`: the exit codes by which the target reports that it could not run.
  TEA's own per-skill runners declare 1 (an uncaught exception) and 3 to 6; `tea-test-review`, which exits 1 on a failing verdict, declares 2 and 3; `tea-skill-runner` never exits 1 and declares 3 to 6.
- `egress`: the hosts a confined target's processes may reach, each `{ "host", "port", "addresses" }`, on a command, tool-server or HTTP entry that starts a process; see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement).
  A Linux skill or agent target lists its model provider's host and port.
- `login`: `"claude"` on a command entry whose target runs Claude Code on your subscription, so a confined target authenticates with the login you hold; see [A subscription login under confinement](/docs/reference/tea-evaluate-confinement.md#a-subscription-login-under-confinement).

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
- `environmentKeys`: the keys whose host values the server starts with, over the host's `PATH`; a tool call carries only its arguments, so a credential reaches the server here.
  Each value of eight characters or more is replaced by `[redacted]` wherever it appears in what the server answers, in any letter case, in a string, an object key or a number (one whose text holds the value, or one of eight characters or more that the value read as a number equals).
  The forms replaced are the value as written and each form one or two levels of JSON escaping give it: `JSON.stringify`'s string body, with `/` written `\/` or not, and with every non-ASCII character, every `<`, `>` and `&`, or both written `\uXXXX` in lower- or upper-case hex, or none of them.
  Each form matches in any letter case: the value lowercased, upper-cased, capitalized per word or mixed, a mapping that changes its length (`ß` upper-cases to `SS`, `İ` lower-cases to `i` and a combining dot; an echo that mixes `İ` and `i` with that dot matches) and the Turkish mappings of `i` and `I` included.
  Escaped echoes match each letter's case at its own position, including uneven capitalization, Greek final sigma, Cyrillic letters, surrogate pairs and a Turkish-locale capitalizer's `Admin-İndex-Token` with `İ` written as `\u0130`.
  This applies at one or two JSON escape levels and in lower- or upper-case hex.
  A shorter value, one the server splits across fields, and any other encoding of it (base64, URL encoding, a third level of escaping) are not replaced.
  `PATH` is refused.
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
  The schema holds each at its JSON type alone, and eval-quality's own `parseProbeTargetPolicy` decides every rule over it (the schemes, the port range, the methods, the non-empty address and method lists, an address being an IP literal, the ceilings' minimums), so a rule eval-quality adds or changes reaches `check` with no copy in TEA.
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

Each value a started service's keys and an auth header carry, of eight characters or more, is scrubbed from every answer and cause as a tool server's are, and from a fault's message and cause with the same matching, in any letter case, since a URL lowercases the host a redirect names and a denial quotes it and a server may shout or capitalize what it echoes.
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
The port's default export builds eval-quality's environment-probe port from configuration alone (where each interface is, eval-quality's HTTP target policy, auth headers and a transport), and eval-quality's `evaluateTarget` decides every allow or deny, once per request and once per redirect hop, so the port classifies no address and a fix to the policy reaches it with eval-quality.
It resolves a host once per hop, to its first address, and sends to the address eval-quality allowed with the host in the Host header.

An API request body can be `json`, `absent`, or `{ "kind": "raw", "base64": "...", "contentType": "application/json" }`.
Raw base64 must be canonical.
The port decodes it into exact request bytes and sends the declared content type.
Raw requests cannot declare Content-Type in `channels.header`; `body.contentType` is the sole request declaration.
For raw calls, the port replaces configured auth Content-Type and framing headers with the declared type and computed framing.
The port computes Content-Length for nonempty raw bytes and uses chunked transfer framing for an empty raw body; it refuses caller supplied framing headers.
An absent body adds no inferred content type.
The port checks the decoded byte count against `maxRequestBytes`.

`tea-evaluate` never loads the port into its own process.
For each call it starts the port file as a Node process of its own, whose last lines hand the port to TEA's host, which serves the call over file descriptor 3, a channel the runtime opens for its protocol alone; keep those lines when you edit the file.
What the port prints on its standard output and error is its own: the runtime keeps both, up to 1 MiB together, and quotes their end when a call fails, so a `console.log` in the port breaks nothing, and printing past that ceiling ends the call.
The port's process starts with the host's `PATH` and `NODE_EXTRA_CA_CERTS` alone (the latter lets it trust an https target a private authority signed), receives the call's configuration and the auth value of the call's own interface alone on that channel, and ends with the call.
Each call holds the file to the bytes `preflight` or `run` asked for the protocol, and a changed file stops the run (exit 12).
`preflight` and `run` start the port once before anything else and exit 10 when it does not answer as TEA's host, and 12 when its process cannot start or answer in time.
A port that answered then and breaks the protocol during a call (a line on its channel that is no message, output past a ceiling, no answer within the call's ceiling, or an answer eval-quality's own `ProbeObservation` parser does not read or that answers another request) stops the run with exit 12 (`port-contract-violation` for the answer), as an evaluator emitting output outside its import contract does; such an answer is never judged as the target's behavior.
The port file imports `eval-quality` and TEA's package as bare names, which Node resolves from the port file's own location: a `node_modules` in the evaluation folder or a folder above it must hold both, as the project's own install of TEA with its `eval-quality` peer does (see [Prerequisites](/docs/reference/tea-evaluate-cli.md#prerequisites)).
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
Under Bubblewrap a started service runs in a network namespace of its own and the port it reports is the one it bound there (see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement)); the runtime's listener takes the same number on the host when it is free, and the call goes to the port the listener holds.

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
Every process a target starts runs confined to that workspace (see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement)), so a write outside it is refused.
In a run that opted out of confinement, a target that writes outside its workspace anyway (through an absolute path, or through the git state a worktree shares with your repository) is detected afterwards, and the run exits 12, as the end of this section describes; a confined run compares your working tree and the checkout's `HEAD` the same way.
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
Each workspace has a workspace marker and a sidecar ownership marker outside the target subtree, plus an ownership journal under the evaluation's ignored `runs/` directory.
A killed run can leave a temporary copy or a detached worktree and its Git registration.
The next preflight for the same evaluation checks the held journal, markers, project identity and owner process, then reports and reclaims verified scratch from a dead run before reading your project's state.
The sidecar marker survives interrupted directory removal.
A live or unverifiable owner's workspace remains in place.
The journal records the original temporary directory, so recovery still works after `TMPDIR` changes.
The private parent also has an auxiliary ownership record in that journal and a matching marker inside the parent.
A killed preflight can leave engine staging beneath it; a killed `run` can leave command evaluator scratch and the call directories of a confined call there.
The next preflight verifies the same evaluation, invocation, exact parent path, marker and dead owner before reporting and removing that parent with its auxiliary scratch.
The record keeps the original private root, so recovery also works when Windows `TEMP` or `TMPDIR` changes.
A marker write interrupted before completion is accepted only when its bytes match the start of the record and the parent contains nothing else.
A live owner, another evaluation's parent, a linked root and any parent with uncertain ownership remain in place.

In a run that opted out of confinement, a worktree shares your repository's git directory (its refs, configuration, hooks, `info/` and objects), and a target running git in the worktree can change it, which the run detects afterwards and exits 12.
A confined run gives each worktree a private repository instead, and the target can neither read nor write your git directory, apart from the worktree's own entry in it, which it can read (see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement)).
`preflight` reads your project before the workspaces are made and again after the qualification and after the legs.
In a git repository, a confined run reads `git status` (tracked and untracked paths), the content of every path it names, the commit the checkout's own `HEAD` names, and where the checkout's git commands read their repository from: the git directory the checkout resolves to, the content of its `.git` file when that is a file (a linked worktree or a submodule) and whether the hooks directory `core.hooksPath` names exists.
Every process of a confined run is denied a write to your git directory and to the checkout's `.git` file (the targets by their profile, the evaluation layer by its own denial), so the run digests no other part of the git directory.
A `.git` file rewritten to point into another repository, or a hooks directory created during the run, ends the run with exit 12 whatever write path the confinement missed.
A `core.hooksPath` directory that does not exist yet (husky's `.husky/_` before `npm install`) is denied to the evaluation layer under Seatbelt; Bubblewrap cannot bind a path that is absent and the run creates no directory in your tree, so under Bubblewrap the reading of whether it exists is what stops a run during which one appears.
An opted-out run also reads every ref, the common git directory without its object store, reflogs, worktree records, index, submodule or LFS stores and lock files, and the hooks directory `core.hooksPath` names when it lies outside the git directory.
Outside a repository, both read the tree digest of `launch.root` without the evaluation's `runs/`.
A change exits 12, no qualified probe is written and the probe list handed to the CLI is removed, so a target that writes into your tree fails the run, and so does an opted-out target that commits, tags, branches, reconfigures the repository or writes a hook.
A confined run compares your working tree and the checkout's `HEAD`, and does not compare refs, the git configuration, branch tracking or an in-progress operation.
An edit you commit in the checkout the run reads ends it with exit 12, since the checkout's `HEAD` moves.
A commit, fetch, push, branch, rebase or new worktree that another session makes in any other checkout of the same repository (the main checkout when the run reads a linked worktree) while a confined run is in flight does not stop it, and `run.json` records `adopterTree.unchanged: true`.
An opted-out run compares the refs and the shared git state as well, so any such change ends it with exit 12.
If you share a repository with other sessions and run an opted-out evaluation, run it from a standalone clone of the repository, which no other session commits to.
The rollback cycle records the real directory that holds the `targetArtifact` when it plans the mutation, and writes and reads the target only from inside that directory, entered and confirmed to be the one it recorded, so a path swapped for a symbolic link, even by a process the target left running, cannot carry the runtime's own write out of the workspace; a swap or a hard-linked target it sees stops the cycle with exit 12, and the mutation and the restore each write a new file.
Gitignored paths are not read.

`runs/<invocationId>/run.json` records what was evaluated: the TEA and eval-quality versions, the commit (`null` for a copy), `dirty`, the workspace's kind, commit, tree and tree digest, every workspace that ran legs (each as `<workspace>`, see [Paths in the records](/docs/reference/tea-evaluate-evidence.md#paths-in-the-records)), the file-system confinement the targets ran under (`confinement`: `seatbelt`, `bubblewrap` or `opt-out`), and whether your project was unchanged.
It lists each probe the run refused, with its reason, under `refused` (see [Historical probes](#historical-probes)).
A completed `run` adds the contract, corpus, sealed brief and evaluator configuration digests, the matcher `seed`, the runner (each registry entry's interface, executable and target, or a tool server's interface, target, arguments and tools), the evaluator (a command evaluator's observed `frameworks` or a sealed-brief agent's installed `version` included) and the model, the rubric judge (`null` when the contract declares no rubric or the evaluator is not the deterministic one; otherwise its adapter, model, model snapshot, instruction digest and number of calls), the trial count, the start time and duration, how complete each audited trial's reports were (`observedMountsChannel`, see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement); a `records` run has none), and `completed: true`.
A completed `run` that ran trials also records `hostSocketTruncation`, the trials whose calls left sockets of other users reachable because the room for mounts ran out (`[]` when no call was cut; see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement)).
A completed `run` also records `egress`, each entry that lists hosts with its `host:port` items, and, once it ran trials, `egressRefusals`, the trials whose egress proxy refused a request (`[]` when none did; see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement)).

## The interaction plan

Every arm runs the contract's `interactionPlan` once, one request for each step it issues: a qualification arm, a trial, and a gameability trial, which answers each step from its degenerate response.

### Binding kinds

Each key of a step's `inputBinding` channels is sent as its binding says:

For an API step, `inputBinding.body` can also hold the raw body object above.
The runtime sends those bytes and records the complete raw object in `callInputs.body`, with `bodyEncoding: "raw"`; the defect signature can select that exact request.
JSON and absent calls record `bodyEncoding: null`.

- `literal`: the value as written.
- `captured`: the value its pointer (`/interactions/<stepId>/<channel>/<key>`) resolves to on the observation the named earlier step recorded in the same arm, read by eval-quality's own `makeResolveOperand`, the reading `eval-quality score` gives the pointer; a workflow binds a later step to an identifier an earlier step minted this way.
- `matcher: any`: a deterministic value of the declared JSON type.
  The value is derived from the run seed, step, channel and key.
  Pass `--seed <value>` to repeat the same bytes, and read the seed from `run.json`.
- `matcher: type-violating`: a value whose JSON type differs from the declared type.
  String transports refuse this matcher because they cannot carry the differing type.
- `principal`: the runtime reads the host credential named by `evaluation.json`'s `principalMappings.<name>.environmentKey`, applies its optional prefix, and sends it through the mapped registry interface.
  The contract carries the principal name only.
  Persisted requests and `callInputs` replace the credential with `{ "principal": "<name>" }`, and the observation records the same opaque label in `principal`.

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

If the restored workspace fails its re-run, the harness cannot reproduce the clean result and exits 12.
The restored target must match the original bytes.
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
The probe is refused when the pristine workspace is a copy (a `copy` workspace, a target outside git, or `--from-working-tree`); in a shallow clone, when `fixCommit` or its parent is not in the shallow history (fetch the full history to qualify it); when it is not an ancestor of the evaluated commit (or git cannot tell, when the reason is git's own error); when it has no parent (a one-commit repository, say); or when the target cannot run at a revision, before or at the fix: its worktree lacks `launch.root` or holds a submodule under it, the skill root is not a directory, or a registry target is missing or not executable, the same checks a launch meets (links followed, provisioned copies included).
Both revisions' worktrees are checked before either arm runs.

`preflight` qualifies the probe in two worktrees of its own, before any leg runs: the interaction plan once at the pre-fix revision, where the oracles of the probe's behaviors must be violated (`fail-before.json`), and once at the fix commit, where they must hold (`pass-after.json`).
The qualified probe records `fixCommitDigest` (`sha256:` and the SHA-256 of the fix commit's full identifier) and as its `artifactDigest` the tracked tree of the implementation root at the pre-fix revision, where the defect lives.
Each defect's manifestation-witness leg runs in a worktree at the pre-fix revision, and `run` runs the probe's trials on the arm `historical:<preFixSha>`, each in a fresh worktree at that revision.

### Against deployments

The qualification names a pre-fix and a post-fix deployment: the release identifier each runs, how each HTTP interface reports that release, and the origin each HTTP interface of the registry answers at in it.

```json
{
  "route": "historical",
  "deployments": {
    "preFix": {
      "release": "grader-1.4.2",
      "reports": { "grader": { "operationId": "report-release", "pointer": "/release" } },
      "origins": { "grader": "https://grader-1-4-2.staging.example.test" }
    },
    "fix": {
      "release": "grader-1.4.3",
      "reports": { "grader": { "operationId": "report-release", "pointer": "/release" } },
      "origins": { "grader": "https://grader.example.test" }
    }
  }
}
```

- `release`: the identifier the deployment runs, as you name your releases (a version, a tag, a build id): a letter or digit, then letters, digits, `.`, `_`, `+` or `-`, at most 128 characters.
  The run asks each deployment which release each of its HTTP interfaces runs (see `reports`) and refuses the probe when an answer is another identifier, so name the release each deployment reports.
  The pre-fix deployment is asked again after the witness legs and after the trials, so a release that changes while the run measures it refuses the probe too.
  `check` refuses one release for both deployments.
- `reports`: how each HTTP interface of the registry reports the release its origin runs, an object keyed by interface ID whose values are `{ "operationId", "pointer" }`, both required.
  The run asks the origin of every HTTP interface of the registry which release it runs: `reports` names one report for each, and each request goes to that interface's own origin.
  A deployment whose second origin runs another release than its first would otherwise be measured under the identifier the first reported, so `check` refuses a `reports` that leaves an HTTP interface of the registry without a report or names an interface the registry does not serve over HTTP.
  A registry of one HTTP interface names one report.
  Each interface's report operation needs a method and a path template that no other `api` operation of the contract uses, because eval-quality's compile refuses a duplicate operation signature across the whole contract.
  Services that serve their release at the same path need distinct paths, for example a path prefix their proxy strips.
  When a probe's deployments name a report operation, `check` runs eval-quality's own compile and, when it refuses the contract for a duplicate operation signature whose line names a report operation, exits 10 with one `historical` finding that quotes the engine's line, which names both interfaces, both operation IDs and the shared method and path.
  The other operation can be another report operation or an ordinary `api` operation of the contract, on another interface or on the report's own, and the reports of all `historical` probes count together, so one reported interface is enough.
  A collision between two operations that no report names stays the CI plan's `compile` check, whichever shape they have.
  The engine names the first collision it meets, so a report operation's collision behind another collision shows once that one is fixed.
  The compile output and its record go to a private temporary directory that `check` removes, so nothing is written under the evaluation folder.
  Any other compile outcome (an accepted contract, another refusal, a fault, a stage that cannot start, is killed or ends with an exit the CLI does not document, or a temporary directory that cannot be made) draws no finding from this rule and is left to the CI plan's `compile` check and to `run`.
  `operationId` names an operation the contract declares on the `api` interface its key names, which the registry serves over HTTP; `check` refuses an operation that interface does not declare, even when another interface declares an operation with that ID.
  It is a permitted operation of the contract like any other, so `operationPhases` in `evaluation.json` names its phase, and adding it changes the compiled contract.
  The request reads a release and goes to each live deployment before any arm runs, so `check` refuses an operation the contract marks as changing state.
  It is sent with no bound inputs, so `check` refuses an operation whose path template has a parameter or whose request shape requires a key in any channel.
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
Once both deployments are allowed, and before either arm runs, the runtime sends each deployment, the pre-fix one first, one report request per HTTP interface, the interfaces in sorted order of their IDs, each through the evaluation's HTTP port to that interface's own origin, with the same eval-quality policy decision, redirects, ceilings and auth header every call to that interface meets, and reads the string at the pointer of a 2xx answer with a JSON body (the port reads a body as JSON under an `application/json` or `+json` content type).
It refuses the probe when that string is not the declared `release`, naming both identifiers and the interface, so the digests a qualified probe records name the releases every origin of each deployment reported before the arms ran.
A request the policy denies, and an answer with no string at the pointer (a status other than 2xx, a body the port reads as no JSON, or anything but a string at the pointer), refuse the probe too, the reason naming eval-quality's denial, or the pointer and what it found; in each case no arm runs.
The first answer that refuses the probe stops the asking: a refusal needs one finding, so the interfaces after it and, after a pre-fix refusal, the post-fix deployment stay unasked.
Qualifying a probe sends each of its two deployments exactly one report request per HTTP interface before the arms, so two probes on one pre-fix release send each of its origins two.
A reported identifier is quoted in the refusal as JSON writes it, with each character outside printable ASCII escaped and at most 160 characters.
The report call is no trial: it records no evidence artifact and counts against no trial budget.
The run asks the pre-fix deployment which release each of its HTTP interfaces runs at three points: before the qualification arms, after the witness legs and after the trials.
`preflight` runs no trial, so it asks at the first two.
The witness legs and the trials of the arm `historical:<release>` reach the pre-fix deployment after the qualification, so a deployment redeployed in between would otherwise be measured under the identifier the probe declares, and the digests a qualified probe records would name a release the legs and trials never ran against.
Each later point asks every HTTP interface through the same port, policy and refusal as the first, the interfaces in sorted order of their IDs and the first answer that refuses stopping the asking; the post-fix deployment is reached by the qualification arms alone and is asked before the arms only.
The asking before the arms is once per probe, and each later point asks once per pre-fix release (the legs) or per arm (the trials), whatever the number of probes on it.
A deployment that keeps its release is therefore asked, at each of its origins, once per probe before the arms and once at each later point: an arm of N probes sends each pre-fix origin N + 2 requests in a `run` (N + 1 in a `preflight`) and each post-fix origin N requests, so an arm of one probe sends the pre-fix origins three and the post-fix origins one.
The point after the legs comes before `eval-quality preflight` reads the run directory: a pre-fix release that changed refuses every probe on it, which leaves `probes.json` and `observations.json` (each leg's own file under `observations/` stays), so no witness measured under another release reaches the verdict.
The point after the trials comes after the arm's last trial and before any trial set is sealed: a changed release refuses every probe on the arm, no trial set of them is sealed, and the trials' own evidence stays in the run directory, since each trial ran.
A refusal at a later point names the point (`after the witness legs` or `after the trials`), the side, the interface, the identifier reported or what was found, and the declared release.
`run.json`'s `releases` keeps what each interface reported before the arms, and a later refusal is recorded in `refused`.
A pre-fix deployment that cannot answer at a later point stops the run with exit 12, naming the point.
When the engine refused the plan before any leg ran, nothing reached a deployment since the qualification and the point after the legs asks nothing.
A call that reaches no answer (a refused or reset connection, an ended process) or passes a ceiling of the registry entry (the answer's size, its time, its redirects) stops the run with exit 12 as it does for any call, and so does a contract violation of the port.
No worktree is made, so the route needs no git history: it runs from a `copy` workspace and under `--from-working-tree` alike.

`preflight` qualifies the probe against the two deployments, before any leg runs, once each has reported the release every origin runs (`run.json`'s `releases` records, for each qualified probe, each side's declared identifier and the identifier each HTTP interface reported, keyed by interface ID): the interaction plan once against the pre-fix deployment, where the oracles of the probe's behaviors must be violated (`fail-before.json`, naming the release and its origins), and once against the post-fix one, where they must hold (`pass-after.json`).
No server starts for a call to a deployment, and the evidence of a leg or trial that reached one names its origins.
The qualified probe records `artifactDigest` as `sha256:` and the SHA-256 of the pre-fix release identifier, and `fixCommitDigest` as the same over the post-fix one; the two later points hold the legs and trials to the release those digests name.
Each defect's manifestation-witness leg reaches the pre-fix deployment, and `run` runs the probe's trials on the arm `historical:<release>`, named by the pre-fix release, each trial's HTTP calls reaching the pre-fix deployment; `run.json`'s `deployments` names the arm's origins (a route whose probes were all refused after the legs has no arm and leaves it; an arm refused after the trials stays, since its trials ran).
One arm runs one target, so two probes on one arm label at two targets (a worktree and a deployment, or two sets of pre-fix origins) exit 10, as do two labels that differ only in letter case, whose trial directories would meet on a case-insensitive file system.
`check` refuses every such boundary first (neither boundary, deployments beside a `fixCommit`, one deployment, one release for both, a registry entry that is not an HTTP entry, origins off the registry's HTTP interfaces, a shared origin, `reports` that leave an HTTP interface of the registry without a report or name an interface it does not serve over HTTP, or a report that names an undeclared operation, an operation declared on another interface than its key, one the contract marks as changing state, one that needs an input, or a pointer that is no JSON pointer); the runtime refuses the same boundaries again with exit 12, as defence in depth.

### Either route

A refused probe is listed in `run.json`'s `refused` and in `runs/<invocationId>/refused/<probeId>.json`, stays out of the probe list `eval-quality preflight` reads (unless a deployment's release changed after the trials, when the verdict had read the probe already, and its `probes/<probeId>.probe.json` stays) and out of the trial sets, and the rest of the run goes on; a refusal alone does not fail the run, though a run whose every probe was refused, at qualification, after the witness legs or after the trials, has nothing to seal and exits 12.
Either qualification arm going the other way exits 11, since the probe does not straddle the fix; an arm that cannot run exits 12, and one the registry refuses 10.
The qualified probe records `oracleStableAcrossRevisions` as true: both arms are judged by the one compiled contract the run read before any arm ran.

## Gameability probes

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

Under a `partitionPlan` each partition's arm answers only the steps of its own view, from the files its partition keeps beside the plan (`partitionPlan` above): the development and both views answer `contract.json`'s steps from `corpus/gameability/<probeId>.json`, and the held-out and both views answer the held-out plan's steps from `corpus/held-out/gameability/<probeId>.json`.
