---
title: 'Story 1.4: Ship `tea-evaluate` with `check` and `digest`'
type: 'feature'
created: '2026-09-23'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1904693'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md#story-14-ship-tea-evaluate-with-check-and-digest (the Story 1.4 section and Build Rules For Every Story)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.4 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-4, AD-5, AD-6, AD-8, AD-9, AD-10, AD-19, Structural Seed)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** Evaluate has a skill (Story 1.3) and no runtime. An adopter cannot validate an evaluation folder or digest its corpus, so a stale index or a malformed artifact would only surface when a run fails.

**Approach:** Ship the `tea-evaluate` bin over a new CommonJS `cli/lib/evaluate/` with two of AD-5's seven subcommands, `check` and `digest`. The runtime owns the `evaluation.json` schema, reaches eval-quality through one engine module, and ships every module it needs in TeA's published `dependencies`.

## Boundaries & Constraints

**Always:** `cli/lib/evaluate/engine.js` is the only file under `cli/` that names `eval-quality` in an `import(` or `require(`; `check` and `digest` take `--evaluation <path>` and exit 64 when none resolves; `check` exits 10 on every authoring defect the story lists; digests come from the engine (`digestArtifact` for `corpusDigest`, `digestBytes` for referenced evidence, matching how `score` compares reference bytes); the runtime reads no `_bmad/` config.

**Never:** call `runScore`, `preflightFromObservations`, `compile` or `seal` from the library (AD-1, AD-6); build `preflight`, `run`, `score`, `compare` or `ci` (later stories); enforce AD-14 in the runtime (Story 1.15); write outside the evaluation folder; touch sprint-status beyond Story 1.3's and 1.4's rows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Valid folder | `test/fixtures/evaluate/valid/` | `check` exits 0 | N/A |
| No flag, or path without `evaluation.json` | `check` / `digest` | exit 64, message names the flag | usage to stderr |
| Eleven authoring defects | one defect per temp copy | exit 10 naming the file and rule | every finding listed, not only the first |
| Unknown `schemaVersion` | `evaluation.json` version the runtime lacks | exit 10 naming the installed TeA version and the versions it knows | N/A |
| Digest | any folder | writes sorted `corpus-index.json`, prints `corpusDigest` | exit 64 on no folder |

</frozen-after-approval>

## Code Map

