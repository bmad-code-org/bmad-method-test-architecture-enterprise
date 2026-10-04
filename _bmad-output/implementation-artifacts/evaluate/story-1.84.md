---
title: "Story 1.84: Teach a Linux skill target's network declaration in the CI guide and rerun its live sessions"
type: 'feature'
created: '2026-10-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1daeb05a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.84 with its two amendments; Story 1.83 and its amendment)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.84 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-16, AD-18)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.83.md (the `egress` item, the limits line)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-2.4.md (Decisions, the live sessions)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The `ci-registry` example in `references/ci.md` is a `tea-skill-runner` entry with `RESERVATION_MODEL_KEY`.
On Linux every Bubblewrap target runs in a network namespace with a loopback and nothing else (Story 1.63), and since Story 1.83 an entry reaches a host only through the `egress` authorization on its registry entry.
The CI guide's live-check passage never says so, and its example lists no host, so a plan that follows the guide gives a Linux runner live checks that cannot reach the model provider.

**Approach:** One `bmad-workflow-builder` Edit of `references/ci.md` changes two things.
The `ci-registry` example lists the model provider's host, port and addresses in the `egress` item form, and the live-check passage says that on Linux the live checks also need the target's registry entry to carry that authorization and that the proxy carries `CONNECT` tunnels, so a client that opens none has no route.
`checkCiGuidance` holds the sentence as a marker and validates the example against the runtime schema.
The edit changes the SHA-256 that both `capture-record.json` files pin, so both live sessions (`tagged-release`, `nightly-deploy`) run again through the local Claude Code CLI as Story 2.4 describes, and each record is regenerated from its session's output.

## Boundaries & Constraints

**Always:** The guide change goes through `/bmad-workflow-builder` Edit with a clean Analyze gate (AD-16, AD-18).
The `ci.md` edit changes two things only.
Each session runs `claude -p` with `claude-sonnet-5-5` through the local Claude Code CLI with no API key, `acceptEdits` and the tools Read, Write, Edit, Glob, Grep and Bash, in a scratch copy under the scratchpad directory that holds the installed skill, `_bmad/tea/config.yaml`, `evals/node_modules/.bin/tea-evaluate` linked to `cli/evaluate.js`, `tiers` reset to the AI-feature evaluation's and one scored run with no baseline, and it gets the prompt the committed record held.
The scratch copy leaves out `capture-record.json` and any plan.
The committed plan and the `evaluation.json` are the files each session wrote, copied by hand.
A session that cannot be produced honestly is reported and never hand-edited.
Neither the scored run nor the accepted baseline is committed.

**Never:** an edit of `SKILL.md`, the plan template or the runtime; a plan or record typed by hand; a pin of the digest of a file the session did not read; a second live session run at the same time as the first.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                          | Input / State                                                                                        | Expected Output / Behavior                                                                                 | Error Handling                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Guide edited, records old         | `ci.md` differs from the digest in `sessionRead`                                                     | `test:evaluate-ci` fails with `references/ci.md changed since the live session read it`                    | the maintainer reruns the session                                                      |
| Example without its authorization | the tagged `ci-registry` example lists no `egress` item with a host, a port and addresses            | `test:evaluate-guidance` fails naming the example                                                          | n/a                                                                                    |
| Sentence removed                  | the live-check passage lacks the `egress` sentence, the `CONNECT` sentence or the namespace sentence | `test:evaluate-guidance` fails naming the missing text                                                     | n/a                                                                                    |
| Retired declaration restored      | the guide carries `"network": "host"`                                                                | `test:evaluate-guidance` fails with `ci.md still teaches "\"network\": \"host\""`                          | n/a                                                                                    |
| Session wrote schema 2 bytes      | the sessions ran on the schema 2 `evaluation.json`                                                   | the record declares no `migrations` entry and `wrote` digests the file as it stands                        | a migration entry beside schema 2 bytes fails `is not the file the live session wrote` |
| Older session's record            | a record that declares the Story 1.42 migration                                                      | the guard cases built from the committed record keep refusing a false, retyped, absent and extra migration | n/a                                                                                    |

