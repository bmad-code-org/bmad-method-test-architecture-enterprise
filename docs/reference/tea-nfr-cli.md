---
title: 'tea-nfr CLI'
description: Audit supplied NFR implementation evidence and publish a verified report with its canonical context
---

# tea-nfr CLI

`tea-nfr` runs the packaged `bmad-testarch-nfr` Create workflow against existing project evidence. It supplies resolved TEA configuration and the selected NFR customization, completes the workflow, validates the report and its canonical criterion/evidence context, and publishes both files together.

```bash
npx --package bmad-method-test-architecture-enterprise tea-nfr \
  --agent codex \
  --project-root /work/relay \
  --input docs/tech-spec.md \
  --implementation src \
  --evidence evidence \
  --output-dir test-artifacts
```

The project must contain implementation files and existing implementation evidence. Supply narrow source directories such as `src` and `evidence`, or individual files. Output and retained-run directories must be separate from every supplied source directory. Requirements provide thresholds; implementation evidence provides observations. Supplying the same file in both roles fails before invocation.

The command audits security, performance, reliability and maintainability. The workflow's eight ADR categories guide elicitation. Explicit criteria outside the four audited domains appear in a recorded-only table and have no audited status or gate impact. Unknown thresholds and missing implementation evidence produce CONCERNS. The workflow determines whether measured evidence meets a declared threshold. The CLI never supplies a numerical threshold policy.

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
| `--timeout-ms <n>`                         | Timeout per vendor attempt, defaults to 1200000 milliseconds.                                                        |
| `--retries <n>`                            | Additional transport/timeout attempts, defaults to zero; maximum three. Every retry has fresh artifact paths.        |
| `--model <name>`                           | Model override. Omitted selects the repository's pinned adapter model.                                               |
| `--agent-cmd <path>`                       | Agent executable override. Required with `--agent custom`.                                                           |
| `--agent-arg <arg>`                        | Additional agent argument, repeatable.                                                                               |
| `--env-pass <NAME>`                        | Additional environment name passed to the agent, repeatable.                                                         |
| `--skill-root <dir>`                       | Explicit trusted installed skill override with its sibling `bmod-tea` knowledge.                                     |

Create is the command's supported operation. Each invocation performs a complete fresh audit. Interactive skill invocation also provides Resume, Validate and Edit.

## Artifacts and validation

Successful live execution prints one JSON object to stdout with `status`, `gatePassed`, `report`, `context`, `evidence` and `runKey`. Reports live under `OUTPUT/nfr/nfr-assessment-RUNKEY.md`; canonical context snapshots live beside them as `nfr-context-RUNKEY.json`. Valid failed gates publish their evidence and return the configured gate exit code.

Each retained attempt includes the exact prompt, stdout, stderr, attempt metadata and fresh generated artifacts. `run.json` records the selected adapter, requested model, capabilities, attempts and mode. CLI errors print an evidence directory when one was allocated. Agent readiness failures occur before run allocation. Existing published reports remain available when generation or validation fails.

Validation checks completion and scope, a unique gate and domain sections, declared criterion identities/order, literal threshold and observation excerpts from explicitly supplied files, canonical citation paths and criterion bindings, UNKNOWN/missing-evidence rules, recorded-only isolation and status rollups. Actual values must come from supplied implementation evidence. Inline code quotations and complete fenced quotations are checked against their bound source files. Human report statuses accept one complete enum with an optional matching approved check, warning, cross or N/A glyph. Canonical JSON and gate statuses remain exact enums. Recorded category display labels allow capitalization and spaces for canonical hyphens. The original prompt's exact UNKNOWN threshold gap wording remains accepted alongside the explicit current message. Reports and context files must be fresh regular files confined to the current attempt. Supplied file and directory identities, topology, type and permission modes are checked for changes before publication. Headings and gate YAML inside enclosing code examples cannot satisfy completion.

The CLI stages both deliverables before replacing existing files. If a replacement fails, it restores the previous files. A failed rollback reports its recovery directories. Publication refuses canonical path, symlink and hardlink aliases onto sources or other deliverables. The source integrity checks detect changes made by an agent; they do not undo those agent changes. Read the retained evidence before trusting an audit after such a failure.

Semantic interpretation of source documents and the appropriateness of the audit's judgments remain review tasks. Source quotations and a consistent gate make those judgments inspectable. A report with four N/A domains contains no applicable automated criteria; its N/A status makes that absence visible.

## Exit codes

| Code | Meaning                                                                                  |
| ---- | ---------------------------------------------------------------------------------------- |
| 0    | Valid audit accepted by `--fail-on`, or prompt-only output.                              |
| 1    | Valid audit breaches the configured gate threshold.                                      |
| 2    | Invalid configuration, inputs, output collision, agent readiness or publication failure. |
| 3    | Vendor failure/timeout, incomplete or invalid generated artifacts, or source mutation.   |

For evaluator runs, `node test/eval-nfr.js --agent codex --runs 2 --artifacts-dir /tmp/nfr-observations --json /tmp/nfr-result.json` retains staged inputs, generated reports, raw probe observations and per-attempt provenance before workspace cleanup. A single repetition is reported as unrepeated, with stability unmeasured.

## Retained Codex observations

The pinned original public calls at source `a8225395571b026f194aefc696ca0a18922bf919` both returned exit 3. The clean call exposed a report parser rejection of `PASS ✅`; the gapped call exposed rejection of source-backed fenced quotations. These original results and raw streams remain unchanged under `test/results/codex-nfr/public-cli-original/`.

Controlled parser replays reuse those report bytes with only the canonical context's `requestId` and `supplied_project_root` adapted for a fresh attempt. The repaired parser accepts the clean report as PASS and publishes the gapped report as FAIL with gate exit 1. These replays contain no new model generation. Each original case has one repetition, so stability remains unmeasured. The existing NFR skill source is unchanged; corrected corpus accuracy supplies no causal claim of skill improvement.
