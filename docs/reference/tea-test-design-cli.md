---
title: 'Test Design CLI'
description: 'Generate verified test plans from project requirements with a headless agent.'
---

`tea-test-design` runs the packaged `bmad-tea-test-design` skill against a consuming project's requirement documents. It writes the skill's plan and progress checkpoint.

Before writing, it checks that the current run produced both, that the checkpoint reports completion, and that risk arithmetic, declared score bands and coverage references are valid. It requires populated mandatory sections for the selected full-plan template and a P0/P1/P2/P3 priority on each coverage row.

Needs Node.js 22.20.0+. A live run also needs an agent CLI you already use: Claude Code (`--agent claude`), Codex (`--agent codex`), Antigravity (`--agent agy`), or any other runner through `--agent custom` with `--agent-cmd`. It uses that CLI's existing session, so there is no separate login step. `--agent none` saves the prompt without calling an agent and needs neither. [Prerequisites](/docs/reference/tea-test-review-cli.md#prerequisites) cover each agent.

```bash
npm install --save-dev bmad-method-test-architecture-enterprise
```

The examples below use `--agent codex`; swap in the agent you use. A `custom` runner also needs `--agent-cmd`, and may need `--agent-arg` and `--env-pass`.

## Examples

For one epic:

```bash
npx tea-test-design \
  --project-root . \
  --input docs/epic-7.md \
  --epic 7 \
  --agent codex
```

For a system plan:

```bash
npx tea-test-design \
  --project-root . \
  --scope system \
  --input docs/prd.md \
  --input docs/architecture.md \
  --agent codex
```

System scope produces architecture, QA and handoff documents. Epic scope produces `test-design-epic-<id>.md`. Both publish a completed progress checkpoint under the `test-design/` folder of `--output-dir`, which defaults to the project's configured `test_artifacts` directory. Missing setup files use the package defaults.

## Options

`--agent none` saves the complete skill prompt and a record marked `prompt-only`. It needs no vendor credentials. This lets you inspect a concrete invocation before running it.

| Option                 | Meaning                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--agent <name>`       | Required: `codex`, `claude`, `custom`, `agy` or `none`.                                                                       |
| `--input <path>`       | A project requirements or architecture document. Repeat for additional context. System scope requires two distinct documents. |
| `--scope <name>`       | `epic` by default, or `system`.                                                                                               |
| `--epic <id>`          | Required for epic scope: a number or stable lowercase slug.                                                                   |
| `--project-root <dir>` | Consuming project root. Defaults to the working directory.                                                                    |
| `--skill-root <dir>`   | Explicit trusted skill directory. The packaged skill is the default. Its sibling `bmod-tea` knowledge must be installed.      |
| `--output-dir <dir>`   | Published artifact root inside the project.                                                                                   |
| `--evidence-dir <dir>` | Retained run evidence inside the project. Defaults to `.tea-runs`.                                                            |
| `--model <name>`       | Model override; not accepted with `custom` or `none`.                                                                         |
| `--timeout-ms <n>`     | Wall-clock limit per attempt. Defaults to 1,200,000 milliseconds.                                                             |
| `--retries <n>`        | Additional attempts for transport failures or timeouts, from 0 to 3. Defaults to 0.                                           |
| `--agent-cmd <path>`   | Override the adapter executable. Required for `custom`.                                                                       |
| `--agent-arg <arg>`    | Append a vendor argument. Repeat for several arguments.                                                                       |
| `--env-pass <NAME>`    | Pass an additional environment name to the vendor. Repeat as needed.                                                          |

Claude and Codex default to an adapter model and Agy to its session model. A `custom` runner takes its model via `--agent-arg` ([details](/docs/reference/tea-test-review-cli.md#which-model-does-the-reviewing)).

## Artifacts and validation

Each attempt has its own fresh artifact directory. The CLI retains the exact prompt, raw stdout, raw stderr, attempt timing, prompt digest and vendor/model record under the evidence directory. An incomplete or malformed report fails before publication. Existing reports cannot satisfy the new attempt's checks. The JSON line on stdout identifies the published artifacts and retained evidence. Publication stages every validated file before replacement. If replacement fails, the CLI restores previous reports and prints the retained evidence path. If filesystem errors prevent restoration, its diagnostic identifies recovery backups and affected files.

The check verifies report structure and internal consistency. Review the plan's risk judgments and scope against your requirements before using it as a release policy.

## Exit codes

| Exit | Meaning                                                                    |
| ---- | -------------------------------------------------------------------------- |
| 0    | Validated artifacts published, or prompt-only invocation saved.            |
| 2    | Invalid arguments, inputs, paths, skill configuration or vendor readiness. |
| 3    | Vendor execution failure, timeout or invalid generated artifact.           |

The existing `tea-test-design-runner` remains the prompt-input command used by the evaluation harness. Use the user-facing command above for project plans.