</frozen-after-approval>

## Code Map

- `src/workflows/testarch/bmad-testarch-evaluate/references/ci.md`: `## Place the live checks` gains one paragraph (four sentences) before the `ci-registry` example, and the example gains the `egress` item.
- `test/test-evaluate-guidance.js`: `checkCiGuidance` holds the four sentences as whole lines (`requireLine`), runs `checkRetiredNetwork` over the guide, requires the example's `egress` to equal the `egress` of the harness guide's tagged `example:registry` and takes the runtime's `egressRegistryProblems` of the example as an argument (`main` awaits it, since the guide check is sync), and the negative cases name the failure they must raise. The cases delete the example's authorization, empty its list, remove the namespace sentence, the provider clause, the macOS sentence, the marker sentence and the `CONNECT` sentence, restore the retired declaration on a line of its own, widen the provider sentence with an empty `addresses` clause, insert a clause into the namespace sentence, follow the macOS sentence with another on its line, change the example's port, make its address a hostname, make its host a wildcard and drift one address from the harness item.
- `test/test-evaluate-ci.js`: `checkCaptureRecordGuard` builds the record of an older session from the committed one and adds the case for a migration a schema 2 session never needed.
- `test/fixtures/evaluate-ci-repos/{tagged-release,nightly-deploy}/capture-record.json` and `evals/answer-grade/ci/evaluation-ci-plan.json`: regenerated from the two sessions; `evals/answer-grade/evaluation.json` came back byte-identical to the committed file.
- `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, `story-1.83.md` (status `done`).
- Not changed: `SKILL.md`, `assets/evaluation-ci-plan.template.json`, `references/harness.md` (its registry fragment is the source of the example's host and addresses), the runtime, `test/lib/evaluate-ci-repos.js`.

## Tasks & Acceptance

- [x] Reproduce: a one-byte edit of `references/ci.md` in a scratch copy fails `test:evaluate-ci` with `references/ci.md changed since the live session read it`.
- [x] The builder Edit of `ci.md`, the marker and the example check in `checkCiGuidance`, the two reverts on a scratch copy.
- [x] Both live sessions, one at a time, and both records regenerated; `test:evaluate-ci` green.
- [x] The old records beside the edited guide fail `test:evaluate-ci` on a scratch copy.
- [x] CHANGELOG, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.84, with the amendment dated 2026-10-03 in Story 1.84's build.

## Reproduction

On a scratch copy of the tree under the scratchpad directory (never the working tree), one appended space in `references/ci.md` makes `node test/test-evaluate-ci.js` fail in `the plans of two repositories` with `tagged-release: references/ci.md changed since the live session read it; run the session again`.
The unedited tree passes the same suite.

## The live sessions

Both ran on this host (macOS) with Claude Code 2.1.288, one at a time, `claude -p "<prompt>" --model claude-sonnet-5-5 --allowedTools Read Write Edit Glob Grep Bash --permission-mode acceptEdits --output-format json` from the scratch repository, with no API key in the environment.
Neither session was denied by the permission classifier (`permission_denials` is empty in both outputs).
The prompt is the one the committed records held, byte for byte; it names Stage 12, the skill path, the configuration path, the evaluation, the maintainer's confirmation of the latest scored run as the baseline, the absent `bmad-testarch-ci` and the closing summary, and names no placement.

Each scratch copy held the committed repository without `capture-record.json`, the plan, `runs/` and `baseline/`; the skill copied to `.claude/skills/bmad-testarch-evaluate/` (the working tree's, with the edit); `_bmad/tea/config.yaml` with `tea_evaluations_folder: evals`; `evals/node_modules/.bin/tea-evaluate` linked to `cli/evaluate.js`, with `eval-quality` and the package itself linked into `evals/node_modules` so the evaluation's HTTP port adapter resolves its imports; `tiers` reset to `["pr", "scheduled"]`, the Story 1.24 evaluation's; and one scored run (`tea-evaluate run`, then `score`, 14 trial sets of 3 trials) with no baseline.

| Session          | Prompt                                      | Model               | Tools                               | Turns | Duration           | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------- | ------------------- | ----------------------------------- | ----- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tagged-release` | the committed record's (Stage 12, see file) | `claude-sonnet-5-5` | Read, Write, Edit, Glob, Grep, Bash | 18    | 390,994 ms (6m31s) | 11 checks: the seven `pr` checks, `preflight-live` on `merge`, `twin-run` and `held-out` (block) and `strength-comparison` (warn) on `release`; `tiers` `pr`, `merge`, `release`; every check at its default; `judge-calibration` dropped (no rubric); baseline accepted in the scratch copy; tier exits `pr` 11 (`oracle-agreement`), `merge` 0, `release` 2 (`twin-run`, `held-out`), as before the edit                                                                                          |
| `nightly-deploy` | the same                                    | `claude-sonnet-5-5` | the same                            | 18    | 522,008 ms (8m42s) | 14 checks: the seven `pr` checks, `preflight-live` on `merge`, the live set on `scheduled` (`nightly.yml`, all `warn`) and again on `release` (`deploy.yml`); `tiers` `pr`, `merge`, `scheduled`, `release`; baseline accepted; tier exits `pr` 11, `merge` 0, `scheduled` 0 with warnings, `release` 2, as before the edit; the session also wrote a helper script to `/tmp/mkplan.mjs`, outside its directory although the prompt says to work only inside it, and the plan content is unaffected |

