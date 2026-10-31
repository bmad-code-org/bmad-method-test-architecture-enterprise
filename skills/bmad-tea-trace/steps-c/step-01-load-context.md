---
name: 'step-01-load-context'
description: 'Resolve coverage oracle, load knowledge base, gather related artifacts, and resolve run identity'
nextStepFile: '{skill-root}/steps-c/step-02-discover-tests.md'
resumeStepFile: '{skill-root}/steps-c/step-01b-resume.md'
knowledgeIndex: '{tea-knowledge}/tea-index.csv'
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

Persist `oracleLedger` in this step's progress YAML frontmatter as an array of `{id, requirement, priority, source}` records: one row per item with its stable ID, requirement text, priority, and source reference. For a numbered criterion with a bold name, such as `1. **Order number shown** (R1, P0)` followed by its Given, When, and Then lines, the row's `requirement` is the bold name alone, `Order number shown`, without the parenthesised `R` ids or priority after it. For a `verify`-only story's single criterion it is the `verify` text. Every other item keeps its source text, and a criterion whose source states its id before a colon (`AC-1: Admin may export`) keeps the text after the colon. A run with `oracleGranularity: requirements` builds its ledgers by section 1b; every rule in this paragraph and the next still applies to them. An explicit priority in the selected oracle is authoritative for that item's coverage statistics. Infer a priority with `test-priorities-matrix.md` only when the oracle leaves it unspecified, and record that inference. A mapped test's own priority describes the test and never changes the oracle item's priority. Carry this ledger through mapping and gap analysis, including resumed runs.

For local source files, read numbered lines before recording each ledger source reference. When the source declares an item's ID and priority, cite that line. For an inferred item, cite numbered source lines that support its requirement; the generated ID and priority stay in the ledger. Check each source line independently because headings and criteria may span different numbers of lines.

Record the resolved oracle metadata in step output/frontmatter using consistent keys:

- `coverageBasis` (`acceptance_criteria` | `synthetic_requirements` | `openapi_endpoints` | `user_journeys`) — the type of oracle selected for coverage tracing
- `oracleResolutionMode` (`formal_requirements` | `spec_artifact` | `external_pointer` | `synthetic_source`) — how the oracle was discovered/resolved
- `oracleConfidence` (`high` | `medium` | `low`) — confidence in the resolved oracle as a coverage source
- `oracleSources` — list of artifact paths, URIs, or references used to resolve the oracle
- `externalPointerStatus` (`not_used` | `resolved` | `skipped` | `unavailable`) — status of external pointer resolution when pointer files are present

If none of the four oracle types can be resolved, **HALT** and request the smallest missing clarification needed to continue.

---

## 1b. Oracle Granularity and the v7 Requirement Spine

Record `oracleGranularity` beside `coverageBasis` and `oracleResolutionMode`. It is `requirements` or `criteria`.

### A) When the Spine Applies

A fresh run uses the requirement oracle and records `oracleGranularity: requirements` only when both hold:

- Its target is a v7 epic: the user names an epic, or the target reference resolves through `{tea-contracts}/story-identity.md` to a container its section 3 classifies as an epic. A v7 epic is an `epic-*` folder inside an initiative's `tickets/` folder.
- That epic's file has at least one Requirements line of the form `R<n> (<parent or source>): <line>`, for example `R1 (parent R2): Shopper pays with a saved card`.

Such a run also records `coverageBasis: acceptance_criteria` and `oracleResolutionMode: formal_requirements`.
Every other target keeps the criterion oracle and records `oracleGranularity: criteria`: a story, a release, a hotfix, the system, a v6 epic, and a v7 epic whose file has no `R<n>` line. Section 1's ledger rules then apply unchanged, and the rest of this section does not.
Only a fresh run decides granularity. A checkpoint with no `oracleGranularity` is a criterion-oracle run and resumes as one, with its rows and evidence unchanged; `step-01b-resume.md` never re-decides it.
Initiative-wide tracing is out of scope: an initiative target keeps the criterion oracle, and epic rows never roll up to initiative `R` lines.

### B) Duplicate Requirement IDs

Read the epic file's Requirements section with numbered lines before building any ledger.
Two `R` lines with the same local id in one epic **halt** the run before mapping. Name the id and both source `path:line` locations, and ask for the epic file to be corrected.
Never merge, renumber, or skip either line, and save no ledger for the run. A halted run emits no matrix, summary, or gate decision.

### C) `criterionLedger`

For every entry in the epic's `tickets/tickets.toml`, resolve and read its story by `{tea-contracts}/story-identity.md` sections 2 and 4. Record every criterion the contract selects, in the contract's order, as one `criterionLedger` record. The ticket's numbered criteria are a story leaf's under `## Requirements` and a bug or spike leaf's under `## Acceptance Criteria`. A plan's acceptance criteria are the list under its Acceptance Criteria heading, or the list after the bold `**Acceptance Criteria:**` label in its `## Tasks & Acceptance` section. The CLI captures the same criteria from the same files before the run and rejects a ledger that omits, adds, renames, or rewrites any of them:

