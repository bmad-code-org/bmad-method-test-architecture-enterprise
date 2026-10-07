---
title: "Story 1.89: Pass the target's exact environment through the socket launcher"
type: 'feature'
created: '2026-10-06'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '31206cd2e50ddb6309149afbb2df323323df95ed'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.89, 1.82, 1.86, 1.87 and 1.88)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.89, 1.82 and 1.88 sections)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.82.md (the launcher and the `SHELL_VARIABLES` restore, Decision 15)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.88.md (the record format and the layer's own relisting this story leaves alone)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A call that hides host sockets starts `/bin/sh -c 'exec 3<"$1" || exit 126; shift; exec "$@"'` as its launcher, so a shell stands between the runtime and Bubblewrap, and `env` restores the seven variables the shell is known to rewrite (`PWD`, `OLDPWD`, `SHLVL`, `_`, `IFS`, `OPTIND`, `PPID`).
The target's environment still depends on whether sockets are hidden for the names a shell treats specially: under dash a variable whose name is no valid shell name (`BASH_FUNC_f%%`, `my.setting`) is dropped, and under bash as `/bin/sh` a held `PS1` is dropped, `PS2`, `PS4`, `LINENO`, `RANDOM`, `SHELLOPTS`, `BASHOPTS`, `BASH` and `BASH_VERSION` are rewritten and `BASH_FUNC_*` is serialized again.
The list of names does not end (AD-8).

**Approach:** the shell is removed.
A Node program the runtime starts outside the sandbox, first in the call's command and before `strace`, opens the arguments file as descriptor 3, starts the command with the call's environment from a file the runtime wrote for it, and ends as the command ended.
The program starts with the loader variables the engine's own watchdog carries and nothing else.
The status shim inside the sandbox starts the target with the environment recorded for its own process.
The reference's sentence that states the limit is replaced by the exact-environment sentence.

## Boundaries & Constraints

**Always:** no shell in the path of a call that hides sockets, no native build, no new dependency.
The launcher stays outermost and before `strace`, so the audit traces Bubblewrap alone.
`SHELL_VARIABLES`, the `env` restore and the refusal of an executable path that holds `=` are gone.
The target of a call that hides sockets and the target of one that hides none receive byte-identical environments, for every name.
The evaluation layer's processes (Story 1.88) keep their relisting at every start and their mask guard, byte for byte.
The Linux cases skip with their reason named on a host with no usable `bwrap`, and everything this host can prove is proven through the argument vector and a stub `bwrap`.
The engine check runs at start and end.
No eval-quality change.
No skill file changes: `references/ci.md`, `SKILL.md`, `assets/evaluation-ci-plan.template.json`, every `capture-record.json`, and the exit-table rows the dogfood mutations replace stay as they are.

**Never:** a shell, `process.execve` with a descriptor (Node opens every file close-on-exec), a launcher started with the call's environment, an environment value on a command line, a native helper, a container, a live run.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason and the rejected option.

## I/O & Edge-Case Matrix

| Scenario                         | Input / State                                                                                        | Expected Output / Behavior                                                                               | Error Handling                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Names a shell treats specially   | `BASH_FUNC_f%%`, `my.setting`, a held `PS1`, with and without a hidden socket, dash and bash as `sh` | the two printed environments are byte-identical                                                          | n/a                                               |
| The seven names the restore knew | `PWD`, `OLDPWD`, `SHLVL`, `_`, `IFS`, `OPTIND`, `PPID` held, empty or unset                          | the target holds each as the call gave it, no `env` restore in the vector                                | n/a                                               |
| A decimal integer name           | a variable named `3`                                                                                 | reaches the command exactly, in order, through the launcher and the shim                                 | n/a                                               |
| First word with `=`              | a Bubblewrap executable whose path holds `=`                                                         | the call starts and the environment is exact                                                             | n/a                                               |
| The launcher's own environment   | a `NODE_OPTIONS` that names a script, in the call's environment                                      | the script runs in the command alone                                                                     | n/a                                               |
| The vector                       | a call that hides sockets, audited and not                                                           | Node, the launcher, the arguments file, the environment file, then `strace`, then Bubblewrap             | n/a                                               |
| Descriptor 3                     | the launcher starts a command                                                                        | descriptor 3 of the command holds the arguments file, which `bwrap --args 3` reads                       | an arguments file that cannot be opened: exit 126 |
| The command ends                 | an exit code, a signal, a command that is not found, one that cannot run                             | the launcher ends by the same code or signal; 127 and 126 as a shell reports them                        | the reason on standard error                      |
| A signal to the launcher         | SIGTERM, SIGINT, SIGHUP, SIGQUIT, SIGUSR1, SIGUSR2                                                   | the command receives it                                                                                  | n/a                                               |
| The engine's group kill          | a negative pid kill of the launcher's group                                                          | the command ends with it                                                                                 | n/a                                               |
| The environment file             | read once, a bad one, a missing one                                                                  | removed by the launcher at once and by the runtime when the call ends; a bad or missing file is exit 126 | the file named, the command not run               |
| Reference                        | `docs/reference/tea-evaluate-cli.md`, `### File-system confinement`                                  | the limit sentence is gone and the launcher sentence and the exact-environment sentence stand            | n/a                                               |

</frozen-after-approval>

The frozen block was written for this build from the story's acceptance criteria in `epics.md` and the probes below.
The `bmad-build` skill rendered on this host; its human checkpoints were not stopped at, since the owner delegated every decision, and each decision is recorded below.

## Code Map

- `cli/lib/evaluate/confinement-launcher.cjs` (new): the launcher.
  It requires nothing of the repository and starts nothing when required (`ARGUMENTS_DESCRIPTOR`, `FORWARDED`, `parseArguments`, `readEnvironment`).
- `cli/lib/evaluate/confinement.js`: `SOCKET_ARGUMENTS_FD`, `SOCKET_LAUNCHER` (now the launcher's path), `launcherEnvironment`, `launchTooLarge`, `stringEnvironment`, `launchedCommand`, the target call's file writes and `holdKey` in `targetSandbox().wrap`, `releaseSocketFile` and the two callers that hand the engine `wrapped.environment` (`confinedCommandMechanism`, `confinedMcpMechanism`).
  `SHELL_VARIABLES` and `ENVIRONMENT_PROGRAM` are gone.
- `cli/lib/evaluate/confinement-status.cjs`: `startEnvironment`, the environment the shim starts the target with.
- `eval-quality.config.json`: the `doc-claims` foreign symbols (six bash variables the removed limit sentence named leave, `NODE_V8_COVERAGE` joins, the reasons of four shell variables change).
- `test/test-evaluate-run.js`: the byte-identity check in `checkPathSocketUnits` (with `environmentOf`, `stubIn`, the shell legs), the new case `checkSocketLauncher`, the exact-environment block of `checkPathSocketRoute`, the status-directory check after a call that started twice, the two claims and the stale-sentence check of `checkBridgeReference`.
- `test/lib/isolation-golden.js` and `test/fixtures/isolation-primitives/golden.json`: the launcher's vector and the environment file.
- `docs/reference/tea-evaluate-cli.md` (`### File-system confinement`), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, this record.
- Not changed: `cli/lib/evaluate/confinement-audit.js` (its `/bin/sh` is a host-side canary script, no part of a call's command), the layer's vectors and `mask-guard.js` (they never used the launcher), `host-sockets.js`, the Seatbelt profiles, `references/*`, `SKILL.md`, the CI plan template, every `capture-record.json`.

## Tasks & Acceptance

- [x] Choose the mechanism and record it with the rejected options (Decisions 1 to 4).
- [x] `confinement-launcher.cjs`, `confinement.js` and `confinement-status.cjs`.
- [x] `test-evaluate-run.js`, `isolation-golden.js`, `golden.json`: the byte-identity check with the shell controls, `the socket launcher`, the route's exact-environment block, the reference claims and the regenerated golden.
- [x] The reference, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.89, with the amendments dated 2026-10-06 there.

## Probes

This host is macOS 27.0.1 on Apple silicon with Node 24.20.0: no `bwrap`, no Linux, no container.
What the engine and Node do is established by reading the engine's code and by probes on this host; the ubuntu job proves the real Bubblewrap run.

- The engine owns the spawn of every call's command.
  `eval-quality` 7.1.0 (`dist/adapters/process-group.js`, `command-line-adapter.js`) starts a watchdog Node process that spawns the target with `stdio: 'inherit'`, `detached: true` and the spec's environment, which travels over a socket as JSON, and the adapters kill the target's group with a negative pid.
  The request carries a target, arguments, a working directory and an environment, and no entry for an extra descriptor, so the runtime cannot hand `bwrap --args 3` a descriptor through the engine.
- `process.execve` exists in Node 22.15 and later (the engine range is `>=22.20.0`), and it replaces the process image.
  A probe opened a file with `fs.openSync` (descriptor 11) and called `process.execve('/bin/sh', ...)` with a script that read it: `sh: 11: Bad file descriptor`.
  libuv opens every file close-on-exec and Node has no `fcntl` or `dup2`, so no descriptor but 0, 1 and 2 survives an exec, and a Node program cannot give a command a descriptor 3 in its own place.
- Node's `process.env` is no copy of the environment.
  A probe started a Node child with `{ zeta, 3, alpha }` and printed `Object.keys(process.env)`: the key `3` was listed and `process.env['3']` was `undefined`, so a program that starts a command with `{ ...process.env }` loses a variable named by a decimal integer.
  On macOS the same child also held `__CF_USER_TEXT_ENCODING`, which no call gave it.
  The launcher therefore reads the call's environment from a file and starts with none of its own.
- A spawn from a JSON object keeps the order of the engine's own path: integer-like names first, the rest in the order given.
  The launcher parses the same JSON object the runtime wrote, so a command started through it holds the environment of a command the engine starts directly, in the same order.
  A probe printed `/usr/bin/env` through the finished launcher with an environment of 18 names (`3`, `BASH_FUNC_f%%`, `my.setting`, `PS1`, `PS2`, `PWD`, `OLDPWD`, `SHLVL`, `_`, `IFS`, `OPTIND`, `PPID`, an empty value, a value with a line break and one with non-ASCII text) and the bytes equal those of a direct start.
- The exits of the finished launcher on this host: `process.exit(7)` gave 7, a command that is not found 127, an arguments file that does not exist 126, a command that sent itself SIGTERM ended the launcher by SIGTERM.
- Seatbelt calls (macOS) never carried the launcher, since Bubblewrap alone hides sockets by mount; every macOS case of this story therefore runs through a stub `bwrap`.
- Story 1.82's record (Decision 15) says why a launcher exists: the engine spawns the command, the mounts of up to 2,000 sockets would overflow Bubblewrap's 9,000 arguments or the argument limit of the call's `exec`, and `--args` reads a descriptor.
  Nothing in that reasoning changed; the launcher's program did.

## Decisions

1. **The launcher is a Node program that stays as the command's parent, and it hands the command a descriptor 3 through its `stdio`.**
   The story names two mechanisms, an exec helper that opens the file and executes the command in its own place, and the exact environment handed to `confinement-status.cjs`.
   The first cannot be built from what a Node program has: `process.execve` closes every descriptor the program opened (Probes), and a native helper is excluded.
   A program that opens the file and starts the command with the file as `stdio[3]` gives Bubblewrap the descriptor `--args 3` reads, with no shell, with the program `process.execPath` that the runtime, the engine's watchdog and the status shim already run, and with the call's argument vector as it was.
   The cost is one parent process and one Node start for a call that hides sockets; the call already starts a watchdog, the status shim and the target, each a Node start.
   The launcher passes SIGTERM, SIGINT, SIGHUP, SIGQUIT, SIGUSR1 and SIGUSR2 on, ends by the signal that ended the command (as the status shim does) or by its exit code, answers 127 for a command that is not found and 126 for one that cannot run or an arguments file that cannot be opened, as the shell's `exec` did, and writes its own messages through the descriptor, since Node's stream would make a shared pipe non-blocking for the command too.
   Rejected:
   - the runtime opening the file and passing it as `stdio[3]` of the engine's spawn, which removes the launcher: the engine's request has no such entry and the watchdog spawns with `stdio: 'inherit'` (Probes), and the story changes no eval-quality code;
   - `process.execve` with a descriptor, for the reason in Probes;
   - handing the exact environment to `confinement-status.cjs`: it runs inside Bubblewrap after the shell has changed or dropped the names, so it cannot restore what is gone, and a path that keeps the shell breaks the story's no-shell constraint;
   - the mounts inline in the command (no `--args`): the room is 2,000 sockets and Bubblewrap counts 9,000 arguments, and a socket path is as long as the directory it sits in, so the argument limit of `exec` is the bound that Story 1.82 chose `--args` to leave;
   - `--args` with a path: Bubblewrap takes a descriptor only;
   - a helper in another interpreter (`perl`, `python3`, busybox `exec`, `flock`): not on every host, and it would run before the sandbox with the host's `PATH` and its own startup files, a larger trust base than the program the runtime already runs.
2. **The command stays in the launcher's process group.**
   The engine kills a call by signalling the negative pid of the group the target leads (`killProcessGroup`), and the watchdog does the same when the host ends, so a command in a group of its own would outlive its launcher.
   Bubblewrap's `--die-with-parent` ties the sandbox to its parent, which is the launcher for a call that is not audited and `strace` for one that is, and both are in the group.
   A case starts the launcher detached, kills its group and finds the command gone.
3. **The launcher starts with the loader variables alone and reads the call's environment from a file.**
   Node reads `NODE_OPTIONS` and its kin from its own environment, so a `NODE_OPTIONS=--require <script>` in the call's environment would run that script in the launcher, outside the sandbox, with the runtime's privileges.
   Node's own `process.env` also cannot read a variable named by a decimal integer (Probes).
   So a call that hides sockets hands the engine the loader variables the engine's own watchdog carries (`ELECTRON_RUN_AS_NODE`, `LD_LIBRARY_PATH`, `DYLD_LIBRARY_PATH`, which a Node binary may need to start) as `wrapped.environment`, which the two callers pass as the request's `env`, and the call's environment travels in `launch-<n>-<token>.json` in the call's status directory.
   The file is mode 600 in a directory made by `mkdtemp` (mode 700) beneath the run's private parent, the launcher removes it as the first thing it does with it, and the runtime removes it when the call ends and with the run's scratch when a run is killed, so a secret in the environment (a login variable) is on disk for the time between the call's `wrap` and the launcher's start.
   The values are written as a spawn reads them, each defined value as a string and each `undefined` dropped, so the launcher starts the command with what the engine's own spawn would have given it.
   Rejected:
   - the call's environment as the launcher's own environment, read from `process.env`: lossy for a decimal integer name, hostile to `NODE_OPTIONS`, and the macOS-only variable in Probes;
   - the environment in the launcher's command line: a value would show in `ps`, which the engine's watchdog was built to avoid;
   - one variable holding the environment as JSON: one string of a Linux `exec` is at most 128 KiB and the environment would be sent twice;
   - the launcher's standard input: it is the target's.
     What the launcher adds to the call's trust base: Node (`process.execPath`, already run by the runtime, the watchdog and the shim), one CommonJS file of `cli/` with no import of the repository, run with the runtime's privileges before the sandbox exists, that reads two files the runtime wrote and starts the command it was given; it opens no socket and reads nothing the target can write.
4. **The shim starts the target with the environment recorded for its process.**
   With the launcher in place the environment reaches Bubblewrap exactly, and the status shim, which runs inside Bubblewrap, started the target with `{ ...process.env }`, which loses a variable named by a decimal integer for every Bubblewrap call, hidden sockets or none.
   The exact-environment sentence says every name, so `startEnvironment` reads `/proc/self/environ` (the first entry of a name wins, as `getenv` reads it; an entry with no name or no `=` is no variable) and falls back to `process.env` where there is no procfs, which is every host that runs no Bubblewrap.
   Rejected: refusing a call whose environment holds such a name (it changes calls that start today), and leaving the shim (the sentence would be false for that name).
5. **The byte-identity case runs through a stub that is no shell, and Story 1.82's shell launcher is its control.**
   The stub `bwrap` is a Node script that starts the command after `--` and runs no shell, since a shell would set the same variables again; the full environment of the target is compared with and without a hidden socket for fourteen environments.
   The story asks for the comparison on dash as `sh` and on bash as `sh`.
   The launcher no longer runs any shell, so the two legs are the control, and the control is built as Story 1.82's launcher was: `/usr/bin/env` restoring the seven names the shell touches (`-u` for an unset one, an assignment for a held one) and the `OPTIND` guard, in front of the shell text.
   Each leg (`bash` runs through a link named `sh`, which puts it in `sh` mode) asserts three things: the same environments through the new launcher equal the call's, a plain row (`PATH` and one name no shell touches) passes through the control unchanged, and the story's names do not.
   Under dash the control drops `my.setting` and `BASH_FUNC_f%%`; under bash as `sh` it drops `PS1` and re-serializes `BASH_FUNC_f%%`.
   A control that ran without the `env` restore would count every row as different, since both shells add `PWD` (bash also `SHLVL`), so the plain row is the proof that only the shell's own changes count; Review round 1 found the first version of the control could not fail for that reason.
   `/bin/dash` and `/bin/bash` both exist on macOS, so both legs ran on this host; a host without a shell skips that leg with the reason named, and the ubuntu job has both.
6. **The launcher's own cases run it, and a binary prints the environment.**
   `/usr/bin/env` is no shell and no Node, so the case that compares its bytes with a direct start sees every name and the order, a decimal integer name included, which the Node stub cannot.
7. **The audited order is held by the vector and by stand-ins.**
   An audited call that hides a socket is Node, the launcher, the arguments file, the environment file, `strace`, then Bubblewrap; a case reads that order and runs the call through a stand-in `strace` and a stand-in `bwrap` that record their arguments, finds neither the launcher nor its files in `strace`'s command and finds the arguments file readable as descriptor 3 in Bubblewrap through `strace`.
8. **`epics.md` Story 1.89 is amended.**
   The criterion's "exec helper that executes the command in its own place" is not buildable (Decision 1), so the amendment states the launcher as built, the reason, why the second mechanism cannot meet the criterion, and the shim's change.
9. **The evaluation layer's processes never used the launcher.**
   Story 1.88 gave them relisting at each start and a guard, and their vectors carry the mounts inline with a bounded room; their vectors and `mask-guard.js` are byte for byte as they were, which the isolation golden's layer entries hold.

10. **A launch the operating system refuses for its size reaches a run as the engine's own fault.**
    The engine's spawn of the launcher carries the launcher's command line and loader variables only, so it succeeds where the engine's spawn of the same command would have failed with `E2BIG`, and the launcher's own spawn of Bubblewrap then fails.
    The launcher ends with exit 125 and `confinement-launcher: E2BIG` on standard error, and `confinedCommandMechanism` throws a `port-failure` with the reason `launch-too-large` for that pair when the call's status file shows that Bubblewrap's shim never started (Decision 14), which `arm.js` reads as it reads the engine's, so a step whose arguments and environment are too large is skipped whether or not the host holds sockets.
    A case runs a 9 MB environment through the launcher and through the mechanism (Decision 15 says why 9 MB).
    Rejected: a size check in `wrap` (the kernel's limit follows the stack limit of the host and Node cannot read it, so a check would refuse calls the host accepts).
    The tool-server mechanism has no such fault to map, since the engine reports a server that ended before it answered as its own error and `arm.js` reads the reason for commands only.
11. **The launcher starts with the loader variables the engine's watchdog carries.**
    `process-group.js` starts its watchdog with `ELECTRON_RUN_AS_NODE=1` and the host's `LD_LIBRARY_PATH` and `DYLD_LIBRARY_PATH`, since nothing else lets a Node binary of an embedding runtime or a private library directory start.
    The launcher gets the same three and nothing else; the command still starts with the call's environment from the file alone.
12. **The cases that start `wrap`'s result themselves give `wrap` the host's environment.**
    A call that hides sockets starts its target with the environment of the call alone, as the engine does, so a case that spawns what `wrap` returns with the spawner's own environment and names none would run its target with an empty one.
    The test file's `targetSandbox` hands every `wrap` the host's environment unless the case passes one, which keeps the Linux route cases on the environment they ran with before; the byte-identity cases and the launcher cases name theirs.
13. **`startEnvironment` builds its object from pairs.**
    A variable named `__proto__` becomes an own property of the object, and a case reads one.
14. **The launcher's refusal is read only from a call whose shim never started.**
    The target's exit code and standard error pass through Bubblewrap and the shim unchanged, so a target that ran can print `confinement-launcher: E2BIG` and exit 125, and a mapping that ran before the status file was read made that pair the host's refusal: the step was skipped as `captured-value-unsendable` or the arm stopped with exit 12, and the target escaped its observation and its verdict.
    A real `E2BIG` means Bubblewrap never ran, so the status file still holds the runtime's untouched line.
    `launchTooLarge` therefore runs inside the `if (!status.started)` branch of `confinedCommandMechanism`, before `socketsToRetry`.
    The only other reader of the exit and the token is that function; `arm.js` reads the fault the mechanism throws.
    A case starts a target that writes the token and exits 125 through the real `targetSandbox` and `confinedCommandMechanism` with a stand-in `bwrap` that drains descriptor 3 and runs what follows `--`, with a hidden socket and with none, and finds exit 125 and no fault.
15. **A host's coverage directory stays out of the command, and the size cases exceed every host's limit.**
    Node adds its own `NODE_V8_COVERAGE` to every child it spawns unless the environment object names the variable, and every CI shard runs the tests under it.
    The launcher is a Node process, so the command it started held a coverage directory no call had given it, and the cases that read the launcher's and the command's environment failed under CI (14 of `the path socket units`, 2 of `the socket launcher`).
    `commandEnvironment` in the launcher starts the command with `NODE_V8_COVERAGE: undefined` unless the call holds the variable, which keeps the claim exact and leaves a call's own value alone.
    The engine's `watchdogEnv()` holds `ELECTRON_RUN_AS_NODE` and the two loader variables and nothing else, which is the launcher's own environment, so it needed no change.
    The cases that spawn what `wrap` returns hand Node a copy of the wrapped environment, since Node adds the coverage variable to the object it is given, and the byte-identity helper names the variable as unset for the same reason.
    The two size cases failed under CI because 40 values of 100,000 bytes make 4 MB: Linux refuses one string over 128 KB and the whole over a quarter of the stack limit with a ceiling of 6 MB, and a runner whose stack limit is not 8 MB let 4 MB through, so the command ran (exit 0), while macOS refuses over 1 MB in all.
    The cases now use 90 values of 100,000 bytes (9 MB, each string under 128 KB), above the ceiling on both systems.
16. **Bubblewrap sets `PWD`.**
    Bubblewrap sets `PWD` to the directory the call runs in for every call, with sockets hidden or none, so the real-Bubblewrap case expects `PWD` to be the workspace in both legs and the reference says so in the exact-environment sentence.
    The other names of that case (`OLDPWD`, `SHLVL`, `_`, `IFS`, `OPTIND`, `PPID`, `PS1`, `my.setting`, `BASH_FUNC_f%%`, `3`) are set by no part of the vector, and the CI run printed each as the call held it.

## Implementation Notes

- `wrap` builds the vector and the command before it writes the arguments file and the environment file, writes both with mode 600 in the status directory and removes both and the status file if either write fails, so nothing a refusal throws leaves a file.
- `launchedCommand(socketFile, environmentFile, argv)` is `[process.execPath, SOCKET_LAUNCHER, socketFile, environmentFile, ...argv]`; `argv[0]` is the `strace` or the `bwrap` executable the runtime chose.
- `wrapped.environment` is the environment the call's process starts with: `launcherEnvironment()` (the loader variables) for a call that hides sockets and the call's own for one that hides none; `confinedCommandMechanism` and `confinedMcpMechanism` hand it to the engine as `env`, with the call's environment as the fallback for a Seatbelt call.
- `releaseSocketFile` removes the arguments file and the environment file; the made-again call (`socketsToRetry`) writes a new pair for each start.
- `the path socket units` and the made-again cases run the engine's contract: the stand-in `launch` starts the command with the request's `env`.
- Story 1.62's golden was regenerated with `TEA_UPDATE_ISOLATION_GOLDEN=1 node test/test-isolation-primitives.js`.
  Its diff, read: in `confinement.targetSandbox.wrap.bubblewrap.sockets` the target `/bin/sh` becomes `<node>`; the arguments `-c`, the shell text, `sh`, `/usr/bin/env` and the seven `-u` pairs are replaced by `<confinement-directory>/confinement-launcher.cjs` before the arguments file and `<status>/launch-1-<token>.json` after it; every argument from `/usr/bin/bwrap` on is unchanged; and one new output, `confinement.targetSandbox.wrap.bubblewrap.sockets.environment`, holds the launcher's loader variables (`ELECTRON_RUN_AS_NODE`, and `LD_LIBRARY_PATH` or `DYLD_LIBRARY_PATH` where the host sets them) and the call's environment as the file carries it.
  No other entry of the golden changed, which holds that the layer's vectors, the target's vectors without hidden sockets and the Seatbelt profiles are byte for byte as they were.

## Revert observations

Every row ran on a scratch copy of the final tree under the scratchpad directory (`ft1`, made with `rsync` from the working tree after the last code and test edit, `.git`, `website` and `build` left out, `node_modules` linked), after Review round 1 and the CI fixes, and none on the working tree.
Each row restored `cli/`, `test/` and `docs/` of the copy from the working tree, changed one place, ran the named cases there with `node test/test-evaluate-run.js --group=confinement --only="<case>"` and recorded the failed-check count.
A count is the failed checks of that run; a case that stops at an error ends at that check, so the second number can be smaller than the case's full count (`the path socket units` has 124 checks, `the socket launcher` 33, `the network reference` 237).
Every row failed at least one check except where it says so, and the copy was restored after each row.

The cases that ran on this host are all of them but `the path socket route` (the exact-environment block, the real `bwrap` and `strace`), which only the ubuntu job runs, so no row names it.
On this host both legs of the shell controls ran (macOS has `/bin/dash` and `/bin/bash`); a host without a shell skips that leg with its reason named, and the ubuntu job has both.

| Criterion                                                     | Revert (on the copy)                                                                                                                                | Cases                                                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| The environment is byte-identical (the story's revert check)  | Story 1.82's shell launcher restored, with its `env` restore of the seven names, and the call's environment handed to it as the old launcher got it | `the path socket units` 39 of 124 fail (both legs); `the socket launcher` 4 of 33 fail      |
| No `env` restore, no `SHELL_VARIABLES` pair                   | the Node launcher with `/usr/bin/env -u PWD` back in front of the command                                                                           | `the path socket units` 4 of 124; `the socket launcher` 1 of 33                             |
| No shell in the path (the launcher's source)                  | `shell: true` in the launcher's `spawn`                                                                                                             | `the path socket units` 27 of 110; `the socket launcher` 9 of 22                            |
| The launcher stays before `strace` (the audit's trace case)   | `launched(...)` applied inside `strace`'s command                                                                                                   | `the socket launcher` 2 of 33                                                               |
| The command stays in the launcher's group                     | `detached: true` on the command's `spawn`                                                                                                           | `the socket launcher` 1 of 33                                                               |
| The launcher starts with the loader variables alone           | `wrapped.environment` is the call's environment                                                                                                     | `the path socket units` 14 of 124; `the socket launcher` 3 of 33                            |
| The call's environment reaches the command                    | the environment file holds `{}`                                                                                                                     | `the path socket units` 25 of 124; `the socket launcher` 4 of 33                            |
| Values reach the command as a spawn makes them                | the values written as given                                                                                                                         | `the socket launcher` 2 of 33                                                               |
| The environment file is private                               | mode 644                                                                                                                                            | `the socket launcher` 1 of 33                                                               |
| The launcher removes the environment file when it has read it | the removal taken out of `readEnvironment`                                                                                                          | `the path socket units` 14 of 124; `the socket launcher` 5 of 33                            |
| The runtime removes both files when the call ends             | `releaseSocketFile` without the environment file                                                                                                    | `the path socket units` 1 of 124 (the call the engine never started)                        |
| A bad environment file refuses the call                       | the check that every value is a string taken out                                                                                                    | `the socket launcher` 1 of 33                                                               |
| Descriptor 3 holds the arguments file                         | the descriptor left out of the command's `stdio`                                                                                                    | `the socket launcher` 2 of 33; `the path socket units` 3 of 124                             |
| Signals reach the command                                     | the forwarding listeners taken out                                                                                                                  | `the socket launcher` 1 of 33                                                               |
| The launcher ends by the command's exit code                  | the exit code set to 0                                                                                                                              | `the socket launcher` 3 of 33                                                               |
| The launcher ends by the command's signal                     | the re-raise of the signal taken out                                                                                                                | `the socket launcher` 1 of 33                                                               |
| A command that is not found ends the launcher with 127        | the code mapped to 126                                                                                                                              | `the socket launcher` 1 of 33                                                               |
| A launch too large is the engine's `launch-too-large`         | the runtime's rethrow taken out; the launcher's exit 125 mapped to 126                                                                              | `the socket launcher` 1 of 33 and 2 of 33                                                   |
| A target that ran cannot forge the launcher's refusal         | the mapping moved back ahead of the status read                                                                                                     | `the socket launcher` 1 of 33 (the forged exit 125 becomes a fault)                         |
| A failed write leaves no file                                 | the whole `catch` of the two writes replaced by `finally {}`                                                                                        | `the socket launcher` 3 of 33 (the unmakeable text, the full disk at each of the two files) |
| A host's coverage directory stays out of the command          | the command started with the environment object as read, with no `NODE_V8_COVERAGE` entry                                                           | `the socket launcher` 1 of 33                                                               |
| The shell control can fail                                    | the story's names replaced by the plain row in the per-leg control                                                                                  | `the path socket units` 2 of 124 (one per leg)                                              |
| The shell control restores the seven names                    | the control's `env` restore taken out                                                                                                               | `the path socket units` 2 of 124 (the plain row gains `PWD`, bash also `SHLVL`)             |
| The shim starts the target with its recorded environment      | `startEnvironment` returns `process.env`; a `__proto__` name assigned as a property                                                                 | `the socket launcher` 2 of 33 and 1 of 33                                                   |
| The reference states the exact environment                    | the limit sentence back in place of the exact-environment sentence                                                                                  | `the network reference` 3 of 237                                                            |
| The reference states the exact environment                    | the exact-environment sentence removed                                                                                                              | `the network reference` 2 of 237                                                            |
| The reference states the launcher                             | the launcher sentence removed                                                                                                                       | `the network reference` 2 of 237                                                            |
| Story 1.62's golden holds the new vector                      | the golden of the commit before this story beside the new code                                                                                      | `node test/test-isolation-primitives.js` 2 checks fail                                      |

The first run of the group-kill row (`detached: true`) hung in the case, since a command that left the group kept the case's pipe open and `close` never came; the case now waits for the launcher's exit, destroys its pipes and bounds every wait, and the row fails one check.
The row for the runtime's removal of the environment file passed on the first build of the cases, because only a launcher that ran has read and removed the file; the case of a call whose engine never started the launcher was added and the row fails it.
The row for the exit 127 first mutated the launcher's synchronous failure path, which a missing command never reaches (the failure arrives as an `error` event), and passed; the mutation was moved to the code both paths share and the row fails one check.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`.

Local, macOS 27.0.1 (Seatbelt, `/bin/dash` and `/bin/bash`), on the final tree:

- `test:evaluate-confinement` ran once in full on the tree of the first build: 2,346 checks passed.
  After Review round 1 and the CI fixes `the path socket units` (124) and `the socket launcher` (33) ran again with `NODE_V8_COVERAGE` set to a scratch directory, as the CI shards set it, and without it: all passed in both.
  After the review's findings the cases the later edits touch ran alone: `the path socket units` 124, `the socket launcher` 33, `the network reference` 237, and `--only` for `Seatbelt` (182), `egress` (154), `bridge` (51), `host socket` (6) and `confinement units` (25): all passed.
- `test:evaluate-run` 594, `test:evaluate-api` 4,465, `test:evaluate-agents` 501, `test:isolation-primitives` (the golden regenerated twice, diff above plus the launcher's environment entry), `test:atdd-isolation` and `test:cli` on the first build and again on the final tree: all passed with the same counts.
- `npm run lint`, `npm run lint:md`, `npm run format:check`, `test:doc-counts`, `test:doc-claims` (six foreign symbols leave, `NODE_V8_COVERAGE` joins), `test:shards`, `test:ci-coverage`, `test:changelog`, `test:direction`, `test:evaluate-boundaries` (500), `npm run docs:validate-links` and `npm run docs:build`: green.
- Linux: no container ran and this host has no `bwrap`.
  Ran on this host: the vector's text and order, the launcher itself (descriptor 3, the exact environment through a binary `env`, exit codes, signals, the group kill, E2BIG), the audited order through stand-ins for `strace` and `bwrap`, the byte-identity of the hidden and unhidden calls through a stub `bwrap` that is no shell, the shell control under dash as `sh` and under bash as `sh`, the forged refusal, the cleanup of a failed write, the reference claims and the golden.
  Runs only in the ubuntu CI job: the exact-environment block of `the path socket route`, which prints the environment of `/usr/bin/env` through the real launcher, Bubblewrap and status shim with the host's sockets hidden and with none hidden and compares the bytes (a decimal integer name, the story's names and the names the shell launcher restored among them), with `PWD` the workspace that Bubblewrap sets.
  The route block is the only proof that the shim's read of `/proc/self/environ` holds under the real sandbox.
- No real agent CLI was started and no live run was made.
- `git diff -- package.json package-lock.json` is empty.

## Build review

One pass by a read-only subagent in place of `/bmad-code-review`, in four lenses (the launcher, the runtime, the tests, the records), run on the commit and the test edits after it.
Every finding was checked before it was acted on.
The coordinator's Opus review rounds run on the open pull request.

| Finding                                                                                                                                                                                                  | Verdict | Route                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Medium: a call that hides sockets and overflows `ARG_MAX` fails in the launcher (exit 126, a `ConfinementError`) where a call that hides none gets the engine's `launch-too-large`, which `arm.js` skips | valid   | Fixed: Decision 10, exit 125 with a token, the mechanism throws the engine's fault, two cases and two revert rows              |
| Medium: `wrap` with no `environment` now gives a call that hides sockets an empty target environment, and many Linux-only cases start `wrap`'s result with the spawner's environment                     | valid   | Fixed: Decision 12, the test file's `targetSandbox` gives `wrap` the host's environment unless a case names one                |
| Low: the launcher's empty environment cannot start a Node that needs `LD_LIBRARY_PATH` or `ELECTRON_RUN_AS_NODE`, which the engine's watchdog carries                                                    | valid   | Fixed: Decision 11                                                                                                             |
| Low: a `__proto__` entry in `/proc/self/environ` is lost to the prototype setter                                                                                                                         | valid   | Fixed: Decision 13 and a case                                                                                                  |
| Low: the comment says the status directory is one the target does not see, which holds only beneath a private root                                                                                       | valid   | Fixed: the comment names the private root, which every run has (`workspace.js` makes it); the cases without one name no secret |
| Low: the group-kill case reads a zombie as alive on a host whose process 1 does not reap                                                                                                                 | valid   | Fixed: a process in state `Z` of `/proc/<pid>/stat` counts as gone                                                             |
| Low: the exact-environment sentence is false for `NODE_V8_COVERAGE` and the proxy variables                                                                                                              | valid   | Fixed: the sentence, its two claims in `the network reference`, the `doc-claims` foreign symbol                                |
| Low: the test-design text says the bash leg runs on macOS only                                                                                                                                           | valid   | Fixed                                                                                                                          |
| Low: a comment says SIGUSR1 leaves the launcher running                                                                                                                                                  | valid   | Fixed: SIGPIPE alone                                                                                                           |
| Low: house-rule wording in the `epics.md` amendment, Decision 1 and a test message                                                                                                                       | valid   | Fixed                                                                                                                          |

Round 0 left no finding open.

## Review round 1

Two Opus reviewers (the code lens and the tests and records lens) reproduced each finding below, and CI shard 2 on the pull request added two more.

| Finding                                                                                                                                                                                                                                          | Verdict | Route                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High: a target that ran can print the launcher's token and exit 125, and `launchTooLarge` ran before the status file was read, so its result became the host's `launch-too-large` refusal and the target escaped its observation and its verdict | valid   | Fixed: Decision 14, the mapping runs only for a call whose shim never started; the case with a stand-in `bwrap` and a revert row; no other reader of the token or the exit exists |
| Medium: the shell-leg control never failed, since it ran without the `env` restore and counted any byte change, and both shells add `PWD` to every environment                                                                                   | valid   | Fixed: Decision 5, the control is Story 1.82's launcher with its restore and each leg asserts the plain row unchanged and the names each shell drops or rewrites; two revert rows |
| Low: no case covered the cleanup of a failed write in `wrap`                                                                                                                                                                                     | valid   | Fixed: three cases (an environment value whose text cannot be made, a full disk at the environment file and at the arguments file) and a revert row                               |
| Low: the records said the dash leg skips on macOS, which has `/bin/dash`, and two sentences said the launcher's environment is `{}`                                                                                                              | valid   | Fixed: the records, the skip reason and the test comment name the legs that ran here and the loader variables                                                                     |
| Low: mid-sentence wraps and two sentences on one line in the added comments, one comment ending on a comma, and a trailing negation clause in this record                                                                                        | valid   | Fixed across the launcher, `confinement.js`, `confinement-status.cjs`, the test file and the records; the whole added text was scanned again with the same shapes                 |
| CI: under `NODE_V8_COVERAGE` (every shard sets it) the command held the host's coverage directory, and the 4 MB size cases passed the command through on a runner whose limit allows 4 MB                                                        | valid   | Fixed: Decision 15, `commandEnvironment` in the launcher, copies of the wrapped environment in the cases, 9 MB size cases, a case and a revert row for the coverage variable      |
| CI: the real-Bubblewrap case expected the call's `PWD`, and Bubblewrap sets `PWD` to the directory the call runs in for every call                                                                                                               | valid   | Fixed: Decision 16, the case expects the workspace in both legs and the reference, the `epics.md` amendment and the CHANGELOG say what Bubblewrap sets                            |

Round 1 left no finding open.