The sessions placed their checks as the two sessions of Story 2.4 had.
Only the `reason` lines differ in the committed plans: all 11 of `tagged-release`'s and all 14 of `nightly-deploy`'s are worded anew, and no tier, enforcement, command, evidence or trigger changed.
Neither session had a registry entry to extend, since the fixture evaluation's one entry is an HTTP entry that starts the local stub and reaches no outside host, so neither plan carries an `egress` item; the guide's new sentence is the one the sessions read.
`evaluation.json` came back from both sessions byte-identical to the committed file (`tiers` at the plan's tiers).
Each session also wrote `test/eval-artifacts/evaluate/answer-grade/inspection-record.md` (the CI section only) and a `baseline/` in its scratch copy; neither is committed, as in Story 2.4.
The records took `model`, `turns` and `durationMs` from the output JSON, `claudeCodeVersion` from `claude --version`, the digests from the files, and `repositoryRead` from `test/lib/evaluate-ci-repos.js` over the committed repository, by `mkrecord.js` in the scratchpad directory (the generator is not committed; the digests are recomputable by `test:evaluate-ci`).

## Decisions

1. **The authorization teaches the harness guide's host and addresses.**
   The example lists `api.anthropic.com`, port 443 and the two addresses the harness guide's registry fragment resolved on a host, so the two guides show one provider and `checkCiGuidance` needs no second source of truth.
   The sentence tells the adopter to add "the addresses the host resolves to now", the instruction the harness guide gives.
2. **Four sentences in one paragraph, before the example.**
   The brief names two changes: the example, and the live-check passage with the authorization sentence and the `CONNECT` limit.
   The paragraph holds the marker sentence, the namespace reason, the `CONNECT` limit and the line that an entry listing no `egress` reaches no host while macOS ignores the field.
   The last line is the consequence an adopter on a macOS runner would otherwise ask about; the harness guide states both.
3. **The marker names `egress`.**
   The brief's phrase "that authorization" has no antecedent in a paragraph that follows the credential-key paragraph, so the sentence names `egress` and the hosts the target reaches.
   `checkCiGuidance` holds it, with the other three sentences.
4. **The example check holds the harness guide's item.**
   `checkCiGuidance` deep-equals the example's `egress` to the `egress` of the harness guide's tagged `example:registry` and reports every problem `egressRegistryProblems` finds in the example (`main` awaits it and passes it in), and `validate` keeps the entry on the runtime schema.
   One shape clause on each item would pass a port 80, a hostname in `addresses` and a wildcard host, which `check` or the harness item refuse.
   The check names no provider of its own, and the revert cases delete the whole item, empty the list or change one field.
5. **`checkRetiredNetwork` runs over `ci.md`.**
   The harness, adapters, run and gaps guides run it since Story 1.83; the CI guide had no `network` text then and has none now, and the check keeps it so.
6. **The records declare no migration.**
   Story 1.42 moved `evaluation.json` to schema 2 after the Story 2.4 sessions, so the old records carried a `migrations` entry and a `wrote` digest of the reversed bytes.
   Both new sessions started from the schema 2 file and left it as it was, so `wrote` digests the file as it stands and a `migrations` entry would be false.
   Story 1.103's acceptance criterion keeps the guard cases (a digest in the entry, a retyped `wrote`, an absent entry, an edit beyond the migration), so `checkCaptureRecordGuard` builds the record of an older session from the committed one (the schema 1 bytes by `reverseSchema2Migration`, their digest, the entry) and runs the same cases over it, plus one case that a schema 2 session's record with a migration entry fails `is not the file the live session wrote`.
   The machinery in `captureProblems` stays, since a later engine release can move `evaluation.json` again.
7. **The scratch copy links the package itself.**
   The evaluation's HTTP port adapter imports `eval-quality` and `bmad-method-test-architecture-enterprise`, so the scratch copy's `evals/node_modules` links both to the working tree's, as the private runtime Story 2.4 describes; the brief's `.bin/tea-evaluate` link alone ends the first `run` at `ERR_MODULE_NOT_FOUND`.
8. **The edit is gated twice.**
   The builder's Analyze ran as a delta (workflow-integrity, path-standards and script prepasses, `quick_validate`, one lens pass over the new paragraph and the example's item), recorded in the skill's gitignored `.memlog.md` as round 9: 0 critical, 0 high, 0 medium, 0 low new.
   The five path-standards highs in committed files (`SKILL.md` 20, `adapters.md` 22, `gaps.md` 99, `harness.md` 93, `run.md` 32) predate the edit and sit on untouched lines; `ci.md` has none.
   `test:evaluate-guidance` is the second gate and holds the paragraph.
