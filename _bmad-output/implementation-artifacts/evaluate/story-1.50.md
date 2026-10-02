---
title: 'Story 1.50: Send malformed raw HTTP bodies through an API probe'
type: 'feature'
created: '2026-10-02'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '984156e7ba0fbc9eb0ebb50ad3a166cd16c10520'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.50)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.50)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-4, AD-5, AD-19)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.42.md'
  - 'AGENTS.md'
---

<frozen-after-approval reason="The owner gave GO for Story 1.50 and delegated the Evaluate relay build">

## Intent

**Problem:** The published engine admits JSON or absent API request bodies. The HTTP port therefore cannot send malformed JSON as a scored probe, though the AI feature intake includes that boundary.

**Approach:** Add a strict, canonical base64 raw body arm to the published engine, release it, then decode and send its exact bytes through TeA's HTTP port. Add a malformed JSON defect probe to the AI feature fixture and regenerate its scored replay.

## Boundaries & Constraints

**Always:** Preserve JSON and absent behavior. Keep empty raw bytes distinct from absent. Require an explicit declared content type for raw bodies. Bind the actual bytes through the request identity, prove three scored trials, use the published engine, and regenerate all derived evidence with its owning tools.

**Never:** Introduce an engine copy in TeA, hand edit compiled or scored evidence, start a live Claude session, or force-add `src/**/.memlog.md` or `test/eval-artifacts/`.

## I/O & Edge-Case Matrix

| Scenario           | Input / State                                          | Expected Output / Behavior                        | Error Handling                          |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------- | --------------------------------------- |
| Raw malformed JSON | Canonical base64 of invalid JSON and JSON content type | Identical target bytes; documented 400 error      | Parser defect changes the scored oracle |
| Raw valid JSON     | Canonical base64 of valid JSON                         | Identical target bytes and normal response        | None                                    |
| Empty raw body     | Empty base64 string                                    | Zero byte request body with declared content type | Distinct request identity from absent   |
| Absent body        | `kind: absent`                                         | No body or inferred content type                  | Existing behavior preserved             |
| Invalid encoding   | Noncanonical or malformed base64                       | Engine rejects the request                        | No target call                          |

</frozen-after-approval>

## Code Map

- `bmad-eval-quality/src/core/schemas/probe-body.ts`: shared request body union used by API requests and sensitivity witnesses; its published schemas are generated.
- `bmad-eval-quality/src/core/schemas/plan.ts`: `ApiInputBinding.body` carries the raw arm into scored API trials; compile and selection tests prove exact binding.
- `bmad-eval-quality/src/core/schemas/defect-signature.ts`: `ProbeInputBinding.body` selects the exact raw request that manifests a parser defect.
- `bmad-eval-quality/src/core/schemas/sealed-run-record.ts`: `ObservedCallInputs.bodyEncoding` distinguishes raw bytes from a JSON object with the same keys; the sealed record stamp moves to version 8.
- `src/workflows/testarch/bmad-testarch-evaluate/assets/http-probe-port.mjs`: decodes request bodies, applies byte caps, sends the buffer, and follows redirects. Its fixture copies must match.
- `cli/lib/evaluate/workspace.js`: request cache identity hashes the parsed request with its correlation ID neutralized. Canonical base64 makes the raw bytes part of that identity.
- `cli/lib/evaluate/arm.js`: maps plan input bindings to API requests and records call inputs; raw plan steps need a defined mapping.
- `cli/lib/evaluate/records.js`: preserves the raw body encoding marker in scored observations so a JSON object with the same keys has a separate identity.
- `test/fixtures/evaluate-authoring/ai-feature/`: target parser, existing raw intake D08, mutation corpus, probes, and development replay; `test/test-evaluate-authoring.js` compares committed replay bytes.
- `test/test-evaluate-api.js`: live HTTP port and template parity tests; extend with exact bytes, content type, empty, absent, caps, redirects and request identity.

## Tasks & Acceptance

**Execution:**

