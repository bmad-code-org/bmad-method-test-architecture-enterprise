---
title: "Sandbox the target's file system"
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5b1cad713fea51841edcc41262178b8e9335452b'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
---

<frozen-after-approval reason="Owner delegated the relay story and its delivery decisions">

## Intent

**Problem:** The evaluation runtime leaves the evaluation folder out of workspace copies but does not sandbox target processes or their descendants, allowing a target or a leftover background process to read withheld contracts or rewrite evaluation evidence in `runs/` or `evaluator/`.

**Approach:** Confine trial targets and leftover descendants to their workspace, read-only provisioned directories, and declared system paths via platform mechanisms (`seatbelt` on macOS, `bubblewrap` on Linux) with refusal on unconfined platforms unless opted out in `evaluation.json`. Write-protect `evaluator/` during evaluation execution, report observed paths outside the workspace in `isolationManifest.observedMounts`, update forbidden input accounting notes, and record confinement status in `run.json`.

## Boundaries & Constraints

**Always:** Enforce file-system confinement on every process the target spawns, including leftover processes. Restrict target reads to workspace, provisioned directories, and registry-declared `systemPaths`, denying reads of the evaluation folder (`contract.json`, `probes/`, `runs/`). Deny target writes outside the workspace. Protect the evaluation folder's `evaluator/` directory from writes during trial execution and evaluation. Refuse execution on unsupported platforms with exit 12 unless explicitly opted out (`confinement: false`). Populate `isolationManifest.observedMounts` from the confinement audit report so ungranted paths trigger eval-quality isolation violations. Record confinement mode (`seatbelt`, `bubblewrap`, or `opt-out`) in `run.json`. Maintain documentation parity in `docs/reference/tea-evaluate-cli.md`. Every acceptance criterion requires a demonstrated revert check.

**Never:** Allow an unconfined run on a platform without a supported backend unless opted out in `evaluation.json`. Never allow target writes to escape into `runs/` or the project root. Never allow writes into `evaluator/` between re-read and launch. Never leave `observedMounts` empty when ungranted paths are opened outside the workspace.

## I/O & Edge-Case Matrix

