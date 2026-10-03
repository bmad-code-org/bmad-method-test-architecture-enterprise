---
title: 'Story 1.101: Name a stale stamp on every artifact `score` reads'
type: 'feature'
created: '2026-10-03'
status: 'in-review'
baseline_commit: '247a56bb1b48cfd827e02f7c71e3b9cee0990cea'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.101)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.101)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-5, AD-11)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.46.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and assigned Story 1.101 to lane 3">

## Intent

**Problem:** `eval-quality score` compares the stamp of sealed run records and the eval contract before parsing, and parses the isolation manifest, evaluator configuration, scoring policy, preflight verdict, private manifest and probe without comparing theirs. A stale artifact whose shape fits scores under a shape it no longer has; one whose shape does not fit fails as an anonymous `schema-parse-failure`.

**Approach:** The engine owns the comparison. Add a pre-parse stamp read for each artifact in `score` (plus the scoring policy in `aggregate-strength`, the same reader class), release the engine as a major (a stale artifact that parsed now fails), then move TeA's peer floor, lockfile and AD-5 record to the release in this pull request. TeA's own reads stay unchanged.

## Boundaries & Constraints

**Always:** Reuse `checkSchemaVersion` and the `contract-stamp.ts` pattern (skip a missing or non-number stamp so the parse names the field; skip `null` for the nullable inputs). Artifact paths are `<Artifact>.schemaVersion`. Docs counts, doc-claims and the CHANGELOG move with the readers. TeA's changes are the floor, lockfile, AD-5 record and tests.

**Never:** Compare a stamp in TeA's own code for these artifacts (`records.js` does already). Add a reader for the private manifest to TeA's constants (TeA never passes `--private-manifest`). Run `npm pack`, `npm install` or `npm ci` in a shared `node_modules`. Dispatch TeA's Publish workflow.

## I/O & Edge-Case Matrix

| Scenario                    | Input / State                                      | Expected Output / Behavior                                             | Error Handling   |
| --------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- | ---------------- |
| Current stamps              | All artifacts at the build's versions              | Scores as before                                                       | N/A              |
| Stale artifact, fits shape  | One of the six stamped one below, shape valid      | `schema-version-mismatch` naming path, stamp and build version, exit 5 | Parse never runs |
| Stale artifact, wrong shape | Stamp one below, a required field dropped          | Same `schema-version-mismatch`, not `schema-parse-failure`             | Parse never runs |
| Absent nullable input       | Manifest, configuration or private manifest `null` | Scores as before                                                       | N/A              |
| Missing stamp               | No `schemaVersion` key                             | `schema-parse-failure` names the field                                 | Unchanged        |

</frozen-after-approval>

## Code Map

Engine (`/Users/murat/opensource/bmad-eval-quality`, worktree `/Users/murat/opensource/_wt/evaluate-lane3-eq-1101`):

- `src/application/score.ts` -- `parseManifest`, `parseConfiguration`, `parsePreflightVerdict`, `parsePolicy`, `parsePrivateManifest`, `parseProbe` go straight to `safeParse`; records and contract already compare (`checkRecordVersions`, `checkContractVersion`).
- `src/application/contract-stamp.ts` -- pattern to copy; `src/core/compile/schema-version.ts` -- `checkSchemaVersion`.
- `src/application/aggregate-strength.ts:78-81` -- parses `ScoringPolicy` without a stamp check.
- `scripts/doc-count-sources.ts` (`COMPARED_VERSIONS`), `scripts/doc-claim-sources.ts` (`VERSION_READER_BY_FILE`), `eval-quality.config.json` (`comparedVersions`, `callerAssembledVersions` claims), `docs/reference/cli-commands.md:282`, `CHANGELOG.md` -- counts and the reader paragraph.
- `tests/application/score.test.ts`, `tests/application/fixtures/score-fixtures.ts`, `tests/cli/run.test.ts:1377-1460`, `tests/application/aggregate-strength.test.ts` -- stale-stamp patterns to copy.

