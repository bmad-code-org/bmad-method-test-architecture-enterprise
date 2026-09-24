---
name: 'step-01-load-context'
description: 'Resolve coverage oracle, load knowledge base, gather related artifacts, and resolve run identity'
nextStepFile: '{skill-root}/steps-c/step-02-discover-tests.md'
resumeStepFile: '{skill-root}/steps-c/step-01b-resume.md'
knowledgeIndex: './resources/tea-index.csv'
outputFile: '{test_artifacts}/trace/traceability-matrix-{run_key}.md'
---

# Step 1: Resolve Coverage Oracle & Load Knowledge Base

## STEP GOAL

Resolve the best available coverage oracle, capture confidence and provenance, gather supporting artifacts for traceability, and resolve the gate target and run identity that name this run's outputs.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config, source tree, loaded artifacts, and knowledge fragments
- Focus: this step's goal only
- Limits: do not execute future steps
- Dependencies: prior steps' outputs (if any)

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Resolve Coverage Oracle

At least one of the following must be usable:

- Formal requirements (story/epic acceptance criteria, PRD, test design)
- Contract/spec artifacts (OpenAPI, GraphQL schema, protobuf, etc.)
- External pointers to a requirements source that can be resolved through installed adapters/MCPs
- Analyzable source code that supports synthetic journey/requirement inference

Tests exist OR gaps are explicitly acknowledged.

Resolve the oracle in this order:

1. **Formal requirements first**
   - Story/epic acceptance criteria
   - PRD / test design / tech spec
   - Inline requirements provided by the user

2. **Contract/spec artifacts second**
   - OpenAPI / Swagger
   - GraphQL schema or SDL
   - Other machine-readable contract definitions

3. **External pointers third**
   - Placeholder files that point to external trackers or docs such as Jira, Linear, Confluence, shared docs, or other systems of record
   - Follow the pointer automatically only when a compatible adapter/plugin/MCP is available in the active runtime
   - Record `externalPointerStatus` as one of: `not_used`, `resolved`, `skipped`, or `unavailable`

4. **Synthetic oracle last**
   - If no formal oracle exists and `allow_synthetic_oracle` is enabled, inspect `{source_dir}` to infer a provisional trace target
   - For UI apps, infer journeys from:
     - routes/pages/screens/layout entry points
     - navigation flows and feature entry links
     - forms, submit actions, create/update/delete paths
     - auth/session/logout/role-gated flows
     - loading, empty, validation, error, and permission-denied states
     - feature flags and major conditional branches
   - Deduplicate the inferred items into a compact, traceable list (prefer 5-12 items)
   - Assign stable IDs such as `J-01`, `J-02`, etc.
   - Assign provisional priorities using `test-priorities-matrix.md`
     - `P0`: auth, checkout/payment, destructive data changes, revenue-critical, hard blockers to core use
     - `P1`: primary user journeys and common CRUD paths
     - `P2`: secondary workflows and edge scenarios
     - `P3`: low-risk polish or optional flows

Record the resolved oracle metadata in step output/frontmatter using consistent keys:

- `coverageBasis` (`acceptance_criteria` | `synthetic_requirements` | `openapi_endpoints` | `user_journeys`) — the type of oracle selected for coverage tracing
- `oracleResolutionMode` (`formal_requirements` | `spec_artifact` | `external_pointer` | `synthetic_source`) — how the oracle was discovered/resolved
- `oracleConfidence` (`high` | `medium` | `low`) — confidence in the resolved oracle as a coverage source
- `oracleSources` — list of artifact paths, URIs, or references used to resolve the oracle
- `externalPointerStatus` (`not_used` | `resolved` | `skipped` | `unavailable`) — status of external pointer resolution when pointer files are present

If none of the four oracle types can be resolved, **HALT** and request the smallest missing clarification needed to continue.

---

## 2. Load Knowledge Base

From `{knowledgeIndex}` load:

### Deterministic Knowledge Selection

