# Test Design Editorial Fixtures

Hand-written before and after pairs for the Editorial Contract in `skills/bmad-tea-test-design/steps-c/step-05-generate-output.md`.
`test/test-test-design-editorial.js` reads them with the same parser the test-design scorer uses.

Each `before` file is a draft with filler, hedging and one overclaim.
Each `after` file is the same plan edited under the contract.
`cases.json` lists, per pair, the literals both files must carry, the wording the edit must add, and the filler it must remove.

## What the pairs show

| Pair | Condition, assertion or uncertainty | Before | After |
| --- | --- | --- | --- |
| epic | Duplicate refund assertion | "We will make sure that sending the same body ... returns `409`" | "Send ... twice with the same `Idempotency-Key`. Expect exactly one refund, and expect `409` from the second call." |
| epic | Ownership negative case | "It goes without saying that the request should be rejected" | "Request a refund for an order the customer does not own. Expect `403`, and expect no refund row." |
| epic | Unknown threshold | "the latency target for p95 is UNKNOWN at this time" | "The p95 latency target ... is UNKNOWN; the PRD states no number." |
| epic | Planned test | "this test is planned, not runnable" | "Planned. The threshold is UNKNOWN, so this test cannot run until the PM sets one" |
| architecture | Unconfirmed shared key | "as far as anyone knows, is shared across all tenants" | "appear to share one signing key ... The shared key is unconfirmed." |
| architecture | Blocker | "It would be really great if, at some point, the platform team could perhaps think about" | "Platform must provide a non-production signing key in the test environment." |
| qa | Overclaimed check | "We have verified that the worker can be killed" | "Planned: kill the worker ... then assert that `ls /exports/*.csv` returns nothing." |
| handoff | Risk references | "really need to be front and center" | "are the P0 risks. Every epic that touches exports carries them." |

## Limits

The pairs are written by hand.
They prove the contract's invariants can be checked and that the checks catch a broken edit.
They say nothing about how well a model follows the contract; that needs a separately run evaluation.
Parsed-field equality covers the scored fields only, so the review table above covers conditions, assertions and uncertainty.

## Provenance

The contract adapts writing principles from the MIT-licensed `technical-writing` and `unslop` skills in the `cursor/plugins` repository at commit `eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10`.
Its wording is TEA's own; no upstream text is copied.
Intentional differences: no banned-word or punctuation list, no one-document-per-mode split, no separate cleanup command, and a protected-content list that keeps test-design scoring structure intact.
