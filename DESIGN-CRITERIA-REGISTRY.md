# Criteria registry, convention baseline, and the eval harness

Staged 2026-08-04, uncommitted. Motivated by couture-cast PR #103 (run 30929497408,
codex `gpt-5.6-luna`, reasoning effort low), which scored 82/100 `Request Changes`
while a parallel persona run scored 8.5/10 and said merge.

## What the #103 comparison actually exposed

The scores agreed. 85 and 82 is a 3-point spread on a 100-point ledger, which is
noise. The **verdicts** were opposite, and the verdict is what `--fail-on
request-changes` acts on.

Chasing that back through the workflow turned up four defects, two of them named in
the brief and two that were not.

| #   | Defect                                                                                                                                                     | Named in brief |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | Convention criteria fired unconditionally, so `Test IDs: none present` read identically in a repo with the convention and one that never used it           | yes            |
| 2   | Severity was prose taste in three of four workers, so two vendors could agree on a defect and disagree on its deduction                                    | yes            |
| 3   | **The recommendation was never derived from the findings.** The score was deterministic; the verdict beside it was a free-form pick from a four-value enum | no             |
| 4   | **No subagent defined a single `CRITICAL` row**, while aggregation counted them at −10 each and the report reserved a section for them                     | no             |

Defect 3 is why #103 split. Defect 4 means every critical finding to date, including
the three on `unit-test-coverage-bot` #25, was improvised. On #25 the improvisation
happened to be correct. That is not a rubric.

## What changed

### The registry is the single source of severity

`steps-c/criteria-registry.md` is new. Every criterion is a row with a firing
predicate, a fixed severity, and a gate. The workers no longer carry severity lists;
they carry the subset of rows they own. A defect matching no row is reported in prose
with no severity and no deduction, which keeps the ledger comparable across runs
instead of quietly absorbing invented tiers.

Three gate classes, because "condition everything on repo state" would have been the
wrong fix:

- **Absolute** — hard waits, conditional assertions, unreset shared state, oversize
  files, and every `CRITICAL` row. Repo adoption is irrelevant and must not be
  consulted. A repo where every test sleeps on a timer does not earn a waiver for
  hard waits; it earns the violation on every file.
- **Applicability** — the criterion applies when the reviewed file exercises what the
  criterion protects. Network-first cannot fire on a file that never navigates. This
  is a property of the file, decided by reading it, not a popularity measurement.
- **Convention** — scored against the baseline, on the fixed schedule in the
  registry: `established` deducts at the row's severity, `emerging` deducts one step
  lower floored at LOW, `absent` and `unknown` deduct nothing and publish
  `✅ PASS (n/a)` with the adoption count.

Network-first deliberately landed in **Applicability, not Convention**. Adoption was
5 of 19 in couture, so a convention gate would have demoted a genuine navigation race
to LOW on the grounds that the repo does not do it much. The risk does not care how
popular the fix is.

`Test IDs` was also reframed rather than conditioned. The real finding on #103 was
`#main-content` and the presentation text `+ Add Garment`, which is selector
resilience (L1). The spec's `getByRole` calls are the better practice, so the old
"no test IDs present" reading was scoring it down for doing the right thing. **A role-
or label-based locator now satisfies L1 outright.**

### The baseline is measured before it is judged against

`step-02-discover-tests` §2b samples the corpus **outside the review set** (a PR must
not establish or dilute the convention it is judged against), capped at 40 files
closest-first, and classifies each convention on a pinned threshold: `< 4` files is
`unknown`, `0` adopted is `absent`, `>= 50%` is `established`, otherwise `emerging`.
Unmeasurable means every Convention row passes as `n/a` and the report says so.
Inferring a convention from the reviewed files is circular and is forbidden.

### The recommendation is computed

`step-03f` §3b:

```javascript
if (CRITICAL > 0) return 'Block';
if (HIGH > 0) return 'Request Changes';
if (score < 70) return 'Request Changes';
if (MEDIUM + LOW > 0) return 'Approve with Comments';
return 'Approve';
```

A waiver still changes the exit code and never this value.

### Violations are deduplicated before counting

Some rows are detectable by more than one worker (M4 by isolation and
maintainability, H5 by maintainability and performance). Identity is
`(file, line, row)`, never the prose description, which differs between workers
describing the same line.

### Contradictions removed between workers

Each of these produced a different number for identical code depending on which
worker saw it:

- `waitForTimeout` was MEDIUM in determinism **and** MEDIUM in performance, while the
  published criteria table called Hard Waits a `❌ FAIL`. One timer deducted twice. It
  is H1, HIGH, owned by determinism alone.
