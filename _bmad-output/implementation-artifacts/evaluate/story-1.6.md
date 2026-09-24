---
title: 'Story 1.6: Probe a skill through the generic runner and tea-evaluate preflight'
type: 'feature'
created: '2026-09-24'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'd86ac42'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.6)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.6 section, R1-02, R1-10)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-4, AD-5, AD-6, AD-7, AD-10, AD-12)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** Every TeA runner wraps one skill, so an adopter evaluating their own skill has no command to register, and `tea-evaluate` cannot yet drive a single leg against a target, so no real observation reaches `eval-quality preflight`.

**Approach:** Ship `tea-skill-runner` (`cli/skill-runner.js`), a vendor-neutral runner over an explicit `--skill-root`, and `tea-evaluate preflight`, which runs `eval-quality compile` and `seal`, drives the contract's legs through `runPreflight` with a recording port over the registry's command-line adapter, persists every observation under `runs/<invocationId>/`, and passes through the exit of `eval-quality preflight --observations --run-id`.
`evaluation.json`'s `launch` gains its first shape: the target `root` and, for a skill, its `skillRoot`, under which `check` holds every mutation's `targetArtifact`.

## Boundaries & Constraints

**Always:** vendor knowledge stays in `cli/lib/agent-adapters.js`; `engine.js` stays the only `cli/` file loading eval-quality; no identifier `seal`, `runScore` or `preflightFromObservations` and no non-Ajv `compile` under `cli/`; the enforced verdict and its exit come from the engine CLI; request environment values are never persisted.

**Never:** probe install locations; build the disposable copy, mutation or leg routing (Story 1.7); materialize a qualified probe (its evidence does not exist before the arms run).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Stub passes | preflight fixture over the stub agent | exit 0, verdict `passed`, `runs/<id>/observations/` holds every leg | N/A |
| Shim verdict | `TEA_EVALUATE_ENGINE_CLI` shim: 0, 0, then 5 | exit 5; the shim's log holds the preflight argv with `--observations` and `--run-id` | N/A |
| Failing control | first witness leg's stub exits non-zero | runner exits 4, CLI exits 3, `tea-evaluate` exits 3, and the direct CLI over the persisted files exits 3 | N/A |
| Entry removed | the stub's registry entry replaced by one with another executable | the leg is denied; a fault record under `runs/<id>/faults/`, exit 10 | no CLI preflight call |
| Seeded probe | a committed probe with a manifestation witness | exit 12 before any leg: its leg runs against the mutated copy Story 1.7 builds | N/A |
| Runner usage | no `--skill-root`, or a skill root outside the working directory | runner exit 2 | N/A |
| Runner infra | missing skill root or `SKILL.md`, agent failure, timeout | exit 3, 4, 5 | a crash maps to 4, never 1 |

</frozen-after-approval>

## Code Map

- `cli/trace-runner.js`, `cli/lib/run-agent.js`, `cli/lib/runner-exit-codes.js` -- the runner shape the generic runner generalizes; reuse `runAgent`, `EXIT_CODES`, `classOfAgentError`.
- `cli/lib/evaluate/registry.js` -- `registryFromEvaluation`, `createProbePort`, `hostEnvironment`, `targetProblems`; unchanged.
- `cli/lib/evaluate/engine.js` -- `loadEngine` (for `runPreflight`), `engineCliPath` (honours `TEA_EVALUATE_ENGINE_CLI`); stays synchronous.
- `cli/lib/evaluate/check.js` -- `checkMutations` gains the `skill-root` rule.
- `cli/evaluate.js` -- the `preflight` subcommand and its exit mapping.
- `test/test-evaluate-boundaries.js` -- scanner; gains a rule over `cli/skill-runner.js`.
- `node_modules/eval-quality/dist/adapters/command-line-adapter.js` -- a denial is a thrown `forbidden-target` fault whose detail omits the reason code.

## Tasks & Acceptance

**Execution:**