9. **No new story.**
   The sessions' red tiers (`pr` 11 on `oracle-agreement`, `release` 2 on the strength floor) are Story 1.98's, which Story 2.4 filed.
   The sessions list two items for the adopter that the guide already asks for (confirm branch protection, edit a stale `CONTRIBUTING.md` line); neither is a defect of the product.

## Revert observations

Each revert ran once on a scratch copy of the final tree, after the review round 1 fixes, under the scratchpad directory (outside `/tmp` and the working tree), with the named suite run to its end.

| Revert (the one edit)                                                                                                                            | Suite run                | Observed                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One space appended to `references/ci.md` of the final tree (the reproduction ran on the tree before the edit)                                    | `test:evaluate-ci`       | exit 1: `tagged-release: references/ci.md changed since the live session read it; run the session again`                                                                                                                                               |
| The example's `egress` item deleted from `ci.md`                                                                                                 | `test:evaluate-guidance` | exit 1, 7 failures: ``ci.md registry example's `egress` differs from the harness guide's registry example`` and the six negative cases that edit the item, each `could not alter its fixture`                                                          |
| The first sentence of the paragraph deleted                                                                                                      | `test:evaluate-guidance` | exit 1, 2 failures: `ci.md live placement lacks the whole line` naming that sentence, and the negative case `ci egress sentence removal could not alter its fixture`                                                                                   |
| The old `capture-record.json` of both repositories (from the baseline commit) restored beside the edited guide                                   | `test:evaluate-ci`       | exit 1 in `the plans of two repositories`: `tagged-release: references/ci.md changed since the live session read it; run the session again` and `tagged-release: evals/answer-grade/ci/evaluation-ci-plan.json is not the file the live session wrote` |
| The four sentence markers in `test/test-evaluate-guidance.js` back to the old substrings (the first without its period, the second split in two) | `test:evaluate-guidance` | exit 1, 3 failures: the cases `ci egress sentence widened with an empty addresses clause`, `ci egress sentence with an inserted clause` and `ci macOS sentence followed by another on its line` each `passed the guidance gate`                        |
| The `isDeepStrictEqual` clause against the harness guide's item replaced by `false`                                                              | `test:evaluate-guidance` | exit 1, 4 failures: `ci registry example egress port changed` and `ci registry example egress drifts from the harness guide` each `passed the guidance gate`, with the two cases that delete or empty the list                                         |
| The loop over `egressProblems` emptied                                                                                                           | `test:evaluate-guidance` | exit 1, 2 failures: `ci registry example egress address a hostname` and `ci registry example egress host a wildcard` each `failed the guidance gate without the failure it targets`, since only the deep-equal still catches them                      |
| The `checkRetiredNetwork(guide, failures, 'ci.md')` call deleted                                                                                 | `test:evaluate-guidance` | exit 1, 1 failure: `ci retired network declaration restored passed the guidance gate`                                                                                                                                                                  |

