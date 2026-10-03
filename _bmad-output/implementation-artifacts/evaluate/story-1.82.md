---
title: "Story 1.82: Give a Bubblewrap target no route to the host's path-based Unix sockets"
type: 'feature'
created: '2026-10-03'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7c3b0521'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.82; the amendments of Stories 1.31, 1.62 and 1.63)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.82 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.63.md (the network namespace and the bridge)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A Bubblewrap target sees the host through `--ro-bind / /`. A read-only mount stops writes, and a `connect()` to a socket file is no write, so a process of the target can connect to `/var/run/docker.sock`, the system bus at `/run/dbus/system_bus_socket` or an agent's socket under `/tmp` and ask the host service behind it to run a job outside the sandbox. Story 1.31 hides `/run/user` only, and Story 1.63's network namespace hides the abstract sockets and leaves the socket files.

**Approach:** Each call lists the host's path-based Unix sockets when it starts and mounts an empty device file over each socket file outside the call's own grants, so a `connect()` finds no socket there and answers `ECONNREFUSED`. The list is the kernel's table of bound Unix sockets (`/proc/net/unix`), the socket files beside a listed path that was moved after it bound, and the socket files in the directories where services and sessions keep them (`/run`, `/var/run`, `/tmp`, `/var/tmp`, one directory down). The mounts go before the call's binds, so a socket in the workspace or in a private directory of the call stays connectable.

## Boundaries & Constraints

**Always:** The target's vector alone carries the mounts (`bubblewrapTargetArguments`); the probes and the evaluation layer's vector do not. A socket path goes into the vector by its real path, since Bubblewrap cannot mount over a path that goes through a link. The list is read when each call starts. A call whose Bubblewrap never started its shim while a socket it hid went away is started again, three starts at most. The reference states what is hidden, what stays reachable and each limit, and each sentence names the case that backs it. Any change to a Bubblewrap vector updates the byte-identity golden. No eval-quality change, no new dependency, no native build, no new Linux package.

**Never:** a mount over the call's own grants, a claim in the reference no case backs, a change to the Seatbelt profile, a registry field, a change to what the evaluation layer's vector allows.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason and the Linux evidence.

## I/O & Edge-Case Matrix

