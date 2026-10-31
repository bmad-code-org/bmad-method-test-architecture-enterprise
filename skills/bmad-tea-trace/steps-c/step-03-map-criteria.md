---
name: 'step-03-map-criteria'
description: 'Map coverage oracle items to tests and build traceability matrix'
nextStepFile: '{skill-root}/steps-c/step-04-analyze-gaps.md'
outputFile: '{test_artifacts}/trace/traceability-matrix-{run_key}.md'
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

Read `oracleGranularity` from the progress frontmatter. A checkpoint with no `oracleGranularity` is a criterion-oracle run.

- **`criteria`:** the oracle items are the `oracleLedger` rows, and the matrix this section builds is `traceabilityMatrix`, the gate inventory, exactly as before.
- **`requirements`:** the oracle items are the `criterionLedger` records, and the matrix this section builds is `criterionMatrix`: one row per record, keyed by its qualified id (`shop--e1-s2--AC-1`), carrying its `localId`, `story`, and links. Every rule in this section, section 1a, and section 1b applies to these criterion rows unchanged. Section 1c then aggregates them into `traceabilityMatrix`, the gate rows of the `oracleLedger`.

For each resolved oracle item (formal requirement, endpoint/spec item, or synthetic journey):

- Copy its ID, requirement text, and priority from Step 1's persisted oracle ledger. In a requirement-granularity run that ledger is the `criterionLedger`: copy each record's `name` and full `text`, and classify coverage against the full `text`. Preserve explicit source priorities through every matrix heading and statistics bucket. Keep each mapped test's priority in the test record as a separate field.
- Map to matching tests
- Mark coverage status: FULL / PARTIAL / NONE / UNIT-ONLY / INTEGRATION-ONLY. `checklist.md`'s "Coverage Classification" section is the definition; **read it before classifying anything**, and apply the rule it turns on:
  - Classification is decided by what the evidence **establishes** about the criterion. The number of levels the evidence spans does not set the status.
  - **FULL** whenever every scenario the criterion states is established, whether that took one level or several. A criterion that one appropriate level establishes in full is FULL, not UNIT-ONLY and not INTEGRATION-ONLY.
  - **UNIT-ONLY** and **INTEGRATION-ONLY** are for the case where a _missing_ level is what leaves the criterion unestablished: unit tests only, against a criterion stating an HTTP status or a rendered state; or API/component tests only, against a criterion stating branch-level logic that needs unit proof. "The only evidence is API-level" is not by itself INTEGRATION-ONLY.
- Cite every mapped test as a backticked `` `path:line` `` pair, the form `trace-template.md` and `resources/traceability-matrix.example.md` both use. The backticks are the delimiter, so a path holding a space survives whole. An undelimited pair written into prose has no boundary but the file extension, and a path with a space in it is then read only from its last space-free segment onward.
- Record test level and priority
- For every accepted static test, cite its declaration once and each assertion that establishes a fact named by the criterion once within that criterion's evidence block. Cite both an asserted state and an asserted property that ties it to the stated condition, such as `expired` state and the token's expiry timestamp.
- A status assertion on a prerequisite request is setup evidence. A 200 response before revocation does not establish that a later request is rejected. Cite a response status when the criterion requires it or the status itself establishes the outcome, such as 403 for denied access. When a later state or value assertion proves the outcome, omit an earlier 2xx response assertion on the action that produced it.
- For a criterion that asks for a ready job and a signed link, cite the ready-state and signed-link assertions. An earlier 202 response only shows that creation was accepted. Apply the same rule to other intermediate 2xx responses.
- Use the exact assertion line; for a multiline assertion, use its opening line. Use one project-relative path spelling throughout, including rejected evidence. Strip the project root directory from paths inside that project. Do not cite setup or action lines as separate anchors. Explain their role beside the assertion anchors. Before Step 4, remove duplicate `path:line` pairs from each criterion block, including pairs repeated in prose.
- Preserve each mapped test's stable identity fields (`id`, `title`, `file`, `line`, `level`, status flags) so Phase 1 can deduplicate unique tests before JSON export
- Record heuristic signals:
  - Endpoint coverage present/missing (for API-impacting items)
  - Auth/authz coverage present/missing (positive and negative paths)
  - Error-path coverage present/missing (validation, timeout, network/server failures)
  - UI journey E2E coverage present/missing (for source-derived journeys)
  - UI state coverage present/missing (loading, empty, validation, error, permission-denied)

