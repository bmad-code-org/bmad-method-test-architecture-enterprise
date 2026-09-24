---
title: 'tea-evaluate CLI'
description: 'The Evaluate runtime: check, digest and preflight an evaluation folder, its disposable workspaces and controlled mutations, and the generic skill runner, with their rules and exit codes'
---

# tea-evaluate CLI

`tea-evaluate` is the runtime behind the Evaluate workflow (`bmad-testarch-evaluate`).
It validates an evaluation folder and digests its corpus, so a stale index or a malformed artifact fails before anything runs, and it drives an evaluation's preflight against the real target, qualifying each seeded probe's controlled mutation in a disposable workspace first.
This release ships three subcommands, `check`, `digest` and `preflight`; the run, score, compare and CI subcommands arrive with later Evaluate stories.
TeA also ships `tea-skill-runner`, the command an evaluation registers to run a skill.

## Prerequisites

- Node.js 22.20 or later, with TeA installed (`npm install --save-dev bmad-method-test-architecture-enterprise`), which provides the `tea-evaluate` bin.
- `eval-quality` 4.1.2 or later, installed beside TeA in the project that runs Evaluate (`npm install --save-dev eval-quality`).
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
  policy/scoring-policy.json    # eval-quality's scoring policy; required once a probe takes the controlled-mutation route
  corpus/                       # the corpus the probes run against
  corpus-index.json             # written by tea-evaluate digest
  baseline/                     # committed qualified probes and baseline/qualification/ evidence
  runs/<invocationId>/          # written by each tea-evaluate invocation; gitignored
