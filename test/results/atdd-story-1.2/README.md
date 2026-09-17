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
