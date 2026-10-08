---
title: Why Evaluate Confines the Target
description: Why Evaluate runs the target of an evaluation under file-system confinement, and how the runtime keeps your repository, the evaluation folder and the evidence apart from the code it measures
---

# Why Evaluate Confines the Target

An evaluation runs code you want to measure: a skill, an agent, a tool server, an HTTP service.
That code is the system under test, and the runtime trusts none of it.
It can read files, write files, start processes and open connections, and an evaluation is only worth having when what it did is recorded honestly.
A disposable workspace alone leaves the rest of the machine open to the process that runs in it.
So Evaluate runs every process of a target under file-system confinement, and audits through the same mechanism what the target opens.

What you configure (the host requirements, the opt-out, the `egress` and `systemPaths` fields of a registry entry, the private home and the login of an agent) is in the [tea-evaluate CLI reference](/docs/reference/tea-evaluate-cli.md#file-system-confinement).
How the parts of Evaluate fit together is in [How Evaluate Works](/docs/explanation/how-evaluate-works.md).
This page explains why the confinement exists and how the runtime builds it.

## What confinement keeps apart

Four things stay apart in every run.

- The target and your repository: the target works in a disposable checkout and can write nothing outside it, so an evaluation leaves your working tree, your branches and your hooks as they were.
- The target and the evaluation folder: the contract, the probes, the mutations and the evaluator are closed to it, so it cannot read the test it is taking or learn which defect a mutation plants.
- The target and the evidence: the run directory, the scores and the baseline are written by the runtime and checked before anything reads them.
- The target and your machine: the places it may use beyond its workspace are a short list you configure, and every other place it opens is recorded.

Seatbelt on macOS and Bubblewrap on Linux supply the confinement.
The audit reads through the same mechanism, because a confinement that cannot be observed would turn an empty list of observed mounts into false evidence.
A host that cannot confine or cannot observe stops the command with exit 12 and names the reason.

## The target's view of your repository

A confined target works in a checkout of your project, and the git inside that checkout has to behave as it does in your repository.
The runtime therefore builds a private repository beside each workspace and withholds your git directory.
These are the rules it follows.

Each tree your history holds at the evaluation folder's path is replaced by the empty tree (a `refs/replace/` entry), so `git show` and `git cat-file` find no committed file of the folder at the evaluated commit, at an older one or by a blob id read from `git log --raw`, `git --no-replace-objects` finds no folder object, and `git status`, `git log`, `git diff` and `git show HEAD:<path>` work over the rest of the tree and list no deletion.
A file outside the folder that holds a folder file's bytes stays readable, and so does a directory outside the folder with the same content as one inside it, since those bytes are readable at that other path.
The object directories your git directory borrows from (`objects/info/alternates`) are withheld the same way.
The runtime packs the history for the first workspace of a confined run and links its objects into each later workspace for the same commit and tags, so a large history costs time at the start of the run, and a step of the build that fails exits 12 and removes the workspace.
The build writes nothing into your repository's object store: git prints the pack and the private repository indexes it on the temp directory's own filesystem, so a project and a temp directory on different filesystems (a host whose `/tmp` is a tmpfs) work, and your `objects/pack` gets no file, even for a moment.
It reads every walk that grows with the history as a stream, so no buffer bounds the size of a history it builds, and each step has a limit of 10 minutes.

The private repository carries your local `core.autocrlf`, `core.eol`, `core.safecrlf`, `core.filemode`, `core.ignorecase`, `core.symlinks`, `core.precomposeunicode`, `core.trustctime` and `core.checkstat`, and your `info/exclude` and `info/attributes`, so the target's `git status` reads the tree as yours does; it carries no remote, URL, credential or hook.
The target's git carries the project's tracked filter drivers (`filter.<name>.clean`, `.smudge`, `.process` and `.required`, a driver whose name holds a space and a `required` written with no value included), and a `core.` setting from the list above written with no value reads as true, so a file a driver filters reads as unmodified in the target's `git status`, as it does in yours.
A project that uses sparse checkout (`git sparse-checkout set` in cone mode or with a pattern list, a sparse index, and a clone made with `--sparse`) shows the target the project's status: the worktree keeps the cone it inherited from your project, the private repository carries `core.sparseCheckout`, `core.sparseCheckoutCone` and, when your worktree keeps a sparse index, `index.sparse`, and the index marks every tracked file outside the cone as skip-worktree.
The target's `git status` lists no deletion, `git ls-files` lists the files outside the cone, and `git sparse-checkout list` prints your patterns.
The long form of `git status` reports the sparse checkout as it does in your project, a sparse index included.
A project that is not sparse keeps the index it has, and the target cannot change the cone, since that writes the private repository.
The runtime removes the `config.worktree` that `git worktree add` copies into the worktree's metadata directory, since it can hold the worktree-scoped remotes, URLs and credential helpers of your project, and the private repository does not read it.

## Call directories

Every call a confined target makes gets temporary directories of its own.
They live beneath the run's private parent, so a run that is killed outright leaves them where the next run finds and reclaims them.

Each call directory the runtime hands a confined target is made beneath the run's private parent: the call's temp directory (`tea-evaluate-target-tmp-<random>`, which `TMPDIR`, `TMP` and `TEMP` name), a started service's port directory (`tea-evaluate-port-<random>`, which holds the file the service reports its port in) and its bridge directory (`tea-nb-<random>`, which holds the bridge's socket).
Under Bubblewrap the sandbox empties the private root, so each call directory is bound writable at `/dev/<name>`, a path the sandbox keeps, and the call's environment, the port file's path and the status shim's bridge path name it there, while the runtime reads and connects through the directory's own path.
Under Seatbelt the profile allows each call directory again beneath the denied root, as it does the home.
The audit lists none of them as an observed mount.
The end of the call, its failure and a signal that ends the run remove each call directory, and a run killed outright leaves them to the next run over the evaluation, which reclaims them with the dead run's private parent and names that parent in its output, so a killed run leaves no call directory in the system's temp directory.
The probe a confined run makes while it checks that the audit works lives in the private root too (`observer-probe-<pid>-<random>`), so no call directory and no probe of a killed run stays in the system's temp directory.
The next preflight removes the probe directory of a dead process and names it in its output, and it leaves an entry that is a link, a file, a directory with another mode or owner, or the directory of a live process.