```

The runtime owns the schemas of `evaluation.json`, the committed probe and the mutation file; they ship under `cli/lib/evaluate/schemas/` in the TeA package.
`contract.json` and `policy/scoring-policy.json` meet the schemas eval-quality publishes.

## check

```bash
npx tea-evaluate check --evaluation evals/my-evaluation
```

`check` prints one line per finding, `<file>: [<rule>] <message>`, and lists every finding.
A control, line-separator or bidirectional formatting character in a finding is printed as an escape (`\n`, `\u202E`), and a file name holding one is quoted, so no file name can print a line of its own.
It exits 0 when there are none and 10 when there is at least one.
The rules:

| Rule                       | Refuses                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stale-index`              | a `corpus-index.json` whose digest differs from the folder's current bytes                                                                                                                             |
| `schema-version`           | an `evaluation.json` version the installed TeA does not know; the message names the installed TeA version and the versions it knows, and is reported alone                                             |
| `runtime-owned-field`      | a committed probe carrying a field the runtime writes: lineage, the attested digests, the system identifier, evidence references, the rollback flag, or a qualification field the mutation file owns   |
| `mutation-operator`        | a mutation whose operator is not `replace-exact` with exactly one occurrence                                                                                                                           |
| `provisioned-target`       | a mutation target inside a directory the workspace provisions, which every workspace holds read-only                                                                                                   |
| `web-interface`            | a contract interface of kind `web`; a web application is evaluated through `api`                                                                                                                       |
| `written-file-signature`   | a defect signature addressing a file the target wrote: the `artifact` channel, or a predicate pointer under `/interactions/<id>/artifact` on any channel                                               |
| `oracle-count`             | a behavior discharged by a defect or gameability probe that does not declare exactly one oracle                                                                                                        |
| `id-pattern`               | a probe, defect, behavior, oracle or mutation ID off its pattern                                                                                                                                       |
| `qualification-digest`     | a public reference under `baseline/qualification/` whose recorded digest does not match the file                                                                                                       |
| `clean-control`            | a clean control that is not `zero-action` with an expected-clean flag and no defects                                                                                                                   |
| `infrastructure-exit-code` | a defect signature or manifestation witness an infrastructure exit code could satisfy (see [The registry](#the-registry))                                                                              |
| `unregistered-executable`  | a `cli` signature or a witness naming a target no registry entry declares                                                                                                                              |
| `skill-root`               | a mutation whose `targetArtifact` is not inside `launch.skillRoot`, a `tea-skill-runner` leg or plan step whose `skill-root` is not `launch.skillRoot`, or a skill root inside a provisioned directory |
| `skill-runner`             | a `tea-skill-runner` registry entry that does not declare exit codes 3 to 6, or a leg or plan step for it with no literal `timeout-ms` below the entry's `maxElapsedMs`                                |

Beside those fifteen, `check` reports a file that does not parse (`json`), one that fails the runtime's schemas (`schema`) or eval-quality's (`engine-schema`), a file not named for its ID (`file-name`), a probe naming a behavior or mutation that does not exist (`reference`), a folder with no `contract.json`, or with no `policy/scoring-policy.json` once a probe takes the `controlled-mutation` route (`missing-file`), an ID declared twice in one file (`duplicate-id`), a registry that declares one interface and executable pair twice (`registry`), a symbolic link or file where `corpus/`, `probes/` or `mutations/` or an entry inside them should be (`corpus-file`), which `digest` refuses with exit 10 as well, and a symbolic link or other non-regular entry under `baseline/` (`baseline-file`).
A `baseline/qualification/` reference must resolve to a regular file inside the folder.

## The registry

`evaluation.json`'s `registry` is the execution-target registry: every command a run may spawn, one registry entry each, in the shape the runtime's `evaluation.json` schema defines once for every entry.
The runtime builds eval-quality's default-deny command target policy from it, so a request naming an interface and executable the registry does not carry is denied before a process starts.
TeA's own harness declares its commands in the same shape and goes through the same builder.

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

Every other workspace of the run (one per seeded probe's qualification, one per mutation) reproduces the pristine one: a worktree of the same commit, or a copy of the pristine copy, whose tree digest must match.
The evaluation folder is left out of every workspace, so a target cannot read the contract, the probes or which defect a mutation plants.
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
This release qualifies the `controlled-mutation` route only: a seeded probe on any other route exits 12 before any workspace is made.
An interaction plan step binding a `captured`, `matcher` or `principal` value stops the arm with exit 12, since the run cannot send the request the contract means.

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
2. The evaluation must be one this release runs: a `cli` interface, and every seeded probe on the `controlled-mutation` route (exit 12 otherwise, and a retry cannot pass).
3. The pristine workspace (see [The workspace](#the-workspace)), with every registry target present and executable in it (exit 12 otherwise), and `run.json`.
4. `eval-quality compile` and `eval-quality seal` over the run's own copy of `contract.json`, writing `eval-contract.json` and `sealed-evaluator-brief.json`; a non-zero exit the CLI documents is passed through.
5. Each seeded probe qualified through its controlled mutation (see [Controlled mutations](#controlled-mutations)), exiting 10, 11 or 12 when a step fails.
6. The legs: eval-quality's `runPreflight` plans them from the contract and the qualified probes (every sensitivity-witness leg, the minted control legs, and each defect's manifestation-witness leg) and drives them through the command-line adapter the registry authorizes.
   A manifestation witness's leg runs in its mutation's mutated workspace, and every other leg in the pristine workspace, each through an authorization whose working directory is that workspace.
   Each request carries the host's values for the environment keys its registry entry permits.
   Every observation is written to `observations/` as it arrives, with the request, the workspace and the working directory beside it; a request's environment is recorded as its keys only, and every injected value of eight characters or more is replaced by `[redacted]` in the observation.
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

| Exit | Meaning                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | success; for `preflight`, the preflight passed                                                                                                                                                                                                                                                                                                                |
| 3-5  | `preflight` only: an eval-quality stage's own exit, passed through verbatim (3 is a failed preflight, 4 a contract defect, 5 a runtime fault)                                                                                                                                                                                                                 |
| 10   | authoring defect: `check` found at least one finding, `digest` met an entry it cannot index, or `preflight` met a leg the registry does not authorize or a mutation that cannot be applied exactly once                                                                                                                                                       |
| 11   | evaluation weakness: a `preflight` mutation whose clean arm does not pass or whose mutated arm does not fail                                                                                                                                                                                                                                                  |
| 12   | infrastructure: eval-quality is not installed where the runtime can reach it, or a `preflight` workspace that cannot be made, a target that cannot launch, a qualification arm step that exits an infrastructure code, a restore that fails, a restored workspace that does not pass again, a leg that cannot run, or a change to your project during the run |
| 64   | wiring defect: no `--evaluation` resolves, or the command line is malformed; for `preflight`, also an eval-quality stage's own 64, passed through                                                                                                                                                                                                             |
