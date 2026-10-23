---
title: tea-automate CLI
description: Generate red acceptance scaffolds or expand test coverage through a headless agent
---

# tea-automate CLI

`tea-automate` runs the merged Automate skill shipped in the npm package.
It supplies project configuration and mode customizations, runs the agent, and validates the generated manifest and summary.

Needs Node.js 22.20.0+ and an agent CLI you already use: Claude Code (`--agent claude`), Codex (`--agent codex`), Antigravity (`--agent agy`), or any other runner through `--agent custom`. The run uses that CLI's existing session, so there is no separate login step; [prerequisites](/docs/reference/tea-test-review-cli.md#prerequisites) cover each agent.

A live run writes tests and runs the project's tests.

```bash
npm install -g bmad-method-test-architecture-enterprise
tea-automate --agent codex --mode expand --target src \
  "Add API coverage for the voucher redemption rules"

tea-automate --agent codex --mode red --story docs/stories/reserve-a-locker.md
```

Preview with `--agent none` first. Add `--allow-network` only when the tests need it (see below).

An explicit `--mode` selects red or expand.
Without it, acceptance-test wording selects red, coverage wording selects expand, and unspecified requests default to expand.
Resume restores the checkpoint's mode.
Conflicting explicit modes stop before the agent runs.

Create executes generated tests and repairs confirmed test defects, using up to three repair rounds.
Red retains skipped permanent scaffolds and verifies intended failures in a disposable copy.
Playwright, Vitest and Jest projects are verified with their own runners ([details](#which-generated-tests-can-be-verified)).
Expand keeps generated tests active.
Product defects and execution blockers appear in the saved summary and JSON output.

`tea-automate` does not grant Codex workspace network access by default. The user's Codex configuration can still enable it.
Pass `--allow-network` when project tests need local HTTP services or other network calls. This grants unrestricted outbound network access for that Automate run.
The flag requires `--agent codex`. An explicit `--agent-arg=-c --agent-arg=sandbox_workspace_write.network_access=false` takes precedence over the flag.
OpenAI documents this setting in [agent approvals and security](https://developers.openai.com/codex/agent-approvals-security).

## Operations

```bash
# Print the resolved prompt without generating files or calling a model.
tea-automate --agent none --mode expand --target src "Cover the checkout service"

# Continue the exact saved run, preserving its scope and repair budget.
tea-automate --agent codex --operation resume \
  --checkpoint _bmad-output/test-artifacts/atdd/atdd-checklist-reserve-a-locker.md

# Validate the saved artifact and its execution evidence.
tea-automate --agent codex --operation validate \
  --checkpoint _bmad-output/test-artifacts/automate/automation-summary-checkout.md

# Apply the requested changes to the exact saved artifact.
tea-automate --agent codex --operation edit \
  --checkpoint _bmad-output/test-artifacts/automate/automation-summary-checkout.md \
  "Add the missing expired-voucher coverage"
```

Generation operations require zero transport retries.
Resume the retained checkpoint explicitly after an interrupted run so its saved scope and repair budget remain authoritative.

Validate leaves the selected checkpoint unchanged and records a PASS, WARN, or FAIL report identifying that checkpoint.
Edit updates the selected checkpoint while preserving its identity, progress, and repair settings.
Both preserve skill boundaries and run no automatic repairs.

## Inputs and configuration

The command runs in the current directory.
`--project-root` selects a consuming project.
Supply a request as the positional argument or UTF-8 text on standard input.
A story, target, or checkpoint can supply the scope without additional text.
Red Create requires `--story`.
Edit requires change instructions.

The CLI uses the [TEA configuration layers](./configuration.md) and module defaults when setup files are absent.
Red resolves the `bmad-tea-atdd` customization surface.
Expand resolves `bmad-tea-automate`.
Prepend steps, facts, append steps, and completion hooks retain their order.

| Option                                       | Meaning                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| `--agent <name>`                             | Required adapter; `none` prints the prompt                     |
| `--mode red\|expand`                         | Explicit generation mode                                       |
| `--operation create\|resume\|validate\|edit` | Operation; default Create                                      |
| `--story <path>`                             | Story file inside the selected project                         |
| `--target <path>`                            | Target file or directory; repeat as needed                     |
| `--checkpoint <path>`                        | Exact saved artifact for Resume, Validate, or Edit             |
| `--project-root <dir>`                       | Consuming project directory                                    |
| `--project-skill`                            | Select the project-installed canonical Automate skill          |
| `--skill-root <dir>`                         | Explicit canonical skill copy with sibling TEA knowledge       |
| `--evidence-dir <dir>`                       | Project directory for retained run evidence                    |
| `--json <path>`                              | Additional JSON result file inside the project                 |
| `--model <name>`                             | Model override; not accepted with `custom` or `none`.          |
| `--timeout-ms <n>`                           | Wall-clock limit per attempt; default 1,200,000 ms             |
| `--retries <n>`                              | Validate transport/timeout retries, 0-3; generation requires 0 |
| `--allow-network`                            | Codex only: allow outbound network access (see above)          |
| `--agent-cmd <path>`                         | Agent executable override                                      |
| `--agent-arg <arg>`                          | Extra agent argument; repeat as needed                         |
| `--env-pass <NAME>`                          | Additional environment variable passed to the agent            |

Claude and Codex default to an adapter model (Codex: `gpt-6.1-sol`) and Agy to its session model. A `custom` runner takes its model via `--agent-arg` ([details](/docs/reference/tea-test-review-cli.md#which-model-does-the-reviewing)).

## Results and evidence

Live commands create a unique directory under `_bmad-output/test-artifacts/automate-cli/`.
Each attempt keeps its prompt, agent stdout and stderr, timing, and generation manifest.
`run.json` records the selected adapter, model, timeout, capability, and attempt outcomes.
The workflow's original summary/checklist path stays intact.

JSON output includes request identity, selected mode and operation, execution status, generated files, final execution reports, initial/final counts, repair rounds, remaining failures, and the Validate report path.
Each Create summary identifies the current request, story, and targets.
Its summary and generated files must be saved during that attempt.
Resume updates the exact selected checkpoint and retains its saved scope and spent repair budget.

### Which generated tests can be verified

Tests registered at runtime (loops, table registrations, computed titles, reassigned test bindings) cannot produce a verified success: dynamic scopes cannot be verified from source, so the outcome is failed.
The rest of this section applies to statically registered tests.

Passing expand and verified red outcomes require a supported report for every final scope:

| Runner     | Expand evidence                                                                        | Red evidence                                          |
| ---------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Playwright | Playwright JSON reporter output                                                        | `tea-atdd-red-check` report                           |
| Vitest     | [`tea-unit-check --mode expand`](#tea-unit-check) report                               | [`tea-unit-check --mode red`](#tea-unit-check) report |
| Jest       | `tea-unit-check --mode expand` report, or `jest --json --testLocationInResults` output | [`tea-unit-check --mode red`](#tea-unit-check) report |

Vitest's JSON reporter omits unhandled errors, so a raw Vitest JSON file cannot show a clean run; `tea-unit-check` records the process outcome beside it.
The CLI detects Vitest and Jest before the agent runs, from `package.json` dependencies, a `vitest.config.*` or `jest.config.*` file, a `vite.config.*` file when Vitest is declared, a `jest` key in `package.json`, or a workspace root's dependencies.
Vitest and Jest evidence is accepted only for a detected runner, so a runner the agent adds during the run does not count.
One run's final reports come from one runner family.
Counts must match recorded attempts.
Verified red requires an assertion failure for every executed test.
Timeouts, interruptions, runner errors, and source changes reject success.
Unsupported report formats retain evidence and produce a failed or unmeasured outcome.
JSON result destinations are checked before and after generation against input and artifact paths, including hardlink aliases.

Before accepting success, the controller derives each generated JavaScript or TypeScript test leaf from its saved source.
Playwright results must identify the same file, suite/title, source line, column, and matching configured project, including configured repetitions.
Vitest and Jest results must identify the same file, `describe` path, title, line and column, inside the consuming project.
A `tea-unit-check` report must also name the detected config file and the generated files' SHA-256; a raw Jest report without test locations is rejected.
Every retry attempt counts, so a test that passes on retry cannot produce a passing expand.
`tea-unit-check` runs Vitest with `--retry=0` and Jest with `--testFailureExitCode=1`. Vitest's JSON keeps one result per test, so a small reporter records each test's actual retry and repeat count, and any retry or repeat, from a test option or a config tag, is a run error. Jest retries come from its `invocations` count.
Jest test files that import from `@jest/globals` through Babel or ts-jest are supported.
Native ATDD results must identify a unique file and leaf title.
Missing files, leaves, or project scopes reject success.

Static literal registrations support named imports, CommonJS destructuring, module namespaces, and aliases returned by `extend` or `mergeTests`.
For Vitest and Jest, `test`, `it`, `describe` and `suite` may be imported, required from `@jest/globals`, or used as globals; `vi.mock` and `jest.mock` calls are allowed.
`each`, `for`, `skipIf`, `runIf`, `todo` and `fails` registrations cannot be verified from source.
Native source locations follow the binding and module format, including `.mjs` and package `type: module`.
Nested Playwright configs keep the consuming project root as the file identity base.
Project selection follows native glob and serialized RegExp `testMatch`/`testIgnore` rules, including flags.
A filtered native run must still cover every generated leaf in each matching project.

### tea-unit-check

`tea-unit-check` runs generated Vitest or Jest files with the project's installed runner and its own config, one file at a time, and writes the evidence `tea-automate` verifies.
It needs Vitest 3 or newer, whose reporter API reports each test's attempts.
Expand mode runs the files in place.
Red mode copies the project to a temporary directory, or the whole workspace for a workspace package, links its `node_modules` directories, and blanks only each generated leaf's `.skip` in the copy.
The saved scaffolds keep their skips.

```bash
tea-unit-check --mode red --project-root . --report red-check.json \
  --file tests/price.test.ts --file tests/cart.test.ts
```

| Option                      | Meaning                                                   |
| --------------------------- | --------------------------------------------------------- |
| `--mode expand\|red`        | Run in place, or activate red scaffolds in a copy         |
| `--project-root <dir>`      | Consuming project; required                               |
| `--report <path>`           | Report destination; required                              |
| `--file <path>`             | Generated test file; repeat as needed                     |
| `--runner vitest\|jest`     | Choose a runner only when the project declares both       |
| `--per-file-timeout-ms <n>` | Wall-clock bound per file; default 120,000 ms             |
| `--work-dir <dir>`          | Parent of the disposable copy; default the temp directory |

In red mode every generated leaf must be a `test.skip()` or `it.skip()` call.
The report records the runner, its version and config file, the consuming project root, each file's SHA-256 and exit code, each test's location, attempts and failure reason (`assertion`, `timeout` or `error`), load errors, and run errors: unhandled errors, a file run by more than one runner project, or a nonzero exit with no failed test.
A red report also lists every file the run changed in the copied tree or in place, outside `node_modules`, `.git`, `_bmad-output`, `test-results`, `.cache`, `coverage` and `__snapshots__` directories.
A file that exceeds its time limit is killed with its worker processes and reported as a load error.
`tea-automate` accepts the report only when its mode, root and config match its own request and detection, the hashes match the saved files, and, for red, every leaf was skipped and every attempt failed on an assertion.
Exit 0 means the report was written, whatever the tests did; exit 2 is a usage or setup error.

### Completion and retained inventories

Each successful attempt retains `generated-test-inventory.json` with source hashes and `validated-test-scopes.json` with reconciled runner identities.
These are controller checks of the final generated source.
The skill owns its pre-execution scope freeze and execution history.

Create and Resume require the selected mode's completed preflight, strategy/target, aggregation or generation, and terminal steps.
A completed flag alone cannot finish generation.
When validation or healing is disabled, fresh Create consumes zero repair rounds and Resume preserves its saved counter.
Directory targets protect every existing file descendant and its inode aliases before execution.
New JSON paths remain available inside those directories.

| Exit | Meaning                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------- |
| `0`  | Passing expand execution, verified red execution, completed operation, configured validation opt-out, or prompt preview |
| `1`  | Failed/unmeasured execution or reported unresolved work                                                                 |
| `2`  | Invalid arguments, configuration, required inputs, or paths                                                             |
| `3`  | Agent failure, malformed result, incomplete summary, or missing artifact                                                |

The [Automate guide](../how-to/workflows/run-automate.md) describes the generation workflow and handoff.