## What the audit watches

The audit is what turns confinement into evidence.
It lists every path a trial's processes opened outside what they were granted, and `score` exits 3 when that list is not empty.
`run` exits 3 with the same paths once its trials are sealed, and `preflight` exits 3 for a path every one of its legs opened, so a setup `score` would refuse stops before a full run.
The reference lists what the audit reports and how to grant a path; these are the mechanisms behind it, and what each mechanism can miss.

On macOS the Seatbelt profile reports each read it allows outside the grants and tags each refusal with a token of the sandbox (git's own index lock excepted), and a `/usr/bin/log stream` child the runtime owns writes the kernel's reports of that token to a file.
On Linux the runtime runs the Bubblewrap command under `strace -f --seccomp-bpf --decode-pids=pidns`, started outside the namespace, and reads the trace when the call ends, which ends every process the call left running; `--seccomp-bpf` stops a process only at the file syscalls, `connect`, `sendto`, `sendmsg` and `sendmmsg` (each with an address or without one), `bind` and the mount calls, so a process that makes few of them runs at about its untraced speed.
Both files sit beneath the run's private parent, which every target withholds, and no code runs inside the target, so no target can read, rewrite or truncate what the runtime reads of the audit.
On Linux the `strace` process belongs to the runtime and a target cannot signal it.
On macOS a same-user target can signal the runtime itself, its `log stream` child and the canary processes, since the target's Seatbelt profile has no signal rule: a killed stream exits 12, a stopped stream leaves the trial `lossy` or exits 12 at the barrier, and a killed or stopped canary, a canary the host cannot start and a runtime stopped for more than 200 ms each leave the trial `lossy`.

On Linux the audit also lists a connection, or a datagram sent, to a Unix socket file outside the workspace, the private directories and the home of the call (the bridge's directory among them), the sandbox's own `/dev` and `/run/user` and the egress proxy's directory, by the socket file's real path (`connect`, `sendto`, `sendmsg` and `sendmmsg` are traced for it).
A socket a host process bound after the call started is therefore an observed mount once a target process connects to it, and `score` exits 3.
A link the target makes (a symbolic link, a hard link to one, a link in a directory it later renames, one made through a link to a directory, or one in the sandbox's own `/dev`) leads where it led when the connection was made, even after the target removes it.
A `..` after a link in the path of a connection goes to the parent of the directory the link leads to, and a link the target removes, renames or replaces afterwards lists the connection by the path as given.
A connection through a path the target removes, renames or replaces afterwards, or whose directory it does, is listed by the path as given, since your project may have held a link there that the host can no longer read; a socket the call bound itself is not listed for that while its name has stood since the bind.
A bind mount whose source lies outside those places is listed by its source, whatever the source holds (a target that makes a user namespace of its own where the host allows one can mount in it).
A target that runs a nested sandbox which bind-mounts system paths, `/usr` or `/etc/resolv.conf` for example, is listed for them and `score` exits 3.
A connection through the destination of a bind mount is judged by the source it leads to, and a source the target removes after the mount is listed as given.
A `sendmmsg` that the end of the call interrupted while it waited prints none of its messages, so a datagram it had delivered before it waited is not listed.
The audit lists a connection the kernel did not refuse: one that succeeded, one that found the listener's queue full (`EAGAIN`), one a signal interrupted and one still waiting when the call ended.
A connection the kernel refused is not listed: a socket the mounts cover (`ECONNREFUSED`), a path that does not exist, a file that is no socket and a socket file the process may not open.
An abstract socket, a TCP or UDP address, any other socket family and the service the runtime reaches through the bridge add nothing.

On Linux the tracer fails `io_uring_setup` with `ENOSYS`, the answer of a kernel without `io_uring`, so no target holds a ring through which a file access or a connection could go unseen, and on macOS the audit does not see a process that reads after the trial's last read of the log.
On Linux a binary is judged by the path it was started by, and a link in the workspace that leads to a binary outside the grants is not followed.
An exec or link read through a process's own links under `/proc` or `/dev` (its root, working directory, a descriptor or a mapped file, with or without a `..`, and an exec of a descriptor itself) is listed, since the path leads anywhere the process can reach.
On macOS the kernel's reports are lossy: the log lost none of 3,000 reports at a quiet host's 440 a second, one to five of 1,600 on a host saturated by other work, and 7 to 20 percent of a burst of 40,000 a second, each without a trace.
A target that reads one ungranted file while the host is saturated can therefore be missed, and an empty `observedMounts` from a macOS run means that no report arrived; in every measured burst most reports arrived.
Linux's trace holds every traced syscall of the call.
To tell a complete macOS audit from a lossy one, each trial's audit reads a file beneath its own directory, one no target may open, through the sandbox's own token every 50 ms while the trial runs and once more when it ends (a canary read), and counts the canaries the log delivered against the canaries sent.
A canary counts as sent when the audit attempts it, before its file is written or its process started, so a canary that a target killed or stopped, one the host could not start and one skipped while eight were already running count as undelivered.
A gap of more than 200 ms between two attempts (from the start of sampling to the first canary, between canaries, from the last canary to the end of the trial) counts the canaries the 50 ms cadence called for in that time as sent and undelivered, so a runtime a target froze records the loss.
A target can only make the trial lossy; a final canary that cannot start exits 12.

A canary samples the log, and the log drops a report without a trace that no canary needs to meet: it drops reports that reach it faster than it keeps them, whoever reads the stream, and the drop can fall between two canaries.
On the macOS host these were measured on, a burst of 8 to 31 reports inside a millisecond lost nothing in 130 runs and a steady 5,000 reports a second lost nothing in 2,400, while 19 of 150 runs of 32 or more inside a millisecond lost reports and a steady 10,000 a second lost 0.5 percent, each with every canary delivered and no loss event.
So a second `log stream`, which only the runtime holds, counts every sandbox report on the machine by the log's own microsecond timestamps, whichever sandbox made it: the trial's, another trial's, another program's.
A trial during which 16 reports arrived inside a millisecond or 250 inside 100 ms is `lossy`, and so is one whose counter ended or could not confirm it had counted the trial's last report.
The limits sit below the first measured losses, and a host's own traffic is a few reports a second.

`run.json`'s `observedMountsChannel` lists each audited trial of the sealed trial sets with its `conditionArm`, `trialIndex`, `canariesSent`, `canariesDelivered`, `logReportedLoss`, `logOverloaded` and `completeness`: `lossy` when the log delivered fewer canaries than were sent, itself reported lost events or was handed reports faster than it keeps them (`logOverloaded`), and `complete` otherwise.
The summary line of `run` names every `lossy` trial with the canaries lost out of the canaries sent, and a `lossy` trial's observed mounts may be missing a read.
`complete` means the log delivered every canary the audit sent and the host never handed the log reports faster than it keeps them.
The canaries sample the log every 50 ms, so on a saturated host a single report of the target can still drop between two canaries, and a trial of a few seconds sends too few canaries to catch every loss at the measured rates; the rate counter is what marks such a trial `lossy`.
The counter does not cover every loss: on a quiet host the log has also been seen to drop a single read of a Node process in a window of a second or two, with no flood, no loss event and every canary delivered. `complete` makes a missing read unlikely and does not rule it out.
Every Linux trial records `complete` with no canary sent, since `strace` reports every traced syscall of the call.
A trial that launched nothing (a gameability arm), every trial of a run that opted out and the evaluator qualification attempts of a sealed-brief agent have no entry, and a `records` run has no trials to list.
A run whose observer fails (the log stream ended, or a read the runtime made did not come back through it, or the log reported lost events and the trial listed no read, or the trace of a call holds no start of its target) leaves the trial with no record and exits 12.

## Host services

The services your machine runs for you, such as the container engine or a key agent, are closed to a confined target.
A call to one is refused: under Bubblewrap the runtime masks each of them when a call starts and the call answers `ECONNREFUSED`, and under Seatbelt the profile answers `EPERM`.
The audit lists only a connection the kernel did not refuse, so a refused call leaves no entry.
macOS Seatbelt has no abstract sockets, it accepts `egress` and ignores it, and its Mach services are a separate channel the profile does not close.
These are the details of the masking under Bubblewrap.

The runtime reads the kernel's table of bound Unix sockets (`/proc/net/unix`) and walks those directories one level down for each call, so a socket a host process binds after the call started stays reachable for that call, and so does one bound in another network namespace outside those directories, one whose path holds a line break in a directory the runtime does not walk, one whose file name is no UTF-8, and a second path to the same socket file through a hard link or another mount; the audit lists a connection to any of them as an observed mount.
A call hides at most as many sockets as its Bubblewrap command leaves room for, and at most 2,000 in any case, since Bubblewrap takes 9,000 arguments for the command line (the target's own arguments included) and the mounts together, and the runtime reads at most 2,000 directories of each scanned directory.
The list is ranked by who can create a socket before it is cut: the Docker, containerd, Podman, system bus and systemd sockets by name first, then the sockets of root and of the system accounts, then those of the user running the call, then every other user's in turns (the first socket of each owner, then the second of each), so a local user who makes sockets in bulk cannot push out another user's socket while the room left after those holds one socket for each owner, and a socket in `/dev` or `/proc` takes no room since the vector replaces both.
The socket files beside a path a process moved after it bound (OpenSSH's control master does this) join the list in that same order of owners: the directories are read by who owns them, each socket is charged to its own owner, and one other user's socket files stop joining once that user holds the whole room, so one user's directory of socket files cannot push out the moved socket of root, of a system account, of the user running the call or of a third user, whichever directory the kernel's table names first.
The bound that remains: the socket files of one other user beside a moved path past the room stay reachable and are counted in `socketsLeftReachable`.
The launcher that hands Bubblewrap the mounts is a Node program the runtime starts outside the sandbox, ahead of `strace`, and no shell stands between the runtime and Bubblewrap.

The evaluation layer's processes (a `command` evaluator, a sealed-brief agent and the bridge relay it starts, the rubric judge and the evaluation's HTTP port) cannot connect to a path-based Unix socket of the host: under Bubblewrap `/var/run/docker.sock`, the system bus at `/run/dbus/system_bus_socket`, an agent socket under `/tmp` and every other socket file the runtime lists for a target's call answer `ECONNREFUSED`, since each start of a layer process mounts an empty device file over each one.
The socket the runtime serves a layer process stays connectable: the bridge a sealed-brief agent's relay connects to, beneath the user's private root `/tmp/tea-evaluate-p<uid>`.
A socket another process moves into the private root is another file, and a layer process that moves a host socket there cannot connect to it; a Bubblewrap layer process sees the root read-only and its own run's private parent writable, so it cannot write a record of the runtime's.
Each mount over a socket follows a bind of the socket's own path onto itself, since the layer's `/` is a writable bind of the host's and a mount over a path that went away makes Bubblewrap create an empty file there: a socket that went away before Bubblewrap starts stops the start and makes no file, and every start lists the sockets again.
A socket its owner removes while Bubblewrap mounts it, between Bubblewrap's check of every bind source and the mask's mount, can leave an empty file and its directory chain at that path for as long as the layer process runs, and the file is no route to anything.
The runtime removes the file and the directories Bubblewrap made when the process has ended, and the next run removes them for a run that was killed before it could, and it removes nothing else: a path that stood before the process started, a socket the owner made again, a file with content, a file with a write bit or another owner, and a directory with an entry stay.
A socket a process binds after a layer process started stays reachable under Bubblewrap, one the layer's own processes bind included, and a start whose list does not fit the room its command leaves (six arguments for each socket, with 1,000 held back for the command) is refused, since the layer has no record that could name a socket left reachable.
A macOS Seatbelt process of the layer cannot connect to a path-based Unix socket outside the bridge's directory either: `/var/run/docker.sock`, Docker Desktop's `~/.docker/run/docker.sock`, the socket `SSH_AUTH_SOCK` names and every other socket file answer `EPERM`, one bound after the process started included, while the resolver `/var/run/mDNSResponder` and the log socket `/var/run/syslog` stay connectable.
The profile also refuses every write to the private root, to each entry directly in it and to any path of the bridge's shape, so a layer process cannot rename a host directory that holds a socket to a path the connect rule allows, and cannot write a record that the runtime's recovery reads.
A layer process on macOS that serves a Unix socket outside the bridge's directory cannot connect to it; a loopback port is its route to a service of its own.

## The bridge's admission token

A sealed-brief agent acts on the target through a bridge the runtime runs, and the bridge admits one connection.
The token that admits it has to stay out of the target's reach, and the reason it does is the confinement.

The bridge admits one connection, presenting a token its relay process reads from a file.
The token exists in that file alone: the relay's environment and argument list carry the file's path, since another process of your user can read a process's environment.
The token file, the configuration file that names it and the bridge's socket are private files and sit with the other private directories of the evaluation layer: the working directories of a sealed-brief agent, a `command` evaluator and the rubric judge, and the staging directories of the engine, the qualification and `score`.
A run makes one private parent directory when it starts, before any target runs, and makes each of those beneath it.
Every run of your user makes its parent beneath one private root, `/tmp/tea-evaluate-p<uid>` (mode 700, a directory you own that is not a link), whatever the run's `TMPDIR` is; a root that is a link or belongs to another user stops the run with exit 12.
On Windows, which has no confinement, the root is in the temp directory.
A run removes its own parent when it ends, an interrupting signal included; the root stays, since another run may be using it.
A later preflight reclaims a verified dead run's parent after `SIGKILL`, using the ownership record described in [The workspace](/docs/reference/tea-evaluate-cli.md#the-workspace).

The confinement withholds the run's private directories from every target and every process a target leaves running, those started before a directory was made included, so the token is unreadable to a confined target, which can neither take the bridge's one admission nor read an evaluator's or a judge's working files.
It withholds the root, so a process left running by an earlier run, or a target of a run in progress elsewhere, cannot reach the parent of a run made after its sandbox was built, whatever temp directory either run uses.
Seatbelt denies each read and write under the root and each connection to a unix socket under it (`EPERM`), Bubblewrap covers it with an empty read-only file system, and the audit reports a process that opens it.
The agent's own connection and every process of the evaluation layer keep their access, since those processes are not confined as a target is.
The directories a target is granted beneath the root (its temp directory, a started service's port and bridge directories, its home and the status file) are granted again at paths the sandbox keeps, and its workspace is not under the root.
A run with `"confinement": false` leaves the private directories as readable to its targets as any other directory of the host.

## The run directory

The run directory holds the evidence of an invocation, and a target can reach `runs/<invocationId>/` from inside its workspace in a run that opted out of confinement.
The runtime therefore guards every write and read it makes there, and holds each directory it made.

`runs/` must be a directory and `runs/.gitignore` a file, and a link at either is refused.
The run directory is created afresh, and every directory in it is created by the runtime, recorded by device and inode, and held open until the command ends.
A held directory keeps its inode even after it is removed, so no directory made later can take its number, which some file systems (Linux's ext4 and overlayfs among them) otherwise hand to the next directory made.
Each file is written from inside its recorded directory, as a new file created without following a link.
Before and after each write the runtime confirms the directory is the one it made at the place it made it: the same device and inode, and the same path the system reports for it.
So an entry a target planted where the runtime writes stops the command with exit 12, and so does a directory the target replaced, swapped for a link, or moved elsewhere (into your project, say) with a link left in its place; the write does not go through it.
A file written while its directory was being moved is removed again before the command stops, and a removal that fails is named in the exit message.
`run.json`, the one file rewritten, is replaced by renaming a new file over it.
An engine stage writes its output into a private temp directory made for the call, whose file its record's argv shows as `<staging>/<file name>`, and the runtime copies the output in.
The runtime keeps the digest of every file it writes and reads a file back only when its bytes are the ones it wrote, opening it without blocking, so a FIFO swapped in for a file is refused at once.
Before the preflight verdict, and for `run` again after the trials and before `run.json` says completed, the run directory must hold exactly the entries the runtime wrote, each file with the bytes it wrote; an entry it did not write, one that is gone or changed kind, or a file with other bytes exits 12.

## Score integrity

`score` and the sealed-brief agent's qualification run `eval-quality score` as a child process, and the result decides a verdict.
Two protections keep that result honest.
The runtime writes only into directories it made and holds, and it re-reads every input a score depends on and refuses a result that the held bytes do not reproduce.
The user reference lists when `score` exits 12; these are the checks.

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
Each probe's `score.json` records the argv as it ran, with the evaluation folder's files by their path below it and the staging file as `<staging>/evidence-artifact.json`, so rerunning `eval-quality score` by hand on that argv from the evaluation folder with a fresh `--out` gives byte-identical evidence.

### Score input integrity

`score` reads every input of the run once, as a regular file without following a link, digests the bytes with eval-quality's `digestBytes`, compares the digest with the one `run.json` recorded, and keeps those bytes in memory until the command ends.
The inputs are the compiled contract, the preflight verdict, the evaluator configuration, the scoring policy, and each set's probe, records and isolation manifest.
The checks above parse the held bytes, and `partitions.json`, `gap-view.json` and `interpretation.json` are built from them, so nothing a process writes to the run directory after the check reaches a view.
A manifest the check found absent is passed to eval-quality as absent whatever appears there later.
The protection starts when `score` reads the inputs: a file rewritten together with its digest in `run.json` before `score` starts verifies as the run's own, and only confinement keeps a target from writing the run directory at all (see [File-system confinement](/docs/reference/tea-evaluate-cli.md#file-system-confinement)).

Two checks follow every `eval-quality score` call, before anything is copied:

- `score` reads every input again and digests it.
  A file that changed, stopped being a regular file or appeared where the check found none exits 12 naming the file, so a rewrite that eval-quality read and a process kept is refused.
- `score` scores the held bytes in process with eval-quality's library the way the CLI scores a probe and compares the call with what the CLI does with those bytes.
  The staged artifact must equal the result serialized with the library's `serializeArtifact` byte for byte, and a call that stages no artifact must match a result with no artifact, whatever it exited.
  The call's exit must be the one the held bytes give: the ladder's exit for a result, 4 for a structural failure, 5 for a runtime fault, 64 for a private-storage manifest reference.
  The `eval-quality:` lines on the call's stderr must be the ones the result would print (the qualification failures and, for an Invalid result, its basis, which is how an exit 3 gets its reason); when the library refuses the held bytes, only the exit is compared, since the CLI renders that error itself.
  A rewrite that eval-quality read and a process then restored, a well-formed artifact with altered outcomes or the same artifact in other bytes, an artifact removed or staged afresh, and an exit or reason that does not follow from the held bytes, exit 12 naming the mismatch.

The aggregate call (see [Run-wide strength aggregate](/docs/reference/tea-evaluate-cli.md#run-wide-strength-aggregate)) is held to the same inputs.
After it, `score` reads every input again (the run's policy among them), reads the persisted evidence artifacts back through the held directory and compares them with the bytes it copied, and exits 12 naming the file that changed, without copying the aggregate.
It then aggregates the held bytes in process with eval-quality's `aggregateStrength` (the evidence files, the floors copy and the held policy, each read through the engine's lexical scanner as the CLI reads them) and requires the staged aggregate to equal the serialized result byte for byte and the call's exit to be the one the held bytes give (0 for an aggregate, 4 for a refused set, 5 for a fault in an input).
A policy rewritten for the aggregate's read and put back is caught here, because the engine refuses an evidence set whose recorded policy digest it does not name; an aggregate substituted for the staged one is caught by the byte comparison; a call that leaves no aggregate where the held bytes give one is caught by the exit.
The aggregate's diagnostic text is the CLI's own rendering of an error and is not compared.

Neither check supplies a verdict, an exit code or an artifact: the re-score compares and refuses, and the eval-quality CLI still decides every enforced verdict.
The comparison covers the artifact, the exit and the `eval-quality:` stderr lines, the three things `score` copies or classifies from; the call's stdout and its other stderr text are recorded as they came and are not compared.
A refused call copies no evidence; its reason is on the probe's entry in the invocation's `score.json`, the other probes still run, and `score` exits 12.
The recorded argv names the run directory's own files, so rerunning `eval-quality score` by hand on it with a fresh `--out` reproduces the persisted evidence byte for byte on a run no process changed.

`run` holds the call it makes for each attempt of a sealed-brief agent evaluator's qualification (see [Qualifying a sealed-brief agent](/docs/reference/tea-evaluate-cli.md#qualifying-a-sealed-brief-agent)) the same way, since the attempt's votes decide whether the evaluator qualifies.
Before the call, `run` reads the attempt's inputs once through the run directory writer: the compiled contract, the preflight verdict, the evaluator configuration, the scoring policy, the probe, the attempt's record and its isolation manifest.
The writer hands back only the bytes the runtime wrote, held to the digest it took when it wrote them, so a file that is not those bytes, is a link or is gone exits 12 naming the file before any call is made.
After the call, `run` reads every input again through the writer and compares the call with the in-process score of the held bytes, with the comparison `score` makes: the first input that changed is named, the staged artifact must equal the serialized result byte for byte, the call's exit must be the one the held bytes give, and its `eval-quality:` lines must be the ones the result would print.
A rewrite that stays, a rewrite put back before the check, a well-formed artifact with altered votes, the same artifact in other bytes, an artifact removed or staged afresh, and an exit or reason that does not follow from the held bytes exit 12 with no vote recorded for the call, no `evidence-artifact.json` under the attempt's directory and no `evaluator-qualification.json`.
The staged bytes the comparison accepted are the bytes copied into the run directory and read for the vote.
The comparison supplies no vote, exit or artifact, and the recorded argv of each attempt, run by hand with a fresh `--out`, reproduces the attempt's evidence byte for byte.

## How the skill runner supervises its agent

`tea-skill-runner` runs one headless agent turn and has to report how it ended, whatever the agent does.
It cannot trust the agent to end its own children, to answer a signal or to stay in one process.
These are the rules its supervision follows, and the reserves a registry entry's `maxElapsedMs` has to leave for them.

On POSIX, the agent runs in its own process group.
When the agent exits, every process left in that group receives `SIGKILL` at once.
The group is also stopped when `--timeout-ms` runs out, when the runner's process group receives `SIGINT`, `SIGTERM`, `SIGHUP` or `SIGQUIT` (a terminal's Ctrl-C or `Ctrl-\` included), and when the runner or the supervisor process between it and the agent dies, by `SIGKILL` included.
Stopping sends the group the signal received (`SIGTERM` for a timeout or a death), and the group `SIGKILL` 2 s later if it is still running.
An agent the `SIGKILL` ends is reported as killed by `SIGKILL` once it outlived the grace period after the signal that asked it to stop; a `SIGQUIT` can end that way wherever the system hands core files to a collector, since writing the core can take longer than the grace period.
A Ctrl-Z suspends the runner, and the agent runs on, bounded by `--timeout-ms` and the runner's end.
Once resumed, the runner reports how the agent ended, however long it was suspended.
On POSIX, four processes supervise the agent: one in the runner's process group, a leader in a session of its own, a guardian that leads the agent's process group, and a detached watchdog.
The guardian's lifeline closes even if the supervisor and leader receive `SIGKILL` together; it then stops its group.
While the runner remains active, a missing-report transport failure is bounded by a 25 s startup reserve, the agent's `--timeout-ms` wall clock, and 7 s for supervisor backstop and output drain.
On POSIX, a detached watchdog owns the guardian's group through a leader-only pipe.
It confirms readiness before the guardian starts the agent.
If the leader dies, the pipe closes and the watchdog sends `SIGKILL` to the group, even while the guardian is stopped.
After a normal agent exit, the leader kills the group and releases the watchdog.
The process integration gate requires the guardian, agent, and ordinary child to end within 10 s of a simultaneous leader and supervisor kill.
The guardian allows 10 s for watchdog setup, and the agent's `--timeout-ms` wall clock starts when its PID is reported.
If the watchdog cannot arm, the agent does not start and the runner reports a setup failure.
The agent's standard input, output and error are pipes the group leader owns, and the leader copies the runner's input to the agent and the agent's output to the runner.
Once the agent exits, the leader copies what those pipes still hold and closes each one when it reaches its end, stays empty for 100 ms, or has been read for 2 s of the time the runner keeps up with it; output any process writes after that is lost.
A process that leaves the group, such as a daemon that starts its own session, keeps running, and the runner does not wait for it.
If the group leader has not ended 5 s after `--timeout-ms` runs out (it was stopped with `SIGSTOP`, say), the other kills it and the agent's group, and the runner exits 4.
On Windows, a PowerShell helper creates a Windows Job Object with kill-on-close ownership and assigns the guardian before the agent starts.
The guardian launches the helper from the host's absolute SystemRoot path, so a project-local `powershell.exe` cannot claim readiness.
The agent and its ordinary descendants inherit that job.
The helper holds its sole job handle until the guardian closes their pipe after the agent exits, or the pipe closes when the guardian dies.
Closing the handle stops every process in the job.
The guardian allows 90 s for setup.
The supervisor has a 105 s startup backstop measured from its own start, covering cold Node startup before the guardian's timer begins.
If the helper cannot establish ownership, the agent does not start and the runner exits 4 with the setup failure.
The leader reports its guardian PID, agent readiness, and completion to the supervisor over a dedicated pipe with a 2 s write bound; a failed report stops the guardian.
The `--timeout-ms` wall clock starts when the guardian reports the actual agent PID; the supervisor's 5 s agent backstop follows that clock.
The Windows process integration gate requires the direct agent and its child to end within 10 s of normal agent exit or a dual leader and supervisor kill.