| Scenario                          | Input / State                                                                                    | Expected Output / Behavior                                           | Error Handling                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------- |
| Socket the runtime serves         | Linux, a socket file under the temp directory outside the grants, bound before the call started  | a confined connection answers `ECONNREFUSED`, a link to the file too | n/a                                            |
| Host services                     | `/run/dbus/system_bus_socket`, `/var/run/docker.sock` where they exist                           | refused for an isolated entry and a `host` entry                     | n/a                                            |
| Same, mounts removed              | the same commands with the mounts taken out of the real vector                                   | each connection succeeds and the case fails                          | n/a                                            |
| Own sockets                       | a socket in the workspace, one in a private directory of the call                                | connectable                                                          | n/a                                            |
| Started HTTP service              | `the confined pipeline` with a service that reports its port and one that is told it             | reached through the bridge                                           | n/a                                            |
| Socket bound after the call began | the runtime binds a socket once the call runs                                                    | reachable (the stated limit)                                         | Story 1.86 audits the connection               |
| Socket moved after it bound       | the table lists a path that is gone, the file sits beside it                                     | the socket files beside the path are hidden                          | n/a                                            |
| Socket shared from another netns  | a file under `/run`, `/var/run`, `/tmp`, `/var/tmp` (one directory down) the table does not list | hidden by the scan                                                   | n/a                                            |
| Hidden socket went away           | Bubblewrap exits before its shim ran, a listed socket no longer exists                           | the call is started again over a fresh list, three starts at most    | the last start's message when it fails         |
| Any other failure to start        | the listed sockets exist, or the status file was damaged                                         | one start, the refusal naming Bubblewrap's words                     | exit 12 as before                              |
| Odd path                          | a socket whose path holds a quote or a backslash                                                 | hidden, the argument carries it                                      | a relative or NUL path is a `ConfinementError` |
| No socket table                   | a stand-in for Linux on another system                                                           | no socket from the table                                             | an unreadable table is an error (exit 12)      |
| Seatbelt, evaluation layer        | any call                                                                                         | no list, no mount                                                    | n/a                                            |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/host-sockets.js`: new; `hostPathSockets`, `socketTablePaths`, `SCANNED_ROOTS`.
- `cli/lib/evaluate/confinement.js`: `bubblewrapTargetArguments` (`sockets`), `targetSandbox` (`hostSockets`, the exclusions, `hiddenSockets`), `mayRetryMaskedStart`, `confinedCommandMechanism.run`, `confinedMcpMechanism.callTool`.
- `test/test-evaluate-run.js`: `checkPathSocketUnits`, `checkPathSocketRoute`, the abstract-socket case without its path-socket leg, the private-root control, the Seatbelt leg, the reference claims of `checkBridgeReference`.
- `test/lib/isolation-golden.js`, `test/fixtures/isolation-primitives/golden.json`.
- `docs/reference/tea-evaluate-cli.md`, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-8), `epic-1-context.md`, `sprint-status.yaml`.

## Tasks & Acceptance

- [x] Reproduce on Linux: a confined target connects to a runtime-served socket and to stand-ins for the system bus and the Docker socket today.
- [x] `host-sockets.js` and the vector, the exclusions, the retry.
- [x] The cases, each with its revert check below, and the golden.
- [x] The reference, CHANGELOG, `epics.md`, `test-design-epic-1.md`, AD-8, `epic-1-context.md`, `sprint-status.yaml`.
- [x] Stories 1.86, 1.87 and 1.88 for the findings this change does not close.

**Acceptance Criteria:** as in `epics.md` Story 1.82, with the four amendments dated 2026-10-03 there.

## Linux evidence and how it ran

The host is macOS with no `bwrap`, so every Linux case ran in a container of the local image `tea-bwrap-strace` (Debian bookworm, node 24, bubblewrap 0.8.0, strace 6.1, git 2.39, a user `tester` that is not root). Docker Desktop's engine was stopped when the build began; `docker desktop restart` brought it up.

```sh
docker run --init --rm --security-opt seccomp=unconfined --security-opt apparmor=unconfined \
  --security-opt systempaths=unconfined --cap-add SYS_ADMIN --cap-add SYS_PTRACE \
  -u tester -e HOME=/home/tester -v <copy of the tree>:/work -v <worktree>/node_modules:/work/node_modules:ro \
  -w /work tea-bwrap-strace node test/test-evaluate-run.js --group=confinement
