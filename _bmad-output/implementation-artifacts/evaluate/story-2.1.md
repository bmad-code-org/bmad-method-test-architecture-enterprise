---
title: 'Story 2.1: Compare runs and accept a baseline'
type: 'feature'
created: '2026-10-01'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1d3d01dd'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 2.1)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-2.md (the Story 2.1 section, R2-04, R2-09, R2-14)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8, AD-10, AD-12)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.45.md (the score directory this story copies)'
  - '{project-root}/cli/lib/evaluate/score.js (`inputFindings`, `runDirectoryFor`)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A run's evidence is compared with nothing and no baseline exists to compare with. `test/lib/compare-dominance.js` and `test/lib/compare-eval-runs.js` hold the comparison logic as TeA test helpers, `check` already verifies `baseline/qualification/` references, and nothing writes `baseline/`. Story 2.2's `pr` replay needs a baseline that holds every input a replay through `score` reads.

**Approach:** `cli/lib/evaluate/compare.js` generalizes the two test modules into the runtime, and `tea-evaluate compare --evaluation <folder> [--run <id>] [--accept]` ships. Without `--accept` it compares the run's per-probe evidence artifacts with `baseline/` through eval-quality's `compareDominance` and reports `compared`, `first-run` (no baseline) or `refused` (a differing `comparabilityKey`, read from the evidence artifacts, or a differing `evalQualityVersion`, read from `run.json`); every outcome exits 0. With `--accept` it replaces `baseline/` wholesale with a byte-identical snapshot of the run. A baseline changes only through this command in a reviewed pull request.

## Boundaries & Constraints

**Always:** `baseline/` mirrors the run directory's relative paths, byte for byte, so Story 2.2 reads it as a run directory and every digest `run.json` recorded still matches. Members: `run.json`, `trial-sets.json`, `contract.json`, `eval-contract.json`, `sealed-evaluator-brief.json`, `scoring-policy.json`, `evaluator-configuration.json`, `operation-phases.json`, `preflight-verdict.json`, `probes.json`, `probes/`, `observations.json`, `observations/`, `trial-sets/` (records, isolation manifests and actions artifacts), and the run's latest `scores/<scoreInvocationId>/` subtree (the evidence). The files `score` reads come from the score-input enumeration: if Story 1.68 (lane 1, PR #278) has merged to `main` when this branch is rebased, import `scoreInputList` from `cli/lib/evaluate/score-inputs.js`; until then derive the list from `run.json`'s `artifacts` map, which names the same files, and a test asserts the copy is complete (below). Qualification evidence goes to `baseline/qualification/<probeId>/` (the run's `qualification/<probeId>/` files), and `baseline/baseline.json` records the accepted run id, score invocation id, partition, `evalQualityVersion`, `corpusDigest`, `contractDigest`, `policyDigest`, and a `files` map of relative path to `digestBytes`, with each qualification file listed as a public reference (`storage: public`, `path` under `baseline/qualification/`, `digest`) so `check`'s existing `qualification-digest` rule verifies it. Staging happens in a temporary sibling directory inside the evaluation folder; the swap is the last step, so a refused or failed accept leaves the old `baseline/` untouched. Every file is read and written as a regular file (no link followed, none created); a non-regular entry exits 10. The refusal order is: run unresolved or not completed or not scored (64), `dirty: true` (10, nothing written), then copy. A scored run is one whose latest score invocation holds an evidence artifact for each probe in `trial-sets.json`; a probe without one exits 10 naming it. Comparison reads the baseline's evidence artifacts and `baseline/run.json`, validates each artifact against the engine schema through `engine.js`, and compares the artifacts of the same `probeId` on both sides. `compare.js` reaches eval-quality only through `engine.js`.

**Never:** a copy of any file under `engine/`, `trials/`, `faults/`, `refused/`, `evaluator-qualification/`, or the derived views (`gap-view.json`, `interpretation.json`, `partitions.json`); a rewrite of any probe's bytes or evidence paths (the probe digests `run.json` anchors would stop matching); a comparison verdict or ordering computed in TeA (the engine's `compareDominance` decides); a new exit code (13 belongs to Story 2.2); a `compare` verdict other than exit 0 for `compared`, `first-run` and `refused`; accepting a dirty run for any reason, including `--force`; a second CLI flag beyond `--evaluation`, `--run` and `--accept`; skill guide edits (Story 2.4 owns `references/ci.md`).

