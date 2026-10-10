---
title: 'tea-trace CLI'
description: 'Run Trace and publish a coverage gate from the terminal.'
---

# tea-trace CLI

`tea-trace` runs the [Trace skill](/docs/how-to/workflows/run-trace.md) against existing requirements and tests.
It writes a traceability matrix, coverage summary, and gate decision when the run is gate-eligible.
Before the agent starts, the CLI freezes the target criteria and priorities from the source document.
It checks the saved oracle ledger, matrix, coverage arithmetic, decision, and live evidence before publishing reports.
Each attempt retains its prompt, agent output, and generated files.

Install TEA with Node.js 22.20.0 or later, then install and authenticate an agent.
The package includes the Trace skill and knowledge base.
A consuming project can provide `_bmad/config.toml` and workflow customizations.

```bash
npm install --save-dev bmad-method-test-architecture-enterprise
npx tea-trace \
  --agent codex \
  --target docs/epics/epic-4-tenant-export.md \
  --test-dir tests \
  --json trace-result.json
```

Use `--project-root` to run against a project from another directory.
Relative paths resolve inside that project, and artifact links outside it fail validation.

## Scope and inputs

| Option                     | Meaning                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--target <path>`          | Story, epic, or requirements document. Omit it for project-level oracle discovery.                                                          |
| `--target-id <id>`         | Explicit identity for the selected scope.                                                                                                   |
| `--gate-type <type>`       | `story`, `epic`, `release`, or `hotfix`. Inferred from the target when omitted.                                                             |
| `--test-dir <path>`        | Static tests, default `tests`.                                                                                                              |
| `--source-dir <path>`      | Oracle-discovery source, default the project root.                                                                                          |
| `--live-results <path>`    | Runtime evidence. Defaults to `live-verification-results.json` in the artifact root.                                                        |
| `--waiver-register <path>` | Waiver register. Defaults to `gate-waivers.md` in the artifact root.                                                                        |
| `--coverage-levels <list>` | Comma-separated levels, default `e2e,api,component,unit,live`.                                                                              |
| `--collection-mode <mode>` | Defaults to `contract_static`; accepts `inventory_only`, `runtime_manifest`, `deferred_shared`, `waived`, `restricted`, and `inaccessible`. |
| `--no-gate`                | Collect coverage without a gate. `inventory_only` also disables gate evaluation.                                                            |
| `--fail-on <status>`       | Defaults to `fail`. Use `concerns` to exit 1 on CONCERNS.                                                                                   |

Use `runtime_manifest` when no static test directory is available.
Missing or unreadable live evidence reports `INACCESSIBLE` and leaves the gate unevaluated.
The CLI rejects reports that claim collected coverage from missing evidence.
It reads the [live verification contract](/docs/reference/live-verification-results.md).
Existing Test Design and NFR documents are read from the project's artifact root.

## Agent and execution

`--agent` is required.
Choose `codex`, `claude`, `agy`, `custom`, or `none`.
Use the agent CLI's existing login; [Test Review CLI prerequisites](/docs/reference/tea-test-review-cli.md#prerequisites) describe agent setup.

| Option                | Meaning                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `--model <name>`      | Override the adapter's default model.                                    |
| `--agent-cmd <path>`  | Override the executable; required for `custom`.                          |
| `--agent-arg <arg>`   | Pass an extra agent argument. Repeat as needed.                          |
| `--env-pass <NAME>`   | Pass an environment variable. Repeat as needed.                          |
| `--timeout-ms <n>`    | Timeout per attempt, default `1200000`.                                  |
| `--retries <n>`       | Additional transport or timeout attempts, default `1`, maximum `3`.      |
| `--skill-root <path>` | Use an explicit Trace skill directory with sibling `bmod-tea/knowledge`. |

`--agent none` prints and saves the resolved prompt without invoking an agent or replacing reports.
Each retry uses a fresh attempt directory.
Reports must be independent files inside that attempt; links to old or external reports fail validation.
Invalid or incomplete output retains diagnostic evidence.

## Outputs and exit codes

`--output-dir` sets the artifact root, default `_bmad-output/test-artifacts`.
The CLI publishes scope-specific files under `trace/`:

- `traceability-matrix-{run_key}.md`
- `e2e-trace-summary-{run_key}.json`, schema `0.3.x`
- `gate-decision-{run_key}.json`, schema `0.1.0`, for gate-eligible runs

Epic 4 uses `epic-4`; stories use their document basename; release and hotfix scopes use slugs.
Runs without a narrower target use `system`.
The result prints artifact and evidence paths to standard output.
`--json <path>` also saves the result and must point outside declared inputs and trace artifacts.
`--evidence-dir` sets the retained attempt root, default `.tea-runs`.

| Exit | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | PASS, accepted CONCERNS, coverage without a gate, or prompt inspection. |
| `1`  | FAIL, or CONCERNS with `--fail-on concerns`.                            |
| `2`  | Invalid configuration, input, or unavailable agent.                     |
| `3`  | Agent execution failed or current artifacts failed validation.          |

Before the agent runs, the CLI snapshots supplied inputs and the consuming Git revision.
It checks input bytes, identity, permissions, and paths again before publication.
Live results are checked against the frozen manifest and revision.
A current-revision failure caps a passing gate at CONCERNS, including mixed-freshness manifests.

Runs that invoke an agent clear the previous reports for their scope before the attempt begins.
Failed attempts retain evidence and publish a failed command result.
Publication stages the report set and restores it after a write failure.
If rollback fails, the error names retained recovery backups.
Reports for other scopes remain in place.

The repository diagnostic harness accepts `--artifacts-dir <path>` to retain staged projects, prompts, observations, and output streams during skill evaluations.
Use a path outside the repository to keep the evaluated Git state unchanged.
The harness runs `tea-trace-runner`; public CLI integration checks run `tea-trace`.
