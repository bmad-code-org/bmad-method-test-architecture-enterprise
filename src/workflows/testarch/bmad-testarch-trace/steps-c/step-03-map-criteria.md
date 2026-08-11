---
name: 'step-03-map-criteria'
description: 'Map coverage oracle items to tests and build traceability matrix'
nextStepFile: '{skill-root}/steps-c/step-04-analyze-gaps.md'
outputFile: '{test_artifacts}/traceability-matrix.md'
---

# Step 3: Map Coverage Oracle to Tests

## STEP GOAL

Create the traceability matrix linking the resolved oracle items to tests.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config, loaded artifacts, and knowledge fragments
- Focus: this step's goal only
- Limits: do not execute future steps
- Dependencies: prior steps' outputs (if any)

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Build Matrix

For each resolved oracle item (formal requirement, endpoint/spec item, or synthetic journey):

- Map to matching tests
- Mark coverage status: FULL / PARTIAL / NONE / UNIT-ONLY / INTEGRATION-ONLY
- Record test level and priority
- Preserve each mapped test's stable identity fields (`id`, `title`, `file`, `line`, `level`, status flags) so Phase 1 can deduplicate unique tests before JSON export
- Record heuristic signals:
  - Endpoint coverage present/missing (for API-impacting items)
  - Auth/authz coverage present/missing (positive and negative paths)
  - Error-path coverage present/missing (validation, timeout, network/server failures)
  - UI journey E2E coverage present/missing (for source-derived journeys)
  - UI state coverage present/missing (loading, empty, validation, error, permission-denied)

---

## 1b. Attach Live Evidence

Attach the live records to the oracle items they name.

```javascript
// Read from this step's inputs when present, else from the `Live Verification Results` JSON block
// Step 2 wrote into the progress document. A run resumed here has no Step 2 bindings in memory.
const liveRecords = runtime.getLiveRecords?.() || progressLiveRecords || [];
const oracleItemIds = new Set(traceabilityMatrix.map((req) => String(req.id).trim()));

// A requirement with a fresh `fail` is a requirement the producer's own file says is broken. Counting
// a `pass` alongside it would let an appended retry overwrite a recorded failure, so the fail wins and
// live evidence for that requirement is set aside entirely. Producers replace records, they do not append.
const requirementsWithLiveFailure = new Set(
  liveRecords.filter((record) => record.disposition === 'fail').map((record) => record.requirement_id),
);

// A `counted` record that names an oracle item nobody recognizes is not coverage of anything.
// Demote rather than drop, so the report can name the id that failed to match.
const resolvedLiveRecords = liveRecords.map((record) => {
  if (record.disposition !== 'counted') return record;
  if (!oracleItemIds.has(record.requirement_id)) return { ...record, disposition: 'unmatched' };
  if (requirementsWithLiveFailure.has(record.requirement_id)) return { ...record, disposition: 'contradicted' };
  return record;
});

const countedLiveByRequirement = new Map();
resolvedLiveRecords
  .filter((record) => record.disposition === 'counted')
  .forEach((record) => {
    const bucket = countedLiveByRequirement.get(record.requirement_id) || [];
    bucket.push(record);
    countedLiveByRequirement.set(record.requirement_id, bucket);
  });
```

For each oracle item with counted live records:

- Append them to the item's `tests` array with `level: 'live'`, `status: 'active'`, `file: ''`, and `line: null`. They carry stable `id` values, so the existing deduplication keys work unchanged.
- Classify coverage on the same evidence rules as any other level. A live record that exercises the item's full behavior yields FULL; one that exercises part of it yields PARTIAL. Live evidence is not weaker per requirement; the gate applies its own cap in Step 5.

Do not set a `live_only` flag by hand. Step 4 derives it from the mapped tests, because a flag an agent has to remember to write is a flag that silently disables the gate cap when it is forgotten.

Records with any other disposition contribute no coverage. Carry `resolvedLiveRecords` forward for Step 4 to raise as blockers, and persist it back into the progress document so a resumed Step 4 can read it.

---

## 2. Validate Coverage Logic

Ensure:

- P0/P1 items have coverage
- No duplicate coverage across levels without justification
- Items are not happy-path-only when the oracle implies error handling or alternate states
- API items are not marked FULL if endpoint-level checks are missing
- Auth/authz items include at least one denied/invalid-path test where applicable
- Synthetic UI journeys are not marked FULL when no E2E or component test asserts the critical path and key failure states
- Items are not marked covered on the strength of a `stale`, `unverifiable`, `fail`, `blocked`, `skipped`, `invalid`, `unmatched`, or `contradicted` live record

---

### 3. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it using the workflow template (if available) with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-03-map-criteria']
  lastStep: 'step-03-map-criteria'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-03-map-criteria'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-03-map-criteria'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