- [x] `cli/skill-runner.js`, `package.json` bin `tea-skill-runner` -- the generic runner.
- [x] `cli/lib/evaluate/{engine-cli,preflight}.js`, `cli/evaluate.js` -- the preflight subcommand.
- [x] `cli/lib/evaluate/schemas/evaluation.schema.json`, `cli/lib/evaluate/check.js` -- `launch` shape and the `skill-root` rule.
- [x] `test/fixtures/evaluate/{stub-agent,preflight,engine-shim.js}`, `test/test-evaluate-preflight.js`, `test/test-evaluate-check.js`, `test/test-evaluate-boundaries.js` -- tests.
- [x] `package.json` script, `.github/workflows/quality.yaml` step, `docs/reference/tea-evaluate-cli.md`, CHANGELOG, sprint-status.

**Acceptance Criteria:** epics.md Story 1.6; each revert check in test-design-epic-1.md's Story 1.6 table is exercised once.

## Implementation Notes

- **Implemented directly.** The workflow's implementation subagent was not used: this build already runs as a subagent of the coordinator, and the design decisions below were made during investigation.
- **The runner.** `cli/skill-runner.js` is the shared turn of `cli/*-runner.js` with the workflow taken out: `--skill-root` and `--agent` are required (no vendor default), the prompt is read on stdin, and the agent receives two framing lines naming the skill root (relative to the working directory) before the evaluation's own prompt.
  The skill root must resolve inside the working directory before and after symbolic links are resolved (usage, exit 2) and must be a directory holding `SKILL.md` (configuration, exit 3).
  `--capability` takes the shared tiers, `scoped-artifact-writes` by default.
  Every thrown path goes through `main`, and an unexpected error exits 4, so the runner never exits Node's 1 and its `INFRASTRUCTURE_EXIT_CODES` (derived from `runner-exit-codes.js`) are exactly 3 to 6.
  The existing per-workflow runners stay: each is a registry target of TeA's own harness and a declaration source for `tools/generate-contracts.js`.
- **The launch.** Story 1.6 is the first story to launch a target, so it gives `launch` its shape: `root` (the evaluated project relative to the evaluation folder, `..` allowed) and `skillRoot` (relative to `root`, required by an `if`/`then` when `targetKind` is `skill`).
  `check` does not test that either exists, because `check` runs over temp copies whose relative root lands elsewhere; `preflight` runs the registry's `targetProblems` and the runner reports a missing skill with exit 3.
- **Preflight.** `cli/lib/evaluate/preflight.js` runs `check`, refuses a non-`cli` interface or a probe that seeds a defect with exit 12, copies `launch.root` into a temp directory (without `.git` and the evaluation's `runs/`, provisioned directories linked in writable, removed in `finally` and on an interrupting signal; after final review round 1, symbolic links are contained and a link out of the root, a special file or a temp directory inside the root is refused), refuses an unlaunchable registry target in the copy with exit 12, copies `contract.json` into the run, runs `compile` and `seal` over that copy through `engine-cli.js`, drives `runPreflight` through a recording port over `registry.createProbePort({ cwd: copy })`, and passes through the exit of the CLI's `preflight`.
  `runs/` gets a `.gitignore` holding `*` on first use.
  The recording port adds the host's values for the registry entry's `environmentKeys` beneath the leg's own environment (the command-line adapter hands a child only PATH and the request's keys) and persists each request with its environment reduced to keys.
  Every injected value of eight characters or more is scrubbed from the observation before it is written or returned.
  The library's closing diagnostic line (its own verdict) is not printed.
