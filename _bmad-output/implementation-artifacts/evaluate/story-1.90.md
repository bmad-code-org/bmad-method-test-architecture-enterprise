---
title: "Story 1.90: Verify the baseline manifest's file digests"
type: 'feature'
created: '2026-10-04'
baseline_commit: 'dc9df4d05b94c092ec9a300d96f2138a4f6c199c'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.90)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.90)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-12)'
  - '_bmad-output/implementation-artifacts/evaluate/story-2.1.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-2.5.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.98.md'
---

## Intent

**Problem:** `compare --accept` writes `baseline/baseline.json` with a `files` map of every baseline file's `digestBytes`, and nothing read those digests back.
A baseline file edited by hand passed `check` and `compare` while the manifest claimed otherwise.

**Approach:** One module, `cli/lib/evaluate/baseline-digests.js`, reads the bytes back and reports `baseline-digest` findings.
`check` runs it as a rule and a plain `compare` runs it before it reads any of the baseline's evidence.

## What changed

- `cli/lib/evaluate/baseline-digests.js` is new.
  `baselineDigestFindings({ folder, digestBytes })` walks `baseline/` through real directories only, opens every file without following a link, and reports one finding per defect, each naming its file under `baseline/`.
  A file whose bytes digest to something other than the map's entry, a map entry whose file is missing or is not a regular file, a file other than `baseline.json` with no entry in the map, a map key that is not a path inside `baseline/`, and a manifest that cannot be read as a JSON object holding a `files` map each produce a finding.
  A `baseline/` with no `baseline.json` is authored qualification evidence only when every file in it is under `probes/` or `qualification/` or is a placeholder `README.md` (the `valid` fixture and the gap-loop `before` placeholder hold exactly that), and then has nothing to verify.
  Any other file without a manifest (`run.json`, `scores/`, `trials/`, `trial-sets.json`) is reported as the missing manifest, so deleting `baseline.json` and `run.json` from an accepted snapshot cannot switch the rule off.
  The existence probe for a listed path is total: a name past the file system's limit (`ENAMETOOLONG`) or a path through a link loop (`ELOOP`) is a `baseline-digest` finding on that key, `cannot be examined: <code>`, and never a throw.
  The module requires only `score-inputs.js`, because `check.js` is reached from `preflight.js`, which `score.js` and `compare.js` require, so a module that imported `compare.js` would be a cycle.
- `cli/lib/evaluate/check.js` adds `checkBaselineDigests`, so `check` reports the `baseline-digest` rule and exits 10.
- `cli/lib/evaluate/compare.js` runs the helper right after the tree check and before `run.json`, `trial-sets.json` or any evidence artifact of the baseline is read.
  A failing baseline exits 10 with every finding and the message `baseline/ fails baseline.json's file digests (N problem(s)); no verdict was given and nothing was read of its evidence or written`.
  `compare --accept` is unchanged: it replaces `baseline/` wholesale from a run, so an edited baseline is no obstacle to a reviewed re-accept.
- `docs/reference/tea-evaluate-cli.md` lists `baseline-digest` in the `check` rule list (the rule count reads thirty-two) and describes the refusal in the `compare` section.
- `_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md` AD-12 records the verification as an amendment.
- `test/test-evaluate-check.js` accepts a baseline through the real CLI and runs `check` over it (exit 0), then over twelve planted defects (one byte appended to a listed file, a listed file deleted, an unlisted file, a manifest entry that is a directory, a listed file replaced by a link to a file with the same bytes, a manifest key that climbs out of `baseline/`, a manifest with no `files` map, a snapshot whose manifest was deleted, a directory of listed files replaced by a file, a snapshot whose manifest and `run.json` were deleted and whose evidence was edited by one byte, a manifest key with a 300-character name, a manifest key through a link loop) and over three of them at once.
  Each defect exits 10 with a `baseline-digest` line that names the file and says why.
  Each case also asserts that `check` did not throw.
  A static case fails when the reference's `check` rule list has no `baseline-digest` row or its `compare` section does not name the rule.
