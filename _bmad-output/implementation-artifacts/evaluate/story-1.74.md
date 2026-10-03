---
title: 'Scrub unevenly cased Unicode echoes in escaped evidence'
type: 'bugfix'
created: '2026-10-03'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c5c0da3b236ef08e4fbe519f1252db989435fdc6'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.66.md'
---

<frozen-after-approval reason="owner delegated Story 1.74 build and merge through the Evaluate relay">

## Intent

**Problem:** A target can echo an injected secret with different letter cases and serialize non-ASCII letters as `\uXXXX`. The current scrub derives escapes from whole-string case variants, so mixed-case escapes reach evidence.

**Approach:** Match each secret's letter variants at each character position in one- and two-level JSON escaped text. Use the same matching for observations, faults and cut text, with a pattern whose size grows linearly with the secret.

## Boundaries & Constraints

**Always:** Preserve Story 1.66's plain-text, structured-value, case-folding, minimum-length and long-secret behavior. Scrub only injected values and their echoes. Treat surrogate pairs and Turkish, Greek and Cyrillic casing correctly. Keep a megabyte ordinary-text scrub under a stated time bound.

**Never:** Decode or rewrite ordinary evidence as a preprocessing step, enumerate combinations of per-character case, or invoke a live Claude session.

## I/O & Edge-Case Matrix

