---
title: "Story 1.86: List a connection to a host's path-based Unix socket outside the grants as an observed mount"
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 2
baseline_commit: '7c3b68fe091544f52c7ce23f9ffe4c84f2367dc0'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.82 and 1.86)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.86 and Story 1.82 sections)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.82.md (the mounts over path-based sockets and the decisions about the socket list)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.113.md (the record format)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.85.md'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.82 mounts an empty device file over each path-based Unix socket the host lists as bound when a call starts.
A socket a host process binds after the call started, one unlinked and bound again, and one bound in another network namespace outside the scanned directories stay reachable for that call, and the Bubblewrap audit lists none of their connections: it traces file syscalls and a `connect()` to a socket file is none of them.
A target that asks a host service to run a job through such a socket leaves `observedMounts` empty.

**Approach:** the audit's `strace` filter gains `connect` and the three sends that carry an address (`sendto`, `sendmsg`, `sendmmsg`).
`TraceReader` reads the `sun_path` of each call, resolves a relative path against the process's directory as it does for a file syscall, and reports `{ kind: 'connect', path, real, ok, errno }`, `real` being the file the kernel reached.
`traceDecision` lists `real` when the kernel did not refuse the call and the file lies outside `grants.connect`: the workspace, the private directories and the home of the call (the bridge's directory among them), the sandbox's own `/dev` and `/run/user` and the egress proxy's directory.
A socket the mounts cover answers `ECONNREFUSED`, which the call's own return value carries, so it lists nothing.
`score` then exits 3 with eval-quality's isolation violation naming the socket.
The CLI reference's `### File-system confinement` names the connection in the audit passage, and its sentence on the table's limit points to it.

## Boundaries & Constraints

**Always:** Linux only; the macOS audit lists no connection and Story 1.87 owns that mechanism.
A call the kernel refused lists nothing, and so does one to a socket file inside a grant, an abstract address, an address of another family and a send with no address.
The entry is the socket file's real path.
Linux cases run on the ubuntu CI job and skip elsewhere with their reason named; the units run on every host.
The engine check runs at start and end.
No eval-quality change.
No skill file changes: `references/ci.md`, `SKILL.md`, `assets/evaluation-ci-plan.template.json` and every `capture-record.json` stay as they are.

**Never:** a seccomp filter of the runtime's own, a ptrace of the target by the runtime outside `strace`, a new dependency, a real agent CLI, a live run, a story in `epics.md`, `test-design-epic-1.md` or `sprint-status.yaml`.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason and the option rejected.

## I/O & Edge-Case Matrix

| Scenario                           | Input / State                                                                                     | Expected Output / Behavior                                                      | Error Handling |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------- |
| Late socket                        | the runtime binds a socket after the call started; a target process connects to it                | the socket's real path is in `observedMounts`; `score` exits 3 naming it        | exit 3         |
| Late socket through a link         | a link in the workspace leads to a late socket; the target connects through the link              | the socket file the link leads to is listed                                     | exit 3         |
| Late datagram socket               | a target sends a datagram to a socket bound after the call started                                | the socket's real path is listed                                                | exit 3         |
| Socket the mounts cover            | the runtime bound it before the call; the target connects                                         | `ECONNREFUSED`; nothing listed                                                  | n/a            |
| Path with nothing behind it        | `ENOENT`, `ENOTDIR`, `ELOOP`, `EACCES`, `EPROTOTYPE`                                              | nothing listed                                                                  | n/a            |
| Listener queue full or interrupted | `EAGAIN`, `EINTR`, a restart code, a call still waiting when the call ended                       | listed: the kernel did not refuse                                               | exit 3         |
| Own sockets                        | a socket in the workspace, in a private directory of the call, in `/dev`, in the egress directory | nothing listed                                                                  | n/a            |
| Abstract socket, TCP, UDP          | `sun_path=@"name"`, the older leading-NUL spelling, `AF_INET`, `AF_INET6`, `AF_NETLINK`           | nothing listed                                                                  | n/a            |
| Service through the bridge         | the runtime reaches a started service through the bridge socket                                   | nothing listed (the existing confined pipeline cases assert an empty list)      | n/a            |
| Path through a process link        | `/proc/self/root/...`, `/proc/self/cwd/...`                                                       | listed as it stands, since it leads anywhere the process can reach              | exit 3         |
| Reference                          | `docs/reference/tea-evaluate-cli.md`, `### File-system confinement`                               | the audit passage names the connection; the table's limit sentence points to it | n/a            |

</frozen-after-approval>

The frozen block was written for this build from the story's acceptance criteria as amended in `epics.md` on 2026-10-04.

## Code Map

- `cli/lib/evaluate/confinement-audit.js`: `TRACE_SYSCALLS` gains the four socket calls (review round 1 adds `bind`, `mount`, `open_tree`, `move_mount` and `io_uring_setup`); `SOCKET_CALLS`, `SOCKET_RESULT`, `socketAddresses` (the string-aware reader of `sun_path` and `msg_name`), `TraceReader.noteSocketCall`, `settleSocketCall`, `noteBind`, `noteMount`, `socketAccesses`, `standsBound`, `latestRemoval`, `vanished`, `canonical`, `linkKey` and `applyLinkChange`, and `LinkTable` (the tree of directory nodes the replay holds its links in: `get`, `set`, `delete` and `move`) (the replay of the target's own names), `TraceReader.hung`, `LINK_CHANGES`, `MOUNT_SOURCES`, `IO_URING_DENIAL`, `connectDecision` and `SOCKET_NOT_REFUSED`; `traceDecision` hands a `connect` access to `connectDecision`.
- `cli/lib/evaluate/confinement.js`: `sandboxOwnDirectories`, and `trace.grants.connect` in `wrap`.
- `cli/lib/evaluate/host-sockets.js`: the header sentence on the limit.
- `test/test-evaluate-run.js`: `checkSocketConnectionUnits`, `checkSocketConnectionRoute`, `checkSocketConnectionRun`, `checkSocketConnectionReference`, the claims of `checkBridgeReference`, the `handled` filter check of `checkAuditParsers`, and `heldRun`'s `act` and `env` options.
- `test/fixtures/evaluate/mutation/bin/verdict.js`: the act `hold-connect` (its own sockets include one in the home).
- `test/fixtures/isolation-primitives/golden.json`: regenerated (the `trace=` filter, the `inject` qualifier and the `connect` grants).
- `test/lib/isolation-golden.js`: the `connect` list is compared as a set, as `read`, `write`, `withheld` and `withheldExcept` are.
- `docs/reference/tea-evaluate-cli.md`, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-8), `sprint-status.yaml`.
- Not changed: `bridge.js` (the evaluation layer's relay, which is not audited), `confinement-status.cjs`, the skill's guides, `references/ci.md`, `SKILL.md`, the CI plan template, every `capture-record.json`.

## Tasks & Acceptance

- [x] Read what the tracer records today and which connects a confined call makes on its own.
- [x] `confinement-audit.js`, `confinement.js`: the trace, the reader, the decision and the grants.
- [x] `test-evaluate-run.js`, `verdict.js`, the golden: the cases, each with its revert check below.
- [x] The reference, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md`, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.86, with the amendments dated 2026-10-04 there.

## Reproduction

The audit's blind spot, read from the code on the unchanged tree (`7c3b68fe`): `TRACE_SYSCALLS` holds `execve`, the open, link, rename, mode and time calls and the process-creating calls; `SYSCALLS` maps each to a path argument; no entry names a socket call, so a trace of a target that connects to a late socket holds no line the reader looks at, and `observedMounts` stays empty.
The Linux route case of Story 1.82 (`the path socket route`) asserts the late socket is reached (`answers.late === 'connected'`) and says nothing of the audit, which is the gap this story closes.
This build host is macOS and ran no container, so the failing behavior on Linux was not reproduced on a Linux kernel here.
What was reproduced here: the units' captured trace lines for a late `connect` produce an empty list on the unchanged reader (the reader returns at the `SYSCALLS` lookup), which the first revert row below shows as the unit case failing when the socket handling is switched off.

## Decisions

1. **Trace `connect`, and also `sendto`, `sendmsg` and `sendmmsg`.**
   A datagram socket is reached by a send that names the address, with no `connect`; `/dev/log`, the journal's socket and `NOTIFY_SOCKET` are such sockets.
   A late datagram socket would stay reachable and unlisted if only `connect` were traced, which is the gap the story exists to close.
   Rejected: `connect` alone (the story's literal text), because it leaves the same route open for one socket type.
   The cost is a stop at each send for a process that makes many (a Python client sends through `sendto`), and the trace prints up to 4,096 bytes of each send's data (`-s 4096` is global and the audit needs it for long paths).
   Node writes through `write` and `writev`, which the filter does not name, so the agent CLI's traffic is unaffected.
2. **The reader parses the call's text with a scanner that skips quoted strings.**
   `splitArguments` treats `<` after a digit as a descriptor annotation, and a `sendmsg` that passes a descriptor (`cmsg_data=[5</tmp/a"b>]`) would make it swallow the arguments after it; a target could use that to hide the address.
   `socketAddresses` walks the text once, reads each quoted string whole and skips it, skips the character after a backslash outside a string, and takes a string as an address only when `sun_path=` or `sun_path=@` precedes its opening quote.
   A payload that holds the text of an address names none, and a payload ending in `sun_path=` cannot take the next string, since the scan resumes after the payload's closing quote.
   The return value is read by one regular expression anchored at the end of the line, so data inside the call cannot stand in for it.
3. **A message is an address only if the kernel sent it.**
   `sendmmsg` carries several messages, each with its own `msg_name=`; the reader counts them in order and keeps the first as many as the call returned (one when it failed), so a message the kernel did not send lists nothing.
   `strace` prints the messages of a `sendmmsg` when it returns, so a call split by another process's output has no address on its entry line; the resumed line is read for them (build review finding 2).
4. **What the kernel did not refuse** is `ok` (a return value of 0 or more) or an error that shows the file was a live listener: `EAGAIN` (the queue was full), `EINTR` and the three restart codes (a signal ended the wait), and a call that began and never finished.
   The brief's rule: list a connection that succeeded or that the kernel did not refuse.
   Every other error is a refusal: `ECONNREFUSED` (a socket the Story 1.82 mounts cover, a stale socket file, a file that is no socket), `ENOENT`, `ENOTDIR`, `ELOOP`, `ENAMETOOLONG` (nothing behind the path), `EACCES` and `EPERM` (the file exists and the process may not use it), and `EPROTOTYPE` (the file is a socket of another type, so no connection was made).
   Rejected: listing on any error but `ENOENT`, which would list every call the mounts refused and make the story's own control listed.
5. **A call still waiting when the call ended counts as not refused.**
   A blocking `connect` waits only on a listener whose queue is full.
   `strace` prints such a call three ways when the call kills the process: begun with `<unfinished ...>` and never resumed, printed whole with the return value `= ?`, and resumed with `<... connect resumed>) = ?`.
   `TraceReader` keeps the outcome of each split call by pid, settles it when the call resumes, and leaves it `UNFINISHED` otherwise.
   A return value of `?` with no error name is read as `UNFINISHED` too (review round 1, finding 1: `settleSocketCall` left the error name null, which `connectDecision` read as a refusal, so the two printed shapes listed nothing).
6. **The entry is the socket file's real path, and a link the trace shows is followed from the trace.**
   The Story 1.82 mounts work on real paths, so a link in the workspace to a late socket reaches the file by its real path and a link outside the grants leading into the workspace reaches a grant.
   `strace` offers no path for the file a connect reached (`-y` annotates descriptors, and a client socket has none), and the host's `realpath` runs when the trace is read, after the call ended.
   A target that makes a link, connects through it and removes it (or points it into the workspace) would then hide the late socket (build review finding 1).
   `TraceReader` therefore replays the target's own link changes in the timeline's order into a table of links, follows a connect's path through that table component by component (an absolute or relative target, `..`, at most 40 follows), and only then asks the host.
   A socket file that is gone by then keeps its directory's real path with the name as given; a path whose directory is gone too stays as given.
   The first replay matched a link by its exact text path, so a link the target copied, moved with its directory, exchanged or made through a directory link, or one the project held and the target removed, led nowhere the table knew (review round 1, finding 3): the host then found no file at the name and judged the directory, which lies in a grant.
   Decisions 19 and 20 say how each is closed.
   A short-circuit for the kernel's file systems skipped the table for a path under `/dev`, which the sandbox user can write (finding 2); Decision 24 says how it is closed.
   Rejected: the path as the target gave it, which lists the link's own name; and listing every connect through a path the target removed, which would list a target's own socket each time its server closes and unlinks the file (Decision 20 lists the removed path the call did not bind).
7. **A path through a process's own links is listed as it stands.**
   `/proc/self/root/...` and `/proc/self/cwd/...` lead anywhere the process can reach and resolve differently on the host, so the reader does not resolve them, as it does not for a read (`reentry`).
8. **The grants a connection is judged against** are the workspace, the call's private directories and its home (the bridge's directory is one of them), the sandbox's own `/dev` (`--dev /dev`) and `/run/user` (`--tmpfs /run/user`), and the egress proxy's directory.
   The status shim connects to the egress proxy's socket at `egress.mount`, a directory the call sees read-only and the file grants do not hold, so without it every call that lists hosts would list its own proxy (the confined pipeline's `confined-egress` variants assert an empty list and would fail).
   `/dev` and `/run/user` are empty mounts the sandbox makes, so a socket there is one the call's own processes bound.
   `/proc` is not a grant: a socket reached through it is listed.
   Rejected: reusing `grants.write`, which holds the status file and the git entries and not the egress directory, and whose meaning is where a write landed.
9. **The decision reads the same list for every access of a call**, and `grants.connect` is optional in `traceDecision` (a caller with none lists every connection), so a decision over grants that forgot the key errs toward listing.
10. **An abstract address and every other family name no file.**
    The network namespace gives a Bubblewrap target its own abstract sockets, so an abstract connection reaches a socket of the target's own namespace; a TCP or UDP address reaches the namespace's loopback or the egress proxy.
    Both spellings of an abstract address are read (strace 6's `@"name"` and the older leading NUL).
11. **Mounts and the audit stay separate.**
    The audit lists what a connection reached; it hides nothing.
    Mounting a socket a host process binds mid-call is impossible on a read-only `/` (Story 1.82, Decision on the options).
    Rejected: a seccomp filter on `connect`'s address (it cannot read a pointer argument), Landlock's rule on connecting to a socket path (a kernel the CI runners may not have), and a ptrace policy of the runtime's own (a second tracer to build beside `strace`).
12. **Service through the bridge: no change.**
    The bridge's socket is bound by the status shim in a private directory of the call and the runtime connects from outside the namespace, so no traced process connects to it except the service itself, from inside a grant.
    The shim's connect to the service's port is `AF_INET`.
    The existing confined pipeline cases (`test:evaluate-api`, `-mcp`, `-workflow`) assert an empty `observedMounts` for a bridged server, with and without an egress proxy, and run on the ubuntu CI job; `the socket connection route` adds a bridged service that also asks its own bridge.
13. **The Linux cases are carried by the ubuntu CI job.**
    This host is macOS and no container ran.
    `the socket connection route` and `the socket connection run` skip elsewhere with the reason named; `the socket connection units` run on every host over trace lines written by hand in strace 6's spelling (no strace ran on this host), and a revert of the reader or the decision fails them.
    The Linux cases cannot run here, so the CI job is the first run of them: the formats they depend on (the `connect` line with `-y`, the `sendto` line, the abstract spelling, the `= ?` return value) are the unit lines' formats.
    Review round 1 added a link in `/dev` removed after the connection to the route case, and a socket in the home to the run case; the ubuntu CI job carries both.
    Review round 2 changes no Linux case, and the two Linux cases stay carried by the ubuntu CI job in plain words: no container and no strace ran on this host in either round.
14. **The datagram leg uses `/usr/bin/python3`.**
    Node has no Unix datagram socket.
    The leg runs `python3 -B -S` (no bytecode write, no site import) so the interpreter's own reads stay under `/usr`, and skips with the reason named where `/usr/bin/python3` is absent.
15. **The reference gains twelve sentences and changes three.**
    The audit passage names the connection and the calls traced; the late bind is an observed mount; the links followed; a `..` after a link; the path removed after the connection; the bind mount; the nested sandbox that bind-mounts system paths; the destination of a bind mount; the `sendmmsg` the end of the call interrupted; what the kernel did not refuse is listed; what it refused is not; what adds nothing.
    The three changed sentences are the table's limit sentence, which ends in the pointer, the `--seccomp-bpf` sentence and the `io_uring` sentence.
    The seccomp sentence names `connect`, `sendto`, `sendmsg` and `sendmmsg` with or without an address (Python's `send` and `sendall` call `sendto` with a NULL address, and the filter stops at those too), `bind` and the mount calls, and `the socket connection reference` holds it.
    The `io_uring` sentence says the tracer fails `io_uring_setup` (Decision 22).
    Each new sentence is a claim of `checkBridgeReference` backed by named cases, since the reference's network screen asks for it.
    The macOS audit's lack of a connection is stated by the "On Linux" scope of the first sentence and by no claim of its own, since no case backs a negative about Seatbelt.
16. **`handled` check:** the existing check that the filter names every call the parser handles now includes `TRACE_SOCKET_CALLS`.
17. **The isolation golden is regenerated** with `TEA_UPDATE_ISOLATION_GOLDEN=1`; the diff is the `trace=` list (nine names: `connect`, `sendto`, `sendmsg`, `sendmmsg`, `bind`, `mount`, `open_tree`, `move_mount` and `io_uring_setup`), the `-e` `inject=?io_uring_setup:error=ENOSYS` pair and the `connect` grants of the two audited vectors.
18. **A found defect, fixed here:** none outside the story's own files.
19. **The replay keys a link by the physical name and follows what the target does to it (review round 1, finding 3 a to d).**
    A link is keyed by the directory that holds it, followed through the links the trace made, and its last component: `symlink(late, alias/x)` with `alias` a link to `real` makes `real/x`, and a connect by either spelling finds it.
    `link` and `linkat` without `AT_SYMLINK_FOLLOW` copy the link to the new name (a hard link to a link is another name for it), so removing the first name changes nothing.
    A move re-keys every entry at or beneath the old name, so a directory that holds a link and is renamed takes the link with it, and removes whatever lay at or beneath the new name; `renameat2` with `RENAME_EXCHANGE` swaps the two subtrees.
    Rejected: a table keyed by the text path of the call, which a rename of the directory, a second name or a directory link defeats.
20. **A connection through a name the trace later removes, renames or replaces is listed by the path as given, unless the call bound the socket or the trace's own links lead it (finding 3 e).**
    A link the project holds (committed, or left by the adopter) is not in the trace, and the target may remove it after connecting; the host then finds no file and judges the directory, which lies in a grant.
    The smaller design considered: list a connection whose path no longer resolves on the host when the trace is read.
    The runtime removes its own bridge and egress sockets before the trace is read, so that rule would list the service's connection to its own bridge in every confined pipeline case.
    The trace shows what the target removed (`unlink`, `unlinkat`, `rename`, `renameat`, `renameat2`, replaced names included), so the reader keeps a list of removals after the first socket call and, once the whole trace is replayed, lists a connection whose path (followed through the trace's links) or one of its directories was removed after it, by the path as given.
    Both spellings count: the path and the path with its directory resolved on the host, so a removal through a link the project holds to the directory still matches.
    `bind` joins the trace, and a path the call bound (by the process's directory at the time, both spellings) is the call's own while its name stands (Decision 26): a Node server unlinks its socket when it closes, so the run case's sockets and a service's list nothing.
    A connection the kernel refused is not listed by this rule, and a mount source is subject to it (Decision 27).
21. **A bind mount is judged by its source (finding 5 b).**
    The vector has `--unshare-user` and no `--disable-userns`, so where the host allows nested user namespaces a target can `unshare(CLONE_NEWUSER|CLONE_NEWNS)`, mount a socket file or its directory onto a name in the workspace (`mount` with `MS_BIND`, or `open_tree` with `OPEN_TREE_CLONE` and `move_mount`) and connect there.
    The trace gains `mount`, `open_tree` and `move_mount`; a successful bind (`MS_REMOUNT` excluded), a successful `open_tree` that clones, and a `move_mount` that names a source path are read as a connection to the source path and listed when it lies outside `grants.connect`.
    `fsmount` is not traced: it attaches a file system built through `fsopen` and `fsconfig` and names no host path, and an overlay file system presents an inode of its own, so a connection through one finds no socket (a kernel behavior stated from the kernel's lookup by inode; no Linux host ran it here).
    A failed call (a host that refuses nested user namespaces answers `EPERM`) lists nothing.
    The listing is the source, whatever it holds: `mount("/usr", ..., MS_BIND|MS_REC)` lists `/usr` and `mount("/etc/resolv.conf", ..., MS_BIND)` lists `/etc/resolv.conf`, so a target that runs a nested sandbox which bind-mounts system paths gets `score` exit 3.
    The first reference sentence named a socket file or a directory that holds one, and the code lists every bind source outside the grants; the sentence, the CHANGELOG line and the claim now say the source lies outside the grants, whatever it holds (review round 2, finding 9).
    Rejected: `--disable-userns` for the target, because it changes what a target can do (a program that makes a user namespace of its own, such as a browser's sandbox or a rootless tool, fails) and the story changes no other behavior.
22. **`io_uring_setup` is failed with `ENOSYS` (finding 5 a).**
    `IORING_OP_CONNECT` connects to a socket file with no `connect` call for the trace to read, and the trace sees no file access through a ring either.
    The tracer's `-e inject=?io_uring_setup:error=ENOSYS` makes the call fail as it does on a kernel without `io_uring`.
    The strace manual documents `--inject=syscall_set:error=errno`; strace's source builds the `--seccomp-bpf` filter from the `trace=` set alone (`traced_by_seccomp`), so the call is in `trace=` as well, and the `inject` set parses its names through the same function as `trace=`, so the `?` prefix applies.
    The reader ignores the call's line.
    A strace that rejects the qualifier fails `probeTrace` before the run, so the run refuses with exit 12 and no run goes unaudited; the ubuntu CI job is the first run, and `test:isolation-primitives` holds the command.
    Programs that probe for `io_uring` and fall back (libuv does) see the answer of a kernel without it.
23. **A `sendmmsg` that the end of the call interrupted lists nothing, and the reference says so (finding 1).**
    `strace` prints the messages of a `sendmmsg` when the call returns, so a call killed while it waited prints `sendmmsg(3<socket:[1]>,  <unfinished ...>) = ?` with no vector, and `-y` annotates a client socket as `socket:[inode]` with no path (`-yy` adds the socket's own bound name and no peer's).
    The trace holds no address for it, so none can be listed, and listing it conservatively would list every send of a program that waits on a full queue.
    The call waits only on a datagram socket whose queue other senders filled, and delivered at most the messages ahead of the blocked one in its vector; the earlier calls of the same process that returned are listed from their vectors.
    The reference states it (a sentence backed by a unit) and the record states it here.
24. **The kernel's file systems no longer skip the table (finding 2).**
    A path under `/dev` took the `kernel` short-circuit, so a link the target made there (`--dev /dev` is a tmpfs the sandbox user can write) was never followed and `/dev` stayed a grant.
    `socketAccesses` follows the trace's links before it judges: a link in `/dev` to a late socket, a directory link and a relative link after a `chdir` are listed by the file they led to, and a `/dev` path with no link of the trace's keeps its meaning (`/dev/log`, `/dev/fd/5`).
25. **A call that names no Unix socket file holds nothing (finding 4).**
    Every `connect`, `sendto`, `sendmsg` and `sendmmsg` pushed a closure onto the timeline until `finish()`; glibc's `send()` is `sendto` with a NULL address, so a Python or curl target held memory per send (1,000,000 `AF_INET` `sendto` lines held 315 MB).
    A finished call is kept only when its text names a non-abstract, non-empty path.
    A split call is kept on the same test of its entry text, except a `sendmmsg`, which always stays since it prints its addresses on the resumed line (Decision 30).
    A unit counts the timeline after 25,000 calls of the shapes a client makes, and the 300,000-line measurement now holds no entry.
26. **A bind exempts a connection only while its name stands (review round 2, finding 1).**
    The first rule made any successful `bind` of a name, at any point of the trace, the call's own for every connection through that name, which reopened the project-held link route: connect through `repo-link`, unlink it, bind a socket at `repo-link` and the connection listed nothing.
    The reader now keeps the step at which each socket was bound (`standing`) and the latest step at which each name, in both spellings, was removed, renamed or replaced (`removedAt`, recorded once a connection or a bind came before).
    A connection is the call's own when its name, or the host spelling of it, was bound and no removal of that name or of a directory above it came after the bind and before the connection (`standsBound`), settled at the step of the connection.
    A set of standing names that drops every name at or beneath a removed one gives the same answer and scans the set at each removal; the map of steps looks a name up by walking the directories above it (Decision 29).
    A bind, an unlink and a project link put back before the connection list the connection (unit B), and so do a bind after the connection (units A and A2) and a bind in a directory the target renamed and replaced.
    Rejected: a set that survives every removal, which is the defect.
27. **A bind mount leads where its source leads, and its source is subject to the removed-later rule (review round 2, finding 2).**
    A bind mount whose source lies inside a grant is harmless in itself and creates a second name the table of links could not follow: a link made in the mounted directory and a link the project held beneath it were unreachable through the destination, and a source removed after the mount was exempt from the removed-later rule.
    `mount` and `move_mount` now carry their destination (`to`), and the replay sets a table entry from the destination, keyed like a link, to the source as the trace follows it at the step of the mount.
    A `move_mount` from an `open_tree` descriptor (`MOVE_MOUNT_F_EMPTY_PATH`) takes its source from the descriptor's annotation and lists nothing of its own, since the `open_tree` listed it.
    The `mount` exemption of the removed-later rule is gone, so a source the target removes after the mount is listed as given (unit C).
    `umount` is not traced, so an entry stays for the rest of the trace.
28. **A `..` after a link the trace did not make goes to the parent of the directory the link leads to (review round 2, finding 3).**
    The kernel resolves `plink/../late.sock` through `plink`'s target, and the reader collapsed the name, so a link the project holds to a directory outside the grants hid a socket in that directory's parent.
    `followTraceLinks` runs on an empty table too, and at each `..` it replaces the path so far with its real path on the host (a path in the kernel's file systems keeps the lexical pop, as reads do) before it pops; the path is returned whenever that changed it.
    Units hold the stub and a real directory with a link to a sibling directory.
29. **The replay is linear in the trace (review round 2, finding 4; review round 3, findings 4 and 5).**
    The round 2 reviewer measured 178 s for 20,000 links and 50,000 renames, 18.5 s for 1,000 connections and 500,000 removals and 35 s for 10,000 connections and 100,000 removals, against 0.11 s on the base.
    Round 2 kept, for each directory, the set of names beneath it, so a rename visited the entries at or beneath the old and new names and no others; the removals are one map from each name, in both spellings, to its latest step, looked up by walking the directories above a connection's name.
    The round 3 reviewer showed the rename of a directory still re-keyed every link beneath it: `mkdir d`, N links in `d` and R alternating renames of `d` and `e` took 7.0 s for 2,000 links and 5,000 renames, 30.0 s for 4,000 and 10,000, and 135.6 s for 8,000 and 20,000 (about 4.4 times per doubling).
    `LinkTable` is a tree of directory nodes, each with its children by name and an optional target.
    A rename detaches the node at the old name and attaches it at the new one, replacing what lay there, and `RENAME_EXCHANGE` swaps the two nodes, so a rename costs the depth of the two names whatever lies beneath them; `get`, `set` and `delete` walk the components, and the set of names beneath each directory (`beneath`, `linksUnder`) is gone.
    A rename into its own subtree, or of a subtree into its name, is a call the kernel refuses, so the table ignores it.
    Three synthetic traces (20,000 links renamed 50,000 times; 10,000 connections and 100,000 removals; 20,000 links in one directory and 50,000 renames of that directory) each run at a quarter of their size and at their size, the best of three runs each.
    A run must read in under 15 s and take under eight times as long at four times the trace.
    The measured times on this host are 0.1 s to 0.5 s, and the growth is 3.3 to 4 times for four times the trace.
    The round 2 timing units passed 74 of 74 with `linksUnder` replaced by a scan of every entry (9.2 s) and `latestRemoval` replaced by a scan of every removal (7.3 s), because the 15 s bound alone leaves room for a cheap quadratic step; the reviewer measured the growth for four times the input at 4.4 and 4.1 for the shipped code and 13.6 and 13.4 for those scans.
    A unit also runs 3,000 random traces (links, hard links, removals, renames, `RENAME_EXCHANGE` exchanges, bind mounts and connections beneath three directories) through the tree and through `ScanLinks`, the table of round 2 kept in the test file as a map that scans every entry, and asserts the same listed paths for every seed.
    Rejected: a bound on the time alone (a cheap quadratic step passes it), and a set of names beneath each directory (a rename of a directory touches each).
30. **A split call keeps an entry only when it can name a socket file (review round 2, finding 5).**
    The `<unfinished ...>` branch kept every split socket call, so 500,000 split TCP `sendto` calls over a million lines held 159 MB against the base's 6 MB.
    `connect`, `sendto` and `sendmsg` print their address at entry, so a split one stays only when its entry text names a socket file; `sendmmsg` prints its vector on the resumed line and always stays.
    A unit counts the timeline after 15,000 split calls that name no socket file.
31. **A `..` resolved on the host is a name the target may remove afterwards (review round 3, finding 1).**
    The round 2 `..` step resolves the path so far on the host when the trace is read.
    The project holds `plink -> /srv/host/sub`, the target connects to `plink/../late.sock` (the kernel reaches `/srv/host/late.sock`) and then unlinks `plink`, renames it or points it at a workspace directory: the host then finds no link or one into the workspace, the `..` pops by name to `/work/ws/late.sock`, and `vanished` looked at the connection's name alone, so nothing was listed.
    The reviewer reproduced it on the real file system with `fs.realpathSync.native`: the connection listed `<base>/host/late.sock` before the unlink and `[]` after it.
    `followTraceLinks` takes a `passed` array and adds each path it resolves for a `..`; `socketAccesses` hands it in and carries it on the connection; `vanished` checks it with the name and the host spelling of the name.
    Units hold the unlink, the rename and the replacement by a link to a workspace directory against the stub, and a real directory whose link is removed.
32. **A bound socket stands only when neither spelling of its name was replaced after the bind (review round 3, finding 2).**
    `standsBound` took a spelling alone: a socket bound as `alias/own.sock` (`alias` a link the project holds to `real`) stands under both spellings, and `rename("hostlink", "real/own.sock")` records the removal under `/work/ws/real/own.sock` only, so the `alias` spelling still counted as standing, a connection through `alias/own.sock` was the call's own, and the `unlink("real/own.sock")` after it hid it.
    The latest removal across both spellings is taken and a bind must be newer than it.
    A unit holds the replacement through the other spelling, and a control binds, replaces and connects under one spelling and still lists the socket.
33. **A bind mount's destination leads to the source under both spellings of its directory (review round 3, finding 3).**
    The replay keyed the destination by `linkKey`, which follows the trace's own links and ignores a directory link the project holds, and the host never sees a mount made in the target's namespace, so read-time resolution cannot repair the key.
    `mount("/work/ws/dir", "/work/ws/plinkdir/mnt", MS_BIND)` with `plinkdir -> /work/ws/other` a project link, a link made in `dir` and a connection through `/work/ws/other/mnt/l` listed nothing, while the connection through `plinkdir/mnt/l` listed the socket.
    The replay sets the link under the destination and under its host spelling.
    Units connect through each spelling.

## Implementation Notes

- A connect access is `{ kind: 'connect', path, real, ok, errno, annotated: false, dotdot, reentry }`, emitted through the reader's timeline, so a relative `sun_path` resolves against the directory the process had at the call, as a file syscall's relative path does.
- `TraceReader.links` is a `LinkTable`, the tree of names the trace made (links and bind mount destinations), reached by physical name (`linkKey`); `noteLinkChange` records a successful call and `applyLinkChange` applies it in the replay, against the directory the process had, and keeps the names it removed or replaced in `removedAt` for `vanished` and `standsBound`.
- `finish()` reports the connections after the whole trace is replayed, since the removals after a connection decide whether the host can still say what it reached; the other accesses are reported as they replay.
- A connection carries `vanished` (the path, or a directory above it, was removed after the call and the call did not bind it while its name stood); `connectDecision` lists it by the path as given when the real path lies in a grant.
- `settleSocketCall` fills `{ name, ok, errno, limit }` from the end of the text; a split call is settled on resume.
- `connectDecision` is a function of the access and `grants.connect` only.
- The `hold-connect` act holds as `hold-gate` does, so the case binds the late sockets while the call is in flight, and connects from child processes of its own (a socket in the workspace by a relative name, one in the temp directory by a relative name after a `chdir`, an abstract one, a loopback port, then each named socket and a link to one).
- `hold-connect` also serves and connects to one socket in the home by a relative name after a `chdir`.

## Revert observations

Every row ran once on the final tree of review round 3 (`441a97ed` with the round's edits in the working tree, before its commit), applied to a scratch copy of it under the scratchpad directory (`.git` left out, `node_modules` linked).
Each row names the one edit, the case run there under `node test/test-evaluate-run.js --group=confinement --only=<case>` (or `node test/test-isolation-primitives.js`), and the failed-check count; the changed file was copied back from the working tree after each row.
The unchanged scratch copy passed first: `the socket connection units` 91 checks, `the socket connection reference` 5, `the network reference` 185, `test:isolation-primitives` green.
The Linux cases (`the socket connection route`, `the socket connection run`) cannot run on this host, so no row names them, and the ubuntu CI job carries them.
Dropping the `connect` trace there leaves the list empty, which the route case's `[late]` assertion and the run case's `score` exit 3 would catch.
The existing confined pipeline cases (`confined-egress` variants) would list the shim's own connection to the egress proxy if the proxy's directory left the grants; the unit row for that grant is the macOS-visible proof.
The rows down to the reworded claim sentence are the rows of round 1 on this round's tree, the rows after them are round 2's rows with the edits restated for the code as it now stands (the tree of links replaces `linksUnder`: the rename rows name `move`), and the last rows are this round's.
The three rows that scale the trace (a rename that copies every node beneath the directory, a rename that visits every node of the table, and the cheap-prefix scan of `latestRemoval`) took 567 s, 41 s and 29 s and fail the timing checks of the synthetic traces; the others took about nine seconds for the units and under a second for the rest.
The cheap-prefix scans are the ones the round 2 timing units let through (`name.charCodeAt(root.length) === 47 && name.startsWith(root)` over the entries): the units now fail them.

| Revert (the one edit)                                                                                        | Case run                        | Observed      |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------- |
| `noteSocketCall` returns at once (the reader acts on no socket call)                                         | the socket connection units     | 49 of 91 fail |
| The four socket calls leave the `trace=` list (`connect`, `sendto`, `sendmsg`, `sendmmsg`)                   | the socket connection units     | 1 of 91 fail  |
| The same edit                                                                                                | `test:isolation-primitives`     | 2 checks fail |
| The grants are not consulted (`connectDecision` returns the real path)                                       | the socket connection units     | 25 of 91 fail |
| The error is not consulted (`connectDecision` drops the refusal test)                                        | the socket connection units     | 6 of 91 fail  |
| An abstract address names a file (`namesFile` ignores `abstract`)                                            | the socket connection units     | 3 of 91 fail  |
| The sends are not read (`SOCKET_CALLS` holds `connect` alone)                                                | the socket connection units     | 7 of 91 fail  |
| A link is not resolved on the host (`real: absolute` in `socketAccesses`)                                    | the socket connection units     | 20 of 91 fail |
| A path through a process link is not listed as given (`connectDecision` drops the `reentry` line)            | the socket connection units     | 1 of 91 fail  |
| A split call is not kept (the entry of a call still waiting is dropped)                                      | the socket connection units     | 5 of 91 fail  |
| A `= ?` return value is read as a refusal (the `UNFINISHED` default is dropped)                              | the socket connection units     | 1 of 91 fail  |
| A `sendmmsg` lists every message whatever it sent (`limit` is unbounded)                                     | the socket connection units     | 2 of 91 fail  |
| The links the trace shows are not followed (`followTraceLinks` returns `null`)                               | the socket connection units     | 23 of 91 fail |
| The messages a resumed `sendmmsg` prints are not read                                                        | the socket connection units     | 1 of 91 fail  |
| A link in the kernel's file systems is not followed (`/dev`: `followTraceLinks` skipped for `kernelFs(raw)`) | the socket connection units     | 1 of 91 fail  |
| A hard link to a link is not copied (`copy` finds no link)                                                   | the socket connection units     | 1 of 91 fail  |
| A rename moves the old name alone (`move` attaches the node without its children)                            | the socket connection units     | 5 of 91 fail  |
| `RENAME_EXCHANGE` is a plain move (the second subtree is not swapped)                                        | the socket connection units     | 1 of 91 fail  |
| A link made through a link to a directory is keyed by the name as given (`linkKey` skips `followTraceLinks`) | the socket connection units     | 1 of 91 fail  |
| A path the trace removes later is not listed (`connectDecision` returns `null` for `vanished`)               | the socket connection units     | 14 of 91 fail |
| A socket the call bound is not remembered (`bind` is ignored)                                                | the socket connection units     | 4 of 91 fail  |
| A bind mount is not read (`noteMount` is not called)                                                         | the socket connection units     | 9 of 91 fail  |
| A mount that is no bind is listed (the flag is not consulted)                                                | the socket connection units     | 1 of 91 fail  |
| `io_uring_setup` is not failed (the `inject` qualifier leaves the command)                                   | the socket connection units     | 1 of 91 fail  |
| The same edit                                                                                                | `test:isolation-primitives`     | 2 checks fail |
| A call that names no socket file is held (the timeline keeps every finished call)                            | the socket connection units     | 4 of 91 fail  |
| The egress proxy directory leaves the connection grants                                                      | the socket connection units     | 1 of 91 fail  |
| The sandbox own `/dev` and `/run/user` leave the connection grants                                           | the socket connection units     | 1 of 91 fail  |
| The private directories of the call leave the connection grants                                              | the socket connection units     | 1 of 91 fail  |
| The home leaves the connection grants                                                                        | the socket connection units     | 1 of 91 fail  |
| The audit passage loses the connection sentence                                                              | the socket connection reference | 1 of 5 fail   |
| The table's limit sentence loses its pointer                                                                 | the socket connection reference | 1 of 5 fail   |
| The refused-connection sentence loses its words                                                              | the socket connection reference | 1 of 5 fail   |
| The `--seccomp-bpf` sentence names only the calls that name an address                                       | the socket connection reference | 1 of 5 fail   |
| A claim sentence of the audit passage is reworded (the claim table holds each sentence)                      | the network reference           | 2 of 185 fail |
| A bind exempts the name whenever it came (`vanished` consults every bind of the trace)                       | the socket connection units     | 5 of 91 fail  |
| A removal after a bind does not end it (`standsBound` ignores removals)                                      | the socket connection units     | 4 of 91 fail  |
| A bind mount's destination is not followed (the `links.set` of the destination is dropped)                   | the socket connection units     | 5 of 91 fail  |
| A mount source removed after the mount is exempt again (a mount connection is the call's own)                | the socket connection units     | 1 of 91 fail  |
| A `move_mount` from a descriptor takes no source (an empty path returns)                                     | the socket connection units     | 1 of 91 fail  |
| An `open_tree` of a descriptor with an empty path is not read                                                | the socket connection units     | 1 of 91 fail  |
| A `..` after a link the trace did not make collapses by name (`followTraceLinks` skips the host)             | the socket connection units     | 3 of 91 fail  |
| A trace with no link returns early from `followTraceLinks` again                                             | the socket connection units     | 7 of 91 fail  |
| The host spelling of a bound socket is not remembered                                                        | the socket connection units     | 1 of 91 fail  |
| The path a bind named is not followed through the trace's links                                              | the socket connection units     | 1 of 91 fail  |
| A removal is counted whenever it came (`vanished` ignores the order)                                         | the socket connection units     | 2 of 91 fail  |
| A leading NUL is no abstract address (`socketAddresses` drops the older spelling)                            | the socket connection units     | 1 of 91 fail  |
| A split `connect`, `sendto` or `sendmsg` is kept whatever its entry holds                                    | the socket connection units     | 2 of 91 fail  |
| A rename of a directory copies every node beneath it (`move` attaches a copy of the subtree)                 | the socket connection units     | 2 of 91 fail  |
| A rename visits every node of the table (the cheap-prefix scan of the old `linksUnder`)                      | the socket connection units     | 2 of 91 fail  |
| A connection scans every removal (the cheap-prefix scan of `latestRemoval` over the map)                     | the socket connection units     | 1 of 91 fail  |
| The bind mount sentence loses "whatever the source holds"                                                    | the network reference           | 2 of 185 fail |
| The `..` sentence loses the removal clause                                                                   | the network reference           | 1 of 185 fail |
| The bind mount sentence loses the destination sentence                                                       | the network reference           | 1 of 185 fail |
| A path a `..` was resolved against is not a name the target may remove (`vanished` drops `passed`)           | the socket connection units     | 4 of 91 fail  |
| A `..` records no path it resolved (`followTraceLinks` adds nothing to `passed`)                             | the socket connection units     | 4 of 91 fail  |
| A bound socket stands under a spelling alone (`standsBound` takes the removal of each spelling apart)        | the socket connection units     | 1 of 91 fail  |
| A bind mount destination leads to the source under its own spelling alone                                    | the socket connection units     | 1 of 91 fail  |
| A link removed from the table takes the names beneath it along (`delete` clears the children)                | the socket connection units     | 2 of 91 fail  |

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

Local, macOS (Seatbelt), on the final tree of review round 3 unless a line says otherwise:

- `test:evaluate-confinement` ran once in full: 1,898 checks, green, with the Linux cases skipped and their reason named (1,874 after round 2, 1,849 after round 1).
  `the socket connection units` hold 91 checks, `the socket connection reference` 5 and `the network reference` 185.
- `test:evaluate-run` 592, `test:evaluate-preflight` 353, `test:evaluate-agents` 501, `test:isolation-primitives`: green; the golden is unchanged by this round.
- `test:doc-counts`, `test:doc-claims`, `test:shards` 183, `test:ci-coverage`, `test:changelog`: green.
- `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`, `npm run docs:build`: green.
- Linux: no container ran in this round and no strace ran on this host.
  The ubuntu CI job carries `the socket connection route` and `the socket connection run`, the existing confined pipeline cases that assert an empty list for a bridged server, and the first run of the tracer with `-e inject=?io_uring_setup:error=ENOSYS` beside `--seccomp-bpf` (Decision 22).
  On `aee11350` chain 4/12 ran both Linux cases green with no skip.
  The units read the same trace lines and the same decision on this host.
- No real agent CLI was started and no live run was made.
- `git diff -- package.json package-lock.json` is empty.

## Build review

Round 0: one subagent reviewed the committed change read only, in three lenses (correctness and evasion, test quality of the Linux cases, rule compliance), in place of `/bmad-code-review`.
Every finding was checked against the code before it was acted on.

| Finding                                                                                                                                                                                                                        | Verdict | Route                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High: the real path is resolved when the trace is read, so a link made, connected through and removed (or retargeted into the workspace) hides the late socket; the route case also removed its link before the audit was read | valid   | Fixed: the trace's own symlink, unlink and rename calls are replayed into a table of links that a connect is followed through before the host is asked (Decision 6); the route case removes its link after the read; units hold a removed link, a directory link, a renamed link, a relative link, `symlinkat`, a retargeted link and a failed creation |
| High: a `sendmmsg` split by another process prints its messages on the resumed line, which the reader did not scan                                                                                                             | valid   | Fixed: the resumed text is read for addresses (Decision 3); a unit holds a split call                                                                                                                                                                                                                                                                   |
| Medium: the record held the placeholders for revert observations, gates and review                                                                                                                                             | valid   | Fixed: this record                                                                                                                                                                                                                                                                                                                                      |
| Low: a heading phrased as an antithesis; `test/lib` named for the golden fixture; the call's home missing from the reference sentence                                                                                          | valid   | Fixed: Decision 2's title, `test-design-epic-1.md` names `test/fixtures/isolation-primitives/golden.json`, the sentence and its claim name the home                                                                                                                                                                                                     |
| Low: planning amendments hold several sentences on one line                                                                                                                                                                    | checked | No change: the amended paragraphs of `epics.md` and `test-design-epic-1.md` are single lines throughout the file                                                                                                                                                                                                                                        |
| Minor: `hold-connect` could throw on a failed spawn; a sandbox of the route case was not released when a step threw                                                                                                            | valid   | Fixed: `?? ''` and `?.trim()` in the act; the route case releases every sandbox it opened in its `finally`                                                                                                                                                                                                                                              |

Round 1: two Opus reviewers (a code lens and a tests and records lens) read the committed build and reproduced every finding with scripts against the tree.
The coordinator added one more from the CI run.
Every finding below is fixed in the round.

| #   | Finding                                                                                                                                                                                                                                           | Route                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Medium: a socket call printed with the return value `= ?` (or resumed with `= ?`) read as a refusal, so a call still waiting when the call ended listed nothing; a `sendmmsg` killed while it waited prints no vector                             | Fixed: `= ?` with no error name is `UNFINISHED` (Decision 5), units hold the three printed shapes; the `sendmmsg` has no address in the trace and the reference and Decision 23 say so                                                                                                                                                                       |
| 2   | High: a link made under the sandbox's own `/dev` took the `kernel` short-circuit, so the table of links was never asked and `real` stayed inside the `/dev` grant                                                                                 | Fixed: the trace's links are followed before the judgment (Decision 24); units hold a file link, a directory link and a relative link after `chdir`; the route case adds a link in `/dev` removed after the connection                                                                                                                                       |
| 3   | High (both lenses): the link replay matched exact text paths, so a hard link to the link, a renamed directory, `RENAME_EXCHANGE`, a link made through a directory link and a link the project held that the target removed each hid a late socket | Fixed: Decisions 19 and 20 (the table keyed by physical name with copy, subtree move and exchange, and the removed-later rule with `bind`); a unit for each of the five                                                                                                                                                                                      |
| 4   | Low: every socket call held a closure until `finish()`, even one naming no Unix path (1,000,000 `AF_INET` `sendto` lines held 315 MB)                                                                                                             | Fixed: Decision 25; a unit counts the timeline entries of a stream of such calls                                                                                                                                                                                                                                                                             |
| 5   | Low: `io_uring` (`IORING_OP_CONNECT`) and a bind mount in a nested user namespace reach a late socket the trace cannot read, and the reference gave no reason                                                                                     | Fixed: Decisions 22 and 21; `io_uring_setup` is failed with `ENOSYS` and the mount calls are traced, a unit for each; the reference says both                                                                                                                                                                                                                |
| 6   | Medium (tests): the home entry of `connect` could be removed with every case green, since the units' sandbox had no private root                                                                                                                  | Fixed: the grants block gives the sandbox a private root with the home beneath it, so no private directory of the call holds it and only the home entry of `connect` names it; `hold-connect` serves and connects to a socket in the home and `the socket connection run` asserts it; a revert row                                                           |
| 7   | Low (record): two revert rows named counts the edits did not give, and "captured trace lines" described lines written by hand                                                                                                                     | Fixed: every row reran on this round's tree with the exact edit named; the CHANGELOG and the record say "trace lines written by hand in strace 6's spelling"                                                                                                                                                                                                 |
| 8   | Low: a comment said the shim opens no path the trace holds                                                                                                                                                                                        | Fixed: "The egress proxy's directory is no read grant: the shim only connects to its socket, which `connect` below covers."                                                                                                                                                                                                                                  |
| 9   | Low: the reference said `--seccomp-bpf` stops only at the calls that name a socket address                                                                                                                                                        | Fixed: the sentence names `connect`, `sendto`, `sendmsg` and `sendmmsg` with or without an address, `bind` and the mount calls; `the socket connection reference` holds it                                                                                                                                                                                   |
| 10  | Low (writing rule): comment sentences wrapped across lines in the diff                                                                                                                                                                            | Fixed: every added comment sentence is on one line in `confinement-audit.js`, `confinement.js`, `test-evaluate-run.js` and `verdict.js`, and a scan of the diff finds no wrapped or double-sentence comment line                                                                                                                                             |
| 11  | CI (ubuntu, `test:isolation-primitives`): `confinement.targetSandbox.wrap.bubblewrap.audit.ownedStatus` was not byte-identical to the golden                                                                                                      | Fixed: the golden recorded the home twice in `connect` (both macOS spellings of `/var` and `/private/var` normalize to the same text) while Linux, whose temp directory has no alias, prints it once; `test/lib/isolation-golden.js` compares `connect` as a set, as it does `read`, `write`, `withheld` and `withheldExcept`, and the golden is regenerated |

Round 2: two Opus reviewers (a code lens and a tests and records lens) read the round 1 commit and reproduced every finding with scripts against the tree.
Every finding below is fixed in the round.

| #   | Finding                                                                                                                                                                                                                                                                                                         | Route                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High: the bind exemption ignored order, so any successful `bind` of a name made every connection through that name the call's own and reopened the project-held link route (a connection, the unlink, then a bind; the same with the bound socket left in place; a bind, an unlink and a project link put back) | Fixed: Decision 26; a bind stands only while no removal of its name or a directory above it came after it, settled at the step of the connection; units for each of the three shapes and for a bind in a directory the target renamed and replaced                                                                     |
| 2   | Medium: a bind mount whose source lies inside a grant created a name the reader could not follow (a link made in the mounted directory, a link the project held beneath it), and the mount source was exempt from the removed-later rule                                                                        | Fixed: Decision 27; `mount` and `move_mount` carry their destination, the replay sets a table entry from it to the source, a `move_mount` from an `open_tree` descriptor reads the descriptor's annotation, and the exemption is gone; units C, D, D2 and the `open_tree` and `move_mount` leg                         |
| 3   | High: a `..` after a link the trace did not make was collapsed by name, while the kernel goes to the parent of the link's target                                                                                                                                                                                | Fixed: Decision 28; `followTraceLinks` resolves the path so far on the host at each `..`; a unit against the stub and one against a real directory                                                                                                                                                                     |
| 4   | Medium: the replay was quadratic (178 s for 20,000 links and 50,000 renames, 18.5 s for 1,000 connections and 500,000 removals, 35 s for 10,000 connections and 100,000 removals)                                                                                                                               | Fixed: Decision 29; names beneath each directory and a map of latest removals; two units run the first and third shapes under a 15 s bound, measured at 0.6 s and 0.5 s                                                                                                                                                |
| 5   | Low: every split socket call kept a timeline entry (159 MB for 500,000 split TCP `sendto` calls)                                                                                                                                                                                                                | Fixed: Decision 30; a unit counts the timeline after 15,000 split calls that name no socket file                                                                                                                                                                                                                       |
| 6   | Medium (tests): the case "a name removed before the connection" passed for the wrong reason, since no connection came before the removal                                                                                                                                                                        | Fixed: the scenario starts with a connection; the revert of the order check fails it (a revert row)                                                                                                                                                                                                                    |
| 7   | Medium (tests): the leading-NUL spelling legs passed for the wrong reason, since the path read as relative under a grant                                                                                                                                                                                        | Fixed: the scenario starts with a `chdir` to `/srv/host`; the revert of the spelling fails it (a revert row)                                                                                                                                                                                                           |
| 8   | Low (tests): four round 1 branches had no case that failed on revert                                                                                                                                                                                                                                            | Fixed: units for the mount exemption (the new behavior), the host spelling of a bound socket, a bound path followed through the trace's links and an `open_tree` of a descriptor with an empty path, each with a revert row                                                                                            |
| 9   | Low: the reference and the CHANGELOG said a bind mount "of a socket file, or of a directory that holds one" is listed, and the code lists every bind source outside the grants                                                                                                                                  | Fixed: "A bind mount whose source lies outside those places is listed by its source, whatever the source holds"; the claim, the CHANGELOG line and Decision 21 say so, and a unit lists `/usr` and `/etc/resolv.conf`                                                                                                  |
| 10  | Low: the unit comment and the record said the home is in no write grant of the call, and the code puts it there                                                                                                                                                                                                 | Fixed: both say no private directory of the call holds the home and only the home entry of `connect` names it                                                                                                                                                                                                          |
| 11  | Low (record): Decision 15 counted two changed sentences, Decision 17 four names, the `hold-connect` note left out the home socket, three sentences had the denying shapes, and a scenario with one line could not fail on any revert                                                                            | Fixed: Decision 15 says three changed sentences and twelve added, Decision 17 names the nine `trace=` entries and the `inject` pair, the note names the home socket, the denying sentences are rewritten, and the `io_uring_setup` scenario is renamed to what it holds (the `straceCommand` check carries the revert) |

Round 3: two Opus reviewers (a code lens and a tests and records lens) read the round 2 commit and reproduced every finding with scripts against the tree.
Every finding below is fixed in the round.
This is the last review round; after it only CI and CodeRabbit remain.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                      | Route                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium, evasion: a `..` after a link the project holds resolved the path so far on the host at read time, so a target that connected to `plink/../late.sock` and then unlinked, renamed or retargeted `plink` hid the connection (`vanished` checked the connection's name alone; on the real file system the connection listed `<base>/host/late.sock` before the unlink and `[]` after it) | Fixed: Decision 31; `followTraceLinks` collects the paths a `..` was resolved against, the connection carries them and `vanished` checks them; units for the unlink, the rename and the replacement against the stub and for a real directory                                                     |
| 2   | Medium, evasion: a socket bound as `alias/own.sock` stood under both spellings, a rename through the other spelling recorded the removal under one only, and the unlink after a connection through `alias/own.sock` was hidden                                                                                                                                                               | Fixed: Decision 32; `standsBound` takes the latest removal across both spellings; a unit for the replacement and a control that still lists the single-spelling case                                                                                                                              |
| 3   | Medium, evasion: a bind mount onto a name beneath a directory link the project holds was keyed by the trace's own links only, so a connection through the other spelling of the destination was hidden                                                                                                                                                                                       | Fixed: Decision 33; the destination leads to the source under both spellings; units connect through each                                                                                                                                                                                          |
| 4   | Medium (tests): the timing units passed when the replay regressed to a quadratic one with a cheap step (a scan of every entry of `links` for `linksUnder` passed 74 of 74 in 9.2 s, the same scan of `removedAt` for `latestRemoval` in 7.3 s)                                                                                                                                               | Fixed: Decision 29; each shape runs at a quarter of its size and at its size, the best of three runs each, under 15 s and under eight times as long; revert rows for the cheap-prefix scans                                                                                                       |
| 5   | Medium: a rename of a directory re-keyed every link beneath it, so a target that renamed a directory of links back and forth made the replay quadratic again (7.0 s for 2,000 links and 5,000 renames, 30.0 s for 4,000 and 10,000, 135.6 s for 8,000 and 20,000), against the "linear in the trace" of Decision 29, the CHANGELOG, AD-8 and the `epics.md` amendment                        | Fixed: Decision 29; the table of links is a tree of directory nodes and a rename moves one node; a third synthetic trace (20,000 links in one directory, 50,000 renames of it) under the same growth check; a unit of 3,000 random traces compares the tree with the table that scans every entry |
| 6   | Low: the flag of a `move_mount` from an `open_tree` descriptor is `MOVE_MOUNT_F_EMPTY_PATH` (`AT_EMPTY_PATH` belongs to `open_tree`), and a comment called the descriptor's annotation "the directory it was opened on" where a unit clones a socket file                                                                                                                                    | Fixed: the comments in `confinement-audit.js` and Decision 27 name the right flags, and the annotation is "the file or directory it was opened on"                                                                                                                                                |
| 7   | Low (writing rule): the I/O matrix row "Late socket through a link" carried a negation clause after the listed target                                                                                                                                                                                                                                                                        | Fixed: "the socket file the link leads to is listed"                                                                                                                                                                                                                                              |

The two Linux cases stay carried by the ubuntu CI job: no container and no strace ran on this host in this round, and both ran green there at an earlier head (`aee11350`, chain 4/12).