---

## 1a. Tests That Name a Criterion Without Establishing It

A test earns its place in a criterion's `tests` array by establishing part of what the criterion states. A test that claims the criterion in its title, its test ID, or a comment, and whose assertions establish none of it, stays out of that array.

That is the rule for this workflow, and it fixes what every count derived from `tests` means: `tests.cases`, `coverage.by_level.*.tests`, and Step 4's live-only derivation all count test cases this trace accepted as evidence. The other answer, admitting the test and leaving the criterion at NONE, would have made the same numbers mean "test cases considered", so a suite full of mistitled tests would report level counts a reader could not use to judge where coverage actually sits.

Record every such test in `rejectedEvidence` against the criterion it claims, with the reason its assertions fall short. Carry the list forward for Step 4 and persist it into the progress document so a resumed Step 4 can read it. A reader needs to see that the test was read and turned down: a test that claims a criterion and then vanishes from the report is indistinguishable from a test nobody found.

Use the test's explicit ID when its source declares one. Otherwise set `test_id` to its project-relative `file:line` declaration anchor. Do not assign a new sequence number to a rejected test. In a requirement-granularity run, `requirement_id` is the qualified id of the criterion the test claims.

```javascript
// One entry per test whose name claims a criterion its assertions do not establish.
// Shape only; the entries come from reading the tests against the criterion text.
const rejectedEvidence = [
  // {
  //   requirement_id: 'AC-7',
  //   test_id: '9-UNIT-014',
  //   file: 'tests/unit/pricing-rules.spec.ts',
  //   line: 112,
  //   level: 'unit',
  //   title: 'AC-7 applies the loyalty discount before tax',
  //   reason: 'Builds a cart and asserts the subtotal is a number. Never asserts the discount was applied, and never asserts the ordering against tax.',
  // },
];
```

---

## 1b. Attach Live Evidence

Attach the live records to the oracle items they name.

A live record's `requirement_id` resolves to a canonical oracle id through one alias map. The CLI's live validation builds the same map, so the workflow and the CLI give every record the same disposition:

- A qualified id maps to itself: every matrix row id in a criterion-oracle run, and every criterion id (`shop--e1-s2--AC-1`) in a requirement-granularity run.
- A local id (`AC-1`), the part of a criterion id after its last `--`, maps to the one criterion that carries it, in a requirement-granularity run only.
- A local id two or more criteria share maps to nothing, and its record is `unmatched` with a reason naming every criterion that carries it.
- A requirement row id, qualified (`shop--e1--R1`) or local (`R1`), maps to nothing, and its record is `unmatched` with a reason saying live evidence attaches to a criterion. A test or live record is evidence for the criterion it maps to, and a requirement row takes its status from those criteria alone.

Normalize every record to its canonical id **before** failure grouping, contradiction checks, evidence attachment, and disposition counts, so a pass and a fail for one criterion meet whichever spelling each used. Keep the supplied id in `supplied_requirement_id` for diagnostics. Invalid, stale, and failure precedence is unchanged, and a criterion-oracle run's map holds only its row ids, which keeps its dispositions exactly as before.

