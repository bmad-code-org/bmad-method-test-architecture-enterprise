---
title: 'Story 1.1: Export eval-quality HTTP target-policy evaluation and pack the engine locally'
type: 'feature'
created: '2026-09-22'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '467e3a3e330a9695438879ec7ebe477c4b1da584'
context: []
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** eval-quality defines the AD-35 allow-or-deny decision for HTTP targets in `src/core/probe/target-policy.ts` and publishes none of it, so an adopter's HTTP `EnvironmentProbePort` has to copy address classification. `qualifyProbe`, `OUTCOME_STATES` and `DISCIPLINE_RULES` are also unpublished, and Stories 1.9 and 1.14 read them. `CHANGELOG.md` has no `[3.4.0]` section although v3.4.0 shipped #142.

**Approach:** Re-export the target-policy functions, vocabularies and types through `src/application/index.ts`, with `qualifyProbe`, `OUTCOME_STATES` and `DISCIPLINE_RULES`; export `ProbeTargetAuthorization` and `ProbeTargetPolicy` type-only from the root barrel. Document them, hold the doc list with a `doc-claims` entry, repair the changelog, validate, and pack a local tarball.

## Boundaries & Constraints

**Always:** the root barrel imports only `application` and `core-schemas`; Zod schemas stay type-only on the barrel; changes staged, uncommitted.

**Never:** copy target-policy logic; change `package.json` version or exports map; touch another eval-quality worktree; commit or push.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| ---------- | -------------- | --------------------------- | ---------------- |
| Allowed | loopback authorization naming `127.0.0.1`, target `127.0.0.1` on the same interface, scheme, host, port, method | `allowed: true`, class `loopback` | N/A |
| Unlisted address | same authorization, target `10.0.0.1` | `allowed: false`, reason `address-not-authorized` | N/A |
| Unmapped interface | target names an interface no authorization names | `allowed: false`, reason `interface-not-authorized` | N/A |

</frozen-after-approval>

## Code Map

- `src/core/probe/target-policy.ts` -- source of `evaluateTarget`, `classifyAddress`, `parseAddress`, `isSafeMethod`, `ADDRESS_CLASSES`, `DENIAL_REASONS`, and types `ResolvedTarget`, `PolicyDecision`, `AddressClass`, `DenialReason`, `ParsedAddress`. Unchanged.
- `src/core/score/qualification.ts:794` -- `qualifyProbe(probe, homeOperation: AnyOperation | null)`; `AnyOperation` is a pure type in `src/core/schemas/interface.ts:324`.
- `src/core/schemas/evidence-artifact.ts:24` -- `OUTCOME_STATES` (12). `src/core/coverage/rules.ts:7` -- `DISCIPLINE_RULES` (7), `DisciplineRule`.
- `src/core/schemas/probe-policy.ts` -- `ProbeTargetAuthorization`, `ProbeTargetPolicy` are Zod schemas plus same-named inferred types.
- `src/application/index.ts`, `src/index.ts` -- the two barrels. Layer rule: root imports `application` and `core-schemas`; application imports `core`, `core-schemas`, `ports`.
- `tests/architecture/package-exports.test.ts` -- published-surface cases; case 152 refuses live Zod schemas on the barrel.
- `docs/reference/cli-commands.md` "The library barrel" -- export list; `eval-quality.config.json` `doc-claims.lists` holds lists against `scripts/doc-count-sources.ts` exports.
- `CHANGELOG.md` -- hand-maintained; `scripts/stamp-changelog.mjs` moves `[Unreleased]` at release. v3.4.0 tag commit `0af182e90b982a2d61bf7aa97f9f0faaa85c544a`, date 2026-09-16; `git log v3.3.0..v3.4.0` is #142 plus the release commit.

## Tasks & Acceptance

**Execution:**

- [x] `src/application/index.ts` -- re-export the target-policy values and types, `qualifyProbe`, `OUTCOME_STATES`, `DISCIPLINE_RULES`, `DisciplineRule`.
- [x] `src/index.ts` -- type-only `ProbeTargetAuthorization`, `ProbeTargetPolicy`, `AnyOperation`.
- [x] `tests/architecture/package-exports.test.ts` -- new cases over the built package root: the I/O matrix, symbol presence, `OUTCOME_STATES` length 12, `DISCIPLINE_RULES` length 7, type names on the barrels.
- [x] `docs/reference/cli-commands.md` -- name the exports; say an HTTP port delegates to `evaluateTarget`.
- [x] `scripts/doc-count-sources.ts`, `eval-quality.config.json` -- a `doc-claims` list entry holding the doc's target-policy list against what the root barrel re-exports from `target-policy.ts`.
- [x] `CHANGELOG.md` -- `## [3.4.0] - 2026-09-16` recording #142; `[Unreleased]` entry for the export.
- [x] Pack -- `npm pack --pack-destination /Users/murat/opensource/_wt/_packs`, rename to `eval-quality-local.tgz`.

**Acceptance Criteria:**

- Given a build, when the AC's `node --input-type=module` probe runs over `./dist/index.js`, then it exits 0.
- Given the branch, when `npm run validate` and `npm run docs:validate-links` run, then both exit 0.
- Given the tarball, when `tar -tzf` lists it, then `package/dist/index.js` is present and the barrel carries `evaluateTarget` and `runScore`'s trial-set support from #143.

## Implementation Notes

Outcome: done, staged in `/Users/murat/opensource/_wt/eq-evaluate-export` on `feat/export-target-policy`, uncommitted.

What changed:

- `src/application/index.ts` re-exports `evaluateTarget`, `classifyAddress`, `parseAddress`, `isSafeMethod`, `ADDRESS_CLASSES`, `DENIAL_REASONS` and their five types, plus `qualifyProbe`, `resolveHomeOperation`, `OUTCOME_STATES`, `DISCIPLINE_RULES`, `DisciplineRule`.
- `src/index.ts` adds type-only `ProbeTargetAuthorization`, `ProbeTargetPolicy`, `AnyOperation`, `DefectSignature`, `PermittedInterface`.
- `tests/architecture/package-exports.test.ts`: the I/O matrix over the built root, full vocabulary lists, exact signatures, and a `resolveHomeOperation` into `qualifyProbe` case asserting `declarationChecksRan`.
- `docs/reference/cli-commands.md` names the exports and says an HTTP port delegates to `evaluateTarget`; a new `doc-claims` list entry holds the Target policy line against `TARGET_POLICY_VALUES` in `scripts/doc-count-sources.ts`.
- `CHANGELOG.md`: `## [3.4.0] - 2026-09-16` records #142 (date from `git log -1 --format=%cs v3.4.0`; the section checked against `git log v3.3.0..v3.4.0`, which holds only #142 and the release commit); two `[Unreleased]` Added entries beside #143's.
- Outside the code map: the three new root-barrel edges into `core/schemas` raise the dependency-direction ordering witness from 80 to 83 (`scripts/check-dependency-direction.ts`, and the sentence in `docs/how-to/run-the-gates-on-your-repository.md` that `doc-counts` holds to it).
- Decision: `resolveHomeOperation` added beyond the story text, because without it `qualifyProbe` can only take `null` and never runs its declaration checks, which Story 1.9 depends on.
- `_bmad/` was copied from the main checkout into this worktree (gitignored) so `bmad-build` could render.

Gate: `npm run validate` exit 0 (135 files, 4529 tests); `npm run docs:validate-links` exit 0; the AC's `node --input-type=module` probe exit 0.

Pack: `/Users/murat/opensource/_wt/_packs/eval-quality-local.tgz` (VERSION 3.4.0), packed after the review fixes. `tar -tzf` lists `package/dist/index.js`. A clean `npm install` of the tarball exports every new function, `OUTCOME_STATES` 12, `DISCIPLINE_RULES` 7, and `EVIDENCE_ARTIFACT_SCHEMA_VERSION` 4 with `reducedProbeOutcomes` in `dist/core/score`, which is #143's trial-set scoring.

Revert checks, each run once and restored:

- Removing the target-policy, qualification and vocabulary re-exports: the AC probe exits 1; both new `package-exports` cases fail; `check:doc-claims` refuses to load `doc-count-sources.ts`.
- Importing `core/probe/target-policy.ts` straight from `src/index.ts`: `check:layers` reports the root-layer violation.
- Deleting `isSafeMethod` from the doc's Target policy line: `check:doc-claims` fails (observed by the implementer).
- CHANGELOG: `stamp-changelog.test.ts` passes; the section was compared by hand against `git show bf09dd3` and corrected after review.

Left undone: nothing.

## Spec Change Log

## Review Triage Log

Layers: blind hunter, edge-case hunter, verification gap (subagents); one adversarial peer session (eval-s11-rev, delivered, closed).

| # | Source | Finding | Verdict | Route |
| --- | -------- | --------- | --------- | ------- |
| 1 | peer | `qualifyProbe` exported without `resolveHomeOperation`, so a caller can only pass `null` and skip the declaration checks | medium: Story 1.9 qualifies probes through it | patch |
| 2 | peer | CHANGELOG [3.4.0] says one `asOf` per subject; the final #142 removed that | medium: `check-doc-claims.ts:364` takes one object | patch |
| 3 | peer | CHANGELOG [3.4.0] says the hash trims each line; it trims trailing space and reads indentation as depth | low | patch |
| 4 | peer, blind | doc omits `canonicalAddress`, `detail`, first-denial rule, and that caps are the port's to enforce | low | patch |
| 5 | edge | doc says `declarationChecksRan` reports a `null` home operation; a signature-less probe returns `true` | low: `qualification.ts:851` | patch |
| 6 | peer, blind | doc-count-sources header over-wide and carries an antithesis | low | patch |
| 7 | peer, blind, edge | `DENIAL_REASONS` held by two `toContain`; `OUTCOME_STATES`, `DISCIPLINE_RULES` by length only | low: a renamed member passes | patch |
| 8 | blind, edge | `TARGET_POLICY_VALUES` mis-reads inline `type` or `as` specifiers; root guard matches a comment | low | patch |
| 9 | blind | `classifyAddress`, `parseAddress`, `isSafeMethod` have no signature or behavior check | low | patch |
| 10 | blind | `Exact<>` helper written four times | low | patch |
| 11 | blind | `[3.4.0]` section rides a feature diff | false: the story's acceptance criteria require it | reject |
| 12 | blind | no `OutcomeState` type exported | low | reject: no consumer needs it; TeA's readers are CommonJS and read the array |
| 13 | blind | Qualification and Enumerations lines not held by doc-claims | low | reject: every new name is held by `package-exports.test.ts` against the built barrel; the Enumerations list predates this story unheld |
| 14 | blind | no CommonJS `require` case for the new names | low | reject: case 157 already proves `require` interop of the same barrel module |
| 15 | blind | new names absent from `EXPORTS_BEFORE_THIS_STORY`; new cases unnumbered | low | reject: the new cases fail on removal; the file already mixes numbered and unnumbered cases |
| 16 | verification gap | no gaps | none | none |

## Verification

**Commands:**

- `npm run validate` -- exit 0
- `npm run docs:validate-links` -- exit 0
- `node --input-type=module -e "const m = await import('./dist/index.js'); for (const k of ['evaluateTarget','classifyAddress','parseAddress','isSafeMethod']) if (typeof m[k] !== 'function') process.exit(1)"` -- exit 0