- `id`: `<story key>--<localId>`, for example `shop--e1-s2--AC-1`.
- `localId`: the id the source states for the criterion (`AC-1`); else `AC-<n>` from its position in the numbered list; `verify` for a `verify`-only story's single criterion.
- `story`: the story key.
- `name`: the criterion's name. For a numbered criterion that is its bold name alone, without the parenthesised `R` ids or priority after it: `Order number shown` for `1. **Order number shown** (R1, P0)`. For a plan criterion it is its bold label, else its first line, again without the parenthesised `R` ids or priority. For a `verify`-only story's single criterion it is the `verify` text.
- `text`: the criterion's frozen full text as the source states it with the list marker removed. For a numbered criterion that is its name line (the bold name and the `R` ids it names) followed by every line beneath it (Given, When, Then, And, a spike's `Verify:` line, and any fenced or indented block such as a Gherkin scenario or an expected body, fences included), joined with single spaces. For a `verify`-only story's single criterion it is the `verify` text: the pulled leaf's `Verify:` line once the story has a leaf, else the entry's `verify`.
- `source`: the `path:line` where the criterion starts: the line holding a numbered criterion's bold name, a plan criterion's first line, or the `verify` text. Never a Given, When, or Then line.
- `priority` and `priorityBasis`: by section E. Every record carries both.
- `declaredLinks`: the `R` ids the criterion names. For a `verify`-only story's single criterion, the story's `covers`: the pulled leaf's frontmatter `covers` once the story has a leaf, else the entry's.
- `validLinks`: the declared ids the epic's Requirements define. `invalidLinks`: the declared ids it does not.
- `exception`: `unlinked` when `declaredLinks` is empty; `invalid-link` when `invalidLinks` is not empty, even when `validLinks` is not; `none` otherwise.

A criterion contributes to every requirement in its `validLinks`. A criterion with any `exception` other than `none` also gets its own gate row in section D, so it never leaves the gate.
Every ledger id uses only letters, digits, `.`, `_`, and `-`. Spell a source id that holds any other character with each run of such characters replaced by `-`. A `localId` never contains `--`, so the part of a criterion id after its last `--` is always its `localId`; spell a source id that holds `--` with a single `-`.

### D) `oracleLedger`

The `oracleLedger` is the gate inventory, and the CLI validates it. Write one row per `R<n>` line, in the epic file's order:

- `id`: `<epic key>--R<n>`, for example `shop--e1--R1`. `<epic key>` is the key section 4 B resolves.
- `kind`: `requirement`.
- `requirement`: the line's frozen text after its `R<n> (...):` prefix.
- `parent`: what the line's parentheses name (`parent R2`, or the source section a split or added line names).
- `source`: the line's `path:line`.
- `priority` and `priorityBasis`: by section E.
- `contributors`: the ids of every `criterionLedger` record whose `validLinks` include `R<n>`, in ledger order. Empty when no story covers the requirement.

Then write one row per `criterionLedger` record whose `exception` is not `none`:

- `id`: the criterion's id. `kind`: `exception`. `exception`: `unlinked` or `invalid-link`.
- `requirement`: the criterion's `name`. A numbered criterion's row reads `Form remembers address`, its bold name alone.
- `source`, `priority`, and `priorityBasis`: the criterion's own.

### E) Priorities

Assign every ledger record its priority and record `priorityBasis` now, before mapping. P0 is the highest priority.

- A `criterionLedger` record takes the explicit priority its criterion states (`explicit`); else one inferred from its behavior and story risk with `test-priorities-matrix.md` (`inferred`). Its `priorityBasis` is `explicit` or `inferred`.
- A requirement row takes the explicit priority its `R` line states (`explicit`); else the highest priority among its contributors (`contributors`); else, with no contributors, one inferred from the requirement text and epic context with `test-priorities-matrix.md` (`inferred`).
- `contributors` means exactly this: the row's priority is the highest `priority` recorded on the `criterionLedger` records its `contributors` list, whatever each record's own `priorityBasis`. A contributor at P0 makes the row P0. A requirement row with at least one contributor and no explicit priority always records `contributors`; `inferred` is recorded only when its `contributors` list is empty.
- An exception row copies its criterion's `priority` and `priorityBasis` unchanged. A story's risk never lowers a priority its criterion states.

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
- Test design doc (priorities) from `{test_artifacts}/test-design/`, chosen by the target this invocation or the loaded artifacts name (the same target section 4 resolves): `test-design-epic-{epic_num}.md` for an epic; for a story in a numbered epic (section 3 of the contract), its epic's plan `test-design-epic-{epic_num}.md`, with the epic number taken from a dotted story id (story `1.2` belongs to epic `1`); a story with no numbered epic skips this, and a bare entry id is never read as an epic number; `test-design-architecture.md` and `test-design-qa.md` at system level. Fall back to the same names at the legacy root `{test_artifacts}/`, where runs before the `test-design/` folder wrote them.
- NFR evidence audit, chosen by the same target. Use the first file that exists: `{test_artifacts}/nfr/nfr-assessment-{run_key}.md` for the target's own scope (`story-{story_key}` or `epic-{epic_num}`, keyed as section 4 describes); for a story in a numbered epic, its epic's audit `{test_artifacts}/nfr/nfr-assessment-epic-{epic_num}.md`; `{test_artifacts}/nfr/nfr-assessment-system.md`; then the legacy root `{test_artifacts}/nfr-assessment.md`. Name the file used.
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
2. The kind of target the loaded artifacts identify: a story (a v7 ticket or a v6 story file) is `story`, an epic document is `epic`.
3. The configured `{gate_type}`.

