# Confirmed intake: test review

Confirmed by the fixture owner on 2026-09-28.

- **What must be proven:** The command flags tests without assertions and
  disabled tests. It leaves active tests with valid assertions clean. False
  positives against valid assertions are material; missed findings are material.
- **Admissible evidence:** Exit code and parsed JSON stdout, including the
  `status`, finding codes, and reviewed file path. Status and findings must agree.
- **Interfaces and resources:** `node bin/review.mjs` accepts one JSON stdin
  request shaped as `{ "action": "review", "file": "cases/example.test.js" }`.
  It may read only fixture test files and `rules/review.json`. No network or
  model call.
- **Boundaries:** `assert.strictEqual`, `assert.match`, and `expect(...).toBe`
  count as assertions. A file with no recognized assertion is defective.
  `test.skip` or `it.skip` marks a disabled test. Absent input, invalid JSON,
  a missing or non-string `file`, a missing or different `action`, extra
  request fields, and unreadable files return a structured error with exit 0.
- **Operations:** Three trials per probe are sufficient for this deterministic
  command. No secrets are required.
- **Feared failures:** A valid unusual assertion is flagged, every test is
  flagged, and a no-assertion test is reported clean. Seed adopter-owned rule
  changes.
- **Held-out evidence:** Use the same test file inputs in development and
  held-out runs. Keep distinct mutation and probe patterns private until
  held-out scoring. Development records must contain no held-out-only input.
