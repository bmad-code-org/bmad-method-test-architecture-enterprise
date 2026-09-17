# Story 1.3 Routing Evidence

These suite-result records preserve the before and after live evidence for Story 1.3.
The routing harness writes each JSON file directly through `writeSuiteResult`, which
validates the complete record before storing it.

- `pre-fix-routing-codex-abaa162.json` was generated from the clean detached worktree at
  commit `abaa1622419b0bbd95a0a40b3899c888e3550581`. It contains two repetitions of all
  eighteen routing cases, including every ambiguous case and the harness's root-cause
  classification for each failed repetition.
- `post-fix-routing-codex.json` is generated after the corrected implementation commit.
  Its repository provenance names that commit, and every declared suite threshold must
  pass.

The protected 1.27.1 aggregate baseline remains in `test/results/eval-all/`. These
focused records do not replace or rewrite it.
