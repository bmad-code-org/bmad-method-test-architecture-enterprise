---
title: "Story 1.3: Register Evaluate as a TEA skill"
type: 'feature'
created: '2026-09-23'
status: 'review'
route: 'dispatch'
review_loop_iteration: 2
baseline_commit: '1054b066bcc8b1f6db1e9ef2555ab2b22b7d97f1'
context: []
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** Evaluate has no menu entry. A TEA user cannot start an evaluation the way they start every other TEA workflow, and no precedent exists yet for the lean skill shape (AD-3) later Evaluate stories build on.

**Approach:** Build `bmad-testarch-evaluate` as TEA's first lean skill (`SKILL.md`, `customize.toml`, `references/`, `assets/`; no `workflow.yaml`, `steps-c/`, `instructions.md`, `checklist.md`), register it on the agent menu as `EV`, add its routing intent to the `bmad-tea-routing` eval corpus, and re-anchor that corpus's frozen live-routing evidence since the corpus grows past what it recorded.

## Boundaries & Constraints

**Always:** the skill keeps TEA's activation contract; `references/` holds twelve placeholder stage guides in the fixed order epics.md names; the historical routing evidence stays byte-verified for its original eighteen cases while admitting the nineteenth; `npm test` green at the end.

**Never:** build any runtime code under `cli/lib/evaluate/` (Story 1.4); write real content into the stage guides (Stories 1.12 onward); touch `sprint-status.yaml` beyond this story's own row.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Lean shape discriminator | a skill directory | lean iff neither `workflow.yaml` nor `steps-c/` exist | a directory with `steps-c/` and no `workflow.yaml` classifies house, not lean |
| Routing corpus grows | 19th intent added to `intents.json`/`ground-truth.json` | `bmad-tea` routes it to `EV`; historical evidence for the original 18 stays byte-verified | editing one recorded case's intent or ground truth fails `test:eval-routing-evidence` |
| npm packaging | `.memlog.md`/`.analysis/` planted under the skill directory | excluded from `npm pack` | `.gitignore`/`.npmignore` alone do not exclude a path under a `files`-array directory entry; only a negated `files` pattern does (verified live) |

</frozen-after-approval>

## Code Map