```

`--security-opt systempaths=unconfined` lets `bwrap --proc /proc` mount procfs under a user namespace, `SYS_PTRACE` lets `strace` trace, and `--init` reaps the servers a case kills (without it `the confined pipeline` and `the bridged server` fail on an unreaped child, with or without this change). A host with stand-ins for the system bus and the Docker socket served by an unprivileged user (`/run/dbus/system_bus_socket`, `/var/run/docker.sock`, a link to `/run`) ran as root first (`chmod 777 /run`) and then dropped to `tester`. The tree was copied out of the worktree for each run, with `.git` left out; that makes three checks of the `run` group about `.gitignore` fail in the container and nothing else.

**Reproduction.** On the unchanged vector (`--unshare-user --unshare-net --ro-bind / / --dev /dev --proc /proc`), a confined `node` connecting to `/run/dbus/system_bus_socket`, `/var/run/docker.sock` and `/tmp/agent.sock`, each served by another process, printed `connected` three times. The existing `the abstract socket route` case asserted `connected` for a path socket outside the grants ("Story 1.82 closes that").

**Mechanism checks.** `--ro-bind /dev/null /tmp/agent.sock` makes the connection answer `ECONNREFUSED`. The same mount over `/var/run/docker.sock`, where `/var/run` is a link to `/run`, fails: `bwrap: Can't create file at /var/run/docker.sock: No such file or directory`; the mount over `/run/docker.sock` covers both spellings, so the vector names the real path. A mount over a path that vanished fails with `bwrap: Can't create file at /tmp/gone.sock: Read-only file system` and exit 1, which is the failure the retry answers.

**Late and recreated sockets.** A socket bound under `/tmp` after the call started answered `connected` while the early one, masked, answered `ECONNREFUSED`. A masked socket unlinked and bound again at the same path answered `ECONNREFUSED` before and `connected` after, since a mount covers one file and the kernel detaches it when the file goes. Neither can be closed with a mount of a read-only `/`; both are limits the reference states.

**Landlock.** `landlock_create_ruleset` answered `ENOSYS` on this container's kernel (6.10.14, linuxkit). The access rights of the header the container ships (`/usr/include/linux/landlock.h`) are file and directory rights, `MAKE_SOCK` to create a socket file and none to connect to one.

## Decisions

1. **An empty device file over each listed socket, over the real path, before the call's binds.** Chosen because it changes only what it names (`reads elsewhere stay allowed and audited`), needs no capability and no kernel feature beyond the user namespace Bubblewrap already needs, and answers with the errno of a path nothing listens on. The binds of the grants come after, so a grant wins over a mount that names a path inside it (the exclusion list is the second line of that, and `the units` check it).
2. **Rejected: a view of the socket directories** (a tmpfs over `/run`, `/tmp`, the temp directory, with the allowed paths bound back). It leaves out a socket kept elsewhere (`~/.docker/desktop/docker.sock`, `~/.ssh` control sockets), which is the reason the plan names. It also breaks what the target reads: `/etc/resolv.conf` is a link into `/run/systemd/resolve` on systemd hosts, which an entry that declares `network: host` needs until Story 1.83, and a read of an existing file under the temp directory would become an unreported `ENOENT` (`traceDecision` leaves a read of a missing path out), which changes the audit's contract that reads elsewhere are allowed and listed. The cases that read an ungranted file under a temp directory would also need a new home.
3. **Rejected: a root of the target's own with only the allowed paths bound in.** It is the only mechanism that covers a socket bound after the call started, and it gives up the contract above for every target: a toolchain under `~/.nvm`, a global install under `/opt`, a cache the target reads would each need a declaration, and the list of system paths would turn from an audit exemption into an access control.
4. **Rejected: Landlock's rule on connecting to a socket path.** The CI runners' kernels may not have Landlock, this container's does not (`ENOSYS`), and the file rights of the ABI the header lists include none for connecting.
5. **Rejected: a seccomp filter.** A filter sees the registers of `connect()`, and the socket's path is behind a pointer it cannot read, so it cannot tell an abstract name from a path or a port (the reason Story 1.63 recorded for abstract sockets). Blocking `AF_UNIX` altogether would cut the bridge, the shim and the stdio of every `child_process`.
6. **The list: the kernel's table, then two more sources.** `/proc/net/unix` names every bound socket of the network namespace by the address it was bound with, the one place that names a socket whatever directory it sits in. The table is read twice and the paths of both reads used, since the kernel serves it in pieces. Two review findings widened it. A socket a process moved after it bound (OpenSSH's control master binds a temporary name and links it to the final one, so the table holds a path that is gone) hides every socket file beside that path. A socket the table does not hold (the Docker socket a container job shares from the host, bound in another network namespace, and a socket bound by a relative path) is found by walking `/run`, `/var/run`, `/tmp` and `/var/tmp` one directory down, reading at most 2,000 directories of a root.
7. **Excluded from the mounts:** the call's grants (workspace, private directories, the home), the evaluation folder, the project's git directory and its alternates, the private root and `/run/user`, each either the call's own or already covered by a later `--tmpfs`. A mount in a covered directory would make Bubblewrap create its mount point in a read-only file system.
8. **The mounts apply to every Bubblewrap target, whatever its entry's `network`.** A `host` entry keeps the host's abstract sockets until Story 1.83, but the socket files are a separate route Story 1.82 owns. Nothing offers an escape short of `"confinement": false`: a target that needs a host service through a socket file is outside what the sandbox can keep, as one that needs the host's network was in Story 1.63.
9. **A call is started again when Bubblewrap could not start over a socket that went away, three starts at most.** The window between the list and the mount is a few milliseconds, and a host with sockets that come and go (test servers, sessions) would turn it into flaky infrastructure errors. The retry fires only when the status file still holds the runtime's own untouched line (so a target that damages its status file is not run again), a hidden socket no longer is one, and the run was not aborted. The tool-server path catches the adapter's `SessionEnded`, which the adapter throws when a server ends before it answers.
10. **A socket path goes into the vector as it is.** The profile-safe check exists for Seatbelt's profile strings; an argument carries any character but NUL, and `/proc/net/unix` lists the sockets of every user, so a refusal would let any local user stop every Bubblewrap call by binding `/tmp/a"b.sock`.
11. **The evaluation layer's vector has no mounts.** Its `/` is a writable bind, so a mount over a socket that went away would create an empty file on the host. Story 1.88 files the layer.
12. **macOS is unchanged.** The Seatbelt profile names sockets by path, so a rule there can also cover a socket bound later; Story 1.87 files it, and the reference says a macOS target reaches a path-based socket outside the private root (a case connects).
13. **The reference's claims.** Each new sentence is a claim of `the network reference` that names the cases backing it, so a sentence no case backs fails. The old sentence is gone, and `the confinement reference` check fails while it comes back.