**Decisions (coordinator, owner-delegated):**

- `comparabilityKey` lives in each score's `evidence-artifact.json`, not in `run.json`; the plan's wording is amended in `epics.md` (AC 1) and AD-12 to say so. The `evalQualityVersion`-only refusal reads `run.json` and is the revert check for TeA's own refusal.
- A held-out or `both` partition run is accepted as the partition it recorded; `baseline.json` stores it and `compare` refuses when the partitions differ (the probe sets differ, so the key differs too; the reason names the partition).
- The refusal on Story 1.16's retained dirty run (`runs/20260928T165418209Z-f89a3a6b` in the main checkout's `test/evaluations/bmad-testarch-evaluate`) runs read-only against that folder with this branch's CLI and is appended to `epic-1-proof.md`.
- The moved modules keep their public names in `test/lib/`; the files keep TeA data only (the scoring-policy read, the suite and `suiteResultRecord` shapes, thresholds, repetitions, skipped suites, measurement changes) and import the runtime for the rest. `test-evaluate-boundaries.js` gains two `MOVES` entries and `compare.js` joins its guarded modules.

## I/O & Edge-Case Matrix

| Scenario                                       | Input / State                                               | Expected Output / Behavior                                                    | Error Handling                     |
| ---------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------- |
| Accept a clean scored run                      | `run.json.dirty: false`, evidence for every probe           | `baseline/` holds every member and a manifest; `check` passes over the folder | exit 0                             |
| Replay the accepted baseline through `score`   | `baseline/` copied into a temp `runs/<id>/`                 | `score` reproduces the accepted evidence bytes                                | exit as the original score         |
| Baseline without its isolation manifests       | the manifests deleted from the copy                         | `score` reports the manifest absent and exits 3                               | exit 3 (the revert check)          |
| Accept a dirty run                             | `run.json.dirty: true`, including Story 1.16's retained run | nothing written under `baseline/`, old baseline untouched                     | exit 10                            |
| Accept an unscored or partly scored run        | no `scores/`, or a probe without evidence                   | refused, nothing written                                                      | exit 64 unscored, 10 partly scored |
| Compare with equal keys                        | two runs over one probe set                                 | per-probe relation from the engine, `compared`                                | exit 0                             |
| Compare with a different `comparabilityKey`    | a changed scoring policy or probe set                       | `refused`, the reason names both keys                                         | exit 0                             |
| Compare differing only in `evalQualityVersion` | `run.json` versions differ, evidence keys equal             | `refused`, the reason names both versions and routes to `compare --accept`    | exit 0                             |
| Compare with no baseline                       | no `baseline/`                                              | `first-run`                                                                   | exit 0                             |
| Baseline holds a link or an unreadable entry   | a symbolic link under `baseline/`                           | refused, names the entry                                                      | exit 10                            |
| Accept interrupted                             | staging fails midway                                        | staging removed, old `baseline/` byte-identical                               | exit 12                            |

</frozen-after-approval>

## Code Map

