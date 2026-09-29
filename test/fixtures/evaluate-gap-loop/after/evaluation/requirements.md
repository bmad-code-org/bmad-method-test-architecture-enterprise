# Requirements statement: JSON stdin test review

## What must be proven

The command flags a test with no recognized active assertion with `missing-assertion` (B-001, critical). It flags a disabled test with `disabled-test` (B-002, material). It leaves active tests using `assert.strictEqual`, `assert.match`, or `expect(...).toBe` clean (B-003, material). False positives against recognized valid assertions and missed findings are material. It returns a structured error for invalid requests and unreadable files (B-004, material).

## Admissible evidence

Use exit code and parsed JSON stdout. A reviewed file response must carry its requested `file`, a `status` of `findings` exactly when its `findings` array is nonempty, and the exact finding codes. A clean response has an empty findings array. An invalid request returns an `error` JSON object and exit 0.

## Interfaces and resources in scope

Run `node bin/review.mjs` with one JSON request on stdin: `{ "action": "review", "file": "cases/example.test.js" }`. The process may read only fixture test files and `rules/review.json`. It makes no network or model call. The working directory is the copied target root.

## Boundary conditions

The recognized assertions are `assert.strictEqual`, `assert.match`, and `expect(...).toBe`. The disabled markers are `test.skip` and `it.skip`. An unrecognized assertion form and a dangling `expect(...)` call receive `missing-assertion` under this command's stated rule set. Empty stdin, invalid JSON, missing or wrong `action`, missing or non-string `file`, extra request fields, and an unreadable file return structured errors with exit 0.

## Operational constraints

Use three trials per probe in disposable copies. No secrets are required. Keep the command, rules, and fixtures fixed across clean and mutated arms except for each named adopter-owned mutation.

## Feared or observed failure modes

A valid unusual assertion is flagged, every test is flagged, a no-assertion test is reported clean, a disabled test is missed, or an invalid request is accepted. Seed controlled changes to adopter-owned rules or implementation. Use the same fixture test file inputs in development and held-out runs, with distinct held-out mutation patterns. Withhold held-out probe contents and records from the development gap stage.

Confirmed by: fixture owner, 2026-09-28, in `target/intake-answers.md`.