- Shared state was LOW in determinism and HIGH in isolation. It is H4, isolation's.
- Test order dependency was MEDIUM in determinism and HIGH in isolation. Also H4.
- The maintainability worker deducted HIGH for "tests >100 lines" against a published
  criterion of `Test Length (≤500 lines)`. One threshold now: H5 at 500.
- The performance worker deducted for "slow setup/teardown (creating fresh DB for
  every test)" and for `describe.serial`. Both punish correct isolation, and the
  second contradicts the pact rules in the determinism worker that **require**
  serialization. Removed.
- `Date.now()` was an unconditional HIGH, firing on any test that stamped a timestamp
  nothing depended on. H2 gates it on governing an expiry, lifetime, TTL, or
  scheduling boundary.

Unfalsifiable rows were deleted rather than reworded: "could benefit from helper
functions", "minor inefficiencies", "missing performance optimizations", "tests that
could be more isolated", "tests sharing test data (but not mutating)". A row that
always fires carries no information, and one that fires on taste cannot be reproduced.

### The eval harness

`test/eval-test-review.js`, `npm run eval:test-review`, fixtures under
`test/fixtures/test-review-eval/`. Reports per vendor:

- **recall** — planted defects named, matched on registry row within a 4-line
  tolerance. Row matching is what makes vendors comparable; prose descriptions differ.
- **CRITICAL recall** — thresholded at 100%. A missed `.skip` is the whole failure mode.
- **precision** — computed from violations against the clean fixture only.
- **score variance** — stdev across repeated runs of identical input, plus whether the
  verdict itself was stable. This is the number nobody had, and no amount of comparing
  two reviews by eye produces it.

Two design calls worth knowing:

- Findings on a seeded fixture that match no planted row are reported as
  **unattributed**, not as false positives. A fixture can carry an incidental real
  defect the manifest failed to anticipate, and punishing the reviewer for being right
  would train the harness toward silence.
- Murat's original seeded-PR design listed "an implementation change with no test"
  among the planted defects. For **this** workflow, finding that is a scope violation,
  not a hit: coverage belongs to `trace`. It is recorded in `ground-truth.json` as a
  negative control.

The bounded pre-flight is not optional and it runs first: for a skill the environment
is repo state plus tool availability. Without it a missing `OPENAI_API_KEY` reports as
0% recall and reads as "the reviewer found nothing", which is the most expensive
possible way to be wrong about your own tool. A failed pre-flight is exit 2 and
measures nothing.

## Verification run

- `npm test` — exit 0 (schemas, install, knowledge, release metadata, workflow
  descriptions, eslint, markdownlint, prettier).
- `npm run test:cli` — see the run below; 416/0 before the workflow edits.
- `node test/eval-test-review.js --preflight-only` — exit 2 with no credential naming
  the missing variable, exit 0 with one. Fixture paths and every ground-truth line
  number validated against the files.
- **Not run: a live end-to-end eval.** That needs a real vendor credential and a paid
  agent run. The harness is proven to load, validate, and gate; it has not yet
  produced a recall number. Do not quote one until it has.

## The CLI now enforces the derived recommendation — approved, shipped

`parse-report.js` gained `deriveRecommendation(violations, qualityScore)`, and
`parseReport` publishes the derived value while preserving the agent's own as
`reportedRecommendation` when the two differ. Same treatment the score already got,
so the substitution is visible rather than silent, and `test-review.js` logs it with
the counts that forced it.

The pre-existing hard guard on `Critical + Approve` stays: that combination is still
`REPORT_UNPARSEABLE` rather than being normalized, because an internally
contradictory report is evidence the run itself was unreliable.

**What it cost, which was more than the code.** Eight fixtures encoded states the
derived rule makes illegal, every one of them a report carrying HIGH violations beside
a non-blocking recommendation. `approve-low-score.md` was the clearest: 12 HIGH
violations, recommendation `Approve`, and a summary line reading _"The score reflects
the risk; the recommendation does not."_ The bug, written down as intent.

Each fixture was retuned to be internally consistent while preserving its purpose and
its published score, so the surrounding assertions still hold:

| Fixture                          | Was                    | Now                                    | Purpose preserved                                                                |
| -------------------------------- | ---------------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| `approve.md`                     | 1 HIGH, `Approve`, 93  | 0 HIGH, `Approve with Comments`, 93    | the report that passes the gate                                                  |
| `approve-low-score.md`           | 12 HIGH, `Approve`, 40 | 15 MEDIUM, `Approve with Comments`, 70 | the `--min-score` floor, now also pinning that 70 does **not** trip `score < 70` |
| `plain-bullets-key-strengths.md` | 1 HIGH, 98             | 0 HIGH, 98                             | bullet parsing                                                                   |
| `wrapped-steps-flow.md`          | 2 HIGH, 83             | 7 MEDIUM, 83                           | wrapped YAML frontmatter                                                         |
| `colon-in-bold.md`               | 2 HIGH, `Approve`, 90  | 5 MEDIUM, `Approve with Comments`, 90  | the `**Recommendation:**` label form                                             |
| `lowercase.md`                   | `approve`              | `approve with comments`                | enum case normalization, now on a multi-word value                               |
| `score-mismatch.md`              | 2 HIGH, 86             | 7 MEDIUM, 86                           | the score-arithmetic mismatch path                                               |