- `test/lib/eval-quality-inputs.js:73` -- `loadEvalQuality` (`return import('eval-quality')`): the loader `engine.js` generalizes. The test-side copy stays; Story 1.5 moves records.
- `node_modules/eval-quality` 4.0.0 -- ESM only; root exports `digestArtifact(value, label)`, `digestBytes(bytes)`, `serializeArtifact(value, label)` (canonical JSON plus `\n`); `./package.json` is exported, so the CLI path is `bin['eval-quality']` beside it; schemas under `schemas/*.schema.json` (draft 2020-12); ID patterns `^[BOPD]-[0-9]{3,}$`; `probeClass` in `defect|gameability|zero-action|canary`; routes `historical|controlled-mutation|gameability|canary|clean-control`; signature `observableChannel` includes `artifact` (a written file); contract interface kind at `permittedInterfaces[].kind` in `api|web|cli|mcp`.
- `eval-quality.config.json` `dependency-direction.layers[cli]` -- gains `externals: {policy: allow, modules: [...]}`; the gate matches specifiers exactly (`node_modules/eval-quality/dist/gates/dependency-direction.js:128`).
- `cli/` externals today: `commander`, `js-yaml`, `node:child_process|crypto|dgram|dns|fs|http|net|os|path`. The runtime adds `ajv` and `eval-quality`.
- `tools/guard-publish.js`, `test/test-guard-publish.js`, `test/test-release-metadata.js` -- extended for the bin and the optional peer.
- `package.json` -- bin, `peerDependencies`, `peerDependenciesMeta`, `ajv` to `dependencies`, two new scripts chained into `npm test`; `.github/workflows/quality.yaml` one step each.

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/evaluate/engine.js` -- cached async loader, `engineCliPath()` honouring `TEA_EVALUATE_ENGINE_CLI`, schema path resolver.
- [x] `cli/lib/evaluate/schemas/evaluation.schema.json`, `committed-probe.schema.json`, `mutation.schema.json` -- runtime-owned schemas.
- [x] `cli/lib/evaluate/{folder,corpus-index,check}.js` -- folder resolution, index build and staleness, the check rules.
- [x] `cli/evaluate.js` -- bin with `check` and `digest`, exit 64 wiring.
- [x] `test/fixtures/evaluate/valid/` -- a Structural Seed folder whose contract validates against the engine schema.
- [x] `test/test-evaluate-check.js`, `test/test-evaluate-boundaries.js` -- every case in the Story 1.4 test design, including the packed install.
- [x] Release metadata, guard-publish, direction config, CHANGELOG, sprint-status, docs.

**Acceptance Criteria:** epics.md Story 1.4, verbatim; each revert check in test-design-epic-1.md's Story 1.4 table is exercised once.

## Implementation Notes

- **Ajv specifier.** `cli/lib/evaluate/check.js` loads Ajv as `ajv/dist/2020`, because eval-quality's published schemas are draft 2020-12 and the default `ajv` entry point is draft-07. The `dependency-direction` gate matches specifiers exactly, so the `cli` layer's allow list names `ajv/dist/2020`; epics.md Story 1.4's criterion is amended to say so.
- **Missing engine.** When the optional peer is absent, `tea-evaluate` exits 12 (AD-10 infrastructure) and names the package to install; the AC names no code for this case.
- **Committed probe split.** `runtime-owned-field` refuses the fields the Design Notes list, and the committed-probe schema validates the probe with those fields stripped, so one planted field yields one finding. `defectSignature` and each `manifestationWitness` are validated against the subschemas of eval-quality's own `probe.schema.json`, and ID patterns are read from eval-quality's published schemas (`M-NNN` is TeA's).
- **Non-regular corpus entries.** A symbolic link under `corpus/`, `probes/` or `mutations/` is a `corpus-file` finding from `check` and an exit 10 from `digest`, since the index digests only bytes the folder holds.
- **Schema noise.** Ajv reports every `oneOf` branch; `check` de-duplicates schema error lines and caps them at ten per file and validator, with a count of the rest.
- **Fixture.** `test/fixtures/evaluate/valid/contract.json` is `test/contracts/atdd.contract.json` trimmed to B-001 and B-002; the test compiles it through the engine CLI and validates the qualified baseline probe against the engine's probe schema.
- **Doc claims.** `test/lib/doc-claim-sources.js`'s `EXIT_CODE_STRINGS` now also carries `tea-evaluate`'s exit codes, so the reference page's "exits 12" and "exits 64" are held by `test:doc-claims`.
- **Gaps closed on the way.** `docs/explanation/how-tea-is-tested.md` still called Evaluate proposed future work with an undefined scope; the section now states what exists. `README.md`'s npm test chain count and the roadmap's bin list are updated.

### Revert checks exercised

- Removing the `tea-evaluate` bin, lowering the peer floor to `>=3.4.0`, or setting `optional: false`: `test:release-metadata` and `test:guard-publish` each exit 1.
- Moving `ajv` back to `devDependencies`: the packed-install case fails with `Cannot find module 'ajv/dist/2020'` from the installed `check.js`.
- Removing `eval-quality`, `ajv/dist/2020` or `commander` from the allow list: `test:direction` reports the importing file.
- A second `require('eval-quality')` in `cli/lib/evaluate/folder.js`, an `engineModule.runScore(` there, or a `_bmad` comment there: `test:evaluate-boundaries` fails with `engine-import`, `engine-stage` or `bmad-config` respectively.
- Defaulting `--evaluation` to the working directory: the usage cases fail (`no flag exited 0`).
- Tightening `trials` to `minimum: 5`: the valid-fixture case exits 10 and fails.
- Suppressing each of the eleven rules in turn: `test:evaluate-check` fails every time, naming the missing rule. Where the planted defect also produces a second finding (engine schema errors for the `web` kind and off-pattern contract IDs, a `file-name` or `reference` finding for off-pattern probe and mutation IDs), the case still exits 10, and the test fails on the absent named finding.
- Indexing `probes/` only: the `corpus/` byte change no longer moves `corpusDigest` and the digest cases fail.

## Spec Change Log

## Review Triage Log

## Design Notes

Committed probes are TeA's authored subset of the engine probe (AD-9): `probeId`, `probeClass`, `behaviorId`, `expectedClean`, `rationale`, `defects` (without `oracleEvidence`), `defectSignature` and `qualification` holding only `route` plus the route's authored inputs (`mutation` naming an `M-NNN` file, `degenerateResponse`, `fixCommit`, `indicts`, `noKnownDefectStatement`). Runtime-owned fields are the lineage fields, the three attested digests, `systemId`, every evidence reference, `rollbackVerified`, and the qualification fields the mutation file owns; `check` names the one it found.

`evaluation.json` (draft 2020-12, `additionalProperties: false` at the top so later stories' fields are additive schema changes): `schemaVersion` (1), `evaluationId` (kebab), `targetKind` in `agent|skill|workflow|tool-use|ai-feature|test-review-mechanism` (FR1's six), `interface` in `cli|api|mcp`, `registry` and `launch` (objects Story 1.5 tightens; keep them minimal and permissive now), `workspace` `{kind: git|copy, provision: [relative dirs]}`, `arms`, `trials`, `tiers` (`pr|merge|scheduled|release`), `strengthFloor` (probe class to a 0..1 catch rate). The `schemaVersion` gate runs before schema validation and prints the installed TeA version (from TeA's own `package.json`) and the versions it knows.

Rule 8 reads "a behavior discharged by a defect or gameability probe": the contract behavior named by the probe's `behaviorId` (and each defect's `behaviorId`) must list exactly one oracle. Rule 11 applies to any probe on the `clean-control` route or with `expectedClean: true`. Rule 10 walks every JSON file under `baseline/` for public `ArtifactReference`s whose `path` starts `baseline/qualification/` and compares `digestBytes` of that file. Contract, and evaluation files, also validate against the engine's published `eval-contract.schema.json` and the runtime schemas; a failure is exit 10.

`test:evaluate-boundaries` tracks bindings from `require('./engine')`-style imports and from awaited loader results, and fails on a forbidden member access, destructuring or bracket access; the test proves itself against planted temp files (one per rule) so the scanner cannot pass vacuously. `tools/guard-publish.js` gains a manifest check (bin present and pointing at an existing file, peer range floor at or above 4.0.0 by `semver.minVersion`, `peerDependenciesMeta` optional) that `prepublishOnly` runs; its test covers the matrix and the real manifest. The packed-install case installs with `--omit=dev --prefer-offline --no-audit --no-fund` alongside the repository's own `node_modules/eval-quality` directory. The fixture contract is a two-behavior trim of an existing `test/contracts/*.contract.json` that still validates against the engine schema.

`corpus-index.json` is a JSON array of `{path, sha256}` (repo-relative POSIX path, 64 lowercase hex), sorted by path, written with `serializeArtifact`. Staleness compares `digestArtifact` of the committed and recomputed index, so formatting is irrelevant.

## Verification

**Commands:**

- `npm test` -- exit 0
- `npm run test:release-metadata` -- exit 0
- the Build Rules engine check -- exit 0 before and after
