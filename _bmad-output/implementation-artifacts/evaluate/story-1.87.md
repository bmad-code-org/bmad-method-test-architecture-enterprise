---
title: "Story 1.87: Give a macOS Seatbelt target no route to the host's path-based Unix sockets"
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6421dde8a0221761cfeae8bbcb5e8746364e1790'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.87, 1.82 and 1.86)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.87, 1.82 and 1.86 sections)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.82.md (the Bubblewrap mounts this rule mirrors)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.113.md (the record format)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The Seatbelt target profile starts from `(allow default)` and refuses a `connect()` to a socket under the user's private root only.
A macOS target can therefore connect to `/var/run/docker.sock`, Docker Desktop's `~/.docker/run/docker.sock`, an agent socket under `/private/tmp` or the socket `SSH_AUTH_SOCK` names, and ask the service behind it to run a job outside the sandbox (AD-8).
Bubblewrap's mounts (Story 1.82) cannot cover a socket bound after the call started; Seatbelt names a socket by its path, so a rule can.

**Approach:** the profile denies every `connect()` to a path-based Unix socket (`(deny network-outbound (remote unix-socket))`) and allows back, after the denial, the workspace, the call's private directories, the home and the two system services a toolchain needs.
The unaudited profile's bytes change only where the rule is added, and Story 1.62's byte-identity golden is regenerated to say so.
The reference's macOS sentence from Story 1.82 is replaced by the sockets the profile closes and the ones it reaches.

## Boundaries & Constraints

**Always:** the rule names a path, so a socket bound after the call started is refused.
Every spelling of a grant is named (`spellings`), and the system services are named by the real path Seatbelt matches.
The workspace, the call's private directories, the home (beneath the private root or outside it) and the resolver and the log socket stay connectable.
A Seatbelt behavior case runs on macOS and skips on Linux with its reason named; the profile's text is held on every host.
The engine check runs at start and end.
No eval-quality change.
No skill file changes: `references/ci.md`, `SKILL.md`, `assets/evaluation-ci-plan.template.json` and every `capture-record.json` stay as they are.
The run guide and the gaps guide change in review round 1, where each names both answers a confined target gets from a socket file of the host.

**Never:** a rule built from a list of sockets read when the call starts, a grant of a whole system directory, a change to the evaluation layer's profile (Story 1.88), a change to `cli/lib/isolate.js` or `cli/lib/atdd-isolation.js`, a new dependency, a container, a live run.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason and the rejected option.

## I/O & Edge-Case Matrix

| Scenario                      | Input / State                                                                                      | Expected Output / Behavior                                                        | Error Handling |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------- |
| Socket outside the grants     | a listener the runtime serves under the temp directory                                             | the target's `connect()` answers `EPERM`                                          | n/a            |
| Link to such a socket         | a link beside it, one in the workspace, one the target makes itself                                | each answers `EPERM`; the target's hard link is refused (`EPERM`)                 | n/a            |
| Host services                 | `/var/run/docker.sock`, `~/.docker/run/docker.sock`, the socket `SSH_AUTH_SOCK` names, where exist | each answers `EPERM`                                                              | n/a            |
| Own sockets                   | one in the workspace, one in a private directory of the call, one in the home beneath the root     | each connects                                                                     | n/a            |
| Socket under the private root | one beside the home                                                                                | `EPERM`                                                                           | n/a            |
| Resolver                      | the host's own `.local` name                                                                       | resolves in the sandbox                                                           | n/a            |
| Socket bound after the start  | the runtime binds one outside the grants after the target started; one in the workspace            | the first answers `EPERM`; the second connects                                    | n/a            |
| Rule removed                  | the profile without the denial                                                                     | every outside connection above connects, and the cases fail                       | n/a            |
| Rule denies every socket      | the profile without the allowances                                                                 | the grants cases and the resolver case fail                                       | n/a            |
| Reference                     | `docs/reference/tea-evaluate-cli.md`, `### File-system confinement`                                | the old macOS sentence is gone and the five sentences that replace it are present | n/a            |