The fragment list for this step is a closed set. Start empty and add every fragment in the list below. Do not add fragments from tier labels, index descriptions, nearby mentions elsewhere in this step, general usefulness, or possible future need. Deduplicate while preserving the order below. Identical facts and config must produce an identical list.

- `test-priorities-matrix.md`
- `risk-governance.md`
- `probability-impact.md`
- `test-quality.md`
- `selective-testing.md`

---

## 3. Load Artifacts

If available:

- Story file and acceptance criteria
- Test design doc (priorities) from `{test_artifacts}/test-design/`, chosen by the target this invocation or the loaded artifacts name (the same target section 4 resolves): `test-design-epic-{epic_num}.md` for an epic; for a story, its epic's plan `test-design-epic-{epic_num}.md`, with the epic number taken from the story id (story `1.2` belongs to epic `1`); `test-design-architecture.md` and `test-design-qa.md` at system level. Fall back to the same names at the legacy root `{test_artifacts}/`, where runs before the `test-design/` folder wrote them.
- NFR evidence audit, chosen by the same target. Use the first file that exists: `{test_artifacts}/nfr/nfr-assessment-{run_key}.md` for the target's own scope (`story-{story_key}` or `epic-{epic_num}`, keyed as section 4 describes); for a story, its epic's audit `{test_artifacts}/nfr/nfr-assessment-epic-{epic_num}.md`; `{test_artifacts}/nfr/nfr-assessment-system.md`; then the legacy root `{test_artifacts}/nfr-assessment.md`. Name the file used.
- Tech spec / PRD
- OpenAPI or similar contract/spec files
- Placeholder files that reference external requirements systems
- Route maps, page/screen registries, and other source files used for synthetic journey inference

Summarize what was found and explicitly state the resolved oracle, its confidence, and why that oracle was selected.

---

## 4. Resolve Run Identity

Every run writes its outputs under `{test_artifacts}/trace/` with filenames that carry the run's identity, so a trace for one scope never reads, appends to, or replaces another scope's matrix, summary, or gate decision.
Resolve the gate target, `run_scope`, and `run_key` **now**, before anything is saved.

### A) Gate Type

Resolve the gate type in this order:

1. The gate type the user named in this invocation (for example "trace epic 16" is `epic`, "release gate for 2.4.0" is `release`).
2. The kind of target the loaded artifacts identify: a story file is `story`, an epic document is `epic`.
3. The configured `{gate_type}`.

### B) Target ID and Label

Resolve the target for that gate type in the same order: the target the user named in this invocation first, then the target the loaded artifacts carry.

- **story:** the story id as the story states it (for example `1.2`), and `story_key`, the BMM story file basename without `.md` (for example `1-2-user-authentication`). Without a story file, `story_key` is the story id with `.` replaced by `-` (`1.2` becomes `1-2`).
- **epic:** `epic_num`, read from the epic document metadata, its H1 heading, or its filename. If the epic carries no number, use the slug of its title (slug rule below) in place of the number.
- **release:** the release version, from this invocation or from the release notes or version the loaded artifacts name.
- **hotfix:** the hotfix id, from this invocation or from the loaded artifacts.

The target label is the human-readable name the report heading shows, for example `Story 1.2: User Authentication`, `Epic 6: Scheduled Report Delivery`, or `Release 2.4.0`.

If several candidate targets remain and the user named none of them (for example two story files were loaded), handle it by run type:

- **Interactive run:** list the candidates and ask which one this run covers. **Halt** until the user answers.
- **Headless or autonomous run:** use `system` as below and say so in the output.

If no target can be resolved at all, the run covers the whole project or system: use `system`.

### C) Run Key

Set `run_key` from the gate type and target:

- `story-{story_key}`: one story.
- `epic-{epic_num}`: one epic.
- `release-{slug}`: one release, where `{slug}` is the slug of the release version.
- `hotfix-{slug}`: one hotfix, where `{slug}` is the slug of the hotfix id.
- `system`: the whole project or system, or no narrower scope could be resolved. Target id and label stay empty, the gate type stays the one resolved in A, and the output states "No story, epic, release, or hotfix target could be resolved; this run is scoped to `system`."