- `test/test-evaluate-compare.js` runs a plain `compare` over a freshly accepted baseline (exit 0, `compared:`), then over a baseline with a one-byte edit of an evidence artifact that still meets its schema, with evidence weakened by hand, with an evidence artifact off the engine schema, with a listed file deleted, with an unlisted file and with no manifest.
  Each exits 10 with the named `baseline-digest` finding, no `compared:` or `refused:` verdict, no `engine-schema` or `baseline-file` finding (so no evidence was read) and the same finding from `check`.
  Three planted defects are all listed, and a `--accept` over that folder yields a baseline that passes `check` and `compare` again.
  Four existing cases that plant a defect below the digest check (a baseline `run.json` that is not an object, an evidence artifact off its schema, an index missing a probe, weakened baseline evidence) reseal the manifest first, so the defect they name is the one that refuses.
- `test/test-evaluate-ci.js` and `test/lib/evaluate-baseline.js`: the two `test:evaluate-ci` cases that edit an accepted baseline now reseal its manifest or assert the `baseline-digest` finding that `check` adds (see the review findings below).

### Suites that fail on main

On `origin/main` (dc9df4d0), `test:evaluate-dogfood` and the `suite`, `ai-feature`, `test-review` and `gap-loop` scripts of `test:evaluate-pr-*` fail on Story 1.96's `tiers` rule: `evaluation.json` `tiers` differs from the tiers the plan places a check on.
Lane 4 repairs that in its own PR, and this PR does not touch those four `evaluation.json` files.
The failing lines in this branch's logs are the `[tiers]` finding alone; no `baseline-digest` line appears in any of them.

## Committed fixture baselines

`baselineDigestFindings` ran over every committed `baseline/` under `test/` (fourteen folders: the `valid` fixture, the `before` placeholder, and twelve accepted baselines).
All fourteen pass, so no baseline was re-accepted, no `epic-2-proof.md` table moved and no evidence was recorded again.

## Revert observations

Each mutation was applied in a scratch copy of the tree (`/private/tmp/.../scratchpad/mut-*`).
The scratch run of `test:evaluate-check` kept only the two Story 1.90 functions.

| Mutation                                                                                         | Result                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The digest comparison removed from the helper                                                    | `check`: `a baseline file edited by one byte: check exited 0; expected 10`. `compare`: the one-byte edit reaches `compared: 2 probe(s)`.                                                         |
| The helper call removed from `compare`                                                           | `compare`: the one-byte edit reaches `compared: 2 probe(s)`.                                                                                                                                     |
| The rule removed from `check`                                                                    | 26 of 58 checks fail, the first `a baseline file edited by one byte: check exited 0; expected 10`.                                                                                               |
| Missing listed files ignored                                                                     | `check` and `compare` both fail on `a file the manifest lists, deleted`.                                                                                                                         |
| Unlisted files ignored                                                                           | `check` and `compare` both fail on `a file the manifest does not list`.                                                                                                                          |
| A clean baseline refused                                                                         | `check` fails `check over a freshly accepted baseline exited 10; expected 0`, and `compare` fails at its accept-time `check`.                                                                    |
| The digest check moved after the baseline's evidence is read                                     | `compare` fails on `a baseline evidence artifact off its schema` (an `engine-schema` finding appears first).                                                                                     |
| A snapshot with no manifest ignored                                                              | `check` fails `a snapshot whose manifest was deleted`, `compare` fails `a baseline with no manifest`.                                                                                            |
| A manifest key that climbs out of `baseline/` accepted                                           | `check` fails `a manifest entry that climbs out of baseline/`.                                                                                                                                   |
| The exemption keyed on `run.json` again (a manifest-less `baseline/` without `run.json` skipped) | `check` fails `a snapshot whose manifest and run.json were deleted and whose evidence was edited by one byte` (2 of 58 checks); `compare` fails `a baseline with neither manifest nor run.json`. |
| The existence probe rethrows instead of reporting `cannot be examined`                           | `check` fails 7 of 58 checks, the first `a manifest entry with a name past the file system limit: check exited 1; expected 10`; `compare` exits 12 on the same case.                             |
| `baseline-digest` removed from the reference's `check` rule list, or from its `compare` section  | `check` fails ``the reference's check rule list has no `baseline-digest` row`` and ``the reference's compare section does not name the `baseline-digest` rule``, one each.                       |

