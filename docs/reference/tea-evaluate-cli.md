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
- `eval-quality` 4.2.0 or later, installed beside TeA in the project that runs Evaluate (`npm install --save-dev eval-quality`).
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
  evaluator/                    # a command or sealed-brief-agent evaluator: mapping.json, and a command evaluator's executable
  corpus/                       # the corpus the probes run against
  corpus/gameability/P-NNN.json # a gameability probe's degenerate response, one response per plan step
  corpus-index.json             # written by tea-evaluate digest
  baseline/                     # committed qualified probes and baseline/qualification/ evidence
  runs/<invocationId>/          # written by each tea-evaluate invocation; gitignored
  .gitignore                    # ignores runs/ (the skill's assets/evaluation-folder.gitignore)
```

The runtime owns the schemas of `evaluation.json`, the committed probe, the mutation file, the degenerate response, `policy/evaluator-conditions.json`, `evaluator/mapping.json` and the judgment rows an evaluator answers; they ship under `cli/lib/evaluate/schemas/` in the TeA package.
`contract.json` and `policy/scoring-policy.json` meet the schemas eval-quality publishes.

## check

```bash
npx tea-evaluate check --evaluation evals/my-evaluation
```

`check` prints one line per finding, `<file>: [<rule>] <message>`, and lists every finding.
A control, line-separator or bidirectional formatting character in a finding is printed as an escape (`\n`, `\u202E`), and a file name holding one is quoted, so no file name can print a line of its own.
It exits 0 when there are none and 10 when there is at least one.
The rules:

| Rule                       | Refuses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stale-index`              | a `corpus-index.json` whose digest differs from the folder's current bytes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `schema-version`           | an `evaluation.json` version the installed TeA does not know; the message names the installed TeA version and the versions it knows, and is reported alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `runtime-owned-field`      | a committed probe carrying a field the runtime writes: lineage, the attested digests, the system identifier, evidence references, the rollback flag, or a qualification field the mutation file owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `mutation-operator`        | a mutation whose operator is not `replace-exact` with exactly one occurrence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `provisioned-target`       | a mutation target inside a directory the workspace provisions, which every workspace holds read-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `web-interface`            | a contract interface of kind `web`; a web application is evaluated through `api`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `written-file-signature`   | a defect signature addressing a file the target wrote: the `artifact` channel, or a predicate pointer under `/interactions/<id>/artifact` on any channel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `oracle-count`             | a behavior discharged by a defect or gameability probe that does not declare exactly one oracle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `id-pattern`               | a probe, defect, behavior, oracle or mutation ID off its pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `qualification-digest`     | a public reference under `baseline/qualification/` whose recorded digest does not match the file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `clean-control`            | a clean control that is not `zero-action` with an expected-clean flag and no defects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `infrastructure-exit-code` | a defect signature or manifestation witness an infrastructure exit code could satisfy (see [The registry](#the-registry))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `unregistered-executable`  | a `cli` signature or a witness naming a target no registry entry declares                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `skill-root`               | a mutation whose `targetArtifact` is not inside `launch.skillRoot`, a `tea-skill-runner` leg or plan step whose `skill-root` is not `launch.skillRoot`, or a skill root inside a provisioned directory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `skill-runner`             | a `tea-skill-runner` registry entry that does not declare exit codes 3 to 6, or a leg or plan step for it with no literal `timeout-ms` below the entry's `maxElapsedMs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `trials`                   | an `evaluation.json` `trials` below the scoring policy's `minimumTrialCount`, so every trial set `run` seals would fall short of the minimum the scores read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `arms`                     | a probe whose arm `arms` does not declare (a clean control needs `clean`, a probe on the `controlled-mutation` route `mutated`, one on the `historical` route `historical`, a gameability probe `gameability`), or an arm `arms` declares that no probe runs on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `mutation-route`           | a probe on the `controlled-mutation` route that seeds no defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `evaluator-conditions`     | a registry entry that runs `tea-skill-runner`, which always runs an agent, with no `policy/evaluator-conditions.json` naming the model the run uses, or a `modelSnapshot` of `none` beside a `systemPromptDigest` other than `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, the digest of the empty byte string                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `gameability`              | a probe on the `gameability` route that is not a `gameability`-class probe with `expectedClean: false` and no defects, a `naiveOracle` of the probe's own behavior, or a degenerate response that is absent, answers a step the plan does not declare, leaves one unanswered, answers a step with a response of the other kind, or exits an infrastructure code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `historical`               | a probe on the `historical` route without `expectedClean: false`, that seeds no defect, or one whose `source` is not `natural`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `judge`                    | a contract rubric under the deterministic evaluator with no `judge` in `evaluation.json` or no `judge.modelSnapshot` in `policy/evaluator-conditions.json`, a `judge` block in either file beside a contract with no rubric or beside any other evaluator kind, which scores the rubric itself, so nothing would use it, or a `judge` naming an adapter TeA lacks, the `custom` adapter with no `agentCommand`, or a `model` its adapter refuses                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `evaluator`                | a `command` or `sealed-brief-agent` evaluator with no `evaluator/mapping.json`, or one binding an oracle, behavior or rubric criterion the contract does not declare, an oracle to a behavior that does not declare it, levels other than the criterion's anchored scale levels, an oracle or criterion under two keys, or leaving a rubric criterion unbound; a link or special file under `evaluator/`; a `command` executable that is not a regular executable file; a `sealed-brief-agent` on an adapter TeA lacks or one with no bridged run, the `custom` adapter with no `agentCommand`, a `model` its adapter refuses, `agentArgs` that reopen what the bridged run closes, or no `evaluator.modelSnapshot` in `policy/evaluator-conditions.json`; an `evaluator` block there beside the `deterministic` or `records` kind; a `records` directory that is absent or reached through a link |