TeA:

- `package.json` (peer floor), `package-lock.json`, `ARCHITECTURE-SPINE.md` AD-5 (Packaging bullet, table row) -- move to the release.
- `test/test-evaluate-*.js` replay suites -- run unchanged against the new engine.

## Tasks & Acceptance

**Execution:**

- [ ] Engine `src/application/*` -- pre-parse stamp read for the six artifacts and the policy in `aggregate-strength`
- [ ] Engine tests -- per artifact a fixture with a current-shape body and a stale stamp, a previous-shape fixture, a `null` case, a CLI exit-5 case; revert of one artifact's read makes its fixture score
- [ ] Engine docs, counts, doc-claims, CHANGELOG (BREAKING) -- `npm run validate` green
- [ ] Engine release (major) -- `npm view eval-quality version`
- [ ] TeA floor, lockfile, AD-5 record, CHANGELOG, sprint row, story record -- engine check and replay suites green
- [ ] Flip Story 1.46 row and record to `done`

**Acceptance Criteria:**

- Given an artifact among the isolation manifest, evaluator configuration, scoring policy, preflight verdict, private manifest and probe stamped for another version, when `eval-quality score` reads it, then it exits 5 with `schema-version-mismatch` naming the path, stamp and build version before the shape is read.
- Given each artifact's stale-stamp fixture whose shape parses under the current schema, when one artifact's comparison is reverted, then that fixture scores.
- Given the engine release, when TeA adopts it, then peer floor, lockfile and AD-5 record name it and `npm test` passes.

## Implementation Notes

Decisions (coordinator, no Open Questions: the owner delegated): the probe joins the six because `score` reads it and its stamp is checked only after its parse (same gap, same fix); the scoring policy in `aggregate-strength` joins for the same reason. The release is a major because a stale artifact that parsed now fails. The private manifest stays out of TeA's `SCHEMA_VERSION_CONSTANTS` because TeA never passes it.

## Outcome Record

Engine: eval-quality PR #180 (719f7dc) and release PR #181 (74198f9) published 7.0.0 (major, BREAKING). `score` reads the stamp of the isolation manifest, evaluator configuration, scoring policy, preflight verdict, private artifact manifest and probe before it parses each; `aggregate-strength` does it for the scoring policy; `preflight` does it for each probe (round 1 found its parse ran first). The probe's old post-parse check in the core `score` stage was removed as dead (that stage is not exported). The caller-assembled doc-count group is gone: nine versions have a reader, four are stamped, two are both.
Review: engine round 1 (adversarial and test quality, Opus) found a fits-shape fixture that used stamp 0 for the three version-1 artifacts (the schema rejects 0, so the fixtures never scored), missing parse-path and null pins, an antithesis test name, the `preflight` ordering gap and two stale docs; all fixed. Round 2 (Opus) found three comment and title nits, fixed; no round 3 was run since the last commit changed comments and a test title only.
Release: the one-step `release:major` run failed at the `doc-claims` gate because the tool-use how-to pinned its end-to-end route run to 6.0.0. The route was re-run against the built 7.0.0 CLI (19 commands, expected exits) and the pin moved through the pull-request path (#181).
TeA: floor `>=7.0.0` in `package.json`, the lockfile, `tools/guard-publish.js`, `test/test-guard-publish.js`, `test/test-release-metadata.js`, the engine-missing message, `docs/reference/tea-evaluate-cli.md` and the AD-5 record. The three accepted fixture baselines (`evaluate/mutation` verdict-ci, `evaluate-mcp` grader, `evaluate-api` grader) were stamped 6.0.1 and are re-recorded with `compare --accept`. Story 1.46 row and record flipped to `done`.
Undone: none. TeA's own `SCHEMA_VERSION_CONSTANTS` stays without the private artifact manifest (TeA never passes `--private-manifest`).

## Spec Change Log

## Review Triage Log
