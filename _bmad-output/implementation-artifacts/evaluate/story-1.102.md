---
title: 'Story 1.102: Refuse a duplicate interface identifier at compile'
type: 'feature'
created: '2026-10-03'
status: 'in-progress'
baseline_commit: 'd295a3ac1cd97c2a99bdbf3a8f31a0d01eb4cd8b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.102)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.102)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-5)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.101.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.42.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and assigned Story 1.102 to lane 3">

## Intent

**Problem:** An interface's `logicalId` is half of an operation's identity (eval-quality 5.0.0 names an operation by interface plus operation ID), yet `compile` never checks that `permittedInterfaces[].logicalId` is unique. Two interfaces sharing an identifier merge their operations into one pair namespace. A contract that declares one operation ID on each then reports a duplicate pair that `seal` faults on as a misleading `schema-parse-failure`, and every `permittedInterfaces[logicalId=X]` path the compiler emits addresses two interfaces.

**Approach:** The engine owns the refusal. Add a new AD-5 code, `duplicate-interface-identifier`, thrown by a new compile check that names the repeated identifier and both interface positions. Release the engine, then move TeA's peer floor, lockfile and AD-5 record to the release in this pull request. TeA's `check` quotes the engine's refusal, so the story adds a fixture proving it surfaces for an evaluation folder.

## Boundaries & Constraints

**Always:** Append the code to the end of the AD-5 table and `FAILURE_CODES` (the table order is the only published stable priority, so existing codes keep their rank), and run the new check first in `compile`, right after the stamp check, with a comment that says why (every later path addresses an interface by `logicalId`). Update every place the registry, its count and the code list appear (grep the existing last code, `excluded-content-in-declaration`, across the engine repo, and `duplicate-operation-signature` for prose). Docs counts, doc-claims and the engine CHANGELOG move with the code. TeA changes are the floor, lockfile, AD-5 record and mirrors, CHANGELOG, tests and the re-recorded baselines.

**Never:** Compare identifiers in TeA's own code (the engine owns the refusal). Reorder or renumber existing codes. Run `npm pack`, `npm install` or `npm ci` in a shared `node_modules`. Dispatch TeA's Publish workflow. Touch the engine's main checkout.

## I/O & Edge-Case Matrix

| Scenario                              | Input / State                                                  | Expected Output / Behavior                                                           | Error Handling                 |
| ------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| Distinct identifiers                  | Every `logicalId` unique                                       | Compiles as before                                                                   | N/A                            |
| Repeated identifier, distinct op IDs  | Two interfaces share `logicalId`, operation IDs differ         | `duplicate-interface-identifier` naming the identifier and both positions            | Exit with the structural code  |
| Repeated identifier, same op ID       | Two interfaces share `logicalId` and declare one operation ID  | `duplicate-interface-identifier`, never `schema-parse-failure`; `seal` never reached | Exit with the structural code  |
| Three interfaces, one pair repeated   | A, B, A                                                        | Names the first repeat: positions 0 and 2                                            | Same                           |
| Evaluation folder with the repetition | TeA `check` over a folder whose contract repeats an identifier | `check` reports the engine's refusal with its code                                   | Existing `check` refusal route |

</frozen-after-approval>

## Code Map

Engine (`/Users/murat/opensource/bmad-eval-quality`, worktree `/Users/murat/opensource/_wt/evaluate-lane3-eq-1102`):

- `src/core/failure-codes.ts` -- `FAILURE_CODES` tuple (26 codes), `StructuralFailure`.
- `src/core/compile/interface-inventory.ts` -- `checkInterfaceKind`, `checkDuplicateOperationSignature` (neighbours; add the new check here).
- `src/core/compile/compile.ts` -- fixed call order and its header comment.
- `scripts/check-ad5-registry.ts`, the engine's `ARCHITECTURE-SPINE.md` AD-5 table, `tests/schemas/failure-codes.test.ts`, `tests/compile/compile.test.ts`, `tests/compile/interface-inventory.test.ts`, `tests/schemas/ad5-admissions.test.ts` -- registry binding and tests to extend.
- Docs, counts, doc-claims, `CHANGELOG.md`: every file the grep for `excluded-content-in-declaration` and the "twenty-six" count finds.

