---
title: 'Story 1.122: Make the ci command oracles hold on the quoted stored capture'
type: 'bugfix'
created: '2026-10-05'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6aed15d9'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.122; the Story 1.94 amendment that files it; Stories 1.123 and 1.95, which follow it in lane 4)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.122 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-10, AD-11)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.94.md (the story that found this)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.121.md (the record format and the latest ci-corpus change)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.97.md'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The real capture `test/replay/ci/evaluation-plan-live-capture` quotes its folder names for the shell (`npm install --prefix 'evals'`, `tea-evaluate ci --evaluation 'evals/grader' --tier pr`).
The `containment` oracles O-031 (`command-evaluation-install`) and O-032 (`command-evaluation-ci-pr`) search for the unquoted literals, so the stored correct run violates both.
The engine resolves both checks false with corroboration `disagrees` on the clean control P-004, and `KNOWN_UNHELD` in `test/test-probe-corpus.js` lists the two so the corpus can pass.

**Approach:** Each of the two elements states a `contractPattern` beside its `contractToken` in `test/fixtures/ci-eval/ground-truth.json`, a fully anchored regular expression that pins the folder and the tier.
It tolerates a balanced pair of single or double quotes around the folder, which a correct run may also write around the tier, and separates the words of the command by `\s+`, since a folded YAML scalar can break the line between them.
`tools/generate-contracts.js` renders it with the vocabulary's `regex` operator, and the paired scorer tests the same source with `new RegExp(source)` and no flags.
`KNOWN_UNHELD` is empty and its check stays.

## Boundaries & Constraints

**Always:**

- The sources are `ground-truth.json` and `tools/generate-contracts.js`; `test/contracts/ci.contract.json`, `test/probes/ci.probes.json` and the ci `corpusDigest` regenerate from them and no generated file is edited by hand.
- `expected-strength.json` moves in the ci `corpusDigest` only.
- The patterns are the anchored forms of the acceptance criteria: the folder and the tier stay pinned, and the single-quoted, double-quoted and unquoted forms pass (the quote and whitespace forms are those of fix round 1, below).
- Story 1.121's state holds: the three ci pre-flight records are `passed` and `test:ci-qualification` keeps `plant-reported`.

**Never:**

- An edit of `references/ci.md`, `SKILL.md`, `assets/evaluation-ci-plan.template.json`, step 03b, `github-actions-template.yaml` or either `capture-record.json`, so no live recapture is needed.
- A live session, `claude -p`, an `eval:ci` run against a real agent, Docker.
- A new story, a change to the lane lists, or an edit of the sections of Stories 1.123 and 1.95.
- A hand-edited generated digest.

**Decisions (build worker, owner-delegated):** the owner delegated every decision of this build, so none waited at a checkpoint; `/bmad-build` renders here and halts at human checkpoints, so its steps were followed by hand without stopping, and the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                                  | Input / State                                                                                                                                                           | Expected Output / Behavior                                           | Error Handling                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| The stored capture                        | `npm install --prefix 'evals'` and `--evaluation 'evals/grader' --tier pr`                                                                                              | O-031 and O-032 hold                                                 | `storedRunProblems` fails the oracle that does not            |
| Double-quoted or unquoted forms           | the same commands with `"` or no quotes, or folded over several lines                                                                                                   | both hold                                                            | `test:contract-oracles` names the form                        |
| Another tier                              | `--tier nightly`, `--tier prod`, `--tier merge`, `--tier PR`                                                                                                            | O-032 fails, O-031 holds                                             | the oracle and the scorer both resolve false                  |
| Another folder or prefix                  | `npm install --prefix other`, `evals-other`, `--evaluation other/grader`, `evals/grader2`                                                                               | the matching oracle fails                                            | same                                                          |
| A broken quote                            | an unterminated quote, a closing quote only, a mismatched pair, a trailing digit (`evals2`, `pr2`)                                                                      | the matching oracle fails                                            | same                                                          |
| An omitted command                        | no install line, no ci line, neither                                                                                                                                    | the matching oracle fails                                            | same                                                          |
| A command at the end of the file          | no trailing newline                                                                                                                                                     | holds (`$` branch)                                                   | n/a                                                           |
| The clean control P-004                   | the engine scores its record                                                                                                                                            | O-031 and O-032 `held`, corroboration `agrees`, no other outcome off | `cleanControlProblems` names an outcome that is anything else |
| A `contractPattern` that cannot be a pair | empty, no token, unanchored (an alternation at the top level or an escaped final dollar too), not a regular expression, no match for its token or the element's command | `validateCorpus` refuses it                                          | `test:eval-ci-data` and `test:evaluate-ci-render` fail        |
| A listed `KNOWN_UNHELD` oracle that holds | a leftover entry                                                                                                                                                        | `storedRunProblems` fails with the oracle's id                       | `knownUnheldProblems` proves the branch over an empty list    |

