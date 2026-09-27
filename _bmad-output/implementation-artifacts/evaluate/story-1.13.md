---
title: 'Author the contract, oracles, rubrics and adapter wiring'
type: 'feature'
created: '2026-09-27'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'a6d94428fdf0ce725cf86ec4f50839222c53a2d1'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="owner delegated Story 1.13 and the relay grants build and merge authority">

## Intent

**Problem:** Evaluate stops at its contract, oracle, and adapter stages because their guides are placeholders. An adopter cannot use the skill to write a compiling and sealed contract or wire its target.

**Approach:** Fill the three guides and a contract skeleton with worked, executable examples. Add a guidance gate that fills the skeleton, compiles and seals it, checks lineage against the confirmed requirements bytes, and detects missing craft and invalid examples.

## Boundaries & Constraints

**Always:** Follow Story 1.13's approved criteria, its test-design revert checks, AD-4 and AD-19 through AD-22, and the epic's Build Rules. Use eval-quality for contract validation, sealing, and byte digests. Author the skill through the workflow-builder Edit path and run its Analyze gate. Keep the stage sequence check, compile, seal, with nonzero exits reported and halting.

**Never:** Copy engine validation or verdict logic into TeA. Add a framework dependency to `cli/`. Name private systems or third-party individuals in public content.

## I/O & Edge-Case Matrix

| Scenario           | Input / State                                           | Expected Output / Behavior                                                     | Error Handling                                  |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| Complete contract  | Confirmed requirements, filled skeleton and corpus      | `check`, `compile`, then `seal` succeed; source digest matches exact bytes     | Halt and report the failing command's exit code |
| Missing fill value | Skeleton placeholder absent from fill map               | Guidance gate fails before compile                                             | Name the missing placeholder                    |
| Invalid contract   | Missing `forbiddenInputs`, bad oracle or rubric example | Engine or guidance gate refuses the artifact                                   | Preserve the engine failure code                |
| Target wiring      | Each AD-4 target kind                                   | Guide selects a real registry and adapter shape with working fixture reference | Preflight authorization denial remains visible  |

</frozen-after-approval>

## Code Map

- `src/workflows/testarch/bmad-testarch-evaluate/SKILL.md`: Twelve-stage controller. Stage 4 to 6 load the guides and must run check, compile, seal in order.
- `src/workflows/testarch/bmad-testarch-evaluate/references/{contract,oracles,adapters}.md`: Placeholder guides to replace with worked craft.
- `src/workflows/testarch/bmad-testarch-evaluate/assets/`: Add a contract skeleton alongside the installed starters.
- `test/test-evaluate-guidance.js`: Existing exact-heading and tagged-example gate, chained through `test:evaluate-guidance` in `npm test`.
- `test/fixtures/evaluate/valid/`: Reuse its valid contract and requirements fixture shape, without modifying engine validation.
- `cli/lib/evaluate/engine.js`: Public engine loader and schema paths. Keep eval-quality calls behind this boundary.
- `_bmad-output/planning-artifacts/evaluate/epics.md`: Binding Story 1.13 acceptance and Build Rules.

## Tasks & Acceptance

**Execution:**

- [x] Use workflow-builder Edit to author the three guides and contract skeleton with all named fields, discipline rules, worked fragments, and six target wiring examples.
- [x] Extend `test/test-evaluate-guidance.js` and fixture fill inputs. Validate every tagged fragment, skeleton substitution, exact-byte requirements lineage, and compile plus seal exits.
- [x] Exercise the test-design revert checks, workflow-builder Analyze, engine export check, and full `npm test`.
- [x] Add `CHANGELOG.md` entry, update the Story 1.13 sprint row, and complete this outcome record.

**Acceptance Criteria:**

- Given the confirmed corpus and requirements, when the contract stage fills and checks its skeleton, then eval-quality compiles and seals it with source lineage stamped from the confirmed bytes.
- Given the contract and oracle guides, when guidance checks run, then all named field, discipline, interaction, witness, waiver, oracle, rubric, calibration and sealing lessons have worked examples that fail on deletion or corruption.
- Given each AD-4 target kind, when the adapter guide is followed, then its registry entry and adapter shape match a working fixture, and the stage reports any nonzero validation exit.

## Implementation Notes

The contract guide now gives worked, engine-valid examples for all required fields, seven authoring disciplines, interaction planning, sensitivity witnesses, waivers, and sealing. The oracle guide includes exact evidence checks, an anchored rubric and calibration set, and a loose oracle whose degenerate answer the tightened oracle rejects. The adapter guide covers every AD-4 mapping row with a schema-valid registry entry and an existing fixture citation. Stage 6 runs `check`, `compile`, and `seal` in order and reports the failing exit code.

The guidance gate fills the installed JSON skeleton, stamps `sourceSpecDigest` from a Buffer of the exact confirmed `requirements.md` bytes, then invokes the published engine for compile and seal. It also runs the TeA preflight check on a temporary evaluation copy and confirms changed requirements bytes fail. Every tagged contract patch, oracle, and rubric compiles with the real engine; the `rubric-unanchored` and unreachable-evidence refusal cases are checked through the same engine.

The workflow-builder Analyze report has zero critical and zero high findings, with five medium improvement ideas outside this story's approved scope. Its generated files stay under the skill root as required by the builder and are excluded from the published package. The package-boundary gate now scans the authored Evaluate files explicitly. A regression check compares the declared scan paths with every source file in `npm pack --dry-run`, so a future published source file cannot silently escape the gate. The guide's Evaluate fixture citations are checked for existence by `test:evaluate-guidance`.

