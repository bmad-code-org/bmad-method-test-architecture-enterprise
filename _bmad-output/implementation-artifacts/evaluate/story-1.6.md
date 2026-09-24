---
title: 'Story 1.6: Probe a skill through the generic runner and tea-evaluate preflight'
type: 'feature'
created: '2026-09-24'
status: 'done'
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
- 2026-09-24 (final review round 3): epics.md Story 1.4's packaging criterion and engine status note, ARCHITECTURE-SPINE.md's packaging decision, rule and version table, and test-design-epic-1.md's peer row amended: the `eval-quality` peer floor is `>=4.1.1`, the first release whose command-line adapter kills the target's process group at its ceiling, which `tea-evaluate preflight` and its documentation rely on (R3-4).
- 2026-09-24 (final review round 4): epics.md Story 1.4's packaging criterion and engine status note, ARCHITECTURE-SPINE.md's packaging decision, rule and version table, and test-design-epic-1.md's peer row amended: the `eval-quality` peer floor is `>=4.1.2`, the first release whose adapter also kills the target's process group when the host dies, by `SIGKILL` included (eval-quality#161).

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

## Final review round 2

Two opus reviewers reviewed head bc5dc80; the adversarial one worked by execution, with probe scripts this round reran against the fix.
Each finding was verified against the code before acting, and every fix below has a test that fails when the fix is undone, except where the revert observation says otherwise.

### Supervision design

The agent runs in its own process group, and a second process, the group leader, starts it there and holds one end of a socket (the lifeline) whose other end only the supervisor holds.
The supervisor stays in the runner's process group, so a terminal's Ctrl-C or `Ctrl-\` and a signal to the runner's group reach it, and it forwards them to the leader over the lifeline; the kernel closes the lifeline however the supervisor ends, `SIGKILL` included, and the leader then stops the group.
The leader also owns the wall clock (chained timers, so any `--timeout-ms` holds) and kills what is left of the group when the agent exits; the supervisor kills the group if the leader is killed on its own, and exits when the runner is gone, which closes the lifeline.

Alternatives considered:

- No new session at all (the agent stays in the runner's group, as at 4662ab3): terminal keys and a group `SIGKILL` reach everything, but a timeout can then only signal the agent itself, since signalling the group would kill the runner, so the agent's children outlive a timeout.
  Rejected because the timeout case is the reason the supervisor exists.
- One detached process that polls its parent (the round 1 design with the poll carrying all the weight): a group `SIGKILL` kills the runner, the poll notices within 100 ms, and the group stops; but a `SIGKILL` to that process itself orphans the agent, and there is no lifeline to notice.
  Rejected for the supervisor-death case.
- The chosen design keeps one poll: a runner killed on its own (eval-quality's adapter at `maxElapsedMs`) closes no pipe the supervisor can watch, since `spawnSync` closes the agent's stdin once the prompt is written and Node offers no `pipe()` to open another before it.
  The poll compares `process.ppid` with the runner's pid passed on the command line, so a runner that died before the supervisor started is caught on the first check.
- Ctrl-Z: forwarding `SIGTSTP` does nothing, because the agent's group has no parent in its session (an orphaned group), and the kernel drops job-control stops sent to one.
  `SIGSTOP` to the group worked in a pty (Ctrl-Z, then `fg`, completed the run), and was rejected: a job suspended that way and then killed with `kill -9 %1` leaves the agent's group stopped forever, since the leader is stopped too and nothing outside the group resumes it.
  Ctrl-Z therefore suspends the runner and the supervisor while the agent runs on, bounded by `--timeout-ms` and the runner's end, and the docs say so.

### Findings

| ID | Finding | Outcome |
| --- | --- | --- |
| S1 | `detached: true` took the agent out of the runner's group, so a group `SIGKILL` (a cancelled CI job), a `Ctrl-\` and a `SIGKILL` to the supervisor alone left the agent's group running, and `runAgent` reported the last as a timeout | fixed by the lifeline design above; `SIGQUIT` joins the forwarded signals and `preflight`'s interrupt handlers; `run-agent.js` reads the supervisor's report first and turns an `ETIMEDOUT` with no report into a transport failure ("gave no report"), so only the supervisor reports a timeout, and the backstop kills a hung supervisor with `SIGKILL`, which closes the lifeline; tests: a `SIGKILL` to the runner's group, the supervisor killed alone (exit 4, no timeout, back within 10 s), the group leader killed alone, a stopped supervisor (exit 4, "gave no report"), and `preflight` interrupted by `SIGQUIT` to its group |
| S2 | the parent watch read `process.ppid` at start, which is already 1 when the runner died first (7 of 21 trials orphaned the agent), and never updates on Windows | fixed: the runner's pid is passed on the command line, the runner is gone when `process.ppid` differs from it (checked once at start, then every 100 ms), and on Windows when `process.kill(pid, 0)` finds no process; exiting closes the lifeline; test: a supervisor started with a runner pid that is not its parent ends within 5 s and its agent's child dies; `race.js` rerun: 21 trials, 0 orphans |
| S3 | a `--timeout-ms` above 2147483647 timed out at once (Node clamps a longer `setTimeout` to 1 ms) | fixed: the leader chains timers of at most 2^31-1 ms, and `spawnSync`'s backstop is capped at `Number.MAX_SAFE_INTEGER`; test: `--timeout-ms 2147483648` answers with exit 0 |
| S4a | nothing tested that the group dies when the agent exits: the stub's child was ref'd, so the stub never exited first | fixed: `STUB-LEAVE <file>` starts an unref'd child and exits 0; test: the runner exits 0 and the child dies |
| S4b | nothing tested signal forwarding | fixed: `SIGINT`, `SIGTERM`, `SIGHUP` and `SIGQUIT` each sent to the supervisor alone end the runner with exit 4 naming the signal, and the agent's child dies |
| S5 | the docs said `SIGTERM` then `SIGKILL` 2 s later for the group, while the code `SIGKILL`s the rest of the group the moment the agent exits; nothing said output a descendant writes after the agent exits is dropped | fixed in wording: `tea-evaluate-cli.md` (exit 5 row and the process paragraph), `tea-test-review-cli.md` (`--timeout-ms` row and **Agent execution**), the custom runner contract in `agent-adapters.js`, `run-agent.js`'s header and JSDoc, and CHANGELOG now say the group gets `SIGTERM` and the agent `SIGKILL` 2 s later if still running, and every process left in the group gets `SIGKILL` when the agent exits, so later output is dropped |
| P1 | `containLinks` and `launch.root` resolved links lexically, so `x -> sub/../c` with `sub -> a/b` read the root's `c` in the copy, and `trick -> selfroot/../out/victim.txt` escaped the root in the source while the copy accepted it | fixed: a link's target is `fs.realpathSync.native` of the link, and the loose walk (for a dangling or looping link) now joins the target as spelled and resolves each existing prefix with `realpathSync.native`; `launch.root` is joined as spelled the same way; tests: `x` reads `A-C` in the copy, and `case/trick` is refused with exit 12 naming it |
| P2 | the C6 case (an absolute skill root spelled through a link to the working directory) was vacuous once round 1 moved temp directories under their real path | fixed: the case builds an explicit link to the working directory and runs the runner from it with `--skill-root` spelled through the link |
| P3 | `check.js` and CHANGELOG gave a stale reason for the `skill-runner` rule | fixed: under the ceiling the runner reports its own timeout as exit 5, and at the ceiling the adapter kills the runner's process group, records a fault, and `preflight` exits 12 |
| P4 | `folder.js` comment in the negation form | fixed: "every path relative to the folder resolves against the folder's real location, symbolic links included" |
| E1 | coordinator addition: eval-quality 4.1.1 kills the target's whole process group on `maxElapsedMs`, `maxOutputBytes` and abort (eval-quality#160) | done: devDependency 4.1.1 (`package.json`, `package-lock.json`, no `file:` or `.tgz` spec); the roadmap's pin claim, its `EVAL_QUALITY_PIN_IS_4_1_1` source and test, the command-adapter page's outcome sentence, CHANGELOG, `check.js`, `preflight.js`, `tea-evaluate-cli.md` and a test comment now say the adapter kills the runner's process group at the ceiling; round 1's note that the adapter kills only the runner is closed by this pin |

Found on the way:

- Ctrl-Z, probed in a pty under `bash -i`: see the design notes; the docs and CHANGELOG say the agent runs on under a suspended runner.
- `test/test-evaluate-preflight.js` exited 0 with no verdict printed when a case awaited a `close` event that had already fired (Node exits once nothing is pending); an `exit` hook now fails the suite with a message when `main` never finished, and the new early-runner case attaches its listener at spawn.
- `resolveEvaluationFolder` resolved `--evaluation` lexically as well; it now joins the value as spelled and takes `realpathSync.native` of the folder, and `test-evaluate-check.js` resolves `link/../evaluation` to the folder beside the link's target.
- `doc-claims` refused `SIGQUIT` in the reference until it joined the platform names in `eval-quality.config.json`'s foreign symbols.
- `package-lock.json`'s root entry lacked the `tea-skill-runner` bin this story added; the 4.1.1 install wrote it.

### Final review round 2 revert checks

Each fix was undone once in the working tree, `node test/test-evaluate-preflight.js` (or `node test/test-evaluate-check.js` for the folder) run, the named failures observed, and the fix restored.

- S1, the leader's lifeline `close` handler removed: "a child the agent started … outlived its runner's SIGKILL", "… outlived a SIGKILL to the runner's process group", "a runner whose supervisor was killed took 60008 ms to return", "… outlived a runner that was gone before its supervisor started", and "a process the leg interrupted by SIGTERM started … outlived the preflight".
- S1, `ETIMEDOUT` mapped back to `{ timedOut: true }`: "a runner whose supervisor never reported exited 5; expected 4, a supervisor failure".
- S1, `SIGQUIT` dropped from `preflight`'s interrupt handlers: "the preflight interrupted by SIGQUIT left its copy".
- S2, the parent captured at start: "a supervisor whose runner was gone before it started kept its agent running for 5 s".
- S3, one plain `setTimeout`: "--timeout-ms 2147483648 exited 5; expected 0".
- S4a, both group kills removed (the leader's at the agent's exit and the supervisor's when the leader exits): "a child the agent left behind … outlived the agent's exit".
  Each alone passes that case, since the other covers it; the supervisor's kill alone removed fails "a runner whose group leader was killed took 60005 ms to return".
  The leader's kill is the only one left when the supervisor is already gone, a case no test isolates, since stopping the group on the lifeline also kills such a child.
- S4b, the supervisor's forwarding handlers made no-ops: four failures, "a runner whose supervisor received SIGINT exited 0; expected the agent killed by SIGINT" and the same for `SIGTERM`, `SIGHUP` and `SIGQUIT`.
- P1, lexical link resolution: "a link through sub/../c read "ROOT-C" in the copy", "preflight over a link that climbs out past another link exited 0; expected 12", and the refusal naming case.
- P2, the absolute-value guard dropped from `resolveSkillRoot`: "an absolute skill root spelled through a linked working directory exited 2".
- The folder, `path.resolve` restored: "--evaluation link/../evaluation resolved to {"ok":false,…}".

### Final review round 2 execution probes

Each reviewer probe was rerun against the fix (copies under the session scratchpad, pointed at this worktree).

- `ra.js`: a normal reply, stderr, exit 3, a missing command (`AGENT_NOT_FOUND`), the prompt on stdin, and a 500 ms timeout match 4662ab3's exits and output; `sh -c '(sleep 0.3; echo late) & echo early'` returns `early\n`, the documented drop.
- A group, supervisor, leader and runner `SIGKILL`, and each forwarded signal to the supervisor: nothing left after 3 s, and the runner reports a transport failure or the agent's signal.
- `race.js` (runner `SIGKILL` 30 to 90 ms after start): 21 trials, 0 orphans.
- `ttyprobe.py` Ctrl-C and `Ctrl-\` in a pty: nothing left, the runner ends by `SIGINT` and `SIGQUIT`; the same keys under `bash -i`: nothing left, `Quit: 3` and exit 131 for `Ctrl-\`.
- `grpsig.js` against `tea-evaluate preflight`: `SIGQUIT` and `SIGINT` to its group leave no copy and no process; `SIGKILL` is the eval-quality finding above.

## Final review round 3

One opus reviewer reviewed head d18df6f, by execution, with probes under the session scratchpad's `r3/probe/`.
Each finding was verified against the code before acting, and every code fix below has a test that fails when the fix is undone.

### Supervision change

`grpstop.js` reproduced R3-1 at d18df6f: a runner group stopped at 0.4 s and continued at 9 s exited 4, "the agent supervisor gave no report 5000ms past the agent's 2000ms wall clock", for an agent that answered and for one that timed out alike.
`spawnSync`'s timer counts the time the runner spends stopped, so on resume it kills the stopped supervisor before the supervisor relays the leader's report.

The reviewer's prototype (the leader also writes its outcome to a file in a private directory the runner reads after `spawnSync`) was run on Linux in a `node:24-slim` container: the runner exited 0 with an empty standard output three times out of three.
Linux's `epoll_wait` returns `EINTR` after a stop and `SIGCONT`, libuv then runs the expired timer before polling again, and `spawnSync`'s kill closes the runner's pipes with the agent's reply still unread in them.
On macOS the reply happened to survive.
So the report file alone turns a lost outcome into a silently lost answer; the loss comes from `spawnSync`'s timeout itself, which is gone:

- `runAgent` calls `spawnSync` with no timeout, since its timer counts suspended time and on expiry closes the pipes before reading them.
  `killSignal` stays `SIGKILL` for output past `maxBuffer`.
- The group leader writes its report straight to the runner's file descriptor 3, which the supervisor passes it as the leader's descriptor 4, then writes `reported` on the lifeline, then kills the supervisor with `SIGKILL` while the supervisor is still its parent (checked through `process.ppid` against the supervisor pid passed on the command line, so a reused pid is never hit), then kills its own group.
  A stopped supervisor therefore neither holds the report back nor keeps the runner waiting.
- The backstop moves into the supervisor: when the leader has not ended 5 s past the wall clock (stopped with `SIGSTOP`, say), the supervisor kills the leader's group with `SIGKILL` and reports "gave no report".
  At d18df6f a stopped leader left its group stopped forever once the runner's backstop killed the supervisor.
- A supervisor killed on its own closes the lifeline as before; the leader stops the group and now reports that the supervisor ended before the agent, so the runner names the cause.
- The supervisor writes a report of its own only when the leader closed without writing `reported`: a leader that could not start, one killed on its own, and one past the backstop.

A report file was rejected: it adds a path the runner must remove, which a runner killed before reading leaves behind in the temp directory, and it needs the same timeout removal to keep the reply.
Descriptor passing keeps the report in the pipe `spawnSync` already reads to its end.

### Findings

| ID | Finding | Outcome |
| --- | --- | --- |
| R3-1 | a Ctrl-Z longer than the wall clock plus 5 s lost the outcome: `spawnSync`'s backstop killed the stopped supervisor before it relayed the report | fixed as above; tests: the runner's group stopped for 7.5 s under a 2000 ms wall clock (past the 7 s backstop d18df6f had) with an agent that answers after 300 ms exits 0 with the answer and its left-behind child dies; the supervisor stopped alone now exits 5 (the leader's timeout) within 15 s, where it exited 4 through the runner's backstop; the group leader stopped alone exits 4 "gave no report" and its agent's child dies; the supervisor killed alone names "supervisor ended before the agent did" |
| R3-2 | the leader's own group kill when the agent exits had no isolating test | fixed: the group leader is started alone (`--group-leader` with a supervisor pid that is not its parent, descriptors 3 and 4 as pipes, detached), its agent leaves an unref'd child and exits 0; the test asserts the report `{"status":0,"signal":null}` on descriptor 4 and that the child is gone |
| R3-3 | the reference pages and CHANGELOG stated the process-group guarantees with no Windows qualification | fixed in wording: `tea-evaluate-cli.md` (the runner's process paragraph), `tea-test-review-cli.md` (`--timeout-ms` row and **Agent execution**), CHANGELOG, and `run-agent.js`'s header say that on Windows the timeout and the signals reach the agent alone and nothing it started is stopped |
| R3-4 | "the adapter kills the runner's process group at the ceiling" holds only from eval-quality 4.1.1, while the peer floor admitted 4.0.0 | fixed by raising the peer floor to `>=4.1.1`: TeA's gate runs on 4.1.1 only, and qualifying the claim would document behavior of an engine TeA never tests; versions float upward, so the floor follows what TeA's claims need. `package.json` and the lockfile's root entry, `tools/guard-publish.js` (`ENGINE_FLOOR` and its header), `test/test-guard-publish.js` (floors of 4.0.0 and `^4.1.0` refused, 4.1.1 ranges accepted), `test/test-release-metadata.js`, `engine.js`'s install hint, `tea-evaluate-cli.md`'s prerequisites, CHANGELOG, and the plan (ARCHITECTURE-SPINE, epics Story 1.4's criterion and the engine status note, the test-design row, Spec Change Log) |
| R3-5 | the runner's message read "the agent supervisor killed by signal SIGKILL without reporting" | fixed: "was killed by signal" and "exited with code", matching the leader's message; test: the supervisor and the leader's group killed together (no process left to report) names "the agent supervisor was killed by signal SIGKILL without reporting" |

Found on the way:

- The CHANGELOG sentence "before this, a supervisor killed on its own was reported as a timeout once `spawnSync`'s backstop ran out" compared the change with round 1 of this pull request, which never shipped; it now describes the shipped behavior only.
- The docs' exit 4 row now names a supervising process that ended before the agent, and the runner's process paragraph names the two supervising processes and the 5 s backstop.
- `doc-claims` refused `SIGSTOP` in the reference until it joined the platform names in `eval-quality.config.json`'s foreign symbols.

Not done: `SIGKILL` to the supervisor and to the group leader alone, together (a `pkill -9 -f agent-supervisor`), leaves the agent and its children running until they end on their own, since no process that watches them is left.
The runner reports the supervisor's end; stopping the agent's group then needs its process group id, which only the leader holds.
The state was the same at d18df6f; the new test kills the leader's whole group instead, and nothing is left.

### Final review round 3 revert checks

Each fix was undone once in the working tree, `node test/test-evaluate-preflight.js` run, the named failures observed, and the fix restored.

- R3-1, the runner's `spawnSync` timeout restored (`timeout + 5000`): "a runner suspended past its wall clock exited 4 with ""; expected 0 and the agent's answer" (`spawnSync ... ETIMEDOUT`), and the leader-stopped case exited 4 through the runner's backstop with the agent's child left running.
- R3-1, the leader no longer kills the supervisor: "a runner whose supervisor was stopped was still waiting after 15 s; expected 5, the leader's timeout".
- R3-1, the report relayed through the supervisor as at d18df6f (the leader writes it on the lifeline, the supervisor relays it, and the leader does not kill the supervisor): the stopped-supervisor case again waits 15 s, "a runner whose supervisor was killed exited 4; expected 4 naming the supervisor's end", and "the group leader alone reported """.
- R3-1, the supervisor's backstop removed: "a runner whose group leader was stopped was still waiting after 15 s; expected 4, no report past the backstop".
- R3-1, the leader's supervisor-gone report removed: "a runner whose supervisor was killed exited 4; expected 4 naming the supervisor's end" (the runner said "was killed by signal SIGTERM").
- R3-2, the leader's group kill at the agent's exit removed: "a child the agent left behind … outlived its group leader's exit", and the same for the runner case and the suspended case, since the leader now kills the supervisor before its own group kill and the supervisor's kill on the leader's exit no longer runs.
- R3-4, `ENGINE_FLOOR` back at 4.0.0 in `tools/guard-publish.js`: "checkManifest accepts a manifest with a peer floor of 4.0.0" and "… of 4.1.0"; the peer back at `>=4.0.0` in `package.json`: `test:release-metadata` fails "its floor must be 4.1.1 or later".
- R3-5, "killed by signal": "a runner whose supervisor and group leader were killed together exited 4; expected 4 naming the supervisor's end".

A regression run of the leader-stopped case left a stopped leader behind; the case now kills the stopped leader's group whatever its outcome.

### Final review round 3 execution probes

Each probe was rerun against a copy of the fix under the session scratchpad (`r3/new`).

- `grpstop.js` (group `SIGSTOP` at 0.4 s, `SIGCONT` at 9 s): an answering agent exits 0 with its answer, and a 30 s agent under a 2000 ms wall clock exits 5, on macOS and in a `node:24-slim` container, three runs each for the answer.
- `tstp3.py` and `tstp4.py` (Ctrl-Z in a pty under `bash -i`, `fg` after 9 s): the sleeping agent reports `timed out after 3000ms`, and the answering one returns `agent-done` with `ok: true`.
- `death.js`, every target (runner, supervisor, leader, agent, runner group, leader group) by `SIGKILL`, `SIGTERM`, `SIGINT`, `SIGHUP` and `SIGQUIT`: nothing left and the runner back within 10 ms of the signal, except a catchable signal to the leader alone and `SIGINT` to the `sh` agent alone, which the leader and `sh` ignore; those rows match d18df6f.
- `fid.js` (large, binary and UTF-8 output, stdin, late child output, exit 7, `SIGSEGV`, output past `maxBuffer`, a write to descriptor 3): identical to 4662ab3's results; `fds.js` shows the agent's descriptors unchanged from d18df6f.
- `race.js`: 21 trials, 0 orphans; `ttyprobe.py` Ctrl-C and `Ctrl-\`: nothing left, the runner ends by `SIGINT` and `SIGQUIT`; `grpsig.js` `SIGQUIT` and `SIGINT`: no copy and no process left; `grpsig.js` `SIGKILL`: the eval-quality finding of round 2, unchanged; `seq.js`: no leftover listener.
- `node test/test-evaluate-preflight.js` in a `node:24-slim` container: 212 checks pass, the suspended case included.

## Final review round 4

One reviewer reviewed head 080bc9d by execution, with probes under the session scratchpad's `r4/probe/`; this round's probes and logs are under `r4/me/`.
The finding was verified against the code before acting, and every code fix below has a test that fails when the fix is undone.

### Supervision change

R4-1 reproduced at 080bc9d on both systems: an agent that leaves `setsid sleep 15` behind and prints `alpha` held the runner 15058 ms under a 2000 ms wall clock in a `node:24-slim` container, and the macOS repro held it for the 25 s the escaped process lived.
The leader started the agent with its standard streams inherited, so every descendant held the write ends of the runner's own pipes, and `spawnSync` returns only once every copy is closed; a process in a new session survives the group kill and holds them.
The same holds for the runner's input: an agent that reads none of a 3 MB prompt and leaves a new-session process holding its standard input kept the runner waiting 12 s, the holder's life, where the write of the prompt fails at once when nobody else holds the pipe.

The leader now owns all three of the agent's streams:

- The leader starts the agent with its standard input, output and error as pipes of its own, in a new session and process group of its own (`detached`), and writes `agent <pid>` on the lifeline so the supervisor knows the group.
  It copies the runner's input to the agent and the agent's output and error to the runner's descriptors, pausing its reads while the runner lags, so an agent writing to a runner that stopped reading blocks as it did on the runner's own pipe.
- The runner's descriptors are read and written through event-loop streams, so no write blocks the loop where the wall clock runs, and a descriptor that is not a pipe or socket (a test's `/dev/null`) gets a thread-pool stream.
- When the agent exits, the leader kills the agent's group with `SIGKILL`, writes its report on the runner's descriptor and `reported` on the lifeline, kills the supervisor while it is still its parent, and only then copies what the agent's output pipes still hold.
  It closes each pipe when it reaches its end, stays empty for 100 ms, or has been read for 2 s of the time the runner keeps up with it, and exits once everything read is written or the runner is gone.
  Reporting before the copy keeps round 3's guarantee: a runner suspended past the supervisor's backstop cannot lose the report to that backstop firing on resume.
- The supervisor kills the leader and the agent's group, which it names from the lifeline, when the leader passes the backstop or ends without a report; before, killing the leader's group took the agent with it.
- The leader alone is no longer in the agent's group, so it no longer receives the signals it sends that group, and a stopping signal sent to the leader alone now stops the agent's group as a forwarded one does, where it was ignored.

Alternatives considered:

- `spawnSync`'s own timeout back, as at d18df6f: it bounds the wait, and round 3 removed it because its timer counts suspended time and closes the pipes before reading them, which lost the reply after a Ctrl-Z.
  Rejected for that reason.
- The agent kept in the leader's group, with the leader copying the output before the group kill: the leader dies with its own group's `SIGKILL`, so the copy has to finish first, and every process the agent left in the group keeps running for as long as the copy waits on a suspended runner.
  Rejected because the group kill at the agent's exit is what stops those processes.
- The agent's output sent to files the runner reads after `spawnSync`: `spawnSync` would no longer wait on them, but the agent's output would become a regular file, it would grow on disk past `maxBuffer`, and a runner killed before reading would leave the files behind.
  Rejected for fidelity and cleanup.
- Thread-pool file streams for the runner's descriptors, the first version of this change: on Linux the leader's standard output turned non-blocking under load (`/proc/self/fdinfo/1` showed `O_NONBLOCK` set moments after the leader started reading its input), Node's file stream retried `EAGAIN` five times and failed, and the leader closed the agent's pipe, so 2 of 24 parallel `fid.js` runs reported "exited with code 1" for the output-past-`maxBuffer` case.
  Event-loop streams wait for the descriptor to become writable instead; 40 parallel runs after the change showed no difference from 4662ab3.
- A fourth process in the agent's group watching the leader: it moves the gap of round 3's "Not done" one level down and does not close it.

The cost of this layout: the leader's process group now holds only the leader.
A `SIGKILL` to that group is the same as a `SIGKILL` to the leader, which the supervisor answers by killing the agent's group, but a `SIGKILL` to the leader's group and the supervisor together now leaves the agent's group running until it ends on its own, as round 3's "Not done" already recorded for `pkill -9 -f agent-supervisor`.
The case that kills both now also kills the agent's group so the suite leaks nothing, and still asserts the runner's message.
The supervisor kills the agent's group by the pid the leader sent, which the kernel keeps reserved while any member of that group lives, and the leader kills it right after reaping the agent; only a group left empty by then and a new group leader given the same pid in that window could be hit.

### Findings

| ID | Finding | Outcome |
| --- | --- | --- |
| R4-1 | `runAgent` waited for any process that left the agent's group holding its output or error, since those were the runner's own pipes; `spawnSync` had no timeout left to bound it | fixed by the design above; tests: an agent that answers and leaves a child in a new session holding its standard input, output and error returns exit 0 with the answer within 2 s of the agent's exit and the holder still alive; the same holder with an agent that sleeps 30 s under a 1000 ms wall clock returns exit 5 within 5 s of the start; the stub agent gains `STUB-ESCAPE <file>` for both |
| R4-1b | found on the way: the same wait through standard input, for an agent that leaves unread input to a process in a new session | fixed by the leader copying the input; test: an agent that reads none of a 4 MB prompt and leaves such a holder lets the runner return within 5 s of its exit, with the holder alive |
| R4-2 | found on the way: the leader's thread-pool writes failed with `EAGAIN` on Linux when the runner's descriptor turned non-blocking | fixed by event-loop streams for pipes and sockets; covered by the preflight suite and `fid.js` under 4-way parallel load in the container |
| E2 | coordinator addition: eval-quality 4.1.2 starts each target through a watchdog holding a lifeline to the host, so a `SIGKILL` to the host, alone or with its group, kills the target's process group (eval-quality#161) | done: devDependency 4.1.2 and peer floor `>=4.1.2` (`package.json`, `package-lock.json`), `tools/guard-publish.js` (`ENGINE_FLOOR` and its header), `test/test-guard-publish.js` (a floor of 4.1.1 now refused, 4.1.2 ranges accepted), `test/test-release-metadata.js`, `engine.js`'s install hint, `tea-evaluate-cli.md`'s prerequisites, the roadmap's pin claim and its `EVAL_QUALITY_PIN_IS_4_1_2` source and test, the command-adapter page, CHANGELOG, and the plan (ARCHITECTURE-SPINE, epics Story 1.4's criterion and engine status note, the test-design peer row, Spec Change Log); the conformance suite is byte-identical between 4.1.1 and 4.1.2, so the adapter page's 16 outcomes stand |
| E2b | found on the way: 4.1.2's `parseCommandTargetPolicy` refuses a `maxElapsedMs` above 2147483647, which TeA's registry schema admitted, so `check` passed an evaluation eval-quality's own parser refuses | fixed: `evaluation.schema.json` bounds `maxElapsedMs` at 2147483647, and the reference and CHANGELOG say so; test: a registry entry with `maxElapsedMs` 2^31 is a `schema` finding with exit 10 |

The round 2 note that a `SIGKILL` to `tea-evaluate preflight`'s process group no longer reached the runner under 4.1.1 is removed: `grpsig.js SIGKILL` against 4.1.2, three runs on macOS and three in the container, left no runner, supervisor, leader, agent or agent's child, where 4.1.1 left them running until the leg's `--timeout-ms`.
The copy under the temp directory stays behind after a `SIGKILL`, which runs no handler; `SIGINT` and `SIGQUIT` left no copy and no process on both systems.

### Final review round 4 revert checks

Each fix was undone once in the working tree, the named suite run, the failures observed, and the fix restored.

- R4-1 and R4-1b, `cli/lib/agent-supervisor.js` back at 080bc9d with the new tests in place: `node test/test-evaluate-preflight.js` failed three checks, "a runner whose agent left a process in a new session holding its output was still waiting after 15 s; expected 0 and the agent's answer", "a runner whose timed-out agent left a process in a new session holding its output was still waiting after 15 s; expected 5 at the 1000 ms wall clock", and "a runner whose agent left its unread input to a process in a new session was still waiting after 15 s".
- R4-1b alone, the agent's standard input inherited again with the output still copied: one failure, the unread-input case.
- R4-2, thread-pool streams: no deterministic test fails, since the flip to non-blocking needs load; `fid.js` under 4-way parallel load in the container reproduced it in 2 of 24 runs before the change and 0 of 40 after, and the per-leader trace named `ERR_SYSTEM_ERROR` from Node's `EAGAIN` retry limit.
- E2b, the schema's `maximum` removed: `node test/test-evaluate-check.js` failed "a maxElapsedMs past the 2147483647 ms one timer holds: check exited 0; expected 10".

### Final review round 4 execution probes

Each probe ran against the worktree, on macOS and in a `node:24-slim` container with `procps` and `python3` added, with 4662ab3 and 080bc9d exported beside it.

- The finding's repro: the runner returns `alpha` with exit 0 after 1175 ms in the container (15058 ms at 080bc9d) and after about 1 s on macOS (25 s at 080bc9d).
- The unread-input holder: `EPIPE` after 657 ms in the container and 698 ms on macOS, 12 s at 080bc9d on both.
- `fid.js` (large, binary and invalid UTF-8 output, stdin, late child output, the stderr tail of exit 7, `SIGSEGV`, output past `maxBuffer`, a write to descriptor 3): identical to 4662ab3 on both systems.
  Its stdin case decodes each chunk alone, so its reply depends on how the pipe splits the prompt and differed from 4662ab3 in the container under both layouts; with `setEncoding('utf8')` the reply is identical, 1000000 characters.
- `fds.js` and `pyfds.py`: the agent holds descriptors 0 to 2 only, sockets as before.
- `death.js`, every target (runner, supervisor, leader, agent, runner group, leader group) by `SIGKILL`, `SIGTERM`, `SIGINT`, `SIGHUP` and `SIGQUIT`: nothing left, on both systems, except `SIGINT` to the `sh` agent alone, which `sh` ignores, as at d18df6f; a catchable signal to the leader or its group now stops the agent with that signal, where the leader ignored it.
- `race.js`: 21 trials, 0 orphans, on both systems.
- `grpstop.js`: the answering agent exits 0 with its answer three runs of three, and the 30 s agent exits 5, on both systems.
- `bigstop.js` (new: the runner's group stopped while the agent writes 10 MB under a 2000 ms wall clock): exit 5 at the wall clock on both systems, as at 080bc9d, so the leader's clock runs while the runner's pipe is full.
- `stopsup.js` (the supervisor stopped): the answer after 1 s; `leadstop.js`: the leader stopped reports "gave no report" at the backstop, the agent stopped times out, and the leader and supervisor stopped together wait for good, as at 080bc9d.
- `ttyprobe.py` Ctrl-C and `Ctrl-\`: nothing left, the runner ends by `SIGINT` and `SIGQUIT`; `tstp3.py` and `tstp4.py` (Ctrl-Z, `fg` after 9 s): the sleeping agent reports `timed out after 3000ms` and the answering one returns `agent-done`, on both systems.
- `node test/test-evaluate-preflight.js` in the container: 219 checks pass.

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

Final review round 2 (after the fixes and the eval-quality 4.1.1 pin):

- `npm test` -- exit 0 (run before the last wording change to the runner's exit 4 row; `format:check`, `lint:md`, `test:doc-claims` and `test:doc-claim-sources` rerun after it, exit 0)
- `npm run test:cli` -- exit 0
- `npm run test:evaluate-preflight` -- three consecutive runs, exit 0 each, 203 checks
- `npm run test:release-metadata` -- exit 0
- `npm run docs:validate-links` -- exit 0
- `npm run docs:build` -- exit 0
- the Build Rules engine check -- exit 0; `package.json` and `package-lock.json` name `eval-quality` 4.1.1 from the registry, with no `file:` or `.tgz` spec

Final review round 3 (after the fixes and the peer floor raise):

- `npm test` -- exit 0 (the first run exit 1: `test:doc-claims` on `SIGSTOP` in the reference, fixed)
- `npm run test:cli` -- exit 0
- `npm run test:evaluate-preflight` -- three consecutive runs, exit 0 each, 212 checks
- `npm run test:release-metadata` -- exit 0
- `npm run docs:validate-links` -- exit 0
- `npm run docs:build` -- exit 0
- the Build Rules engine check -- exit 0

Final review round 4 (after the fixes and the eval-quality 4.1.2 raise):

- `npm test` -- exit 0 (run before three comment and wording edits; `format:check`, `lint`, `lint:md`, `test:doc-claims` and `test:evaluate-preflight` rerun after them, exit 0)
- `npm run test:cli` -- exit 0
- `npm run test:evaluate-preflight` -- three consecutive runs, exit 0 each, 219 checks
- `npm run test:release-metadata` -- exit 0
- `npm run docs:validate-links` -- exit 0
- `npm run docs:build` -- exit 0
- the Build Rules engine check -- exit 0; `package.json` and `package-lock.json` name `eval-quality` 4.1.2 from the registry, with no `file:` or `.tgz` spec