- `src/workflows/testarch/bmad-testarch-evaluate/` -- new lean skill: `SKILL.md` (activation contract + twelve-stage inline workflow + `## On Complete`), `customize.toml` (house template), `references/*.md` (twelve one-paragraph placeholders), `assets/README.md`.
- `src/module-help.csv`, `src/agents/bmad-tea/customize.toml`, `.claude-plugin/marketplace.json`, `src/module.yaml` -- registration set (AD-2): CSV row, `[[agent.menu]]` entry, marketplace skill path, `tea_evaluations_folder` config variable.
- `test/test-installation-components.js` -- new "Test Suite 5: Lean Skill Shape" (discriminator proof against real and temp fixtures, required/forbidden files, activation-contract substrings, marketplace listing, non-vacuous `npm pack --dry-run` builder-artifact exclusion); `EV` added to Test Suite 2's `expectedMenu`; `tea_evaluations_folder` assertions in Test Suite 1.
- `test/test-evaluate-guidance.js` (new) -- parses `SKILL.md`'s `## Workflow` section (scoped past the Conventions bullet's own example path) for the twelve-stage list, asserts order and that each `references/<stage>.md` exists and is non-empty.
- `tools/validate-tea-workflow-descriptions.js` -- generalized from a hard-coded `bmad-teach-me-testing` exception to discovering every workflow directory's description source (`workflow.yaml` if present, else `SKILL.md`); exports `validateFile`/`collectFiles` for testability.
- `test/test-tea-workflow-descriptions.js` (new) -- wraps the tool: runs it against the real repository, then proves the lean-skill path against a temp fixture missing its description.
- `test/fixtures/tea-routing-eval/{intents,ground-truth}.json` -- new case `prove-refund-agent-behavior` (route, `EV`).
- `test/contracts/tea-routing-{intents,controls}.contract.json`, `test/probes/tea-routing-{intents,controls}.probes.json`, `test/probes/expected-strength.json` -- regenerated (`node tools/generate-contracts.js`, `node tools/generate-probes.js`, `node test/test-probe-corpus.js --write`).
- `test/test-routing-evidence.js` -- rewritten from a whole-file digest check (broken by the 19th case) to per-case snapshot verification against `test/results/live-eval-remediation/story-1-3/cases/*.json` (18 frozen snapshots, new in this story), plus a signature-prefix check on every "none"-failure-class diagnostic against the case's recorded ground truth.
- `test/evals/suite-manifest.json` -- `deferred` entry for `bmad-testarch-evaluate` (Story 1.16 closes it); `caseCount` 18 → 19.
- `test/lib/doc-claim-sources.js`, `eval-quality.config.json` -- `NO_SKILLS_DEFERRED`/`EVERY_SKILL_HAS_A_BEHAVIORAL_SUITE` removed (the claim they backed is now false by design); `TEN_WIRED_FOUR_FUTURE` → `ELEVEN_WIRED_FOUR_FUTURE`; a new `read`-settled, hash-pinned claim for the "exactly one skill deferred" sentence.
- `package.json` -- new `test:evaluate-guidance` script; `files` array gains `!src/workflows/testarch/*/.memlog.md` and `!src/workflows/testarch/*/.analysis/**` (see Implementation Notes).
- `.github/workflows/quality.yaml` -- step for `test:evaluate-guidance`.
- `.gitignore` -- `.memlog.md`/`.analysis/` patterns for local git hygiene (kept alongside the `files`-array fix, which is what actually controls packaging).
- `README.md`, `docs/index.md`, `docs/explanation/{eval-quality-roadmap,eval-quality-adoption-guide,tea-overview,testing-as-engineering,step-file-architecture,verification-architecture,engagement-models}.md`, `docs/glossary/index.md`, `docs/reference/configuration.md`, `test/contracts/README.md` -- workflow/skill counts and routing-corpus counts updated for the tenth workflow and nineteenth intent; `tea_evaluations_folder` documented; `EV` added to the command catalog and menu-code enumeration.

## Tasks & Acceptance

**Execution:**

- [x] `src/workflows/testarch/bmad-testarch-evaluate/` -- author the lean skill by hand, matching what `/bmad-workflow-builder` Build would produce for this shape -- see Implementation Notes for why headless invocation of the generic builder was not used verbatim.
- [x] Registration set -- CSV row, agent menu entry, marketplace path, `tea_evaluations_folder` variable.
- [x] Routing corpus -- snapshot the 18 original cases, add the `EV` intent, regenerate contracts/probes, re-anchor `test-routing-evidence.js`.
- [x] `test/test-evaluate-guidance.js`, `test/test-tea-workflow-descriptions.js`, Test Suite 5 -- new/extended test coverage.
- [x] Live `npm run eval:routing` -- run and record.
- [x] CHANGELOG, sprint-status.yaml.

**Acceptance Criteria (epics.md Story 1.3, condensed; see that file for the full text):**

