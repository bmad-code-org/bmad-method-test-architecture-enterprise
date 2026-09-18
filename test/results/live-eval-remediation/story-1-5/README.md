# Story 1.5 NFR Evidence

`pre-fix-diagnostics.json` classifies the committed 1.27.1 NFR baseline. The
aggregate result predates per-repetition diagnostics, so the four reports were
recovered from the local Claude session history that produced the aggregate and
scored through the unchanged NFR parser and scorer. Report digests bind each
classification to those recovered bytes. The 22 fabricated citations resolve to
5, 3, 6, and 8 findings across the two bundles and two repetitions. The same
reports expose one real but unsupported citation and instability in both cases.

`pre-fix.json` preserves the required focused rerun attempted before workflow
edits. Claude Code resolved to the same Sonnet model and runner version as the
baseline. All four calls exited with an environment transport failure before a
report was produced, so this record is evidence of runner unavailability and is
not a quality measurement.

`post-fix.json` preserves the comparable attempt after the workflow correction.
It used the same Claude runner, Sonnet model, two bundles, two repetitions,
fixtures, and thresholds. All four calls reached the same environment transport
failure, so the required post-fix quality thresholds remain unmeasurable.

`evidence-provenance.json` binds both focused records by digest and records the
disclosed Codex substitution. The substitute produced no case result after more
than 21 minutes and was terminated under the bounded timeout policy. It makes no
quality or comparability claim.

`post-fix-codex-low.json` records the completed low-reasoning Codex diagnostic
run. All four repetitions completed. It found project-directory-prefixed
citations in three runs, a requirements document used as implementation
evidence, ten clean false positives from undeclared checklist categories, and
different signatures for both cases. Those observations drove a second workflow
correction covering canonical paths, declared-criterion scope, evidence roles,
and deterministic ordering. This substitute uses a different runner and model,
so it remains diagnostic evidence outside the Claude comparability contract.

`post-fix-codex-low-rerun.json` records the completed rerun after that correction.
All four repetitions completed. The rerun isolated three remaining defects:
Threshold Source lines were parsed as implementation evidence, equivalent
project-root-prefixed and duplicate citations produced different grounding and
signatures, and one allowed moderate dependency finding lowered a clean security
domain below PASS. These observations drove the scorer canonicalization,
ground-truth-blind Threshold Source exclusion, and threshold-only status guidance.
The different runner and model keep this result outside the Claude comparability
contract.

`post-fix-codex-final.json` records the final completed diagnostic. Every content
quality metric passed and the clean bundle was stable. The gapped bundle remained
unstable because one repetition cited four grounded criteria while the other cited
thirteen, and each chose different free-form gap labels. This result drove the
criterion-bound ledger observations, complete criterion citation rule, exact
one-subsection rendering contract, and fixed structured gap messages. It remains
diagnostic evidence outside the Claude comparability contract.

`post-fix-codex-confirmation.json` records the completed confirmation after the
criterion-bound correction. All four repetitions completed, every declared
threshold passed, and both bundles produced stable scored signatures. The requested
Claude runner was unavailable under the exact quota response `You've hit your weekly
limit · resets Sep 22 at 3pm (America/Chicago)`. Following the disclosed runner
substitution precedent in Story 1.3, Codex with the repository-pinned `gpt-5.6-sol`
model supplied the final live evidence. The substitution preserves the bundles,
fixtures, repetition grid, and thresholds while changing the runner and model.

The protected baseline under `test/results/eval-all/` remains unchanged.