## Gates

Run serially, one evaluate suite at a time.

- `npm run test:evaluate-check`: all 1290 checks pass.
- `npm run test:evaluate-compare`: passes (64 seconds).
- `npm run test:evaluate-ci`: passes (about 4 minutes).
- `npm run test:evaluate-authoring`, `test:evaluate-gap-loop`: pass.
- `npm run test:evaluate-pr-mcp`, `-api`, `-workflow`, `-tool-use`, `-promptfoo` and `-learn`: exit 0.
  `-suite`, `-ai-feature`, `-test-review` and `-gap-loop` exit 1 on the `[tiers]` finding described above, the same as on main.
- `node test/test-evaluate-ci.js --only="the pr tier of TeA itself"`: passes.
- `npm run test:doc-counts`, `test:doc-claims`, `docs:validate-links`, `lint:md`, `eslint` over `cli/` and `test/`, `prettier --check` over every touched file: clean.

## Review findings fixed

One Opus reviewer read the diff, tried manifest shapes (non-string entries, `__proto__`, case and unicode paths, links, directories, a missing manifest) and the import graph, and found two defects.

- `test:evaluate-ci` step "A baseline another engine measured" edits `baseline/run.json` of an accepted baseline and expected a `refused` comparison, which the digest check now precedes with exit 10.
  `resealBaseline` moved from `test-evaluate-compare.js` to `test/lib/evaluate-baseline.js`, and the step reseals the manifest after each edit so the baseline is a consistent one measured by another engine.
- The reference said "thirty-one rules" over 32 rows; it now says thirty-two.

The suite run found two more.

- `test:evaluate-ci` `checkPrReplay` flips one evidence byte and expected every check but `replay` to exit 0; `check` now exits 10 on the same edit with a `baseline-digest` finding, so the case asserts that row and that finding.
- A directory of listed files replaced by a file made the helper throw `ENOTDIR` (`check` exit 12 in `test:evaluate-ci` `baseline integrity`).
  `lstatOrNull` treats `ENOTDIR` as absent, the listed files report as missing, and a `test:evaluate-check` case plants it.

## Review round 1

A reviewer proved two code defects in a scratch copy, and a claims reviewer found record and prose errors.
Each is fixed.

- **The existence probe was not total.** A manifest key with a segment past `NAME_MAX` threw `ENAMETOOLONG` (`check` exited 1 with a stack trace, `compare` exited 12), and a key through a link loop threw `ELOOP`, which also hid the `baseline-file` finding for the link.
  The probe now turns any error other than absence into a `baseline-digest` finding on that key, `cannot be examined: <code>`.
  `test:evaluate-check` plants a 300-character key and a link-loop key (the loop case also expects the `baseline-file` finding), every case asserts that `check` did not throw, and `test:evaluate-compare` plants the long key (exit 10, no verdict).
- **The authored-evidence exemption was an escape hatch.** A `baseline/` with neither `baseline.json` nor `run.json` was skipped, so deleting both from an accepted snapshot switched the rule off for `scores/`, `trials/` and `trial-sets.json`, and one edited evidence byte passed `check`.
  A manifest-less `baseline/` now counts as authored qualification evidence only when every file is under `probes/` or `qualification/` or is a placeholder `README.md`; anything else reports the missing manifest.
  The helper header, the `check.js` header, the reference row, the AD-12 amendment, the CHANGELOG entry and this record state that rule.
  A `test:evaluate-check` case deletes both files and edits an evidence byte, a `test:evaluate-compare` case deletes both files, and the fourteen committed baselines still pass.
- **Record and prose.** The rule count reads thirty-two, the stale mutation count is replaced by the rerun over the committed test (26 of 58), the check test header describes its cases as they are, the AD-12 amendment and this record no longer use the rejected-clause phrasing, and the claim that Story 1.91 reuses the module is gone.