## Spec Change Log

- Corrected the Story 1.13 test-design revert row to the installed engine's observed schema-parse exit 5 when `forbiddenInputs` is removed. The earlier row predicted exit 4. The frozen story block did not change.

## Review Triage Log

| Finding                                                                                                                                                    | Outcome                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Preliminary guide review found shallow waiver, malformed-input, read-back, sensitivity, interaction, rubric calibration, and sibling cross-check examples. | Reworked each example and added executable guidance assertions for its meaningful fields.                                                                                                                                                                                                                                                                                            |
| Workflow-builder Analyze reported five medium suggestions and zero critical or high findings.                                                              | Intake already asks for the desired decision and uses eval-quality's digest command. Story 2.2 owns runtime freshness. The shorter-intake suggestion needs comparative evidence before replacing the six worked families. The two customization suggestions are conditional on an adopter need that has not been observed. No accepted defect or gap remains from these suggestions. |
| Initial full gate flagged builder-generated files and valid fixture citations in `test:boundary`.                                                          | Narrowed the scan to published files, preserved the developer-path guard, checked source coverage against the npm pack list, and excluded generated reports from markdownlint.                                                                                                                                                                                                       |
| Initial full gate reached ESLint and flagged seven style rules in the guidance test.                                                                       | Corrected the test; focused lint, markdownlint, and formatting gates pass.                                                                                                                                                                                                                                                                                                           |
| Review round 1: Stage 6 can reach `check` with mutation or gameability probes and no scoring policy.                                                       | Patched the corpus and Stage 6 instructions to fill the installed scoring policy template before the check. The guidance gate now holds the dependency.                                                                                                                                                                                                                              |
| Review round 1: the skill runner guide and installed starter pointed at a target absent from a copied adopter workspace.                                   | Changed the registry target to the executable `tea-skill-runner` and aligned the guide with the working preflight fixture.                                                                                                                                                                                                                                                           |
| Review round 1 and CodeRabbit: published guides cited source-only fixture paths without a usable installed-package route.                                  | Converted citations in all three guides to direct source repository links, named their provenance, and restored the strict published test-path boundary check.                                                                                                                                                                                                                       |
| Review round 1: the whole-body oracle's expected stdout differed from the stub agent's output.                                                             | Matched the exact stdout the fixture emits.                                                                                                                                                                                                                                                                                                                                          |
| Review round 1: the malformed-input fragment changed one string to another and claimed a refusal the stub agent cannot produce.                            | Added a numeric target fixture, bound a type-violating value, and exercised its refusal.                                                                                                                                                                                                                                                                                             |
| Review round 1: the sensitivity witness edit assigned the existing value again.                                                                            | Changed one leg's input and the corresponding relation literals; the guidance gate checks the edited witness.                                                                                                                                                                                                                                                                        |
| Review round 1: the calibration items used self-reported coverage claims as judge responses.                                                               | Replaced them with observable criterion and test excerpts at each anchored level.                                                                                                                                                                                                                                                                                                    |
| Review round 1: the HTTP tool-server example named an unbound fixed port.                                                                                  | Used the working HTTP fixture's dynamic port handoff and clarified that the fixture proves transport.                                                                                                                                                                                                                                                                                |
| Review round 1: the test-review row cited only a generic runner fixture.                                                                                   | Added the seeded and clean review corpus citations, and distinguished runner transport from review behavior.                                                                                                                                                                                                                                                                         |
| Review round 1: deleting oracle lessons or changing a registry target could pass the guidance gate.                                                        | Added per-lesson checks, matched registry entries to their cited fixtures, and exercised check and preflight denial paths.                                                                                                                                                                                                                                                           |
| CodeRabbit: the `forbiddenInputs` revert check accepted any nonzero exit.                                                                                  | Required the documented engine schema-parse exit 5 and retained the stderr check.                                                                                                                                                                                                                                                                                                    |

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` succeeds before and after the work.
- `npm run test:evaluate-guidance` validates the skill and executable examples.
- `npm test` passes the full quality gate.

**Observed:**

- Workflow-builder Edit and Analyze completed. Analyze grade: `good`, with 0 critical, 0 high, and 5 medium findings.
- `npm run test:evaluate-guidance`: passed with 12 stages, six worked guides, 36 engine-valid tagged probes, and contract examples.
- `npm run test:boundary`: passed with 827 scanned entries and zero violations. `node test/test-layering-boundary-lineage.js`: 785 checks passed, including pack-list source coverage.
- `npm run lint`, `npm run lint:md`, and `npm run format:check`: passed after the style and generated-report exclusions.
- `npm test`: passed again after the first review fixes, including every Evaluate runtime suite, package boundary, source layering, schema validation, lint, markdownlint, and formatting.
- `npm run docs:validate-links`: 44 documentation files scanned with zero link issues after the review fixes.
- Nine targeted revert mutations were rejected by the guidance gate and restored: missing field name, missing skeleton `forbiddenInputs`, missing fill key, wrong source digest, removed discipline heading, malformed tagged patch, removed seal step, removed degenerate response, and removed workflow adapter row. The unmodified guidance gate passed again.
- The engine export check passed before and after the work. `git diff --check` passed.