TeA:

- `package.json` (peer floor), `package-lock.json`, `tools/guard-publish.js`, `test/test-guard-publish.js`, `test/test-release-metadata.js`, `cli/lib/evaluate/engine.js` (message), `docs/reference/tea-evaluate-cli.md`, `ARCHITECTURE-SPINE.md` (three AD-5 spots; run `npx prettier --write` on it), `CHANGELOG.md`.
- `cli/lib/evaluate/check.js` (`checkReportCollision`, `checkProbes`) and `cli/lib/evaluate/release-report.js` (`signatureCollisionLine`): `check` compiles once only when a historical probe names a report, and quotes the engine's `duplicate-operation-signature` line. The duplicate-identifier refusal is contract-wide and needs no probe, so `check` compiles once for any folder with a contract, quotes the engine's own `duplicate-interface-identifier` line as one finding on `contract.json`, and keeps the existing report-collision rule on the same compile. TeA compares no identifier (AD-1); it quotes the line. Add its fixture and test beside the Story 1.77 ones.
- Baselines `test/fixtures/evaluate/mutation/evals/verdict-ci`, `evaluate-mcp/evals/grader`, `evaluate-api/evals/grader` (`baseline/`): re-record with `compare --accept` in disposable copies after the version moves (see story-1.101.md and story-1.55.md).

## Tasks & Acceptance

**Execution:**

- [ ] Engine `src/core/failure-codes.ts`, `interface-inventory.ts`, `compile.ts` -- the `duplicate-interface-identifier` code, `checkDuplicateInterfaceIdentifier`, first call after the stamp check
- [ ] Engine registry, spine table, count prose, `check:ad5-registry` -- the 27th code listed everywhere the 26th is
- [ ] Engine tests -- repeated identifier with distinct operation IDs, with one operation ID on each (was `schema-parse-failure` at seal), three interfaces, distinct identifiers compile as before; revert of the check fails them
- [ ] Engine docs, CHANGELOG, `npm run validate` green
- [ ] Engine release (bump chosen from CONTRIBUTING) -- `npm view eval-quality version`
- [ ] TeA floor, lockfile, guard, message, docs reference, AD-5 record and mirrors, CHANGELOG
- [ ] TeA `check` test for an evaluation folder with a repeated identifier
- [ ] Re-record the three accepted baselines on the new engine version
- [ ] Story record, sprint row 1.102 to `review`, flip Story 1.101 row and record from `review` to `done`

**Acceptance Criteria:**

- Given a contract whose `permittedInterfaces` repeat one `logicalId`, when `eval-quality compile` and `seal` read it, then `compile` exits with `duplicate-interface-identifier` naming the identifier and both interface positions and `seal` is never reached; a contract with distinct identifiers compiles as before.
- Given a fixture that repeats an identifier while declaring one operation ID on each interface, when it is compiled, then it fails with the new code and not with `schema-parse-failure`.
- Given the AD-5 registry, its spine table and the generated registry check, when the check runs, then all list the code.
- Given an evaluation folder whose contract repeats an identifier, when TeA's `check` runs, then it surfaces the engine's refusal with the code.
- Given the engine release, when TeA adopts it, then peer floor, lockfile and AD-5 record name it and `npm test` passes.

## Implementation Notes

Decisions (coordinator, no Open Questions: the owner delegated): the code is appended last so no existing code changes rank; the check runs first because every later path addresses an interface by `logicalId`, the same reason `checkArtifactReferences` runs early. `check` already quotes the engine's compile refusal, so no TeA source change is expected beyond the adoption touches and a test.

## Outcome Record

_To be written when the story lands._

## Revert observations

_To be written._

## Spec Change Log

## Review Triage Log
