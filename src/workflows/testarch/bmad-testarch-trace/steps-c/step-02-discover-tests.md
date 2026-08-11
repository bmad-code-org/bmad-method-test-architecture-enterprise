---
name: 'step-02-discover-tests'
description: 'Discover and catalog tests by level'
nextStepFile: '{skill-root}/steps-c/step-03-map-criteria.md'
outputFile: '{test_artifacts}/traceability-matrix.md'
---

# Step 2: Discover & Catalog Tests

## STEP GOAL

Identify tests relevant to the resolved coverage oracle and classify by test level.

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

## 1. Discover Tests

Skip this section when `{collection_mode}` is `runtime_manifest`. That mode declares recorded live verification as the only evidence source for the run, so there is no static suite to search.

Search `{test_dir}` for:

- Test IDs (e.g., `1.3-E2E-001`)
- Feature name matches
- Resolved oracle item IDs/titles
- Spec patterns (`*.spec.*`, `*.test.*`)

When the oracle is synthetic (`synthetic_requirements` or `user_journeys`), also search for:

- route/path matches
- page/screen/component names
- visible UI labels and CTA names
- form action verbs (create, edit, save, delete, submit, search, checkout, etc.)
- auth/session/logout flows

---

## 1b. Load Recorded Live Verification Results

Some requirements are verified by running the system rather than by adding a file to `{test_dir}`. That evidence leaves no spec file, so a file-only search reports those requirements as uncovered and a P0 among them fails the gate. `{live_results_input}` is how such a run gets recorded, and this section is the only place trace reads it.

Trace never produces this file and never runs anything to produce it. Any producer may write it: an agent, a shell script, a CI job, or a person recording an outcome by hand. The contract is published in `docs/reference/live-verification-results.md`.

Apply these rules exactly. Do not improvise a substitute.

```javascript
const collectionMode = String('{collection_mode}').trim().toLowerCase();
// `runtime_manifest` names the live results file as the run's only evidence source, so it implies the
// level regardless of `coverage_levels`. Without this the mode would collect nothing and report why.
const liveLevelEnabled =
  collectionMode === 'runtime_manifest' ||
  String('{coverage_levels}')
    .split(',')
    .map((level) => level.trim().toLowerCase())
    .includes('live');
const isUnresolved = (value) => typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
// An older installed workflow.yaml has no `live_results_input`, leaving the placeholder unsubstituted.
// Treat that as "no live results configured" rather than reading a file literally named "{live_results_input}".
const liveResultsPath = isUnresolved('{live_results_input}') ? '' : '{live_results_input}';

// A live result is an observation of one specific commit, and it has no re-runnable artifact behind it.
// Comparing the recorded sha against the commit under trace is the only thing separating
// "verified by running it" from "verified once, against code that no longer exists".
// Resolve from the working tree first. That tree is the code this run actually reads, whereas
// GITHUB_SHA is the ephemeral merge commit on pull_request events and is also the one input an
// untrusted producer could set to make a stale result look fresh. `getGitHeadSha` must return
// `git rev-parse HEAD` from {project-root}, and it is tried before GITHUB_SHA rather than only when
// the runtime helper is missing entirely.
const currentSourceSha = runtime.getSourceSha?.() || runtime.getGitHeadSha?.() || process.env.GITHUB_SHA || '';

// Only a well-formed object id is comparable. Without this, `<current sha>ZZZZZ` passes the prefix
// test below, and a record carrying a value that is not a git object id at all can reach `counted`.
const SHA_PATTERN = /^[0-9a-f]{7,64}$/;
const normalizeSha = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const normalized = String(value).trim().toLowerCase();
  return SHA_PATTERN.test(normalized) ? normalized : '';
};
const shaMatches = (recorded, current) => {
  const a = normalizeSha(recorded);
  const b = normalizeSha(current);
  if (!a || !b) return false; // unresolvable or malformed on either side is never a match
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return longer.startsWith(shorter); // abbreviated shas compare by prefix, as git does
};

const SUPPORTED_LIVE_SCHEMA_MAJOR = '0';
let liveManifest = null;
let liveReadError = null;
if (liveLevelEnabled && liveResultsPath && fs.existsSync(liveResultsPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(liveResultsPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      liveReadError = 'Live results file must contain a JSON object.';
    } else if (!Array.isArray(parsed.results)) {
      liveReadError = 'Live results file has no `results` array.';
    } else if (String(parsed.schema_version ?? '').split('.')[0] !== SUPPORTED_LIVE_SCHEMA_MAJOR) {
      liveReadError =
        `Live results file declares schema_version "${parsed.schema_version ?? '(missing)'}"; ` +
        `this workflow reads major version ${SUPPORTED_LIVE_SCHEMA_MAJOR}.`;
    } else {
      liveManifest = parsed;
    }
  } catch (error) {
    liveReadError = `Live results file is not valid JSON: ${error.message}`;
  }
}

const VALID_LIVE_STATUSES = new Set(['pass', 'fail', 'blocked', 'skipped']);
// Read producer-supplied values as strings or not at all. Coercing first would let
// `status: ["pass"]` stringify to "pass" and count as coverage.
const asString = (value) => (typeof value === 'string' ? value.trim() : '');
const seenLiveIds = new Set();
const liveRecords = (liveManifest?.results || []).map((entry) => {
  // A producer can put anything in this array, including null. Anything that is not a plain object
  // has no fields to read, so it is classified rather than dereferenced.
  const result = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  const id = asString(result.id);
  const requirementId = asString(result.requirement_id);
  const status = asString(result.status).toLowerCase();
  const recordedSha = normalizeSha(result.source_sha ?? liveManifest.source_sha);
  const duplicateId = Boolean(id) && seenLiveIds.has(id);
  if (id) seenLiveIds.add(id);

  // Only a fresh `pass` is coverage. Every other outcome is recorded and reported, never counted.
  // Status is checked before freshness on purpose: a `fail` cannot count at any commit, so reporting
  // it as `stale` would send someone to re-record a run that already told them the requirement is broken.
  // A record with no sha on either side is `invalid` rather than `stale`: nothing was recorded to be
  // stale against, and the remedy is to fix the producer, not to re-verify.
  let disposition;
  if (!id || !requirementId || !VALID_LIVE_STATUSES.has(status) || !recordedSha || duplicateId) disposition = 'invalid';
  else if (status !== 'pass')
    disposition = status; // fail, blocked, or skipped
  else if (!currentSourceSha) disposition = 'unverifiable';
  else if (!shaMatches(recordedSha, currentSourceSha)) disposition = 'stale';
  else disposition = 'counted';

  return {
    id: id || null,
    requirement_id: requirementId || null,
    title: asString(result.title) || id || 'unnamed live verification',
    level: 'live',
    status: status || 'unknown',
    disposition: disposition,
    invalid_reason:
      disposition !== 'invalid'
        ? ''
        : duplicateId
          ? `duplicate id "${id}"`
          : !recordedSha
            ? 'source_sha is missing or is not a hexadecimal object id of 7-64 characters'
            : 'missing id, requirement_id, or a recognized status, or one of them is not a string',
    evidence: asString(result.evidence),
    observed_at: asString(result.observed_at) || asString(liveManifest.observed_at),
    recorded_source_sha: recordedSha,
  };
});

const NON_COLLECTING_STATUS_BY_MODE = {
  waived: 'WAIVED',
  restricted: 'RESTRICTED',
  inaccessible: 'INACCESSIBLE',
  deferred_shared: 'DEFERRED_SHARED',
};
// `runtime_manifest` declares the live results file as the run's only evidence source, so a missing or
// unreadable file makes the collection inaccessible rather than empty: emitting 0% coverage would read
// as "nothing is verified" when the truth is "the evidence could not be read". Every other mode keeps
// the status its own name declares. Step 5 falls back to this same map when the key is absent, so
// resolving it here MUST reproduce that answer; flattening every mode to COLLECTED would make
// `waived`, `restricted`, `inaccessible`, and `deferred_shared` runs gate-eligible.
const collectionStatus =
  collectionMode === 'runtime_manifest' && !liveManifest ? 'INACCESSIBLE' : NON_COLLECTING_STATUS_BY_MODE[collectionMode] || 'COLLECTED';

const liveManifestHeader = {
  present: Boolean(liveManifest) || Boolean(liveReadError),
  results_file: liveResultsPath,
  source_sha: normalizeSha(liveManifest?.source_sha),
  observed_at: asString(liveManifest?.observed_at),
  producer: asString(liveManifest?.producer),
  read_error: liveReadError || '',
  current_source_sha: currentSourceSha,
};
```