- **Denials.** eval-quality's command-line adapter throws every policy denial as `RuntimeFault('forbidden-target', ...)` whose message omits the reason code (`command-target-policy.js`), and the reason is not exported.
  The runtime records the fault under `faults/` and exits 10 (AD-10's registry mismatch); any other leg fault exits 12.
  Neither calls the CLI's `preflight`, since the leg set is incomplete and no verdict exists to pass through.
  A `runPreflight` error with no recorded fault falls through to the CLI only when no leg reached the port and it is a planning refusal (`StructuralFailure`, or a `schema-parse-failure` or `schema-version-mismatch` fault); anything else exits 12.
- **Probe list.** A probe reaches the CLI only in eval-quality's full `Probe` shape, whose every qualification route requires evidence references that exist only after the arms run (Stories 1.7 and 1.8).
  The preflight plan reads nothing from a clean control, and a seeded probe's witness leg must run against the mutated copy Story 1.7 builds, so `probes.json` is `[]` and an evaluation holding a seeded probe is refused with exit 12 before any leg.
- **Engine CLI.** `engine-cli.js` spawns `engineCliPath()` (a `.js` path under this process's Node), records the executable, whether `TEA_EVALUATE_ENGINE_CLI` substituted it, argv, exit code, stdout and stderr in `engine/<stage>.json` (also when the spawn fails), announces a substitution, and raises `EngineStageError` (exit 12) when the stage cannot start, dies by a signal, or exits with a code eval-quality does not document for that stage (after final review round 1: `compile` and `seal` 0, 4, 5, 64; `preflight` 0, 3, 4, 5, 64; `score` 0, 2, 3, 4, 5, 64).
  `cli/evaluate.js` maps any other error that stops a preflight to 12 and escapes every printed line.
- **Check rules for the runner.** `skill-root` also refuses a runner leg or plan step whose `skill-root` is not `launch.skillRoot`, and a skill root inside a provisioned directory; `skill-runner` refuses a runner entry (target basename `tea-skill-runner` or `skill-runner.js`) missing 3 to 6, and a runner leg or plan step with no literal `timeout-ms` below the entry's `maxElapsedMs`.
  The preflight fixture's target is now the stub project (`launch.root: ../stub-agent`), with the runner registered by its bin name, which the test puts on PATH the way `npm exec` does.
- **Boundaries.** `test:evaluate-boundaries` gains `install-probe` (`homedir`, a `HOME`/`USERPROFILE`/`XDG_CONFIG_HOME` read, an agent skills folder or `_bmad` in a string, loading `lib/resolve-skill`) and `vendor-name` (an adapter key other than `custom`, or `anthropic`, `openai`, `gemini`, in an identifier or string) over `cli/skill-runner.js`, with seven plants and two clean plants.
- **Doc claims.** `docs/reference/tea-evaluate-cli.md` now documents runner exits 4 to 6 and pass-through exits, so the `doc-claims` exit-code registry (`test/lib/doc-claim-sources.js`) adds the runner table, and `test:doc-claim-sources` asserts it.
- **Gaps closed on the way.** `README.md` read "seventy-nine" `npm test` checks after this story added the eightieth, which `test:doc-counts` caught; both occurrences now read eighty. `docs/explanation/eval-quality-roadmap.md` counted eleven bins and described `tea-evaluate` as check and digest only; it now names the twelfth bin and preflight. `docs/reference/tea-evaluate-cli.md` is rewritten to one sentence per line throughout. `.gitignore` covers `runs/` under the evaluate fixtures, which a maintainer running `tea-evaluate` by hand would otherwise leave as untracked output.

### Revert checks exercised

Each was undone locally, the named failure observed, and the change restored.

- Runner install lookup (`os.homedir()` joined with `.claude/skills` added to `resolveSkillRoot`): `test:evaluate-boundaries` reports `cli/skill-runner.js:108 [install-probe] names ".claude"`, `[install-probe] names "homedir"`, and `[vendor-name]`.
- `skill-root` rule disabled in `check.js`: the three `skill-root` cases exit 0 (outside the root, sibling-prefix directory) or lose the finding (climbing out after entering), five checks fail.
- Library verdict written in place of the CLI call (`runPreflight`'s verdict to `preflight-verdict.json`, exit 0 or 3 from `passed`): the passing case reports "the run recorded no eval-quality preflight call", and under the logging shim the command exits 0 where the shim's preflight exit is 5.
- A mapped verdict exit (`exitCode === 0 ? 0 : 12`): the shim case exits 12 (expected 5) and the failing-control case exits 12 (expected 3).
- The stub's registry entry removed from `test/fixtures/evaluate/preflight/evaluation.json` (its executable renamed): the passing case exits 10 and reports `faults/001-witness-alpha.json records forbidden-target`, an empty `observations/` and a missing verdict.
- `--skill-root` made optional and every agent error flattened to transport: "no --skill-root exited 4; expected 2" and "an agent that outlives --timeout-ms exited 4; expected 5".
- The runner's catch-all rethrowing: "an unexpected runner error exited 1; expected 4".
- Requests persisted with their environment values: the recorded request lists no key and two observation files hold the value.

Review round (each fix undone once, the named case failing):

- The runner-leg `skill-root` comparison disabled: "check with a leg handing the runner another skill root exited 0; expected 10".
- The `timeout-ms` comparison disabled: "check with a runner leg with no --timeout-ms exited 0" and the at-ceiling case.
- Legs run in `launch.root` itself: "a leg wrote into the target root; legs run in a disposable copy".
- Observation scrubbing removed: the echoed value appears in the observation and in `observations.json`.
- The `SKILL.md` realpath containment removed: "a SKILL.md linked outside the working directory exited 0; expected 2".
- Undocumented stage exits passed through: "preflight whose compile exits an undocumented 1 exited 1; expected 12".

## Spec Change Log

- 2026-09-24: epics.md Story 1.6, first criterion, amended: `launch` declares the skill root as `skillRoot` beside `root`, since this story is the first to launch a target and the criterion's "that skill root" had nowhere to live.
- 2026-09-24: epics.md Story 1.6, the no-denial criterion, amended: eval-quality's command-line adapter throws `interface-not-authorized` and `executable-not-authorized` as one `forbidden-target` fault whose message omits the reason, so the runtime records leg faults and exits 10, and the test asserts no fault and none of the three names. test-design-epic-1.md's row amended to match.
- 2026-09-24: epics.md Story 1.6, the removed-entry criterion, amended: a registry holds at least one entry, so the test replaces the stub's entry with one for another executable (and, after review, one under another interface).
- 2026-09-24: epics.md Story 1.6 gains a criterion: the probe list the CLI receives holds no probe that seeds a defect, and such an evaluation exits 12 before any leg, because a `Probe` cannot be materialized before its qualification evidence exists and a witness leg needs Story 1.7's mutated copy.
- 2026-09-24 (review round 1): epics.md Story 1.6 gains a criterion: legs run in a temp copy of `launch.root`, and `check` ties every runner leg to `launch.skillRoot` and to a `--timeout-ms` below its entry's ceiling. The first build ran legs in `launch.root` and never compared the legs' skill root with the launch's.

- 2026-09-24 (final review round 1): epics.md Story 1.6, the copy criterion, amended: the provisioned directories are linked in writable, so the claim that a leg writes nothing into the adopter's tree was false for them; the criterion now says a write under the copied tree stays in the copy, symbolic links included, and provisioned directories stay writable until Story 1.7's read-only provisioning (coordinator decision F2).
- 2026-09-24 (final review round 1): epics.md Story 1.6, the no-denial criterion, and test-design-epic-1.md's "No authorization denial" row amended: the denial scan names `observations/`, `faults/`, `observations.json` and `preflight-verdict.json`, the files the test reads, where both said "anywhere in the run" (W1).

## Review Triage Log

Three layers ran on opus in parallel: `bmad-code-review` (blind, edge-case, verification-gap and acceptance sub-layers), `bmad-testarch-test-review`, and `bmad-review` adversarial.
Each finding was checked against the code before acting.
C = code review, T = test review, A = adversarial.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| C1, A1 | high | `launch.skillRoot` never tied to the legs' `--skill-root` | fixed: `skill-root` rule over runner legs and plan steps; test case |
| A2 | high | legs ran in the adopter's tree with write tools; stale artifacts could be read back | fixed: a temp copy of `launch.root` per invocation, removed in `finally`; test that a writing leg leaves the target untouched and the copy is gone |
| A3 | high | the adapter's timeout SIGKILLs the runner and orphans its agent | fixed in TeA as far as TeA reaches: `skill-runner` rule requires a literal `--timeout-ms` below the entry's `maxElapsedMs`, documented; the process-group kill itself belongs to eval-quality's command-line adapter and is raised with the coordinator |
| A4 | high | a seeded probe with a null witness slipped past the refusal | fixed: any probe that seeds a defect is refused |
| A5 | medium | runner infrastructure exits in a preflight leg reach CI as exit 3 | skipped: test-design-epic-1.md's Story 1.6 row requires exactly that pass-through, and AD-10 classifies a failed preflight's exit 3 as infrastructure; AD-7's exit 12 rule is for trial observations (Story 1.8) |
| A6, C4 | medium | non-leg failures fell through to the CLI with partial observations | fixed: only a planning refusal before any port call falls through; every other failure exits 12; the recorder's own work sits inside its try |
| A7, C2 | medium | a stage crash (exit 1) or an unexpected error exited 1 | fixed: undocumented stage exits and any other preflight error exit 12; test case |
| A8 | medium | nothing recorded which executable produced a verdict | fixed: stage records name the executable and the substitution, which is announced |
| A9, C8 | medium | preflight read the live `contract.json`; the run was not self-contained | fixed: the run copies `contract.json` and every stage reads the copy; the compiled contract stays evidence, since under a shim `compile` writes nothing and the CLI accepts the authored form |
| A10 | medium | agent, agent command and capability live in the contract's options | skipped: the runner and model are fixed conditions AD-7 records in `policy/evaluator-conditions.json`, which Stories 1.8 and 1.13 build; the registry still authorizes only the runner |
| A11 | medium | a skill root inside a provisioned directory can never be mutated | fixed: `skill-root` finding |
| A12 | medium | a runner entry's infrastructure codes were not enforced | fixed: `skill-runner` finding |
| A13 | medium | `runs/` landed unignored in the adopter's tree | fixed: `runs/.gitignore` on first use; the repository-level ignore line for fixtures was dropped as redundant |
| A14 | medium | injected credentials could be echoed into observations | fixed: injected values scrubbed; test with a stub that echoes the value |
| A15 | medium | single-cwd recorder shape | skipped: Story 1.7 owns leg routing and will shape the port per leg; building the router now has no second route to serve; the schema sentence was corrected |
| A16 | low | denials found only after earlier legs ran | skipped: earlier legs now run in the disposable copy, so their side effects are contained, and the fault message names the refused pair |
| A17 | low | exit 12 for a seeded probe invites a retry | fixed in the message and docs: "a retry cannot pass" |
| A18, C9 | low | outcome line printed unescaped | fixed |
| A19, C12 | low | `SKILL_REQUEST_KEYS` unused | fixed: removed |
| A20 | low | a missing skill directory reads as configuration (3) | skipped: `check` now ties the legs' skill root to `launch.skillRoot`, so a typo is an authoring finding, and a skill absent from a staged copy is an environment problem |
| A21, C10 | low | a backtick or control character in the skill root breaks the prompt framing | fixed: exit 2; test case |
| A22 | low | only the executable-mismatch denial was tested | fixed: an interface-mismatch case; the three names stay in the assertion because the criterion names them |
| A23 | low | `launch.root` may name an unrelated sibling | skipped: the tests, and a monorepo evaluating a sibling package, rely on it; Story 1.7's digests pin what was evaluated |
| C3 | medium | `SKILL.md` itself could be a link out of the working directory | fixed: realpath containment of `SKILL.md`; test case |
| C5, T5 | medium | untested exits: non-denial leg fault, stage error, non-`cli` interface | fixed: output-budget leg (12), undocumented stage exit (12), `mcp` interface (12) cases; environment precedence is not asserted separately, since the scrub test proves the host value reaches the agent |
| C6 | low | an absolute skill root under a linked working directory was refused | fixed: an absolute value is compared after resolving links; test case |
| C7 | low | no stage record on spawn failure | fixed |
| C11, T3 | low | `vendor-name` missed camelCase and two-word spellings | fixed: word split with adjacent pairs; two plants and a clean `strategy` plant |
| C13 | low | unknown agent masked a usage error | fixed: usage checks first |
| C14 | low | stale prose in `how-tea-is-tested.md`, the registry doc's runner codes, a doc-claims comment | fixed |
| C15 | low | the check fixture's `skillRoot` names no real directory; a comment called every other probe a clean control | comment fixed; the fixture is skipped: `check` does not require the skill root to exist, and the check fixture runs from temp copies |
| C16 | low | bookkeeping | fixed at the end of the story |
| C17, A-P1 to P3 | low | antithesis phrasing in new comments | fixed; the matrix row "a crash maps to 4, never 1" sits in the frozen intent block and is left for the human |
| T1 | medium | the failing-control case did not prove the clean-control check drove exit 3 | fixed: asserts the CLI verdict's `clean-control` failed on exit 4 and the direct CLI exits 3 |
| T2 | medium | the runner rules could silently scan nothing after a rename | fixed: the real scan asserts the file and the bin mapping |
| T4 | low | loose `expect` on launch schema cases | fixed |
| T6 | low | only `compile` pass-through tested | fixed: `seal` case |
| T7 | low | refusals did not assert "before any leg" or the missing-engine message | fixed |
| T8 | low | tests inherited the caller's environment | fixed: a base environment without the variables the cases set; the outside root is the repository's parent |
| T9 | low | the denial scan read engine output too | fixed: scans the files the runtime writes |
| T10, T11 | low | crash case asserted only the code; an unguarded log read | fixed |
| T12 | low | circular expectation in `test-doc-claim-sources.js` | fixed: a literal list plus a declared-codes check |

## Final review round 1

Three opus reviewers (compliance, adversarial by execution, test quality) reviewed head 4662ab3.
Each finding was verified against the code before acting; every fix below has a test that fails when the fix is undone.

| ID | Finding | Outcome |
| --- | --- | --- |
| F1 | `cpSync` rewrote relative symbolic links as absolute links into the adopter's tree | fixed: `verbatimSymlinks: true`, then `containLinks` re-points every link whose real target is inside `launch.root` at the same place in the copy and refuses a link out of it (exit 12); tests: a relative skill-root link passes, writing through a relative or an absolute link leaves the target's file untouched, a link out of the root exits 12 |
| F2 | provisioned directories linked writable while code, schema, docs, AC and CHANGELOG said read-only or "writes nothing" | fixed per the coordinator's decision: every claim now says the copy links provisioned directories to the target's own directory, writable until Story 1.7; `check.js` messages, the schema description, the `preflight.js` header, `docs/reference/tea-evaluate-cli.md`, the epics AC (Spec Change Log) and CHANGELOG |
| F3a | `mkdtempSync` outside `try`; a `cpSync` throw left the copy, inside the adopter's tree when `TMPDIR` is | fixed: `stageCopy` removes its directory on any error, and a temp directory inside `launch.root` is refused (exit 12) naming `TMPDIR`; tests: `TMPDIR` inside the root exits 12 with nothing left there, a refused copy leaves the private temp directory empty |
| F3b | a FIFO in the target crashed `cpSync` with a partial copy | fixed: the copy filter refuses any entry that is not a file, directory or link, naming it (exit 12); test with `mkfifo` (skipped on Windows) |
| F3c | `SIGINT`/`SIGTERM` mid-leg left the copy, the runner and the agent | fixed: `cleanUpOnSignal` aborts the leg's controller (now passed to `runPreflight`), removes the copy and re-raises the signal; test: `SIGTERM` mid-leg ends the command by `SIGTERM`, the private temp directory is empty, and the agent's child is gone |
| F4 | `--evaluation` through a symbolic link resolved `launch.root` against the link's parents | fixed: `resolveEvaluationFolder` returns the folder's real path, and `preflight` realpaths `launch.root`; test: a link beside a decoy project runs the real project's skill |
| F5 | one exit set for every stage | fixed: per-stage sets from eval-quality 4.1.0's `EXIT_CODE_TABLE` and `exitCodeFor`: `compile`/`seal` 0, 4, 5, 64; `preflight` 0, 3, 4, 5, 64; `score` 0, 2, 3, 4, 5, 64; tests: the shim's preflight exit 2 and compile exit 3 both give 12 |
| F6 | EPIPE on the runner's stdout crashed it with exit 1 | fixed: a stdout error handler reports it and exits 4 (transport); test: a reader that closes after the first chunk of a 4 MB reply sees exit 4 |
| F7 | the prompt was decoded lossily | fixed: strict `TextDecoder` (BOM kept), invalid UTF-8 exits 2; docs say the prompt passes unchanged after the preamble; test with bytes `ff fe` |
| F8 | `runAgent` killed only the direct child on timeout (pre-existing, every runner) | fixed: `cli/lib/agent-supervisor.js` runs between `spawnSync` and the agent, starts the agent as a process-group leader, and stops the group with `SIGTERM` then `SIGKILL` after 2 s on timeout, on the runner's death (parent polling), and after the agent exits; it forwards `SIGINT`/`SIGTERM`/`SIGHUP` so a terminal Ctrl-C still reaches the agent, and reports the outcome on fd 3; Windows falls back to the direct child; exit codes unchanged. A plain detached `spawnSync` was rejected: it takes the agent out of the terminal's foreground group, so Ctrl-C would kill the runner and leave the agent running. Tests: a child the agent started dies with a 500 ms timeout and with a `SIGKILL`ed runner |
| T1 | no case drifting only the plan step's options | fixed: two `check` cases, plan-step `skill-root` and plan-step `timeout-ms` alone, exit 10 with their rule tags |
| T2 | planning-refusal fallthrough untested | fixed: `test/fixtures/evaluate/engine-wrapped/` preloads ESM hooks that wrap eval-quality's `runPreflight`; a `StructuralFailure` before any leg reaches the CLI and exits with its code, a plain `Error` after one leg exits 12 with no `engine/preflight.json` |
| T3 | copy exclusions and provision links never ran | fixed: a project holding `.git/`, a provisioned `vendor/` and the evaluation folder with an earlier `runs/` entry, `launch.root` `../..`; the stub's `STUB-LIST` shows no `.git`, no `runs/`, and `vendor@` |
| T4 | the copy check read the shared `os.tmpdir()` | fixed: a private `TMPDIR`/`TMP`/`TEMP`, asserted empty after |
| T5 | the copy check wrote into the tracked stub fixture on regression | fixed: every case that writes or changes the target runs against a temp copy of the stub project |
| T6 | environment precedence untested | fixed: `witness-beta` declares its own `TEA_STUB_SECRET` and must echo it, while `witness-alpha` echoes the scrubbed host value |
| T7 | `substituted` unasserted | fixed: `false` over the installed CLI, `true` under the shim |
| W1 | "anywhere in the run" overstated the denial scan | fixed in wording: epics.md and test-design-epic-1.md name the four scanned locations (Spec Change Log) |

Found on the way: the test's temp directories are now created under the real path of `os.tmpdir()`, since `launch.root` resolves from the folder's real path (F4) and macOS's `/var` is a link.
`docs/reference/tea-test-review-cli.md` said a timeout sends `SIGTERM`; it now describes the group stop, since F8 changes the shared `runAgent`.
An em dash in `run-agent.js`'s header was replaced while editing it.
`eval-quality.config.json`'s doc-claims foreign symbols gain `SIGINT` and `SIGHUP`, which the reference now names beside `SIGTERM` and `SIGKILL`.
The per-stage exit sets are a `Map` keyed by strings, since `test:evaluate-boundaries` forbids `seal` as an identifier or key under `cli/`; the first full gate caught an object literal.
Not fixed here: eval-quality's command-line adapter kills only the runner at `maxElapsedMs`; F8's parent polling now stops the agent's group in that case, and the adapter-side process-group kill stays with eval-quality.

### Final review round 1 revert checks

Each fix was undone once in the working tree, `node test/test-evaluate-preflight.js` run, the named failures observed, and the fix restored.

- F1 (`verbatimSymlinks` and `containLinks` removed): "preflight whose skill root is a relative link inside the target exited 3; expected 0", "a leg wrote through a relative link into the target's data/victim.txt", the same for an absolute link, and "preflight over a link out of launch.root exited 0; expected 12". Removing `verbatimSymlinks` alone passes, since `containLinks` also re-points the absolute links `cpSync` writes.
- F3a (temp-inside check and cleanup removed): "a temp copy was left inside launch.root: tea-evaluate-copy-…", "the refused copy was left in the temp directory", and the FIFO case's leftover; cleanup alone removed: the two leftover checks.
- F3b (special-file refusal removed): "the FIFO refusal does not name the entry" (the crash still exits 12 through the catch-all).
- F3c (signal handlers not installed): "the interrupted preflight left its copy: tea-evaluate-copy-…" and "a process the interrupted leg started (pid …) outlived the preflight".
- F4 (lexical folder and root): "preflight through a link ran the target beside the link: 'skill: decoy-skill'".
- F5 (the old single set): "preflight whose preflight exits 2 … exited 2; expected 12" and "preflight whose compile exits 3 … exited 3; expected 12".
- F6 (stdout handler removed): "the runner whose reader closed early exited 1 (null); expected 4".
- F7 (lossy decode): "a prompt that is not UTF-8 exited 0; expected 2".
- F8 (`run-agent.js` at 4662ab3): "a child the agent started (pid …) outlived the runner's timeout", "… outlived its runner's SIGKILL", and "a process the interrupted leg started … outlived the preflight".
- T1 (plan steps dropped from `optionSetsByOperation`): both plan-only cases "exited 0; expected 10".
- T2 (fallthrough never): "a plan refused before any leg did not reach the CLI's preflight (exit 12)"; (fallthrough always): "legs that stopped after one exited 3; expected 12" and "still asked the CLI for a verdict".
- T3 (`.git` exclusion removed): "the copy holds .git"; (`runs/` exclusion removed): "the copy holds the evaluation's own runs/"; (provisioned directory copied): "the provisioned directory is not a symbolic link in the copy".
- T4 (copy not removed in `finally`): "the disposable copy of the target root was left in the temp directory".
- T5 (legs run in `launch.root` itself): seven failures, "a leg wrote into the target root" among them, and `git status` showed no file written into `test/fixtures/evaluate/stub-agent/`.
- T6 (host value over the leg's): "the leg that declares its own value received '[redacted]'".
- T7 (`substituted` hard-coded false): "the preflight call under the shim is not recorded as substituted: true".

## Verification

**Commands:**

- `npm test` -- exit 0 (first run exit 1 on the README chain count, "seventy-nine" for eighty, fixed; the run after the review fixes exit 0)
- `npm run test:release-metadata` -- exit 0
- `npm run docs:validate-links` -- exit 0
- `npm run docs:build` -- exit 0
- the Build Rules engine check -- exit 0 at the start and at the end; `git diff -- package.json package-lock.json` shows no `file:` or `.tgz` spec

Final review round 1 (after the fixes):

- `npm test` -- exit 0 (the first run exit 1: `test:evaluate-boundaries` on a `seal` object key in `engine-cli.js`, then `test:doc-claims` on `SIGINT` and `SIGHUP`; both fixed)
- `npm run test:release-metadata` -- exit 0
- `npm run docs:validate-links` -- exit 0
- `npm run docs:build` -- exit 0
- the Build Rules engine check -- exit 0