| Scenario                             | Input or state                                                                            | Expected behavior                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Target reads withheld contract       | Target attempts to read `contract.json` under the evaluation folder                       | Confinement denies read (`EACCES`/`EPERM`), run artifacts remain unchanged                            |
| Target writes to runs/               | Target attempts to write evidence into `runs/`                                            | Confinement denies write, run evidence remains intact                                                 |
| Ungranted path read                  | Target opens a path outside its workspace not declared in `systemPaths`                   | Path is recorded in confinement report and `observedMounts`; eval-quality reports isolation violation |
| Leftover process tamper              | Target exits leaving a background process that attempts to rewrite records and `run.json` | Confinement denies writes from leftover process; `score` verifies unchanged anchors                   |
| Evaluator swap window                | Target background process attempts to swap a file in `evaluator/` after re-read           | Write is refused, original bytes run, records hold correct digests                                    |
| Unsupported platform without opt-out | Platform lacking confinement mechanism (or missing tool) runs without opt-out             | `tea-evaluate run` exits 12 with unsupported platform refusal                                         |
| Unsupported platform with opt-out    | `evaluation.json` declares `confinement: false`                                           | Run proceeds unconfined, `run.json` records `confinement: "opt-out"`                                  |
| Forbidden input note                 | Manifest generated for trial set                                                          | Notes state that target file-system confinement withholds evaluation folder and evidence              |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/schemas/evaluation.schema.json`: the top-level `confinement` option and a shared `SystemPaths` definition (absolute paths) on command, tool-server and HTTP registry entries.
- `cli/lib/evaluate/confinement.js`: mechanism selection and probe (Seatbelt through `/usr/bin/sandbox-exec`, Bubblewrap through `bwrap` on PATH), the refusal, the target profile and argument vector, the evaluation-layer prefix, the target sandbox (wrap, audit environment, observed mounts), the confined command and MCP mechanisms, the report reader and the per-run forbidden-input note.
- `cli/lib/evaluate/confinement-guard.cjs`: the audit-only preload that appends each path a trial's Node process opens outside its grants to the report.
- `cli/lib/evaluate/confinement-status.cjs`: the shim Bubblewrap starts in a target's place, recording the signal that ended it (Bubblewrap forks and would report `128 + n`).
- `cli/lib/evaluate/preflight.js`: the confinement decided once in the shared pipeline, before anything starts, for `preflight` and `run` alike; the refusal (exit 12); `run.json`'s `confinement` from the first write; the registry built confined; the pristine, mutated and qualification ports given their workspace.
- `cli/lib/evaluate/registry.js`: `createRegistry`'s `confinement` option; `createProbePort` starting every command, tool-server and HTTP-server process through the confined mechanisms, with a per-port audit report (`audit: true`) and, under Bubblewrap, a status directory; `observedMounts()`.
- `cli/lib/evaluate/historical.js`: the historical ports given their workspace.
- `cli/lib/evaluate/run.js`: trial ports audited, `observedMounts` collected into each trial set's isolation manifest, the per-run forbidden-input note, and the evaluation-layer prefix passed to the command evaluator, the sealed-brief agent and the rubric judge (trials and calibration).
- `cli/lib/evaluate/command-evaluator.js`, `cli/lib/evaluate/sealed-brief-agent.js`, `cli/lib/evaluate/judge.js`, `cli/lib/evaluate/http-target.js`: each evaluation-layer process (and the HTTP port process) started through the layer prefix; the started server's port file handed to the mechanism so its directory is writable.
- `cli/lib/evaluate/records.js`, `cli/lib/evaluate/run-directory.js`: documentation of `observedMounts` and of the run directory's guards under confinement.
- `docs/reference/tea-evaluate-cli.md`: `### File-system confinement` under `## The workspace`, and the passages on the run directory, the isolation manifest, the evaluation layer and the bridge token.
- `test/test-evaluate-run.js`: the confinement cases (`--confinement-only` runs them alone) and the confinement and notes of the main run; `test/fixtures/evaluate/mutation/bin/verdict.js` and `verdict-leftover.js`: the stub's probe, ungranted-read, write-temp, leftover-tamper and swap-evaluator modes; `test/fixtures/evaluate/report-listener.cjs`: the listener a leftover process reports its attempt to.
- `test/test-evaluate-mutation.js`, `test/test-evaluate-evaluators.js`, `test/test-evaluate-arms.js`, `test/test-evaluate-mcp.js`, `test/test-evaluate-api.js`, `test/test-evaluate-workflow.js`, `test/test-evaluate-preflight.js`, `test/test-evaluate-calibration.js`, `test/test-evaluate-partitions.js`, `test/lib/evaluate-story-121.js`: the cases whose target or stub writes outside its workspace on purpose (launch markers, logs, pid files, sabotage) opt out; confined counterparts for preflight, the evaluation layer, MCP, HTTP, workflow, historical, gameability and the rubric judge.
- `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`, `CHANGELOG.md`, `_bmad-output/planning-artifacts/evaluate/epics.md`, `_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md`: story progress, changelog entry, and the follow-up stories for findings this story does not close.

## Tasks & Acceptance

**Execution:**

- [x] Add `confinement` and `systemPaths` to `cli/lib/evaluate/schemas/evaluation.schema.json`.
- [x] Implement `cli/lib/evaluate/confinement.js` and `cli/lib/evaluate/confinement-guard.cjs` for Seatbelt/Bubblewrap confinement and access auditing.
- [x] Connect confinement into `cli/lib/evaluate/registry.js` target probe mechanisms.
- [x] Enforce platform refusal / opt-out, `evaluator/` write protection, `observedMounts` population, and `run.json` confinement recording (in the shared pipeline, `preflight.js`, and `run.js`; see the Spec Change Log).
- [x] Update `docs/reference/tea-evaluate-cli.md` and the forbidden-input note (now per run, `confinement.js` `forbiddenInputNote`) and `records.js`.
- [x] Add integration cases in `test/test-evaluate-run.js` asserting all 6 acceptance criteria; the revert checks are recorded in the Review Triage Log.
- [x] Update `sprint-status.yaml` and `CHANGELOG.md`.

**Acceptance Criteria:**

