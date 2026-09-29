---
title: 'Send principal and matcher bindings'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f7479ee688acba03fa798c21eed1bf78c474ed11'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
---

<frozen-after-approval reason="Owner delegated the relay story and its delivery decisions">

## Intent

**Problem:** `tea-evaluate run` stops with exit 12 whenever an interaction plan uses a declared principal or matcher binding. Contracts that exercise authorization boundaries or malformed inputs therefore cannot run.

**Approach:** Add a validated evaluation manifest mapping from contract principal names to registry permitted environment keys. Resolve the host credential only while building the target request, scrub it through the existing registry boundary, and record the opaque principal label on the sealed observation. Materialize `any` and `type-violating` matcher bindings from the operation's declared scalar type with a deterministic seed recorded in `run.json`.

## Boundaries & Constraints

**Always:** Keep credentials out of contracts, persisted requests, observations and diagnostics. Require each principal mapping to name a contract principal, one declared interface and an environment key that the registry permits. Preserve eval-quality's `principal` observation field and binding semantics. Reject unsupported or unsendable bindings with exit 12. Reject missing or inconsistent principal mappings with exit 10 during `check`. Keep matcher generation deterministic and schema-derived. Every acceptance criterion needs a demonstrated revert failure.

**Scope:** Command, MCP and HTTP registry targets use the same principal mapping source. A mapping resolves a host environment value with an optional prefix. Matcher generation supports the scalar request types eval-quality declares. API auth remains registry-owned and principal bindings are recorded as principal labels in call inputs without persisting the credential.

## I/O & Edge-Case Matrix

| Scenario               | Input or state                                                                                                   | Expected behavior                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Principal              | Contract declares `operator`; evaluation maps it to an allowed environment key; a plan step binds that principal | Target receives the mapped value; record carries `principal: operator` and no credential                    |
| Unmapped principal     | Plan names a principal with no evaluation mapping or mapping points at another interface                         | `check` exits 10 with the principal and mapping defect                                                      |
| Matcher any            | Operation declares a scalar request key; plan binds `{ matcher: "any" }`                                         | Target receives a value of the declared type; repeated runs with one seed send identical bytes              |
| Matcher type-violating | Operation declares a scalar request key; plan binds `{ matcher: "type-violating" }`                              | Target receives a value whose JSON type differs from the declared type; string-only transports fail clearly |
| Unsupported binding    | Plan contains a binding kind the runtime cannot materialize                                                      | Run exits 12 naming the step, channel, key and binding                                                      |
| Missing secret         | Principal mapping names an environment key absent on the host                                                    | Run exits 12 before the target call and persists no secret                                                  |

## Code Map

- `cli/lib/evaluate/schemas/evaluation.schema.json`: declare the principal mapping shape and schema-version compatibility.
- `cli/lib/evaluate/check.js`: validate mapping references, contract principals, interface identity and registry environment authorization.
- `cli/lib/evaluate/registry.js`: resolve principal values from the host environment and expose the mapping to the arm executor while retaining scrubbing.
- `cli/lib/evaluate/arm.js`: materialize principal and matcher bindings, record opaque principal labels and deterministic matcher values, and preserve unsupported-binding faults.
- `cli/lib/evaluate/preflight.js`, `cli/lib/evaluate/run.js`, `cli/evaluate.js`: carry the mapping and run seed into every arm; persist the seed in `run.json`.
- `test/test-evaluate-run.js`, `test/test-evaluate-check.js`: add end-to-end principal, matcher, determinism, mapping and unsupported-binding assertions.
- `docs/reference/tea-evaluate-cli.md`: document all binding kinds under the exact interaction-plan heading, credential sourcing, matcher selection and persisted observation behavior.
- `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`, `CHANGELOG.md`: record relay status and the user-facing change.

## Tasks & Acceptance

**Execution:**

- [x] Define and validate evaluation principal mappings without admitting credential values into committed artifacts.
- [x] Send principal bindings through the existing registry adapters and persist only principal labels.
- [x] Send deterministic schema-derived matcher values and record the run seed.
- [x] Add end-to-end fixture assertions for principal, matcher, determinism, mapping errors and unsupported bindings.
- [x] Update the reference, changelog and sprint row; run the engine export check, focused tests, documentation gates and `npm test`.

**Acceptance Criteria:**