### B) Target ID and Label

Resolve the target for that gate type in the same order: the target the user named in this invocation first, then the target the loaded artifacts carry.

- **story:** `story_id` and `story_key` by `{tea-contracts}/story-identity.md`, which also resolves and reads the story: `1.2` and `shop--e1-s2` for a v7 epic entry, the story's own id and its file basename (`1-2-user-authentication`) for a v6 story.
- **epic:** for a v7 epic (section 1b A), `epic_key` by `{tea-contracts}/story-identity.md` section 4: `<initiative>--e<epic id>` (`shop--e1`), or `<initiative>--<epic folder>` (`shop--epic-loyalty`) for an epic its initiative does not number. The target id is the epic key, and `epic_num` is the epic id (empty for an unnumbered epic). For a v6 epic, `epic_num`, read from the epic document metadata, its H1 heading, or its filename. If the v6 epic carries no number, use the slug of its title (slug rule below) in place of the number.
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
- `epic-{epic_key}`: one v7 epic, for example `epic-shop--e1`. Two initiatives with the same epic number or epic folder name get separate matrices, summaries, and gate files. The epic key is used as written; never slug it, because slugging collapses its `--`.
- `epic-{epic_num}`: one v6 epic.
- `release-{slug}`: one release, where `{slug}` is the slug of the release version.
- `hotfix-{slug}`: one hotfix, where `{slug}` is the slug of the hotfix id.
- `system`: the whole project or system, or no narrower scope could be resolved. Target id and label stay empty, the gate type stays the one resolved in A, and the output states "No story, epic, release, or hotfix target could be resolved; this run is scoped to `system`."

Slug rule, used for every `{slug}` and for a v6 epic title with no number: lowercase; replace every run of characters outside `a-z` and `0-9` with a single `-`; trim leading and trailing `-`; truncate to 64 characters.

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
oracleGranularity: '{criteria | requirements}'
oracleLedger: [{ id: '{oracle item id}', requirement: '{requirement text}', priority: '{P0-P3}', source: '{source reference}' }]
---
```

Then write this step's output below the frontmatter.

For a run with `oracleGranularity: requirements`, write the ledgers section 1b defines, with every field it names:

```yaml
oracleGranularity: 'requirements'
criterionLedger:
  - {
      id: '{story key}--{localId}',
      localId: '{localId}',
      story: '{story key}',
      name: '{criterion name}',
      text: '{frozen full criterion text}',
      source: '{path:line}',
      priority: '{P0-P3}',
      priorityBasis: '{explicit | inferred}',
      declaredLinks: ['{R id}'],
      validLinks: ['{R id}'],
      invalidLinks: ['{R id}'],
      exception: '{none | unlinked | invalid-link}',
    }
oracleLedger:
  - {
      id: '{epic key}--R{n}',
      kind: 'requirement',
      requirement: '{frozen line text}',
      parent: '{parent R<m> or source section}',
      source: '{path:line}',
      priority: '{P0-P3}',
      priorityBasis: '{explicit | contributors | inferred}',
      contributors: ['{criterion id}'],
    }
  - {
      id: '{criterion id}',
      kind: 'exception',
      exception: '{unlinked | invalid-link}',
      requirement: '{criterion name}',
      source: '{path:line}',
      priority: '{P0-P3}',
      priorityBasis: '{explicit | inferred}',
    }
```

Steps 3, 4, and 5 and Resume read these ledgers from the frontmatter, so a resumed run reproduces the same rows.

For a story run (`run_scope` is `story`), also write `storyId`, `storyKey`, `ticketRef` and `storyFile` into this frontmatter, as `{tea-contracts}/story-identity.md` section 4 defines them. Other scopes leave them out.

`runScope`, `runKey`, `targetType`, `targetId`, and `targetLabel` are this run's identity. Later steps carry them forward unchanged and never re-derive them: Step 4 reads the target from this frontmatter, and Resume mode refuses to continue a file whose `runKey` does not match the run being resumed.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs
- Gate target, `run_scope`, and `run_key` resolved before the first save, persisted in the frontmatter, and the output written to the path they name
- Any pre-existing output for this scope was reported to the user and either resumed or replaced
- `oracleGranularity` recorded; a requirement-granularity run persisted `criterionLedger` and `oracleLedger`, every row with its `priorityBasis`, before mapping

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
- A criterion dropped from the gate because it has no valid link, or a requirement row built from an epic with a duplicate local `R` id
- Saving progress before run identity is resolved, or writing to an output path that carries no run identity
- Appending this run's progress to an output left by a previous run, or reading or writing another scope's output
  **Master Rule:** Skipping steps is FORBIDDEN.