- Given no skill exists at the target path, when built, then it has exactly `SKILL.md`, `customize.toml`, `references/`, `assets/` and none of the house-shape files, and keeps the activation contract. **Met** -- Test Suite 5.
- Given `test/test-evaluate-guidance.js`, when it parses `SKILL.md`, then it asserts twelve stages each naming an existing `references/<stage>.md`. **Met.**
- Given the AD-2 registration set, when it lands, then the CSV row, menu entry, marketplace path, `tea_evaluations_folder` variable, and `expectedMenu` all exist. **Met** -- reverting the menu entry verified to fail `test:install` (2 assertions).
- Given the routing corpus, when the EV intent is added, then contracts/probes regenerate, historical evidence re-anchors admitting the new case while holding the original 18 byte-verified, and a live run routes EV correctly in both repetitions. **Met** -- three independent live `eval:routing` runs, `EV` case 2/2 correct in every run; editing a recorded case verified to fail `test:eval-routing-evidence`.
- Given the lean/house discriminator, when a skill has `steps-c/` and no `workflow.yaml`, then it classifies house. **Met** -- `bmad-teach-me-testing` and a temp fixture both verified.
- Given the description validator, when a lean skill has no `workflow.yaml`, then its `SKILL.md` frontmatter is read instead of a hard-coded path, with a negative case for a missing description. **Met.**
- Given `npm pack --dry-run`, when `.memlog.md`/`.analysis/` exist under the skill, then neither is packed. **Met** -- see Implementation Notes for the real defect this uncovered and fixed.
- Given documentation counts, when the workflow list grows to ten, then `test:doc-counts` and `test:doc-claims` pass. **Met.**
- Given the skill and registration changes, when `/bmad-workflow-builder` Analyze and `/bmad-module-builder` Validate Module run, then zero new critical/high findings. **Met** -- see Review Triage Log.

## Implementation Notes

**Build mechanism.** `/bmad-workflow-builder` Build was activated headless and its `On Activation` steps followed (customization resolved, no persistent facts, no prepend/append steps), but its generic `init_skill.py` scaffolder targets `{bmad_builder_output_folder}` (`{project-root}/skills`) and produces a generic Claude Skill template, not TEA's house activation-contract shape. Rather than build there and hand-migrate, the skill was authored directly at the correct path in the exact shape `bmad-teach-me-testing`'s precedent establishes for the boilerplate parts (Conventions, On Activation steps 1-6, verbatim), then validated with the builder's own tooling: `quick_validate.py` and `scan-path-standards.py` pass (frontmatter is `name`/`description` only, every path is `{project-root}`- or `{skill-root}`-anchored, no `../`, no absolute paths), and a full Analyze pass ran as five parallel subagent lenses plus the deterministic pre-pass. This is recorded as a deviation from the literal "Build runs headless" instruction because the generic builder's own scaffold would not have produced a compliant result; the finished artifact was still validated by every mechanism the AC names.

**Deterministic pre-pass finding, skipped.** `prepass-workflow-integrity.py` raised one high finding, "Missing `## Overview` section." Skipped: no TEA workflow skill has an `## Overview` heading (the `**Goal:**`/`**Role:**` pair is the house convention `test/test-installation-components.js` and every sibling `SKILL.md` already enforce), so adding one would contradict the repository's own established shape rather than fix a real gap.

**Analyze lens findings, fixed.** Architecture flagged the frontmatter description's summary clause at ~24 words against the house convention's 5-8; shortened to match `module-help.csv`'s own phrasing. Customization flagged `on_complete` declared in `customize.toml` but never resolved anywhere in the skill (every sibling skill wires it at its terminal step); added an `## On Complete` section after Stage 12, matching the sibling pattern verbatim. Leanness, Determinism, and Enhancement lenses returned clean passes (Enhancement noted one low-severity, explicitly-deferred observation about the stage-resume prompt, tracked for Story 1.4 and not actioned now).

**VM staged gate.** Built the `<tmp>/tea-setup/` staging AD-17 describes (stub `SKILL.md` + `assets/{module.yaml,module-help.csv}` copied from `src/`, every `src/workflows/testarch/*` skill symlinked as a sibling of `tea-setup/`) for both `origin/main` and the branch, and ran `bmad-module-builder`'s `validate-module.py` on each. Both produced the identical five findings AD-17 names as the pre-existing baseline (the `_meta` row, `bmad-create-story:create`'s cross-module reference, and three fields on that same `_meta` row) -- zero new critical or high findings from this story's registration.