The negative cases that report "could not alter its fixture" fail in the example and sentence deletions because the revert already removed what they remove; on the committed guide they remove it and the check fails on the content, which is the case's job.
Every other negative case passes on the committed tree, which shows the guide fails on each: the namespace sentence, the provider clause, the macOS sentence, the `CONNECT` sentence, the restored `"network"` declaration, the three rewordings of a sentence, and the port, hostname, wildcard and drift edits of the example.
Each case that targets a named check also names the failure it must raise, so a mutant caught by an unrelated check fails the case.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

- `test:evaluate-guidance` (green on the final tree, after the review fixes and the round 1 fixes), `test:evaluate-ci` (green, 3m39s on the round 1 tree, with both regenerated records), `test:evaluate-ci-render` 209 checks, `npm run lint` and `npm run format:check`: green.
- The final batch, run once on the tree after the review fixes: `lint:md` (981 files, 0 issues), `format:check`, `test:doc-counts` (0 disagreements), `test:doc-claims`, `test:shards` 183, `test:ci-coverage` (115 chain steps), `test:changelog` and `test:bmad-output-gated` 122: green.
- Engine check at the start and the end: exit 0.
  `git diff -- package.json package-lock.json` is empty.

## Build review

One fresh Opus subagent reviewed the diff read-only in place of `/bmad-code-review` (claims against the runtime, surviving mutants, digests and the Story 1.103 guard, writing rules, the record against the diff).
Every finding was checked against the code before it was acted on.

| Finding                                                                                                                                                                                                                            | Verdict                                                                                                                                                                                                         | Route                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium: the negative case that restores `"network": "host"` injected it into the tagged example, so the schema check failed it and deleting the new `checkRetiredNetwork` call survived                                            | valid; reproduced by deleting the call                                                                                                                                                                          | Fixed: the case appends a sentence that names the declaration after the macOS sentence, and with the call deleted on a scratch copy it fails alone (`ci retired network declaration restored passed the guidance gate`) |
| Medium: the record named a final gate batch and a findings table it did not hold                                                                                                                                                   | valid                                                                                                                                                                                                           | Fixed: both are written                                                                                                                                                                                                 |
| Low: the namespace sentence, the provider clause and the macOS sentence had no negative case, and `egress: []` passed the schema with only the length check to stop it                                                             | valid                                                                                                                                                                                                           | Fixed: one case each and one for the empty list                                                                                                                                                                         |
| Low: the example-deletion case pinned `api.anthropic.com` and 443, against Decision 4                                                                                                                                              | valid                                                                                                                                                                                                           | Fixed: the case matches any `egress` array                                                                                                                                                                              |
| Low: an antithesis tail in Decision 4, two sentences on one line in the Gates and in the test-design amendment, broken code spans in the revert table                                                                              | valid                                                                                                                                                                                                           | Fixed                                                                                                                                                                                                                   |
| Low: the new paragraph says "the target's registry entry", while `check` refuses `egress` on an HTTP entry that names no server                                                                                                    | skipped: the sentence speaks of the hosts the target reaches, and an entry that starts nothing reaches none, so the claim holds for every entry it applies to; changing it would also reopen both live sessions | none                                                                                                                                                                                                                    |
| Low: the epic's title and the sprint key still say "network declaration"                                                                                                                                                           | skipped: the title is the story's name from Story 1.61 and the key is its identity in the sprint file                                                                                                           | none                                                                                                                                                                                                                    |
| Low: the schema 1 digest of the guard's older-session record comes from the reversal the guard uses                                                                                                                                | valid, accepted by Decision 6: every lossy mutant the reviewer traced still dies on the change cases                                                                                                            | none                                                                                                                                                                                                                    |
| No finding in: the paragraph's claims against `confinement-egress.js`, `registry.js` and the harness guide; every `sessionRead`, `wrote` and `repositoryRead` digest recomputed for both repositories; the Story 1.103 guard cases | n/a                                                                                                                                                                                                             | n/a                                                                                                                                                                                                                     |

