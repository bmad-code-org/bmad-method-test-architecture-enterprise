# Inspection record: JSON stdin test review

## Target and scope

The adopter-owned target is `target/bin/review.mjs` and `target/rules/review.json`. It is a test-review mechanism reached as a CLI command. Evaluation ID: `test-review-json-stdin`.

## Entry point and transport

`node bin/review.mjs` runs from `target/`. It reads all stdin bytes, parses one JSON value, validates exactly `action: "review"` and a string `file`, reads that fixture, then prints one JSON object on stdout. The command uses exit 0 for reviewed and error responses. No environment keys, model, or network calls are used.

## Behaviors and sources

| ID | Source | Observable promise | Importance |
| --- | --- | --- | --- |
| B-001 | `target/bin/review.mjs`, `target/rules/review.json`, confirmed intake | No recognized assertion yields `missing-assertion` | critical |
| B-002 | Same sources | `test.skip` or `it.skip` yields `disabled-test` | material |
| B-003 | Same sources | Recognized active assertions remain clean | material |
| B-004 | `target/bin/review.mjs`, target description and intake | Invalid stdin, invalid request shape, and unreadable file return structured error | material |

## Observation surfaces

All behaviors expose exit code 0 and JSON stdout. Reviewed files expose `file`, `status`, and `findings`; malformed requests expose `error`. These stdout fields are the descriptor-nominated mutation signature channel. Stderr is not an expected evidence channel. No target files are written.

## Existing test fixtures and limits

Eight fixture files cover `strictEqual`, `match`, `toBe`, `test.skip`, `it.skip`, missing assertion, dangling `expect`, and `assert.ok`. The fixture text itself has no executable review assertions. `assert.ok` is outside the three recognized forms in the confirmed intake, so this command reports `missing-assertion` for it. The suite must check false positives with clean fixtures and missed findings with defective fixtures.

## Observed command examples

Read-only invocations returned: missing assertion as `findings/[missing-assertion]`, disabled test as `findings/[disabled-test]`, valid `assert.match` and `toBe` as `clean/[]`, and `assert.ok` as `findings/[missing-assertion]`. Empty stdin and `{` returned `invalid JSON`; a numeric file and an extra field returned the shape error. Every observed example exited 0.

## Failure history and corpus consequence

The confirmed intake names plausible failures; it provides no incident record. Seed each named rule failure in an adopter-owned file, keep clean controls, and use distinct held-out mutation patterns for the same fixture inputs.
