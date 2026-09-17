# Story 1.2 ATDD evidence

This directory preserves the evidence used to remediate Story 1.2.

`pre-change-diagnostics.json` binds the two reconstructed repetition diagnostics to the protected
1.27.1 live result by commit and SHA-256 digest. Its replay links are deterministic witnesses for
the observed failure classes. They are diagnostic reproductions, not replacements for the live
record.

`post-fix-codex-990c1018a168ec5cba46dea5eee6501cbcda54a4.json` is the immutable live
measurement of clean commit `990c1018a168ec5cba46dea5eee6501cbcda54a4`. Both repetitions completed.
Criteria coverage reached 1, while intended-reason rate was 0.8263888888888888, non-assertion
exits were 3, and unstable cases were 1. The result is a valid quality failure and preserves the
remaining Story 1.2 gap truthfully.

`post-fix-codex-9c364ae984d3d3496bab27da8fea21674d751899.json` is the immutable live
measurement after the direct API assertion fix and Story 1.1 integration. Both repetitions
completed. Criteria coverage reached 1 and intended-reason rate improved to 0.9444444444444444.
One secondary AC-5 available-state scaffold still produced a non-assertion exit, which also left
one unstable case. The result confirms that red-phase secondary branches must wait until the
criterion's transition-bearing primary scaffold turns green.

`post-fix-codex-efd992e037f1c83cf7fca7d6885642ebccb0b943.json` is the immutable live
acceptance measurement of clean commit `efd992e037f1c83cf7fca7d6885642ebccb0b943`. Both
repetitions completed with identical signatures. Intended-reason rate and criteria coverage both
reached 1. Vacuous passes, still-skipped tests, non-assertion exits, load errors, unmapped tests,
production mutations, unstable cases, and incomplete cases were all 0. Every Story 1.2 live
threshold passed.