- Given a trial running its interaction plan, when the target attempts to read the evaluation folder's `contract.json` or write into `runs/`, then both attempts are refused and the run's artifacts remain unchanged; reverting confinement lets the stub read the contract.
- Given a target that opens a path outside its workspace not declared in `systemPaths`, when the trial completes, then that path appears in `observedMounts` and eval-quality records an isolation violation; reverting the report leaves `observedMounts` empty.
- Given a platform without a supported confinement mechanism, when `tea-evaluate run` executes, then it refuses with exit 12 unless `evaluation.json` opts out with `confinement: false`, which `run.json` records as `confinement: "opt-out"`; removing the refusal lets an unconfined run proceed silently.
- Given a target that leaves a background process running after exit, when the process attempts to rewrite a sealed record and its digest in `run.json`, then the writes are refused; reverting confinement for leftover processes lets score pass the rewritten record through.
- Given the evaluation folder's `evaluator/` directory, when a background process attempts to swap a tracked evaluator file after re-read, then the write is refused and the records carry the digests of the bytes that ran; reverting confinement lets swapped bytes run under the original digests.
- Given the isolation manifest, when forbidden inputs are inspected, then their notes state the confinement that withheld them; and `docs/reference/tea-evaluate-cli.md` names each platform's mechanism under its exact heading, with deletion of a platform failing the case.

## Revert checks

- Contract and runs confinement: `test/test-evaluate-run.js` asserts read of `contract.json` and write into `runs/` are refused. Reverting confinement lets the stub read the contract, failing the refusal assertion.
- Observed mounts report: `test/test-evaluate-run.js` asserts ungranted path appears in `observedMounts` and triggers an eval-quality isolation violation. Reverting the report clears `observedMounts` and fails the violation assertion.
- Platform refusal and opt-out: `test/test-evaluate-run.js` asserts exit 12 on unsupported platform and `run.json` records `confinement: "opt-out"` when opted out. Reverting refusal allows unconfined execution silently, failing the exit 12 assertion.
- Leftover process confinement: `test/test-evaluate-run.js` asserts background process writes are blocked. Reverting leftover process confinement allows the record rewrite to pass to the engine, failing the integrity assertion.
- Evaluator write protection: `test/test-evaluate-run.js` asserts `evaluator/` swap write fails and original bytes run. Reverting write protection runs swapped bytes under original digests, failing the assertion.
- Reference documentation and notes: `test/test-evaluate-run.js` asserts reference heading contents and manifest note wording. Deleting a platform or restoring Story 1.8 note fails the test.

## Verification

- `node test/test-evaluate-run.js`
- `node test/test-evaluate-check.js`
- `node test/test-evaluate-workflow.js`
- `node test/test-evaluate-mutation.js`
- `node test/test-evaluate-mcp.js`
- `node test/test-evaluate-api.js`
- `npm run lint`
- `npm run lint:md`
- `npm run format:check`
- `npm run docs:validate-links`
- `npm run docs:build`
- `npm test`

## Review Triage Log

- Draft verification (2026-09-29): the working tree held an unreviewed partial attempt. `node test/test-evaluate-evaluators.js` exited 1 because the draft wrapped the pre-launch re-read (`holdLayer`) in its own `try`, outside the `catch` that turns an `EvaluatorError` into the exit-12 stop, so a target's write into `evaluator/` escaped as an uncaught error. The draft was replaced rather than patched: its in-process guard enforced access (so reverting the OS mechanism left the tests green), its `chmod` of the adopter's `evaluator/` wrapped only the synchronous re-read and never the launch window (and the owner can restore write bits), its confinement granted writes to any environment path whose key ended in `_MARKER` or `_LOG` (a hole shaped by the test fixtures), `TEA_EVALUATE_CONFINEMENT_BACKEND=opt-out` bypassed confinement from the environment, the preflight legs and qualification arms ran unconfined, and its revert checks were tautologies over string constants.
- Revert checks, each run as `node test/test-evaluate-run.js --confinement-only` on a copy with one change, on macOS 27.0.1 (Seatbelt):
  - AC1: the target profile's evaluation-folder denial removed: fails `a confined target's read of contract.json ended "allowed"; expected a refusal`.
  - AC2: `createProbePort` returns an empty `observedMounts()`: fails `P-001's observed mounts are []; expected [<the file>]`, `score over an observed ungranted mount exited 0; expected 3`, and the evaluation-folder audit.
  - AC3: the refusal replaced by an unconfined run: fails `run on a platform with no confinement exited 0; expected 12` and `a refused run on a platform with no confinement wrote a run directory`.
  - AC4: targets started through the unconfined command mechanism (the mechanism is what holds a leftover process): fails `a confined leftover process rewrote record-1.json: FAIL` and `score after a confined leftover process exited 3; expected 0`.
  - AC5: targets allowed to write `evaluator/` and the evaluation-layer prefix dropped: fails `a confined run's trial-clean-1 was judged by other bytes than the ones it digested: ... "swapped bytes ran"` and the clean control's finding.
  - AC6: Story 1.8's note restored and Linux's line deleted from the passage: fails the confined note, the opted-out note and `the reference's confinement section does not name Linux's mechanism`.