</frozen-after-approval>

The frozen block was written for this build from the story's acceptance criteria in `epics.md` and the probes below.
The `bmad-build` skill rendered on this host; its human checkpoints were not stopped at, since the owner delegated every decision, and each decision is recorded below.

## Code Map

- `cli/lib/evaluate/confinement.js`: `SEATBELT_SYSTEM_SOCKETS`, and `seatbeltTargetProfile`'s `socketRules` (the denial and the allowances, placed after the write allowance) and the home's allowance after the root's denial.
- `test/test-evaluate-run.js`: `checkSeatbeltPathSocketUnits`, `checkSeatbeltPathSocketRoute` (with `profileAllowsSocket`, `mutatedSocketProfile`, `RESOLVE_PROBE`, `SEATBELT_LINK_PROBE`, `resolvableName`), the host-socket block removed from `checkSeatbeltNetworkAndMach`, the control of `checkPrivateRootAcrossRuns`, the five reference claims in `checkBridgeReference`, and the macOS sentence check beside the Story 1.82 one.
- `test/fixtures/isolation-primitives/golden.json`: the rule in each of the eight Seatbelt target profiles.
- `eval-quality.config.json`: `SSH_AUTH_SOCK` joins the doc-claims `foreign` tokens, since the reference now names the variable and no source declares it.
- `docs/reference/tea-evaluate-cli.md` (`### File-system confinement`), `references/run.md` and `references/gaps.md` of the skill (round 1), `test/test-evaluate-guidance.js` (their markers), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md`, `epic-1-context.md`, `sprint-status.yaml`.
- Not changed: the layer profile, `isolate.js`, `atdd-isolation.js`, the audit, `references/ci.md`, `SKILL.md`, the CI plan template, every `capture-record.json`.

## Tasks & Acceptance

- [x] Probe Seatbelt on this host before writing the rule.
- [x] `confinement.js`: the denial, the allowances, the home's allowance.
- [x] `test-evaluate-run.js`, `golden.json`: the cases and the regenerated golden.
- [x] The reference, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md`, `epic-1-context.md`, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.87, with the amendments dated 2026-10-04 there.

## Probes

Run first on this host (macOS 27.0.1, Apple silicon) with `sandbox-exec -p`, a Node `net.connect({ path })` client and a `log stream` child this build started itself, filtering the denial messages of a rule tagged `(with message "...")`.

- A `(deny network-outbound (remote unix-socket (subpath "/private/tmp")))` refuses a socket bound under `/private/tmp` with `EPERM`; the same rule spelled `/tmp` refuses nothing, since Seatbelt matches the real path of the socket the `connect()` reaches.
  A client that connects through `/tmp/...` is still matched against `/private/tmp/...`.
- `(deny network-outbound (remote unix-socket))` refuses every socket.
  A later `(allow network-outbound (remote unix-socket (subpath "<grant>")))` allows a grant back, so the last matching rule wins as it does for the file rules.
  A `path-regex` denial refuses the same sockets and is dropped, since the `subpath` allowances already cover both spellings of a grant.
- A socket bound after the sandboxed process started is refused by the rule, which names a path.
- A symbolic link in the workspace to a socket outside it is refused: the match is on the target's real path.
  A hard link made outside the sandbox in the workspace was refused too, and a hard link made inside the sandbox to a file outside the grants fails with `EPERM`.
- Relative paths, `..`, `//` and upper-case spellings of an outside socket are refused, and the same spellings of a granted socket connect.
- Under the denial alone, `dns.lookup('example.com')` fails (`ENOTFOUND`) and `curl` exits 000: the resolver is `/private/var/run/mDNSResponder`, named by its real path (a literal on the `/var/run` spelling matches nothing).
- A battery of Node, `npm view`, `git ls-remote https://`, `curl`, `ssh`, Python `urllib`, Ruby `net/http`, Java, Swift, `xcodebuild`, `sqlite3`, `defaults`, `scutil`, `security`, `dscl`, `osascript`, `brew` and `clang`, run under the denial with the resolver and the log socket allowed, logged no other denied socket.
  The denial log under the bare rule named `/private/var/run/mDNSResponder` for `node`, `curl`, `Python` and `ssh`, and nothing else.
