---
title: 'tea-evaluate Evaluators'
description: 'Judge calibration labels, the rubric judge, the evaluation layer and sealed-brief agent qualification in tea-evaluate'
---

# tea-evaluate Evaluators

This page holds how `tea-evaluate` judges a trial: the evaluation layer, the rubric judge, its calibration labels and the qualification of a sealed-brief agent.
The commands that run them are in the [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md) reference.

## Judge calibration labels

When the contract declares rubrics, set `"judgeCalibration": { "minimumAgreement": 0.9 }` in `evaluation.json` and create `policy/judge-calibration.json`:

```json
{
  "items": [
    { "rubricId": "R-101", "criterionId": "RC-101", "response": "Response at level 0", "expectedLevel": 0 },
    { "rubricId": "R-101", "criterionId": "RC-101", "response": "Response at level 1", "expectedLevel": 1 }
  ]
}
```

Provide at least one item at every anchored level of every criterion.
The file must be a regular file inside `policy/`; a link or named pipe is refused.
`check` exits 10 for missing coverage or threshold.
A `records` evaluator with rubrics also needs the judgments your harness's own scorer made over these same items, written beside its records (see [The evaluation layer](#the-evaluation-layer)).

The calibration response follows the criterion's evidence channel.
`stdout`, `stderr`, and artifact examples default to text when the pointer names the whole channel.
Set `"responseKind": "json"` and write the whole JSON channel value in `response` for a JSON root.
A pointer into JSON requires the whole channel value as JSON.
Headers and call inputs require a JSON object.
A response body that looks like JSON is parsed as JSON; set `"responseKind": "text"` when its literal text should be judged.

## The rubric judge

