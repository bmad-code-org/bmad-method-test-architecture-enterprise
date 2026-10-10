---
title: 'tea-trace CLI'
description: 'Run Trace from a terminal and retain the evidence behind its coverage gate.'
---

# tea-trace CLI

`tea-trace` runs the [Trace skill](/docs/how-to/workflows/run-trace.md) against existing requirements and tests.
It publishes a traceability matrix, a coverage summary, and an eligible gate decision as JSON.
Each attempt keeps its prompt, agent output, and generated files for inspection.
Before publication, the command checks coverage arithmetic, threshold fields, and the decision's consistency with coverage and confidence.

Install TEA with Node.js 22.20.0 or later, then install and authenticate the agent you select.
The command uses the skill and knowledge base shipped in its package.
The consuming project can supply `_bmad/config.toml` and workflow customizations; defaults support projects without a BMAD install.

```bash
npm install --save-dev bmad-method-test-architecture-enterprise
npx tea-trace \
  --agent codex \
  --target docs/epics/epic-4-tenant-export.md \
  --test-dir tests \
  --json trace-result.json
```

Use `--project-root` when running from another directory.
Relative inputs and output paths resolve inside that project.
Artifact paths preserve declared inputs and reject links that resolve outside the project.
The command preserves the source requirement priorities when mapping tests.
Its coverage gate follows the skill's rules, including oracle confidence and recorded live evidence.
Filed waivers are validated and reported separately from the computed decision.

## Scope and inputs

| Option                     | Meaning                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--target <path>`          | Story, epic, or requirements document. Omit it for project-level oracle discovery.                                                           |
| `--target-id <id>`         | Explicit identity for the selected scope.                                                                                                    |
| `--gate-type <type>`       | `story`, `epic`, `release`, or `hotfix`. The document supplies the default.                                                                  |
| `--test-dir <path>`        | Static tests, default `tests`.                                                                                                               |
| `--source-dir <path>`      | Source used for oracle discovery, default the project root.                                                                                  |
| `--live-results <path>`    | Recorded runtime evidence. Defaults to `live-verification-results.json` in the artifact root.                                                |
| `--waiver-register <path>` | Waiver register. Defaults to `gate-waivers.md` in the artifact root.                                                                         |
| `--coverage-levels <list>` | Comma-separated levels, default `e2e,api,component,unit,live`.                                                                               |
| `--collection-mode <mode>` | Default `contract_static`. Also accepts `inventory_only`, `runtime_manifest`, `deferred_shared`, `waived`, `restricted`, and `inaccessible`. |
| `--no-gate`                | Collect coverage and omit gate signals. `inventory_only` also disables the gate.                                                             |
| `--fail-on <status>`       | Default `fail`. Use `concerns` to fail CI on CONCERNS too.                                                                                   |

`runtime_manifest` supports projects without a static test directory.
It reads the [live verification contract](/docs/reference/live-verification-results.md).
Missing or unreadable runtime evidence leaves the collection inaccessible and the gate unevaluated.
Existing test-design and NFR documents are read from the project's original artifact root.

## Agent and execution options

`--agent` is required.
Select `codex`, `claude`, `agy`, `custom`, or `none`.
Use your agent CLI's existing login; the [Test Review CLI prerequisites](/docs/reference/tea-test-review-cli.md#prerequisites) describe agent setup.

| Option                | Meaning                                                                             |
| --------------------- | ----------------------------------------------------------------------------------- |
| `--model <name>`      | Override the adapter's default model.                                               |
| `--agent-cmd <path>`  | Override the executable; required for `custom`.                                     |
| `--agent-arg <arg>`   | Pass an extra agent argument. Repeat as needed.                                     |
| `--env-pass <NAME>`   | Pass an additional environment variable. Repeat as needed.                          |
| `--timeout-ms <n>`    | Timeout per attempt, default `1200000`.                                             |
| `--retries <n>`       | Additional attempts after transport failures or timeouts, default `1`, maximum `3`. |
| `--skill-root <path>` | Use an explicit Trace skill directory with sibling `bmod-tea/knowledge`.            |

`--agent none` saves and prints the resolved prompt without invoking an agent or replacing published trace reports.
Every retry uses a fresh artifact directory.
Malformed or incomplete artifacts end the run with their diagnostic evidence retained.

## Outputs and exit codes

`--output-dir` overrides the resolved `test_artifacts` root.
The default is `_bmad-output/test-artifacts`.
Under its `trace/` folder, the command publishes scope-specific files:

- `traceability-matrix-{run_key}.md`
- `e2e-trace-summary-{run_key}.json`, schema `0.3.x`
- `gate-decision-{run_key}.json`, schema `0.1.0`, when gate-eligible

An epic numbered 4 uses `epic-4`; a story uses its document basename; release and hotfix IDs use slugs.
An invocation without a narrower target uses `system`.
The JSON result prints artifact and evidence paths to standard output.
`--json <path>` also saves that result; it requires a separate path from trace artifacts and declared inputs.
`--evidence-dir` changes the retained attempt root, default `.tea-runs`.

| Exit | Meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| `0`  | Completed PASS, accepted CONCERNS, coverage without a gate, or prompt inspection. |
| `1`  | Computed FAIL, or CONCERNS with `--fail-on concerns`.                             |
| `2`  | Invalid configuration, input, or unavailable agent.                               |
| `3`  | Agent execution failed or current artifacts failed validation.                    |

Before an agent starts, a fresh run clears the previous published files for its own scope.
A failed attempt keeps its evidence and publishes a failed command result.
Other scopes keep their reports.

The repository's diagnostic harness accepts `--artifacts-dir <path>` to retain staged projects, prompts, tagged observations, and output streams during before/after evaluations.
Choose a directory outside the repository so retained observations preserve the evaluated Git state.
This harness drives `tea-trace-runner`; public CLI integration checks exercise `tea-trace` itself.