- `test/lib/compare-dominance.js`, `test/lib/compare-eval-runs.js`, their tests `test/test-compare-dominance.js` and `test/test-compare-eval-runs.js`: the logic to generalize; importers `tools/record-eval-run.js:42`, `test/test-eval-diagnostics.js:22`, `test/test-probe-corpus.js:47`. Their public names and behavior hold.
- `cli/lib/evaluate/compare.js` (new): `compareStoredResults`, `refusalReason`, the run-summary comparison (comparable shape, `evalQualityVersion` refusal, dominance dispatch), the baseline reader, `acceptBaseline`.
- `cli/evaluate.js`: `buildProgram` (add `compare`), `EXIT_CODES` header comment, the usage string; run resolution mirrors `runDirectoryFor` in `cli/lib/evaluate/score.js`; `resolveEvaluationFolder` in `folder.js`.
- `cli/lib/evaluate/engine.js`: `loadEngine().compareDominance`, the evidence-artifact schema validation helper (extend only if absent).
- `cli/lib/evaluate/check.js`: `checkQualificationEvidence` and `jsonFilesUnder` already cover `baseline/`; the manifest's references need no new rule.
- `cli/lib/evaluate/run-directory.js`, `score.js` `inputFindings`: the layout and the file list the baseline mirrors.
- `test/test-evaluate-compare.js` (new, `test:evaluate-compare`): the helpers `test/lib/evaluate-story-121.js` (`suite`, `project`) and `test/fixtures/evaluate/` give a clean copy-workspace run; mutate fixture copies, never the committed fixtures.
- `test/test-evaluate-boundaries.js`: `MOVES` (:1534) and guarded modules.
- `package.json` (script and chain), `tools/test-shard-weights.json` (a measured weight), `docs/reference/tea-evaluate-cli.md` (intro, `## compare` after `## score`, exit table, folder layout), `CHANGELOG.md`, `_bmad-output/implementation-artifacts/evaluate/epic-1-proof.md`, `sprint-status.yaml` (row 2-1), `epics.md`, `test-design-epic-2.md` and `ARCHITECTURE-SPINE.md` (AD-12 amendments).

## Tasks & Acceptance

**Execution:**

- [ ] `cli/lib/evaluate/compare.js` -- generalize the two modules; comparison over per-probe evidence; baseline reader with link refusal -- AC 1, 4
- [ ] `cli/lib/evaluate/compare.js` and `cli/evaluate.js` -- `compare` and `--accept` with the refusal order, staging and swap, manifest -- AC 2, 3
- [ ] `test/lib/compare-*.js`, `test-evaluate-boundaries.js` -- keep only TeA data, import the runtime, `MOVES` entries -- AC 4
- [ ] `test/test-evaluate-compare.js` and chain wiring -- every I/O row over real eval-quality and a real clean run, with the revert observations -- AC 1 to 5
- [ ] Live refusal of Story 1.16's retained run, recorded in `epic-1-proof.md` -- AC 5
- [ ] Reference, CHANGELOG, sprint status, plan amendments -- all

**Acceptance Criteria:**

- Two runs over one probe set compare to the engine's relation, and a changed key or a run differing only in `evalQualityVersion` is `refused` with exit 0 (revert: deleting TeA's version refusal returns a relation for the version-only case).
- `compare --accept` on a clean scored run writes every member with its run digest and a manifest `check` accepts, and a temp run directory built from `baseline/` scores to the accepted evidence bytes (revert: omitting the isolation manifests makes that replay exit 3).
- A dirty run, an unscored run and a partly scored run are refused with nothing written and the old baseline intact (revert: removing the dirty refusal writes `baseline/`).
- `test/lib/compare-dominance.js` and `test/lib/compare-eval-runs.js` import the runtime and hold only TeA data; `test:compare-dominance`, `test:compare-eval-runs` and `test:evaluate-boundaries` pass (revert: moving the logic back fails the marker scan).
- Story 1.16's retained dirty run exits 10 under `compare --accept` and the refusal is in `epic-1-proof.md`.
- `test:evaluate-compare` is chained into `npm test`, and the reference documents `compare`, the baseline layout and the exits.

## Implementation Notes