An evaluator of an unknown kind, and a `command` or `sealed-brief-agent` evaluator with no `timeoutMs`, fail the `evaluation.json` schema (`schema`).
Beside those twenty-three rules, `check` reports a file that does not parse (`json`), one that fails the runtime's schemas (`schema`) or eval-quality's (`engine-schema`), a file not named for its ID (`file-name`), a probe naming a behavior, mutation or naive oracle that does not exist, or an `interface` naming a kind the contract does not declare (`reference`), a folder with no `contract.json`, or with no `policy/scoring-policy.json` once a probe takes the `controlled-mutation`, `historical` or `gameability` route (`missing-file`), a `policy/evaluator-conditions.json` off the runtime's schema (`schema`), an ID declared twice in one file (`duplicate-id`), a registry that declares one interface and executable pair twice, names one interface as both a command and a tool server, serves an interface as a kind other than the one the contract declares, or holds tool servers eval-quality's `parseMcpTargetPolicy` refuses, a tool name it does not admit or two servers for one interface among them (`registry`), a symbolic link or file where `corpus/`, `probes/` or `mutations/` or an entry inside them should be (`corpus-file`), which `digest` refuses with exit 10 as well, and a symbolic link or other non-regular entry under `baseline/` (`baseline-file`).
A `baseline/qualification/` reference must resolve to a regular file inside the folder.

## The registry

`evaluation.json`'s `registry` is the execution-target registry: every command a run may spawn and every stdio MCP tool server it may start, one registry entry each, in the shapes the runtime's `evaluation.json` schema defines.
The runtime builds eval-quality's default-deny command target policy and MCP target policy from it for the workspace each call runs in, so a request naming an interface, executable or tool the registry does not carry is denied before a process starts.
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
- `environmentKeys`: the keys whose host values the server starts with, over the host's `PATH`; a tool call carries only its arguments, so a credential reaches the server here. Each value of eight characters or more is replaced by `[redacted]` wherever it appears in what the server answers, in a string or an object key; a shorter value, or one the server splits across fields, is not. `PATH` is refused.
- `maxElapsedMs` and optional `maxOutputBytes`: the ceilings of one call, from the server's start through the handshake, the call and its teardown.

Each tool-server entry becomes one of eval-quality's `McpTargetAuthorization`s, checked by its own `parseMcpTargetPolicy` (at `check`, and again before any server starts), and every call goes through eval-quality's `createMcpAdapter`: one session per call over stdio, protocol `2025-06-18`, the server's process group torn down after it.
A leg or plan step of an `mcp` operation sends its literal `arguments`, and the run records the call's arguments as `callInputs.arguments`, the tool's structured result as `responseBody` and its error flag as `responseStatus` (1 or 0), so an oracle reads `/interactions/<step>/response-body/...`.
A tool that answers with its error flag set is an observation; a server that cannot start, refuses its handshake or crosses a ceiling is a target that could not run (exit 12), and its fault keeps the adapter's cause, scrubbed.
The record reads the tool's `structuredContent`: a tool that answers with text `content` alone is recorded with an absent body, so an oracle has nothing to read (eval-quality's `mcp` kind describes a structured result).
`evaluation.json`'s `interface` must be a kind the contract declares (`check` rule `reference`).

A denied call is recorded with eval-quality's `forbidden-target` fault and, from eval-quality 4.2.0, the `reason` its policy gave (`interface-not-authorized`, `tool-not-authorized`, `executable-not-authorized`, `subcommand-not-authorized`, `environment-key-not-authorized`), in a leg's `faults/` file, a qualification's or trial's fault and a sealed-brief agent's bridge calls alike; `preflight` and `run` exit 10 and name the reason.