| Scenario            | Input / State                                                                                                                     | Expected Output / Behavior                                                                          | Error Handling                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------ |
| Escaped observation | HTTP auth secret with Latin, Greek, Cyrillic, astral or Turkish case behavior, echoed capitalized or alternating in `\uXXXX` text | Header, body, nested value and key use `[redacted]` at one or two escape levels and either hex case | None                           |
| Fault               | Port fault quotes that echo in message, cause and captured text                                                                   | Every quoted echo is `[redacted]`                                                                   | Retain the fault category      |
| Cut text            | Fault text ends at least four characters into an escaped echo, including inside `\uXXXX`                                          | Replace the partial echo with `[redacted]`                                                          | A three-character prefix stays |
| Ordinary text       | One megabyte without the secret                                                                                                   | Remains unchanged within a stated time                                                              | None                           |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/arm.js`: `secretForms`, `matcherFor`, `scrubText` and `scrubCutText` own the shared matching; preserve the existing literal matcher and `hostEnvironmentPort` path.
- `test/test-evaluate-api.js`: `checkLetterCases`, `LETTER_CASES`, `BYTE_FORMATS` and fake HTTP port supply the end-user reproduction; add a focused flag for revert checks if useful.
- `docs/reference/tea-evaluate-cli.md`: HTTP section line describing the escaped mixed-case limit needs replacement.
- `CHANGELOG.md`, `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`: record the user-facing fix and story state.

## Tasks & Acceptance

**Execution:**

- [x] `test/test-evaluate-api.js`: add and run a failing fake-port regression before changing the scrub, then cover every matrix row and the linear-size bound.
- [x] `cli/lib/evaluate/arm.js`: add bounded per-character escaped matching and cut-prefix handling through the existing shared scrub path.
- [x] `docs/reference/tea-evaluate-cli.md`: describe the fixed behavior and hold the section with a regression assertion.
- [x] `CHANGELOG.md` and sprint/story records: record the behavior, checks, revert observations and review outcomes.

**Acceptance Criteria:**

- Given the mixed-case Unicode and Turkish echoes in the matrix, when `hostEnvironmentPort` records them, then every escaped occurrence is `[redacted]`; reverting the new matching exposes the echo.
- Given a fault and a cut escape, when the same port rejects a call, then message, cause and captured text redact both whole and partial echoes; reverting prefix matching exposes the cut.
- Given forty non-ASCII letters, when the matcher is built and a megabyte of ordinary text is scrubbed, then source size stays under a declared linear bound and runtime under a declared limit; combinatorial enumeration violates the bound.
- Given the public HTTP reference, when its section is checked, then it describes the fixed behavior and contains no old limit sentence; restoring the sentence fails.

## Implementation Notes

- The fake HTTP port regression failed 46 of 91 checks before the scrub changed. Escaped Unicode echoes remained in observations and faults; the Turkish escaped echo also exposed a cut prefix.
- Each injected code point supplies a bounded set of raw and JSON-escaped case variants. The compiled source joins those choices by position. Values beyond 512 code points use a token walk to avoid a giant regular expression. The folded literal matcher remains responsible for unescaped text, including its combining-dot span rule.
- The forty-letter fixture compiled to a 3,402-character source, below the 120,000-character bound. Scrubbing 1,179,648 bytes of ordinary text took 5 ms in one local measurement and remained below the 5,000 ms assertion.
- The focused escaped suite passed 127 checks and Story 1.66's focused suite passed 3,891 checks. The complete API suite passed 4,381 checks. `docs:validate-links`, `docs:build`, `test:release-metadata`, `lint`, `lint:md`, `format:check` and the engine export check passed. `npm test` awaits the assigned host slot.
- A scratch-module revert of the escaped match exposed `Admin-\\u0130ndex-Token`. A separate revert of escaped prefix matching exposed `Admin-\\u01`. Restoring the old limit sentence triggered the reference assertion. The live checkout was unchanged by these revert checks.
- Review repair replaced the full escaped regex search with a token walk, retained original text spans and scanned overlapping starts. A sticky Unicode case-insensitive comparison covers `K` beside `K`; the existing per-character alternatives cover `ß` becoming `SS`. Each scrub has a fixed work limit. A hostile long near-match raises an infrastructure fault before any observation can be sealed. The matcher-size test now reads a scalar and no mutable matcher is exported. The focused escaped suite passed 193 checks, Story 1.66's suite passed 3,891, and the complete API suite passed 4,447. ESLint, Prettier and whitespace checks passed after this repair.
- Final review repair limits escaped starts to positions that could reach a backslash, and skips token walks for values with no escaped form. A fake HTTP response containing one backslash and a megabyte of ordinary evidence remains intact and finishes within five seconds. The focused escaped suite passed 197 checks, Story 1.66's suite passed 3,891, and the complete API suite passed 4,451. ESLint, Prettier and whitespace checks passed.
- A second final review found that dense backslashes in a valid megabyte still exhausted the fixed work budget. The work budget now grows with input length and has an absolute ceiling. The fake HTTP regression includes alternating `a` and backslash across one megabyte. The focused escaped suite passed 199 checks.
- Post-review verification: all 20 GitHub Actions CI jobs passed on PR #312. Branch rebased cleanly onto origin/main following Story 1.56 merge (commit 96ad1fd2). Local focused suites passed: 199 uneven-escapes-only checks, 3,891 letter-cases-only checks, 4,453 evaluate-api checks, docs:validate-links, lint, lint:md, and format:check.

## Spec Change Log

## Review Triage Log

- Implementation self-check: the first escaped matcher also matched unescaped text and absorbed a combining dot that Story 1.66 leaves visible. The Story 1.66 focused suite caught two failures. The escaped path now contributes spans only when the matched text contains an escape; all 3,891 focused checks pass.
- Blind 1, Unicode fold equivalents: **high**. `scrub('Key-\\u00dc-\\u00f6-token', secretForms(['key-ü-ö-token']))` returns the raw echo. The escaped path must keep the literal matcher’s fold equivalence. Fix in this story.
- Blind 2, overlapping escaped match: **high**. Eight raw `ü` followed by `\\u00fc` leaves the escape after the raw span is redacted. The regex cursor skips the overlapping start. Fix in this story.
- Blind 3, regex backtracking: **medium**. A 16-backslash secret with a near-match took 517 ms locally, and the cost grows sharply with more backslashes. Remove ambiguous backtracking. Fix in this story.
- Blind 4, long-value scan: **medium**. The token walk restarts a long prefix at each candidate position, so a near-match can take quadratic work. Bound or remove that path before merge.
- Blind 5, raw fault properties: **false for the claimed evidence leak**. `faultRecord` records the sanitized `message` and `scrubbedCause`; its callers do not serialize raw `captured` or `cause`. Those raw properties existed before this story and remain inside the thrown error.
- Blind 6, exported cached matcher: **medium**. The new `matcherFor` export lets another caller mutate cached `forms` and bypass later scrubbing. Replace the export with a scalar inspection hook for the test.
- Edge 1, overlapping escaped match: **high**. Reproduced with the same eight-`ü` case as Blind 2. Fix with Blind 2.
- Edge 2, long-value scan: **medium**. The long token walker rechecks every candidate start in a repeated near-match. Fix with Blind 4.
- Verification gap 1, case expansion: **medium**. The new fake-port suite lacks a case-expanding secret, so dropping the `ß` to `SS` choice would survive its checks. Add an uneven escaped `straße` echo to the regression.
- Review repair outcome: Blind 1 to 4, Blind 6, Edge 1 and 2, and Verification gap 1 were patched and covered by the new fake-port, overlap, backslash near-match, long near-match, export and case-expansion assertions. Blind 5 was rejected on the `faultRecord` boundary evidence above. A fresh focused review remains the next gate.
- Final adversarial and contract review, ordinary escaped scan: **high**. A one-megabyte valid response with a single backslash and a common first letter used the work budget across the entire body and raised an infrastructure fault. Reproduced through the fake HTTP port. The escaped scan now considers only starts that can reach a backslash within the longest escaped form. A hostile long near-match with an escapable final letter still reaches the work limit. The focused and API suites pass; bounded rereview is pending.
- Final rereview, dense ordinary backslashes: **high**. Both reviewers reproduced a fake-port refusal for `'a\\'.repeat(524288)` with `admin-index-token`. The input-scaled capped work budget and fake-port regression repair it. Focused escaped checks pass.
- CodeRabbit review: nitpick comment regarding repeated escaped near-matches exhausting budget. Evaluated: intentional fail-closed ArmError on work limit exhaustion is covered by hostile long near-match regression, and ordinary responses with dense backslashes scale safely under budget. No further change needed.

## Design Notes

Retain the literal folded matcher for unescaped text. Build escaped alternatives per Unicode code point and per escape depth, including case expansions and final sigma, so the source size is proportional to the number of code points. Match spans against the original text to avoid changing evidence outside a secret.

## Verification

**Commands:**

- `npm run test:evaluate-api` -- expected: the focused regression and existing HTTP cases pass.
- `npm test` -- expected: the complete repository quality gate passes in the assigned host slot.
- `npm run docs:validate-links` and `npm run docs:build` -- expected: the reference remains valid.
- `npm run test:release-metadata` -- expected: release versions remain synchronized.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: engine export exists.
