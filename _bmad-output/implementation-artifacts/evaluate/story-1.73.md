---
title: 'Bind declared framework install state to evaluator scoring'
type: 'bugfix'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c17cfafa87a0a02b77379eb5fac04f3a0fc463e5'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.44.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.71.md'
---

<frozen-after-approval reason="owner delegated Story 1.73 build and merge through the Evaluate relay">

## Intent

**Problem:** A command evaluator can judge differently after a plugin, transitive dependency or local patch changes while its declared framework version stays fixed.
The current scoring configuration and mid-run checks see the version only.

**Approach:** Let each framework optionally declare an install-state source.
Observe a digest for that source, bind it to scoring and run evidence, and hold it across every evaluator launch and trial.

## Boundaries & Constraints

**Always:** Preserve the exact configuration digest for declarations without `installState`.
Keep the source optional and restricted to `lockfile` or `tree`.
Require an observed digest for declared install state and fail with exit 12 before an affected trial seals.
Keep framework-specific probing in adopter code under `evaluator/`.

**Never:** Pin an observed digest in `frameworks.json`, import a framework into `cli/`, change the meaning of an undeclared framework, or invoke a live Claude session.

## I/O & Edge-Case Matrix

| Scenario           | Input / State                                         | Expected Output / Behavior                            | Error Handling |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------- | -------------- |
| Legacy declaration | Framework has package, version and probe only         | Existing configuration digest stays byte-identical    | None           |
| Valid sources      | `installState.source` is `tree` or `lockfile`         | Probe returns a digest; artifacts and scoring bind it | None           |
| Bad declaration    | Source unknown or object malformed                    | `check` reports `evaluator` rule                      | Exit 10        |
| Bad observation    | Probe omits or malforms required digest               | No qualification or sealed trial                      | Exit 12        |
| Install changes    | Package tree or lockfile entry changes, version fixed | Next run gets new configuration and scoring version   | None           |
| Mid-run change     | Digest changes before launch or after trial           | Affected vote or trial is not sealed                  | Exit 12        |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/frameworks.js`: declaration, probe shape, observed list, artifact and comparison rules; preserve optional fields only when declared.
- `cli/lib/evaluate/schemas/evaluator-frameworks.schema.json` and `framework-versions.schema.json`: mirror declaration and observation shape.
- `cli/lib/evaluate/check.js::checkFrameworks`: classify malformed `installState` under `evaluator` while retaining existing shape classifications.
- `cli/lib/evaluate/command-evaluator.js::observeFrameworks`: pass a framework's declaration into probe answer validation.
- `cli/lib/evaluate/evaluators.js::configurationFields`: include the observed digest conditionally in `tea.evaluatorFrameworks`.
- `cli/lib/evaluate/run.js::observeInstalledFrameworks`, `frameworkChange`: keep the initial digest and compare rechecks to it; existing hold positions cover launches and trials.
- `eval-quality.config.json`: permit the shipped probe's Node crypto import in its evaluator-template layer and register the new schema-declared artifact fields with the doc-claims gate.
- `src/workflows/testarch/bmad-testarch-evaluate/assets/evaluators/installed-version.mjs`: compute Node package lockfile-entry and sorted installed-tree digests.
- `test/test-evaluate-evaluators.js` and `test/test-evaluate-check.js`: isolated package E2E, schema, replay and check cases; `frameworkProject` supplies the package fixture.
- `src/workflows/testarch/bmad-testarch-evaluate/references/evaluator.md` and `test/test-evaluate-guidance.js`: teach sources and selection; keep three committed probe fixture copies byte-identical to the shipped asset.

## Tasks & Acceptance

**Execution:**

- [x] `test/test-evaluate-evaluators.js`: reproduce the unchanged-version collision with a patched installed package file before changing runtime code.
- [x] `cli/lib/evaluate/frameworks.js`, schemas, `check.js`, `command-evaluator.js`: validate optional declaration and required observed digest.
- [x] `cli/lib/evaluate/evaluators.js`, `run.js`: bind and hold the observed digest through scoring and trial sealing.
- [x] `installed-version.mjs` and fixture copies: produce deterministic digests for both sources.
- [x] Evaluator guide, guidance checks, changelog, sprint row and story record: document and verify adopter behavior.

**Acceptance Criteria:**

- Given a declaration without `installState`, when the same version is observed, then its configuration digest equals the pre-story baseline.
- Given malformed `installState` or a missing observed digest, when `check` or `run` executes, then it fails under the specified rule and exit code before any affected trial seals.
- Given fixed evaluator bytes and version, when only the observed install digest changes, then configuration digest and scoring version change.
- Given a package file or lockfile-entry change under one version, when the shipped probe runs, then its digest changes; an in-flight change exits 12 at prelaunch or post-trial recheck.
- Given the evaluator guide, when guidance tests run, then both sources and the choice between install state and version alone are required.

## Implementation Notes

- The owner sequenced full local gates through lane 2, lane 3 Story 1.55, then lane 1. Lane 1's final full run used its assigned slot, exited 0, and released the next slot to lane 2 Story 1.54. Other lane processes were left alone.
- The first end-to-end regression declared a `tree` source and patched one installed package file while keeping `version` at `1.0.0`. Before the runtime change, `run` exited 10 because `installState` was unknown. A separate legacy control runs twice around a package file patch and observes the same configuration digest under an undeclared source. With `tree` declared, the two runs produce different install digests, configuration digests and scoring versions. A fixed-input unit pins the pre-story legacy configuration digest.
- The optional declaration source is retained only when written. A declared source requires a `sha256:` digest from the probe; malformed output stops with exit 12 and leaves a valid artifact with a null observation. Initial observation is held against the prelaunch and post-trial rechecks. The shipped Node probe hashes sorted installed file paths and bytes or the package's entry in the nearest npm lockfile. The three fixture copies match the shipped probe byte for byte.
- End-to-end cases patch a package file during the evaluator and before a later launch, and check exit 12 with no affected sealed record. A separate case changes a lockfile entry under the same version and checks the changed configuration digest. The evaluator guide and public CLI reference describe source selection and the observed digest.
- Codex-equivalent workflow-builder Edit and Analyze: the installed builder process and scanner specifications were read; quick validation, prompt metrics, workflow integrity, path standards and script scans ran after the final guide edit. The fresh five-lens Analyze found an instruction that could read the wrong root copy of a nested package; the guide now says to run the exact tracked `probe.args`, including its importer chain, and guidance tests hold that wording. The remaining medium leanness suggestion is to shorten the validated two-package example. The example stays because it demonstrates source and probe-argument pairing and a separately declared plugin, which the review found missing. No critical or high finding remains. The path scanner has no finding in the changed evaluator reference; its other findings are inherited or generated-analysis noise. Report: `src/workflows/testarch/bmad-testarch-evaluate/.analysis/2026-10-02-story-1-73/skill-analysis-report.html`. No official builder invocation was available in this Codex runtime.
- Review repair: tree hashing includes symlink text, file execute status and empty directories while retaining cycle detection. Lockfile hashing reads v1 dependency entries and v2/v3 package entries, refuses stale versions and links, and treats equivalent JSON key order identically. The guide and CLI reference require separate declarations for judgment-contributing plugins and transitive packages and tree mode for linked or locally patched packages. The artifact schema rejects an undeclared `installDigest` while accepting historical version-only rows.
- The second review required source attestation in probe output. A declared source now requires matching `installSource` and a valid `installDigest`; the legacy two-field response remains unchanged. Tree hashing records dangling links and reads file contents in bounded chunks. Mid-run failure text includes both digests. The guide gives a valid two-package declaration and names the probe's module-resolution location.
- The third review found that a nested package can share its name and version with a root copy while supplying different judgment code. The shipped probe now accepts a repeatable `--importer <package>` chain and resolves each hop from the prior package. The guide pairs the importer chain with the separately declared nested dependency. Focused end-to-end cases change the nested tree and lockfile entry while the root copy stays fixed, then refuse an invalid importer chain before sealing.
- The first remote CI run failed the dependency-direction gate because the evaluator-template allow list omitted the probe's new `node:crypto` builtin. The allow list now names that builtin and its reason; local `npm run test:direction` passed with zero violations and `npm run test:layering-boundary-lineage` passed all 796 checks. A new CI run started after the fix.
- A later CI shard found that doc-claims did not scan JSON schema fields and therefore could not trace the public reference's `installDigest` and `installSource` names. The gate's existing `symbols.foreign` mechanism now registers both with the runtime schema path as their reason. Local `test:doc-claims` passed with zero disagreements and `test:doc-claim-sources` passed.
- Another CI shard found that the version-only probe fault lost its existing "package and version" wording. The fault now keeps that exact legacy diagnostic while a declared install source names all four expected fields. A focused direct probe-answer check passed for both shapes.
- CodeRabbit found that hashing every file, directory and link permission bit can move scoring across byte-identical installs made under different umasks. Tree hashing now keeps only whether a regular file is executable and records a constant mode for directories and links. The focused metadata case failed two assertions before the patch and passed all 19 afterward; the three shipped fixture copies remain byte-identical.
- The final review found that a linked importer's symlink path can lead to a different same-name package than Node's real-path module resolution. Each importer hop now follows its real package directory. A focused end-to-end case confirms Node resolves from the linked entry to the real tree, then checks that changing only that tree moves the digest and scoring version.
- Two same-name nested copies under different importers are covered by declaring each distinct importer package with `tree` state. The declaration remains keyed by unique package name. A focused end-to-end case changes one nested copy and confirms only its importer tree digest and the scoring version move. The guide names this coverage route.

## Spec Change Log

## Review Triage Log

| Layer / finding                            | Verdict | Evidence and route                                                                                                                                                                                                                       |
| ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blind 1, transitive tree coverage          | medium  | The tree probe walks only the declared package root. A hoisted dependency can change alone. Teach separate declarations for every judgment dependency and prove a second package patch. Patch.                                           |
| Blind 2, transitive lockfile coverage      | medium  | The lockfile probe hashes one entry by design. Another dependency's entry can change alone. The guide must require that dependency's own declaration. Patch with Blind 1.                                                                |
| Blind 3, linked workspace lock entry       | medium  | A link entry does not bind the target files. Refuse link entries for the lockfile source and direct linked packages to tree. Patch.                                                                                                      |
| Blind 4, symlink retarget                  | medium  | `statSync` follows a link and hashes target file bytes but omits the link text. Retargeting can change module resolution with equal bytes. Hash link text and test it. Patch.                                                            |
| Blind 5, permission bits                   | medium  | The tree hash uses path and bytes only. Executable mode changes can alter helper behavior. Include mode and test it. Patch.                                                                                                              |
| Blind 6, empty directory                   | medium  | `walk` writes nothing for an empty directory. A presence check can change behavior. Hash directory entries and test them. Patch.                                                                                                         |
| Blind 7, stale lock entry                  | medium  | The lockfile entry is hashed without matching its version to the installed manifest. Refuse stale or unrelated entries. Patch.                                                                                                           |
| Blind 8, artifact converse                 | low     | The schema accepts `installDigest` without an `installState`, although the runtime refuses that probe shape. Add the converse schema constraint and a case. Patch.                                                                       |
| Blind 9, in-flight lockfile edit           | medium  | The recheck uses one shared comparison, but current changed-digest cases mutate only a tree. Add the lockfile path. Patch.                                                                                                               |
| Blind 10, calibration digest change        | medium  | Existing calibration cases flip versions. They do not prove the new digest comparison runs before and after calibration. Add both digest cases. Patch.                                                                                   |
| Verification 1, canonical key order        | medium  | A JSON key reorder would change scoring if canonical hashing regressed, while current tests would still pass. Add an equal-digest control. Patch.                                                                                        |
| Edge 1, empty directory                    | medium  | Same reachable tree-hash omission as Blind 6. Patch together.                                                                                                                                                                            |
| Edge 2, mode bits                          | medium  | Same reachable tree-hash omission as Blind 5. Patch together.                                                                                                                                                                            |
| Edge 3, npm lockfile v1                    | medium  | `lock.packages` is absent in npm v1, so a valid entry exits 12. Resolve v1 dependency entries and test them. Patch.                                                                                                                      |
| Edge 4, transitive lock entry              | medium  | Same one-entry scope as Blind 2. Require each judgment dependency to be declared. Patch together.                                                                                                                                        |
| Round 2 blind 1, source pairing            | medium  | The declaration names a source but a valid digest carries no source identity. A shipped probe called with the wrong second argument can silently bind the wrong source. Require the observed source to match. Patch.                     |
| Round 2 blind 2, resolver location         | low     | The shipped probe resolves beside its own file, which is correct for the documented copy under `evaluator/`. A wrapper elsewhere can resolve a different package. Name that requirement in the guide. Patch.                             |
| Round 2 blind 3, linked traversal          | false   | Tree mode intentionally follows linked target bytes and the probe timeout bounds traversal. A cycle fails closed. The claimed unbounded successful run does not occur.                                                                   |
| Round 2 blind 4, dangling link             | medium  | `statSync` throws for a dangling link after its link text has been hashed. A package can contain an unused dangling link. Record its missing-target state without refusing the tree. Patch.                                              |
| Round 2 blind 5, whole-file memory         | medium  | `readFileSync` loads each asset into the probe process. Stream large files in bounded chunks while keeping the same digest framing. Patch.                                                                                               |
| Round 2 blind 6, timestamps                | low     | File timestamps can change without judgment-relevant installation content, and including them would move scoring after a byte-identical install. The tree contract covers paths, modes, links and bytes. Reject the timestamp expansion. |
| Round 2 blind 7, lockfile patch            | false   | The guide and public reference already direct locally patched packages to `tree`; `lockfile` explicitly hashes one entry. The claimed promise that lockfile covers patches is absent.                                                    |
| Round 2 blind 8, changed digest diagnostic | low     | A mid-run failure reports only the initial digest, so the differing observed value is unavailable for audit. Add the current digest to the fault. Patch.                                                                                 |
| Round 2 blind 9, worked declaration        | medium  | The single tagged JSON example remains version-only and shows neither optional source nor a second dependency. Add a valid worked example and guidance assertion. Patch.                                                                 |
| Round 2 blind 10, planned commands         | low     | The bottom command list uses expected-success wording while the actual-results paragraph states broad gates are pending. Label the list as pending gates until they run. Patch.                                                          |
| Round 2 edge 1, dangling link              | medium  | Same reachable `statSync` failure as Round 2 blind 4. Patch together.                                                                                                                                                                    |

| Round 3 adversarial, nested resolution | high | The shipped probe resolves every package from `evaluator/`. A framework can load a nested same-name dependency while the probe hashes an unrelated hoisted copy. The digest and scoring version then stay fixed through a real judgment change. Resolve from the importing package and test a nested plus hoisted pair. Patch. |
| Round 3 architecture, nested resolution | high | The guide requires declaring judgment-contributing transitive packages, yet the shipped probe cannot locate a nested copy from its importer. Same root cause as the adversarial finding. Patch together. |
| Final review, linked importer real path | medium | A linked importer is loaded by Node from its real directory, while the probe used its symlink directory for the next package search. Follow the importer real path and compare the probe with Node's resolution from a linked JS entry. Patch. |
| Final review, same-name nested copies | medium | A package-name declaration cannot distinguish two copies with the same name. Declare each distinct importer package with `tree` state so its nested copy is covered, and test that a one-copy edit moves only that importer's digest. Document the route without changing legacy declaration identity. Patch. |
| Skill Analyze, nested version command | medium | The guide's bare package probe command can read a different root copy after it teaches an importer chain. Require the exact tracked probe arguments in the instruction and guidance assertion. Patch. |
| Remote CI, template crypto import | high | The dependency-direction gate refused `node:crypto` in the shipped evaluator probe. Add that Node builtin to the evaluator-template allow list and prove the direction and lineage gates locally. Patch. |
| Remote CI, schema field claims | high | The doc-claims gate scans JavaScript declarations, not JSON schema fields, so it rejected the public reference's `installDigest` and `installSource`. Register both as schema-declared fields with their schema path in the gate's existing foreign-symbol mechanism. Patch. |
| Remote CI, legacy probe diagnostic | medium | A version-only probe with an extra key lost Story 1.44's exact "package and version" diagnostic. Restore it for version-only declarations; retain the four-field wording for declared install state. Patch. |
| CodeRabbit, sprint status | low | The sprint row said `in-progress` while the story record said `in-review`. Set the row to `review` until completion. Patch. |
| CodeRabbit, tree mode portability | high | Full permission bits vary with installer umask and can move scoring for byte-identical packages. Hash regular-file executable status only; use a constant for link and directory modes. Patch with a focused same-digest control. |
| Remote CI, legacy digest pin | medium | The end-to-end fixture copies changed evaluator files, so its whole evaluator configuration digest changed. Pin the pre-story digest in the fixed-input configuration unit and keep the end-to-end legacy framework shape and patch controls. Patch. |
| Local macOS gate, probe diagnostic | medium | A long temporary path consumed the bounded fault text before the malformed-manifest cause. Put the cause before the path in the shipped probe and all three fixture copies; the macOS probe-shape case now passes. Patch. |

## Verification

- `node test/test-evaluate-evaluators.js --install-state-only`: 56 checks passed, including legacy configuration units, tree and lockfile changes, missing and malformed digest output, artifact schema validation, and both in-flight hold positions.
- `npm run test:evaluate-check`: 1,070 checks passed, including valid and invalid source declarations.
- `npm run test:evaluate-guidance`: passed, including exact guide markers and byte-identical probe fixture copies.
- `npm run lint:md` passed with zero issues. `npm run format:check`, `git diff --check`, targeted `node --check` and targeted ESLint passed. Full repository gates remain pending behind lane 3's local gate.
- Review repair focused checks passed: tree metadata (8 assertions), npm lockfile generations, stale and linked entries (5), equivalent lockfile key order (5), in-flight lockfile edits (4), calibration digest holds (4), a separately declared hoisted plugin (3), and artifact schema and malformed probe output (9). `npm run test:evaluate-guidance` passed after the guide edits. Targeted ESLint and Prettier checks passed after the probe repair. The owner is sequencing broad gates after lanes 2 and 3.
- Second repair focused checks passed: tree metadata and dangling links (15 assertions), source and malformed refusal plus schema (13), in-flight digest faults (6), declared-tree scoring (5), calibration (4), lockfile entry (5), and configuration units (37). Guidance, targeted ESLint, Prettier and whitespace checks passed. No broad gate ran during this repair.
- Final repair focused checks passed: linked importer real-path resolution (7 assertions) and two distinct importer trees (5 assertions). The guidance check confirms the linked-path and same-name coverage instructions. Broad gates remain with the owner.
- The remote CI direction repair passed `npm run test:direction` (304 files, zero violations) and `npm run test:layering-boundary-lineage` (796 checks). `npm run docs:validate-links`, `npm run lint:md`, `npm run format:check` and `npm run test:release-metadata` passed; the final guide sentence passed targeted Prettier, Markdown lint and the full `test:evaluate-guidance` suite.
- The doc-claims repair passed `npm run test:doc-claims` (722 identifiers, zero disagreements) and `npm run test:doc-claim-sources`; targeted Prettier and whitespace checks passed.
- The CodeRabbit tree-mode repair passed its focused metadata case with 19 assertions, including non-executable chmod stability, directory-mode stability and executable-state sensitivity; targeted ESLint and Prettier and probe-copy byte comparisons passed. A direct legacy and install-state probe-answer diagnostic check passed.
- The first full local `npm test` reached `test:evaluate-evaluators` and found one macOS fault-text truncation. Remote CI run 37099052298 passed every chain except `chain (4/8)`, whose only failure was the legacy configuration digest pinned to changed evaluator fixture bytes. The fixed-input unit pins the verified pre-story digest `sha256:1b743b59fb8e7018ffa8e6b0683c2c6ce766ca586278efe71671ba532a88c125`. Focused probe-shape and configuration-unit cases passed after repair.
- The second full local `npm test` exited 0 on clean head `5df7960c` as PID 44770. It passed 577 evaluator checks, 500 agent checks, 796 layering checks, ESLint, Markdown lint, formatting and the full remaining chain. Remote CI run 37100908678 passed all 16 checks, including every test shard and coverage, on that head. Both final native Codex reviews found no material defect; all PR review threads are resolved.
- After Story 1.55 merged at `7e3585d9`, the branch rebased without conflicts. `npm ci` installed eval-quality 6.0.1; the fixed-input unit passed 73 checks, the macOS probe-shape case passed 29, and evaluator guidance, link validation, Markdown lint, formatting and release metadata passed. Fresh CI on the rebased PR head remains the merge gate.
- Acceptance revert checks ran in a disposable worktree at `22bdd8ea`, with one change undone and restored at a time. Reverting `frameworks.js` made missing-digest cases fail at declaration exit 10 where exit 12 was expected (9 of 13 checks failed). Reverting `evaluators.js` made the configuration unit fail to bind the digest (1 of 37). Removing the mid-run digest comparison made both changed-package hold positions seal and exit 0 (6 of 6 checks failed). Reverting the shipped probe made the patched-tree case fail at its first run because the observation lacked install state (1 of 1). Reverting the evaluator guide made guidance fail 19 source and example assertions. The worktree was restored and removed; no primary checkout files were changed.

**Merge gate:** Fresh PR CI must pass on the final rebased head. The remote docs job includes the site build.