```javascript
// Read from this step's inputs when present, else from the `Live Verification Results` JSON block
// Step 2 wrote into the progress document. A run resumed here has no Step 2 bindings in memory.
const liveRecords = runtime.getLiveRecords?.() || progressLiveRecords || [];
const progressFrontmatter = yaml.parse(fs.readFileSync('{outputFile}', 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '') || {};
// A checkpoint with no `oracleGranularity` is a criterion-oracle run.
const oracleGranularity = progressFrontmatter.oracleGranularity === 'requirements' ? 'requirements' : 'criteria';
// The rows live evidence can attach to: criterion rows in a requirement-granularity run, the matrix rows otherwise.
const criterionRows = oracleGranularity === 'requirements' ? criterionMatrix : traceabilityMatrix;

// The alias map, built in the CLI's order: qualified criterion ids, qualified requirement row ids, local
// criterion ids, then local requirement ids. An entry already set is never overwritten, so a qualified id
// always maps to itself whatever else shares its spelling.
const liveAliasMap = new Map();
const localPart = (id) => id.slice(id.lastIndexOf('--') + 2);
const requirementRowReason = (id) => ({ id: null, reason: `"${id}" names a requirement row; live evidence attaches to a criterion` });
criterionRows.forEach((row) => {
  const id = String(row.id).trim();
  liveAliasMap.set(id, { id, reason: '' });
});
if (oracleGranularity === 'requirements') {
  const requirementRowIds = (progressFrontmatter.oracleLedger || [])
    .filter((row) => row.kind === 'requirement')
    .map((row) => String(row.id).trim());
  requirementRowIds.forEach((id) => liveAliasMap.set(id, requirementRowReason(id)));
  const localCarriers = new Map();
  criterionRows.forEach((row) => {
    const id = String(row.id).trim();
    localCarriers.set(localPart(id), [...(localCarriers.get(localPart(id)) || []), id]);
  });
  localCarriers.forEach((ids, localId) => {
    if (liveAliasMap.has(localId)) return;
    liveAliasMap.set(
      localId,
      ids.length === 1
        ? { id: ids[0], reason: '' }
        : { id: null, reason: `local id "${localId}" is carried by ${ids.length} criteria (${ids.join(', ')}); name the qualified id` },
    );
  });
  requirementRowIds.forEach((id) => {
    if (!liveAliasMap.has(localPart(id))) liveAliasMap.set(localPart(id), requirementRowReason(localPart(id)));
  });
}
const resolveLiveRequirementId = (supplied) =>
  liveAliasMap.get(supplied) || { id: null, reason: `"${supplied}" is not in the resolved coverage oracle` };

// Canonical ids first. Every grouping and check below reads the canonical id, so `AC-1` and its
// qualified spelling are one criterion. A record with no requirement_id is already `invalid`.
const canonicalLiveRecords = liveRecords.map((record) => {
  if (!record.requirement_id) return record;
  const resolved = resolveLiveRequirementId(record.requirement_id);
  return {
    ...record,
    supplied_requirement_id: record.requirement_id,
    requirement_id: resolved.id || record.requirement_id,
    unmatched_reason: resolved.id ? '' : resolved.reason,
  };
});

// A requirement with a fresh `fail` is a requirement the producer's own file says is broken. Counting
// a `pass` alongside it would let an appended retry overwrite a recorded failure, so the fail wins and
// live evidence for that requirement is set aside entirely. Producers replace records, they do not append.
const requirementsWithLiveFailure = new Set(
  canonicalLiveRecords.filter((record) => record.disposition === 'fail').map((record) => record.requirement_id),
);

// A `counted` record that names an oracle item nobody recognizes is not coverage of anything.
// Demote rather than drop, so the report can name the id that failed to match.
const resolvedLiveRecords = canonicalLiveRecords.map((record) => {
  if (record.disposition !== 'counted') return record;
  if (record.unmatched_reason) return { ...record, disposition: 'unmatched' };
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

For each row of `criterionRows` with counted live records, keyed by canonical id:

- Append them to the item's `tests` array with `level: 'live'`, `status: 'active'`, `file: ''`, and `line: null`. They carry stable `id` values, so the existing deduplication keys work unchanged.
- Classify coverage on the same evidence rules as any other level. A live record that exercises the item's full behavior yields FULL; one that exercises part of it yields PARTIAL. Live evidence is not weaker per requirement; the gate applies its own cap in Step 5.

Do not set a `live_only` flag by hand. Step 4 derives it from the mapped tests, because a flag an agent has to remember to write is a flag that silently disables the gate cap when it is forgotten.

Records with any other disposition contribute no coverage. Carry `resolvedLiveRecords` forward for Step 4 to raise as blockers, and persist it back into the progress document so a resumed Step 4 can read it.

---

## 1c. Aggregate Requirement Rows

Skip this section when `oracleGranularity` is `criteria`; `traceabilityMatrix` is already the gate inventory.

In a requirement-granularity run, build `traceabilityMatrix` from the frontmatter `oracleLedger`, one gate row per ledger row in ledger order. The requirement layer only aggregates: every criterion keeps the status sections 1, 1a, and 1b gave it, and no evidence rule changes.

**Exception rows.** An exception row copies its criterion row from `criterionMatrix`: coverage, tests, evidence, rejected evidence, and gaps. It records `kind: 'exception'` and the ledger's `exception`, `requirement`, `source`, `priority`, and `priorityBasis`.

**Requirement rows.** A requirement row records `kind: 'requirement'` and the ledger's `id`, `requirement`, `parent`, `priority`, `priorityBasis`, and `source`, plus:

- `contributors`: one entry per id in the ledger row's `contributors`, built from its criterion row: `{ id, story, coverage, tests }`. Each contributor test keeps its `id`, `level`, `status`, `file`, `line`, and its `skipped`, `pending`, and `fixme` flags, because Steps 4 and 5 read those flags to decide whether the test is active.
- `missingBehaviors`: split the requirement line into the behaviors it states, each result, condition, scenario, and failure path. That is the "every stated scenario" rule of `checklist.md` "Coverage Classification", applied to the requirement text. For each behavior, name the contributors whose stated criterion text establishes it. A behavior no contributor states goes into `missingBehaviors` in the requirement line's own words. Judge from what the criteria state, since a passing test proves only its own criterion.
- `tests`: an empty array. A test is evidence for the criterion it maps to; it never maps to a requirement row, and it never marks a requirement FULL on its own.
- `coverage`: from `requirementCoverage` below.

Build the rows with this code, so every row carries its `kind` and every contributor test its execution flags. A ledger row whose id is a `criterionLedger` id is an exception row; every other ledger row is a requirement row. Criterion ids and requirement row ids never share a spelling, because a story key extends its epic key.

```javascript
// `linked` holds the contributor entries of one requirement row; `missingBehaviors` comes from the
// judgment above. FULL needs a contributor, every contributor FULL, and no missing behavior.
const requirementCoverage = (linked, missingBehaviors) => {
  if (linked.length === 0) return 'NONE'; // no story covers it
  if (linked.every((criterion) => criterion.coverage === 'NONE')) return 'NONE';
  if (linked.every((criterion) => criterion.coverage === 'FULL') && missingBehaviors.length === 0) return 'FULL';
  return 'PARTIAL';
};

