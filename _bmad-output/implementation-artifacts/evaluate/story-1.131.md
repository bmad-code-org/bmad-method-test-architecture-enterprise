---
title: "Story 1.131: Give a killed run's call directories to the recovery of its private parent"
type: 'bugfix'
created: '2026-10-06'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '30c5b22223b126295dace9c38802d1f9e9651366'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.131, 1.54, 1.82, 1.83, 1.88 and 1.89)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.131, 1.54, 1.83, 1.88 and 1.89 sections)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.54.md (the recovery of a dead run's private parent)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.83.md (the egress proxy's directory beneath the parent, bound under /dev)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.89.md (the record format and the launcher's environment file)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The directories a confined call hands its target sit in the system's temp directory: the call's temp directory (`tea-evaluate-target-tmp-*`), a started service's port directory (`tea-evaluate-port-*`) and its bridge directory (`tea-nb-*`).
A run that ends by a signal it handles removes each of them with its scratch list, and the next run over the evaluation reclaims the private parent of a run killed outright (Story 1.54), but a `SIGKILL`ed run leaves the three behind and nothing reclaims them.
The sandbox empties the private root, so a grant beneath it would be hidden from the target (AD-8).

**Approach:** each call directory is made beneath the run's private parent and reaches the target at a path the sandbox keeps.
Under Bubblewrap the vector binds the directory writable at `/dev/<name>`, as Story 1.83 binds the egress proxy's directory, and the call's environment (`TMPDIR`, `TMP`, `TEMP`, the port file's path) and the status shim's bridge path name it there.
Under Seatbelt the profile allows the directory again beneath the denied root, as it allows the home.
The next run's preflight reclaims a killed run's call directories with the private parent, through the recovery Story 1.54 built.

## Boundaries & Constraints

**Always:** the private root stays read-only to the layer and the status directory stays writable by the runtime only.
Each call directory stays reachable by its target (the target's `TMPDIR` is writable, a started service's port file is written and read, the bridge answers) and stays reclaimable by the next run's preflight.
The audit's observed mounts leave each call directory out.
The recovery removes only what the host made beneath a parent whose journal record, marker, mode, owner and dead process agree, and follows no path a target left in a call directory.
`mask-guard.js` (host-side placeholder cleanup and `reclaimDeadMaskRecords`), the read-only private root, `freshPrefix` relisting and the Story 1.89 launcher with its environment file are as they were.
The Linux cases skip with their reason named on a host with no usable `bwrap`, and everything this host can prove is proven through the argument vector, a stand-in `bwrap` and a real `SIGKILL`.
No Docker, no live run through a real agent CLI, no eval-quality change.
No skill file changes: `references/ci.md`, `SKILL.md`, `assets/evaluation-ci-plan.template.json`, every `capture-record.json` and the exit-table rows the dogfood mutations replace stay as they are.

**Never:** a record of call directories the sandbox could write, a path a record names followed by the sweep, a call directory made in the system's temp directory by a list that has the run's private parent, a bind at a path the emptied private root hides.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason and the rejected option.

## I/O & Edge-Case Matrix

| Scenario                     | Input / State                                                                                              | Expected Output / Behavior                                                                                                                                   | Error Handling                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| A killed run                 | a run holding a call open, killed with `SIGKILL`, then a second preflight over the same evaluation         | the temp directory holds no `tea-evaluate-target-tmp-*`, `tea-evaluate-port-*` or `tea-nb-*` before and after; the output names the reclaimed private parent | n/a                                             |
| A Bubblewrap call            | the three directories beneath the private parent                                                           | each bound writable at `/dev/<name>` after the root is emptied; the environment, the port file and `--bridge` name the mount                                 | two directories of one name: `ConfinementError` |
| A directory outside the root | a grant that is no call directory                                                                          | bound at its own path, named by its own path                                                                                                                 | n/a                                             |
| A Seatbelt call              | the three directories beneath the private root                                                             | the profile allows each again after the root's denial, with the ancestors' metadata                                                                          | n/a                                             |
| The audit                    | a call directory written under Bubblewrap                                                                  | the mount is a read and a write grant, so no observed mount                                                                                                  | n/a                                             |
| Planted content              | links, a hard link, a closed directory and record-shaped files left in a call directory                    | the recovery removes the call directory and touches nothing outside                                                                                          | n/a                                             |
| A forged record              | marker of mode 666, of another run, a link; a journal record of mode 666 or naming another process or pair | the recovery removes nothing                                                                                                                                 | n/a                                             |
| Another evaluation           | the recovery asked for another folder or another project root                                              | the recovery removes nothing                                                                                                                                 | n/a                                             |
| A live owner                 | the owner of the parent still runs                                                                         | the recovery removes nothing                                                                                                                                 | n/a                                             |
| Reference                    | `docs/reference/tea-evaluate-cli.md`, `### File-system confinement`                                        | states where each call directory lives and that a killed run's are reclaimed; the old sentence is gone                                                       | n/a                                             |

</frozen-after-approval>

The frozen block was written for this build from the story's acceptance criteria in `epics.md` and the probes below.
The `bmad-build` skill rendered on this host; its human checkpoints were not stopped at, since the owner delegated every decision, and each decision is recorded below.

## Code Map

- `cli/lib/evaluate/confinement.js`: `callDirectoryMount`, `pathAsMounted`, the `mounted` argument of `bubblewrapTargetArguments`, the `rootGrants` argument of `seatbeltTargetProfile`, `isCallDirectory` and the call directories' handling in `targetSandbox().wrap` (the binds, the environment, the shim's `--bridge`, the audit's grants), and `callTemporary`.
- `cli/lib/evaluate/http-target.js`: the port directory and `makeBridgeDirectory`.
- `cli/lib/evaluate/workspace.js`, `preflight.js`: the comments that placed the granted directories in the system's temp directory.
- `test/test-evaluate-run.js`: `checkCallDirectoryUnits`, `checkCallDirectoryRoute`, `checkTargetTemp`, the claims and the stale-sentence check of `checkBridgeReference`, the stand-in `bwrap` of `checkObserverRefusalRun`, the egress kill case.
- `test/test-evaluate-api.js`: `checkKilledCallDirectories`, `checkCallDirectoriesStoodIn` (`standInBubblewrap`), the port cases of `checkPortReport`.
- `test/fixtures/evaluate/killed-call.cjs` (new): the run that holds a call open.
- `test/lib/isolation-golden.js`, `test/fixtures/isolation-primitives/golden.json`: four new entries.
- `docs/reference/tea-evaluate-cli.md` (`### File-system confinement`), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, this record.
- Not changed: `workspace.js`'s recovery (`reclaimDeadPrivateParents`, `removeScratchDirectory`), `mask-guard.js`, `confinement-status.cjs`, `confinement-launcher.cjs`, `registry.js`, `references/*`, `SKILL.md`, the CI plan template, every `capture-record.json`.

## Tasks & Acceptance

- [x] Choose where each call directory is made, how it reaches the target and what the recovery trusts (Decisions 1 to 5).
- [x] `confinement.js`, `http-target.js` and the comments.
- [x] The cases: units, the killed run, the stand-in, the Linux route, the reference claims, the golden.
- [x] The reference, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.131, with the amendment dated 2026-10-06 there.

## Probes

This host is macOS on Apple silicon with Node 24.20.0: no `bwrap`, no Linux, no container.
What the layer does is established by reading its code and by probes on this host; the ubuntu job proves the real Bubblewrap run.

- The three directories and where they were made: `callTemporary` (`confinement.js`), the port directory (`createApiPort`) and the bridge directory (`makeBridgeDirectory`) used `os.tmpdir()`.
  Every other directory a run makes for the layer (the status directory, the egress proxy's directory, the home, the audit directory, `makeScratchDirectory`) is beneath `scratch.privateParent`.
- A search of `os.tmpdir()` across `cli/lib/evaluate/` finds the others and none is a call directory: `confinement.js` `probeObserver` and `selectConfinement` read the temp directory, `confinement-audit.js` makes `tea-evaluate-observer-probe-*` for the host's own probe at selection (before the run's journal and parent exist, holding nothing a target is handed), `workspace.js` makes the workspaces and the staging directories of the live harness (`stageDirectories`), `recorded-paths.js` and `gameability.js` name the temp directory without making a call directory there, `bridge.js` and `registry.js` already use the parent.
- The recovery needs no change.
  `reclaimDeadPrivateParents` verifies the journal record (mode, owner, folder, project root, pid, name), the marker (type, mode, owner, bytes) and the dead owner, and then removes every entry beneath the parent with `removeScratchDirectory`, which restores write bits without following a link and removes recursively without following one.
  A call directory beneath the parent is such an entry.
- The sandbox's view: under Bubblewrap `--tmpfs <private root>` empties the root, and the home is bound back at its own path before `--remount-ro`.
  A call directory bound at its own path before that tmpfs is hidden by it, which the Linux route case shows as a control.
  The egress proxy's directory and the status file already reach the target at `/dev/<name>`.
- Under Seatbelt the profile denies the private root and allows the home again, so a call directory beneath the root needs the same allowance.
  A real run on this host showed it: `a confined target's temp directory` writes the temp directory under the profile with the allowance.
- A target can only write a call directory it was handed.
  It cannot reach the private parent's marker, the journal in the evaluation folder or the root's records, so no record of the runtime can be forged from inside a call directory.
- Under an exported `NODE_V8_COVERAGE` the Seatbelt case `a confined target's temp directory` fails on this host with the base commit too: a Seatbelt target started by a Node process with coverage inherits the host's coverage directory, writes it and the audit lists the write.
  Bubblewrap unsets the variable in every vector, and CI sets the variable on Linux.

## Decisions

1. **Each call directory is made beneath `scratch.privateParent`, and a list with no parent keeps the system's temp directory.**
   `makeTargetHome`, `makeScratchDirectory` and the status directory fall back the same way, and every run makes the parent before any sandbox exists (`preflight.js`).
   The fallback serves the unit cases that hand a scratch list of their own, and a case that makes a call directory in the system's temp directory again with a real run's list fails `the call directory units` and `the call directories of a killed run`.
   Rejected: refusing a list with no parent (every direct caller of the mechanisms in the suites would carry a parent that no behavior needs), and a sweep of the temp directory by prefix (it would reach the directories of a run that still lives and of another evaluation, and a name is no ownership).
2. **Under Bubblewrap each call directory is bound writable at `/dev/<basename>`, and the vector places the binds after the private root is emptied and made read-only.**
   The basename is `mkdtemp`'s, unique among a run's call directories, and a case refuses two of one name.
   Rejected: a bind at the directory's own path inside the emptied root, as the home has (the story names the synthetic `/dev`, the root's listing would show the call's sibling names, and the Linux control shows the earlier order hides the directory), and one mount of a common call directory holding the three (the three have different owners of purpose and different lifetimes).
3. **`wrap` names the directories to the target; the mechanisms and `callServer` hand it host paths.**
   `wrap` receives the call's environment and the bridge path, and rewrites each environment value that is an absolute path inside a call directory (`TMPDIR`, `TMP`, `TEMP`, the port file) and the shim's `--bridge` argument, whether the environment reaches the engine directly or through the launcher's file.
   Every other value passes as it is, and the runtime keeps reading the port file and connecting to the bridge through the directory's own path.
   Rejected: an optional method every mechanism and fake sandbox must carry (`callServer` would ask the mechanism for each path, and every stand-in sandbox in the suites would grow it), and a table of the environment keys that name a path (a registry entry's own variable would escape it).
4. **No record of call directories exists.**
   The parent's journal record and marker authorize the removal of everything beneath a verified parent, and a target can write nothing there but its call directories' contents.
   A record naming call directories would be a second file the recovery must verify and a path a forged copy could aim at, which the earlier recovery of the layer's mask records showed to be the way a recovery deletes what the layer could not touch.
   The cases plant, in each call directory, what a target could leave (links, a hard link, a closed directory, files shaped like the runtime's records aimed at outside paths) and forge the marker and the journal record each way a sandbox could, and every forged state leaves every directory and every canary outside whole.
5. **Under Seatbelt the profile allows each call directory again after the denial of the private root.**
   `seatbeltTargetProfile` takes `rootGrants` beside `rootHome`, and the allowance, the metadata of the ancestors and the socket route are written for each, so the profile of a call with no such directory is byte for byte what it was.
   Rejected: keeping the call directories in the temp directory under Seatbelt (a killed macOS run would leave them, and the story's recovery is not a Linux-only one).
6. **The audit grants the mounts.**
   The trace's read and write grants hold `/dev/<name>` beside the host paths, so a write into a call directory under Bubblewrap is no observed mount; `/dev` was already a connect grant for the bridge's socket.
7. **The proof runs on every host through a real `SIGKILL` of a run built from the layer's own code.**
   `killed-call.cjs` makes the private parent as `preflight` does, then a service's call through `createApiPort` and the confined command mechanism, so the three directories are made by the code that makes them in a real run, and a base that never answers holds the call open.
   A real `tea-evaluate preflight` killed while a started service's call is open proves the port directory end to end.
   The bridge directory exists in a real run on Linux only, where the ubuntu job runs the confined pipeline.
8. **A stand-in for Bubblewrap applies the binds under `/dev` on every host.**
   It records the vector and the environment it was given, substitutes the bound directory for each mount in the command and in every environment value, and runs the command.
   `the call directories, stood in` runs the real sandbox, mechanisms, status shim and HTTP port over it, so the port file read at the directory's own path, the bridge answering and a writable `TMPDIR` are shown wherever Node runs; it is no sandbox, so `the call directory route` runs the real one in the ubuntu job.
9. **`epics.md` and `test-design-epic-1.md` are amended.**
   The first criterion's Linux run over the verdict fixture became a case that runs everywhere, for the reasons in the amendment.
10. **The existing stand-in `bwrap` of `the observer's refusal of a run` applies every bind under `/dev`.**
    It applied the last one only, which was the status file's before this story and a call directory's after, so the status shim wrote a path that did not exist.
    The rewritten stand-in is the node program of Decision 8.

## Implementation Notes

- `callDirectoryMount(directory)` is `/dev/<basename>`; `pathAsMounted(candidate, mounted)` returns the mount path for an absolute path inside a `mounted` directory and any other value as it is.
- `wrap` partitions its grants: the call directories (`isCallDirectory`: beneath the private root and not inside the home) go to the vector's `mounted` list and Seatbelt's `rootGrants`, every other grant is bound at its own path as before.
- The vector's binds of the call directories sit right after the egress proxy's, before the evaluation folder's `--tmpfs`.
- `wrapped.environment` is the mapped environment for a call that hides none, and the launcher's loader variables for a call that hides sockets, whose file carries the mapped environment.
- Story 1.62's golden was regenerated with `TEA_UPDATE_ISOLATION_GOLDEN=1 node test/test-isolation-primitives.js`.
  Its diff, read: 254 added lines and none changed.
  The four new entries are `confinement.targetSandbox.wrap.bubblewrap.callDirectories` (the temp, port and bridge directories bound at `/dev/<name>` after the root is remounted read-only, and `--bridge /dev/tea-nb-AbCdEf/b`), its `.environment` (`TMPDIR`, `TMP`, `TEMP` and `PORT_FILE` under `/dev`), its `.audit` form (the mounts in the trace's read and write grants beside the host paths) and `confinement.targetSandbox.wrap.seatbelt.callDirectories` (the profile with the three directories allowed again after the root's denial, with the metadata of `run-501-AbCdEf` and the root).
  Every earlier entry is byte for byte as it was, which holds that the layer's vectors, the target's vectors with no call directory beneath the root and the Seatbelt profiles are unchanged.

## Revert observations

Every row ran on a scratch copy of the final tree under the scratchpad directory (`ft`, made with `rsync` from the working tree after the last code and test edit, `.git`, `website` and `build` left out, `node_modules` linked), and none on the working tree.
Each row changed one place in the copy, ran the named cases there (`node test/test-evaluate-run.js --group=confinement --only="<case>"`, `node test/test-evaluate-api.js --only="<case>"` or `node test/test-isolation-primitives.js`), recorded the failed checks of that run and restored the file from the working tree.
A count is "failed of total" for the case; a case that stops at an error ends at that check, so its total can be below the case's full count (`the call directory units` has 24 checks, `the call directories of a killed run` 42, `the call directories, stood in` 9, `a confined target's temp directory` 7, `the network reference` 262).
Every row failed at least one check except the two rows that say so.

The cases that ran on this host are all of them but `the call directory route` and the confined pipeline under Bubblewrap, which only the ubuntu job runs, so no row names them.
The row for each Linux-only behavior is carried by a case that runs here: the vector and the stand-in (`the call directory units`, `the call directories, stood in`) hold the binds, the environment and the bridge path that the route case runs for real.

| Criterion                                                           | Revert (on the copy)                                                                                               | Cases                                                                                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A killed run leaves no call temp directory in the temp directory    | `callTemporary` makes the directory in `os.tmpdir()` again (the story's first revert check)                        | `the call directory units` 2 of 24; `a confined target's temp directory` 1 of 7; `the call directories of a killed run` 8 of 42; `the call directories, stood in` 3 of 9 |
| A killed run leaves no port directory in the temp directory         | the port directory in `os.tmpdir()` again                                                                          | `the call directories of a killed run` 8 of 42; `the call directories, stood in` 2 of 9; `a started service's port` 5 of 26                                              |
| A killed run leaves no bridge directory in the temp directory       | `makeBridgeDirectory` ignores the private parent                                                                   | `the call directories of a killed run` 4 of 42; `the call directories, stood in` 2 of 9                                                                                  |
| A directory bound at a path the sandbox hides fails (second revert) | `callDirectoryMount` returns the directory's own path                                                              | `the call directory units` 13 of 24; `the call directories, stood in` 3 of 9; the golden 3 checks                                                                        |
| Each call directory is bound                                        | the binds left out of the vector                                                                                   | `the call directory units` 4 of 24; `the call directories, stood in` 5 of 9; the golden 2                                                                                |
| The call's environment names the mount                              | the environment passes as the call gave it                                                                         | `the call directory units` 2 of 24; `the call directories, stood in` 2 of 9; the golden 1                                                                                |
| The shim serves the bridge at the mount                             | the shim is given the bridge directory's own path                                                                  | `the call directory units` 1 of 24; `the call directories, stood in` 1 of 9; the golden 2                                                                                |
| The audit leaves the mounts out of the observed mounts              | the mounts taken out of the read grants                                                                            | `the call directory units` 1 of 24; the golden 1                                                                                                                         |
| The audit leaves the mounts out of the observed mounts              | the mounts taken out of the write grants                                                                           | `the call directory units` 1 of 24; the golden 1                                                                                                                         |
| Seatbelt allows each call directory again                           | `rootGrants` is empty                                                                                              | `the call directory units` 1 of 24; `a confined target's temp directory` 1 of 7 (the real Seatbelt run); the golden 1                                                    |
| One mount holds one directory                                       | the refusal of two call directories of one name taken out                                                          | `the call directory units` 1 of 24                                                                                                                                       |
| A directory outside the private root keeps its path                 | every grant treated as a call directory                                                                            | `the call directory units` 4 of 24; the golden case throws                                                                                                               |
| A live owner's parent stays                                         | the liveness check of `reclaimDeadPrivateParents` taken out                                                        | `the call directories of a killed run` 4 of 13 (the case stops at the removal)                                                                                           |
| Another evaluation's folder reclaims nothing                        | the record's folder check taken out                                                                                | `the call directories of a killed run` 4 of 42                                                                                                                           |
| Another evaluation's project root reclaims nothing                  | the record's root check taken out                                                                                  | `the call directories of a killed run` 3 of 42                                                                                                                           |
| A record naming another process removes nothing                     | the check of the record's directory against the owner's pid and the record's name taken out                        | `the call directories of a killed run` 5 of 42                                                                                                                           |
| A marker of other bytes removes nothing                             | the marker's byte comparison taken out                                                                             | `the call directories of a killed run` 3 of 20                                                                                                                           |
| A marker or record of mode 666 removes nothing                      | the type and mode checks of the journal record and the marker taken out in each of the three places that make them | `the call directories of a killed run` 3 of 17                                                                                                                           |
| A marker or record of mode 666 removes nothing                      | the mode check taken out of the two explicit checks and of `readPrivateRecord`                                     | `the call directories of a killed run` 3 of 17                                                                                                                           |
| The journal record's mode, the explicit check alone                 | the explicit mode check of the journal record taken out                                                            | `the call directories of a killed run` 0 of 42: `readPrivateRecord` makes the same check, so the pair is the removal rule                                                |
| The marker's mode, the explicit check alone                         | the explicit mode check of the marker taken out                                                                    | `the call directories of a killed run` 0 of 42: `readPrivateRecord` makes the same check, so the pair is the removal rule                                                |
| The removal restores write bits first                               | `unlockDirectories` taken out of `removeScratchDirectory`                                                          | `the call directories of a killed run` 3 of 42                                                                                                                           |
| The removal follows no link a target left                           | `removeScratchDirectory` removes the real path of each entry                                                       | `the call directories of a killed run` 1 of 41 (the canaries outside are removed)                                                                                        |
| The reference states where each call directory lives                | the old sentence back in place of the root sentence                                                                | `the network reference` 2 of 262                                                                                                                                         |
| The reference states the audit leaves them out                      | the audit sentence removed                                                                                         | `the network reference` 2 of 262                                                                                                                                         |
| The reference states a killed run's directories are reclaimed       | the reclaim sentence changed                                                                                       | `the network reference` 2 of 262                                                                                                                                         |
| Story 1.62's golden holds the new vectors                           | the golden of the commit before this story beside the new code                                                     | `node test/test-isolation-primitives.js` 1 check fails                                                                                                                   |

The marker's type and mode and the journal record's are each checked twice, in `reclaimDeadPrivateParents` and in `readPrivateRecord`, which also holds the descriptor to the inspected file (a swap between the check and the read).
A forged marker or record of mode 666 is stopped by either check, so removing one of them alone changes no result and the rows for one check alone say so; the rows that remove every place that makes the check fail the case.
A marker that is a link is stopped by four places (the type check in two functions, the mode of a link and the `O_NOFOLLOW` open), so no one of them alone is observable.
A wrong owner cannot be forged by a user who is not root, so no case sets one; the owner is part of the same checks.

The case `the call directories of a killed run` had three vacuous rows in its first version and was reworked until each row failed it: the first forged state for the folder named another folder and another root (the root check alone stopped it), the first record that named another process stopped at the marker's bytes before the pid rule, and its restore threw after a removal, so the failure was an error and no check.
The case now asks the recovery for another folder with this project's root and for this folder with another root, forges a record and a marker that agree on another dead process, and restores quietly so that a removal fails the check that follows it.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`.
`test:evaluate-confinement` ran once in full on the first build and the full group ran no more.
That run passed 2,424 of 2,425 checks; the one failure was `the observer's refusal of a run`, whose stand-in `bwrap` applied the last bind under `/dev` only (Decision 10), and the case passes since.

Local, macOS (Seatbelt, no `bwrap`), on the final tree:

- `test:isolation-primitives` (the golden regenerated once, diff above), `test:evaluate-run` (594), `test:evaluate-api` (4,523 with the new cases), `test:evaluate-preflight` (353, the non-Windows checks), `test:evaluate-agents` (501), `test:evaluate-private` (111), `test:evaluate-mutation` (727), `test:evaluate-arms`, `test:evaluate-evaluators`, `test:cli` and `test:atdd-isolation`: passed.
- The focused cases ran with `NODE_V8_COVERAGE` set to a scratch directory and without it: `the call directory units` (24), `the network reference` (262), `the observer's refusal of a run` (6), `the call directories of a killed run`, `the call directories, stood in`, `a started service's port` and `the confined pipeline` passed in both.
  `a confined target's temp directory` passes without the variable and fails with it on this host, on the base commit too: a Seatbelt target started by a Node process that has coverage on inherits the host's coverage directory, writes it and the audit lists the write.
  Bubblewrap unsets the variable in every vector, and the CI shards that set it run on Linux, so the Seatbelt case ran without the variable on this host.
- `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`, `test:doc-counts`, `test:doc-claims`, `test:shards`, `test:ci-coverage`, `test:changelog`, `test:direction`, `test:evaluate-boundaries` (500), `test:planning-doc-sources` and `npm run docs:build`: green.
- Linux: no container ran and this host has no `bwrap`.
  Ran on this host: the vector's text and order, the environment, the audit's grants and the Seatbelt profile (`the call directory units`), the three directories made by the layer's own code, killed with `SIGKILL` and reclaimed by a second preflight with planted content and forged records (`the call directories of a killed run`), a real preflight killed mid-call (`a started service's port`), the real sandbox, mechanisms, shim and HTTP port over a stand-in for Bubblewrap (`the call directories, stood in`), a real Seatbelt run that writes `TMPDIR` under the allowance (`a confined target's temp directory`), the reference claims and the golden.
  Runs only in the ubuntu CI job: `the call directory route` (real Bubblewrap: the target writes `TMPDIR`, writes a port file and answers through the bridge, finds the directories at `/dev/<name>` and nowhere else, and a control vector that binds them at their own paths finds them hidden) and the confined pipeline under Bubblewrap, whose audit lists none of the directories.
  The route case runs with `hostSockets: () => []`, so the launcher path under real Bubblewrap is covered by the Story 1.89 route case and the units read the launcher's file.
- No real agent CLI was started and no live run was made.
- `git diff -- package.json package-lock.json` is empty.

## Build review

One pass by a read-only subagent in place of `/bmad-code-review`, in four lenses (code, security, tests, records), run on the commit and the test edits after it.
Every finding was checked before it was acted on.
The coordinator's Opus review rounds run on the open pull request.
The code and security lenses found no defect.
The tests lens found no vacuous check and one flake, and the records lens found five wording and record findings.

| Finding                                                                                                                                                                        | Verdict | Route                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------- |
| Low: `checkCallDirectoryRoute` read the port file once it existed, and a file exists before its number is written (a read between the two gives port 0)                        | valid   | Fixed: the wait is for a numeric content                                                                        |
| Low: the reference's bullet on the private root still said a target cannot read or write under the root, and the paragraph on a killed run's leftovers named no call directory | valid   | Fixed: the bullet names the call directories and the home, the paragraph names the call directories             |
| Low: comments written or edited in this change wrapped a sentence across lines in seven places                                                                                 | valid   | Fixed: one sentence per line in `confinement.js`, `http-target.js`, `workspace.js` and `preflight.js`           |
| Low: `homeAncestors`, `homeRules` and one docblock phrase in `seatbeltTargetProfile` named the home alone                                                                      | valid   | Fixed: `reachableAncestors`, `reachableRules`, and the phrase names a call directory                            |
| Low: the amendments and the record carried two dates, and the sprint row was still `in-progress`                                                                               | valid   | Fixed: one date (2026-10-06, the build's own), and the row is `review`                                          |
| Low: the real-Bubblewrap route runs with no hidden socket, so the launcher path is not run there                                                                               | valid   | Stated in Gates: the Story 1.89 route case runs the launcher under real Bubblewrap, and the units read the file |

Round 0 left no finding open.
