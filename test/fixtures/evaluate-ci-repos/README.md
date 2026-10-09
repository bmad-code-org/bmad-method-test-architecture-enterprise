# Evaluate CI session snapshots

`captured-evaluate-skill.md` preserves the exact Evaluate `SKILL.md` bytes read by the tagged-release and nightly-deploy live sessions. Their `capture-record.json` files retain the original digests and prompts. The guidance gate checks this snapshot against both recorded digests, so later changes to the current skill keep the captured evidence verifiable.

`captured-evaluate-skill.provenance.json` records the source commit, repository path, session-read key, and snapshot digest. Current Evaluate CI handoff instructions are checked separately by `test/test-evaluate-guidance.js`.

`captured-evaluate-ci.md` preserves the exact `references/ci.md` input for the same sessions. Its provenance file records the original source commit, path, read key, and digest. The CI capture guard compares both preserved inputs to the immutable capture records and rejects changed snapshot bytes. The unchanged CI plan template remains checked against its recorded input digest.