An infrastructure exit code says the target could not run, so it cannot be evidence of a behavior.
`check` resolves each defect signature and each manifestation witness through eval-quality's own `resolveCheck` over an observation that carries one of those codes and no output, with the contract's reference sets in scope, and refuses the probe when the expression could hold (`true` or `insufficient-evidence`) or cannot be resolved at all.
`exit-code != 0` against a runner that exits 3 when its agent is missing would read every broken installation as a caught defect.
Address an exit code, stream or body only the defect produces.

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
A target that writes outside its workspace anyway (through an absolute path, or through the git state a worktree shares with your repository) is detected afterwards, and the run exits 12, as the end of this section describes.
`evaluation.json`'s `workspace` chooses the first one, the pristine workspace:

- `kind: git`, with `launch.root` inside a git repository that has a commit: a detached worktree at `HEAD`, made with `git worktree add --detach` and your repository's hooks disabled.
  The evaluated commit is recorded, and uncommitted changes are left out of the run, which says so on stderr.
  `launch.root` must be tracked at that commit, and must hold no git submodule, which a worktree checks out empty (exit 12; pass `--from-working-tree` to copy the checked-out tree instead).
- `kind: copy`, or `kind: git` with `launch.root` outside any git repository: a temp copy of `launch.root`, without `.git`, identified by its tree digest; no commit is recorded, since no commit names those bytes.
- `preflight --from-working-tree`: a temp copy of the working tree, uncommitted work included, whatever the kind.
  It is the one workspace recorded as `dirty: true`, and a dirty run cannot become a baseline.
  A run is recorded dirty as well when the evaluation folder, which it reads from your working tree, holds uncommitted work.

Every other workspace of the run (one per seeded probe's qualification, one per mutation, and for `run` one for the clean controls' qualification and one per trial) reproduces the pristine one: a worktree of the same commit, or a copy of the pristine copy, whose tree digest must match.
The evaluation folder is left out of every workspace, so nothing the runtime hands a target holds the contract, the probes or which defect a mutation plants.
The runtime does not sandbox the target's file system, though: a target that searches for the evaluation folder (a worktree names your repository's git directory, beside it) can reach it, which is why the run directory below is written and read as it is.
Each `workspace.provision` directory (for example `node_modules`, which a worktree lacks) is copied into the workspace, as a copy-on-write clone where the file system offers one, and its write bits are removed, so a write under it fails unless the writer restores the bits first (root ignores them).
A mutation cannot target a file inside it (`provisioned-target`), and a provisioned directory that is itself a symbolic link is refused with exit 12.
Every symbolic link under `launch.root` in the workspace resolves inside the workspace: a link into the project is re-pointed at the same place in the workspace, and a link that leads out of the project is refused with exit 12, as is a FIFO, a socket or a device, or a temp directory (`TMPDIR`) inside `launch.root`, or inside the repository holding it unless the repository ignores that directory.
Each link is resolved as the system resolves it, so a `..` after a link climbs from the link's target.
A workspace is removed when the command ends, a worktree's entry in your repository included, and also on `SIGINT`, `SIGTERM`, `SIGHUP` or `SIGQUIT`, which stop the running leg and then end the command by the same signal.
A `SIGKILL` runs no handler: a worktree it leaves behind is listed by `git worktree list` until `git worktree prune`.

A worktree shares your repository's git directory (its refs, configuration, hooks, `info/` and objects), so a target running git in it can change them; the run detects such a change afterwards and exits 12.
`preflight` reads your project before the workspaces are made and again after the qualification and after the legs: in a git repository, `git status` (tracked and untracked paths), the content of every path it names, every ref, and the common git directory without its object store, reflogs, worktree records, index and submodule or LFS stores; outside one, the tree digest of `launch.root` without the evaluation's `runs/`.
A change exits 12, no qualified probe is written and the probe list handed to the CLI is removed, so a target that writes into your tree, commits, tags or reconfigures the repository fails the run.
The rollback cycle records the real directory that holds the `targetArtifact` when it plans the mutation, and writes and reads the target only from inside that directory, entered and confirmed to be the one it recorded, so a path swapped for a symbolic link, even by a process the target left running, cannot carry the runtime's own write out of the workspace; a swap or a hard-linked target it sees stops the cycle with exit 12, and the mutation and the restore each write a new file.
Gitignored paths are not read.