- [x] `bmad-eval-quality` schema, `ApiInputBinding.body` compile and selection tests, `ObservedCallInputs.bodyEncoding`, generated schemas, docs and changelog: admit canonical raw bytes and release the breaking schema update.
- [x] `http-probe-port.mjs` template and fixture copies: decode and send exact bytes, preserve declared headers, enforce the existing byte cap and redirect behavior.
- [x] `arm.js`, AI feature fixture, replay and tests: route a raw plan request and score a controlled parser defect for three trials.
- [ ] TeA dependency metadata, changelog, Story 1.42 status and sprint rows: use the published release and record this story.

**Acceptance Criteria:**

- Given a valid raw body, when the published engine validates it and TeA sends it, then the target receives the exact bytes and declared content type, and a changed byte changes request identity.
- Given raw empty, JSON and absent bodies, when sent through the port, then each retains its intended wire behavior and request identity.
- Given malformed JSON and a controlled parser defect, when the AI feature runs at `minimumTrialCount: 3`, then the clean target returns its documented error and the engine scores the defect as caught.
- Given the engine release, when TeA runs check, preflight, run, score, replay and `npm test`, then all pass against the published package.

## Implementation Notes

The engine change merged in [eval-quality PR #177](https://github.com/bmad-code-org/bmad-eval-quality/pull/177) at `4293333147a300a7e2b4372a13c7c061d3259045`. It adds the canonical `{ kind: "raw", base64, contentType }` arm to API requests, plan bindings and defect selectors; moves contract and probe schemas to 7 and 6; and requires `callInputs.bodyEncoding` on every schema 8 sealed run observation. Raw selectors require the `raw` marker so a JSON object with the same fields cannot match.

[Release PR #178](https://github.com/bmad-code-org/bmad-eval-quality/pull/178) merged at `1c56cc669fc24408ae06dde6ec4f4f144c87e92c`. [Publish run 37063143304](https://github.com/bmad-code-org/bmad-eval-quality/actions/runs/37063143304) completed successfully on that commit with `bump=none`. `npm view eval-quality version` reports 6.0.0, and tag `v6.0.0` resolves to the release merge commit.

## Spec Change Log

## Review Triage Log

- Preliminary Codex review found an invalid P-014 witness pointer into `/call-inputs/bodyEncoding`. The authored probe now uses legal evidence pointers; engine raw selectors check the encoding marker internally.
- Preliminary Codex review found that replay assertions compared the malformed body only with the probe's own literal. The authoring test now compares decoded bytes with the frozen D08 input and checks its content type.
- A generated-artifact audit found three live accepted baselines with old engine stamps. The worker regenerated and accepted API, MCP and verdict-CI baselines with the published 6.0.0 engine. Each baseline manifest's 44 file hashes match.
- Final independent Codex adversarial and test-quality reviews found no material issue. The adversarial reviewer noted one stale comment in the direct evaluator tool; it was clarified.
- The first guarded full test run found stale AI-feature source copies in the two CI fixture repositories. The copies were synchronized with the regenerated source and artifacts; targeted `test:evaluate-ci` and a focused Codex mirror review passed.
- PR #305's first CI run exposed three further engine 6.0 baseline expectations. The Story 1.44 framework configuration digest was pinned to the previous engine, the CLI reference scorer example lacked the required `bodyEncoding: null`, and the offline probe-strength baseline carried 15 old corpus digests. The authored expectations were updated and `expected-strength.json` was regenerated with its owning `--write` command; no scoring outcome changed.

| Final review finding                                               | Verdict and evidence                                                                                                                                                                                                                                                     | Route                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| Edge: later framework probes are skipped after a non-timeout fault | False. Story 1.71 deliberately stops subsequent probes after any unreadable framework, and the current code and tests implement that rule.                                                                                                                               | Reject                    |
| Edge: raw bytes are decoded before the request cap                 | Medium. `Buffer.from` allocates at the HTTP port before `evaluateTarget` supplies the selected `maxRequestBytes`; an oversized raw request can allocate beyond its authorized cap.                                                                                       | Patch                     |
| Blind: raw bytes are decoded before the request cap                | Medium. This is the same allocation path as the edge finding.                                                                                                                                                                                                            | Patch, grouped with edge  |
| Blind: property order changes the raw request cache key            | False for the supported raw path. The engine's strict raw body parser emits fields in schema order, and plan requests use that parsed object; arbitrary direct calls to the pure `requestKey` helper are outside the runtime path. JSON value order predates this story. | Reject                    |
| Blind: P-014 quotes a clean sibling response                       | Low. The generated finding cites all three observation IDs and the raw observation shows HTTP 200; the quote is one illustrative value from the combined O-003 oracle. A dedicated oracle would substantially expand the contract and replay for a presentation issue.   | Reject                    |
| Blind: P-014 signature omits HTTP status                           | Medium. A response with `decision: pass` and HTTP 400 could satisfy the current signature despite not accepting the malformed request.                                                                                                                                   | Patch                     |
| Blind: raw wire tests use text bodies                              | Medium. The live port assertion would miss a UTF-8 round trip that corrupts a non-text byte.                                                                                                                                                                             | Patch                     |
| Verification: raw wire tests lack a binary check                   | Medium. The reviewer demonstrated that an `0xff` byte could change while the current ASCII tests still pass.                                                                                                                                                             | Patch, grouped with blind |
| Blind: the raw cap test lacks an exact-boundary success            | Low. The 65-byte refusal at a 64-byte cap would not catch an off-by-one rejection of 64 bytes.                                                                                                                                                                           | Patch                     |
| Blind: raw redirect tests omit 301, 302, and 308                   | Low. The new raw body behavior reaches the existing shared redirect branches through 303 and 307, covering body drop and preservation; the other codes use those same branches.                                                                                          | Reject                    |
| Blind: the adopter conformance asset uses absent bodies only       | Medium. An adopter editing the copied HTTP port could break raw bytes and still pass the portable conformance run.                                                                                                                                                       | Patch                     |
| Blind: the contract guide lacks a raw interaction-plan example     | Low. The guide describes the raw body and its plan binding at lines 273 and 480, but an authoring example would make the new form easier to use.                                                                                                                         | Patch                     |
| Blind: the story record still reports running gates                | False as a closure defect. The record is `in-review`; gate results will be written before it is marked done. Its fix would edit this build's spec.                                                                                                                       | Reject                    |
| Blind: the story task and sprint row lag `in-review`               | Low, transient. The final task and sprint row are reconciled by the presentation step after verification; the suggested edit is to this build's spec.                                                                                                                    | Reject                    |
| Blind: Story 1.71 still calls the old configuration digest current | Low. Story 1.71's historical note says its integration test pins the old digest, while this story has updated the pin for engine 6.0.                                                                                                                                    | Patch                     |

## Verification

The predecessor TeA Publish run [37048288122](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/actions/runs/37048288122) completed successfully on `984156e7ba0fbc9eb0ebb50ad3a166cd16c10520`. No manual TeA Publish dispatch is required for this story.

Engine `npm run validate` passed on the final feature diff and again on the 6.0.0 release tree: 150 test files, 5,043 tests. Both engine PR gates passed all 22 watched jobs. A separate 6.0.0 CLI route re-verification is recorded in the engine's tool-use implementation artifact.

TeA `test:evaluate-api` passed 4,252 checks; `test:evaluate-authoring`, `test:evaluate-gap-loop`, `test:evaluate-ci`, `test:evaluate-guidance`, and `test:atdd-workflow-guidance` passed after regeneration. The P-014 score evidence reports `caughtCount: 3`, `validCount: 3`, and three `caught` trial votes. Both clean qualification baselines return HTTP 400 with `invalid JSON`; the controlled parser mutation accepts the same bytes and is caught. The second guarded `npm test` passed through Evaluate run and aggregate, then stopped in `test:evaluate-confinement` after three macOS kernel audit attempts missed the same two mount reports under shared load. A focused post-rebase confinement rerun passed all 717 checks after its built-in retry. The remaining test scripts and CI shards are in progress.

**Commands:**

- `npm run validate` in eval-quality.
- `npm run test:evaluate-api`, `npm run test:evaluate-authoring`, `npm run test:atdd-workflow-guidance`, `npm run test:release-metadata`, and `npm test` in TeA.