`approve-with-high.md` is the old `approve.md` verbatim, kept as the regression test
for the #103 shape: 1 HIGH with `Approve` normalizes to `Request Changes`, preserves
`reportedRecommendation: 'Approve'`, and `verdictFor` fails the gate on the derived
value. `deriveRecommendation` also has direct boundary tests at every branch.

## Two consequences of the Critical escalation, both needing a ruling

**1. `--max-critical` can no longer widen the gate.** Any Critical derives `Block`,
and `Block` fails at every `--fail-on` level, so no cap lets a Critical finding pass.
The input can tighten and never loosen, which makes it effectively redundant. Its
boundary test used to assert the opposite (`--max-critical 1` + `--fail-on block` =
exit 0 with 1 Critical) and now asserts the new truth.

I think this is the right direction: a Critical row means the test cannot fail or never
reaches the system under test, and a knob that waves that through is the hole the
rubric exists to close. `--waive` remains the escape hatch, and it is recorded in the
verdict with a reason and an expiry rather than being invisible config. But it does
leave a documented input unable to do what its name suggests.

**2. A repo on `--fail-on block` loses its softer gate for Criticals.** Previously a
Critical finding passed there. It no longer does.

**SETTLED 2026-08-04: Critical stays at `Block`, both consequences accepted.** Do not
reopen this by proposing a `Request Changes` cap or a `max-critical` escape. The most
severe tier now carries its own consequence instead of depending on what `--fail-on`
grants it, and `--waive` is the only way past a Critical: recorded in the verdict, with
a reason and an expiry, rather than invisible in a workflow file.

## One more ruling I did not take

**Should `H1` really be HIGH?**

It was effectively MEDIUM everywhere while being presented as a headline `FAIL`
criterion. I resolved the contradiction toward the published table, which raises the
deduction for a hard wait from 2 to 5 and will lower scores on existing suites that
carry them. Defensible, and still a scoring change on live repos rather than a pure
variance fix.

## Estimated effect on #103

Under the registry: 1 HIGH (H2 wall-clock expiry), 4 MEDIUM (M1 network-first, M2
repeated literals, M4 ungrouped contract suite, M5 fireEvent), 2 LOW (L1 fragile
selector, L2 missing priority marker, `established` at 11 of 19) → **85/100, Request
Changes** on `HIGH > 0`.

The score lands on the persona run's 85 and the verdict stays where the codex run put
it. Treat that as a sanity check on the arithmetic, not as validation: one hand-worked
example is not a measurement, which is what the harness is for.

## 2026-08-10: the baseline was never actually being measured

Motivated by couture-cast PR #106 (comment 5234513259, `tea-test-review.yml`,
`--agent codex`), which fired four LOW `Priority Markers` violations citing
`Convention: priorityMarkers (18 of 40 sampled)`. `grep -rlniE "['"@]P[0-3]['"@ :.]"`
across the entire target repo found zero real matches — one incidental hit, a `'p1'`
silhouette-profile-ID fixture, nothing that is actually a priority tag. The installed
`test-quality.md` knowledge fragment the report cited as its criteria source doesn't
mention "priority" at all. The codex run invented a plausible, specific fraction for a
convention that has never once been used in that repository.

§2b above already designed against exactly this — sample the corpus outside the
review set, cap at 40, record `corpusSize`/`sampled`, fall back to
`baselineUnavailable: true` when nothing can be measured, "guessing a convention is
worse than admitting it wasn't measured" — but the design lived entirely in prose the
agent was trusted to follow. Nothing forced the sampling to be a real Glob/Grep
instead of a number that merely sounded right, and nothing downstream ever checked
the claim: not one report fixture in this repo's own `test/fixtures/test-review-cli/`
suite even included a `**Convention Baseline**:` line, and `parse-report.js` had no
code path that looked for one.

