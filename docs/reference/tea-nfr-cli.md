---
title: 'tea-nfr CLI'
description: Audit supplied NFR implementation evidence and publish a verified report with its canonical context
---

# tea-nfr CLI

`tea-nfr` runs the packaged `bmad-testarch-nfr` Create workflow against existing project evidence.
It supplies resolved TEA configuration and NFR customizations, runs the workflow, validates the report and its canonical context, and publishes both files together.

```bash
npx --package bmad-method-test-architecture-enterprise tea-nfr \
  --agent codex \
  --project-root /work/relay \
  --input docs/tech-spec.md \
  --implementation src \
  --evidence evidence \
  --output-dir test-artifacts
```

The project must contain implementation files and existing evidence.
Supply source directories such as `src` and `evidence`, or individual files.
Output and run directories must remain separate from every supplied source directory.
Requirements provide thresholds; implementation evidence provides observations.
Supplying the same file in both roles fails before invocation.

The command audits security, performance, reliability, and maintainability.
The workflow's eight ADR categories guide elicitation.
Explicit criteria outside the four audited domains appear in a recorded-only table and carry no gate impact.
Unknown thresholds and missing implementation evidence produce CONCERNS.
The workflow determines whether measured evidence meets a declared threshold.

## Options

| Option                                     | Meaning                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `--agent codex\|claude\|agy\|custom\|none` | Required vendor selection. `none` retains a prompt without invoking a vendor or publishing an audit.                 |
| `--input <path>`                           | Required requirements document, repeatable. Project TEA configuration files also remain protected threshold sources. |
| `--implementation <path>`                  | Required implementation file or directory, repeatable.                                                               |
| `--evidence <path>`                        | Required existing implementation evidence file or directory, repeatable.                                             |
| `--scope system\|epic\|story`              | Audit scope, defaults to `system`.                                                                                   |
| `--scope-id <id>`                          | Required lowercase slug for epic/story scope. Produces `epic-ID` or `story-ID` run keys.                             |
| `--output-dir <dir>`                       | Artifact root within the project, defaults to resolved `test_artifacts`.                                             |
| `--evidence-dir <dir>`                     | Retained live attempt root within the project, defaults to `.tea-runs`.                                              |
| `--fail-on concerns\|fail\|none`           | Gate threshold, defaults to `concerns`. `none` accepts a valid audit with any status.                                |
| `--timeout-ms <n>`                         | Timeout per vendor attempt, defaults to 1,200,000 milliseconds.                                                      |
| `--retries <n>`                            | Additional transport or timeout attempts, defaults to zero, maximum three.                                           |
| `--model <name>`                           | Model override. Omitted selects the repository's pinned adapter model.                                               |
| `--agent-cmd <path>`                       | Agent executable override. Required with `--agent custom`.                                                           |
| `--agent-arg <arg>`                        | Additional agent argument, repeatable.                                                                               |
| `--env-pass <NAME>`                        | Additional environment name passed to the agent, repeatable.                                                         |
| `--skill-root <dir>`                       | Explicit trusted installed skill override with its sibling `bmod-tea` knowledge.                                     |

Create is the command's supported operation.
Each invocation performs a fresh audit.
Interactive skill invocation also provides Resume, Validate, and Edit.

## Artifacts and validation

Live execution outputs a JSON object with `status`, `gatePassed`, `report`, `context`, `evidence`, and `runKey`.
Reports write to `OUTPUT/nfr/nfr-assessment-RUNKEY.md`.
Canonical context snapshots write beside them as `nfr-context-RUNKEY.json`.
Failed gates publish evidence and return the configured gate exit code.

Each retained attempt includes the prompt, stdout, stderr, metadata, and generated artifacts.
`run.json` records the adapter, requested model, capabilities, attempts, and mode.
CLI errors report an evidence directory when one was allocated.
Existing published reports remain intact when generation or validation fails.

Validation checks completion, scope, gate structure, domain sections, declared criteria, literal thresholds, and observation excerpts.
Actual values must come from supplied implementation evidence.
Inline code quotations and fenced quotations are verified against their bound source files.
Human report statuses accept canonical status enums with optional status glyphs.
Canonical JSON and gate statuses require exact enums.
Recorded category labels allow spaces and capitalization.
Reports and context files must be fresh regular files confined to the current attempt.
Supplied file and directory identities, topology, type, and permission modes are verified before publication.
Headings and gate YAML inside code fences cannot satisfy completion.

The CLI stages both deliverables before replacing existing files.
If replacement fails, it restores the previous files.
Publication refuses symlink or hardlink aliases onto sources or deliverables.
Source integrity checks detect file modifications made during execution.

Auditors review document interpretations and audit judgments.
Source quotations and gate statuses keep findings inspectable.
A report with four N/A domains indicates that no automated criteria applied.

## Exit codes

| Code | Meaning                                                                                  |
| ---- | ---------------------------------------------------------------------------------------- |
| 0    | Valid audit accepted by `--fail-on`, or prompt-only output.                              |
| 1    | Valid audit breaches the configured gate threshold.                                      |
| 2    | Invalid configuration, inputs, output collision, agent readiness or publication failure. |
| 3    | Vendor failure/timeout, incomplete or invalid generated artifacts, or source mutation.   |

For evaluator runs, `node test/eval-nfr.js --agent codex --runs 2 --artifacts-dir /tmp/nfr-observations --json /tmp/nfr-result.json` retains staged inputs, generated reports, raw observations, and provenance before cleanup.
Single repetitions report stability as unmeasured.

## Retained Codex observations

The pinned original public calls at source `a8225395571b026f194aefc696ca0a18922bf919` returned exit 3.
The clean run exposed a parser rejection of `PASS ✅`.
The gapped run exposed rejection of source-backed fenced quotations.
Original results and raw streams remain under `test/results/codex-nfr/public-cli-original/`.

Controlled parser replays reuse those report bytes with adapted `requestId` and `supplied_project_root` fields.
The repaired parser accepts the clean report as PASS and publishes the gapped report as FAIL with gate exit 1.
These replays run without model calls or skill modifications.
Each original case has one repetition, so stability remains unmeasured.