**A real npm packaging defect, found and fixed.** The AC's `npm pack --dry-run` check was initially written as an assertion over the already-clean working tree, which a code-review pass correctly flagged as vacuous. Rewriting it to plant real `.memlog.md`/`.analysis/report.md` fixtures and assert their exclusion failed immediately: `npm pack` packed them anyway, live-verified with and without a `.npmignore` carrying the same patterns. The root cause is an npm behavior, not a bug in this repository's `.gitignore`: `package.json`'s `files` array lists `src` as a directory entry, and npm includes everything under a `files`-array directory regardless of `.gitignore` or `.npmignore` -- `git check-ignore` confirms git itself ignores the paths correctly, but npm's own pack-time file walk does not consult either ignore file once a parent directory is named in `files`. The fix is a negated pattern inside `files` itself (`!src/workflows/testarch/*/.memlog.md`, `!src/workflows/testarch/*/.analysis/**`), which is the only mechanism that actually works; verified live before and after. The `.gitignore` entries stay, since they still matter for local `git status` hygiene, but the CHANGELOG and this record are explicit that they are not what makes packaging safe. This is a pre-existing latent gap (any prior local `npm pack`/`npm publish` run with stray builder files anywhere under `src/` or `cli/` would have shipped them) and is fixed rather than deferred, since it was found while working the surrounding acceptance criterion.

**Test-routing-evidence, hardened past the first pass.** Two independent reviewers converged on the same finding: replacing the whole-corpus digest check with per-case snapshots dropped the only assertion that ever read the frozen evidence's `signature` field for passing diagnostics, so a tampered per-case routing outcome in the frozen evidence would go undetected as long as the file's own aggregate block was left alone (verified live: editing one diagnostic's `signature` to a wrong route left the suite green). Fixed by checking every "none"-failure-class diagnostic's `signature` against the deterministic prefix (`action|menuCode|workflow|`) its case's frozen ground truth requires, leaving only the non-deterministic candidate-naming suffix unconstrained. Verified live: the same tampering now fails with a precise diff, and reverting it passes again. A second finding (missing/corrupt snapshot files aborting the whole loop instead of accumulating a failure) and a third (the evidence contract's `fixtureDigest`/`recordFixtureDigest` fields going fully unread) were also fixed: the former now accumulates into `failures[]` per case, the latter now gets a structural `sha256:` shape check documenting why the fields are no longer compared against anything live.

**`test-tea-workflow-descriptions.js`, hardened.** Fixed two real gaps a reviewer found: the real-repository failure path read `error.stdout`, but the tool prints failures via `console.error` (stderr), so a real failure's detail was silently dropped in favor of `execFileSync`'s generic message; and `main()` had no top-level `.catch()`, so a throw before its own try/catch (e.g. `fs.mkdtempSync`) would surface as an unhandled rejection instead of the script's structured failure report.

**`isLeanSkill`, hardened.** A reviewer found that a workflow directory that does not exist at all would satisfy `!hasWorkflowYaml && !hasStepsC` and misclassify as lean; added an existence guard.