- **Actions artifacts stay under `trials/`.** The spec lists `trial-sets/` (records, isolation manifests and actions artifacts) as a member and forbids a copy of any file under `trials/`. A record names its actions artifact at `runs/<id>/trials/<arm>/trial-<n>.json`, and `score` exits 10 on a record whose actions artifact is absent (`its actions artifact ... is not there`), so a replay needs exactly those files. `compare --accept` copies the actions artifacts the records reference, at their run-relative paths, and no other file under `trials/`. Rewriting the references into `trial-sets/` would move the record digests `run.json` anchors. Observed: a replay without `trials/` exits 10; with it, the replay reproduces the accepted evidence bytes.
- **`score-inputs.js` is not on `main`** (Story 1.68, lane 1, PR #278), so the member list is the named members plus the files the records reference; `test:evaluate-compare` derives what `score` reads from the run's own index and records and asserts the baseline holds each file. `runDirectoryFor` and `regularFileBytes` are now exported from `score.js` (a one-line export change) so `compare` resolves runs and reads files exactly as `score` does.
- **`baseline.json` has a runtime schema** (`cli/lib/evaluate/schemas/baseline.schema.json`), so its `schemaVersion` is read from the schema as `trial-sets.json`'s is (`test:schema-versions` refuses a literal stamp), and the manifest is validated before staging.
- **A version or partition refusal is decided from the two `run.json` files**, before any baseline artifact is read, so a baseline another engine release scored (whose artifacts may no longer meet this engine's schemas) is refused with the route to `compare --accept` instead of failing on its schema.
- **`test/lib/compare-eval-runs.js` keeps its own `refusalReason`** (the runtime's version refusal plus TeA's repetition and threshold rules), which shares a name with the runtime's comparability-key refusal; `test-evaluate-boundaries.js` exempts that one name as a wrapper. `eval-quality.config.json` and `README.md` write the `npm test` chain length as digits now that it is 100, as the doc-counts check requires.
- **An uncommitted `baseline/` inside the repository makes the next `run` record `dirty: true`**, so the pull request that accepts a baseline commits it; the reference says so, and the test commits it before its second run.
- **`run.json` is copied byte for byte**, so a committed baseline carries the adopter's temp workspace paths and repository path from the accepted run. The spec's byte-identity rule requires it.
- **Revert checks exercised once:** deleting the `evalQualityVersion` refusal fails the version-only case (a relation is returned); omitting the isolation manifests from the copy fails the member-completeness check and, replayed from a copy without them, `score` exits 3; removing the dirty refusal makes the dirty case exit 0 and write `baseline/`; moving `compareStoredResults` or `isComparableShaped` back into the test helpers fails `test:evaluate-boundaries` (two new plants each).
- **Shard weight 39** for `test:evaluate-compare` is scaled from a local run (24 s against `test:evaluate-partitions` at 26 s locally and 42 s measured); re-measure in CI.
- The table in the frozen block was re-aligned by Prettier so `lint:md` passes; its text is unchanged.

## Spec Change Log

- Coordinator, 2026-10-01: the frozen Never list forbids a copy of any file under `trials/`, and the Always list names actions artifacts among the `trial-sets/` members. Records name their actions artifacts at `trials/<arm>/trial-<n>.json` and `score` exits 10 without them, so the copy takes exactly the files the records reference and nothing else under `trials/`. KEEP: the byte-identical mirror, the rest of the Never list.

## Review Triage Log

## Design Notes

Baseline as a run-directory mirror keeps Story 2.2 simple: it copies `baseline/` into `runs/<invocationId>/replay/` inputs and calls `preflight` and `score` with no translation layer, and the digests in `baseline/run.json` hold unchanged. Rewriting the probes' `runs/<id>/qualification/...` paths to `baseline/qualification/...` would move their digests, so the qualification files are copied beside the probes and recorded as public references in `baseline.json`, which `check` already verifies.

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.compareDominance !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:evaluate-compare && npm run test:compare-dominance && npm run test:compare-eval-runs && npm run test:evaluate-boundaries && npm run test:evaluate-check` -- expected: green
- `npm run test:direction && npm run test:shards && npm run test:ci-coverage && npm run test:doc-counts && npm run test:doc-claims && npm run test:changelog` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check && npm run docs:validate-links && npm run docs:build` -- expected: green
- `npm test` -- expected: green in CI shards (not run locally, per the owner's relay instruction)
