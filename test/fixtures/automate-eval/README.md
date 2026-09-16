# automate-eval fixtures

Fixture corpus for the `bmad-testarch-automate` behavioral suite: a fixed implementation, plus one qualified regression to measure generated coverage against.

```text
voucher-service/    a deterministic Node HTTP JSON service: voucher/discount redemption
qualification.json  the controlled-mutation qualification record for the seeded regression
evidence/            the live evidence baselinePassEvidence and mutatedFailEvidence point at
```

## What this corpus is for

Story 6.7 needs to measure whether `bmad-testarch-automate`'s generated tests catch a real, seeded regression. That needs two things nothing in this repository had before: a fixed implementation worth writing tests against, and a regression qualified under AD-9's `controlled-mutation` route with a real, live rollback proof. `voucher-service` is the first and `qualification.json` plus `test/test-automate-eval-fixture.js` are the second.

`tools/generate-probes.js` already carries six `controlled-mutation` records, and none of them could be reused as precedent for a live rollback: all six are permanent twin-file or twin-fixture-set pairs (a planted file beside its clean control), with no apply/revert machinery anywhere in `tools/` or `scripts/`. Their `rollbackVerified: true` is true by construction and asserted by comment. This corpus's mutation is a real, reversible edit to a real file, so its `rollbackVerified: true` is earned by `test/test-automate-eval-fixture.js` actually applying the mutation, observing the failure, reverting it, and observing the pass again, every run.

## The fixed implementation

`voucher-service` mirrors `test/fixtures/atdd-eval/reservations`'s shape (plain Node `http`, a `PORT` environment variable, JSON request and response bodies, `playwright.config.ts` for API-style testing, `package.json` with `engines.node >= 22`), so Story 6.7's stack auto-discovery routes it the way it already routes that fixture. It carries no test files of its own, the same way `reservations` did not at the point this corpus was built: generating tests against it is Story 6.7's job.

Four rules govern redemption, stated in `voucher-service/docs/stories/6-6-voucher-redemption.md` and enforced in `voucher-service/src/vouchers.js`: expiry, an inclusive minimum-spend boundary, percentage-vs-fixed discount computation, and a discount cap. Enough branches to be a meaningful coverage target without being large.

`test/test-automate-eval-fixture.js` also runs a minimal HTTP smoke check against `voucher-service/src/server.js` itself: it starts the real server as a child process and exercises `GET /health` and one accept case and one reject case of `POST /redeem`, so the HTTP routing, body parsing, and error handling carry automated coverage alongside the mutation cycle, which only calls `vouchers.js`'s `redeem()` function directly.

## The seeded regression

The mutation flips `vouchers.js`'s minimum-spend check from inclusive to exclusive: `cartTotal >= voucher.minimumSpend` becomes `cartTotal > voucher.minimumSpend`. A cart total exactly at the minimum is accepted before the mutation and wrongly rejected after it. That is a classic boundary off-by-one: a boundary-value test catches it, an interior-value-only test misses it, and that gap is what makes this regression a useful measurement of generated test quality.

## `targetArtifact` is digested at canonical, unmutated content

`qualification.json`'s `targetArtifact` names `voucher-service/src/vouchers.js` at its real, currently-committed digest. The mutation itself exists only inside `test/test-automate-eval-fixture.js`'s scratch copy, staged under `os.tmpdir()`; the tracked file is read once, to seed that copy, and never written.

This is a judgment call, stated here explicitly because no other fixture-level (non-probe-corpus) `controlled-mutation` record exists in this repository to confirm it against. A qualification record's `targetArtifact` describes what the mutation was applied to: the artifact's committed identity on disk. No file in this repository ever holds the mutated state.

## Rules for anyone editing this directory

- Editing `vouchers.js`'s behavior invalidates `qualification.json`'s `targetArtifact.digest` and both evidence digests. `npm run test:automate-eval-fixture` fails naming the stale digest; re-run it to regenerate `evidence/*.json`, then update `qualification.json`'s digests to match.
- Do not hand-edit `evidence/baseline-pass.json` or `evidence/mutated-fail.json`. Both are written by `test/test-automate-eval-fixture.js`'s live run, deterministically, so a normal run reproduces them byte-for-byte; a hand edit is indistinguishable from drift the next time the script runs.
- Do not set `rollbackVerified: true` by hand for a route this corpus adds. The whole point of this fixture is that the claim is checked live; a fixture whose regression cannot be reverted has nothing to qualify under `controlled-mutation` at all.
- This corpus does not depend on `test/fixtures/atdd-eval/` merging, and does not build `bmad-testarch-automate`'s own suite or manifest entry. Both are Story 6.7's.