## Limits the reference states, and the stories that follow

- A socket bound after the call started stays reachable for that call; one unlinked and bound again too (a daemon restart); one bound in another network namespace outside the scanned directories; one whose path holds a line break or bytes that are no UTF-8; a hard link or a second mount of the same socket file. A connection to one is not audited yet: **Story 1.86** lists it as an observed mount (`connect` is no file syscall, so `strace` traces none today).
- The evaluation layer's processes keep every host socket, so a sealed-brief agent run by a user in the `docker` group can start a container that writes the evaluation folder: **Story 1.88**.
- A macOS Seatbelt target reaches a path-based socket outside the private root: **Story 1.87**.

## Revert observations

Each revert was applied once to a scratch copy of the final tree under the scratchpad directory (never the working tree and never `/tmp`), the named case run and the failed-check count recorded. The macOS rows ran on this host; the Linux rows ran in the container above with the system bus and Docker stand-ins served.

| Revert (the one edit)                                                                       | Case run                                             | Observed                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop the mechanism (no mount in the vector)                                                 | `the path socket units` (macOS)                      | 4 of 24 fail: the vector holds no mask for an isolated call, a `host` call or an odd path                                                                       |
| Same                                                                                        | `the path socket route` (Linux)                      | 9 of 16 fail: every connection, the runtime's socket, its link, the system bus and the Docker socket, answers `connected` for both entries                      |
| Nothing excepted (no grants, no covered directories)                                        | `the path socket units`                              | 1 of 24 fails: the list was asked to leave out nothing                                                                                                          |
| Masks mounted after the grants' binds, nothing excepted (the mechanism blocks every socket) | `the path socket route` (Linux)                      | 3 of 16 fail: the vector hides a socket of the call's own, and the workspace's and the call's own sockets answer `ECONNREFUSED`                                 |
| Nothing excepted, masks still before the binds                                              | `the path socket route` (Linux)                      | 0 fail: the binds of the grants win over the mounts. The exclusion is held by the units, the order by the route case                                            |
| The bridge's path hidden, masks after the binds                                             | `the confined pipeline` (Linux)                      | 6 of 8 fail: both handoffs exit 12 (the shim cannot listen over the mask)                                                                                       |
| A `host` entry hides no socket                                                              | `the path socket route` (Linux)                      | 4 of 16 fail: each target answers `connected` for the `host` entry                                                                                              |
| Same                                                                                        | `the path socket units`                              | 1 of 24 fails                                                                                                                                                   |
| No real path (the spelling the table gives)                                                 | `the path socket units`                              | 2 of 24 fail: a link and a link to a directory give three spellings of two sockets. On Linux the vector's own `realOf` still resolves, so the route case passes |
| Retry whatever the list says                                                                | `the path socket units`                              | 2 of 24 fail: a call hiding no socket and one whose hidden socket still existed start more than once                                                            |
| Retry whatever the status file holds                                                        | `the path socket units`                              | 1 of 24 fails: a call whose status file a target made unreadable is started three times                                                                         |
| No retry for a tool server                                                                  | `the path socket units`                              | 2 of 24 fail                                                                                                                                                    |
| One start only                                                                              | `the path socket units`                              | 4 of 24 fail                                                                                                                                                    |
| No neighbors of a moved path                                                                | `the path socket units`                              | 1 of 24 fails                                                                                                                                                   |
| No scanned directories                                                                      | `the path socket units`                              | 1 of 24 fails                                                                                                                                                   |
| The scan reads one more level                                                               | `the path socket units`                              | 1 of 24 fails                                                                                                                                                   |
| A profile-safe check on socket paths                                                        | `the path socket units`                              | 1 of 12 fails: the case ends on a `ConfinementError` for a path with a quote                                                                                    |
| An unreadable table taken for an empty one                                                  | `the path socket units`                              | 1 of 24 fails                                                                                                                                                   |
| A Seatbelt call asks for the list                                                           | `the path socket units`                              | 3 of 24 fail                                                                                                                                                    |
| A mask in the evaluation layer's vector                                                     | `the path socket units`                              | 1 of 24 fails                                                                                                                                                   |
| The old sentence restored                                                                   | `the confinement reference`, `the network reference` | 3 of 141 fail: the sentence is not stated, the old one is an unbacked claim, and the section still lists the sockets as connectable                             |
| An unbacked sentence about the sockets                                                      | `the network reference`                              | 1 of 141 fails                                                                                                                                                  |
| The macOS sentence dropped; the layer's sentence dropped                                    | `the network reference`                              | 1 of 141 fails each                                                                                                                                             |
| The sentence that names the Docker socket and the system bus dropped                        | `the network reference`                              | 3 of 141 fail                                                                                                                                                   |

