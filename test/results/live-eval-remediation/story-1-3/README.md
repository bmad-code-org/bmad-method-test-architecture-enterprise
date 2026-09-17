# Story 1.3 Routing Evidence

These suite-result records preserve the before and after live evidence for Story 1.3.
The routing harness writes each JSON file directly through `writeSuiteResult`, which
validates the complete record before storing it. `evidence-provenance.json` records
the runner decision and the chronology around those captures.

- `pre-fix-routing-codex-abaa162.json` is a retrospective capture made after the first
  routing fix had been written. The run used a clean detached worktree at the last
  diagnostic-only commit, `abaa1622419b0bbd95a0a40b3899c888e3550581`, so the prompt
  contains the pre-fix routing instructions. It contains two repetitions of all eighteen
  cases and classifies every failed repetition. Its later capture time must not be read
  as an implementation chronology claim.
- `post-fix-routing-codex.json` is generated from the clean corrected implementation
  commit named by its repository provenance. It contains the same eighteen cases and two
  repetitions under the unchanged fixture, oracle, repetition count, and thresholds.

The remediation plan requested Claude with the resolved Sonnet model. The coordinator
confirmed that the Claude account had reached its weekly usage limit before this delivery
session and prohibited another Claude call. No Claude run was attempted here. Codex with
its repository-pinned `gpt-5.6-sol` model supplied both focused records. This substitution
preserves the corpus, thresholds, and repetition grid. It changes the runner and model, so
the focused records demonstrate the corrected behavior without claiming runner-level
comparability to the 1.27.1 Claude baseline.

The protected 1.27.1 aggregate baseline remains in `test/results/eval-all/`. These
focused records do not replace or rewrite it.