`runtime.getSourceSha()` must resolve `git rev-parse HEAD` in `{project-root}`. Run that command directly when neither helper is available, and reach `GITHUB_SHA` only when the working tree is not a git repository at all. Every live result is `unverifiable` while `currentSourceSha` stays empty, which is deliberate: an unknown current commit cannot establish that a recorded observation is still valid.

**Persist `liveRecords` and `liveManifestHeader` into this step's section of `{outputFile}`** as a fenced ` ```json ` block titled `Live Verification Results`. Steps 3 and 4 read them from there. A run resumed at Step 3 or Step 4 has no in-memory bindings from this step, so a value that lives only in memory is a value the resumed run silently loses.

---

## 2. Categorize by Level

Classify as:

- E2E
- API
- Component
- Unit
- Live (records from section 1b with `disposition: 'counted'`; every other disposition is a blocker, not a test)

Record test IDs, describe blocks, priority markers, and the per-test identity fields needed for machine-readable output:

- Stable identity fields: `id`, `title`, `file`, `line`, `level`
- Execution state flags: `skipped`, `pending`, `fixme`
- Skip or blocker reason when it can be discovered from the test source or runtime metadata

---

## 3. Build Coverage Heuristics Inventory

Capture explicit coverage signals so Phase 1 can detect common blind spots:

- API endpoint coverage
  - Inventory endpoints referenced by requirements/specs and endpoints exercised by API tests
  - Mark endpoints with no direct tests
- Authentication/authorization coverage
  - Detect tests for login/session/token flows and permission-denied paths
  - Mark auth/authz requirements with missing negative-path tests
- Error-path coverage
  - Detect validation, timeout, network-failure, and server-error scenarios
  - Mark criteria with happy-path-only tests

- UI journey coverage (when tracing UI/source-derived oracle items)
  - Inventory routes/screens/journeys referenced by the oracle and journeys exercised by E2E/component tests
  - Mark journeys with no end-to-end coverage
- UI state coverage
  - Detect loading, empty, validation, error, and permission-denied state assertions
  - Mark journeys that only verify happy-path rendering

Record these findings in step output as `coverage_heuristics` for Step 3/4.

---

### 4. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it using the workflow template (if available) with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-02-discover-tests']
  lastStep: 'step-02-discover-tests'
  lastSaved: '{date}'
  collectionStatus: '{resolved collectionStatus}'
  sourceSha: '{resolved currentSourceSha}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-02-discover-tests'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-02-discover-tests'`
  - Set `lastSaved: '{date}'`
  - Set `collectionStatus` to the value resolved in section 1b
  - Set `sourceSha` to the resolved `currentSourceSha` (empty string when unresolvable)
  - Append this step's output to the appropriate section of the document.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