</frozen-after-approval>

## Code Map

- `test/fixtures/ci-eval/ground-truth.json`: `contractPattern` beside `contractToken` on the two plan-project elements.
- `test/eval-ci.js`: `isEscaped`, `hasTopLevelAlternation` and `isPatternAnchored` (the operator's anchoring rule, copied), `workflowMatches` (`new RegExp(source)`, no flags) and `workflowHoldsToken` (the pattern where an element has one, else `workflowMentions` over the token), both exported; `validateCorpus` holds the field to non-empty, a token beside it, anchored over the whole expression (`isPatternAnchored`, copied from the operator's own rule), a regular expression, a match for its own token and for the element's command.
- `tools/generate-contracts.js`: `ciMatches` and `ciRequestedCheck` render the `regex` operator over the workflow pointer from the pattern (relation `regex`), else the `containment` as before; `ciOracleSpecs` pairs the oracle with `workflowHoldsToken`.
- `test/test-eval-replay.js`: `ciScoringInputs` leaves `contractPattern` out beside `contractToken`, since `scoreRun` never reads it and a replay digest would move otherwise.
- `test/test-probe-corpus.js`: `KNOWN_UNHELD` is empty; `storedRunProblems` takes the list as a parameter; `knownUnheldProblems` exercises both branches of the check over the suite's own records; `cleanControlProblems` holds every engine outcome of a clean control to `held` with corroboration `agrees`, and `cleanControlSelfProblems` exercises it over a contradicted and a violated outcome.
- `test/test-contract-oracles.js`: `checkCiCommandOraclesOnQuotedForms` scores forty-one forms of the two commands through eval-quality and through the scorer.
- `test/test-evaluate-ci-render.js`: nine `validateCorpus` guard cases for the new field.
- Regenerated: `test/contracts/ci.contract.json` (the two checks), `test/probes/ci.probes.json` (the ground-truth digest), `test/probes/expected-strength.json` (the ci `corpusDigest`).
- Prose: `test/probes/README.md`, `test/contracts/README.md`, `CHANGELOG.md`, `epics.md` (amendments to Stories 1.94 and 1.122), `test-design-epic-1.md` (the same), `sprint-status.yaml` (row 1.122 `review`).
- Not changed: `references/ci.md`, `SKILL.md`, the plan template, step 03b, `github-actions-template.yaml`, the two capture records, the lane lists, the sections of Stories 1.123 and 1.95, `package.json`, `package-lock.json`.

## Tasks & Acceptance

- [x] Reproduce on the untouched tree: the corpus passes with `KNOWN_UNHELD` listing both oracles, and the engine scores O-031 and O-032 `violated` with corroboration `disagrees`.
- [x] `contractPattern` in the ground truth, rendered by the generator, tested by the scorer, held by `validateCorpus`.
- [x] Regenerate the contract, the probes and the baseline; compare the baseline line by line.
- [x] `KNOWN_UNHELD` empty with its check exercised; the clean control held to `held`/`agrees`.
- [x] Counts, docs, CHANGELOG, planning amendments, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.122, with the amendment dated 2026-10-05 there.

## Decisions

1. **The two plan-project elements get the patterns; the other three projects keep their literal tokens.**
   `command-evaluation-install` and `command-evaluation-ci-pr` exist in four projects.
   The acceptance criteria name the plan project's patterns (`evals`, `evals/grader`), and the tiers, edit and gate projects use the tokens `npm install --prefix` and `--tier pr`, which hold on their stored captures (the tiers capture is unquoted, the edit and gate captures quote the folder only, and `storedRunProblems` finds no oracle of those sets violated).
   A pattern for those projects would change their oracles beyond the story, so their elements are untouched.
2. **`contractToken` stays beside the pattern.**
   The token is the unquoted literal the pattern must also match, and `validateCorpus` holds the pair together, so a pattern that drifts from the command it states fails `test:eval-ci-data`.