### Round 1

Two fresh Opus subagents reviewed the committed diff (PR #327) read-only; the capture digests, prompt, model, tools, turns, durations and plans all verified, and the guide sentences verified true against the code.
Every finding was reproduced before it was acted on.

| Finding                                                                                                                                                                                                                                                                                        | Verdict                                              | Route                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium: the four sentences were substring markers without their period, and the clause "so read the entry's `egress` and" lay between two markers, so an appended `addresses` clause, an inserted "remove every item" clause and an appended sentence each left `test:evaluate-guidance` green | valid; reproduced with the three rewordings          | Fixed: each sentence is held as a whole line (`requireLine`), the second marker is the whole second line, the three rewordings are negative cases, and the case runner takes the failure each case must raise. With the markers back to the old substrings on a scratch copy, the three cases pass the gate                                                                                                                                          |
| Low: the example check read the item's shape, so port 80, a hostname in `addresses` and the host `*.Anthropic.com` stayed green                                                                                                                                                                | valid; `egressRegistryProblems` refuses the last two | Fixed: the example's `egress` equals the harness guide's item and the runtime's `egressRegistryProblems` finds nothing in it (`main` awaits it and passes it in); the per-item shape clause is gone; four negative cases (port, hostname, wildcard, drift). Without the deep-equal the port and drift cases pass, and without the runtime check the hostname and wildcard cases fail on the deep-equal alone, which the case's named failure reports |
| Low: the `MIGRATION_FIELDS` assertion in `checkCaptureRecordGuard` checked `record.migrations`, which the test builds from exactly those fields two lines above                                                                                                                                | valid                                                | Fixed: the assertion is deleted (the `committed.migrations` assertion covers its purpose); the constant stays, since `captureProblems` uses it                                                                                                                                                                                                                                                                                                       |
| Low: the capture records' `command` field omitted `--model claude-sonnet-5-5` and `--output-format json`                                                                                                                                                                                       | valid                                                | Fixed in both records; no digest covers the field and no guard compares it                                                                                                                                                                                                                                                                                                                                                                           |
| Low: revert row 2 gave 2 failures where the final tree gives 3, the Code Map and the closing note listed four negative cases, and the `/tmp/mkplan.mjs` write of the `nightly-deploy` session was unrecorded                                                                                   | valid                                                | Fixed: every revert row reran on the final tree, the Code Map lists every case, and the session's outcome names the write                                                                                                                                                                                                                                                                                                                            |

### Round 2

One fresh Opus subagent reviewed the round 1 fix for regressions and material defects.
It found no dropped or weakened negative case, and every revert row reran true on the final tree.

| Finding                                                                                                                                                                                                                              | Verdict                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low: `ciEgressProblems` wrapped `egressRegistryProblems` in a `try` that returned no problems on any throw, so a failing runtime check passed the positive case on the real guide and went red only through unrelated negative cases | valid; reproduced by making `egressRegistryProblems` throw. Fixed: the wrapper returns the check directly and a crash reports under its real cause. `test:evaluate-guidance` stays green |

## Spec Change Log

- 2026-10-03: none after approval; the frozen intent is the brief's.

## Review Triage Log

Recorded under Build review above.
