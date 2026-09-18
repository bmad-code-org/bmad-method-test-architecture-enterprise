# Recorded `eval:all` runs

Evidence, not a cache. This directory holds what
`npm run eval:all -- --agent <runner> --json <path> && node tools/record-eval-run.js --from <path>`
actually measured, so a later reader can open a run and check it against the repository commit it was
taken at, the resolved runner and model, the contract and probe versions, and the measurements —
rather than trusting a green build from memory. `.gitignore` carries no entry for it: an ignored
directory would defeat the entire point of recording a run here.

`latest.json` is the most recently recorded run. `history/<timestamp>.json` is every run ever recorded,
one file per `tools/record-eval-run.js` invocation, named by the instant it ran.

Nothing here is generated from a source file and regenerated on demand the way `test/probes/` and
`test/contracts/` are. A stored run describes one real measurement at one real commit; overwriting it
would erase the thing it exists to prove happened, which is why `tools/record-eval-run.js` always adds
a new `history/` entry alongside replacing `latest.json` rather than only doing the latter.

The first complete Story 1.8 rerun is recorded in
`history/2026-09-18T13-23-35-961Z.json` and mirrored by `latest.json`. Claude transport and harness
failures left the affected quality measurements unmeasurable, so this record makes no quality-score
claim. The deterministic suites that completed remain recorded with their measured results.