**Documentation sweep.** Fixing the doc-claims/doc-counts gates surfaced, and this story also fixes, a wider set of now-stale prose two blind-hunter passes found: `docs/index.md`'s workflow count (the CHANGELOG had already, incorrectly, claimed this file was updated); the ten cross-reference pages still saying "nine workflows"; `tea-overview.md`'s command catalog table and menu-code enumeration missing `evaluate`/`EV`; README's ASCII lifecycle diagram and "Current Eval Coverage" table missing an Evaluate row; "eighteen intents" prose (distinct from the `eval:all` call-count sentences doc-counts already gates) in README, the roadmap, the adoption guide, and `test/contracts/README.md`; and `module-help.csv`'s EV row copy-pasting `test_artifacts` as its output-location instead of the actually-documented `tea_evaluations_folder`. The doc-claims mechanism itself gained a `read`-settled, hash-pinned entry for the "exactly one skill is deferred" sentence, closing a gap where a second skill quietly becoming deferred later would have gone unchecked (the two booleans it replaces only ever asserted "zero deferred," which this story's own change makes permanently false).

**Live routing runs.** Ran `npm run eval:routing` three times. The first two each showed one unrelated case losing a repetition to a `the runner wrote <file> under a read-only declaration` environment failure; both were traced to this session itself editing repository files while the live run was still executing in the background (the harness's read-only check watches the whole working tree, not a per-case sandbox, since a routing call needs none). The third run, with no concurrent edits, completed all 19 cases at both repetitions with a genuine quality-metric miss (`reason token recall` 78% against an 80% threshold) that is pre-existing and unrelated to this story: every one of the three runs showed the same aggregate shortfall, driven by unrelated pre-existing cases, while `prove-refund-agent-behavior` (`EV`) scored full reason-token recall (2/2) in all three runs. `eval:routing`'s live mode is not part of `npm test`; only `--validate-only` is chained there, and it passes.

## Spec Change Log

_None._

## Review Triage Log

Layers: `/bmad-workflow-builder` Analyze (deterministic pre-pass + five parallel lenses: leanness, architecture, determinism, customization, enhancement), `/bmad-module-builder` Validate Module (staged, main vs. branch), `/bmad-code-review` (blind hunter, edge-case hunter, verification-gap, three parallel subagents), one adversarial test-quality pass over the new/changed test files.

| # | Source | Finding | Verdict | Route |
| --- | --- | --- | --- | --- |
| 1 | pre-pass | `SKILL.md` has no `## Overview` section | false: contradicts the house convention every sibling `SKILL.md` and `test-installation-components.js` already enforce | reject |
| 2 | architecture lens | frontmatter description summary clause ~24 words against the house 5-8 word convention | medium | patch: shortened, reused `module-help.csv`'s phrasing |
| 3 | customization lens | `on_complete` declared in `customize.toml`, never resolved or executed anywhere in the skill | high | patch: `## On Complete` section added after Stage 12 |
| 4 | enhancement lens | stage-resume prompt is interactive-only until Story 1.4's state file exists | low, informational | deferred to Story 1.4, no action this story |
| 5 | leanness, determinism lenses | -- | clean, no findings | -- |
| 6 | VM staged gate | `_meta` row, `bmad-create-story:create` cross-module reference, three fields on the `_meta` row | pre-existing baseline (AD-17 names these); identical on main and branch | reject (not new) |
| 7 | blind hunter | `docs/index.md` still "nine workflows"; CHANGELOG falsely claimed it was updated | medium | patch: doc fixed |
| 8 | blind hunter | `module-help.csv`'s EV row copies `test_artifacts` as output-location instead of `tea_evaluations_folder` | medium | patch |
| 9 | blind hunter | README's ASCII lifecycle diagram has no EV edge | low | patch |
| 10 | blind hunter | README's "Current Eval Coverage" table has no Evaluate row | medium | patch: added, marked deferred |
| 11 | blind hunter | "eighteen intents" prose stale in README, roadmap, adoption guide (separate from the already-gated call-count sentences) | medium | patch |
| 12 | blind hunter | `test/contracts/README.md`'s AD-39 split explanation says eighteen/ten | medium | patch |
| 13 | blind hunter | `tea-overview.md` menu-code enumeration and command catalog omit EV; five more pages cite it as "the nine workflows" | medium | patch: all fixed |
| 14 | blind hunter | doc-claims mechanism has no machine check left for "no second skill silently deferred" | medium | patch: new `read`-settled, hash-pinned claim |
| 15 | blind hunter, edge-case hunter | `test-routing-evidence.js` drops the only reader of `contract.fixtureDigest`/`recordFixtureDigest` | medium (two independent sources) | patch: structural `sha256:` shape check added with a comment explaining why it is no longer compared live |
| 16 | blind hunter, edge-case hunter | `test-evaluate-guidance.js`'s stage-extraction regex is file-wide, not scoped to `## Workflow`, and only passes today by coincidence (Conventions' own example path happens to name Stage 1) | medium (two independent sources) | patch: scoped to the `## Workflow` section |
| 17 | edge-case hunter | `test-tea-workflow-descriptions.js` reads `error.stdout` on failure, but the tool's failures print to stderr | medium | patch |
| 18 | edge-case hunter | `test-tea-workflow-descriptions.js`'s `main()` has no `.catch()` | medium | patch |
| 19 | edge-case hunter | `test-routing-evidence.js`'s snapshot read throws instead of accumulating a failure, aborting the remaining case loop | medium | patch |
| 20 | edge-case hunter | `isLeanSkill` misclassifies a missing directory as lean | low | patch |
| 21 | verification-gap | -- | clean, no findings; every changed deterministic surface traced to its test boundary and confirmed to actually observe the changed behavior | -- |
| 22 | test-quality adversarial | `npm pack --dry-run` builder-artifact check asserts only the already-clean state, never plants a fixture; vacuous | high, live-verified | patch: plants real `.memlog.md`/`.analysis/report.md`, which then uncovered finding 23 |
| 23 | test-quality adversarial (via finding 22's fixture) | `.gitignore` alone does not stop `npm pack` from packing files under a `files`-array directory entry | high, live-verified | patch: negated `files`-array patterns added to `package.json`; this is the real fix, `.gitignore` kept for local git hygiene only |
| 24 | test-quality adversarial | `qualityDiagnosticProjection` never checks the `signature` field of "none"-failure-class diagnostics; a tampered per-case routing outcome in frozen evidence goes undetected | high, live-verified | patch: signature-prefix check added against each case's frozen ground truth |
| 25 | test-quality adversarial | `test-tea-workflow-descriptions.js` never asserts the tool's reported file count, only its exit code | low | no action: no plausible glob regression identified that isn't already caught by the existing per-file read-error check |

All findings confirmed against the current diff or live-verified by mutation testing (planting real fixtures, editing real evidence files, and restoring); none were speculative.

**Round 2: CodeRabbit on PR #232.** Five inline findings plus two outside-diff findings, all replied to individually and their threads resolved.

| # | Source | Finding | Verdict | Route |
| --- | --- | --- | --- | --- |
| 26 | coderabbit | README's repository-layout tree and `testing-as-engineering.md`'s workflow-purpose table still enumerate nine workflows | medium | patch: `bmad-testarch-evaluate` / `evaluate` added to both |
| 27 | coderabbit | Evaluate's `SKILL.md` sends a user through twelve placeholder stage guides that cannot yet deliver the promised evaluation | false as a defect in this story's scope: epics.md's own AC for Story 1.3 states the twelve `references/<stage>.md` files are "placeholder files until later stories fill them" (Stories 1.4 through 2.4); each placeholder already states in its own text which story fills it. Publishing the registration now, with content following incrementally, is the plan's explicit design, not an oversight | reject, reason posted |
| 28 | coderabbit | `test-installation-components.js`'s npm-pack check unconditionally overwrites `.memlog.md` and recursively deletes `.analysis/`, which would destroy a real in-progress `bmad-workflow-builder` session's files | high, live-verified: planting real content in both paths before the fix, then running the test, showed both would be lost | patch: check pre-existence first, create with exclusive-create (`wx`) so an existing file is never truncated, plant the analysis probe under a unique filename, and remove in `finally` only what did not already exist; re-verified live that pre-existing content now survives |
| 29 | coderabbit | `test-routing-evidence.js`'s snapshot `caseDigest` is recomputed from, and stored beside, the same data it protects, so editing a snapshot's `intent` and recomputing a self-consistent digest defeats the check | high, live-verified: tampering one snapshot's intent and recomputing its own `caseDigest` left the suite green before this fix | patch: the eighteen digests are now also hard-coded as `EXPECTED_CASE_DIGESTS` in the test file itself, a separate diff hunk from any data file; re-verified live that the same tampering now fails |
| 30 | coderabbit | `expectedById` was built with an unguarded `readCaseSnapshot` call ahead of `checkCaseSnapshots`'s own guarded read, so a missing/corrupt snapshot would throw before any failure could be recorded | medium | patch: `checkCaseSnapshots` now builds and returns `expectedById` itself, from snapshots it already read inside its own try/catch |
| 31 | coderabbit | `docs/explanation/eval-quality-roadmap.md`'s "Coverage Closed" section still claims no skill is deferred and the manifest's `deferred` array is empty | medium | patch: corrected to name `bmad-testarch-evaluate` as the one skill still open |
| 32 | coderabbit | README's CI gate table still states 18 routing intents / 36 calls in two places | medium | patch: both corrected to 19 / 38 |

**Round 3: Opus final review on PR #232.** Seven findings, all re-verified against current code first, then fixed per coordinator decision.

| # | Source | Finding | Verdict | Route |
| --- | --- | --- | --- | --- |
| 33 | opus | `module-help.csv`'s EV row output-location `tea_evaluations_folder` disagreed with AD-2 (ARCHITECTURE-SPINE.md) and the Story 1.3 AC (epics.md), both still naming `test_artifacts` | high | patch: the plan is amended, not the CSV -- AD-2 and the AC now name `tea_evaluations_folder`, since that is where Evaluate actually writes; `test_artifacts` was never correct for this row (see Design Notes) |
| 34 | opus | no test in `test/` or `tools/` reads `src/module-help.csv`; deleting the EV row left every relevant test at exit 0 | high, live-verified | patch: `test-installation-components.js` parses the CSV with `csv-parse` and asserts the EV row's five fields; live-verified the row's deletion now fails |
| 35 | opus | `test-routing-evidence.js` re-anchored only `cases`; `fixtureDigest`/`recordFixtureDigest` got a shape check compared against nothing, and `menuSource`/`skillSource`/`groundTruthVersion`/`corpusVersion` were unguarded | high, live-verified | patch: the envelope is snapshotted (`cases/_envelope.json`) beside an independently recorded `EXPECTED_ENVELOPE_DIGEST`; the 18-case files are rebuilt byte-exact from envelope plus snapshots and digested with `digestFiles`'s own algorithm, asserted equal to `contract.fixtureDigest`/`recordFixtureDigest`; live-verified a `menuSource` tamper is now caught |
| 36 | opus | house/lean skill-set lists in `test-installation-components.js` were hard-coded; `isLeanSkill` never decided membership, so an unclassified new skill directory got no shape assertions | medium, live-verified | patch: both sets are now computed by running `isLeanSkill` over every `src/workflows/testarch/*/` directory and asserted equal to the expected lists; live-verified mutating the lean/house rule now fails four assertions |
| 37 | opus | `.gitignore`'s claim that builder artifacts "are gitignored" was untested; deleting the entries left `test:install` green | medium, live-verified | patch: `git check-ignore -q` asserted on the planted paths; live-verified removing the entries now fails two assertions |
| 38 | opus | twelve placeholder stage guides had no instruction to stop; an agent could improvise a stage or compute a verdict outside `eval-quality` (AD-6); `tea-overview.md` overclaimed what the skill does | high, live-verified | patch: `SKILL.md`'s Workflow section gained a stop-on-placeholder rule and a rule against computing a verdict outside `eval-quality`'s CLI; `test-evaluate-guidance.js` asserts both phrases, live-verified against removal; `tea-overview.md`'s EV row reworded to match what the skill does today |
| 39 | opus | `epics.md`'s AC said `/bmad-workflow-builder` Build runs headless; the skill was hand-authored instead (already recorded in Implementation Notes, but the AC itself was never amended) | medium | patch: the AC is rewritten to name the actual build path (hand-authored, matching the house activation contract) and the validation that replaced headless Build (Analyze's five lenses plus Validate Module) |

All seven re-verified against the current diff before fixing; none were stale. None were speculative.

## Design Notes

The lean shape (AD-3) has no prior TEA skill to copy wholesale: every sibling either has `workflow.yaml` or, like `bmad-teach-me-testing`, `steps-c/` (which is why the AC's own discriminator explicitly classifies `teach-me-testing` as house despite having no `workflow.yaml`). The activation-contract boilerplate is copied verbatim from `bmad-teach-me-testing`'s `SKILL.md`/`customize.toml`, since AD-3 requires TEA's activation contract kept intact; everything else (the twelve-stage inline workflow body, the placeholder reference guides) is new.

**Output-location amendment (finding 33).** AD-2's registration-set bullet and the Story 1.3 AC both said `test_artifacts`, copied from the pattern every other registered skill's row follows. Evaluate is not every other skill: its own goal is a scored evaluation folder, and it writes there, under `tea_evaluations_folder`, not under `test_artifacts`. The CSV row was correct and the plan was stale, so the plan is the thing that changed: AD-2 now documents the correction with a dated amendment note, and the AC's "Then" clause names `tea_evaluations_folder` directly.

The routing corpus re-anchoring design: rather than keep asserting a whole-file digest against the live, now-growing corpus (structurally impossible once a case is added), each of the original 18 cases is snapshotted once, at the moment the live corpus still matched the frozen evidence's digest, with its own `caseDigest` recorded beside it. The ongoing test then holds each live case byte-identical to its snapshot (proving no historical case was edited) while admitting new cases by id (proving nothing about growth is itself a violation).

## Verification

**Commands, all green on the final diff:**

- `npm test` -- exit 0 (all chained scripts); run to completion nine times across the review cycle as fixes landed, green on the final run
- `npm run test:install`, `node test/test-evaluate-guidance.js`, `node test/test-tea-workflow-descriptions.js`, `node test/test-routing-evidence.js` -- exit 0, run standalone repeatedly during the review cycle
- `npm run test:eval-routing-data` (`--validate-only`) -- 19 intents over an 11-item menu, valid
- `node tools/generate-contracts.js --check`, `node tools/generate-probes.js --check` -- match
- `npm run test:contracts`, `npm run test:contract-oracles` -- pass
- `npm run test:doc-counts`, `npm run test:doc-claims`, `npm run test:doc-claim-sources` -- 0 disagreements
- `npm run docs:validate-links` -- 0 issues
- `npm run test:release-metadata` -- passes as part of the `npm test` chain
- Live `npm run eval:routing` x3 -- `EV` intent routes correctly, 2/2, in every run

**Revert checks, each exercised once and restored:**

- Editing `epic-risk-before-tests`'s recorded intent text -- `test:eval-routing-evidence` fails naming the exact diff; restored, passes.
- Tampering one frozen evidence record's `signature` field -- `test:eval-routing-evidence` fails naming the case and the mismatch; restored, passes.
- Removing the `EV` `[[agent.menu]]` entry -- `test:install` fails 2 assertions; restored, passes.
- Planting `.memlog.md`/`.analysis/report.md` under the skill, before the `package.json` `files`-array fix -- `npm pack --dry-run` packed both despite `.gitignore` (and, tested separately, despite an equivalent `.npmignore`); after the fix, both are excluded; cleaned up in `finally` either way.
- Deleting the EV row from `src/module-help.csv` -- new CSV-parsing assertion fails; restored, passes.
- Removing the `.gitignore` entries for `.memlog.md`/`.analysis/` -- new `git check-ignore -q` assertions fail (2); restored, passes.
- Mutating `isLeanSkill` to drop its `hasStepsC` check -- new computed-set assertions fail (4); restored, passes.
- Tampering `ground-truth.json`'s live `menuSource` field -- the rebuilt-fixture provenance check fails naming the mismatch; restored, passes.
- Removing `SKILL.md`'s stop-on-placeholder/never-compute-a-verdict sentence -- both new `test-evaluate-guidance.js` assertions fail; restored, passes.
