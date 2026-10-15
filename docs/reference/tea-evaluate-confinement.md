---
title: 'tea-evaluate Confinement'
description: 'How tea-evaluate confines each target on macOS and Linux: what a confined process can read, write and reach, the audit, egress and subscription logins'
---

# tea-evaluate Confinement

This page holds the confinement detail behind `preflight` and `run`.
The [platform checklist](/docs/reference/tea-evaluate-cli.md#platform-checklist) in the [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md) reference lists what a host needs before the first live command, and [Why Evaluate Confines the Target](/docs/explanation/why-evaluate-confines-the-target.md) explains how the runtime builds the confinement.

## File-system confinement

`preflight` and `run` confine every process they start, before any of them starts, through the mechanism the host provides:

- macOS: Seatbelt, through `/usr/bin/sandbox-exec` and a profile the runtime generates for each call.
- Linux: Bubblewrap, through `bwrap` on `PATH` (`apt-get install bubblewrap`), in an unprivileged user namespace with a read-only view of `/`, a process-id namespace and procfs of its own, a network namespace of its own, an empty `/run/user`, and an empty device file over each path-based Unix socket the host serves.
  What a target leaves running ends with it, and killing the `bwrap` the runtime started ends what that process forked.

Each mechanism also needs the observer its audit reads (see below): on macOS the kernel's sandbox reports through `/usr/bin/log stream`, which needs a session that may read the unified log; on Linux `strace` (`apt-get install strace`, version 6.1, which the design was verified against, or a later one that supports `--seccomp-bpf` and `--decode-pids=pidns`), which needs ptrace.

The runtime first confines a trivial process through the mechanism, since a host can carry the executable and still refuse it (a kernel that forbids unprivileged user namespaces, or a container that forbids creating a network namespace).
It then confirms the observer the same way: on macOS a sandboxed read of a probe file must come back through the log within five seconds, and on Linux a traced Bubblewrap run of a trivial reader must report the file it read.
A host with neither mechanism, one whose mechanism refuses, or one whose observer cannot confirm itself stops the command with exit 12 and names the reason, since an audit that cannot see would report an empty list of observed mounts as evidence.
`sandbox-exec` cannot apply a profile inside a Seatbelt sandbox that restricts anything, so a `tea-evaluate` started from a sandboxed shell (an agent's tool, say) is refused on macOS; run it from an unsandboxed terminal.
A temp directory (`TMPDIR`) inside the evaluation folder, or an evaluation folder or temp directory whose path holds a quote, a backslash or a line break (or another control character), is refused the same way, since no profile can carry it.
Set `"confinement": false` in `evaluation.json` to run the targets unconfined instead; `run.json` then records `"confinement": "opt-out"`, and a confined run records `"seatbelt"` or `"bubblewrap"`.
Opting out removes every limit this page describes, and the [CLI reference](/docs/reference/tea-evaluate-cli.md#file-system-confinement) lists what that means for your host.

Each target runs confined, and so does every process it starts, one still running after the target exits, one started with `setsid` and one left behind by a killed target included.
A confined process:

- writes its workspace's checkout and nothing else, apart from the private directories the runtime hands it (the file a started HTTP service reports its port in, a temp directory of its own for each call, which `TMPDIR`, `TMP` and `TEMP` name and which is removed when the call ends, and one private home directory for the trial, described below);
- can neither read nor write anything under the evaluation folder: `contract.json`, `probes/`, `mutations/`, `corpus/`, `evaluator/`, `runs/` and the rest; Seatbelt answers `EPERM`, and Bubblewrap covers the folder with an empty read-only file system, so a read answers `ENOENT` and a write `EROFS`;
- can neither read, write nor connect to a unix socket under the user's private root directory, apart from the call directories and the home it is handed (described below), beneath which every run's private parent holds the evaluation layer's private directories: the bridge's configuration, token file and socket, and the working directories of an evaluator and the judge (see [The bridge's admission token](/docs/explanation/why-evaluate-confines-the-target.md#the-bridges-admission-token)); Seatbelt answers `EPERM`, and Bubblewrap covers the directory with an empty read-only file system;
- reads its workspace, private call directories, home, system runtime roots and declared `systemPaths`.
  On macOS, Seatbelt refuses file data outside these grants with `EPERM`, including a link inside the workspace that leads to an ungranted host file.
  The kernel enforces this boundary even when its audit log drops a diagnostic record.
  Linux continues to trace host reads and judge them through the isolation manifest.
  The project's git directory is withheld except for its own worktree entry: Seatbelt answers `EPERM`, and Bubblewrap covers the git directory with an empty file system, the entry bound back in read-only.
  The target's git sees the evaluated commit's full history with the evaluation folder as an empty tree, and the project's git directory is withheld: the runtime builds a private repository for each worktree beside its checkout, outside what the target may write, with every commit, tree and blob your repository holds for the evaluated commit's history, every commit id as your repository has it, except the objects reachable only through the evaluation folder.

  A project cloned with a promisor remote (`--filter=blob:none`, `--filter=tree:0` and the like) runs confined: the private repository holds the objects your clone holds on disk, and no process of a confined run fetches from the remote.
  The runtime asks git not to fetch lazily, which git 2.44 and later honors; an older git makes a partial-clone project exit 12, with the way out named.
  A historical probe's checkout of a revision whose objects your clone lacks on disk exits 12 and names the revision, since a confined run fetches nothing; check the revision out once in your clone, or set `"confinement": false`.
  A command in the target that needs an object your clone lacks, such as `git log -p` across a commit whose blobs you never fetched, ends with git's own missing-object error.
  The target's git lists the tags of your project that point into the evaluated commit's history, lightweight and annotated, with their annotations, so `git tag -l`, `git describe --tags` and a build that reads a tag work.
  The target's worktree is on a detached `HEAD`, as it is in a run that opted out, and your branches are not carried.

  Two limits apply.
  The withheld path is the evaluation folder's current path, so a folder that moved stays readable in the history at its old path.
  A directory outside the folder whose tree is identical to a tree of the folder reads as empty.
  A target that must read the project's git directory opts out;

- cannot change its worktree's git state: `git add`, `git commit`, `git stash` and `git checkout -b` write the index, objects and refs of the private repository and the worktree's entry in your git directory, outside the workspace, and fail; a target that must commit opts out;
- cannot start a setuid program under Seatbelt (`ps` and `sudo` on macOS), which the system refuses to any sandboxed process; `pgrep` lists processes there;
- cannot confine a process of its own through `sandbox-exec`, which applies no profile inside a restricting sandbox.

The runtime builds the target's private repository, hands each call its own directories, audits what a target opens and closes the host's services to it as described in [Why Evaluate Confines the Target](/docs/explanation/why-evaluate-confines-the-target.md).
Each call's temporary directories are removed when the call ends, and the next run over the evaluation reclaims those a killed run left.

An agent CLI keeps its session and settings state under `HOME`, so each confined sandbox gets one private home directory, which the runtime makes beneath the run's private parent (named `tea-evaluate-target-home-<random>`) and removes with the run; a `run` trial removes its own when the trial ends.
The confinement withholds the user's private root as described above and re-grants the one home beneath it, so the target reads and writes its own home and nothing else under the root: no other trial's, stage's or run's home, and no listing of the parent or the root (Bubblewrap's empty file system over the root holds only the path to the home; Seatbelt answers metadata requests for the root and the parent, so a module load, `realpath`, `mkdir -p` and `cd` inside the home resolve, and still refuses to list them).
`HOME` names the home for every confined call, and `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` and `XDG_DATA_HOME` name `.config`, `.cache` and `.local/share` inside it.
These variables replace any host value, including one a registry entry's `environmentKeys` names, so a confined skill or agent target keeps its state without opting out of confinement.
The home is the one directory the target may write beyond its workspace and the call's own directories: your real home and the project stay unwritable, the evaluation folder and the user's private root stay closed to reads and writes, and the runtime refuses a home inside the workspace or the evaluation folder.

Its state lasts across the calls of one trial or arm, so an agent's session continues, and each independent arm or leg starts with an empty home (one that holds the link to the login file an entry's `login` grants and nothing else), a new directory that replaces and removes the old one: the next trial, the baseline, mutated and re-pass arms of a qualification, and each leg of a `preflight`.
Credentials an agent needs reach it through `environmentKeys`, which passes environment values, and through the entry's `login`, which grants a subscription login (see [A subscription login under confinement](#a-subscription-login-under-confinement)); a login an agent stored under your real home is not found under the private home unless the entry declares it.
A run that opts out of confinement keeps the host environment and makes no home.
`tea-skill-runner` hands its agent `HOME` among a short list of variables, so a skill target sees the private home there and the XDG base directories only through `HOME`'s default locations.

Every other process the run starts to run your code or an agent (a `command` evaluator, a sealed-brief agent and the bridge relay it starts, the rubric judge, the evaluation's HTTP port) runs with the evaluation folder read-only, `evaluator/` and `runs/` included, and your project's common git directory (refs, configuration, hooks and `info/`) read-only, with the hooks directory `core.hooksPath` names read-only too when it lies outside the git directory (a repository that uses husky keeps its hooks in `.husky/_`) and the `.git` file of a checkout that is a linked worktree or a submodule, so none of them can plant a hook, change the repository's configuration, move a ref or point your checkout at another repository your next git command reads, and no process of the run can swap a file of the evaluation layer between the runtime's re-read of it and the evaluator's launch (see [The evaluation layer](/docs/reference/tea-evaluate-evaluators.md#the-evaluation-layer)), or rewrite the run's evidence.
An evaluator that writes a cache beside itself under `evaluator/`, or runs `git commit`, `git update-ref` or `git config` in your repository, or writes a file into your hooks directory, fails its write in a confined run; it may write its working directory, your home directory and the rest of the host.
A project in no git repository has no git directory to protect.

Each trial also audits what its targets open, through the mechanism itself and for every process the target starts, whatever its language or environment: a shell script, a Python program, a native binary and a Node process started with an empty environment are seen alike.

The audit records reported paths once, by their real path.
On macOS these include denied read attempts.
On Linux they include successful opens, directory listings and link reads outside what the trial was granted: its workspace, its temp and home directories, the Node installation the runtime runs from, the operating system's own directories (`/System`, `/usr`, `/bin`, `/sbin`, `/dev`, `/etc`, `/lib` and their like, and on macOS the zone data, logging filter and system interpreters' library directories under `/private/var/db/timezone`, `/Library/Preferences/Logging`, `/Library/Perl`, `/Library/Python` and `/Library/Ruby`) and the `systemPaths` of the target's registry entry.
A link in the workspace that leads outside it reports the path it leads to, while a file under the operating system's own directories (`/usr`, `/etc`, `/lib` and their like, not `/proc`) is judged by the path the process asked for, so a system file the operating system links elsewhere (a stub resolver's `/etc/resolv.conf`) is not listed.
A write the mechanism refuses is listed, and so is every access to the evaluation folder, the project's git directory (its worktree's own entry excepted) or your private root directory, refused or not, even under a declared system path.
A read of a path that does not exist and a metadata probe (`stat`, `access`) are not listed.

The execution of a binary reads it, so an ungranted binary is listed like any ungranted file (macOS also lists the directory the shell looked in); declare the toolchain a target runs in `systemPaths`.

`run.json`'s `observedMountsChannel` marks each audited trial `complete` or `lossy`, and the summary line of `run` names every `lossy` trial.
On macOS the kernel's report log can drop a report when sandbox reports reach it faster than it keeps them, from the trial or from anything else on the host, so a `lossy` trial's observed mounts may be missing a read; a trial is `lossy` when the log delivered fewer of the audit's canary reads than were sent, reported lost events, or was handed reports at that rate (`logOverloaded`).
A macOS `complete` entry describes delivered canaries and measured traffic.
A single denial diagnostic can drop in transit.
The kernel continues to refuse ungranted data regardless of dropped diagnostics.
An empty observed list records that no diagnostic arrived.
Every Linux trial is `complete`.
A run whose observer fails exits 12 and leaves the trial with no record.

The trial set's isolation manifest lists the reported paths as `observedMounts`; none is an allowed mount, so `score` exits 3 (Invalid) with eval-quality's isolation violation, one `mount outside allowlist` reason per path.
`preflight` and `run` apply that check themselves: `run` reads the manifests it seals, and `preflight` audits the legs of its pristine workspace and exits 3 for a path every leg opened, which every trial will open too; each exits 3 and names the ungranted paths.
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
A Bubblewrap that fails before it starts the target (a refused bind, say) ends the call as an infrastructure error naming Bubblewrap's message, since no target ran.
A Bubblewrap target, and every process it starts, run in a network namespace of their own with a loopback and nothing else, so the host's abstract Unix sockets, a desktop session's D-Bus among them, do not exist for them.
A host that cannot create the network namespace is refused at selection (exit 12), as one that cannot start Bubblewrap is.
An HTTP service the target starts stays reachable from the runtime through a bridge the runtime owns: the confined process serves a Unix socket in a private directory of the call, and the runtime listens on the address and port the call is configured for and forwards each connection through that socket, with no network path between the namespaces.
A service that reports its port reports the one it bound inside the namespace; the runtime listens on the same number when the host has it free and on a port the system gives otherwise, and the call is configured for the port the runtime listens on.
Under Bubblewrap an isolated started service must listen on `127.0.0.1` or `::1`, and an address the registry authorizes for it that is any other stops the call.
A command target and a tool server have a loopback only and no bridge.
A Bubblewrap target has no network beyond that loopback and the proxy its entry's `egress` gives it, so a target that calls a model provider or an outside HTTPS service lists the host in `egress` on its entry.
Each command, tool-server and HTTP entry that starts a process takes `egress`, one `{ "host", "port", "addresses" }` item for each host and port its processes may reach, and `check` refuses an item eval-quality's `parseProbeTargetPolicy` refuses, a host spelled otherwise than a URL spells it, a host and port listed twice and an HTTP entry that names no server.
`"network"` is no longer a field: `check` refuses an entry that declares it, naming the entry and pointing at `egress`.
An entry that lists `egress` gives each of its calls one route out, a proxy the runtime owns: the runtime serves it on a Unix socket in a private directory of the call, the call's status shim listens on a loopback port of the namespace and connects each connection to that socket, and the target starts with the port in `HTTPS_PROXY` and `https_proxy` and with `NODE_USE_ENV_PROXY=1`, which Node reads.
The proxy tunnels an HTTP `CONNECT` request for a host and port an item lists, decided by eval-quality's `evaluateTarget` as the evaluation's HTTP port's requests are, and answers a request for another host, port or address `403` naming the reason, the host and the entry (a request that is no `CONNECT` gets `405`, a malformed head `400`, a host that does not resolve or cannot be reached `502` and a call past 128 tunnels `503`).
A host no item names is refused before its name is resolved, and the proxy connects to the resolved addresses an item names, the next when one cannot be reached.
The shim announces the proxy in `HTTPS_PROXY` alone and the proxy reads `CONNECT` alone, so a client that opens no `CONNECT` tunnel (a plain `http://` request, a database driver) has no route; a target that needs one sets `"confinement": false`, which removes every limit on this page (see [File-system confinement](/docs/reference/tea-evaluate-cli.md#file-system-confinement) in the CLI reference), and the change that sets it states why.
A tunnel to a listed host and port carries whatever bytes the client sends, TLS or not, so a client that tunnels (`curl -p -x "$HTTPS_PROXY"`) reaches a plain-HTTP gateway on the host's loopback that an item lists.
A connection from a target to the host's loopback, to an abstract Unix socket or to any host without the proxy finds a loopback and nothing else.
A host in a request or an item holds letters, digits, `.`, `-` and `_` and at most 253 bytes, or is an IPv6 address; the proxy answers a longer or otherwise spelled host `400`, and `check` refuses such an item and a wildcard such as `*.example.com`, which no request can match.
An entry that lists no host has no proxy, no proxy variable and no route to any host.
The proxy and its socket are private to the call: its directory lies beneath the run's private parent, the target sees it read-only, the authorization is held in the runtime's memory with no file, and the end of the call, its failure and a signal that ends the run remove it, while the next run over the evaluation reclaims one a run killed outright left.
`run.json`'s `egress` lists each entry that lists hosts with its `host:port` items, its `egressRefusals` lists each trial whose proxy refused a request with the host, the port, the entry, the reason, the address when the host resolved and a count (at most 50 distinct requests, the rest counted in `omitted`, each detail cut to 500 characters), and the run's summary names those trials.
The isolation manifest's forbidden-input notes name the entries that list hosts under Bubblewrap.
The evaluation layer's processes keep the host's network, since the evaluation's HTTP port reaches the forwarded service over the host's loopback.
A Bubblewrap target cannot connect to a path-based Unix socket of the host: `/var/run/docker.sock`, the system bus at `/run/dbus/system_bus_socket`, an agent socket under `/tmp` and every other socket file the kernel lists as bound on the host or the runtime finds under `/run`, `/var/run`, `/tmp` and `/var/tmp` answer `ECONNREFUSED`, since the runtime mounts an empty device file over each one when a call starts.
A socket inside the target's workspace or inside a private directory of the call (the bridge's directory included) stays connectable.

The target receives exactly the environment the call gave it, whether or not the host holds sockets, for every name: `BASH_FUNC_f%%`, `my.setting`, a held `PS1`, `OLDPWD`, `SHLVL`, `_`, `IFS`, `OPTIND` and `PPID` included, apart from `PWD`, which Bubblewrap sets to the directory the call runs in for every call, with sockets hidden or none, `NODE_V8_COVERAGE`, which every confined target loses under either mechanism, the values that name a path inside a call directory (`TMPDIR`, `TMP`, `TEMP` and a started service's port file), which name the directory's mount under `/dev` under Bubblewrap, and the proxy variables a call with `egress` gains.
A call is refused (exit 12, naming the count and the room) when the sockets only root, the system accounts and the user running the call can create exceed the room, which no other user can cause.
`run.json`'s `hostSocketTruncation` lists each trial whose calls left sockets of other users reachable because the room ran out, with its `conditionArm`, `trialIndex`, `calls`, `truncatedCalls` and `socketsLeftReachable`, and the run's summary names those trials; the list is empty when no call was cut.
A socket file the runtime cannot reach by its exact path (a directory it cannot search, a file that went away) is left out, since the target cannot reach it either.

A macOS Seatbelt target cannot connect to a path-based Unix socket of the host outside its grants: `/var/run/docker.sock`, Docker Desktop's `~/.docker/run/docker.sock`, the socket `SSH_AUTH_SOCK` names, an agent socket under `/tmp` and every other socket file answer `EPERM`, since the profile denies every `connect()` to a socket path and then allows the grants back.
A socket inside the target's workspace, a private directory of the call or its home stays connectable, and so do the two system services a toolchain needs: `/var/run/mDNSResponder`, which every name lookup of the C library asks, and `/var/run/syslog`, the BSD log socket.
Every other socket of `/var/run` stays closed on macOS, the privileged helper of Docker Desktop among them.
The rule names a path, so a socket a host process binds after the call started is refused too, and so is a link to a socket outside the grants, whether the link lies in the workspace or beside the socket, since Seatbelt matches the real path of the socket; a target cannot hard-link a socket outside its grants into its workspace.
macOS Seatbelt has no abstract sockets, it accepts `egress` and ignores it, and its Mach services are a separate channel the profile does not close.

A confined run's isolation manifests account for each forbidden input with a note naming the confinement that withheld it (`Withheld as well by macOS Seatbelt (sandbox-exec) file-system confinement: ...`, or `Linux Bubblewrap (bwrap)`); an opted-out run's note says the runtime does not sandbox the target's file system.
`score` over an opted-out run says so in its summary line, and its `score.json` records the run's `confinement`, so an opted-out verdict is marked as one.

### A subscription login under confinement

A confined target runs with a private home, so an agent CLI that authenticates with your subscription finds no login there, and every call of `tea-skill-runner --agent claude` exits 4.
A command entry that declares `"login": "claude"` gives its processes the logins Claude Code documents and nothing else of your home:

- `CLAUDE_CODE_OAUTH_TOKEN` passes when the host sets it, for a token from `claude setup-token`.
  No other credential variable passes, `ANTHROPIC_API_KEY` included, unless the entry's `environmentKeys` names it.
- `.credentials.json` in `CLAUDE_CONFIG_DIR`, or in `.claude` under your home when `CLAUDE_CONFIG_DIR` is unset, is where Claude Code on Linux and Windows keeps the login.
  When the host has the file, each private home holds a link at `.claude/.credentials.json` that names the real file, so the CLI finds it where it looks.
  The target reads the file and cannot write it, and the audit lists neither the read nor a refused write.
  The home is shared by every target of the run, so every target the run starts can read the linked file.
  The link is read-only, so a CLI that refreshes an expired access token during a call cannot save the new one; a run that outlasts the access token uses the token route, whose long-lived token needs no refresh.
  A second file under your home that a target reads, in `.claude` or beside it, is an observed mount, `run` exits 3 once its trials are sealed, and `score` exits 3.

`run.json` records the grant of each entry under `logins`: the interface, the executable, the adapter, the variable's name and the file as `<credentials-file>`.
The isolation manifest names the file read-only in `allowedMounts` as `read-only login <credentials-file>`, and the note of each forbidden input names the variable and the file as `<credentials-file>`.
The run replaces the variable's value and each string of eight characters or more that the credentials file holds with `[redacted]` wherever any target prints it, a command, a tool server or an HTTP server, so no record holds them.
The run keeps every string the file has held since it began and reads the file again when each call settles, so a token that Claude Code on your host rotates out of the file during a call is replaced along with the one that took its place.
A read of the file that a rewrite tore, which is not valid JSON, contributes its whole text, each whitespace-separated token and each quoted string, so a token in it is replaced too.
The values of the fields Claude Code's file documents as no secret (`scopes`, `subscriptionType` and `rateLimitTier`) stay as written, so a word such as `enterprise` in an answer is not rewritten, and every other field of the file is replaced.
A confined run on a host that has neither source exits 12 before any target starts, naming the entry, the file it looked for, the token route and the opt-out.

A login held in the macOS Keychain has no grant.
The keychain answers over a Mach service, which a Seatbelt rule allows or denies as a whole, and no Seatbelt rule scopes the keychain to one item.
Claude Code also finds the keychain through `HOME`, which a confined target holds privately, and a confined target's read of your keychain files is an observed mount, with the sidecar write a keychain database needs beside it refused.
A confined target on macOS authenticates through the token route or runs with the opt-out.
Run `claude setup-token` once and export the token it prints as `CLAUDE_CODE_OAUTH_TOKEN` where `tea-evaluate` runs, or set `"confinement": false` in `evaluation.json`, which keeps your home and your keychain for the target and records `opt-out`.
An opted-out run passes the variable as well, makes no home and records the variable under `logins`, with no file.
It replaces the strings of your credentials file in every record all the same, since a target that keeps your `HOME` reads the file there.