- Given an evaluation with two declared principals and matching registry mappings, when a multi-step run uses those principal bindings, then the target receives the mapped identities in plan order, each observation records its principal label and no credential appears in persisted request or record artifacts; removing principal materialization fails the fixture assertion.
- Given a contract that names a principal without a valid evaluation mapping, when `tea-evaluate check` runs, then it exits 10 with the principal and mapping defect; removing the mapping rule lets the invalid plan reach run and exit 12.
- Given an operation with a declared scalar input, when runs use `matcher: any` and `matcher: type-violating`, then the target receives a value admitted by the declared type and a value refused by it, and two runs with one seed send identical bytes; removing matcher selection makes the run exit 12.
- Given a binding kind the runtime cannot materialize, when a trial executes, then it exits 12 with the step, channel, key and binding kind; allowing the step to continue makes the negative fixture pass.
- Given the CLI reference under `## The interaction plan`, when the binding passage is read, then it states the supported binding kinds, principal credential source, matcher selection and opaque observation record; deleting one statement fails the documentation assertion.

## Revert checks

- Principal materialization: `node test/test-evaluate-run.js` and `node test/test-evaluate-workflow.js` assert two mapped identities reach the target in order, labels remain in both records, and credentials are absent. Removing principal materialization makes the received identity and label assertions fail. Restored implementation passes 430 and 110 checks.
- Mapping validation: `node test/test-evaluate-check.js` removes `principalMappings.operator`, then requires exit 10 with `operator` and `principal-mapping`. Restored mapping passes the valid case and the negative case across 685 checks.
- Matcher selection: `node test/test-evaluate-workflow.js` checks schema-derived `any`, type-violating values and same-seed bytes. Removing matcher handling reaches the unsupported-binding assertion with exit 12. Restored matcher handling passes 110 checks.
- Unsupported binding: `node test/test-evaluate-workflow.js` and `node test/test-evaluate-mutation.js` use `{ unsupported: "binding" }` and require the step and supported binding classes in the exit 12 error. Restored refusal behavior passes 110 and 660 checks.
- Reference documentation: `node test/test-evaluate-workflow.js` reads `### Binding kinds` under `## The interaction plan` and requires the supported kinds, principal source, matcher choice and opaque label. Removing a statement fails the assertion. Restored documentation passes 110 checks.

## Verification

- `node test/test-evaluate-workflow.js`: passed 112 checks.
- `node test/test-evaluate-check.js`: passed 685 checks.
- `node test/test-evaluate-mutation.js`: passed 660 checks.
- `node test/test-evaluate-run.js`: passed 430 checks.
- `node test/test-evaluate-mcp.js`: passed 155 checks.
- `node test/test-evaluate-api.js`: passed 264 checks.
- `npm run lint`: passed.
- `npm run lint:md`: passed with 0 issues.
- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm test`: passed with 0 failures.

## Review Triage Log

- `manual-audit`: The first audit found that a target response could echo a principal credential because the scrubber knew registry-injected environment values but not evaluation principal mappings. The registry now exposes mapped principal secrets to the existing scrubber, and the workflow regression covers an echoed secret. No remaining finding.
- `coderabbit-review`: CodeRabbit identified three actionable improvements on PR #262: (1) `arm.js`: return undefined on `matcherValue` fallback and guard `typeViolatingValue` against unsupported declared types to cleanly trigger exit 12; (2) `registry.js`: in `principalSecrets()`, return both prefixed and raw token values when a prefix is configured so echoed raw secrets are scrubbed; (3) `preflight.js` and `historical.js`: propagate `seed: run.seed` through qualification probes (`qualifyHistoricalProbe`, `qualifyDeploymentProbe`, `qualifySeededProbe`, and `revisionArm`) to maintain seed consistency across qualification and trial arms. All three items fixed and covered with regression tests in `test-evaluate-workflow.js`.
- `local-adversarial-review`: Independent adversarial code review subagent reviewed `/tmp/eval-1.30.diff` covering functional correctness, edge cases and transport stringification guards, credential scrubbing, seed determinism across runner pipelines, and verification assertions. Review completed clean with no outstanding defects.

## Spec Change Log

Created for Story 1.30 from the approved planning artifacts. The implementation chooses an evaluation-level principal mapping keyed by contract principal, bound to one registry interface and an allowed host environment key, so secret material remains outside committed evaluation and sealed artifacts.