- A datagram `sendto` to a socket path with no `connect` is refused by the same rule (`EPERM`), so a datagram socket is no route around it.
- A Python datagram `connect` to `/var/run/syslog` is refused by the bare rule and connects once `/private/var/run/syslog` is allowed; libc's `syslog()` goes through the unified log and asks no socket.
- `/private/var/run` also holds `com.docker.vmnetd.sock` (root's network helper of Docker Desktop, world-writable), `usbmuxd`, `cupsd`, `portmap.socket` and `systemkeychaincheck.socket`.
  None is a toolchain's need in the battery, so none is allowed.

## Decisions

1. **Deny every socket path, then allow the grants back.**
   The rule names what the target may reach, so the Docker socket, an agent socket, the `SSH_AUTH_SOCK` socket and a socket the runtime binds later are all refused by one statement.
   Rejected: a denial of named directories (`/private/tmp`, `/var/run`, `~/.docker`), which leaves a socket in any other directory reachable; a rule built from the sockets found when the call starts, which the criteria name as the failing design since a later socket is missed (Bubblewrap's mounts have that limit, Seatbelt's path match does not); a `path-regex` allowance of host paths, which reads like an allowance of the host.
2. **The allowances are the grants plus two system sockets, each by the path Seatbelt matches.**
   The workspace and the call's private directories use `spellings`, which names both spellings of a path that goes through a link.
   The two system services are named by the real path under `/private/var/run`, which the probes showed is the one that matches.
3. **System sockets kept: `/private/var/run/mDNSResponder` and `/private/var/run/syslog`.**
   The resolver is the one socket the battery's tools asked; without it `getaddrinfo` fails for every name that is not in `/etc/hosts`, so `curl`, `git`, `ssh`, `npm` and Python lose the network.
   The log socket is the BSD syslog datagram socket that Go and Python logging clients write, and a Python client was refused until it was allowed.
   Rejected: `(subpath "/private/var/run")`, which would reach Docker Desktop's privileged helper and `usbmuxd`; no system socket at all, which fails the resolver half of the criterion.
4. **The home beneath the private root is allowed again after the root's denial.**
   The root's existing denial of reads, writes and sockets stays where it was, so a grant that lies beneath the root stays refused, and the home (the one directory of the root a target reaches) gets an allowance after it, as it does for the file rules.
   This changes behavior: a socket in a target's own home beneath the root was refused before and connects now, as the criteria's "a private directory of the call" asks.
5. **The refused connection is no observed mount.**
   The denial carries no `with message`, as the existing root denial does not, so the audit's token never reports it, and the Seatbelt audit lists no connection (Story 1.86 is Linux only).
   Rejected: tagging the denial, which would put a refused call into `observedMounts` and make `score` exit 3 for a probe the sandbox answered correctly.
6. **A link is refused by its real path; a hard link needs no rule.**
   The target cannot make a hard link to a socket outside its grants (`EPERM`), and a symbolic link leads where it leads.
   The reference says so, and the route case holds both with a link the target makes itself.
   A hard link made by a host process into the workspace was refused in the probe, and the case does not assert it, since the vnode's path of a multiply linked file is the kernel's to choose.
7. **The resolver half of the case resolves the host's own `.local` name.**
   `getaddrinfo` for `<LocalHostName>.local` goes to mDNSResponder, which answers for its own host, so the case needs no network; it falls back to the host's name and skips the half, naming why, when neither resolves with no confinement.
   Rejected: `example.com`, which fails on an offline host and proves nothing there.
8. **The units read the profile with a small evaluator of its network rules.**
   `profileAllowsSocket` applies the last matching rule over `(allow default)`, so a Linux host's static level fails when a socket class is closed or open wrongly, a profile with no denial, one with no allowance and one that allows the host's socket each fail the reading, and the profile before and after a socket is bound is the same text.
9. **The layer profile, `isolate.js` and `atdd-isolation.js` are unchanged.**
   The evaluation layer's processes are Story 1.88; the other two modules confine other tools and share only the primitives, so the golden's change is the eight target profiles.
10. **The run guide and the gaps guide name both answers.**
    Review round 1 found that `references/run.md` and `references/gaps.md` named Bubblewrap alone for a target that cannot reach a host socket, and a macOS Seatbelt target now fails the same way with `EPERM`.
    Both sentences name both answers and keep the opt-out, and the guidance case's markers fail while a guide names Bubblewrap alone.
    No guide the capture records pin is touched (`references/ci.md`, `SKILL.md` and the plan template stay as they are), and the exit-table rows the dogfood mutations replace are byte-stable.

## Implementation Notes

- `seatbeltTargetProfile` builds `socketRules` from the same `allowed` subpaths as the write allowance, so a grant and its socket allowance cannot drift, and appends the two system literals.
- The rules sit after the write allowance and before the audit's report rule, the git rules and the root's denial, so every later rule that names a socket (the root's denial) still overrides them.
- The golden's diff is the denial, the allowance and, where there is a home beneath the root, that home's allowance; no other byte of any of the 8 changed profiles differs, which a script that removes the inserted rules from each new profile checked against the old.

## Revert observations

Every table ran once on a scratch copy of the final tree under the scratchpad directory (`final-tree`, made with `rsync` from this working tree after the review round's fixes, `.git` and `website` left out, `node_modules` linked).
Each row changed one file of the copy, ran the named case there, recorded the failed-check count and copied the file back from the working tree.
The cases are `node test/test-evaluate-run.js --group=confinement --only="Seatbelt path socket route"` (the route, 44 checks on the final tree with `SSH_AUTH_SOCK` set and 41 with it unset), `--only="Seatbelt path socket units"` (the units, 52) and `--only="the network reference"` (197), and `node test/test-isolation-primitives.js` (the golden, 8 changed outputs).
A count is the failed checks of that run; a case that stops at an error ends at that check.

| Criterion                           | Revert (on the copy)                                                                                                         | Route    | Units    | Reference | Golden |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | --------- | ------ |
| No route to a socket outside grants | the denial `(deny network-outbound (remote unix-socket))` taken out of `seatbeltTargetProfile`                               | 23 of 44 | 27 of 52 |           | 8      |
| Grants and services stay reachable  | the allowance rule taken out (a rule that denies every socket)                                                               | 9 of 44  | 19 of 52 |           | 8      |
| A later socket is refused           | the denial replaced by one built from the sockets found under `/private/tmp` and `/private/var/run` when the profile is made | 21 of 44 | 24 of 52 |           | 8      |
| The resolver stays reachable        | `/private/var/run/mDNSResponder` out of `SEATBELT_SYSTEM_SOCKETS`                                                            | 1 of 44  | 5 of 52  |           | 8      |
| The log socket stays reachable      | `/private/var/run/syslog` out of `SEATBELT_SYSTEM_SOCKETS`                                                                   | 1 of 44  | 5 of 52  |           | 8      |
| Other system sockets stay closed    | both literals replaced by `(subpath "/private/var/run")`, `SSH_AUTH_SOCK` set                                                | 2 of 44  | 5 of 52  |           | 8      |
| Other system sockets stay closed    | the same replacement with `SSH_AUTH_SOCK` unset                                                                              | 1 of 41  | 5 of 52  |           | 8      |
| Each grant stays reachable          | the call's private directory out of the socket allowance (the workspace's spellings kept)                                    | 1 of 44  | 7 of 52  |           | 6      |
| The home beneath the root           | the home's allowance after the root's denial taken out                                                                       | 1 of 44  | 2 of 52  |           | 2      |
| A deny-all control that cannot run  | `(this-is-not-a-rule)` appended to the deny-all profile of the route case (a change to the test file of the copy)            | 5 of 44  |          |           |        |
| The reference                       | the old macOS sentence put back above the new ones                                                                           |          |          | 2 of 197  |        |
| The reference                       | the sentence on the grants and the two services taken out                                                                    |          |          | 2 of 197  |        |
| The golden                          | the golden restored to the commit before this story                                                                          |          |          |           | 8      |

The two guides ran on a second scratch copy (`tree2`) with `test/test-evaluate-guidance.js`: the run guide as it was before round 1 fails 1 check and the gaps guide as it was fails 3.

The host-socket check of the route tries `/var/run/com.docker.vmnetd.sock` beside the other host sockets, so the system-sockets row fails on this host's helper when `SSH_AUTH_SOCK` names nothing under `/private/var/run` (the unset row fails 1 of 41).
The deny-all controls expect the exact refusals (`refused EPERM`, `refused 1`), so a profile `sandbox-exec` cannot start fails them, which the invalid-rule row shows.
The route's late socket is bound after the probe wrote its ready file, so the confined process exists when the socket appears.
The deny-all row's four extra failures beyond the checks listed next are the controls that see the mutation already in the profile.

The route's deny-all row fails, in order, the workspace socket, the private directory's socket, the name lookup (`failed ENOTFOUND`), the log datagram and a socket bound late in the workspace, so a rule that denies every socket fails the grants case and the resolver case as the criteria ask.
The route's removed-denial row fails each connection the case expects refused: every socket outside the grants, the links and the late socket connect.
The units run no sandbox, since `profileAllowsSocket` reads the profile text, so a Linux host's static level fails the same rows.

The first full run of `test:evaluate-confinement` failed 4 of 2,001 checks in `checkPrivateRootAcrossRuns`, whose control built a sandbox over one run's parent and expected a socket outside the grants to connect, which the denial now refuses.
The control takes the denial out of a Seatbelt profile to see what the root alone withholds, and the case passes with 16 checks.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

Local, macOS 27.0.1 (Seatbelt), on the final tree unless a row says otherwise:

- `test:evaluate-confinement` ran once in full on the tree before the review round: 2,001 checks, the 4 failures above fixed, one case that lost two kernel reports rerun by the group's `lossy` marker.
  After the review round the changed cases ran again alone: the route (44 with `SSH_AUTH_SOCK` set, 41 unset), the units (52), the network reference (197), the private root across runs (16), `--only="Seatbelt"` (99 with `SSH_AUTH_SOCK` set, 96 unset, across the three Seatbelt cases), and `test:evaluate-guidance` after the round 1 guide changes.
- `test:evaluate-run` 592 (run before the review round and again on the final tree), `test:evaluate-preflight` 353, `test:evaluate-mutation` 727, `test:evaluate-agents` 501, `test:evaluate-arms` 733, `test:evaluate-held-inputs` 210, `test:cli`, `test:isolation-primitives`, `test:atdd-isolation`: green on the tree before round 1; round 1 changed the test file (the ready-file wait, the exact deny-all expectations, the Docker Desktop helper socket in the route), `run.md`, `gaps.md` and the guidance markers, and the cases those touch ran again as listed above.
- `test:doc-counts`, `test:doc-claims` (after the `SSH_AUTH_SOCK` token), `test:shards`, `test:ci-coverage`, `test:changelog`, `test:direction`, `test:boundary`, `test:doc-claim-sources`, `test:evaluate-boundaries`, `test:lineage`: green.
- `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`, `npm run docs:build`: green.
- Engine check (`evaluateTarget` is a function): run at the start and the end, exit 0.
- Linux: no container ran in this build.
  The Seatbelt route case skips on Linux with its reason named (Seatbelt exists on macOS only, and the units hold the rule's text on every host), the isolation golden and the units run in the ubuntu CI job, and the Bubblewrap route case of Story 1.82 gained the round 1 ready-file wait, which runs in the ubuntu CI job only.
  The repository has no macOS CI job, so the route case runs on a macOS host and the ubuntu job carries the units, the golden and the reference claims.
- No real agent CLI was started and no live run was made.
- `git diff -- package.json package-lock.json` is empty.

## Build review

Round 0: one subagent reviewed the uncommitted change in three lenses (correctness and security, tests, compliance), read only, in place of `/bmad-code-review`.
Every finding was checked before it was acted on.

| Finding                                                                                                                  | Verdict | Route                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security lens: spellings, datagram `sendto`, links, case variants, the home after the root's denial, a toolchain battery | none    | The reviewer's probes found each refused or reachable as the rule says; `ssh` to a remote loses `SSH_AUTH_SOCK`, which the story intends                                                                    |
| Medium (tests): no macOS CI job, so CI covers the rule through the text reading alone                                    | valid   | Stated in Gates in plain words; the units read the profile text and the golden holds the bytes in the ubuntu job                                                                                            |
| Low (tests): the log socket had no behavior check, the resolver half can skip                                            | valid   | Fixed: the route connects a Python datagram to `/var/run/syslog` and fails it under a profile with no allowances; the resolver skip names its reason and runs on a host that resolves its own `.local` name |
| Medium (compliance): "instead of" in the `epics.md` amendment                                                            | valid   | Fixed                                                                                                                                                                                                       |
| Low (docs): "a socket it does not own" is wrong, the refused hard link is one whose source lies outside the grants       | valid   | Fixed in the reference, `epics.md` and the claim                                                                                                                                                            |
| Low (compliance): "reads no list" and "holds no list" tails                                                              | valid   | Reworded in the reference, the CHANGELOG, the spine, `confinement.js` and this record; the criterion's own words in `epics.md` stand                                                                        |
| Low (compliance): comment sentences that wrap and one rejected-clause comment                                            | valid   | Fixed: one sentence per line in each comment this story added                                                                                                                                               |
| Low (record): empty sections and a sprint row                                                                            | valid   | Filled; the row is `review`                                                                                                                                                                                 |
| Low (tests): the late-socket wait gives a vague message on timeout                                                       | valid   | No change: the message prints the probe's raw output, which names the answer                                                                                                                                |

Round 0 left no finding open.
The coordinator's Opus review rounds run on the open pull request.

## Review round 1

Two Opus reviewers (code lens, tests and records lens) reviewed the pull request, and each finding was reproduced before it was fixed.

| Finding                                                                                                                               | Verdict | Route                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium (code): `references/run.md` and `references/gaps.md` name a Bubblewrap target alone as unable to reach a host socket           | valid   | Both guides name both answers (`ECONNREFUSED` from Bubblewrap, `EPERM` from macOS Seatbelt) and keep the opt-out; the guidance markers fail while a guide names Bubblewrap alone; the CHANGELOG entry says so |
| Medium (tests): the late socket is bound about 21 ms before the confined process exists, so the case never runs the scenario it names | valid   | `LATE_PROBE` writes `<go>.ready` first and the late-socket step of the Seatbelt route and of the Linux `checkPathSocketRoute` waits for it; the messages say what the process was doing                       |
| Low: four deny-all controls pass for any profile `sandbox-exec` cannot start                                                          | valid   | They expect `refused EPERM` and `refused 1` and print the answer received; an invalid rule appended to the deny-all profile fails 5 of 44                                                                     |
| Low: the `(subpath "/private/var/run")` mutant passes with `SSH_AUTH_SOCK` unset                                                      | valid   | The route also tries `/var/run/com.docker.vmnetd.sock`; the mutant fails 1 of 41 with the variable unset and 2 of 44 with it set                                                                              |
| Low: the units' JSDoc and `test-design-epic-1.md` say "built from a list" where the third mutant allows the socket the host bound     | valid   | Both say "one that allows the socket the host bound", as Decision 8 does                                                                                                                                      |
| Low: a banned tail in the revert paragraph and "proves nothing less than a real route" in a comment                                   | valid   | Fixed, in both route cases                                                                                                                                                                                    |
| Low: the revert table lacks the row for one grant's allowance dropped                                                                 | valid   | Added: route 1 of 44, units 7 of 52, golden 6                                                                                                                                                                 |