3. **One paired predicate, `workflowHoldsToken`.**
   Every reader of the scorer (the generator's `ciOracleSpecs`, `test:contract-oracles`, the probe builder) already goes through the spec's `scorer`, so one function that chooses between the literal and the pattern keeps the oracle and its twin one claim.
   `workflowMentions` stays for the literal elements and for `mustNotEmit`.
4. **`relation` is the check's op.**
   The direction of a `regex` oracle states `relation: regex`, as the other regex oracles of the contracts do (`matcherExpression(...).op`), and its `negativeDomain` names the command whether or not it quotes its arguments for the shell.
5. **`knownUnheldProblems` keeps the machinery exercised.**
   With the list empty, neither branch of `storedRunProblems` would run, and a change that removed one would pass.
   The check lists one real oracle of each stored-run suite against the records as they are (it must be reported as holding now), then flips the same oracle to `violated` in one record, which must be reported when unlisted and silent when listed.
6. **`cleanControlProblems` holds the third acceptance criterion.**
   The criterion says the clean control carries no `disposition-contradicts-evidence`.
   The engine reports that rule as the corroboration `disagrees`, so the check reads every engine outcome of a clean control in the four stored-run suites and requires `held` with `agrees`.
   All four suites hold it on the final tree (79 outcomes in ci), and the oracles of `KNOWN_UNHELD` would be exempt.
7. **`ciScoringInputs` leaves the pattern out.**
   `scoreRun` never reads it, and the replay digest of every plan-project case would move otherwise (see the revert row for it).
8. **The `contractPattern` field is validated.**
   The regex operator accepts only an anchored pattern, so `validateCorpus` refuses any other at the corpus, before compile does, and refuses a pattern that does not match the token or the command it stands for.
9. **The forty-one forms of `checkCiCommandOraclesOnQuotedForms` include `--tier PR`.**
   The operator reads a pattern with no flags, so a scorer that adds `i` would pass an upper-case tier the oracle fails; the row holds the scorer to no flags.

10. **Fix round 1: balanced quotes.**
    Each quote of the first patterns was an independent `['"]?`, so `'evals"`, an unterminated `'evals`, `evals'` and `--tier 'pr` all held, and each is a shell syntax error.
    Each argument is now a whole-word alternation inside a group (`(?:'evals'|"evals"|evals)`), with no nested quantifier.
    The eight rows for broken quotes and trailing digits fail on the revert of any one-character widening.
11. **Fix round 1: folded scalars.**
    A YAML folded scalar (`run: >-`) can break the line between the words of a command, and the harness accepts it, so the words are separated by `\s+`.
    The token and the command stay single-spaced, which the patterns match.
12. **Fix round 1: the anchor guard mirrors the operator.**
    `isPatternAnchored` copies the operator's rule (`^` first, an unescaped `$` last, no top-level alternation) from eval-quality's `expression-legality.js` without importing an internal.
    Backreferences, lookbehind and nested quantifiers stay with compile, which `test:contracts` runs.
13. **Fix round 1: `cleanControlSelfProblems`.**
    A neutered `cleanControlProblems` passed every real run, so one outcome of the clean control is set to `held` with `disagrees` and another to `violated` with `disagrees`, both must be reported, and listing their oracles must silence them.
14. **Fix round 1: the quote claim.**
    The capture quotes its folder names (`'evals'`, `'evals/grader'`) and leaves the tier bare, so the prose says that and keeps the clause that a correct run may also quote a tier.
    The generated `negativeDomain` says `whether or not it quotes its arguments for the shell`, since the install command has no tier.

## Reproduction

On the untouched tree (commit `6aed15d9`):

- `node test/test-probe-corpus.js` passes: `KNOWN_UNHELD` lists O-031 and O-032 of `evaluation-plan-quarry-grader`.
- The engine's score of the clean control P-004, through the installed `eval-quality` package (a scratch driver over `runSuite` and `storedProbePort` of `test/lib/probe-scoring.js`, which `test:probe-corpus` uses), prints:

  ```text
  verdict CONCERNS exit 0; preflight passed
  O-031 command-evaluation-install: disposition=violated corroboration=disagrees check=false
  O-032 command-evaluation-ci-pr: disposition=violated corroboration=disagrees check=false
  every other outcome held/agrees except: []
  ```

- `node test/eval-contract-strength.js --suite ci --from-cache` on a scratch copy holding the real leg cache (`fixture-set-v1`, three entries recorded 2026-09-25, copied into the scratch copy only): P-001, P-002, P-003 `pre-flight passed`, verdict null, exit 3; P-004 `passed`, `CONCERNS`, exit 0; the run ended `every probe matched the outcome test/probes/expected-strength.json records`.

After the change, the same driver prints:

```text
verdict CONCERNS exit 0; preflight passed
O-031 command-evaluation-install: disposition=held corroboration=agrees check=true
O-032 command-evaluation-ci-pr: disposition=held corroboration=agrees check=true
every other outcome held/agrees except: []
```

The real-cache command prints the same four lines and the same matching line, so the pre-flights and the verdicts did not move.
`expected-strength.json` differs from `origin/main` in one line, the ci `corpusDigest` (`sha256:4358c3a1` to `sha256:4943e769`).

## Revert observations

Each revert was applied once to a scratch copy of the final tree (the working tree copied without `node_modules`, a scratch git repository for the suite's status guard, the real leg cache copied in, `node_modules` linked) under the scratchpad directory, the named check run, the failure recorded and the copy discarded.
Revert rows that change the ground truth regenerate the contract and the probes in the copy, as a maintainer's edit would.

| Revert (the one edit)                                                                                                                                    | Check run                 | Observed                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| both `contractPattern`s removed (the literal tokens restored over the quoted capture)                                                                    | `test:probe-corpus`       | 5 problems: O-031 and O-032 `no longer holds on the stored correct run`, both scored `violated` with corroboration `disagrees` on the clean control, and the baseline digest                     |
|                                                                                                                                                          | `test:contract-oracles`   | 90 of 9,350 fail: every row that carries a quote or a fold, and every row that expects the other oracle to hold, for the scorer and the oracle                                                   |
| both patterns replaced by `^[\s\S]*$` (matches anything)                                                                                                 | `test:contract-oracles`   | 74 fail: every omitted-command row, the end-of-file rows, the deviating folders and tiers, the broken-quote and run-together rows, and the `was seen resolving false` check of both oracles      |
|                                                                                                                                                          | `test:probe-corpus`       | 3 problems: O-031 and O-032 `holds under every wrong stored run, so a constant held would pass the corpus`, and the baseline digest                                                              |
| the tier alternation loosened to `(?:'[a-z]+'\|"[a-z]+"\|[a-z]+)`                                                                                        | `test:contract-oracles`   | 8 fail: `nightly`, `prod`, `quoted prod` and `merge`, each for the scorer and the oracle of O-032                                                                                                |
| the install prefix alternation loosened to `\S+`                                                                                                         | `test:contract-oracles`   | 18 fail: another prefix, a quoted other prefix, `evals-other`, the quote and digit forms of the prefix, and the quoted prefix with a trailing digit, each for the scorer and the oracle of O-031 |
| the prefix alternation widened by one character (`evals.?`)                                                                                              | `test:contract-oracles`   | 4 fail: `an install prefix with a closing quote only` and `with a trailing digit`                                                                                                                |
| the tier alternation widened by one character (`pr.?`)                                                                                                   | `test:contract-oracles`   | 4 fail: `a tier with a closing quote only` and `with a trailing digit`                                                                                                                           |
| each quoted alternative widened by one character (`'evals'.?`, `"evals".?`, `'evals/grader'.?`, `"evals/grader".?`, `'pr'.?`, `"pr".?`, one mutant each) | `test:contract-oracles`   | 2 fail per mutant: the matching `with a trailing digit` row, for the scorer and the oracle (`'evals'2`, `"evals"2`, `'evals/grader'2`, `"evals/grader"2`, `'pr'2`, `"pr"2`)                      |
| every `\s+` between the words of both patterns becoming `\s*`                                                                                            | `test:contract-oracles`   | 12 fail: the six run-together rows (`--prefixevals`, `npminstall`, `--evaluation'evals/grader'`, `--tier'pr'`, `tea-evaluateci`, `'evals/grader'--tier`), for the scorer and the oracle          |
| one `\s+` becoming `\s*`, each separator in turn (`npm install`, `--prefix`, `tea-evaluate ci`, `--evaluation`, the folder to `--tier`, `--tier`)        | `test:contract-oracles`   | 2 fail per mutant: the one run-together row of that separator, for the scorer and the oracle                                                                                                     |
| each alternation of quote forms reverted to independent `['"]?`                                                                                          | `test:contract-oracles`   | 12 fail: the mismatched, unterminated and closing-quote-only rows of the prefix, the folder and the tier                                                                                         |
| the `\s+` between the words replaced by one space                                                                                                        | `test:contract-oracles`   | 4 fail: the two folded-scalar rows, for the scorer and the oracle                                                                                                                                |
|                                                                                                                                                          | `test:probe-corpus`       | 1 problem: the baseline digest                                                                                                                                                                   |
| the quote forms removed from both patterns                                                                                                               | `test:probe-corpus`       | 5 problems: the same two `no longer holds`, the two clean-control outcomes and the digest                                                                                                        |
|                                                                                                                                                          | `test:contract-oracles`   | 84 fail: every row that carries a quote, and every row that expects the other oracle to hold                                                                                                     |
| the two `KNOWN_UNHELD` entries re-added                                                                                                                  | `test:probe-corpus`       | 2 problems: `command-evaluation-install` and `command-evaluation-ci-pr` `holds now, so it no longer belongs in KNOWN_UNHELD`                                                                     |
| the `holds now` branch of `storedRunProblems` removed                                                                                                    | `test:probe-corpus`       | 4 problems, one per stored-run suite: `an oracle listed in KNOWN_UNHELD that holds on every stored run was not reported`                                                                         |
| the listed-oracle exemption of `storedRunProblems` removed                                                                                               | `test:probe-corpus`       | 4 problems, one per stored-run suite: `a violated oracle listed in KNOWN_UNHELD was reported`                                                                                                    |
| the body of `cleanControlProblems` neutered (the `held` and `agrees` test replaced by `continue`)                                                        | `test:probe-corpus`       | 8 problems, two per stored-run suite: `a clean control outcome held with corroboration disagrees was not reported` and the `violated` one (`cleanControlSelfProblems`)                           |
| the contract rendered with the literal while the scorer reads the pattern                                                                                | `test:contract-oracles`   | 85 fail: `agrees with workflowHoldsToken` on every stored run that quotes the commands, and the quoted forms of the table                                                                        |
|                                                                                                                                                          | `test:probe-corpus`       | 2 problems, the only two: O-031 and O-032 `scored held with corroboration disagrees on the clean control` (`cleanControlProblems` alone sees it)                                                 |
| the scorer reads the literal while the contract renders the pattern                                                                                      | `test:contract-oracles`   | 85 fail, the same rows                                                                                                                                                                           |
|                                                                                                                                                          | `test:probe-corpus`       | 4 problems: both `no longer holds` and both clean-control outcomes                                                                                                                               |
| the scorer's `RegExp` given the `i` flag                                                                                                                 | `test:contract-oracles`   | 1 fails: `an upper-case tier: the scorer of O-032 says fail`                                                                                                                                     |
| `ciScoringInputs` keeping `contractPattern`                                                                                                              | `test:eval-replay`        | 16 fail: every plan-project case, `the ground truth moved`                                                                                                                                       |
| `expected-strength.json` with the ci `corpusDigest` as on `origin/main`                                                                                  | `test:probe-corpus`       | 1 problem: `expected-strength.json is out of date, first at line 205`                                                                                                                            |
| `isPatternAnchored` reduced to the first and last character (the old guard)                                                                              | `test:evaluate-ci-render` | 2 of 534 fail: the top-level alternation and the escaped final `$`                                                                                                                               |
| the top-level alternation test of `isPatternAnchored` removed                                                                                            | `test:evaluate-ci-render` | 1 fails: `contractPattern with an alternation at the top level`                                                                                                                                  |
| the escaped-dollar test of `isPatternAnchored` removed                                                                                                   | `test:evaluate-ci-render` | 1 fails: `contractPattern whose final dollar is escaped`                                                                                                                                         |
| the anchor branch of `validateCorpus` removed                                                                                                            | `test:evaluate-ci-render` | 4 of 534 fail: the pattern unanchored at its start and at its end, the top-level alternation and the escaped final `$`                                                                           |
| the check that the pattern matches its token removed                                                                                                     | `test:evaluate-ci-render` | 1 fails: `does not match its own contractToken`                                                                                                                                                  |
| the check that the pattern matches the element's command removed                                                                                         | `test:evaluate-ci-render` | 1 fails: `does not match the command` the element requests                                                                                                                                       |
| the whole `contractPattern` block of `validateCorpus` removed                                                                                            | `test:evaluate-ci-render` | 9 of 534 fail, one per guard case                                                                                                                                                                |
| both patterns removed from the ground truth, nothing regenerated                                                                                         | `test:contract-sources`   | fails: `test/contracts/ci.contract.json differs from its sources`; `test:probe-sources` fails on `test/probes/ci.probes.json`                                                                    |

The acceptance criteria's scratch-copy rows ran through `test:probe-corpus` with the stored plan capture edited in place (the `CI_CORRECT_RUNS` row of the project reads it):

| Edit of the stored workflow                         | `test:probe-corpus`                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| as stored, double-quoted folders and tier, unquoted | passes                                                                                                |
| no install command                                  | O-031 `no longer holds on the stored correct run`, and `scored violated ... disagrees` on the control |
| no ci command                                       | the same for O-032                                                                                    |
| `--tier nightly`                                    | the same for O-032                                                                                    |
| `--tier prod`                                       | the same for O-032                                                                                    |
| `npm install --prefix 'other'`                      | the same for O-031                                                                                    |
| `--evaluation 'other/grader'`                       | the same for O-032                                                                                    |

Removing the call to `knownUnheldProblems` together with the `holds now` branch leaves `test:probe-corpus` green: the machinery stays exercised while the call stays in `main`, and the branch rows above fail while it does.
The same holds for `cleanControlSelfProblems` and the body of `cleanControlProblems`.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.
Local, macOS, on the final tree:

- `node test/eval-contract-strength.js --suite ci --from-cache` on the scratch copy with the real cache: matches the recorded outcomes.
- `test:probe-corpus`, `test:probe-sources` (15 corpus files), `test:contract-sources` (16 contracts), `test:contracts`, `test:contract-oracles` (9,350 checks), `test:ci-qualification` (459), `test:eval-ci-data`, `test:eval-replay` (185 passed, 0 moved), `test:evaluate-ci-render` (534), `test:test-design-qualification` (240), `test:test-review-qualification` (604), `test:trace-qualification` (435), `test:nfr-qualification` (415).
- `lint`, `lint:md` and `format:check` clean.
- `test:doc-counts`, `test:doc-claims`, `test:shards`, `test:ci-coverage` and `test:changelog` once at the end.
- `git diff -- package.json package-lock.json` is empty.

## Build review

One pass of a general-purpose review subagent over the commit, read only.

It found the acceptance criteria met, the regex and generator logic correct, and the generated files moved as claimed (`expected-strength.json` in the ci `corpusDigest` only), and it listed stale prose and style items:

| Finding                                                                                                                                                    | Verdict | Route                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------- |
| `test-contract-oracles.js` comment and two messages, and `probe-scoring.js` comment, named `workflowMentions` as the ci scorer                             | valid   | Fixed here: they name `workflowHoldsToken`                     |
| The generator header, `test/probes/README.md`, `test-probe-corpus.js` and `test/contracts/README.md` called every ci oracle a plain substring claim        | valid   | Fixed here: each says two oracles state a quote-tolerant regex |
| Two sentences of the record carried an `X and not Y` and an `instead of` tail                                                                              | valid   | Fixed here                                                     |
| New comment blocks wrapped a sentence over two lines or put two sentences on one line (`eval-ci.js`, the generator, the contracts README, the corpus test) | valid   | Fixed here: one sentence per line                              |

Fix round 1 (coordinator review and adversarial reads) changed the patterns to balanced-quote alternations with `\s+` between the words, widened `checkCiCommandOraclesOnQuotedForms` to forty-one forms, added `cleanControlSelfProblems` and the operator's anchoring rule to `validateCorpus`, corrected the quote claim to the folder names the capture quotes, and reran every revert row above against the new patterns.
The baseline moved in the ci `corpusDigest` only (`sha256:4943e769`), and the rerun gates and the real-cache command match the figures in Gates.

Fix round 2 added twelve false rows to the form table: a quoted alternative with a trailing digit (`'evals'2`, `"evals"2`, `'evals/grader'2`, `"evals/grader"2`, `'pr'2`, `"pr"2`) and words that run together (`--prefixevals`, `npminstall`, `--evaluation'evals/grader'`, `--tier'pr'`, `tea-evaluateci`, `'evals/grader'--tier`).
Widening any quoted alternative and turning any `\s+` into `\s*` now fails by name, and the revert table above carries the mutants.
The revert table's pipe characters inside code spans are escaped, so it renders as a table again.
