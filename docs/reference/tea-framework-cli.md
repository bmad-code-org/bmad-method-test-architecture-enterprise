---
title: tea-framework CLI
description: Run test framework and CI setup without an interactive chat
---

# tea-framework CLI

`tea-framework` runs the framework skill shipped in the npm package.
Choose framework setup, CI setup, or both, then select Create, Resume, Validate, or Edit.
It keeps the prompt and agent output for each attempt and checks the skill's saved journal before reporting completion.

Needs Node.js 22.20.0+ and an installed, authenticated agent CLI ([prerequisites](/docs/reference/tea-test-review-cli.md#prerequisites)).

```bash
npm install -g bmad-method-test-architecture-enterprise
tea-framework --agent codex --scope both
```

The command runs in the current project by default.
`--project-root <dir>` selects another project.
The agent can write setup files, install dependencies, and execute project commands.
For a Codex run that needs package downloads or local HTTP services, pass `--allow-network`.
This grants unrestricted outbound network access for that run.

## Operations

```bash
# Preview the resolved request: no setup files, no model call; the prompt is retained in the run directory.
tea-framework --agent none --scope both

# Resume the scope and original operation saved in the setup journal.
tea-framework --agent codex --operation resume

# Validate exact artifacts and keep the validation report.
tea-framework --agent codex --operation validate --scope ci \
  --input .github/workflows/test.yml

# Apply the requested changes described in a project file.
tea-framework --agent codex --operation edit --scope framework \
  --input playwright.config.ts --instructions setup-changes.txt
```

Create defaults to framework scope.
CI Create requires an existing Git worktree and stops before any writes when it is absent.
`--scope ci` configures CI for the existing framework.
When a CI-only request finds no framework, the skill records the unresolved setup offer and leaves the run incomplete.
Use `--scope both` to authorize both phases.

Resume restores the saved scope and original Create, Edit, or Validate operation.
It preserves the run identity, frozen contract, completed hook instructions, and the original CLI request text and input digests.
The CLI saves that request beside the setup journal using the journal run ID, so changes to the original instructions file do not change a resumed run.
An uncertain started hook requires explicit operator recovery in the journal before headless execution.
Omit new input and instruction flags when resuming.
Validate completes its report even when that report contains failing checks.
Read the report's findings before using the validated artifacts.
Completion requires a fresh, nonempty report owned by the current journal and covering the exact selected artifacts.
Resume preserves the reserved report and its original ownership.
Edit accounts for each selected target through an applied change or an explicit no-op reason.

## Configuration and options

Configuration follows the [TEA configuration layers](./configuration.md).
The CLI supplies a resolved snapshot, including module defaults when project configuration is absent.
Framework and CI customizations keep their existing scope and hook rules.

| Option                                       | Meaning                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `--scope framework\|ci\|both`                | Requested phases; default `framework`                                           |
| `--operation create\|resume\|validate\|edit` | Operation; default `create`                                                     |
| `--input <path>`                             | Exact project artifact; repeat for multiple inputs                              |
| `--instructions <path>`                      | Project file with a setup request or requested edits                            |
| `--skill-root <dir>`                         | Explicit skill copy; default is the packaged framework skill                    |
| `--output <dir>`                             | Directory for retained CLI runs; default `{test_artifacts}/framework/cli-runs/` |
| `--json <path>`                              | Additional project-relative `.json` result file                                 |
| `--agent <name>`                             | Required vendor adapter; `none` previews the prompt                             |
| `--model <name>`                             | Model override; not accepted with `custom` or `none`.                           |
| `--allow-network`                            | Allow outbound network access in the Codex workspace sandbox                    |
| `--timeout-ms <n>`                           | Wall-clock limit per attempt; default 1,200,000 ms                              |
| `--retries <n>`                              | Additional transport or timeout attempts; default 0, maximum 3                  |
| `--agent-cmd <path>`                         | Agent executable override                                                       |
| `--agent-arg <arg>`                          | Additional agent argument; repeat as needed                                     |
| `--env-pass <NAME>`                          | Additional environment variable passed to the agent                             |
| `--no-use-playwright-utils`                  | Disable the optional Playwright utilities                                       |
| `--no-use-pactjs-utils`                      | Disable the optional Pact utilities                                             |

Claude and Codex default to an adapter model and Agy to its session model. A `custom` runner takes its model via `--agent-arg` ([details](/docs/reference/tea-test-review-cli.md#which-model-does-the-reviewing)).

Input and output paths stay inside the selected project, including through symlinks.
Result publication protects configuration, input files, and generated setup outputs, including symlink and hard-link aliases.
Failed runs check protected inputs again before writing diagnostic output.
An explicit retry retains the previous attempt and requests Resume when a shared journal exists.
The journal's hook ledger prevents repeating completed hooks.
Automatic retries continue only newly recoverable progress from the current invocation.

## Results

Each live command creates a unique run directory containing:

- `result.json` and `report.md`: completion status, scope, operation, referenced artifacts, and unresolved work.
- `run.json`: agent, model, execution limit, and attempt outcomes.
- `attempt-N/prompt.txt`, `stdout.txt`, `stderr.txt`, and `attempt.json`: the complete request and captured agent evidence.

Once the skill creates a journal run ID, the CLI also saves `cli-request-<hash>.json` in the framework artifacts folder for external Resume.

The skill keeps its shared journal at `{test_artifacts}/framework/setup-run-progress.md` and its existing per-phase progress files.
Create completion requires a completed matching journal, completed requested phases, a finished hook ledger, and existing referenced artifacts.
Create also reruns the frozen test commands through the process supervisor and requires nonempty test source and positive native execution of every frozen test command.
CI completion requires a pipeline with runnable jobs that invoke a frozen test command.
Every native summary contributes its failure and cancellation counts, including separate suites in one shell command.
Package scripts resolve from their selected directory, including `npm --prefix` subprojects.
The controller recognizes Node test, unittest, pytest, Playwright, Vitest, Jest, Cypress, Go, Cargo, .NET, and PHPUnit summaries.
Standard npm, pnpm, Yarn, and shell commands resolve to their declared runner.
An unknown runner, an empty suite, or a skipped-only suite marks the run incomplete and retains logs.
Each command inherits the caller's project environment, uses `--timeout-ms` as its wall-clock limit, and runs under the process-tree supervisor.
`attempt-N/verification.json` and `verification-N.stdout.txt` / `verification-N.stderr.txt` retain its command, budget, status, and raw output.
Validate findings remain in the skill outputs and captured agent transcript.

| Exit | Meaning                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------ |
| `0`  | Operation completed (Validate completion does not mean all checks passed), or prompt preview succeeded |
| `1`  | Agent finished, but setup completion checks found unresolved work                                      |
| `2`  | Invalid arguments, configuration, paths, or unavailable agent                                          |
| `3`  | Agent transport, timeout, or artifact parsing failure                                                  |

For the interactive workflow and its stack choices, see [framework and CI setup](../how-to/workflows/setup-test-framework.md).