Same fix as the score and the recommendation before it: stop trusting the agent to
compute a number the CLI can compute itself. `cli/lib/convention-baseline.js` now
performs §2b's sampling deterministically — `git ls-files`, the review set excluded,
ranked closest-first by directory distance, capped at 40 — and, for the five keys
with a literal recognized form (`priorityMarkers`, `testIds`, `networkFirst`,
`dataFactories`, `fixtures`), scans the real sampled files for it. `bddNaming` and
`assertionStyle` get no mechanical signal (no single token separates "adopted" from
"not" for a naming style or a dialect choice) and stay agent-judged; the
sampled/corpusSize grounding still applies to them.

The result travels into the prompt as a fixed fact, the same way the review set
already does, and `parse-report.js`'s `verifyConventionBaseline` binds every
`Convention: <key> (<adopted> of <sampled> sampled)` citation and the
`**Convention Baseline**:` line to it, one direction strictly (the sampled/corpusSize
counts must match exactly — they're 100% mechanical) and one direction only
downward (a citation claiming nonzero adoption for a key the CLI's own scan found
zero real occurrences of anywhere in the sampled corpus is rejected outright; a lower
or judgment-based count is left alone, because a regex cannot know intent and was
never used to force a number up). Applied to #106's actual corpus, this scan finds
zero `priorityMarkers` signal too — the same zero grep found — so the fabricated
`(18 of 40 sampled)` citation would now fail closed (exit 3) instead of reaching a PR
comment. `test/test-test-review-cli.js` Test Suite 11 and the git-fixture additions to
Suite 8 reproduce this end-to-end against a real temp git repo built to the same
shape (real neighbor test files, zero real priority markers anywhere).

Not fixed here, and worth naming: the "seven keys" §2b measures don't map onto the
registry's Convention gate class evenly. Only three published criteria are actually
Convention-gated (`priorityMarkers` → L2, `testIds` → L3, `bddNaming` → L5);
`networkFirst`/`dataFactories`/`fixtures` deliberately became Applicability-gated
instead (see "The baseline is measured before it is judged against" above —
popularity shouldn't demote a navigation race), and `assertionStyle` → L7 has no
published report-table row at all. That's an intentional design choice for the first
three, not the fabrication bug, so `convention-baseline.js` still grounds all seven
uniformly (future-proofing, and Notes prose can cite any of them), but the deduction
schedule only reads three of the seven back.

## 2026-08-10, same day: the summary line was never checked against the findings either

Auditing the fix above for the same class of defect elsewhere turned up a second one,
worse in effect: `parse-report.js` never read `## Critical Issues (Must Fix)` or
`## Recommendations (Should Fix)` at all. It trusted the agent's own
`**Total Violations**:` summary line and nothing else. Reproduced directly: a report
can document a real, row-cited Critical finding (`.skip` on a whole suite, `**Row**:
C1`, a location, a description) in full prose, and if the line beside it says
`0 Critical, 0 High, 0 Medium, 0 Low`, the CLI computes **Approve, 100/100** — the
documented finding is invisible to the gate that's supposed to act on it. Unlike the
convention-baseline defect this is a Block-vs-Approve flip, not a false LOW.

`lib/registry-rows.js` (new) reads `criteria-registry.md`'s row → severity map
straight from the skill, and `parse-report.js`'s `verifyFindingSeverityCounts` counts
the finding blocks actually documented and binds them to the summary line: the number
of Critical findings must equal the Total Violations Critical count exactly, the
number of P1 (High) findings under Recommendations must equal the High count exactly,
and every cited `**Row**: <id>` must be a real row whose registry severity matches the
finding's own declared Severity (severity is read from the row, never chosen — the
registry's own rule 1, previously unenforced downstream).

Scoped to Critical and High only, deliberately. `deriveRecommendation` only acts on
those two (`critical > 0` → Block, `high > 0` → Request Changes); Medium/Low only ever
add "Approve with Comments" regardless of count, so a miscount there doesn't flip a
merge decision the way this one does. The scope decision also had a practical forcing
function: doing this for all four severities meant rewriting every fixture in this
suite that declares a nonzero Medium/Low count with matching finding-detail blocks,
a much larger and lower-value change for the two severities that were never the risk.

Fifteen of the pre-existing report fixtures under `test/fixtures/test-review-cli/reports/`
declared nonzero Critical/High counts with no finding section behind them at all
(minimal fixtures, written before this check existed, testing other parser behavior).
Each now carries the minimum real content the check requires — `### N. Title`,
`**Severity**:`, `**Row**:`, nothing else — so their pre-existing assertions (which
depend on the exact declared counts, verified individually before touching any of
them) stay intact. Two fixtures needed no change: `fenced-recommendation.md`'s
apparent 9/9 was inside its own fenced decoy example and the real (fence-stripped)
count was already 0/0; `critical-approve.md`'s Critical-with-Approve combination
already throws via the pre-existing inconsistent-verdict check, before this one ever
runs.