// A contributor test keeps every field Steps 4 and 5 read. Dropping `skipped`, `pending`, or `fixme`
// would turn a skipped static test into active static evidence and switch the live-only cap off.
const contributorTest = (test) => ({
  id: test.id,
  level: test.level,
  status: test.status,
  file: test.file || '',
  line: test.line ?? null,
  skipped: test.skipped === true,
  pending: test.pending === true,
  fixme: test.fixme === true,
});

// One gate row per `oracleLedger` row, in ledger order. `missingBehaviorsById` maps each requirement
// row id to the behaviors the judgment above found missing.
const buildGateRows = (oracleLedger, criterionMatrix, missingBehaviorsById = {}) => {
  const criterionById = new Map(criterionMatrix.map((row) => [String(row.id).trim(), row]));
  return oracleLedger.map((ledgerRow) => {
    const id = String(ledgerRow.id).trim();
    if (criterionById.has(id)) {
      return {
        ...criterionById.get(id),
        id,
        kind: 'exception',
        exception: ledgerRow.exception,
        requirement: ledgerRow.requirement,
        source: ledgerRow.source,
        priority: ledgerRow.priority,
        priorityBasis: ledgerRow.priorityBasis,
      };
    }
    const contributors = (ledgerRow.contributors || []).map((contributorId) => {
      const criterion = criterionById.get(String(contributorId).trim());
      return {
        id: contributorId,
        story: criterion?.story ?? null,
        coverage: criterion?.coverage || 'NONE',
        tests: (criterion?.tests || []).map(contributorTest),
      };
    });
    const missingBehaviors = [...(missingBehaviorsById[id] || [])];
    return {
      id,
      kind: 'requirement',
      requirement: ledgerRow.requirement,
      parent: ledgerRow.parent ?? null,
      source: ledgerRow.source,
      priority: ledgerRow.priority,
      priorityBasis: ledgerRow.priorityBasis,
      contributors,
      missingBehaviors,
      tests: [],
      coverage: requirementCoverage(contributors, missingBehaviors),
    };
  });
};

