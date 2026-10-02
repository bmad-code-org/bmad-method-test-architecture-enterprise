---
title: 'Story 1.66: Scrub an observation in every letter case'
type: 'bugfix'
created: '2026-10-01'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5268045b'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.66)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.66 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-4, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.67.md (the previous story record, the model for this one)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.38.md (where the finding came from)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `hostEnvironmentPort` in `cli/lib/evaluate/arm.js` scrubs an observation with `secretForms(values)`, which holds each injected value and its JSON escapings in the case the host knows them, and replaces them with a case-sensitive `split`/`join`. A fault's message and cause are scrubbed in a second set (`anyCase`) that adds each value lowercased. A target or deployment that echoes an auth value in another letter case (a header a server normalizes, a URL a proxy lowercases) leaves it in the observation, which reaches the evidence artifacts and, through `reportedRelease`, a refusal's quoted identifier. The two paths also scrub different sets of cases.

**Approach:** One scrub for both paths, matching every form of a secret in every letter case. The observation, a fault's message and a fault's cause scrub with the same set, so the fault path's separate lowercased set is removed. A value shorter than the scrub's minimum length is filtered out before any form is built, so ordinary text stays unscrubbed in every case. No eval-quality change.

## Boundaries & Constraints

**Always:** keep `scrub`, `scrubCutText` and `secretForms` callable as they are today (`secretForms(values)` returns the array of strings the callers pass on; `scrub(value, secrets)` takes it), so `http-target.js`'s `quotedCapture` default and every test import keep working. The leading-part scrub for a cut text (`scrubCutText`, `MIN_CUT_PREFIX_LENGTH`) matches in every letter case too. A number whose text holds a secret (`numberHoldsSecret`) compares in every letter case. Compile the matching once per `secrets` array (a `WeakMap` keyed on the array, or an equivalent), not once per string: `scrub` walks every string and key of an observation. Build the pattern from escaped literals and run it without a flag that mishandles a lone surrogate; verify against the installed Node. Keep `cli/` free of any framework import. Verify every behavioral claim about a vendor tool live against the installed version before it enters plan or doc text. Exercise every revert check once in a scratch copy and record the observation. Fix pre-existing defects found on the way. Run `test:schema-versions` locally. List every digest or evidence byte the change refreshed.

**Never:** an eval-quality change or a new engine export; a new subcommand; a raised timeout; a script that is not chained; weight added to a heavy suite without the measured weight in `tools/test-shard-weights.json`; a commit, push, pull request, merge or release.

**Decisions (coordinator, owner-delegated):**

- Matching is case-insensitive, not limited to lower- and uppercase: a normalizer that capitalizes words (`Bearer-Token-Value`) is covered. For a case mapping that changes length (`ß` upper-cases to `SS`), the form set also holds each form's `toLowerCase()` and `toUpperCase()` text, so that echo is scrubbed as well.
- The observation, a fault's message and a fault's cause scrub with one set. `anyCase` and its lowercasing of `values` go away; nothing the fault path scrubbed before is left out.
- The minimum value length (`MIN_SCRUBBED_VALUE_LENGTH`, 8) filters the original value before forms are built, as today. A seven-character secret echoed in any case stays.
- `reportedRelease` needs no change: it already goes through `hostEnvironmentPort`, so the reported identifier is scrubbed before `quotedIdentifier` reads it. The arms case proves it reaches `refused/<probeId>.json` and `run.json` as `[redacted]`.

## I/O & Edge-Case Matrix

