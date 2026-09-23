---
title: 'tea-evaluate CLI'
description: 'The Evaluate runtime: check and digest an evaluation folder, with its rules and exit codes'
---

# tea-evaluate CLI

`tea-evaluate` is the runtime behind the Evaluate workflow (`bmad-testarch-evaluate`). It validates an evaluation folder and digests its corpus, so a stale index or a malformed artifact fails before anything runs. This release ships two subcommands, `check` and `digest`; the preflight, run, score, compare and CI subcommands arrive with later Evaluate stories.

## Prerequisites

- Node.js 22.20 or later, with TeA installed (`npm install --save-dev bmad-method-test-architecture-enterprise`), which provides the `tea-evaluate` bin.
- `eval-quality` 4.0.0 or later, installed beside TeA in the project that runs Evaluate (`npm install --save-dev eval-quality`). TeA declares it as an optional peer dependency, so a project that installs TeA only for its other workflows never receives it. Without it, `tea-evaluate` exits 12 and names the missing package.

`tea-evaluate` reads no BMAD configuration. Every subcommand takes `--evaluation <path>`, naming the evaluation folder or its `evaluation.json`, and exits 64 when that flag is missing or resolves to no `evaluation.json`. Nothing defaults to the working directory.

## The evaluation folder

```text
<evaluationId>/
  evaluation.json               # TeA manifest: target kind, interface, registry, workspace, arms, trials, tiers, strength floor
  contract.json                 # the Behavioral Evaluation Contract
  probes/P-NNN.probe.json       # one committed probe per file, authored fields only
  mutations/M-NNN.mutation.json # one controlled mutation per file
  corpus/                       # the corpus the probes run against
  corpus-index.json             # written by tea-evaluate digest
  baseline/                     # committed qualified probes and baseline/qualification/ evidence
```

The runtime owns the schemas of `evaluation.json`, the committed probe and the mutation file; they ship under `cli/lib/evaluate/schemas/` in the TeA package. `contract.json` meets the contract schema eval-quality publishes.

## check

```bash
npx tea-evaluate check --evaluation evals/my-evaluation
```

`check` prints one line per finding, `<file>: [<rule>] <message>`, and lists every finding. A control, line-separator or bidirectional formatting character in a finding is printed as an escape (`\n`, `\u202E`), and a file name holding one is quoted, so no file name can print a line of its own. It exits 0 when there are none and 10 when there is at least one. The rules:

| Rule                       | Refuses                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stale-index`              | a `corpus-index.json` whose digest differs from the folder's current bytes                                                                                                                           |
| `schema-version`           | an `evaluation.json` version the installed TeA does not know; the message names the installed TeA version and the versions it knows, and is reported alone                                           |
| `runtime-owned-field`      | a committed probe carrying a field the runtime writes: lineage, the attested digests, the system identifier, evidence references, the rollback flag, or a qualification field the mutation file owns |
| `mutation-operator`        | a mutation whose operator is not `replace-exact` with exactly one occurrence                                                                                                                         |
| `provisioned-target`       | a mutation target inside a directory the workspace provisions read-only                                                                                                                              |
| `web-interface`            | a contract interface of kind `web`; a web application is evaluated through `api`                                                                                                                     |
| `written-file-signature`   | a defect signature addressing a file the target wrote: the `artifact` channel, or a predicate pointer under `/interactions/<id>/artifact` on any channel                                             |
| `oracle-count`             | a behavior discharged by a defect or gameability probe that does not declare exactly one oracle                                                                                                      |
| `id-pattern`               | a probe, defect, behavior, oracle or mutation ID off its pattern                                                                                                                                     |
| `qualification-digest`     | a public reference under `baseline/qualification/` whose recorded digest does not match the file                                                                                                     |
| `clean-control`            | a clean control that is not `zero-action` with an expected-clean flag and no defects                                                                                                                 |
| `infrastructure-exit-code` | a defect signature or manifestation witness an infrastructure exit code could satisfy (see [The registry](#the-registry))                                                                            |
| `unregistered-executable`  | a `cli` signature or a witness naming a target no registry entry declares                                                                                                                            |

Beside those thirteen, `check` reports a file that does not parse (`json`), one that fails the runtime's schemas (`schema`) or eval-quality's (`engine-schema`), a file not named for its ID (`file-name`), a probe naming a behavior or mutation that does not exist (`reference`), a folder with no `contract.json` (`missing-file`), an ID declared twice in one file (`duplicate-id`), a registry that declares one interface and executable pair twice (`registry`), a symbolic link or file where `corpus/`, `probes/` or `mutations/` or an entry inside them should be (`corpus-file`), which `digest` refuses with exit 10 as well, and a symbolic link or other non-regular entry under `baseline/` (`baseline-file`). A `baseline/qualification/` reference must resolve to a regular file inside the folder.

## The registry

`evaluation.json`'s `registry` is the execution-target registry: every command a run may spawn, one registry entry each, in the shape the runtime's `evaluation.json` schema defines once for every entry. The runtime builds eval-quality's default-deny command target policy from it, so a request naming an interface and executable the registry does not carry is denied before a process starts. TeA's own harness declares its commands in the same shape and goes through the same builder.

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
- `target`: a POSIX path relative to the evaluated project's root, or a bare command name resolved through the adapter's own `PATH`; never absolute, with no `.`, `..` or empty segment, no trailing slash, and no control, line-separator or bidirectional formatting character. The runtime's target check refuses a relative target that is missing, is not a regular file, or lacks its executable bit.
- `subcommandPaths`: the exact subcommand paths allowed; `[[]]` allows none.
- `artifacts`: the default path of each contract artifact, relative to the run's working directory, under the same path rules as `target`.
- `environmentKeys`: the keys a request may carry into the process; `PATH` is refused.
- `maxElapsedMs`, and optional `maxOutputBytes` (8 MiB by default): ceilings a run may lower.
- `infrastructureExitCodes`: the exit codes by which the target reports that it could not run. TeA's runners declare 1 (an uncaught exception) and 3 to 6; `tea-test-review`, which exits 1 on a failing verdict, declares 2 and 3.

An infrastructure exit code says the target could not run, so it cannot be evidence of a behavior. `check` resolves each defect signature and each manifestation witness through eval-quality's own `resolveCheck` over an observation that carries one of those codes and no output, with the contract's reference sets in scope, and refuses the probe when the expression could hold (`true` or `insufficient-evidence`) or cannot be resolved at all. `exit-code != 0` against a runner that exits 3 when its agent is missing would read every broken installation as a caught defect. Address an exit code, stream or body only the defect produces.

## digest

```bash
npx tea-evaluate digest --evaluation evals/my-evaluation
```

`digest` writes `corpus-index.json`: every file under `corpus/`, `probes/` and `mutations/` as a path relative to the folder and the SHA-256 of its bytes, sorted by path. It prints the corpus digest, which is eval-quality's artifact digest over that index, so any byte change in the corpus, the probes or the mutations moves it. Run it after every change to those folders; `check` refuses a stale index.

## Exit codes

| Exit | Meaning                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------- |
| 0    | success                                                                                        |
| 10   | authoring defect: `check` found at least one finding, or `digest` met an entry it cannot index |
| 12   | infrastructure: eval-quality is not installed where the runtime can reach it                   |
| 64   | wiring defect: no `--evaluation` resolves, or the command line is malformed                    |