When the contract declares a rubric and the evaluator is the deterministic one, `run` calls a rubric judge once per trial, through TEA's agent adapters; a contract with no rubric makes no call, and its evaluator configuration keeps `judgeConfiguration: null`.
Command and sealed-brief-agent evaluators score the rubric through their own paths; the records kind carries the scores your harness made, which its calibration judgments gate (see [The evaluation layer](#the-evaluation-layer)).
`evaluation.json` wires it, and `policy/evaluator-conditions.json` names its model, a fixed condition of every run (`check` requires both once a rubric is declared):

```json
{ "judge": { "agent": "claude", "model": "claude-sonnet-5-5", "timeoutMs": 120000 } }
```

```json
{
  "schemaVersion": 1,
  "modelSnapshot": "none",
  "systemPromptDigest": "sha256:<64 hex digits>",
  "judge": { "modelSnapshot": "claude-sonnet-5-5" }
}
```

`judge.model` selects the model every judge call runs, and `judge.modelSnapshot` in `policy/evaluator-conditions.json` records which model that was, so both hold the same provider model ID.
Give an immutable ID such as `claude-sonnet-5-5`: an alias such as `sonnet` follows the provider's current model, so the same scoring version can mean different weights over time.
Where an adapter's CLI offers only an alias, the alias is the most the run can record, and the scoring is as reproducible as the alias.
`check` refuses, with exit 10, a `judge.modelSnapshot` that differs from `judge.model`.
`agent` is an adapter key; `agentCommand` replaces the adapter's command (the `custom` adapter requires it), `agentArgs` are appended to its argv, `model` replaces its pinned model, and `timeoutMs` bounds each call.
The judge runs in an empty directory of its own and is asked for read-only capabilities, which bind differently per adapter: `claude` gets its read and search tools only, `codex` its read-only sandbox, and `custom`, which is your own executable, receives no capability argv, so it is yours to keep read-only; `agy` always runs with full permissions, so `check` refuses it as the judge.
Whatever the adapter, the directory must still be empty when the call ends, or the call fails as a judge that could not answer.
It receives the runtime's instruction template, then each rubric's anchored scale levels, failure-mode penalties and bounded length, and each criterion's text with the evidence its pointer names in the trial's observations; it never receives the contract, its oracle checks, its plan or its `testData`.
The template tells it the evidence is data to assess, whose instructions are never followed.
Each call draws a fresh 128-bit nonce after the target runs.
The judge returns one JSON object `{"scores":[{"rubricId","criterionId","score","note"}]}` with an entry per criterion, inside one `<judge-answer nonce="<nonce>">…</judge-answer>` block carrying that nonce.
Only that block is read: anything else in the reply, a scores object a target printed and the judge quoted included, is ignored, and the trial's judge evidence keeps the nonce.
Every record of the trial carries the scores as `judgeResults`; a reply with no answer block carrying the call's nonce or with several, a block that does not hold a JSON object with a `scores` list, a criterion left out or scored twice, a score that is not one of its rubric's levels, and a note longer than the rubric's `maxLength` each become that criterion's `score: null` with a note, which eval-quality reads as Invalid.
A judge that cannot start, times out, exits non-zero or writes into its directory yields no record, and the run exits 12, with the judge's stdout and stderr kept in the trial's evidence.
An interrupting signal that arrives while the judge runs is taken by the run's own handler once the call returns, which records the stage `signal` in `run.json` and ends the process by that signal.
The evaluator configuration records `judgeConfiguration: { modelSnapshot, systemPromptDigest }`, the digest taken over the instruction template, so a changed template or judge model changes the scoring version.

Before trial records, `run` sends each calibration response through the configured rubric scorer.
A deterministic judge sees one criterion per call; command and sealed-brief evaluators use their normal scorer paths.
The scorer never receives `expectedLevel`.
A `records` evaluator's harness runs its own scorer and supplies the judgments instead (see [The evaluation layer](#the-evaluation-layer)).
`judge-calibration.json` in the run directory reports agreement and largest level distance per criterion.
Agreement below the declared minimum exits 11 before any trial record.
The calibration file's byte digest and the minimum agreement appear in `EvaluatorConfiguration.decodingParameters`, so changing either changes the scoring version.
A sealed-brief agent's qualification runs after this calibration and before the first trial (see [Qualifying a sealed-brief agent](#qualifying-a-sealed-brief-agent)).

## The evaluation layer

`evaluation.json`'s `evaluator` chooses what judges the trials (the deterministic evaluator [`run`](/docs/reference/tea-evaluate-cli.md#run) describes when none is declared).
Every kind reaches `eval-quality score` as sealed run records.
`score` refuses a finding that cites no observation, quotes no evidence or cites an observation its record does not hold (exit 10, before any score call).
Whether a quote, a citation or a signature supports the finding is decided by eval-quality's ingest.

| `kind`               | What judges                                                            | Fields                                                                        |
| -------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `deterministic`      | TEA's `resolveCheck` evaluator, with the rubric judge                  | none                                                                          |
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
TEA's rubric judge never runs under these kinds.
An evaluator that cannot start, exits other than 0, outlives `timeoutMs`, answers off the row schema, puts a score row on an oracle key or a pass or fail row on a rubric key, scores off the levels, answers a string that is not well-formed Unicode (a lone surrogate), or answers no row while the mapping binds an oracle yields no record and exit 12.
Its answer is read from its stdout as UTF-8, a byte sequence that is not UTF-8 reading as U+FFFD; what it printed is kept byte for byte in `runs/<invocationId>/evaluator/<arm>/trial-<n>.stdout` and `.stderr`, with `.json` beside them holding the fault (and for an agent, its prompt, nonce and bridge calls), either way.

**The layer's files.** In a git repository the evaluation layer is the files git tracks under `evaluator/`, with their working-tree bytes: a file git does not track (an interpreter's cache, an editor's backup, a note) is no part of it and moves no digest, so `git add` every file the evaluator needs, and `check` refuses a mapping or command git does not track.
Outside a repository it is every regular file under `evaluator/`, so a stray file there changes the scoring version.
Either way a link, a special file or a path through a linked directory is refused, and `check` names a submodule under `evaluator/` as one, since its files are another repository's.
`run` reads the layer's files once, before anything runs, and takes the digests and the mapping from those bytes.
It reads them again before each launch of the evaluator and after each trial, and a file gone, changed or added to the layer stops the run there with exit 12 and no record, since the digests would name bytes that did not run.
In a confined run no process of the run can write under `evaluator/` at all (see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement)), so no file can be swapped between that read and the launch and restored unseen; in a run that opted out, such a swap goes unseen.

**Installed frameworks.** A package in your project's `node_modules` sits outside the tracked tree, so a `command` evaluator declares each framework it depends on in `evaluator/frameworks.json`, which the tree digest covers:

```json
{
  "schemaVersion": 1,
  "frameworks": [
    {
      "package": "acme-evals",
      "version": "1.2.3",
      "probe": { "command": "evaluator/installed-version.mjs", "args": ["acme-evals"], "probeTimeoutMs": 10000 }
    }
  ]
}
```

`version` is the one exact version expected, and `probe` an executable under `evaluator/` that prints `{ "package", "version" }` for the installed package (the skill ships `installed-version.mjs` for a Node package) and exits non-zero when it is not installed.
For a framework whose plugins, transitive dependencies or local patches can change judgments under one version, add `"installState": { "source": "tree" }` and pass `tree` after the package argument to the shipped probe.
It digests installed files in sorted path order.
Use `"source": "lockfile"` and pass `lockfile` to digest the package's entry in the nearest npm `package-lock.json`.
The version alone suffices when the exact release completely determines the judgment dependency.
The declaration pins no digest; the probe prints an observed `installDigest` in `sha256:<64 lowercase hex digits>` form.
For a declared source, the probe also prints `installSource`, which must match `installState.source`.
Put the shipped probe beside the evaluator wrapper so both resolve `node_modules` from the same location.
If the wrapper loads packages elsewhere, write a custom probe that resolves from the wrapper's actual location.
For a nested package, add repeatable `--importer <package>` arguments to the tracked `probe.args` after `tree` or `lockfile`.
List importers in load order.
For example, `["acme-evals-helper", "tree", "--importer", "acme-evals", "--importer", "acme-evals-plugin"]` resolves each importer from the preceding package, then resolves the helper with Node's nearest `node_modules` search from the plugin.
An unresolved importer makes the probe fail.
The probe follows a linked importer's real path before resolving the next package, as Node does by default.
If two same-name dependency copies live inside different importer trees, declare each importer package with `tree` as a separate framework entry; each importer tree digest includes its nested copy.
`frameworks.json` still names a package once.
Each source covers one package.
Declare every plugin or transitive package that contributes judgments as a separate framework entry, including a hoisted package outside the first package's installed tree.
Use `tree` for linked or locally patched packages because their installed files can differ from a lockfile entry under the same version.

```json
{
  "schemaVersion": 1,
  "frameworks": [
    {
      "package": "acme-evals",
      "version": "1.2.3",
      "installState": { "source": "tree" },
      "probe": { "command": "evaluator/installed-version.mjs", "args": ["acme-evals", "tree"] }
    },
    {
      "package": "acme-evals-plugin",
      "version": "2.0.0",
      "installState": { "source": "tree" },
      "probe": { "command": "evaluator/installed-version.mjs", "args": ["acme-evals-plugin", "tree"] }
    }
  ]
}
```

An evaluator with no framework dependency declares `"frameworks": []`.
`check` refuses an absent or malformed declaration and runs no probe.
It also reads `evaluator/LEARNED.md`: its `## Framework and installed version` section holds one backticked `package@version` for each declared package, and a different version, a missing one or a package the declaration omits exits 10 under `evaluator`.
`probe.probeTimeoutMs` is optional and defaults to 10,000 ms.
`check` accepts integer values from 1 to 60,000 ms.
The effective bound is the smaller of that value and `evaluator.timeoutMs`; the evaluator keeps its own timeout.
`run` launches each probe as it launches the evaluator (the base environment and `environmentKeys`, an empty private working directory, and the run's confinement), and reads the versions before the first trial, before each launch of the evaluator and after each trial, calibration included.
After a probe faults, later declared probes are skipped.
A package that is missing, installed at a version other than the declared one, or changed during the run exits 12 and seals no record for the affected trial; before any trial it also leaves no `evaluator/` directory in the run.
When `installState` is declared, a missing or malformed `installDigest` also exits 12 before an affected trial seals.
A changed digest under an unchanged version stops the run at its prelaunch or post-trial read.
`framework-versions.json` in the run directory records the declared and observed versions and each probe's applied `effectiveProbeTimeoutMs`, with diagnostics and output for a failed or skipped probe.
Historical schema version 1 artifacts without that field remain valid.
The observed versions join `decodingParameters["tea.evaluatorFrameworks"]` and `run.json`'s `evaluator`.
An upgrade therefore changes the configuration digest and the scoring version only when `frameworks.json` and `LEARNED.md` are updated to it, and `score` reads the recorded configuration.
The artifact holds the reading taken before the first trial; a change during the run is named in the stopped trial's evaluator `.json` fault beside it.
For declared install state, the observed digest appears beside the version in `framework-versions.json`, `decodingParameters["tea.evaluatorFrameworks"]` and `run.json`'s `evaluator`; a different digest changes the configuration digest and scoring version.
A package absent from the declaration remains outside the observation.

**A command evaluator** runs under TEA's agent supervisor (its own process group, `SIGTERM` at `timeoutMs`, `SIGKILL` 2 s later, its group killed when it ends), with the agents' base environment and your `environmentKeys`, and receives `{ "sealedBrief", "observations" }` on stdin, the observations the record will carry (`evaluator-chosen`).
The executable runs from its folder, `evaluator/`, so module resolution works as usual: a package in your project's `node_modules` or a sibling file it reads resolves as it does outside a run.
Its working directory is an empty private directory the run removes however it ends, an interrupting signal included.
In a confined run it cannot write under `evaluator/`, so a cache it writes beside itself fails there (Python skips its `__pycache__` quietly); in a run that opted out such a cache must be gitignored, or the adopter-tree check after the trial sees your tree change and stops the run with exit 12, and outside a git repository it must write nothing under the project.
A model it calls is named as `policy/evaluator-conditions.json`'s `evaluator.modelSnapshot`.

**A sealed-brief agent** gets the evaluator instructions, a nonce-tagged answer block (as the rubric judge does), the sealed brief and the mapping's keys (a rubric key with its criterion and levels); nothing else of the evaluation.
Before calibration or qualification, `run` asks the configured agent executable for its installed version using the adapter's version arguments.
The `claude` and `custom` adapters append `--version` after `agentArgs`.
The `claude` adapter reads the three-part version in the CLI's own output, such as `2.1.282 (Claude Code)`.
A custom executable must answer that invocation on stdout with one line of JSON whose `agentVersion` is a three-part semantic version, for example `{"agentVersion":"1.2.3"}`.
Plain text, a response without `agentVersion` or with it repeated, malformed JSON, more than one line, a value such as `latest` that is not a semantic version and a value longer than 256 characters exit 12 with the expected shape named, so a dependency's incidental version never becomes the agent's.
The command's stderr is free for its own logging and is never read for the version.
A custom command that printed a bare version such as `1.2.3` before must change that output to the JSON line.
A standalone `--` in `agentArgs` is refused because it can hide the appended version flag.
The probe receives the agent's minimal environment, including declared `environmentKeys`, and has a 3,000 ms timeout.
Supervisor cleanup can take up to 5,000 ms more, so each version read contributes 8,000 ms to a trial's resource ceiling on macOS and Linux.
Windows also reserves its bounded 90,000 ms Job Object setup and 15,000 ms startup slack before the agent clock begins, for 113,000 ms per read.
The run records the observation in `evaluator-configuration.json` as `decodingParameters["tea.evaluatorAgentVersion"]` and in `run.json` as `evaluator.version`; an upgrade changes the configuration digest and scoring version.
The run checks the version before and after every sealed-brief launch, after each qualification attempt and after each trial.
An unreadable or changed version exits 12 before an affected answer counts or trial set seals.
`score` and a baseline replay read the recorded configuration without starting the agent CLI.
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

The bridge admits one connection, presenting a token its process reads from a private file; the file and the configuration that names it reach the adapter as private files the confinement withholds from a target (see [The bridge's admission token](/docs/explanation/why-evaluate-confines-the-target.md#the-bridges-admission-token)).

`claude` runs with no built-in tool, the bridge alone, no user or project settings and no saved transcript (`--tools ""`, `--mcp-config <file>`, `--strict-mcp-config`, `--setting-sources ""`, `--no-session-persistence`), and `check` refuses `agentArgs` that reopen any of them; `custom` receives `--mcp-config <file>`, and keeping to the bridge is its own contract; other adapters are refused.
`evaluator.modelSnapshot` names the agent's model, recorded as the configuration's `modelSnapshot` beside the digest of the evaluator template (instructions, answer line, heading, tool descriptions and call shapes), and as `judgeConfiguration` when a rubric key is bound; a target model named at the top level is kept as `tea.targetModelSnapshot`.
Before its first trial the agent is qualified on the clean arm and on each mutated arm (see [Qualifying a sealed-brief agent](#qualifying-a-sealed-brief-agent)).

**A records evaluator** reads, inside the folder and through no link, `<records>/evaluator-configuration.json` and, per probe the run qualifies, `<records>/<probeId>/*.json` records (name order) and an optional `isolation-manifest.json`.
`run` qualifies and preflights as usual, checks each file's published schema, the configuration's and records' `sealedBriefDigest` against this run's brief, each record's and isolation manifest's `evaluatorConfigurationDigest` against the digest of the imported `evaluator-configuration.json` (bindings included), and one `runId` and the qualified arm per set (exit 10 with nothing copied otherwise; `check` reads no imported record, so only `run` refuses a record sealed against another configuration), and copies the bytes into `trial-sets/` for `score`.
Take the brief from `eval-quality seal`, which is deterministic; nothing ties the records to the target's state at this run.

When the contract declares a rubric, the records carry rubric scores your harness's scorer made, and they count only once that scorer has passed the same calibration gate as every other scorer.
Your harness runs its own scorer over each labelled item in `policy/judge-calibration.json`, handing it the response and nothing of the label, and writes what the scorer saw and answered to `<records>/calibration-judgments.json`.
Copy the runtime's values verbatim: write `evaluator-configuration.json` first (the two `tea.judgeCalibration*` bindings may be absent), run `npm exec --prefix evals -- tea-evaluate digest --evaluation <folder> --calibration-inputs`, put its `scorerConfigurationDigest` and each item's `rubricId`, `criterionId` and `scorerInput` into the judgments file, add only `answer`, and bind `tea.judgeCalibrationDigest` in the configuration to its `calibrationDigest`:

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

- `items` holds one entry per labelled item, in the labelled file's order.
  `answer` is an anchored level of the criterion, or `null` when the scorer gave none, which counts as a disagreement.
- `scorerInput` is exactly the label-free observation the runtime derives from the labelled item: the same observation `run` hands any other scorer, with the interface and operation ID the contract's interaction plan gives the criterion's step (`calibration` for both when it has none).
  It is compared whole, so an extra key, a label such as `expectedLevel`, or a different response fails.
  For a criterion whose evidence is the `stdout` of step `judge-run`, and the contract's interaction plan gives that step operation `judge-request` on interface `verdict`, the response `Response at level 1` is the observation `{ "observationId": "calibration", "sequence": 1, "interfaceId": "verdict", "operationId": "judge-request", "provenance": "evaluator-chosen", "principal": null, "callInputs": { "path": null, "query": null, "header": null, "body": null, "bodyEncoding": null, "argument": null, "option": null, "environment": null, "stdin": null, "arguments": null }, "responseBody": null, "responseHeaders": null, "responseStatus": null, "stdout": { "kind": "text", "value": "Response at level 1" }, "stderr": { "kind": "absent" }, "exitCode": null, "artifacts": {} }`.
- `scorerConfigurationDigest` is eval-quality's `digestArtifact` (kind `EvaluatorConfiguration`) over the imported `evaluator-configuration.json` with `tea.judgeCalibrationDigest` and `tea.judgeCalibrationMinimumAgreement` removed from its `decodingParameters`.
  The full configuration's digest covers the labelled file's digest, which the judgments cannot name before the labelled file is final, so the two bindings are checked separately.
  `digest --calibration-inputs` prints it, so the harness asks after writing the configuration and binds afterwards.
- The configuration binds `decodingParameters["tea.judgeCalibrationDigest"]` to the digest of `policy/judge-calibration.json`'s bytes (eval-quality's `digestBytes`) and `decodingParameters["tea.judgeCalibrationMinimumAgreement"]` to `evaluation.json`'s `judgeCalibration.minimumAgreement`.
  A changed item or minimum changes the configuration digest and the scoring version.
  Bind both values before you seal any record or isolation manifest: each one names `evaluatorConfigurationDigest`, the digest of the final configuration with its bindings, and `run` refuses a record sealed against an earlier one.

`check` and `run` verify the judgments and bindings with one function, so they agree.
A judgments file or configuration that is absent, not JSON, a link, off this shape, or bound to another digest, minimum or scorer configuration is an authoring defect: `check` reports it under the `judge-calibration` rule and `run` exits 10 before it reads or copies any record.
`check` stops there.
`run` then sends a verified file through the same gate as every other scorer: it computes exact agreement and the largest level distance per criterion itself, writes `judge-calibration.json` in the run directory, and exits 11 below the minimum before any record is copied.
A `records` evaluation whose contract declares no rubric never reads a judgments file.

The runtime verifies that judgments bind to the configuration and label-free input.
It cannot prove that your harness ran its scorer to produce the answers, and it does not run or replay that scorer.
A harness that wants that proof runs its scorer through a `command` evaluator.

**Fixed conditions.** `decodingParameters` carries `tea.evaluatorKind` for every kind (so deterministic digests differ once from the release before), and for the row-converting kinds `tea.evaluatorTreeDigest` over the layer's files, `tea.evaluatorWiring` (the `evaluation.json` block), and `tea.evaluatorExecutableDigest`, `tea.evaluatorFrameworks` (the installed framework versions the run observed, an empty list for an evaluator with none) and `tea.evaluatorModelSnapshot` for a command or `tea.evaluatorAgent` and `tea.evaluatorModel` for an agent: a changed file, argument, model or timeout changes the scoring version.
The isolation manifest adds the evaluator's timeout and an agent's call budget to its ceilings and the agent's calls to its use; target reported tokens and cost are included in actual resource use, while absent reports remain zero and are listed in `run.json.unreportedResourceUse`.

## Qualifying a sealed-brief agent

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
The call is held to the bytes the runtime wrote, the way `score` holds its inputs (see [Score input integrity](/docs/explanation/why-evaluate-confines-the-target.md#score-input-integrity)): a file rewritten or a staged artifact substituted while the call ran exits 12 and records no vote.
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

An attempt `eval-quality score` cannot score stops the run with exit 12 before any report is judged: a call that cannot run, an exit other than 0, 2 or 3, no evidence artifact, no single trial vote for the probe, or a call whose inputs, staged artifact, exit or `eval-quality:` lines are not the ones the held bytes give.
An arm whose agreement is below `minimumAgreement` exits 11 as an evaluation weakness, naming the arm and `evaluator-qualification.json`, with no trial record and no `trial-sets.json`.
The two numbers appear in `EvaluatorConfiguration.decodingParameters` as `tea.evaluatorQualificationAttempts` and `tea.evaluatorQualificationMinimumAgreement`, so changing either changes the scoring version.