| Scenario                           | Input / State                                                                                                         | Expected Output / Behavior                                                       | Error Handling |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| Lowercased and uppercased echo     | `api` entry, auth value injected; grader echoes it lowercased in one field, uppercased in another, in body and header | observation holds `[redacted]` in each place                                     | n/a            |
| Mixed-case echo                    | grader echoes it capitalized per word                                                                                 | `[redacted]`                                                                     | n/a            |
| Release identifier echoes secret   | deployment reports a release holding the secret uppercased                                                            | `refused/<probeId>.json` and `run.json` hold `[redacted]`, no secret in any case | n/a            |
| Fault quotes the secret uppercased | port throws a fault whose message and cause quote it uppercased                                                       | message and cause hold `[redacted]`; same set as the observation                 | n/a            |
| Cut text ends in a secret's lead   | stray line cut inside the secret, in another case                                                                     | the leading part (4+ characters) is replaced                                     | n/a            |
| Short value                        | injected value of seven characters, echoed in each case                                                               | stays as the target sent it                                                      | n/a            |
| Length-changing mapping            | secret holding `ß`, echoed upper-cased as `SS`                                                                        | `[redacted]`                                                                     | n/a            |
| Number echo                        | a secret of digits and `e` read as a number                                                                           | unchanged behavior; text compared in every case                                  | n/a            |
| Keys                               | secret in another case as an object key                                                                               | key scrubbed and numbered as today                                               | n/a            |
| Ordinary text                      | text that merely resembles a secret's case-folded form                                                                | only text equal to a form in some case is replaced                               | n/a            |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/arm.js`: `secretForms`, `scrub`, `scrubCutText`, `numberHoldsSecret`, `hostEnvironmentPort`'s `anyCase`; the header comment.
- Tests: `test/test-evaluate-api.js` (the HTTP-answer scrub beside the existing `leaky` case near line 896, the redirect-denial case near line 1550, the short-value case), `test/test-evaluate-arms.js` (the release identifier through `refused/<probeId>.json` and `run.json`).
- `CHANGELOG.md`, `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`, `epics.md`, `test-design-epic-1.md` only where this story's amendments need them.

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/evaluate/arm.js` -- one case-insensitive scrub for the observation and the fault path -- AC 1, 3, 4
- [x] `test/test-evaluate-api.js` -- echoed secret in lowercase, uppercase and mixed case in body and header; the fault path uppercased; the short value -- AC 1, 3, 4
- [x] `test/test-evaluate-arms.js` -- the release identifier -- AC 2
- [x] CHANGELOG, sprint row, this record -- all

**Acceptance Criteria:**

- A grader that echoes the injected auth value lowercased in one field and uppercased in another yields `[redacted]` in each (revert: the case-sensitive scrub leaves the lowercased and uppercased echoes in).
- A deployment that reports its release as the secret in another letter case reaches `refused/<probeId>.json` and `run.json` as `[redacted]` (revert: the case-sensitive scrub writes the secret into the refusal's quoted identifier).
- The fault path scrubs the same set of cases as the observation, with a fault whose message and cause quote the secret uppercased (revert: two different sets let the uppercased echo through the fault).
- A value shorter than the minimum length stays unscrubbed in every case (revert: scrubbing it redacts ordinary text and fails the case).

## Implementation Notes

- `cli/lib/evaluate/arm.js`: one case-folded comparison for the observation and the fault path.
  `secretForms(values)` still returns a longest-first array of strings, now frozen.
  Each secret is taken in five cases (`caseVariants`: as it is, `toLowerCase()`, `toUpperCase()`, and `toLocaleLowerCase('tr')` and `toLocaleUpperCase('tr')`), and each case in the body, every first-level escaping and every second-level escaping `escapingsOf` writes.
  `foldedText(text)` folds a text one character at a time (`toLowerCase().toUpperCase().toLowerCase()`, so `K` and the Kelvin sign, `ς` and `σ`, `ſ` and `s`, `ı` and `I`, `ẞ`, `ß` and `SS` meet, and a capital sigma is read without its neighbors); an ASCII text folds to its lower case in one call, and any other text also returns the original span of each folded unit, because a fold can change the length.
  `matcherFor(secrets)` folds the forms once per array (a `WeakMap` keyed on the array), drops empty forms and keeps the first unit of each and the longest length.
  `scrub` finds every occurrence of every folded form in the folded string (`indexOf`), merges overlapping spans (adjacent ones stay apart), maps the spans back to the original text and replaces each with `[redacted]`; a string that holds no form comes back as it was.
  `scrubCutText` scrubs whole forms, then reads only the last stretch of the text a form could fill (the longest folded form's length) and replaces from the longest suffix, four characters or more, that is a proper leading part of some folded form.
  `numberHoldsSecret` looks for a folded form in the number's text (the read-as-a-number equality is as before).
- No regular expression is built over the forms.
  The first build compiled every form into one `iu` pattern and every leading part into a nested one; the independent review (see Build review) showed that a credential file or a token of 2,500 characters made the cut pattern throw `Regular expression too large` inside the fault path (replacing the fault with a SyntaxError whose message quoted the pattern, secret included) or abort the process out of memory, and a 50,000-character secret made even the whole-form pattern throw.
  The folded comparison has no size limit: a 500,000-character secret, a 1,400-character credential file with 396 forms and a 20,000-character secret with 252 forms scrub in well under a second.
  The folding and the `\uXXXX` forms were run in the installed Node 24.20.0 on a secret of pattern metacharacters, a lone high and a lone low surrogate, `ß` and `ẞ`, a dotted `İ`, a letter outside the BMP and the Kelvin sign without a throw and without a match in ordinary text.
  A cut that falls between a pair's two surrogates leaves the first alone at the end of the text; the comparison is by UTF-16 unit as before, so it is replaced.
- `hostEnvironmentPort`: the fault's message and cause scrub with the observation's `secrets`; `anyCase` and its lowercased values are gone.
  The forms of one set of values, and the folded matching with them, are built once per distinct set on a port (`formsFor`, a `Map` keyed on the JSON of the values), since a run makes thousands of calls over a few sets.
  The minimum length (`MIN_SCRUBBED_VALUE_LENGTH`, 8) still filters the original values before any form is built.
- `docs/reference/tea-evaluate-cli.md`: the tool-server, HTTP-service and observation sentences say "in any letter case", and the registry section states the one limit (see Departures).
- Tests, `test/test-evaluate-api.js`: `checkLetterCases` (new group `the scrub in every letter case`) and one case beside `leaky` in `checkUnits`; `test/test-evaluate-arms.js`: three cases at the end of `checkReportedReleases`.
  Both files take a flag for the revert checks (`--letter-cases-only`, `--reported-releases-only`), the house idiom.
  `checkLetterCases` crosses ten secrets (ASCII; mixed case; pattern metacharacters with `/`, `<`, `>` and `&`; `ß` with letters with diacritics; a dotted capital `İ`; a lone surrogate; letters outside the BMP; a base64 value; a Turkish `i` and `I`; Greek words ending in a capital sigma) with seven cases (as sent, lower, upper, capitalized per word, alternating, Turkish upper and lower) and, for each pair, checks the observation (a header, a body field inside other text, a nested array's second element, an object key), the same echo in each byte format a serializer writes (plain, a JSON string body, `\uXXXX` in lower- and upper-case hex, Go's `\u003c`, `\u003e` and `\u0026`, `\/`, two levels of JSON, `\uXXXX` at the second of two levels) in a text body, and a fault whose message, printed text, cause and cause's cut-off printed text all quote it.
  Keys that scrub to one name are numbered; a seven-character value (three of them, one with `/`, one with letters with diacritics) stays in every case and format beside an eight-character value that does not; text that merely resembles a secret stays; two secret sets on one port scrub apart; `scrubCutText` is checked at four and three characters, not at the end, with two secrets, with `ß`, `ẞ` and an astral secret cut at every code unit; `quotedCapture` scrubs before it cuts to the last 2000 characters; a number holding `3456789E+25` is replaced through the forms and through a hand-built array; a secret holding another is replaced whole whichever the array lists first; an empty form matches nothing.
  `test:evaluate-arms`: a deployment reports the registry's auth value upper-cased on the pre-fix side, capitalized inside a longer identifier on the post-fix side, and lowercased beside an upper-cased copy; each is refused with the identifier quoted `[redacted]`, and no file under the run directory (case-insensitive text search) and no output holds the value.
- Digests and evidence bytes refreshed: none.
  No fixture, committed digest, record or evidence file changed; the arms cases write to temporary projects.
- `story-1.66.md`'s I/O matrix table was re-padded by `prettier --write` (cell text unchanged, checked by comparing the file with whitespace and pipes collapsed), because `lint:md` (MD060) and `format:check` fail on the record as written.

### Departures from the plan text

- The plan says the form set holds "each form's `toLowerCase()` and `toUpperCase()` text". The variants are taken of the secret before it is escaped, and the escapings of each variant are the forms.
  A variant of an escaped text (`\u00FC`) is already reached by the case-folded comparison, and an escaped variant (`\u00dc` for `Ü`) is not reached from the escaping of `ü`, so the order is the one that matters.
  A form-level variant layer was written first and removed once a mutation (variants of the escaped text dropped) showed it changed no outcome.
- The plan names lower, upper and capitalized echoes; the build adds the Turkish mappings (`toLocaleUpperCase('tr')` and `toLocaleLowerCase('tr')`: a Turkish-locale server maps `i` to `İ` and `I` to `ı`, which Unicode case folding does not equate).
  This is the build's call under "every letter case"; removing them fails 53 checks.
- The third criterion's revert reads differently (amended in `epics.md` and `test-design-epic-1.md`).
  The fault path's separate lowercased set is gone, and matching is case-insensitive by construction, so rebuilding the old lowercased set and handing it to the new scrub leaks nothing (mutation observed: passes).
  The revert that fails is the fault path scrubbing with the earlier case-sensitive code.
- One corner is not closed and became Story 1.74: a secret with a letter beyond ASCII, echoed with its letters in different cases (a word capitalized, the rest not), that the serializer then writes as `\uXXXX`.
  The escape digits of a letter differ with its case, so no whole-text case reaches them.
  The tests skip those byte formats for those cases and say so; the reference states the limit.
- The plan says to compile the matching once per `secrets` array with a `WeakMap`; the build does that, folds the forms and compiles no pattern (see Implementation Notes), and adds a memo per port (`formsFor`) so a run builds the forms of one set of values once.
  The array `secretForms` returns is frozen, since the folded matching is kept with the array's identity and a later change to the array would leave it stale.
- Overlapping secrets: the old code replaced forms one at a time, longest first, so a longer secret overlapping a shorter one was replaced whole.
  A first single-pass build replaced the leftmost match and left the longer secret's tail in the text (found in review); the final build replaces the union of overlapping occurrences as one span.
- Vendor claims: none entered plan or doc text beyond the installed Node's string case mappings, run live (see Implementation Notes).

## Revert observations

Each exercised once on a scratch copy of the final tree (`cp -c`, `.git` and `node_modules` included, under the session scratchpad), by applying one edit to `cli/lib/evaluate/arm.js` (or `release-report.js`), running the named suite there, and restoring the file.
The working tree was never mutated.
The unmodified copy passes: `node test/test-evaluate-api.js --letter-cases-only` 885 checks, `node test/test-evaluate-arms.js --reported-releases-only` 102.
The counts are failed checks of those two runs; the driver (`mutate.py`) and its logs are in the session scratchpad.
An earlier sweep of the regular-expression build was discarded after two sweeps ran against one tree at once; the figures below are from a single sweep per tree of the final code.

- AC 1, an echoed secret in another case reaches the observation.
  The case-sensitive scrub restored (`HEAD`'s `arm.js`): 619 of 885 `test:evaluate-api` checks fail, and 6 of 102 arms checks (below).
  Comparison without any folding (the forms and the text compared as they are, the case variants kept): 207 fail, so the folding does work the variants do not.
  Non-ASCII letters not folded (ASCII still lowered): 99 fail.
  Folding by lower case alone (no upper-case round trip): 1 fails, the `ß` and `SS` check, so `ẞ`, `ß` and `SS` meeting is pinned.
- AC 2, a reported release echoing the secret.
  The case-sensitive scrub restored: 6 of 102 `--reported-releases-only` checks fail, two for each of the three releases (the refusal quotes the secret, and a file under the run directory or the output holds it).
  No folding: 2 fail, the capitalized release on the post-fix side (the upper-cased and the lowercased-beside-upper-cased releases are reached through the case variants), which is why the capitalized one sits on the later side.
  `reportedRelease` handing the raw port to `runArm` in place of the scrubbing port: 32 fail (every refusal that names a reported release holds the raw release).
- AC 3, the fault path.
  The fault path's message and cause scrubbed by the earlier case-sensitive code while the observation uses the new matching: 48 fail; the message alone: 45; the cause alone: 44.
  The fault path rebuilt as before (`secretForms([...values, ...lowercased])`) and handed to the new scrub: passes, 885 of 885, for the reason in the Departures; the amended criterion names the case-sensitive revert.
  The cause left unscrubbed: 73 fail; the printed text left out of the message: 70.
- AC 4, a short value.
  The length filter removed: 14 fail.
  The filter applied to the forms and not to the original value (a seven-character secret whose escaping has eight characters): 7 fail.
- Extra mutations of the new code, each one edit:
  - lower-case-only variants (no upper, no Turkish): 65 fail; no Turkish variants: 46.
  - case variants not taken before escaping (the escape digits of `Ü` versus `ü`): 80.
  - second-level escapings dropped: 26.
  - number text compared to the forms as written (the case-sensitive number match): 1, the hand-built-array number check.
  - cut text compared unfolded: 138; cut minimum 3 characters: 2; cut minimum 5 characters: 9; cut reading only the last 10 units: 76.
  - fold by code unit, so letters outside the BMP stay unfolded: 39.
  - span map ignored, so a length-changing fold shifts the replaced span: 78.
  - overlapping spans not merged: 2; adjacent spans merged: 1.
  - only the first form matched: 730; one matcher shared by every `secrets` array: 753.
  - the per-port forms memo keyed by a constant: 1, and keyed by the number of values: 1 (two secret sets on one port).
  - object keys not scrubbed: 82.
  - `secretForms` returning an array that is not frozen: 1.
- Not observed by any check: folding the forms on every call when the build folds them once per array (a performance property; the large-observation scrub was timed in experiments, and no test asserts a time for it).

## Gates

- Engine check (`evaluateTarget` is a function, eval-quality 4.7.0) exit 0 at the end of the build.
- Green on the final tree: `test:evaluate-api` 1,162 checks, `test:evaluate-arms` 570, `test:evaluate-boundaries` 427, `test:evaluate-guidance`, `test:schema-versions`, `test:schemas`, `test:boundary`, `test:direction` (289 files, 0 violations), `test:doc-counts`, `test:shards` 117, `test:ci-coverage`, `test:changelog`, `lint`, `lint:md`, `format:check`, `docs:validate-links`, `docs:build`.
- Green, the other suites that import `arm.js` or run `tea-evaluate` through it: `test:evaluate-mcp` 226, `test:evaluate-mutation` 665, `test:evaluate-workflow` 165, `test:evaluate-run` 571, `test:evaluate-aggregate` 142, `test:evaluate-confinement` 404, `test:evaluate-held-inputs` 204, `test:evaluate-agents` 330, `test:evaluate-evaluators` 486, `test:evaluate-private` 96, `test:evaluate-records` 330, `test:evaluate-check` 987, `test:evaluate-tool-use`, `test:port-totality`, `test:evaluate-preflight` 300.
- `test:evaluate-preflight` failed once with 7 of 301 checks (`preflight over the stub exited 12`: "the adopter's tree ... changed during the legs"), and passed on the immediate rerun with the same tree.
  The test runs `tea-evaluate preflight` with this checkout as the adopter's tree, and the run stops on any change to the checkout's git status, file contents or shared git state; worktrees of other lanes share this repository's git state.
  No process of this build wrote to the checkout in that window.
  I did not change the test: isolating it means giving it its own repository, which is a design change the coordinator should decide.
- `git diff -- package.json package-lock.json` is empty: no dependency, lockfile or peer change and no `file:` or `.tgz` spec.
- Measured weight, same machine in the same hour, the HEAD checkout cloned beside this tree, runs interleaved, two each, other lanes' suites running alongside (load average 5 to 9):
  - `test:evaluate-api`: 111.5 and 107.3 seconds at `5268045b` (mean 109.4), 109.4 and 106.9 with the change (mean 108.2). The new cases add about 4 seconds (the group alone runs in 4 to 5 seconds), inside the run-to-run spread; `tools/test-shard-weights.json`'s `test:evaluate-api` 175.9 stays.
  - `test:evaluate-arms`: 216.8 and 218.9 seconds at `5268045b` (mean 217.8), 225.4 and 221.1 with the change (mean 223.2), +5.4 seconds locally (three more deployment projects and six more deployments). At the 1.9 local-to-CI ratio about +10 seconds, so `test:evaluate-arms` 274.2 becomes about 284.
  - No other weight changed. The weights file is the coordinator's to update; this change did not touch it.
- Unrun: the full `npm test` (CI shards).

## Build review

An independent Opus reviewer read the diff of `arm.js` blind (no suites run) and reproduced each finding with `node -e` before reporting it.
It reported four defects against the first build, a single `iu` pattern per secrets array.

### Fixed (all four)

- High: the cut pattern nested one optional group per character of every form, and V8 compiles it on its first `exec`, so `scrub` worked and `scrubCutText` threw `Regular expression too large` on the fault path for a credential file of about 1,900 characters or two secrets of 110 characters with `"`, `/`, `<`, `&` and `Ü`; the throw replaced the original fault and its message quoted the pattern, which held the secret.
  Reproduced by the reviewer against a port that rejected with `server would not start`.
  Fix: no pattern is built over the forms any more (see Implementation Notes).
  The cut reads only the last stretch a form can fill.
  Test: `a credential file`, `a 2,520-character token` and `a 60,000-character secret` through the success path and a fault whose own message survives.