- Each confinement case also runs an opted-out control whose same attempt lands (the contract read, the `runs/` write, the leftover's rewrite reaching the engine, the swapped bytes running under the original digests), so no confined assertion passes for want of an attack.
- Linux (Bubblewrap 0.8, Debian bookworm container, unprivileged user) exposed two defects the macOS runs could not: Bubblewrap answers a read under the covered evaluation folder with `ENOENT`, which the audit skipped as a missing path (fixed: the evaluation folder is always reported), and Bubblewrap forks the command and exits `128 + n` for a signal, which read a killed target as an exit code (fixed: `confinement-status.cjs`). The HTTP port failed under the layer prefix because `evaluator/` did not exist to bind (fixed: evaluation-layer processes hold the whole evaluation folder read-only).
- Also found by the gates: `eval-quality-gates doc-claims` refused `EPERM`, `EROFS` and `systemPaths` in the reference (the two codes joined `symbols.foreign` beside `ENOENT` and `EACCES`; `systemPaths` is now a declared binding in `registry.js`).
- Known limit on Linux: a Bubblewrap-confined process that a group kill ends is orphaned when `bwrap` dies, so its zombie waits for PID 1 to reap it. A host with a reaping init (the GitHub runner's systemd, `docker run --init`) passes the hung-evaluator case; a container whose PID 1 reaps nothing leaves the killed pids visible to `kill -0`.
- Validation run: `node test/test-evaluate-run.js`, `test-evaluate-mutation.js`, `test-evaluate-evaluators.js`, `test-evaluate-check.js`, `test-evaluate-workflow.js`, `test-evaluate-mcp.js`, `test-evaluate-api.js` and every other `test/test-evaluate-*.js` on macOS (Seatbelt); the same suites on Linux (Bubblewrap, all passing save environment-only failures that fail identically at HEAD: promptfoo's missing `linux-arm64` libsql binding in the shared macOS `node_modules`, and read-only or `.git`-less copies); `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`, `npm run docs:build`, `npm test` (exit 0).
- Local review round 1 (three layers: blind hunter B1 to B17, verification gaps G1 to G6, edge cases E1 to E15), second worker's share. Each finding was checked against the code as it stood; every revert check ran on a copy of the tree with one change, macOS 27 (Seatbelt), naming the failure it produced:
  - B4/E7 (real): the audit tested the grants before the evaluation folder, so a `systemPaths` entry over the project or the home directory hid a contract read. The evaluation folder is now reported whatever grant covers it. `check` does not refuse an ancestor system path, since a toolchain under the home directory is legitimate and the mechanism refuses the read anyway. Revert (grants first): the audit unit fails `the audit reported [".../outside/secret.txt", ...]; expected ... the withheld contract under a granted project`.
  - E6 (real): a path was granted when its spelling lay under a grant, so a link in the workspace to a host file read unreported. Grants are judged, and paths reported, by real path. Revert (spelling or real path): the audit unit fails, reporting the contract alone and not the link's target.
  - E8 (real): the Node installation was `execPath/../..`, which is `/` for a node at `/bin/node`, granting every path. `nodeInstallRoot` falls back to the executable's directory. Revert: `the audit's Node installation for /bin/node is /`.
  - E9 (real): a temp directory whose path holds a quote, a backslash or a line break passed selection and threw `ConfinementError` mid-run. Selection refuses it with exit 12. Revert: the run exits 12 at M-001's baseline with a port failure after writing a run directory, failing `a run whose temp directory no profile can carry wrote a run directory`.
  - E11 (real): system paths were keyed by target, so two entries over one target shared each other's grants (the request eval-quality hands the mechanism names no interface). `check` refuses two entries that start one target with different `systemPaths` (`sharedTargetSystemPaths`). Revert: `two entries starting one target with different system paths: check exited 0; expected 10`.
  - E12 (real): the status shim re-raised the target's signal at itself, and Node ignores `SIGPIPE` and starts its inspector on `SIGUSR1`, so the shim exited 0. It sets `128 + n` first. Revert: `the status shim over a target SIGPIPE ended recorded "SIGPIPE" and ended {"status":0,"signal":null}`.
  - B5/E10 (real): a confined target had no writable temp directory (`/tmp` read-only under Bubblewrap, `TMPDIR` denied under Seatbelt). Each confined command and tool-server call gets a private temp directory named by `TMPDIR`, `TMP` and `TEMP`, granted to the audit and removed when the call ends. Reverts: the directory left out of the call's writable paths fails `a confined target could not write the temp directory it was handed: ... temp-write: refused EPERM`; the variables left out fails the tool-server unit.
  - B6 (real, documentation): a target's `git add`, `commit`, `stash` and `checkout -b` write the project's git directory and fail; the reference says so and that such a target opts out.
  - B7 (real): the probe's refusal named no likely cause. It now names one per mechanism (a restricting Seatbelt sandbox around `tea-evaluate`, verified: nested `sandbox-exec` exits 71 with `sandbox_apply: Operation not permitted` under any profile that restricts; unprivileged user namespaces for Bubblewrap), and the reference says a confined target cannot start `sandbox-exec` itself. Revert (hint dropped): `a mechanism whose probe fails: run exited 12; expected 12 naming [... "unprivileged user namespaces" ...]`.
  - B8 (partly real): eval-quality's MCP adapter reports no exit for a tool server (`the server exited during <phase>`), so the signal-number half does not apply; the status a signal left was never removed, so one file per MCP call piled up in the status directory. The MCP mechanism removes it once each call ends, and `recordedSignal` removes a file it cannot parse too. Revert: the tool-server unit fails on the status file left.
  - B9 (real): `epics.md`'s Story 1.31 criteria (reach nothing else, the report, the evaluation layer) and `test-design-epic-1.md`'s rows and file list are amended where the implementation deviates (reads reported, Node-only audit, the whole folder read-only for the layer, the extra refusals, the attempt reports).
  - B10 and G4 (real): new cases for `preflight`'s refusal (shares AC3's revert), a mechanism whose probe fails (a stub `bwrap` on `PATH` under `TEA_EVALUATE_CONFINEMENT_PLATFORM=linux`), a temp directory inside the evaluation folder, an evaluation folder whose path holds a quote, the workspace-inside-the-folder `ConfinementError`, and the status shim's signal path. Reverts: probe skipped fails `run exited 11; expected 12`; the inside-temp check removed fails with the run ending on a mid-run `ConfinementError`; the quoted-folder check removed fails `a run whose evaluation folder no profile can carry wrote a run directory`; the workspace check removed fails `a workspace inside the evaluation folder was not refused: null`.
  - B11 (real): the confined leftover and swap cases asserted only that nothing changed, which a process that never attempted also satisfies. The stub's leftover now reports its attempt to a listener the case runs on 127.0.0.1 (the network is not confined; `test/fixtures/evaluate/report-listener.cjs`), and the three-second linger is gone. Reverts (the leftover exits before attempting): the confined arm fails `the leftover process reported null; expected its rewrite refused`, where the old assertions (record PASS, score 0) still passed; the swapper likewise fails `the swapping process reported null`. The one-second window in the swap case's wrapper affects only the opted-out control, which fails loudly when missed.
  - B12 (real): `quality.yaml` and `publish.yaml` described Bubblewrap as the atdd backend only; the comments and step names now name tea-evaluate's confinement.
  - B13 (real; became Story 1.62): extracting shared primitives from `cli/lib/isolate.js` and `cli/lib/atdd-isolation.js` reaches two other features' isolation proofs, so it became Story 1.62 at the end of Epic 1 (`epics.md` criteria with revert checks, `test-design-epic-1.md` section, dependency row 62, `sprint-status.yaml` backlog row).
  - B14 (real for `run-agent.js`, false for the others): under a spawn prefix a missing agent read as the wrapper's exit (`Agent "/bin/sh" exited with code 126.`). `agentInvocation` names a missing agent `AGENT_NOT_FOUND` before anything starts, and failures name the agent's command. The command evaluator names `evaluator.command` in every message and `check` refuses a missing or untracked executable; the HTTP port runs `process.execPath`. Revert: `test/test-test-review-cli.js`'s two new cases fail with the wrapper's exits 126 and 1.
  - B15 (real): the guard's comment claimed it saw every open. It names the wrapped functions and what it does not see (the module loader's lookups, `watchFile`, native addons, non-Node processes), and `lchmod`, `lchown`, `lutimes` and `watch` are wrapped. Revert (`lutimes` unwrapped): the audit unit fails, the file it wrote unreported.
  - B16 (real): `runCase`'s doc comment sat above the inserted confined functions in `test-evaluate-api.js`, `test-evaluate-mcp.js` and `test-evaluate-arms.js`; moved back.
  - B17 (real): `score` over an opted-out run read like a confined one. Its summary and log say the run opted out, and `score.json` records `confinement`. Revert (all three removed): `score over an opted-out run did not say its targets ran unconfined`.
  - G1 (real): five evaluation-layer call sites had no test that failed without their `spawnPrefix`. The stub judge, stub evaluator agent and stub command evaluator take `--plant <file> --plant-log <log>` and try a write under `runs/`, asserted refused in a confined run beside an opted-out control where it lands (`test-evaluate-evaluators.js` `checkLayerWritesRefused`, the end of `test-evaluate-calibration.js`, and `test-evaluate-api.js` `checkConfinedServiceReads` for the HTTP port). Reverts, one `spawnPrefix` removed each: judge trial and calibration, command evaluator trial and calibration, sealed-brief agent trial and calibration, each failing `a confined run's <kind> wrote into the evaluation folder during <phase>: [... "allowed" ...]`; the HTTP port's fails `a confined HTTP port's writes under the evaluation folder ended ["allowed", ...]`.
  - G2 (real): `checkConfinedServerReads` (MCP) and `checkConfinedServiceReads` (HTTP): the contract read refused and listed by real path, an ungranted read listed, and unlisted under a declared system path, beside an opted-out control. Reverts: empty `observedMounts`, `systemPathsOf` returning nothing, and an unwrapped mechanism each fail.
  - G3 (real): the row-converting evaluator's `observedMounts` was never asserted non-empty; the confined swap case asserts P-001 lists the `evaluator/impl.js` the swap was refused. Revert (`observedMounts: []` in `concludeWithRows`): `a confined run's P-001 does not list the swap it refused as an observed mount: []`.
  - G5 (real): `checkConfinedDeploymentRoute` in `test-evaluate-arms.js` runs the historical deployment route confined. Reverts (`workspace` dropped from `deploymentRoute` or `qualifyDeploymentProbe`): `a confined deployment-routed run exited 12; expected 0`.
  - G6 (real): `test-evaluate-check.js` refuses a relative system path and one holding a quote, and accepts two entries sharing a target with the same paths. Revert (the pattern relaxed to `minLength`): `a registry entry declaring a relative system path: check exited 0; expected 10`.
  - E13 to E15 (duplicates): of B1 (the lead's share), B9 and B15.
  - Found by the gate: `test:direction` refuses a test's `require` of a `.cjs` module, so the unit reads the guard's `nodeInstallRoot` in a child process.
  - Validation for this share: `npm test` through `test:boundary` (`test:evaluate-run` 531 checks, `test:evaluate-check` 695, `test:evaluate-evaluators` 620, `test:evaluate-mcp` 173, `test:evaluate-arms` 398, `test:cli` and the rest passing), then `test:direction` failed as above; after the fix, `test:direction` and every later script in the chain (`test:lineage`, `test:guard-publish`, `test:layering-boundary-lineage`, `test:changelog`, `test:tea-workflow-descriptions`, `validate:schemas`, `lint`, `lint:md`, `format:check`), `docs:validate-links`, `docs:build` and `test:doc-claims`, each exit 0, on macOS only; the Linux run is left to CI.
  - For the lead's B1 work: a PID namespace (`--unshare-pid`) hides the runtime and `evaluator/judge.sh` from the verdict stub's `pgrep`, so the leftover and swap cases would need another way to find them on Linux.
- Pending: the coordinator's code review passes.

- Round 1, escape-hardening findings (worked by the coordinator; the implementer's safety classifier declined them):
  - B1/E1 real, fixed: the Bubblewrap vectors shared the host's procfs, so a same-user target could open `/proc/<runtime pid>/root/<evaluation folder>`. They now carry `--unshare-pid --proc /proc`, which also ends what a target leaves running with the target. Revert (flags removed) fails the vector unit. The leftover and swap cases hold on Linux that no rewrite ever lands (a namespaced leftover is killed with the target, or refused). Not runnable here: Docker was down, so the first Linux run is CI.
  - E2 real, fixed: `--die-with-parent` on the target, layer and probe vectors, so a timed-out HTTP port's forked process ends with the `bwrap` the runtime killed. Same unit and revert.
  - B2/E3 macOS half false: under the real write-deny profile `launchctl submit` exits 1 while it succeeds unsandboxed, so no unconfined job starts. Linux half real, partly fixed: `/run/user` is now an empty tmpfs, which closes the path-based session bus. An abstract socket stays reachable because the target shares the host's network namespace for the HTTP service; that became Story 1.63 (and the reference says so).
  - B3/E4/E5 real, fixed to the extent a file can be: the report and the call's status file are the only audit files the target may write (grants name the files, not their directories, and the registry pre-creates the report), the status file name is random per call, and a report cut shorter than an earlier read or padded past the read limit is listed as its own path in `observedMounts`. Reverts fail the tamper unit (grant restored to the directory, size check removed, predictable status name). A rewrite to the same length still hides a line: Story 1.63 moves the audit onto a channel the runtime holds.

## Spec Change Log

- Created for Story 1.31 from planning artifacts (`epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` AD-7/AD-8).
- 2026-09-29, implementation: the Code Map named `run.js` for the platform check and the confinement wiring; the check lives in the shared pipeline (`preflight.js`), so `tea-evaluate preflight` confines and refuses as `run` does, and the preflight legs and qualification arms of a `run` are confined with its trials ("every process the target spawns"). `run.json` records `confinement` from its first write, a stopped run included.
- 2026-09-29, implementation: "write-protect `evaluator/`" is a confinement of every evaluation-layer process (the command evaluator, the sealed-brief agent and the bridge relay it starts, the rubric judge, the HTTP port) through the same mechanism, holding the whole evaluation folder read-only, `runs/` included; a target is denied every read and write of the folder. Nothing changes the modes of the adopter's files.
- 2026-09-29, implementation: reads outside the grants are reported, not refused: node, git and a target's toolchain read from the system and the project's git directory, and the I/O matrix's ungranted read is "recorded". The audit covers Node processes (the Code Map's in-process guard); the mechanism refuses whatever the process.
- 2026-09-29, implementation: `FORBIDDEN_INPUT_NOTE` became a note per run naming the mechanism (`Withheld as well by macOS Seatbelt (sandbox-exec) file-system confinement: ...` or Linux Bubblewrap), or saying the run opted out; an opted-out run never claims a confinement.
- 2026-09-29, implementation: `TEA_EVALUATE_CONFINEMENT_PLATFORM` names the platform the mechanism is chosen for, which the AC3 case uses to stand in for a platform with none; it can only take a mechanism away.
- 2026-09-29, review round 1: each confined command and tool-server call gets a private temp directory (`TMPDIR`, `TMP`, `TEMP`), since a confined target can write nothing else outside its workspace; the audit judges and reports paths by real path and reports the evaluation folder under any grant; `check` refuses two registry entries over one target with different `systemPaths`; `score` names an opted-out run; `epics.md` and `test-design-epic-1.md` carry the amended criteria, and Story 1.62 takes the shared sandbox primitives.
