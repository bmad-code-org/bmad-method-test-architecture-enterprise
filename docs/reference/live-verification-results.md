---
title: 'Live Verification Results'
description: The JSON contract trace reads when a requirement was verified by running the system rather than by adding a test file
---

# Live Verification Results

This file records verification performed by running the system rather than by adding a test file. `trace` reads it under the `live` coverage level and counts a record as coverage alongside static tests.

Two limits apply, and both are enforced:

- **A record must be recorded against the commit under trace.** A `source_sha` that does not match makes the record `stale`, and stale contributes no coverage.
- **Live-only evidence can never produce a PASS gate.** A requirement whose only evidence is a live record caps the gate at CONCERNS.

## What this contract is for

`trace` reads this file. It never writes it, and it never runs anything to produce it.

Any producer can emit it. An agent that drove the app, a shell script wrapping a smoke run, a CI job posting results from a device farm, or a person recording an outcome by hand all satisfy the contract equally. `trace` has no dependency on which one you used, matching how TEA records every other kind of evidence independently of the tool that produced it. See [Verification Architecture](/docs/explanation/verification-architecture.md).

## Where trace looks

```yaml
live_results_input: '{test_artifacts}/live-verification-results.json'
```

Set a different path in the `trace` workflow's `workflow.yaml` if you produce the file elsewhere. When the file is absent, `trace` uses static test discovery only.

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

A longer example covering a passing record, a blocked one, and one recorded against an older commit ships with the workflow at `src/workflows/testarch/bmad-testarch-trace/resources/live-verification-results.example.json`.

The tables below distinguish **Enforced** fields, whose absence stops a record or the whole file from counting, from **Recorded** fields, which are carried into the report but never rejected. Getting an enforced field wrong changes your coverage; getting a recorded field wrong only makes the report less useful.

### Top-level fields

| Field            | Trace does                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `schema_version` | **Enforced.** `"0.1.0"`. A different major version makes the whole file unreadable and raises a blocker. |
| `source_sha`     | **Enforced.** The git commit the observations were made against. Per-result `source_sha` overrides it.   |
| `results`        | **Enforced.** Must be an array. May be empty. Anything else makes the file unreadable.                   |
| `observed_at`    | Recorded. ISO 8601 timestamp. Per-result `observed_at` overrides it.                                     |
| `producer`       | Recorded. Free text naming whatever recorded the run. Reported back in `e2e-trace-summary.json`.         |

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

```
{target}-LIVE-{NNN}
```

`{target}` is the story, epic, or release identifier already used for the run. `{NNN}` is a zero-padded sequence. This matches the existing `1.3-E2E-001` convention, with `LIVE` as the level segment, so live results sort and read alongside static test IDs in the matrix.

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

A non-`pass` status is reported as itself regardless of freshness. A `fail` cannot count at any commit, so calling it stale would send you to re-record a run that already told you the requirement is broken.

**Replace records, do not append them.** If you re-verify a requirement that previously failed, overwrite the old record. A file containing both a `fail` and a `pass` for the same `requirement_id` sets the passing record aside as `contradicted` and credits no coverage, because the alternative is letting an appended retry quietly overwrite a recorded failure.

Two consequences worth planning around:

**A stale live result is not a soft warning.** If a P0 requirement's only evidence is a live result recorded against an older commit, that requirement is uncovered, P0 coverage drops below 100%, and the gate fails. This is deliberate. A live pass is an observation of code that existed at one moment; carrying it forward would let a green gate describe software nobody ran. Re-record against the current commit or add a re-runnable test.

**Short shas are fine.** Freshness compares case-insensitively and accepts an abbreviated sha of 7 characters or more as a prefix match, the same way `git` resolves them.

## Why live-only coverage cannot reach PASS

A requirement whose only evidence is a live record caps the gate at CONCERNS, never PASS. Live evidence leaves nothing anyone can re-run: it does not re-execute on the next commit, in CI, or for the next reviewer. That is the same treatment `trace` already gives requirements traced against an inferred oracle, and for the same reason. It is good enough to count, not good enough to sign off unconditionally.

The cap only ever lowers a PASS to CONCERNS. It never lifts a FAIL, and it never fires when every counted requirement also has static test coverage.

To reach PASS, add a re-runnable test at any level for the requirements the matrix reports as live-only. `trace` names them in its recommendations.

## Turning the level off

Remove `live` from `coverage_levels` in the `trace` workflow's `workflow.yaml`:

```yaml
coverage_levels: 'e2e,api,component,unit'
```

`trace` then ignores the results file entirely, including a stale one.

The one exception is `collection_mode: runtime_manifest`. That mode names the results file as the run's only evidence source, so it implies the `live` level and reads the file whether or not `coverage_levels` lists it. Removing `live` does not turn live evidence off under that mode. To turn it off, change the collection mode as well.

## Runs with no static suite

Set `collection_mode: runtime_manifest` when recorded live verification is the run's only evidence source. `trace` skips static test discovery and reads the results file alone.

Under that mode a missing or unreadable results file resolves `collection_status` to `INACCESSIBLE`, and no gate is emitted. The alternative would be reporting 0% coverage, which reads as "nothing is verified" when the truth is "the evidence could not be read".

Because static discovery never runs, the `auth_negative_path_status` and `error_path_status` heuristics report `unknown` rather than `present`. Nothing examined those paths, so nothing can vouch for them.

## What you get back

`e2e-trace-summary.json` (schema `0.2.0` and later) carries a `live_evidence` block:

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

`freshness` reports currency, not success. `fresh` means every record was checkable against the commit under trace; a fresh file can still be full of `fail` and `blocked` records. To gate on "current **and** successful", require `freshness === 'fresh'` and every non-counted counter at zero. `mixed` exists so that one counted record among twenty stale ones cannot report as current.

Counted results also appear under `coverage.by_level.live`, so a dashboard can show how much of a release rests on evidence with no re-runnable artifact behind it.

## Related

- [How to Run Trace with TEA](/docs/how-to/workflows/run-trace.md) - the workflow that reads this file
- [Verification Architecture](/docs/explanation/verification-architecture.md) - why evidence is recorded independently of the tool that produced it
- [TEA Configuration](/docs/reference/configuration.md) - where TEA artifacts are written