- High: a plain token of 2,500 characters aborted the process (`RegExpCompiler Allocation failed - process out of memory`) before anything could catch it, and the compile time grew about quadratically below that (324 ms at 1,000 characters).
  Same fix and the same tests.
  The whole-form pattern had a limit of its own, which I measured: 50,000 characters threw, `HEAD` handled it.
- Low: overlapping secrets leaked the tail of the longer one (`abcdefgh` and `cdefghijklmnop` in `abcdefghijklmnop` left `ijklmnop`) where `HEAD` replaced the longer one first.
  Fix: occurrences of every form are collected and overlapping spans merge into one replacement.
  Tests: both array orders, plus adjacent secrets staying apart.
- Low: `scrub` kept a stale matching after a `secrets` array changed (the cache is keyed by the array).
  `formsFor` never mutates, so no caller hit it, but the exported API behaved differently from `HEAD`.
  Fix: `secretForms` freezes its result; test `Object.isFrozen`.
- Minor, also fixed by the same change: `quotedCapture` over 1.18 MB of text repeating secret prefixes took 455 ms against 4 ms at `HEAD`; now 1.4 ms.
- Checked clean by the reviewer (on the first build): the whole-form scrub's speed (31 ms against `HEAD`'s 352 ms on a large observation), case variants for Turkish `ı` and `İ`, `ß` and `ẞ` and Greek final sigma, escapes in upper- and lower-case hex, number handling, key renaming, memo staleness.

### My own triage of the final diff

- `foldedText` is a per-character fold, so it does not read a capital sigma by its position; a secret of Greek words ending in `Σ` (and a polytonic letter) is crossed with every case, and the lowercased echo carries the final `ς`.
- A fold that shrinks a text would break the cut's window (the last `longest` units); `toLowerCase().toUpperCase().toLowerCase()` never shrinks a character in the installed Node (checked over every BMP code point and the astral planes with a script), so the window holds.
- The memo `formsFor` keeps the plain JSON of the values in a `Map` for the life of the port; the values are already in the registry's process memory.
- Unobserved by design: nothing asserts the folded forms are built once per array (see Revert observations).

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:evaluate-api && npm run test:evaluate-arms` -- expected: green
- `npm run test:evaluate-boundaries && npm run test:direction && npm run test:schema-versions && npm run test:schemas && npm run test:boundary && npm run test:doc-counts && npm run test:shards && npm run test:ci-coverage && npm run test:changelog` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check && npm run docs:validate-links` -- expected: green
