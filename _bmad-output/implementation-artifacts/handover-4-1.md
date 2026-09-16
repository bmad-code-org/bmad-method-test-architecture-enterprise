# Handover: Story 4.1, "Hold every published count against its source"

Written cold, for whoever picks this up next. The fleet that was running this is
retiring; this file and the branch are what survive it.

## Story and branch

- Story text: `_bmad-output/planning-artifacts/epics.md`, `### Story 4.1`. Its checklist
  line is in the Epic 4 progress table near the top of the file, currently unticked.
- Branch: `feat/hold-published-counts`, created off `origin/main` at `f3526f9`
  (`git checkout -b feat/hold-published-counts origin/main`).
- State right now: **no code changes**. Everything below is investigation, verified
  against the tree, not yet turned into a config or a source file. This document is
  the branch's only commit.

## The blocker, and why nothing is built yet

Story 4.1 needs `eval-quality-gates doc-counts`, which ships in `eval-quality` 3.2.0.
TEA's `package.json` still pins **3.1.0** as of `f3526f9`. Confirmed directly:

```
node -e "console.log(require('eval-quality/package.json').version)"   # 3.1.0
node node_modules/.bin/eval-quality-gates --help                        # lists lockfile-age,
                                                                          # licences, dependency-direction,
                                                                          # package-boundary, field-ownership.
                                                                          # No doc-counts, doc-claims,
                                                                          # doc-invocations.
```

`eval-quality.config.json` does not exist at TEA's root either.

**I was told both already existed, and they don't. Do not re-trust that premise without
checking again.** The coordinator running this fleet told three workers (including this
session) that the pin had moved to 3.2.0 and the config file already existed "from
Story 4.6." Neither was true on `main` at the time. The actual owner is PR **#180**
("Story 4.6: Hold the supply chain"), still open as of this writing, whose diff adds
`eval-quality.config.json` at the root (plus two test fixtures) and bumps the pin. I
verified this by reading `gh pr view 180 --json files` and `gh pr diff 180`, not by
trusting the description. The coordinator confirmed the correction after I raised it
and told me explicitly: **do not bump the pin yourself, do not create the config file
yourself.** I had already edited `package.json` to 3.2.0 before the correction landed;
I reverted it and `git diff package.json` is clean. Check `git status` on this branch
before doing anything if you're not sure what state it's in — it should be empty.

**Next action, in order:**

1. Confirm `#180` has merged: `gh pr view 180 --json state,mergedAt`. If it hasn't,
   don't touch `eval-quality.config.json` or `package.json`'s pin — wait, or ask
   whoever is coordinating now.
2. Once merged: `git fetch origin && git rebase origin/main` on this branch (or start a
   fresh branch off the new `main` if this one has diverged awkwardly — it currently
   has nothing to conflict, so either works).
3. `npm install` and confirm `require('eval-quality/package.json').version` reads
   `3.2.0` and `eval-quality-gates --help` lists `doc-counts`.
4. Confirm `eval-quality.config.json` exists at the repo root. Your first commit adds
   **only** a `doc-counts` section to it — do not recreate the file.
5. Read the handover note below before writing any config. It has the section shape,
   the traps, and the failure messages you'll otherwise rediscover by trial and error.

## The handover note — read this before configuring anything

`/Users/murat/opensource/_wt/eq-s21/_bmad-output/implementation-artifacts/consumer-adoption-doc-gates.md`
on branch `docs/consumer-adoption-doc-gates`, commit `0f26cbc`, in the **eval-quality**
worktree (a different repository from this one — read it with `git -C
/Users/murat/opensource/_wt/eq-s21 show 0f26cbc:_bmad-output/implementation-artifacts/consumer-adoption-doc-gates.md`
if that worktree has moved off the branch by the time you look). It's written by the
worker who built the gate, for a consumer who has never read `eval-quality`'s own
source. Highlights, so you don't have to re-derive them:

- Every count that isn't a literal is a **module value**: `{ "module": "<path>",
  "export": "<name>", "take": "value"|"length"|"keys" }`. `take` defaults to `"value"`
  and a list read with the default refuses with a specific message telling you to use
  `"length"` — this is "the first mistake every consumer makes once," per the note
  itself. Write `"take": "length"` explicitly for anything that's an array.
- The config section is `doc-counts` → `sources` (named, by kind: `module`, `json`,
  `files`, `matches`) and `entries` (one per held sentence: `file`, `claim`, `pattern`
  with one capture group per number, `counts` naming which sources fill the groups in
  order, optional `wrap: true` for a sentence that may line-wrap).
- A pattern matching zero or more-than-one sentence refuses. A declared source no entry
  uses refuses at load. `g`/`y` regex flags and backreferences both refuse at load.
- `eval-quality` derives its own doc-counts numbers through two small files with no
  dependency on the gate machinery, `scripts/doc-count-sources.ts` /
  `doc-claim-sources.ts` — "worth copying the shape rather than the content." The
  pattern worth copying: **a guard that throws at module load** if a computed number
  disagrees with something else that should agree with it (the note's example: a
  generated manifest against the fixture array that built it). A `module-value` read
  that throws on import is reported by the gate as a refusal naming the module, so a
  silently wrong number never reaches the page comparison.

## The count inventory

I enumerated what TEA publishes counts about by scanning `docs/`, `README.md`,
`CONTRIBUTING.md`, `test/README.md`, `test/contracts/README.md`, and
`test/probes/README.md` for number-plus-noun patterns, then hand-filtering the noise
(plain prose like "two layers," "three levels of nesting" is not a held count — nothing
in the repository computes those, and holding them against a source would be
decoration, not coverage, the same judgment Story 4.4 made about which registries to
route through its accessor). What follows is verified against the tree, not
transcribed from the docs.

### The story's own cited example — build this first

`docs/explanation/eval-quality-roadmap.md:30`:

> It runs 48 fragment selections, 36 routing intents, 4 complete test designs, 3
> complete reviews, 4 complete audits, and 4 complete traces for one runner.

This is Story 4.1's own AC2 target (cited verbatim in the acceptance criteria), so it's
the one entry the story is explicitly asking for. All six numbers derive from
`test/evals/suite-manifest.json`'s per-suite `caseCount` plus each harness's own
default `runs`, but **not by one uniform formula** — this is the trap I'd have walked
into if I'd configured it from the sentence alone without reading the harnesses:

| Sentence phrase | Suite id | caseCount | default runs | Formula | Value |
|---|---|---|---|---|---|
| 48 fragment selections | `fragment-selection` | 24 | 2 | cases × runs | 48 |
| 36 routing intents | `bmad-tea-routing` | 18 | 2 | cases × runs | 36 |
| 4 complete test designs | `test-design` | 2 | 2 | cases × runs | 4 |
| 3 complete reviews | `test-review` | 3 | 3 | **runs alone** | 3 |
| 4 complete audits | `nfr` | 2 | 2 | cases × runs | 4 |
| 4 complete traces | `trace` | 2 | 2 | cases × runs | 4 |

`test-review` is the odd one. Its harness (`test/eval-test-review.js`) has no per-case
loop in `main()` — `runReview(agent, runIndex, options)` is called once per repetition
and reviews the whole corpus (three files: two seeded, one clean) in that one call, so
"3 complete reviews" means three repetitions of one whole-corpus review, not
`caseCount × runs`. The other five suites do loop per-case-then-per-run internally
(confirmed by reading each harness's `main()`), so their number really is the product.
Default `runs` per harness, if you need to re-verify: `grep -n "let runs = " test/eval-*.js`.
`caseCount` per suite: `python3 -c "import json; [print(s['id'], s['caseCount']) for s in json.load(open('test/evals/suite-manifest.json'))['suites']]"`.

Building this entry needs a `module` source per number (six of them, or five plus one
that reads `runs` alone for `test-review`) pointed at a small new file — I'd suggest
`test/lib/doc-count-sources.js`, matching the name `eval-quality` uses for its own —
that imports `suite-manifest.json` and each harness's exported default-runs constant
(none of the harnesses currently export their default `runs` as a named constant; you
may need to add one, or read it by parsing the `let runs = N` literal out of the
harness's own source at load time and throwing if it can't find it, which is exactly
the "guard that throws at load" pattern the handover note recommends — a parse that
silently returns `undefined` would be worse than the literal it replaces).

### Verified, currently correct — safe to hold as-is

- **`README.md:11,53,165,186`, "nine workflows"** — `ls -d src/workflows/testarch/*/ | wc -l` = 9. Currently accurate.
- **Ten skills (`docs/explanation/eval-quality-adoption-guide.md:10,29`)** — nine workflows plus the `bmad-tea` agent; `tail -n +2 src/module-help.csv | wc -l` = 10. Accurate.
- **`README.md:47,215,335`, "59 knowledge fragments," "24 core / 19 extended" (16 specialized, unstated in the digit but present)** — verified against `src/workflows/testarch/bmad-testarch-test-review/resources/tea-index.csv` (every workflow ships an identical copy; any one will do): 59 total rows, tier counts `{core: 24, extended: 19, specialized: 16}` via `csv.DictReader` + `collections.Counter`. Accurate today. Good `doc-counts` candidate: a `module` source reading the CSV's row count and a per-tier filter — though the CSV needs a tiny reader module since `doc-counts`'s `json` source kind is for JSON, not CSV; write `test/lib/doc-count-sources.js` to parse it once and export the four numbers.
- **`README.md:399,401`, "24 fragment-selection cases"; adoption guide's "24 cases across the eight workflow skills"** — matches `suite-manifest.json`'s `fragment-selection` entry's `caseCount: 24` directly, and `9 workflows - 1 (bmad-teach-me-testing, "has no suite of any kind") = 8`. Accurate, and the easiest of all these to hold: a straight `json` source over `suite-manifest.json` with `path: ["suites", <index>, "caseCount"]` — no module needed at all for this one.

### Verified, currently stale — found while building this inventory

I did not fix these by hand. Story 4.1's whole point is that a hand fix here is
temporary; whoever builds the gate should let the `entries` refusal catch them once,
confirm the refusal message names the right sentence, then correct the page text as
part of adding the entry — that's the proof the gate actually works, the same
prove-it-by-reverting discipline every check in Story 4.4 used.

- **`README.md:395`**: "`npm test` chains thirty-three checks." Actual, verified by
  running the tool that's supposed to be the source of truth for this exact sentence:
  `npm run test:ci-coverage` prints `all 35 npm test chain step(s) are defined and run
  in CI`. **33 → 35.** This is the best possible first `doc-counts` entry beyond the
  roadmap sentence: the source already exists and already computes and prints this
  number every run (`tools/validate-ci-coverage.js`); it just isn't held against the
  README sentence yet. Whatever that tool reads to get its count is exactly the
  `module` source to configure.
- **`docs/explanation/eval-quality-adoption-guide.md:27,227,234,288`**: "70 stored
  outputs... 3 selections, 10 verdicts, 14 trace pairs, 15 nfr reports, 11 test-design
  documents, 17 replies." Actual, by direct count of `test/replay/*/` subdirectories:
  `fragment-selection` 3, `test-review` 10, `trace` 14, `nfr` **20** (not 15),
  `test-design` 11, `bmad-tea-routing` 17. Total **75** (not 70). `find test/replay
  -mindepth 2 -maxdepth 2 -type d | wc -l` = 75. The `nfr` count specifically moved
  twice inside this one session's own history: it was 13 when a Story 4.4 comment
  measured it, someone (me, mid-session) corrected that comment to 15 after
  re-measuring, and it's 20 now — almost certainly from PR #179 ("the gate artifact
  carries the four domain statuses") landing more replay cases after. This is the
  liveliest possible demonstration of the story's own premise: three different correct
  values for the same claim inside one week, each one somebody wrote in by hand.
  `test/replay/` itself is exactly a `files` source (`{ path: "test/replay/<suite>",
  recursive: false }`, one per suite, or `matches`/`files` counting subdirectories —
  check which source kind actually counts directories rather than files; the handover
  note's `files` kind is described as counting files matching an extension list, so
  confirm it handles directory-only entries before assuming it fits, or count via a
  tiny `module` source instead).

### Not yet verified — worth a look, lower confidence

Found by the same grep sweep but not run down to a verified number before this
handover was due. Listed so the next worker doesn't have to redo the search, not as a
promise any of these are actually stale:

- `README.md:154-157`: the `steps-c`/`steps-e`/`steps-v` file-count table (5-12 files,
  always 2, always 1). Likely a `files`-kind source per directory glob if it needs
  holding at all — but this describes an authoring *convention*, not a fixed inventory,
  so it may belong in `doc-claims`' `vocabulary` class instead of `doc-counts`, or not
  be a good gate target at all. Judgment call for whoever picks this up.
- `README.md:423,549`, `eval:all`'s "two repetitions... three repetitions for
  test-review, and two r[epetitions for ...]" — likely the same
  `suite-manifest.json`/harness-default-runs source as the roadmap sentence, just
  phrased differently. If you build the roadmap entry's sources first, reuse them here
  rather than re-deriving.
- `docs/explanation/eval-quality-adoption-guide.md:117`, "nine plants across two files" —
  the `test-review` positive corpus. Should be checkable against
  `test/fixtures/test-review-eval/seeded/ground-truth.json` or similar; not yet opened.
- `docs/explanation/eval-quality-adoption-guide.md:168`, "test/eval-trace.js names
  fifteen [thresholds]" — should be a straight export-length read off whatever constant
  `eval-trace.js` declares its threshold table as; not yet opened.
- The full ~294-line grep hit list is not reproduced here since most of it is noise
  (ordinary prose numbers). Re-run it if you want the raw sweep:
  a number-word-or-digit immediately followed by one of `contract(s) probe(s) corpus
  corpora case(s) harness(es) workflow(s) skill(s) command(s) check(s) gate(s)
  assertion(s) outcome(s) review(s) trace(s) selection(s) fragment(s) replay stored
  rule(s) threshold(s) test(s) suite(s) step(s) chain platform(s) fixture(s) adapter(s)
  conformance arm(s) vocabulary/-ies registry/-ies concern(s) domain(s) criterion/-a
  file(s) bundle(s) finding(s) source(s) layer(s) agent(s)`, scanned over
  `docs/**/*.md`, `README.md`, `CONTRIBUTING.md`, `test/README.md`,
  `test/contracts/README.md`, `test/probes/README.md`, skipping fenced code blocks.

## Judgment on scope for the first PR

Given the size of the full inventory, I'd cover in one PR: the roadmap sentence (the
story's own AC target, six numbers, one config section), the 59/24/19/16 knowledge-
fragment tier breakdown, the `npm test` chain count (35, correcting the stale 33), and
the fragment-selection case count (24). That's four `doc-counts` entries, all verified
above, all with a clean derivation path, and it fixes both stale numbers found while
building the inventory in the same PR — matching the standing preference for landing
found-gaps in the PR that found them rather than filing a follow-up. The "not yet
verified" section above is real remaining scope, but I'd rather hand over four solid,
checked entries than eight half-checked ones.

## Traps hit, for the record

- Never trust a relayed claim about repository state over the repository itself,
  including a claim about what's merged, what's pinned, or what file exists — even
  from someone who normally has better information than you do. I checked `npm view
  eval-quality versions`, `gh pr view`/`gh pr diff`, and the actual installed
  `node_modules` tree before believing the pin and the config file existed, found they
  didn't, said so, and that's what surfaced that three workers had been told the same
  wrong thing before any of us built on top of it.
- A sentence with several numbers in a row is not guaranteed to share one formula. The
  roadmap sentence looks uniform (six suite names, six numbers) and isn't — five are
  `cases × runs` and one is `runs` alone, because one harness's shape genuinely differs
  from the other five. Read every harness's actual loop structure before assuming a
  pattern from the prose; do not derive the module-value sources from the sentence, derive them from the code and then check they reproduce the sentence.