## Gates

Run on the final tree, one host-heavy gate at a time, on a machine shared with the other lanes. No full local `npm test`: the hook and CI carry the chain.

- macOS: `test:evaluate-confinement` 980 (one lost report of the kernel's log rerun by design), `test:evaluate-run` 591, `test:evaluate-api` 4,453, `test:evaluate-check` 1,102, `test:evaluate-boundaries` 448, `test:evaluate-guidance`, `test:isolation-primitives` (golden: one output added, every other byte-identical), `test:cli`, `test:atdd-isolation`, `test:direction`, `test:boundary`, `test:layering-boundary-lineage` 796, `test:lineage`, `test:conflict-markers`, `test:doc-counts`, `test:doc-claims`, `test:shards` 183, `test:ci-coverage`, `test:changelog`, `test:bmad-output-gated` 114, `npm run lint`, `npm run lint:md`, `npm run format:check` and `npm run docs:validate-links`: green. The Linux cases skip here with their reason printed.
- Linux, in the container above: `the path socket units` and `the path socket route` 40 checks with the system bus and Docker stand-ins served, none skipped; `test:evaluate-confinement` 889 checks, `test:evaluate-api` 4,453, `test:evaluate-run` 591, `test:evaluate-mcp` 227, `test:evaluate-arms` 729, `test:evaluate-preflight` 324 and `test:isolation-primitives`, green with two exceptions that also fail on the unchanged tree in the container: the second workspace for a commit copies the packs of the first in place of linking them (the container's temp directory and its bind-mounted tree sit on different file systems), and three `.gitignore` checks of the `run` group, which need the `.git` directory the copy leaves out. The ubuntu job runs the same suites on a real host.
- The CHANGELOG, record and planning edits were read after `prettier`.
- Engine check at the start and the end: exit 0. `git diff -- package.json package-lock.json` is empty.

## Build review

Three fresh Opus subagents reviewed the diff in layers (code, tests, adversarial), read only, in place of `/bmad-code-review`, `/bmad-testarch-test-review` and `/bmad-review`, whose lenses the prompts carried. Every finding was checked against the code before it was acted on.

| Finding                                                                                                                                                                | Verdict                              | Route                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High (code): the tool-server retry never runs with the real adapter, which throws `SessionEnded` before the status check                                               | valid (verified against the adapter) | Fixed: the call catches the throw, reads the status and starts again; the unit's stub throws as the adapter does                                                                                        |
| High (adversarial): a target can make its status file unreadable and be started three times                                                                            | valid                                | Fixed: only a status file that still holds the runtime's untouched line counts as a call that never started; a unit                                                                                     |
| High (adversarial): a socket moved after it bound (OpenSSH control master) is listed under a gone path and stays reachable                                             | valid                                | Fixed: the socket files beside a listed path that is gone are hidden; the inode column the review suggested is the kernel's socket inode and differs from the file's, so a match by inode is impossible |
| Medium (code, adversarial, tests): a socket path with a quote or a backslash makes every call fail; any local user can bind one                                        | valid                                | Fixed: the path goes into the vector as it is; a relative or NUL path is a `ConfinementError`; the unit asserts the mask                                                                                |
| Medium (adversarial): a socket shared into a container job from another netns (the common CI shape) and a relative address are not in the table                        | valid                                | Fixed: the scan of `/run`, `/var/run`, `/tmp`, `/var/tmp`; the reference and the amendments name what is left                                                                                           |
| Medium (adversarial): the evaluation layer keeps every socket                                                                                                          | valid, outside the change            | Story 1.88; the reference says so                                                                                                                                                                       |
| Low (adversarial): the retry fires for any failure to start                                                                                                            | valid                                | Fixed: only when a hidden socket no longer is one                                                                                                                                                       |
| Low (adversarial): the table is read in pieces and a row can drop; accepted connections repeat a path                                                                  | valid                                | Fixed: two reads, one union, each path resolved once                                                                                                                                                    |
| Low (adversarial): the retry is described as up to three times                                                                                                         | valid                                | Reworded: three starts at most                                                                                                                                                                          |
| Low (adversarial): a status file stays behind when the vector throws                                                                                                   | accepted                             | Only a relative or NUL path throws now, which a list never holds; the run's scratch removes the directory                                                                                               |
| Low (adversarial): a socket inside the worktree's own metadata directory is exempted and re-exposed                                                                    | accepted                             | Such a socket (git's fsmonitor) is bound in the target's own namespace, which the runtime's table never lists                                                                                           |
| Low (adversarial): a hard link made to a late socket persists, and a second mount of a socket file stays reachable                                                     | accepted                             | Stated as a limit in the reference and the record; Story 1.86 audits the connection                                                                                                                     |
| Medium (tests): the timer of the late-socket race is left running 30 seconds                                                                                           | valid                                | Fixed: cleared once the race ends                                                                                                                                                                       |
| Medium (tests): the claim that the bridge directory stays connectable is backed by a stand-in case, and no case hides it                                               | valid                                | The claim names `the confined pipeline` (real Bubblewrap); the amendments and the test design say so; a revert (path hidden, masks after the binds) fails 6 of 8                                        |
| Medium (tests): the amendment says a mechanism that blocks every socket fails the route case, which the mount order makes untrue                                       | valid                                | Reworded, and the revert is the order change (2 of 15 fail); the route case asserts the vector hides no own socket                                                                                      |
| Medium (tests): the system sockets could be missing from the table on a shared-netns host, failing the case                                                            | accepted                             | The scan now finds them under `/run` and `/var/run`                                                                                                                                                     |
| Low (tests): the private-root control no longer shows the socket route                                                                                                 | valid                                | The control's sandbox hides no socket and expects `allowed` again                                                                                                                                       |
| Low (tests): the retry unit does not show a fresh list; no case for `/run/user`; a vacuous assertion; a weak order check; a misattributed claim; a loose section split | valid                                | Fixed: the unit counts the lists, the exclusions name `/run/user`, the check is gone, the order check follows the root bind, the opt-out sentence is gone, the section splits at the next heading       |
| Low (tests): the route case requires `strace` it does not use                                                                                                          | accepted                             | `selectConfinement` probes the observer, so a host without `strace` refuses the run                                                                                                                     |

## Spec Change Log

- 2026-10-03: the I/O matrix and the Approach carry the scan and the neighbors of a moved path, which the first design (the table alone) lacked; the Intent's problem statement is unchanged.

## Review Triage Log

Recorded under Build review above.