Slug rule, used for every `{slug}` and for an epic title with no number: lowercase; replace every run of characters outside `a-z` and `0-9` with a single `-`; trim leading and trailing `-`; truncate to 64 characters.

Set `run_scope` to the kind of key: `story`, `epic`, `release`, `hotfix`, or `system`.

Carry `run_scope`, `run_key`, and the target (`target_type`, `target_id`, `target_label`) forward through every remaining step.
Every output of this workflow substitutes the same `run_key`: `{outputFile}`, `{e2e_trace_summary_output}`, and `{gate_decision_output}`. The matrix, the summary, and the gate decision of one run always name the same scope.

---

## 5. Check for an Existing Output

Check whether `{outputFile}` already exists. A file at this path belongs to a previous run of the **same** scope; outputs for other scopes live under their own filenames and are never read or written here.

A file that carries no `workflowStatus` predates that key: treat it as `'completed'` when its `lastStep` is `'step-05-gate-decision'` or it has no `lastStep`, and as `'in-progress'` otherwise.

- **Does not exist:** this is a fresh run. Proceed to Save Progress.
- **Exists with `workflowStatus: 'in-progress'`:** a previous run for this scope was interrupted. Display its `lastStep` and `lastSaved`, then ask:

  > "An unfinished trace run for `{run_key}` was last saved {lastSaved} at step {lastStep}. Resume it, or start over? Starting over replaces the traceability matrix."

  **Halt** until the user answers. A headless or autonomous run starts over without asking. If they resume, load `{resumeStepFile}`, read it completely, and execute it. If they start over, replace `{outputFile}` entirely in Save Progress.

- **Exists with `workflowStatus: 'completed'`:** a finished run for this scope. Replace `{outputFile}` entirely in Save Progress. Step 5 replaces `{e2e_trace_summary_output}` and `{gate_decision_output}` for this `run_key` the same way.

**Never merge two runs into one file.** A `stepsCompleted` array or a matrix section carried over from a prior run makes the resume dashboard report steps this run never performed and puts another run's evidence into this run's gate.

---

### 6. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

Create the `{test_artifacts}/trace/` folder if it does not exist.
Write the file using the workflow template (if available), replacing any prior content as decided in the previous section, with YAML frontmatter:

```yaml
---
runScope: '{run_scope}'
runKey: '{run_key}'
targetType: '{resolved gate type}'
targetId: '{resolved target id, empty for system}'
targetLabel: '{resolved target label, empty for system}'
workflowStatus: 'in-progress'
stepsCompleted: ['step-01-load-context']
lastStep: 'step-01-load-context'
lastSaved: '{date}'
coverageBasis: '{resolved coverage_basis}'
oracleConfidence: '{resolved oracle_confidence}'
oracleResolutionMode: '{resolved oracle_resolution_mode}'
oracleSources: ['{resolved oracle source 1}', '{resolved oracle source 2}']
externalPointerStatus: '{resolved external_pointer_status}'
---
```

Then write this step's output below the frontmatter.

`runScope`, `runKey`, `targetType`, `targetId`, and `targetLabel` are this run's identity. Later steps carry them forward unchanged and never re-derive them: Step 4 reads the target from this frontmatter, and Resume mode refuses to continue a file whose `runKey` does not match the run being resumed.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs
- Gate target, `run_scope`, and `run_key` resolved before the first save, persisted in the frontmatter, and the output written to the path they name
- Any pre-existing output for this scope was reported to the user and either resumed or replaced

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
- Saving progress before run identity is resolved, or writing to an output path that carries no run identity
- Appending this run's progress to an output left by a previous run, or reading or writing another scope's output
  **Master Rule:** Skipping steps is FORBIDDEN.