`runs/<invocationId>/run.json` records what was evaluated: the TeA and eval-quality versions, the commit (`null` for a copy), `dirty`, the workspace's kind, commit, tree and tree digest, the path of every workspace that ran legs, and whether your project was unchanged.
It lists each probe the run refused, with its reason, under `refused` (see [Historical probes](#historical-probes)).
A completed `run` adds the contract, corpus, sealed brief and evaluator configuration digests, the runner (each registry entry's interface, executable and target, or a tool server's interface, target, arguments and tools), the evaluator and the model, the rubric judge (`null` when the contract declares no rubric or the evaluator is not the deterministic one; otherwise its adapter, model, model snapshot, instruction digest and number of calls), the trial count, the start time and duration, and `completed: true`.

## Controlled mutations

A mutation is `mutations/M-NNN.mutation.json`: a `targetArtifact` relative to `launch.root` (not to the repository, when `launch.root` is a subdirectory of it) and a `replace-exact` operator whose `find` text must occur in that file exactly once, overlapping occurrences counted.
A probe that seeds a defect on the `controlled-mutation` route names its mutation, and `preflight` qualifies it through six steps in a workspace of its own, before any preflight leg runs, so nothing its arms leave behind reaches another probe or a leg:

1. The clean arm: every interaction plan step once, with its literal bindings, through the registry.
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
An interaction plan step binding a `captured`, `matcher` or `principal` value stops the arm with exit 12, since the run cannot send the request the contract means; this release sends literal bindings only.

## Historical probes

A historical probe seeds a real defect that a commit fixed: its defects carry `source: natural`, and its qualification names the fix commit by its hexadecimal id (7 to 40 lowercase hex digits), never a ref, which would move as history advances:

```json
{ "route": "historical", "fixCommit": "4f9c2d1" }
```

The post-fix revision is that commit and the pre-fix revision its first parent, both by full identifier.
The route addresses revisions as git commits whose target launches from a worktree; a target reachable only as a remote deployment is not measured by it in this release.
A `fixCommit` that names no commit in a repository with its full history, or that resolves through a branch or tag of the same spelling, is an authoring defect: the command exits 10 naming the probe.
The probe is refused, with its reason, when the pristine workspace is a copy rather than a git worktree (a `copy` workspace, a target outside git, or `--from-working-tree`); in a shallow clone, when `fixCommit` or its parent is not in the shallow history (fetch the full history to qualify it); when it is not an ancestor of the evaluated commit (or git cannot tell, when the reason is git's own error); when it has no parent (a one-commit repository, say); or when the target cannot run at a revision, before or at the fix: its worktree lacks `launch.root` or holds a submodule under it, the skill root is not a directory, or a registry target is missing or not executable, the same checks a launch meets (links followed, provisioned copies included). Both revisions' worktrees are checked before either arm runs.
A refused probe is listed in `run.json`'s `refused` and in `runs/<invocationId>/refused/<probeId>.json`, stays out of the probe list `eval-quality preflight` reads and out of the trial sets, and the rest of the run goes on; a refusal alone does not fail the run, though a run whose every probe was refused has nothing to seal and exits 12.

`preflight` qualifies a historical probe in two worktrees of its own, before any leg runs: the interaction plan once at the pre-fix revision, where the oracles of the probe's behaviors must be violated (`fail-before.json`), and once at the fix commit, where they must hold (`pass-after.json`).
Either one going the other way exits 11, since the probe does not straddle the fix; an arm that cannot run exits 12, and one the registry refuses 10.
The qualified probe records `fixCommitDigest` (`sha256:` and the SHA-256 of the fix commit's full identifier), `oracleStableAcrossRevisions` (true: both arms are judged by the one compiled contract the run read before any arm ran), and as its `artifactDigest` the tracked tree of the implementation root at the pre-fix revision, where the defect lives.
Each defect's manifestation-witness leg runs in a worktree at the pre-fix revision, and `run` runs the probe's trials on the arm `historical:<preFixSha>`, each in a fresh worktree at that revision.

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
2. The evaluation must be one this release runs: a `cli` or `mcp` interface, and every seeded probe on the `controlled-mutation` or `historical` route (exit 12 otherwise, and a retry cannot pass).
3. The pristine workspace (see [The workspace](#the-workspace)), with every registry target present and executable in it (exit 12 otherwise), and `run.json`.
4. `eval-quality compile` and `eval-quality seal` over the run's own copy of `contract.json`, writing `eval-contract.json` and `sealed-evaluator-brief.json`; a non-zero exit the CLI documents is passed through.
5. Each seeded probe qualified through its controlled mutation (see [Controlled mutations](#controlled-mutations)) or across its fix commit (see [Historical probes](#historical-probes)), exiting 10, 11 or 12 when a step fails; a historical probe with no revisions to address is refused and left out.
   Each gameability probe qualified over its degenerate response with no target launched (see [Gameability probes](#gameability-probes)), exiting 11 when the naive oracle rejects it or the disciplined oracle accepts it; `run` reuses the result.
6. The legs: eval-quality's `runPreflight` plans them from the contract and the qualified probes (every sensitivity-witness leg, the minted control legs, and each defect's manifestation-witness leg) and drives them through the adapter the registry authorizes, eval-quality's command-line adapter for a command and its MCP adapter for a tool call.
   A manifestation witness's leg runs in its mutation's mutated workspace, or on the historical route in a worktree at the pre-fix revision, and every other leg in the pristine workspace, each through an authorization whose working directory is that workspace.
   Each command request carries the host's values for the environment keys its registry entry permits, and each tool server starts with the host's values for its entry's keys.
   Every observation is written to `observations/` as it arrives, with the request, the workspace and the working directory beside it; a request's environment is recorded as its keys only, and every injected or server environment value of eight characters or more is replaced by `[redacted]` in the observation, in its strings and object keys.
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
npx tea-evaluate run --evaluation evals/my-evaluation [--from-working-tree]
```

`run` measures the evaluation: it runs every arm a probe needs `trials` times and seals every trial as a record `eval-quality score` reads.
It needs `policy/scoring-policy.json` (exit 10 without it), and every probe on the `clean-control`, `controlled-mutation`, `historical` or `gameability` route (a canary exits 12, since a retry cannot pass).
The steps run in order in one invocation, each stopping the run with its own exit:

1. The whole preflight, as `preflight` runs it, in the same `runs/<invocationId>/`; a verdict that does not pass ends the run with its exit, and no trial runs.
2. Each clean control qualified: one clean arm in a workspace of its own, whose oracles for the control's behavior must hold (exit 11 otherwise), its evidence under `qualification/<probeId>/baseline-pass.json`.
3. Each arm a probe needs, `trials` times: the clean arm (`conditionArm: clean`) for the clean controls, one mutated arm per mutation (`mutated:<mutationId>`) for the probes it seeds, one historical arm per pre-fix revision (`historical:<preFixSha>`), and one gameability arm per gameability probe (`gameability:<probeId>`).
   Every trial runs the interaction plan once, with its literal bindings, in a workspace of its own that reproduces the pristine one (the mutation applied for a mutated arm and its digest held to the one the qualification measured) or, on a historical arm, the pre-fix worktree; a gameability trial answers the plan from the degenerate response and launches nothing.
   The evaluation layer judges the trial (see [The evaluation layer](#the-evaluation-layer)); under the default deterministic evaluator, when the contract declares a rubric, the rubric judge scores the trial once (see [The rubric judge](#the-rubric-judge)).
   Its requests, observations, oracle resolutions or judgment rows, and any judge reply go to `trials/<arm>/trial-<n>.json`.
   A trial step that exits one of its registry entry's `infrastructureExitCodes`, or that a signal from outside stops (hang-up, interrupt, quit, kill or terminate), is a target that could not run: the trial yields no record and the run exits 12 (a qualification arm step stops its cycle the same way).
   A step that crashes by a signal of its own (an abort, a segmentation fault) is an observation its oracles judge, and its record keeps the negative exit code.
   Your project is read again after every trial (exit 12 on any change, with no trial set written).
4. Every committed probe has its trial set, or the run exits 12, and the run directory holds exactly what the runtime wrote (see [The run directory](#the-run-directory)).
5. One trial set per probe under `trial-sets/<probeId>/`: `record-<n>.json` per trial and `isolation-manifest.json`, with `evaluator-configuration.json` for the whole run, each checked against the schema eval-quality publishes before it is written, and each written as eval-quality's canonical serialization; the contract and sealed-brief digests they carry were taken when `compile` and `seal` wrote those files, before any target ran.
6. `trial-sets.json`, the index `score` reads.
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

The isolation manifest records what the trials were granted and what the runtime observed: the workspace each trial ran in and its read-only provisioned directories as the allowed mounts, the registry's commands and tools as the tool allowlist (`<interface>/<executable>` or `<interface>/<tool>`), the commands and tool calls the runtime made for the plan as the observed tool calls, the tool-call and wall-clock ceilings the runtime enforces, and the largest safe integer (9007199254740991, the most the schema admits for a token ceiling) for the token and cost ceilings, which the runtime neither meters nor bounds; the use it records for tokens and cost is zero (Story 1.29 reads a live target's spend).
The runtime observes no file-system or network access, so the observed mounts, the network allowlist and the observed network targets are empty, and each forbidden input's note says what the runtime withholds and that it does not sandbox the target's file system.
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
Each probe is written to `probes/` with the digests AD-7 names: `commitDigest` is the evaluated commit (`sha256:` and the SHA-256 of its identifier; a copy's tree digest), `artifactDigest` the `targetArtifact` bytes (a clean control's and a gameability probe's is its `implementationDigest`, a historical probe's the tracked tree at its pre-fix revision), and `implementationDigest` the tracked tree of `launch.skillRoot`, or `launch.root`, at that commit, the SHA-256 of `git ls-tree -r -z <commit>:<directory>` with the evaluation folder's entries left out (for a copy, the tree digest of that directory without its provisioned directories).

### Gameability probes

A gameability probe shows that a degenerate, compliant-looking response satisfies a naive oracle and is rejected by the disciplined one.
eval-quality keeps its `degenerateResponse` as prose, so the response's bytes are committed at `corpus/gameability/<probeId>.json`, one response for every interaction plan step, and the committed probe names its naive oracle, an oracle of another behavior; the disciplined oracle is the one oracle of the probe's own behavior.
A command step's response is its streams and exit code:

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

```json
{ "route": "gameability", "degenerateResponse": "Prints a verdict line without judging the request.", "naiveOracle": "O-002" }
```

`preflight` and `run` answer the plan from that file with no target launched, as a synthetic observation, and resolves both oracles over it with eval-quality's `resolveCheck`: the naive oracle must hold (`naive-oracle-satisfied.json`) and the disciplined one must be violated (`disciplined-oracle-rejected.json`), or the command exits 11.
The probe is materialized with those two evidence references and admitted by eval-quality's qualification gate, and its trials on the arm `gameability:<probeId>` answer from the same file, so its isolation manifest grants no workspace and observes no tool call.

### The rubric judge

When the contract declares a rubric and the evaluator is the deterministic one, `run` calls a rubric judge once per trial, through TeA's agent adapters; a contract with no rubric makes no call, and its evaluator configuration keeps `judgeConfiguration: null`.
Under any other evaluator the rubric is that evaluator's to score, and no judge runs (see [The evaluation layer](#the-evaluation-layer)).
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
A process that swaps a file and restores it between that read and the launch goes unseen until Story 1.31 sandboxes the evaluator.

**A command evaluator** runs under TeA's agent supervisor (its own process group, `SIGTERM` at `timeoutMs`, `SIGKILL` 2 s later, its group killed when it ends), with the agents' base environment and your `environmentKeys`, and receives `{ "sealedBrief", "observations" }` on stdin, the observations the record will carry (`evaluator-chosen`).
The executable runs from its folder, `evaluator/`, so module resolution works as usual: a package in your project's `node_modules` or a sibling file it reads resolves as it does outside a run.
Its working directory is an empty private directory the run removes however it ends, an interrupting signal included.
A cache it writes beside itself (`__pycache__`, say) must be gitignored, or the adopter-tree check after the trial sees your tree change and stops the run with exit 12; outside a git repository it must write nothing under the project.
A model it calls is named as `policy/evaluator-conditions.json`'s `evaluator.modelSnapshot`.

**A sealed-brief agent** gets the evaluator instructions, a nonce-tagged answer block (as the rubric judge does), the sealed brief and the mapping's keys (a rubric key with its criterion and levels); nothing else of the evaluation.
The runtime runs the plan first, recorded `baseline` and never shown to the agent; the agent then calls the bridge, a stdio MCP server with one tool per interface of the brief, shaped by kind (`cli`: `arguments`, the whole command line, and `stdin`; `api`: `method`, `path`, `body`; `mcp`: `tool`, `arguments`).
In a `cli` call, `--name=value` is an option, `--name` takes the next word only when an operation declares it non-boolean, and other words, and all after `--`, are positional; a repeated option is refused, since eval-quality's request carries one value per option.
`stdin` reaches the target as written, and the record's `callInputs.stdin` is the JSON object it parses to or, for other text, the text under the operation's one stdin key.
The registry's adapters deny an unlisted executable, subcommand, interface or tool before anything launches, recorded with eval-quality's fault code, its reason and its detail: an `mcp` call goes through the tool-server entry's `McpTargetAuthorization` for the arm's copy, and the operation it matches is the one declaring its tool name; this release's registry declares no HTTP target, so eval-quality denies an `api` call at the interface.
A call matching exactly one operation (by its declared keys) is recorded `evaluator-chosen` and answered with its `observationId`; any other authorized call stays in the evidence as unmatched, with no ID to cite.
Every call counts against `budgets.maxToolCalls` per trial, and none runs after the agent ends.
A call carrying the trial's answer nonce is refused unsent and uncounted, so the agent cannot hand it to the target.
On a gameability arm a call goes through the same adapter and authorizations with nothing launched, so an ungranted one is denied as on any arm, and every other is answered from the degenerate response.
A call the target could not run exits 12.
A plan step and an agent call with the same bindings both match the step, so declare cardinality `any` on a step an agent may repeat.
The bridge admits one connection, presenting a token its process reads from its environment; its configuration reaches the adapter as a private file.
Until Story 1.31 sandboxes the target, a target running as your user could read that token before the agent connects.
`claude` runs with no built-in tool, the bridge alone, no user or project settings and no saved transcript (`--tools ""`, `--mcp-config <file>`, `--strict-mcp-config`, `--setting-sources ""`, `--no-session-persistence`), and `check` refuses `agentArgs` that reopen any of them; `custom` receives `--mcp-config <file>`, and keeping to the bridge is its own contract; other adapters are refused.
`evaluator.modelSnapshot` names the agent's model, recorded as the configuration's `modelSnapshot` beside the digest of the evaluator template (instructions, answer line, heading, tool descriptions and call shapes), and as `judgeConfiguration` when a rubric key is bound; a target model named at the top level is kept as `tea.targetModelSnapshot`.

**A records evaluator** reads, inside the folder and through no link, `<records>/evaluator-configuration.json` and, per probe the run qualifies, `<records>/<probeId>/*.json` records (name order) and an optional `isolation-manifest.json`.
`run` qualifies and preflights as usual, checks each file's published schema, the configuration's and records' `sealedBriefDigest` against this run's brief, and one `runId` and the qualified arm per set (exit 10 with nothing copied otherwise), and copies the bytes into `trial-sets/` for `score`.
Take the brief from `eval-quality seal`, which is deterministic; nothing ties the records to the target's state at this run.

**Fixed conditions.** `decodingParameters` carries `tea.evaluatorKind` for every kind (so deterministic digests differ once from the release before), and for the row-converting kinds `tea.evaluatorTreeDigest` over the layer's files, `tea.evaluatorWiring` (the `evaluation.json` block), and `tea.evaluatorExecutableDigest` and `tea.evaluatorModelSnapshot` for a command or `tea.evaluatorAgent` and `tea.evaluatorModel` for an agent: a changed file, argument, model or timeout changes the scoring version.
The isolation manifest adds the evaluator's timeout and an agent's call budget to its ceilings and the agent's calls to its use; tokens and cost stay zero (Story 1.29).

## score

```bash
npx tea-evaluate score --evaluation evals/my-evaluation [--run <invocationId>]
```

`score` scores the trial sets of a completed run: the one `--run` names, or the most recent `run` invocation.
A run that did not complete (its `run.json` does not say `completed: true`, or it has no `trial-sets.json`) has nothing to score, and `score` exits 64 naming where it stopped, or that it records no end because it is still running or was stopped before it could record one; so does a `--run` naming no run or a `preflight` invocation, and a folder with no run.
Every input is read from the run directory, as a regular file opened without blocking and without following a link (a FIFO or a link there is a finding, never waited on), and checked first:

- `trial-sets.json` against the runtime's own schema (`cli/lib/evaluate/schemas/trial-sets.schema.json`): at least one set, a probe identifier on eval-quality's pattern, and every path inside the run directory;
- the compiled contract, the scoring policy the run copied, the preflight verdict, the evaluator configuration, and each set's probe, records and isolation manifest against the schema eval-quality publishes for it;
- each set against its run: the index names the probes the run sealed, each once, and each record once; each set's `runId` is the one the run derives from its invocation and the probe; each probe file names its probe; every record carries the set's `runId` and arm and the run's contract, sealed brief and evaluator configuration digests; each record's actions and isolation-manifest references are public, name files inside this run directory (the manifest reference its set's own manifest) and digest the files they name (a `records` run's records are your harness's own, so its run IDs, references and digests are left to eval-quality, and the index must name exactly the records the run copied); and the record count, the corpus digest, and the digests of the compiled contract, the policy, the preflight verdict, the evaluator configuration, each probe file, each record and each isolation manifest are the ones `run.json` recorded (under `artifacts` and `policyDigest`), so a file the run did not seal, or one rewritten or copied in from another run, is refused.
  `score` holds each file to the digest `run.json` recorded; a process that can write the run directory after the run, a target's leftover process included, can rewrite both, and Story 1.31 closes that.

Any finding exits 10, names the file, and runs no `score` call.
Each `eval-quality: invalid: <reason>` line a call writes to stderr is also printed, prefixed with its probe.
An isolation manifest that is absent is passed on as absent and never filled in, so eval-quality reads that trial set as Invalid.

A probe the run refused has no trial set; `score` prints each one with its reason and records them under `refused` in its aggregate `score.json`, and its exit does not change.
Then `eval-quality score` runs once per probe, with every trial's `--record`, the set's `--isolation-manifest`, the run's `--evaluator-configuration` and the run's corpus digest, and writes the evidence artifact with `--out`.
Each call goes to `runs/<invocationId>/scores/<scoreInvocationId>/<probeId>/`: `score.json` (its executable, argv, exit code, stdout and stderr, kept whether or not an evidence artifact was emitted) and `evidence-artifact.json` when there is one, with `score.json` beside the probes summarizing each call's exit.
Every call's exit is eval-quality's own: 0 (PASS, WAIVED or CONCERNS), 2 FAIL, 3 Invalid, 4 a structural failure, 5 a runtime fault, 64 usage.
`score` exits with the most severe of them, in the order 64, 5, 4, 3, 2, 0, and the call that produced it is on record; rerunning `eval-quality score` by hand on a persisted argv gives the same exit and byte-identical evidence.
A call that cannot run, is killed or exits with a code the CLI does not document is recorded, the other calls still run, and `score` exits 12.

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
| 5    | timeout: the agent outlived `--timeout-ms`; its process group got `SIGTERM`, and the agent `SIGKILL` 2 s later if it was still running                                                                                    |
| 6    | parser: reserved by the shared runner table                                                                                                                                                                               |

A registry entry for the runner declares `infrastructureExitCodes` 3 to 6, and `check` holds it to that.
Its target is the bin name `tea-skill-runner`, which `npm exec` resolves from the evaluation's installed TeA, or a path to `skill-runner.js`.
The agent runs in its own process group.
When the agent exits, every process left in that group receives `SIGKILL` at once.
The group is also stopped when `--timeout-ms` runs out, when the runner's process group receives `SIGINT`, `SIGTERM`, `SIGHUP` or `SIGQUIT` (a terminal's Ctrl-C or `Ctrl-\` included), and when the runner or the supervisor process between it and the agent dies, by `SIGKILL` included.
Stopping sends the group the signal received (`SIGTERM` for a timeout or a death), and the agent `SIGKILL` 2 s later if it is still running.
An agent the `SIGKILL` ends is reported as killed by `SIGKILL` once it outlived the grace period after the signal that asked it to stop; a `SIGQUIT` can end that way wherever the system hands core files to a collector, since writing the core can take longer than the grace period.
A Ctrl-Z suspends the runner, and the agent runs on, bounded by `--timeout-ms` and the runner's end.
Once resumed, the runner reports how the agent ended, however long it was suspended.
Two processes supervise the agent: one in the runner's process group, and a group leader in a session of its own, which starts the agent's group.
The agent's standard input, output and error are pipes the group leader owns, and the leader copies the runner's input to the agent and the agent's output to the runner.
Once the agent exits, the leader copies what those pipes still hold and closes each one when it reaches its end, stays empty for 100 ms, or has been read for 2 s of the time the runner keeps up with it; output any process writes after that is lost.
A process that leaves the group, such as a daemon that starts its own session, keeps running, and the runner does not wait for it.
If the group leader has not ended 5 s after `--timeout-ms` runs out (it was stopped with `SIGSTOP`, say), the other kills it and the agent's group, and the runner exits 4.
On Windows, which has no process groups, the timeout and the signals reach the agent alone, and nothing the agent started is stopped.
Set every leg's `--timeout-ms` below the entry's `maxElapsedMs`, so the runner reports a timeout as exit 5.
At the ceiling, the adapter kills the runner's process group, records the leg as a fault, and `preflight` exits 12.
Exit 2 is left out on purpose: a usage error is a defect in the evaluation's own wiring, and its preflight and oracles see it as a failed run.

## Exit codes

| Exit | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | success; for `preflight`, the preflight passed; for `run`, every trial set sealed; for `score`, every probe scored with no FAIL or Invalid                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2    | `score` only: eval-quality's FAIL, passed through                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3-5  | `preflight`, `run` and `score`: an eval-quality stage's own exit, passed through verbatim (3 is a failed preflight or an Invalid score, 4 a contract defect, 5 a runtime fault)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 10   | authoring defect: `check` found at least one finding, a historical probe's `fixCommit` names no commit in a full-history repository, `digest` met an entry it cannot index, `preflight` or `run` met a leg or trial the registry does not authorize or a mutation that cannot be applied exactly once, `run` found no scoring policy, a clean control whose behavior declares no oracle or a probe eval-quality's checks refuse, an evaluation layer it cannot use (a mapping or `evaluator/` that changed since `check`), or a `records` evaluator's records missing or off their schema, or `score` met a run artifact off its schema or out of agreement with its run                                                                                                                                                                                                                                                                                                                                                               |
| 11   | evaluation weakness: a `preflight` or `run` mutation whose clean arm does not pass or whose mutated arm does not fail, a historical probe that does not fail before its fix or pass after it, a `run` clean control whose baseline does not pass, or a `preflight` or `run` gameability probe whose degenerate response the naive oracle rejects or the disciplined oracle accepts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 12   | infrastructure: eval-quality is not installed where the runtime can reach it, or a `preflight` or `run` workspace that cannot be made, a target that cannot launch, a qualification arm step or trial that exits an infrastructure code, is stopped by a signal from outside or cannot run, a restore that fails, a restored workspace that does not pass again, a leg that cannot run, a mutated trial whose digest differs from the qualification's, a probe with no trial set, a rubric judge that cannot answer, an evaluator that cannot start, exits other than 0, outlives its `timeoutMs` or answers outside the judgment-rows contract, an evaluator call whose target could not run, a run whose every probe was refused, a change to your project during the run, or a run directory holding an entry the runtime did not write, a file whose bytes differ from the ones it wrote, or a directory the target replaced or moved; for `score`, a call that could not run or exited with a code eval-quality does not document |
| 64   | wiring defect: no `--evaluation` resolves, or the command line is malformed; for `preflight`, `run` and `score`, also an eval-quality stage's own 64, passed through; for `score`, no run to score, a `--run` naming no run or a `preflight` invocation, or a run that did not complete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
