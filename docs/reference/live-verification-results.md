---
title: 'Live Verification Results'
description: The JSON contract trace reads for recorded live verification
---

# Live Verification Results

Record the results of live system checks in `live-verification-results.json`.
`trace` reads it at the `live` coverage level and can count a passing record alongside static tests.

Two limits apply, and both are enforced:

- The record's `source_sha` must match the commit under trace.
  A mismatch is `stale` and contributes no coverage.
- A requirement covered only by a live record caps the gate at CONCERNS.

## What this contract is for

Produce the file before running `trace`.

An agent, script, CI job, or person can record the results.
Each uses the same schema.
See [Verification Architecture](/docs/explanation/verification-architecture.md).

## Where trace looks

```yaml
live_results_input: '{test_artifacts}/live-verification-results.json'
```

The file sits at the root of `{test_artifacts}`, outside the `trace/` folder where `trace` writes its own outputs, because other tools and people produce it.
Set a different path in the `trace` workflow's `workflow.yaml` if you produce the file elsewhere.
When the file is absent, `trace` uses static test discovery only.

## File schema

```json
{
  "schema_version": "0.1.0",
  "source_sha": "9f2c41d8b7e35a06c1d4f8e29b7a3c5d6e081f42",
  "observed_at": "2026-08-11T14:32:00Z",
  "producer": "manual verification by release engineer",
  "results": [
    {
      "id": "1.3-LIVE-001",
      "requirement_id": "AC-1",
      "title": "User can sign in with a valid password",
      "status": "pass",
      "evidence": "Signed in as qa@example.com, landed on /dashboard with the account menu populated."
    }
  ]
}
```

A longer example covering a passing record, a blocked one, and one recorded against an older commit ships with the workflow at `skills/bmad-testarch-trace/resources/live-verification-results.example.json`.

**Enforced** fields determine whether a record or the whole file counts.
**Recorded** fields add context to the report.

### Top-level fields

| Field            | Trace does                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `schema_version` | **Enforced.** `"0.1.0"`. A different major version makes the whole file unreadable and raises a blocker. |
| `source_sha`     | **Enforced.** The git commit the observations were made against. Per-result `source_sha` overrides it.   |
| `results`        | **Enforced.** Must be an array. May be empty. Anything else makes the file unreadable.                   |
| `observed_at`    | Recorded. ISO 8601 timestamp. Per-result `observed_at` overrides it.                                     |
| `producer`       | Recorded. Free text naming whatever recorded the run. Reported back in the run's trace summary.          |

### Result records

| Field            | Trace does                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `id`             | **Enforced.** Test-case ID, format below. Must be unique in the file; a repeat is `invalid`.               |
| `requirement_id` | **Enforced.** The oracle item this verifies. Must match an id `trace` resolved, such as `AC-1` or `J-02`.  |
| `status`         | **Enforced.** One of `pass`, `fail`, `blocked`, `skipped`.                                                 |
| `source_sha`     | **Enforced** when the file has no top-level `source_sha`. Overrides the file-level commit for this record. |
| `title`          | Recorded. What was verified, in one line. Falls back to the `id` when absent.                              |
| `evidence`       | Recorded. What was observed, or a URL to a recording, log, or screenshot.                                  |
| `observed_at`    | Recorded. Overrides the file-level timestamp for this record.                                              |

### Test-case ID format

```text
{target}-LIVE-{NNN}
```

`{target}` is the story, epic, or release identifier already used for the run.
`{NNN}` is a zero-padded sequence.
This matches the existing `1.3-E2E-001` convention, with `LIVE` as the level segment, so live results sort and read alongside static test IDs in the matrix.

Examples: `1.3-LIVE-001`, `2.7-LIVE-014`, `v1.4.0-LIVE-003`.

## What counts as coverage

A record counts as coverage only when all four hold:

1. Its `status` is `pass`.
2. Its `source_sha` matches the commit under trace.
3. It carries a unique `id` and a `requirement_id`.
4. That `requirement_id` names an item in the coverage oracle `trace` resolved, and no other record reports a `fail` for the same item.

Everything else is recorded as a blocker in the traceability matrix and contributes no coverage:

| Outcome        | What happened                                                                      | Blocker severity |
| -------------- | ---------------------------------------------------------------------------------- | ---------------- |
| `stale`        | Recorded against a different commit than the one under trace                       | high             |
| `unverifiable` | The current commit sha could not be resolved, so freshness is unknowable           | high             |
| `fail`         | The verification failed                                                            | high             |
| `contradicted` | Passed, but another record reports a `fail` for the same `requirement_id`          | high             |
| `blocked`      | The verification never reached a verdict                                           | medium           |
| `skipped`      | The verification was skipped                                                       | medium           |
| `unmatched`    | `requirement_id` names an item not in the resolved coverage oracle                 | medium           |
| `invalid`      | Missing or duplicate `id`, missing `requirement_id`, no `source_sha`, bad `status` | medium           |

An unreadable file (bad JSON, no `results` array, or an unsupported `schema_version`) produces one file-level blocker with the id `live-results-unreadable` at high severity.

A non-`pass` status is reported as itself regardless of freshness.
A `fail` cannot count at any commit, so calling it stale would send you to re-record a run that already told you the requirement is broken.

When re-verifying a failed requirement, replace its old record.
A file with both `fail` and `pass` for the same `requirement_id` marks the pass `contradicted` and credits no coverage.

If a P0 requirement's only evidence is stale, it is uncovered and the gate fails.
Re-record against the current commit or add a re-runnable test.

Freshness compares SHAs case-insensitively and accepts prefix matches of at least seven characters.

## Why live-only coverage cannot reach PASS

A live record describes one observation at one commit.
It cannot re-execute in CI or on the next commit, so a live-only requirement caps a passing gate at CONCERNS.

The cap lowers PASS to CONCERNS.
A FAIL remains FAIL; requirements with static test coverage avoid the live-only cap.

To reach PASS, add a re-runnable test at any level for the requirements the matrix reports as live-only.
`trace` names them in its recommendations.

## Turning the level off

Remove `live` from `coverage_levels` in the `trace` workflow's `workflow.yaml`:

```yaml
coverage_levels: 'e2e,api,component,unit'
```

`trace` then ignores the results file entirely, including a stale one.

The one exception is `collection_mode: runtime_manifest`.
That mode names the results file as the run's only evidence source, so it implies the `live` level and reads the file whether or not `coverage_levels` lists it.
Removing `live` does not turn live evidence off under that mode.
To turn it off, change the collection mode as well.

## Runs with no static suite

Set `collection_mode: runtime_manifest` when recorded live verification is the run's only evidence source.
`trace` skips static test discovery and reads the results file alone.

A missing or unreadable file sets `collection_status` to `INACCESSIBLE` and suppresses the gate.

With no static discovery, `auth_negative_path_status` and `error_path_status` are `unknown`.

## What you get back

The run's summary, `trace/e2e-trace-summary-{run_key}.json` under `{test_artifacts}` (schema `0.2.0` and later), carries a `live_evidence` block:

```json
{
  "live_evidence": {
    "present": true,
    "results_file": "_bmad-output/test-artifacts/live-verification-results.json",
    "freshness": "fresh",
    "recorded_source_sha": "9f2c41d8b7e35a06c1d4f8e29b7a3c5d6e081f42",
    "current_source_sha": "9f2c41d8b7e35a06c1d4f8e29b7a3c5d6e081f42",
    "producer": "manual verification by release engineer",
    "counted": 3,
    "stale": 0,
    "unverifiable": 0,
    "failed": 0,
    "contradicted": 0,
    "blocked": 0,
    "skipped": 0,
    "unmatched": 0,
    "invalid": 0,
    "requirements_live_only": 2
  }
}
```

`freshness` is one of:

| Value          | Meaning                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| `fresh`        | Every record was checkable and recorded against the commit under trace      |
| `mixed`        | Some records counted, others are stale or unverifiable                      |
| `stale`        | Records exist but none counted, because none matched the commit under trace |
| `unverifiable` | The current commit sha could not be resolved, so nothing could be checked   |
| `unreadable`   | The file exists but could not be parsed or failed its schema check          |
| `not_present`  | No results file                                                             |

`freshness` describes whether records match the commit under trace.
A `fresh` file can contain failed or blocked results.
To require current and successful evidence, check `freshness === 'fresh'` and that every non-counted counter is zero.
`mixed` reports a combination of counted and stale or unverifiable records.

Counted results also appear under `coverage.by_level.live`, so a dashboard can show how much of a release rests on evidence with no re-runnable artifact behind it.

## Related

- [How to Run Trace with TEA](/docs/how-to/workflows/run-trace.md): the workflow that reads this file
- [Verification Architecture](/docs/explanation/verification-architecture.md): why evidence is recorded independently of the tool that produced it
- [TEA Configuration](/docs/reference/configuration.md): where TEA artifacts are written