const traceabilityMatrix = buildGateRows(progressFrontmatter.oracleLedger || [], criterionMatrix, missingBehaviorsById);
```

- A requirement row with no contributors is NONE, and its gaps read "no story covers it".
- A UNIT-ONLY or INTEGRATION-ONLY contributor counts as not FULL. List each one in the row's gaps with its status.
- List every behavior in `missingBehaviors` in the row's gaps too. A requirement whose contributors are all FULL stays PARTIAL while any behavior is missing.
- Never mark a requirement FULL from a partial set of its criteria.

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
- In a requirement-granularity run, `traceabilityMatrix` holds exactly one gate row per `oracleLedger` row, invalid-link and unlinked criteria included, each with its `kind`; every contributor test keeps its `skipped`, `pending`, and `fixme` flags; and no requirement row is FULL with no contributor, a contributor below FULL, or a non-empty `missingBehaviors`

---

### 3. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

`{outputFile}` is this run's file: Step 1 created it for this `run_key`, or Resume selected it after checking its `runKey`. If it is missing, this run has lost its output: **halt** and ask the user to start a fresh run with **[C] Create**.

Update it in place:

- Add `'step-03-map-criteria'` to `stepsCompleted` array (only if not already present)
- Set `lastStep: 'step-03-map-criteria'`
- Set `lastSaved: '{date}'`
- Keep `runScope`, `runKey`, `targetType`, `targetId`, `targetLabel`, `oracleGranularity`, `oracleLedger`, and `criterionLedger` unchanged
- In a requirement-granularity run, persist `criterionMatrix` and the aggregated `traceabilityMatrix` (with `contributors`, `missingBehaviors`, and statuses) into this step's section as a fenced ` ```json ` block titled `Requirement Aggregation`: a `### Requirement Aggregation` heading followed by exactly one ` ```json ` block holding `{ "criterionMatrix": [...], "traceabilityMatrix": [...] }`. `criterionMatrix` has one row per `criterionLedger` record with its `id` and `coverage`; `traceabilityMatrix` has one row per `oracleLedger` row, in ledger order, with its `id`, `kind`, and `coverage`, and each requirement row its `contributors` (`id` and `coverage`) and `missingBehaviors`. A resumed Step 4 reads both from there.
- The block is required, and it stays in the final document: Step 5 carries it into the report unchanged. The CLI rejects a requirement run whose matrix lacks it, and a run whose final criterion statuses, requirement statuses, or missing behaviors differ from what this block records.
- Append this step's output to the appropriate section of the document. Appending is safe because the file holds only this run's work.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
