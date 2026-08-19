# Changelog

All notable changes to the Test Architect (TEA) module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- Stale BMad Builder run artifacts from the skills migration. `e295715` carried 16 `validation-report-20260127-*.md` files, two per workflow across the eight `bmad-testarch-*` workflows, recording a 2026-01-27 validation run. Every one of them asserted `workflow.md present: YES` for a file that no longer exists in any workflow (it became `SKILL.md` in that same migration), and every step-file count and line count in them disagreed with the tree they shipped alongside. Each workflow directory is a published skill root in `.claude-plugin/marketplace.json`, so these were shipping to consumers as skill payload, where a wrong file listing is worse than no file listing.
- The nine authoring-time workflow plans: `workflow-plan.md` in each of the eight `bmad-testarch-*` workflows, plus `workflow-plan-teach-me-testing.md`. Nothing in `src/`, `test/`, `tools/`, `cli/`, or the docs read them; the only inbound references were from the validation reports removed above. Seven of the eight listed a step set that no longer matched their own directory, and the `teach-me-testing` one was a 950-line build-session log carrying `status: FOUNDATION_COMPLETE` frontmatter and a `cp -r` deployment instruction pointing at an external project root. Like the reports, they shipped inside a skill root.
- Three orphaned scripts from the TEA migration, each with zero inbound references from `package.json`, CI, or the pre-commit hook. `test/validate-agent-schema.js` was a stale copy of `tools/validate-agent-schema.js` whose own usage line named the `tools/` path; it globbed the abandoned `src/{core,modules/*}/agents/` layout and printed `No agent files found` when run. `test/unit-test-schema.js` failed one of its own three assertions and exited 0 regardless, so wiring it up would have gated nothing. `tools/verify-paths.js` was a one-off checker for leftover BMM references, and the migration it guarded is finished.
- Dead ignore entries that never matched anything in this repository's history: `test/template-test-generator/**` and its two sibling globs, `tools/template-test-generator/test-scenarios/**`, `test-project-install/**`, `sample-project/**`, `src/modules/*/sub-modules/**`, and `.bundler-temp/**` from `eslint.config.mjs`; `test-output/*` from `.gitignore`, along with its redundant `build/*.txt` entry, which `build/` already covers.

### Fixed

- `docs/explanation/step-file-architecture.md` no longer claims the workflows carry committed validation reports "each scoring 100%". No score appears anywhere in the 16 reports the sentence described, so the claim was unverifiable against its own evidence before those reports were removed. The section now states what validation checks and that its output is a point-in-time reading of the working tree rather than a committed artifact.
- `docs/explanation/eval-quality-roadmap.md` is reachable from the documentation site. It was the only page in `docs/explanation/` missing from the Starlight sidebar in `website/astro.config.mjs`, so it built and published but could only be found through the direct link in `README.md`.
- `test/README.md` names the validator the suite actually loads. It cited `tools/schema/agent.js`, while `test/test-agent-schema.js` requires the byte-identical copy at `test/schema/agent.js`.

## [1.23.1] - 2026-08-16

### Changed

- `persistent_facts` ships empty. All ten `customize.toml` files — the TEA agent plus the nine `testarch` workflows — carried `persistent_facts = ["file:{project-root}/**/project-context.md"]` pre-seeded, which made loading that file an opt-out default baked into every skill rather than a customization you choose (#136).

  Repository-wide context belongs in `AGENTS.md`, which every skill already sees. `persistent_facts` is for context that only one workflow needs, loaded when it runs instead of carried as constant memory. To opt a skill back in, add the entry to your team or user override TOML:

  ```toml
  persistent_facts = ["file:{project-root}/**/project-context.md"]
  ```

### Fixed

- Installation component tests assert the current contract (#137). `test/test-installation-components.js` asserted that every `customize.toml` _contained_ the project-context glob. Emptying those arrays inverted ten assertions, taking `main` red and failing the follow-on Publish run. They now assert that `persistent_facts` ships as an empty array; the neighbouring checks that the key is present are unchanged.

## [1.23.0] - 2026-08-15

### Added

- `docs/explanation/eval-quality-roadmap.md`: a source-controlled handoff for the nine skills that still lack full behavioral coverage, the runner and CI work needed to scale `eval:all`, and the intended one-way integration with the upcoming standalone `eval-quality` contract and scoring layer. It defines per-skill behavioral contracts, a phased rollout, runner admission and manual-use requirements, CI tiers, and the evidence required before a skill can be called behaviorally covered.
- Built-in `agy` (Antigravity CLI) adapter for `npm run eval:all`, `eval-fragment-selection`, and `tea-test-review`. Handles argv-based prompt passing natively (`promptViaArgv`) without stdin pipe truncation or `EPIPE` errors, enabling headless evaluation in Google Antigravity environments.
- `npm run eval:all -- --agent <runner>`: one CI-compatible entrypoint that runs fragment selection across every covered workflow skill, then runs the behavioral `test-review` eval with the same selected runner. It preserves the harness-specific repetition defaults, supports focused workflow and repetition overrides, and offers a no-model `--preflight-only` path.
- Portable `custom` agent adapter for `tea-test-review` and both live eval harnesses. `--agent-cmd`, repeatable `--agent-arg`, and repeatable `--env-pass` let any stdin-driven headless agent CLI use the same prompt, scoring, and exit-code path as the built-in adapters. The custom runner has no implicit executable, arguments, model, credential variables, or approval policy.
- Write-time enforcement hook, scaffolded by the `framework` workflow. TEA was advisory (knowledge fragments) plus post-hoc (`test-review` scoring) with nothing at the write itself, so a `.only`, a `waitForTimeout`, or a `Thread.sleep` could land, be committed, and only surface at review. `src/workflows/testarch/bmad-testarch-framework/resources/hooks/tea-enforce.cjs` blocks the write instead, and `steps-c/step-04-docs-and-scripts.md` installs it plus its `.claude/settings.json` registration into the target project. Rules are the mechanically decidable `Absolute` rows of `criteria-registry.md` (C2, C3, C4 for Maestro flows, H1, H5, H6, H8 block; C1 warns, because its row is conditioned on a documented, still-true reason that no pattern can check). Multi-language by construction: Playwright, Cypress, Vitest/Jest, Pact, pytest, JUnit, Go test, and Maestro flows each get their own predicates and their own comment and string stripping, so a `waitForTimeout` inside a comment or a doc example is not a violation. Three passes rather than one: `--pre` blocks the fragment about to be written, `--post` re-reads the whole file from disk (which is what catches writes made through Bash, violations split across two edits, and whole-file rules), and `--stop` sweeps test files modified during the turn (which is what catches a codegen script that wrote files it never named). The hook fails open on any error of its own.
- The hook honours the registry's `Gate` column structurally. `.tea/enforce-config.json` carries only the globs for the stack the `framework` workflow actually detected, so a repo with no Maestro flows cannot fire the Maestro rows and a repo with no pact config cannot fire H6 or H8. `excludeGlobs` keeps k6 scripts out, where `sleep(1)` is the documented way to model think-time and H1 would be confidently wrong. A closed gate is not a violation, which is defect #1 from the couture-cast PR #103 postmortem in `DESIGN-CRITERIA-REGISTRY.md`, applied to a second enforcement surface.
- The scaffold records the hook's sha256 in `.tea/enforce-config.json`, and the hook compares its own file against it on `--stop` only, warning once and never blocking. The instruction to copy the script byte for byte pointed at a test that lives in the TEA repository, so nothing inside the target project would have noticed a locally edited copy — and a locally edited copy is exactly the one that is no longer covered by the test keeping its rules in agreement with the registry.
- `tools/validate-criteria-fragments.js`: traceability between `criteria-registry.md` and the knowledge fragments. Nothing asserted that a registry row still had a fragment teaching it, nor that a mapped fragment still carried its claim at the registry's pinned severity. It fails on a mapped fragment that lost its anchor, a manifest row pointing at a fragment that does not exist or is not indexed in `tea-index.csv`, a severity that no longer matches the registry, and a registry row that is neither mapped nor declared a gap. It found 14 rows with no fragment teaching them at all, which are closed in this same release (below), taking coverage from 21/35 to 35/35 over 48 anchors. The gap-declaration mechanism stays: a registry row that is neither mapped to a fragment nor declared a gap fails the build, and with no real gap left to exercise that path the tool now self-checks it against a synthetic row so a refactor cannot quietly kill the guard.
- Knowledge for the 14 registry rows nothing taught, added to the four fragments that already own the surrounding material rather than as 14 new files, since fragmenting the base makes selection worse. `test-quality.md` gains committed skips and committed focus (C1, C2), assertions that cannot fail (C3 tautological, C5 asserted against the test's own mock, C6 unreachable), and suite structure and naming (M3 counted by subject rather than by `expect` call, M4 grouping, M7 nesting, L5 behavioral names, L7 one assertion dialect). `timing-debugging.md` gains wall-clock fixtures with fake timers as the fix (H2) and unawaited promises in test bodies (M6). `component-tdd.md` gains user-level interaction over raw event dispatch (M5), gated on the project already depending on such an API. `data-factories.md` gains naming the domain literals a test hardcodes on purpose (L6), which is the half the factory patterns never covered. Examples appear in the languages each row's own predicate names — Python and JUnit skip forms for C1, `assert x == x` for C3, `freeze_time` for H2 — rather than in TypeScript alone. The `tags` and `description` columns for all four fragments gained the terms that make the new material selectable, in the agent index and all eight workflow copies.
- `test/eval-fragment-selection.js` plus per-workflow eval data under `test/evals/`: measures whether the right fragment comes out of `tea-index.csv` for a given task, which is the failure mode where an agent loads the wrong fragment, or none, and answers from prior. Twenty-four cases across all eight workflows that ship a knowledge base (`automate`, `test-design`, `atdd`, `ci`, `framework`, `nfr`, `test-review`, `trace`), seeded from Playwright, Cypress, pytest, JUnit, Go, Pact, GitLab CI, and Maestro scenarios rather than from Playwright alone, since fragment selection for a non-JavaScript stack is where TEA is most likely to route wrong. `teach-me-testing` is excluded because it ships no `resources/knowledge`: its fragment browsing is a menu the learner drives rather than a routing decision the agent makes. Every non-JavaScript case asserts the run-level precondition that nothing else was measuring: both library flags default true, and in a repo with no JavaScript manifest neither package can be installed, so both mandates must stay closed. Ground truth is quoted from each workflow's own step files, never from `tea-index.csv` tags, because tags describe a fragment while step files decide what a run loads. `--validate-only` runs in CI with no vendor cost and rejects a name in either direction that does not exist or is not indexed for that workflow, so a typo in a forbidden list cannot pass vacuously; the scored run needs a logged-in `claude` or `codex`.
- `.github/ISSUE_TEMPLATE/rule_quality_report.md`: a low-friction report for the failure that matters most in a rules product, an agent misreading, ignoring, or being misled by a TEA rule or knowledge fragment. Captures the agent and model, the rule and section, the workflow, the prompt, the non-compliant output, and what should have happened.
- Nine populated workflow output examples, one beside every TEA workflow: Academy completion, epic test design, framework setup, CI pipeline setup, ATDD red-phase checklist, automation summary, test review, four-domain NFR evidence audit, and traceability plus deterministic gate decision. Each example uses an independent scenario, complete progress frontmatter, repository-relative references, and the current output contract. Together they demonstrate that test priority remains a judgment separate from risk score, NFR statuses use `CONCERNS` across Security, Performance, Reliability, and Maintainability, and `WAIVED` requires a complete human override rather than a derived code path.

### Changed

- `README.md` now separates installation from runtime for `tea-enforce.cjs`: framework Create installs it, Resume can complete that step, and the hook then runs at project scope for matching tool events from any workflow, agent, or ordinary coding prompt. The lifecycle description also explains what each pass protects and why semantic findings remain in `test-review`. Conceptual descriptions use platform-neutral language while exact host details remain where invocation or release instructions require them. The self-validation section now presents deterministic checks and live evals as two distinct layers. It includes exact commands for each existing per-skill routing suite, the built-in runner combinations, Gemini through the custom runner contract, CI usage, passing thresholds, default call volume, and an explicit account of which skills still lack behavioral eval coverage.

### Fixed

- CodeRabbit follow-up aligned the public runner contract with the built-in `agy` adapter, corrected the README's waiver, Automate deviation, built-in runner, custom stdin, and customization-link documentation, and removed the stdin-only confidentiality claim for argv-based adapters.
- CodeRabbit follow-up synchronized shared priority examples and coverage-gate callouts, tightened eval preflight and custom-model validation, aligned NFR threshold and compliance contracts, and corrected the affected workflow examples.
- Worked-example validation exposed two stale workflow contracts. The `test-review` checklist still advertised A+/A/B/C/F while the executing scoring step, report parser, and template use A/B/C/D/F; it now matches the live grade function. The Automate final step described deviation entries with an em dash; it now uses the repository-compliant `file:line: reason` shape used by the example.

- Risk score to test priority had three incompatible statements. `probability-impact.md` defined a deterministic `mapRiskToPriority()` sending a score of 6-8 to P1; `test-priorities-matrix.md`'s Integration with Risk Scoring table called the same band "P0 or P1"; and `test-design-template.md` and `checklist.md` both wrote the P0 criterion as risk score `≥6`, which is P1 under the deleted function. An agent's answer to "what priority does this risk score imply" depended on which fragment it loaded. Resolved as: priority is a judgment the risk score informs, not a value the score determines. `mapRiskToPriority()` and its call site are removed from `probability-impact.md` (all nine copies); risk score continues to classify the remediation action (DOCUMENT/MONITOR/MITIGATE/BLOCK) via the untouched `classifyRiskAction()`. The Integration with Risk Scoring table in `test-priorities-matrix.md` (all nine copies) now states plainly that it is a sanity check on a priority already assigned by the Priority Decision Tree, not an assignment rule. `test-design-template.md` and `checklist.md` drop the numeric risk-score anchor from the P0/P1/P2 criteria lines in favor of the qualitative risk levels the decision tree already uses. `README.md`'s existing description of this relationship needed no change; it already described the model this converges on.

- The NFR evidence audit named its four domains three different ways. `nfr-criteria.md` (all nine copies) taught Security/Performance/Reliability/**Maintainability** criteria and gate rows, but the `nfr` workflow's four evaluation subagents, its aggregation step, `trace-template.md`'s Phase 2 evidence summary, and several docs pages all executed and described Security/Performance/Reliability/**Scalability** instead — an agent auditing evidence ran a domain (Scalability) the knowledge base never defined PASS/CONCERNS/FAIL criteria for, while the domain the knowledge base did define (Maintainability) was never audited. Separately, `step-02-define-thresholds.md` offered the 8-category ADR Quality Readiness Checklist as if it were the source for all four audited domains, which doesn't hold: Maintainability isn't one of the 8 ADR categories. Resolved in favor of the knowledge base's existing Maintainability domain: `step-04d-subagent-scalability.md` is replaced by `step-04d-subagent-maintainability.md`, auditing test coverage, code duplication, dependency vulnerabilities, and observability instead of horizontal/vertical/data scaling; `step-04e-aggregate-nfr.md`'s domain list, cross-domain risk example, and risk-breakdown output follow; `nfr-report-template.md`'s Scalability Assessment section and Auto-Scaling fail-fast item become Maintainability equivalents (the separate 8-category ADR scorecard table, which was never part of this inconsistency, is untouched); `checklist.md` and `trace-template.md` follow the same rename. `step-02-define-thresholds.md` now states plainly that Maintainability's criteria come from `nfr-criteria.md` directly rather than from the ADR-8 list, which remains the elicitation source for Security and Performance. `README.md`, `docs/reference/commands.md`, `docs/explanation/step-file-architecture.md`, and `docs/reference/execution-targets.md` are updated to match; the last of these was also missing a Maintainability row entirely, having folded Reliability and Scalability into one row.

- Only one of the `nfr` workflow's four evidence-audit subagents wrote down what PASS, CONCERN, FAIL, and N/A mean. `step-04a-subagent-security.md` spelled the definitions out; `step-04b-subagent-performance.md`, `step-04c-subagent-reliability.md`, and (after the rename above) `step-04d-subagent-maintainability.md` used the same four values only inside their JSON output examples, so a worker choosing between CONCERN and FAIL for those three domains had no written rule to apply. A new shared file, `steps-c/nfr-status-definitions.md`, states the four definitions once; all four worker step files now load it instead of each carrying (or, for three of them, lacking) their own copy — the same fix already applied to severity via `criteria-registry.md` in the `test-review` workflow, applied here before four independently worded copies could drift the way that severity drift did. Separately, `step-02-define-thresholds.md` has instructed since before this fix that a threshold still UNKNOWN after checking every source should be reported as CONCERNS, but nothing checked that a worker actually did that. `step-04e-aggregate-nfr.md` now enforces it after all four workers report: any finding under a domain whose threshold was UNKNOWN is downgraded from PASS to CONCERNS, with the finding's description noting why.

- The `nfr` workflow's evidence-audit status enum was spelled two ways: `step-04a-subagent-security.md` and the new shared `nfr-status-definitions.md` used the singular `CONCERN`, while `nfr-criteria.md`, the `trace` workflow's gate step, and its trace template all used the plural `CONCERNS`. `step-04e-aggregate-nfr.md`'s aggregation predicate papered over the mismatch by testing for both spellings instead of resolving it. Converged on `CONCERNS`, the form already used by all nine copies of `nfr-criteria.md` and by the gate's `GateDecision` type: the shared status-definitions file, all four worker step files (`step-04a`-`step-04d`, including their JSON output examples), and the aggregation predicate now agree. `grep -rn "'CONCERN'" src/` returns nothing.

- The `trace` workflow's gate decision step carried a Rule 6 that was only a comment: `// Rule 6: Manual waiver — set gateDecision = 'WAIVED' and update rationale here if a stakeholder-approved waiver applies (wired through config or user input upstream)`, with no code assigning `'WAIVED'` and no waiver field anywhere upstream in the step's inputs. Meanwhile `trace-template.md`'s Waiver Details section and `checklist.md`'s Decision Integrity and Waiver Scenarios checks already specify and validate a full waiver contract (approver, approval date, reason, expiry, monitoring plan, remediation owner, fix target), so the artifact-level contract existed for a code path that didn't. Resolved as intentional: the comment is replaced with a stated rule that Rules 1-5 are the only rules that set `gateDecision` automatically, and `WAIVED` is never derived by this step from coverage data or any other input, only applied by a human overriding the automated decision, with the resulting artifact required to carry the waiver contract. `risk-governance.md`'s unrelated `requestWaiver()` takes `expiryDays` as a caller-supplied parameter with no default anywhere in the repo, confirming there is no implicit expiry to wire in either.

- `risk-governance.md`'s Example 2 (`evaluateGate()`, all nine copies) is a complete gate decision function keyed on risk scores: FAIL on any score-9 risk or unresolved coverage gap, WAIVED when every risk is waived by an approver, CONCERNS on scores 6-8 with mitigation plans and owners, PASS otherwise. It produces the same four words (PASS/CONCERNS/FAIL/WAIVED) as the gate the `trace` workflow actually runs (`step-05-gate-decision.md`, keyed on coverage percentages: P0 at 100%, overall at 80%, P1 at 90%/80%), so an agent asked "how does the gate decide" after loading this fragment could answer with the engine that never executes. Kept, since the risk-driven framing teaches something the coverage engine doesn't, but labelled: a callout now sits immediately under the Example 2 heading naming `step-05-gate-decision.md` as the executed rule set and noting the two engines' different inputs, and the section's own Key Points list gets a matching bullet.

- `module-help.csv` records `test-design` in phase `3-solutioning` only, while the workflow is dual-mode and also runs per epic in Phase 4, and the CSV has a single `phase` column with no precedent for a multi-value entry. Decided the column means the phase the row's `preceded-by`/`followed-by` dependency chain belongs to, not every phase the workflow can run in: no code in the repository parses this column, and the Phase 4 per-epic invocation has no dependency edges of its own to encode. `README.md`'s "order you run things" diagram already matched this reading; added one sentence stating it explicitly so the relationship between the prose, the diagram, and the CSV isn't left for a reader to infer.

- `teach-me-testing` session 7 could reach only 42 of the 59 knowledge fragments. Every mobile fragment (`maestro-flows`, `mobile-test-strategy`, `mobile-ci-device-lab`), the entire seven-fragment webhook family, both integration mandates, `library-integration-mandate`, `confidence-gate`, and `evidence-integrity` had no category to appear under, so the only browsable view of the knowledge base silently hid a third of it. The menu gains a Mobile category and a Webhooks category, the existing categories absorb the rest, and the sixteen places that advertised "42 fragments" now state the real number. `test-knowledge-base.js` Test Suite 6 asserts all of it: every fragment appears exactly once, no phantom entries, each category subtotal matches its own list, and every stated total matches the base. The count matching the short menu is what kept the shortfall invisible.

- `README.md` described a version of TEA that stopped existing around 1.20.0. The Architecture and Flow section predated parallel workers, so it never mentioned `tea_execution_mode`, `tea_capability_probe`, the capability probe's fallback order, or the fact that five workflows split their heaviest step across isolated workers that communicate only through validated JSON. It never mentioned `criteria-registry.md`, the `tea-test-review` CLI (a published `bin` of this package), or the write-time enforcement hook, so the three control points TEA now occupies read as one. The building-blocks table said `steps-c/` held "5-9 sequential files" when the real range is 5 to 12 and 75 in total; the runtime section claimed a backend project pulls "~1,800 lines of Playwright Utils fragments," an unverifiable number of the class removed in 1.22.1 and backwards besides; the configuration list omitted `tea_execution_mode` and `tea_capability_probe`, both prompted at install; `risk_threshold` was labelled "(future)" when nothing reads it at all; the release guide understated `npm test` as seven checks when it chains thirteen; and the "45 platforms" claim was transcribed from the installer's repository, where it can change without anything here noticing. Adds a release-gate section covering the live-evidence CONCERNS cap and gate ineligibility, a repository-layout tree that includes `cli/`, `tools/`, `test/`, and `website/`, and a section on the checks that keep TEA's own rules and knowledge in agreement.

- `quality.yaml` did not run the full test suite. `test:knowledge`, `test:changelog`, and `test:tea-workflow-descriptions` ran only from `.husky/pre-commit`, which `git commit --no-verify` skips and which no GitHub web-UI edit ever reaches. `test:knowledge` is the suite carrying the knowledge-base parity check across the eight workflow copies, so until now nothing in CI stopped the workflow copies from silently diverging from the agent's. All three now run in the `validate` job, alongside the three new checks above. `test:cli` moved to its own job: it takes 12m21s measured, and leaving it in line made every fast check behind it report twelve minutes late. It stays out of `npm test` for the same reason, since `npm test` runs on every commit.

## [1.22.6] - 2026-08-14

### Fixed

- `mobile-ci-device-lab.md` and `mobile-test-strategy.md`: corrected the claim, shipped in 1.22.4, that deep links cannot be exercised in a prebuilt development shell. A shell does not register the app's custom scheme, so a `myapp://` URL fails there, but it routes its own URL form (`exp://<host>/--/<path>?<query>`) into the app with path and query intact. Link parsing, routing, and the resulting state changes are therefore all testable in a shell; only the OS-level handoff needs the registered scheme, which means a cold start from a real widget or notification tap. The originating suite had recorded a deep-link flow as impossible for this reason, and it passed on the first attempt once the URL was built the shell's way. The related bullet no longer lists deep links among the surfaces a shell can only assert absent.

### Added

- `evidence-integrity.md`: a fifth shape of check that cannot fail, and the hardest of the five to catch in review: the assertion is already true before the action runs. A flow opened a deep link and asserted a container belonging to the screen it was already on, so it passed whether or not the link did anything, and the suite reported every flow green with it included. Carries two tells, both cheap: the test's name promises an effect no assertion mentions, and the result tracks an environment difference the assertions never mention (the identical vacuous flow was green in CI and red locally, because the unresolvable link errored on one API level and resolved on another).
- `evidence-integrity.md` and `maestro-flows.md`: assert the transition rather than the state. Asserting that an action produced a state passes whenever that state is the application's default, which is the same hollow shape one level up. Where only a single state is available, choose an input whose expected value differs from the default. `maestro-flows.md` carries the worked example with state selectors, and the related preference for a deterministic input over stubbing a clock, since the deterministic input exercises the identical code path with no test-only seam.
- `maestro-flows.md`: `selected`, `checked`, `enabled`, and `focused` are documented state selectors that compose with `id` and `text` on `tapOn`, `assertVisible`, and `assertNotVisible`, and `assertNotVisible` with a state selector is how "no longer selected" is expressed. Also adds `maestro check-syntax` as the device-free way to confirm a selector or field exists on the pinned version before a run.
- `mobile-test-strategy.md` and `evidence-integrity.md`: a surface declared untestable is a claim needing evidence like any other. Dropping coverage on an unchecked assumption costs real coverage, and the fix is to test the claim and then name precisely which part is out of reach.

## [1.22.5] - 2026-08-14

### Added

- `maestro-flows.md`: visible means inside the viewport, not present in the view hierarchy. `assertVisible` and `extendedWaitUntil: visible` fail on an element that is rendered, correct, and below the fold, and the failure reads as a broken feature rather than a flow that never scrolled. Carries the cheap diagnostic tell (find the id in the failing step's `screen-hierarchy`: present with out-of-bounds coordinates is a scroll problem, absent is a different bug) and the rule that any assertion inside a scrolling section is a latent screen-height dependency.
- `mobile-ci-device-lab.md`: local and CI must run the same device profile. Measured, a runner on a roughly 807dp-tall profile against a local 914dp one failed four unrelated flows with "not visible" while every developer machine stayed green, each looking like a product defect. Names the trap that the comparison is density-independent height rather than pixel resolution, since two profiles can share `1080x` and differ by 100dp.
- `mobile-ci-device-lab.md`: a native module in a development shell does not always fail loudly. Some SDKs detect the shell and degrade to a fallback path (one logs `Expo Go app detected. Using RevenueCat in Browser Mode.`), so nothing errors and the suite proves a code path users never run. A hard `undefined` announces itself; a silent degradation produces a green flow covering the wrong implementation.
- `mobile-ci-device-lab.md`: check present-but-off-screen before anything else when a step fails on "not visible". One hierarchy lookup separates a flow-level scroll problem from an application defect.
- `evidence-integrity.md`: screen geometry and accumulated local credentials as environment-asymmetry axes. Both read as trivia and are not: viewport height decides what "visible" means, and a session file or cached certificate on a developer machine makes a whole code path invisible locally.
- `evidence-integrity.md`: rank hypotheses by the cost of the measurement that would kill them. One investigation produced three plausible mechanisms, all wrong, before two cheap observations eliminated the set; the tell is a session holding several explanations and no new measurements. The corollary is that the discriminating measurement should already be in the captured artifacts, so "the artifacts could not tell us" is a finding about the harness.
- `mobile-test-strategy.md`: the PR-gate device profile must match the local one, so the matrix can find fragmentation defects instead of manufacturing them at the gate.

### Changed

- `maestro-flows.md`: withdrew the mechanism claim about lost taps. The measurements rule out a missing element and an occluding overlay; they do not establish where the touch is lost, and the earlier text ("not a scroll, not an overlay, not the keyboard") asserted more than the evidence supports. The gesture-responder explanation is now labelled an untested hypothesis and the retry-with-assertion pattern is labelled a countermeasure rather than a fix, per the fragment's own rule that a stated mechanism is a claim needing a source.

## [1.22.4] - 2026-08-14

### Added

- `mobile-ci-device-lab.md`: why a development build is frequently not the fix for a development shell. `developmentClient: true` sets the Gradle task to `:app:assembleDebug`, and a debug variant does not embed the JS bundle, so the app still needs a live packager and a manifest exchange at launch. Only a release variant embeds it, and SDK 54's `debugOptimized` is a debug variant that optimizes C++ only. Adds the release-APK path that composes with CI caching (`expo prebuild` plus `./gradlew :app:assembleRelease`, since `eas build --local` documents "Caching is not supported" and still needs an account), the note that a locally prebuilt release APK is debug-signed and therefore installs with no credentials, the `__DEV__`-is-false-in-release trap and the `EXPO_PUBLIC_` replacement, and that `scheme` has no effect in a shell so deep links cannot be tested there at all.
- `mobile-ci-device-lab.md`: the code-signed manifest as a CI-only failure. A shell that sends `expo-expect-signature` makes the CLI fetch a development code-signing certificate when the app config carries `extra.eas.projectId`; that fetch needs an account session, and under `EXPO_NO_INTERACTIVE=1` it fails with `CommandError: Input is required, but 'npx expo' is in non-interactive mode.` Names both fixes (an `EXPO_TOKEN` secret, or serving the manifest `--offline`), records that the trigger is `extra.eas.projectId` and not `owner`, and extends the manifest health-check rule to send every header the client sends, after a probe that omitted only the signature header reported a healthy manifest through five consecutive red runs.
- `mobile-ci-device-lab.md`: a section on repairing locally created AVDs. `avdmanager` cannot parse a dotted API level, so it writes `target=android-0`, which silently drops hardware acceleration and leaves the device `offline` with nothing in the log naming the cause; `hw.gpu.enabled=no` and `hw.keyboard=no` are equally wrong for a UI driver. Also `-gpu auto` over `-gpu swiftshader_indirect` for multiple emulators, and `-no-snapshot-save` over `-no-snapshot`, which also refuses to load a snapshot.
- `mobile-ci-device-lab.md`: per-device identity for sharded runs. Android has no readable equivalent of the iOS simulator name (`expo-device` reads `Settings.Global.DEVICE_NAME` on API 32+ and `bluetooth_name` below), and every emulator reports the product model, so four differently-named AVDs produce four identical keys and four shards share one fixture account while every flow still passes. The identity has to be written with `adb shell settings put`, read back from the namespace the app reads, and a duplicate has to fail the job.
- `maestro-flows.md`: `text:` selectors are regular expressions matched against the element's entire text. Worked example of an assertion that could never have matched at any value because its parentheses were a capture group, plus the escaping and whole-element-matching rules.
- `maestro-flows.md`: a COMPLETED tap is not a handled tap. `tapOn` reports COMPLETED once the touch is dispatched, and touches are lost between the driver and the app's handler often enough to matter (five taps recorded for two selections on one passing run). The fix is a per-action assertion inside a small `retry`, which keeps the check falsifiable while absorbing a driver-level loss, plus the reason an end-of-sequence assertion cannot diagnose which tap was lost.
- `evidence-integrity.md`: two further ways a verdict is unearned. A probe that sends a different request than the client takes a different branch and can be healthy while the app fails, both correctly at once. Reading back a written setting proves the write, not the behavior, which is what `hide_error_dialogs` does when the platform latched it at boot. Adds the discipline of recording what a change actually did rather than what it was for, so a fix kept for a different reason is not read as a found root cause by the next investigation.
- `mobile-test-strategy.md`: end-to-end runs must not depend on a live feature-flag, personalization, or experiment service evaluating a user the run created seconds earlier. Start the environment with the remote provider unconfigured so the seeded local value wins.

### Changed

- `mobile-ci-device-lab.md`: corrected the `--driver-host-port` guidance. The flag is absent from both `maestro --help` and `maestro test --help` on 2.8.0, so one Maestro process per machine with `--shard-split` is the rule rather than a default with an escape hatch. Adds that `--udid` / `--device` takes a comma-separated list on both platforms, so one sharding implementation covers Android serials and iOS UDIDs.
- `mobile-ci-device-lab.md` and `mobile-test-strategy.md`: shard count is chosen on measured wall clock rather than per-flow duration. Measured on one 14-core host: four emulators finished in 21.1 minutes against 27.3 for two, with per-flow times stretching under the oversubscription. Also adds `--test-output-dir` and `--flatten-debug-output` as the way to stop guessing the artifact layout, and the rule that a cascade of fast artifact-less failures after a driver timeout is one defect rather than four.

## [1.22.3] - 2026-08-14

### Added

- `playwright-utils-mandate.md` knowledge fragment (core tier). Makes `tea_use_playwright_utils: true` binding rather than advisory: when the flag is on, `@seontechnologies/playwright-utils` is the default implementation for every capability it covers. Carries the substitution table (`page.route`/`page.waitForResponse` to `interceptNetworkCall`, raw `request.<method>` to `apiRequest`, `page.waitForTimeout` and hand-written polls to `recurse`, `console.log` to `log`, per-spec `base.extend` to `mergeTests`), a REQUIRED versus RECOMMENDED split so utilities needing project wiring are proposed rather than silently skipped, the legitimate exceptions (`page.route` on analytics, fonts, and third-party scripts), a pre-emit self-check, and a deviation protocol that puts a stated reason on any surviving vanilla call. Scoped to JS/TS suites on the Playwright runner; Cypress, Maestro, Pact/Vitest, and non-Playwright backend suites are explicitly out of scope.
- Criteria registry rows `M9` (MEDIUM) and `L9` (LOW). `M9` fires when a file hand-rolls a capability the installed playwright-utils already provides with no stated deviation; its gate needs both `tea_use_playwright_utils: true` and the package present in `package.json`, so a flag with no install never produces per-file deductions. `L9` fires when a spec imports `test` from `@playwright/test` against a merged-fixtures convention. Both surface in the report as a new `Playwright Utils Adoption` criterion.
- `playwrightUtils` convention key in the `test-review` baseline, mechanically detected in `cli/lib/convention-baseline.js`. Partial migration now reads as an adoption ratio instead of collapsing to a single pass or fail.
- `library-integration-mandate.md` knowledge fragment (core tier). The general contract every per-library mandate instantiates, so the pattern generalizes past the two libraries that exist today: the two gates (the flag is `true` AND the package is installed), the REQUIRED versus RECOMMENDED levels, the deviation protocol, scope decided by the runner a file executes under rather than the language of the code under test, the flag-to-mandate registry, and a ten-point checklist for wiring a new library through config, CLI defaults, fragments, loading, generation, aggregation, review, docs, and changelog. A library wired into fewer than all ten produces the decorative-flag failure the mandates exist to prevent.
- `pactjs-utils-mandate.md` knowledge fragment (core tier). Makes `tea_use_pactjs_utils: true` binding the same way the Playwright mandate does: `createProviderState` instead of a hand-cast `.given('name', obj as JsonMap)`, `buildVerifierOptions` and `buildMessageVerifierOptions` instead of literal `VerifierOptions` objects, `createRequestFilter` / `noOpRequestFilter` instead of bespoke auth middleware, `setJsonContent` / `setJsonBody` instead of repeated PactV4 builder lambdas, `handlePactBrokerUrlAndSelectors` and `getProviderVersionTags` instead of hand-written env and CI branching. `zodToPactMatchers` and the `pact-consumer-di` injection sit at RECOMMENDED because one needs a Zod schema and the other a two-line production change. Carries a relevance gate so a default-on flag never turns into unwanted scaffolding, and restates the determinism rules the mandate does not relax (one `addInteraction()` per `it()`, the Vitest pool settings, provider scrutiny before matchers).
- Criteria registry row `M10` (MEDIUM): a file hand-rolls a capability the installed `@seontechnologies/pactjs-utils` already provides, with no stated deviation. Gated on the flag plus the package being a project dependency, so a flag with no install never produces per-file deductions. `MatchersV3` used directly does not fire it. Surfaces as a new `Pact.js Utils Adoption` criterion, bringing the registry to 35 rows.
- `docs/how-to/customization/integrate-pactjs-utils.md`, covering what the flag changes, the substitution table, the relevance gate, the determinism rules that never relax, and how to turn it off.

### Changed

- **`tea_use_pactjs_utils` now defaults to `true`** (was `false`). It decides _how_ Pact suites are written, not _whether_ a project gets one: the mandate's relevance gate still requires a real consumer-provider boundary: an outbound call to a service the repo does not deploy with, an existing `pact/` directory or `@pact-foundation/pact` dependency, `PACT_BROKER_*` in the environment, a microservices layout, or the user asking. `framework` now checks that gate before creating any Pact directory, script, or CI workflow, and states in the summary when it skipped.
- **`tea_pact_mcp` now defaults to `"mcp"`** (was `"none"`). Unlike the two library flags this one gates a runtime capability rather than a dependency, so its second gate is whether the SmartBear MCP tools are reachable in the session. All six broker-dependent steps now carry an explicit degradation path: probe once, fall back to provider source or an OpenAPI spec, report that the broker was unreachable, and continue. No workflow blocks on it, nothing retries in a loop, and inferred provider states are never presented as broker data.
- `framework` installs `@seontechnologies/pactjs-utils` and `@pact-foundation/pact` and scaffolds samples in the mandated style, where it previously only recommended the packages. Declining the install falls the whole contract scaffold through to the raw-Pact branch rather than leaving imports against a package the project lacks.
- `automate` and `atdd` API workers generate contract artifacts under the mandate and report `pactjs_utils_deviations`; `test-design` loads it so Pact examples in design documents match what `automate` generates.
- The `bmad-tea` agent's critical action and persona principle are now library-agnostic: they read the integration flags, load `library-integration-mandate.md` plus whichever per-library mandate applies, and carry the same rule into ordinary conversation. Asking Murat for a Pact test no longer requires naming `createProviderState` to get it.
- `playwright-utils-mandate.md` now states the package-installed gate explicitly and defers the shared contract to `library-integration-mandate.md`.
- `pact-mcp.md` gains a `When the Tools Are Not Reachable` section, which the six broker-dependent steps now point at instead of each restating it. The probe is defined as a tool-list check and never a broker call, its result is recorded once per run as `pact_mcp_reachable`, and the fallback order is provider source, then an OpenAPI spec, then `confidence-gate.md`.
- `cli/lib/resolve-tea-config.js` resolves `playwright_utils_installed` and `pactjs_utils_installed` from the project manifest and states them in the headless prompt. Both halves of each mandate gate are now resolved in code; the agent is no longer asked to read `package.json` to decide half of it.
- Registry rows `M9` and `L9` report an unspread convention rather than staying silent. When the flag is on and the package is installed but the sampled corpus shows `absent` or `unknown` adoption, the score is unchanged and one run-level line says so. That is the freshly scaffolded case: `framework` writes a few sample specs, `automate` writes twenty, and a review of the twenty measures a corpus too small to score while being entirely clean.
- The `playwrightUtils` convention definition in `step-02-discover-tests.md` now matches the detector regex it is paired with. The table cell still described the two-alternative form after the regex dropped the `merged-fixtures` alternative, so a headless run and an interactive run would have counted different corpora. `L9`'s criterion text moved from "a merged-fixtures convention" to "playwright-utils adoption" for the same reason.
- Registry rows `M9` and `L9` are Convention rows scored against the `playwrightUtils` baseline rather than Applicability rows, so a brownfield repo mid-migration steps down to LOW and a repo at zero adoption deducts nothing. The flag-plus-install half moved out of the Gate column into a new `RUN-LEVEL PRECONDITIONS` section: when a precondition is false those rows do not exist for the run, reported once instead of as a per-file `PASS (n/a)`.
- The `playwrightUtils` convention detector no longer matches a bare `merged-fixtures` import. That is the `fixtures` key's signal, and matching it let a repo with no playwright-utils anywhere register adoption.
- `framework` asks before writing `@seontechnologies/*` packages into `package.json`, naming the packages and their peers. It is the only step that writes outside the test directory.
- The pactjs relevance gate lives in one place. `framework` defers to `pactjs-utils-mandate.md` rather than carrying a looser copy, and the gate now separates signals that settle the question alone from weak ones (an outbound HTTP call, a generated client, a service URL) that need the called service to have no source in this repo plus a second signal.
- The Pact canonical shape in `pactjs-utils-mandate.md` is PactV4 `addInteraction()` with `setJsonContent` and `setJsonBody`, demonstrating four REQUIRED substitutions rather than one. A worker copies the canonical shape, so a PactV3 example that skipped its own rules taught the wrong pattern.
- The Pact.js Utils mandate no longer bans importing `@pact-foundation/pact`. The banned-pattern line read "importing from a package name other than `@seontechnologies/pactjs-utils`", which forbade `PactV3`, `MatchersV3`, and `Verifier` — the Pact API every example in the same fragment imports. Only the helper layer is mandated; the two packages are used side by side.
- `pactjs-utils-zod-to-pact.md` and `confidence-gate.md` ship to every workflow. Five step files loaded the first and nine loaded the second while neither existed outside the agent directory, so each load silently found nothing. `confidence-gate.md` is the terminal branch of the Pact MCP fallback chain and the stop-and-ask rule six fragments cite, so a workflow that could not open it had no floor under either. The parity test's agent-only allowlist is gone rather than emptied: it was the one line asserting intent instead of measuring, and both of its entries were wrong.
- `pact-consumer-di.md` cited `api-testing-foundations.md`, a fragment that has never existed. The reference is `api-testing-patterns.md`.
- The auth fixture scaffold implements the real `AuthProvider` contract. It showed an invented `getToken({ identifier })` method; the interface is `getEnvironment`, `getUserIdentifier`, `extractToken`, `extractCookies`, `isTokenExpired`, and `manageAuthToken`, and a fixture built on the invented shape returns no token.
- Contract scaffolding is gated on relevance, on the package being installed, and on artifacts existing, not on the flag alone. `atdd` requires all three before generating Pact tests, and `ci` skips contract jobs when the repo has no contract tests to run rather than wiring a job that fails every build on a missing script.
- Workers receive `pact_mcp_reachable` and the selected fallback source, so a subagent can tell a reachable broker session from an unavailable one. They previously saw only the mode, which says what the user allows rather than what answered.
- Pact deviations reach the final summary. Only the Playwright roll-up was carried into Step 6, so a stated raw-Pact deviation was recorded by a worker and then dropped.
- The `playwrightUtils` detector matches import syntax rather than the bare package literal, so a prose mention in a comment no longer registers as adoption.
- Browser fixtures are merged conditionally, and the ATDD error-path scaffold carries `skipNetworkMonitoring`. A scaffold that stubs a 409 on purpose would otherwise fail on the backend error it was asserting.
- `merged-fixtures.ts` resolves under `{test_dir}` in every workflow. Three different hardcoded paths across the aggregates, checklists, and fragments could have produced a second entry point in a project whose tests do not live in `tests/`.
- `tea_use_playwright_utils: true` now changes what gets generated, not only which knowledge fragments load. Previously the flag selected a fragment profile while the code templates the generation workers copied from stayed vanilla, so the agent produced `page.route` and raw `request.post` unless the user asked for a utility by name. The API and E2E workers in `*automate` and `*atdd` now carry the playwright-utils template as the primary shape with the vanilla template kept for the flag-off branch, and both list the mandate's substitutions in their success and failure metrics.
- `*automate` aggregation generates `tests/support/merged-fixtures.ts` and an `auth-session`-based auth fixture instead of a form-driven login fixture and a `page.route` mock module. Network stubs move into the tests that need them as `interceptNetworkCall({ url, fulfillResponse })`, so the stub and the assertion stay together.
- `*atdd` aggregation creates the merged-fixtures file the red-phase scaffolds import. A scaffold is the file the developer un-skips and keeps, so it is generated in the mandated style rather than as vanilla code to be rewritten later.
- `*framework` installs `@seontechnologies/playwright-utils` and scaffolds `merged-fixtures.ts`, the auth fixture, and `global-setup.ts` wiring, where it previously only recommended the package. Sample tests are generated in the mandated style, since every later workflow reads them as the reference.
- `*ci` reads `tea_use_playwright_utils` and drives burn-in selection through `runBurnIn` instead of `--only-changed` on Playwright stacks. The workflow previously had no playwright-utils reference at all, despite `module.yaml` listing it as a consumer.
- The `bmad-tea` agent applies the mandate in ordinary conversation, not only inside workflows, via a critical action and a persona principle. Asking Murat to write a Playwright test no longer requires naming `interceptNetworkCall` or `apiRequest` to get them.
- Corrected the package path in the `*automate` and `*atdd` API worker templates: they showed `@playwright-utils/api`, which is not the published package. It is `@seontechnologies/playwright-utils/api-request`.
- The `*atdd` E2E scaffold template used CSS attribute and `:has-text()` selectors while the same file's requirements and failure metrics called those brittle. Template and rules now agree on `getByLabel` and `getByRole`.
- `docs/reference/configuration.md` states what `tea_use_playwright_utils: true` actually means, and corrects the claim that `ci` does not read the key.

### Fixed

- **All eight workflows had been loading stale knowledge.** Six fragments were out of date in every workflow's `resources/knowledge/` directory, having missed agent-level edits that landed after the original copy-in: `contract-testing.md`, `pact-consumer-framework-setup.md` (174 lines of difference), `pactjs-utils-consumer-helpers.md`, `pactjs-utils-overview.md`, `pactjs-utils-provider-verifier.md`, and `test-quality.md`. Workflows read their own copy, never the agent's, so contract-testing and test-quality guidance differed between what the agent recommended and what a workflow generated or reviewed against. Every copy is re-synced from the agent version, which changes the guidance loaded by `framework`, `atdd`, `automate`, `test-design`, `test-review`, `ci`, `nfr`, and `trace`. Expect contract-testing output in particular to change. `test/test-knowledge-base.js` now asserts, per workflow, that the fragment set matches the agent's, that every shared file is byte-identical, and that the workflow's own `tea-index.csv` lists exactly the fragments on disk. That last check had been running against a single workflow before returning early, leaving seven indexes unvalidated: a fragment present on disk but absent from the index is never selected, which looks identical to a fragment that shipped.
- `test-design` progress checkpoints now carry run identity, so a run for one epic no longer clobbers an interrupted run for another ([#128](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues/128)). Every create-mode step wrote to a single fixed `{test_artifacts}/test-design-progress.md`, and each step's save appended to whatever was already there, so a second epic's run merged its content and its `stepsCompleted` into the first epic's checkpoint; resuming the first epic afterwards read the second epic's state. `step-01-detect-mode.md` now resolves `run_scope` and `run_key` (`system`, or `epic-{epic_num}`) before the first save, checkpoints are written to `{test_artifacts}/test-design-progress-{run_key}.md`, and the frontmatter carries `runScope` and `runKey`. Resolving `epic_num` in step 1 also removes the late "if `epic_num` is unclear, ask the user" prompt in `step-05-generate-output.md`, so a plan and its checkpoint always name the same run.
- `test-design` create mode no longer merges two runs into one checkpoint. When a checkpoint already exists for the same scope, step 1 reports its `lastStep` and `lastSaved` and asks whether to resume or start over, and starting over replaces the file instead of appending to it.
- `test-design` resume mode selects the checkpoint belonging to the run being resumed, asks which run to continue when several checkpoints exist and no scope was named, and refuses a checkpoint whose `runKey` does not match. Checkpoints written under the old fixed name are detected, confirmed with the user, and migrated.

## [1.22.2] - 2026-08-14

### Added

- `evidence-integrity.md` knowledge fragment (core tier). Covers the two ways a suite reports a result it did not earn: a check that cannot fail (soft assertions carrying an outcome, `continue-on-error` on the test step, a runner manifest naming a subset of the suite, an assertion whose meaning differs per platform) and a diagnostic with no could-not-measure state, where a missing tool is reported as a failed condition. Also covers verifying a framework property exists and behaves before relying on it, emitting cross-boundary verdicts from the side that can observe them, stating local-versus-CI environment asymmetry, and resolving environment-dependent values before anything derives from them.
- `mobile-ci-device-lab.md` knowledge fragment (specialized tier). Leads with the build-artifact decision: device flows run against a release-shaped or development build, never a prebuilt development shell such as Expo Go, whose absent native modules make deep links, notifications, and payments unassertable and whose launch path exists only in CI. Also covers `reactivecircus/android-emulator-runner` behavior that breaks jobs silently (the `script:` input is split on newlines and each line runs as its own `sh -c`; hardware inputs are appended to `config.ini` on every invocation, outside the AVD-creation guard, which makes the emulator reject the cached snapshot at boot), AVD snapshot cache keying, runner version pinning with a resolved-version assertion, dev-server reachability over `adb reverse` with a manifest health check that sends the client's own headers, the run-directory artifact layout, and driver-port collisions under sharding.
- Criteria registry row `C7` (CRITICAL, applicability-gated to Maestro flows): a flow whose only assertion about its destination state carries `optional: true`, or whose sole outcome assertion follows a command the target platform does not implement, so nothing in the flow could have changed the screen. The registry now carries 32 rows, 4 of them mobile-specific.

### Changed

- `maestro-flows.md` gains a section on commands whose behavior does not match their name: `back` is documented for Android and Web only and the iOS driver's implementation is empty, so it no-ops while reporting COMPLETED; `hideKeyboard` on Android is documented as identical to `back`, which dismisses an open React Native modal; `index:` counts currently-rendered matches rather than list items, so it drifts under virtualization; `point:` is a sanctioned escape hatch only for elements absent from the accessibility tree. Adds the waiting facts that decide flow design (default assertion timeout, no wait-for-app-ready command, `waitForAnimationToEnd` succeeding on timeout, `retry` around a journey being an anti-pattern), plus matching anti-pattern and checklist rows.
- `mobile-test-strategy.md` now makes the build artifact the first CI decision, and corrects the failure-diagnosis order: read per-step statuses and the hierarchy dump captured at failure, and treat the failure screenshot with suspicion because it is taken after teardown.
- `*ci` mobile pipeline guidance now specifies the build artifact, the one-line emulator `script:` form, split AVD cache restore/save, hardware inputs on the creation step only, an asserted runner version, and run-directory artifact resolution.
- `*automate` mobile generation requires every outcome assertion to be able to fail and every cross-platform command to be documented for both platforms or split by `runFlow: when: platform:`.

## [1.22.1] - 2026-08-13

### Removed

- `user_skill_level` from `docs/reference/configuration.md`. It was documented with a full "Impact on TEA" behavior table and exists nowhere in `src/`, `cli/`, `tools/`, or `test/`.
- The `## Maintainability Assessment` section from `nfr-report-template.md` and `checklist.md`. No maintainability worker exists; `steps-c/step-04-evaluate-and-score.md` dispatches security, performance, reliability, and scalability, and throws if a domain's output is missing. Scalability, which is audited by `steps-c/step-04d-subagent-scalability.md`, is promoted from a subsection of Performance to a top-level assessment.
- The `.claude/commands/` directory tree from `README.md`. The installer generates no commands directory for Claude Code; only `github-copilot` and `opencode` declare a `commands_target_dir`.

### Added

- Stable releases now convert `[Unreleased]` into a dated version section on their own. The publish workflow runs `tools/stamp-changelog.js` after the version bump and commits `CHANGELOG.md` with it, so the GitHub Release step finds an exact version heading instead of falling back to an `[Unreleased]` block that grows across releases. Contributors keep writing under `[Unreleased]` exactly as before. Covered by `npm run test:changelog`.
- `docs/reference/live-verification-results.md` publishes the live results JSON schema and the `{target}-LIVE-{NNN}` test-case ID format so any producer can emit it: an agent, a shell script, a CI job, or a person recording an outcome by hand. An example ships with the workflow at `src/workflows/testarch/bmad-testarch-trace/resources/live-verification-results.example.json`.
- `collection_mode: runtime_manifest` is implemented rather than only declared. It reads the live results file as the run's only evidence source and skips static test discovery; a missing or unreadable file resolves `collection_status` to `INACCESSIBLE` instead of reporting 0% coverage. The mode implies the `live` coverage level, so it can no longer be configured into collecting nothing. Because static discovery is skipped, `heuristics.auth_negative_path_status` and `error_path_status` report `unknown` under this mode rather than asserting `present` from an analysis that never ran.
- `e2e-trace-summary.json` gains a `live_evidence` block (disposition counts, recorded and current source sha, freshness, `requirements_live_only`) and a `coverage.by_level.live` bucket. `schema_version` moves to `0.2.0`; both additions are additive.
- Step 4 now emits `collection_status` into the Phase 1 coverage matrix, resolved through the same collection-mode map Step 5 falls back to, so `waived`, `restricted`, `inaccessible`, and `deferred_shared` runs stay gate-ineligible.

### Fixed

- Codex invocation is `$bmad-testarch-<workflow>`, not `$bmad-tea-testarch-<workflow>`. The installer derives a skill's `canonicalId` from its directory name with no module prefix, requires the `SKILL.md` `name` to equal that directory name, and installs to `<target_dir>/<canonicalId>`, so the prefixed form resolves to nothing on any platform. `cli/lib/resolve-skill.js` already probed the unprefixed path. Roughly 24 occurrences corrected, including the ones introduced across nine how-to guides and the quickstart.
- Removed the remaining `/bmad:tea:*` and `/bmad:bmm:tea:*` namespace from `README.md`, `docs/explanation/tea-overview.md`, `docs/reference/commands.md`, `docs/reference/troubleshooting.md`, and the issue template. Roughly 20 occurrences.
- Removed the BMad v4 `*<workflow>` syntax from the templates, checklists, and step files that write it into generated artifacts, so a traceability matrix or NFR report no longer instructs the reader to run a command that does not exist. `*gate` named a workflow that has never existed in this module; the NFR report now routes to `/bmad-testarch-trace` Phase 2, which is what the `GATE` menu entry actually does.
- Code samples imported `@seontechnologies/playwright-utils/fixtures`, which is absent from the package's `exports` map and raises `ERR_PACKAGE_PATH_NOT_EXPORTED`. 113 occurrences across the knowledge base and `docs/how-to/` now use the real per-module subpaths. Related defects in the same samples: `expect` was imported from `api-request/fixtures`, which does not export it; several samples destructured fixtures from a module their import did not provide; and `log.info()` was called on the `log` fixture, which is a plain function rather than the root export's logger object.
- `nfr-assess` audits scalability, not maintainability. Corrected in `docs/reference/commands.md` and `docs/how-to/workflows/run-nfr-assess.md`, which documented thresholds, evidence sources, and a full report section for a domain the workflow never evaluates.
- The knowledge base holds 54 fragments, not 42. Corrected in 21 places, including a `wc -l` check in the troubleshooting guide that told the reader to expect 43 lines from a 55-line file. `docs/reference/knowledge-base.md` documented 44 of the 54 and now indexes all of them, with a tier column checked against `tea-index.csv` and fragment ids matching the manifest.
- `docs/reference/commands.md` described the `test-review` score as four weighted categories. The workflow uses a deduction ledger over 14 criteria with six bonus lines, and `steps-c/step-03f-aggregate-scores.md` explicitly forbids substituting a weighted average.
- `trace` writes `gate-decision.json`, not `gate-decision-{gate_type}-{story_id}.md`. Corrected in `commands.md` and `configuration.md`, along with the omitted `e2e-trace-summary.json` and the undocumented system-level `test-design/{project_name}-handoff.md`.
- The troubleshooting guide pointed at `_bmad/tea/module.yaml` for user configuration; workflows read `_bmad/tea/config.yaml`. It also named `@muratkeremozcan/playwright-utils` for a package published as `@seontechnologies/playwright-utils`, used `test-results/` for an artifacts directory that defaults to `_bmad-output/test-artifacts`, and shipped an installation-validation script that reported every workflow missing on a correct install because it looped over pre-rename directory names.
- Removed published commands that fail when run: `npx playwright install --with-deps chromium@1.40.0` (Playwright has no version-pinning syntax there), six `npm run test:*` scripts the `framework` workflow never generates, `bmad --version`, `npx bmad-method install --verbose` and `--interactive` (neither flag exists), `export TEST_ARTIFACTS` (read by nothing), `node tools/validate-agent-schema.js` (a repo-dev tool absent from a consumer install), and a `DEBUG=bmad:tea:*` mode with no implementation.
- `https://test-architect.bmad-method.org` has no DNS record. Replaced with the published site URL in the quickstart, the troubleshooting guide, and the issue-template contact links. `CONTRIBUTING.md` pointed its clone URL and both issue-template links at an unrelated repository, and three places linked GitHub Discussions, which is disabled here.
- `tools/validate-doc-links.js` only matched hrefs beginning with `/`, so relative links were never checked and the gate reported "All links valid" against nine broken ones. It now resolves `./`, `../`, and bare-filename links against the containing file and validates anchors on them.
- `tools/validate-tea-workflow-descriptions.js` globbed `workflow.md`, a filename removed repo-wide, so `bmad-teach-me-testing` was silently unvalidated while the script's docstring claimed coverage. It now reads `SKILL.md`.
- A code fence in `docs/how-to/workflows/run-nfr-assess.md` closed 254 lines early, so `## What You Get`, `## Tips`, and two subheadings rendered inside a code block on the published site.
- `docs/tutorials/tea-lite-quickstart.md` claimed TodoMVC exposes no test IDs and taught CSS-class selectors on that basis. The app ships `data-testid` on every interactive element, so the tutorial taught the pattern `test-review` scores down. The rewritten spec uses `getByTestId` and `getByRole` and was executed against the live app. The tutorial's first actionable step also referenced an installation guide that does not exist, leaving no way to start it.
- `README.md` claimed support for "10+ platforms" against 45 in the installer's platform table, and a "40-50%" context reduction that measures parallel-subagent speed elsewhere in the docs rather than context. Unverifiable fragment-line counts removed.
- Fixed workflow invocation instructions across tutorials and how-to guides to use valid slash commands (e.g. `/bmad-tea`, `/bmad-testarch-framework`, `/bmad-testarch-test-design`, `/bmad-testarch-automate`), Codex skill syntax (`$bmad-tea`), and agent menu shortcodes (`TF`, `TD`, `TA`, etc.), replacing invalid bare strings.
- Updated BMad installation instructions in `tea-lite-quickstart.md` tutorial to explicitly instruct selecting BMad Test Architect alongside BMad Method.
- `trace` no longer treats "a matching test file exists" as the only shape coverage can take. A requirement verified by running the system produced no file, so trace marked it uncovered and a P0 among them failed the gate, which meant verifying a story scored worse than not verifying it. Trace now reads recorded runtime verification from `{test_artifacts}/live-verification-results.json` as a `live` coverage level. Only a `pass` recorded against the commit under trace counts; `stale`, `unverifiable`, `fail`, `contradicted`, `blocked`, `skipped`, `unmatched`, and `invalid` records are reported as blockers with reasons and count as no coverage. A requirement covered only by live evidence caps the gate at CONCERNS through the same overlay that already caps inferred-oracle coverage, so live evidence can never produce an unconditional PASS. Trace remains a consumer only: it never produces the file and never runs anything to produce it.
- Aligned forced-unscorable candidate handling in `cli/lib/build-prompt.js` and `cli/lib/parse-report.js`: candidates without matching criteria rows are removed from `## Reviewed Files` when excluded in `## Excluded From Review Set`. Added end-to-end stub-agent coverage in `test/test-test-review-cli.js`.
- Corrected shared-account guidance in `mobile-test-strategy.md` to recommend per-run accounts/data or explicit backend reset when server state changes.
- Added `clearKeychain` between `clearState` and `launchApp` in `maestro-flows.md` login setup across all workflow copies.
- Fixed mobile preflight HALT condition in `bmad-testarch-automate` so missing `maestro` on PATH records run as non-executable without halting.
- Aligned mobile worker success contract across automation subagent, generation, and aggregate steps by adding required `success` boolean to mobile schema and validating it before aggregation.
- Updated generated mobile flow guidance to require `clearState` only for device-flow entries, keeping subflows from resetting or relaunching mid-journey.
- Resolved Maestro root directory (`maestro/` or `.maestro/`) and propagated it across generation, scaffolding, and CI pipeline steps.
- Added Mobile framework verification branch to CI preflight step.
- Replaced unpinned Maestro curl installer in CI pipeline generation with release-pinned or checksum-verified immutable artifact.
- Added Mobile prerequisite and context loading branches to framework preflight step, and updated mobile+backend surface handling across framework and test-design workflows.
- Reordered framework scaffold knowledge loading so mobile projects skip Playwright browser fragments, and aligned Maestro config and flow paths.
- Updated Flutter detection in `pubspec.yaml` to require Flutter SDK dependency or platform project directory before classifying as mobile, recognized `*.flow.yml` in Maestro review triggers, and skipped DOM `selector-resilience` for mobile reviews.
- Added `mobile` and `maestro` keywords to `package.json` and `.claude-plugin/marketplace.json`.
- Updated `src/module.yaml`, `docs/explanation/tea-overview.md`, `docs/index.md`, `docs/reference/execution-targets.md`, and `docs/reference/knowledge-base.md` to align mobile native (Maestro) execution targets, tier dimensions, and knowledge fragment loading contracts.
- Normalized the `test-review` checklist's Recommendation vocabulary to the canonical four-value enum (`checklist.md`).

- New `tea-test-review` CLI (`bin` entry) — headless runner for the `bmad-testarch-test-review` skill: changed-test scoping from the PR diff (`--base`, or an explicit `--files` list), prompt-only mode (`--agent none`), JSON verdict (`--json`), and CI exit codes (`--fail-on request-changes|block`). Hardened for required-gate use: stdin-delivered prompt, filesystem isolation (`--isolate`, on by default in CI, `--no-isolate` to opt out), extra test-file matchers (`--test-glob`), a quality-score floor (`--min-score`), non-pass on skips (`--fail-on-skip`) and deletions-only diffs, and strict report validation (dual-section Recommendation, bounded score, violations line, frontmatter, and a `## Reviewed Files` manifest). Ships with `cli/examples/pr-test-review.yml`, a two-job (review + comment) starting template for a required test-review gate, plus `cli/examples/README.md` covering two real adaptations: a central reusable-workflows repo, and a repo already running a third-party review bot.
- `tea-test-review` is no longer Claude-only: `--agent` resolves against a per-vendor adapter table (`cli/lib/agent-adapters.js`) instead of hardcoding `claude -p`'s argv at every call site `--agent-cmd` could override. `--agent codex` spawns `codex exec --sandbox workspace-write`, live-verified with a real review against a real Playwright spec (`codex-cli` 0.146.0) whose report `parseReport()` accepted; that run wrote Key Strengths/Weaknesses as plain bullets instead of the `✅`/`❌`-prefixed form claude reliably produces, which the existing best-effort extraction already tolerates by design (`plain-bullets-key-strengths.md` fixture). A drafted `--agent gemini` adapter was not shipped: this account's `gemini` CLI OAuth login is on a deprecated Code Assist tier with no fallback API key configured, so it was never verified end-to-end.
- Deterministic TEA config in headless runs: `tea-test-review` now resolves `tea_use_playwright_utils`, `tea_use_pactjs_utils`, and `tea_pact_mcp` through an explicit precedence chain (new `--use-playwright-utils` / `--no-use-playwright-utils`, `--use-pactjs-utils` / `--no-use-pactjs-utils`, and `--pact-mcp <mcp|none>` flags, then the project's `_bmad/tea/config.yaml`, then the `src/module.yaml` default) and states all of them in the prompt. `steps-c/step-01-load-context.md` branches on these keys to pick its knowledge fragments, and CI installs the skill from a tarball without running the installer, so `config.yaml` is typically absent: previously the three keys were unstated and the agent settled them per run, meaning two runs over identical files could review against different knowledge, and a contract-testing repository could load `contract-testing.md` instead of the six `pactjs-utils-*` and `pact-*` fragments. Unusable config content is an environment error (exit 2); a missing file is not. The CLI's copy of the module defaults is asserted equal to `src/module.yaml` in the test suite so the two cannot drift.
- Gate semantics for the CLI: `--waive <reason>` with mandatory `--waive-until <YYYY-MM-DD>` expiry (verdict-fails waivable, environment/agent/parse failures never), `--min-files <n>` minimum-evidence floor, `--max-critical <n>` violation cap, inconsistent-verdict rejection (Critical violations with an Approve recommendation fail parsing), and `--skill-root <path>` for an explicit trusted skill source outside the PR checkout.
- First-class headless contract in the `test-review` workflow: new `headless`, `review_files`, `output_file_override`, and `generate_inline_comments` inputs (`workflow.yaml`, `customize.toml`), a Headless mode section in `SKILL.md`, and `review_files` as an authoritative file-set source in the discovery step, so headless runs no longer depend on prompt prose overriding the interactive flow.
- Docs: new `tea-test-review` CLI reference page (`docs/reference/tea-test-review-cli.md`) covering flags, exit codes, the JSON verdict schema, the skill prerequisite, and the security model. `test/README.md` now covers every suite and the `fixtures/test-review-cli/` layout, and drops a stale reference to a `test-cli-integration.sh` that no longer exists.
- Docs: new explanation page `docs/explanation/test-review-cli-architecture.md` on how an interactive skill is wrapped into a headless CI gate — the five modules and the pipeline order, how a workflow is made headless without discarding its customization chain, why the prompt contract and the report parser must be edited together (a strict check absent from the prompt is a false failure, not a gate), why exit 1 is separated from exits 2 and 3, why the CLI must version with the skill, and what the fixture suite can and cannot prove.
- Docs: the CLI reference now states that the reviewed repository never has to commit BMAD files, add a dependency, or install the TEA module. The skill only has to be present in the workspace when the CLI runs, which CI does as a build step from a pinned tarball. The previous "Installed in the consuming project" wording read as a repository prerequisite.
- `test-review` now reads the change it is reviewing. The workflow gains a `context_files` input (`workflow.yaml`, `instructions.md`, `SKILL.md`), `steps-c/step-01-load-context.md` replaces its "Gather Context Artifacts / If available" paragraph with a resolution order that records a `context_basis`, and `test-review-template.md` publishes that basis in the Executive Summary alongside a `## Review Context` manifest. Previously the workflow had no input for a story, a PRD, a diff, or the source under test in either mode: interactive runs only looked flexible because a human was filling an unnamed slot in conversation, and headless runs left it blank, so the same files could be judged against different context on each run. `tea-test-review` fills the input with no new flags by splitting the diff it already computes for the control-plane guard: files matching the test rules are the review set and are scored, everything else is read as context, so a story committed in the pull request is read as a matter of course. The context set skips lockfiles, snapshots, and binary assets, orders documentation ahead of source, and caps at 40 files, reporting `pr_diff_truncated` when the cap bites so a report never implies it read a whole change it only partly saw.
- `tea-test-review` now pins the review model instead of leaving it to the vendor, and a new `--model <model>` overrides the pin. Vendor-agnostic is not model-agnostic: an unpinned model resolves from `~/.codex/config.toml` or `~/.claude/settings.json` on a developer machine and from the vendor's built-in default on a CI runner, which has neither file, so the same pull request was reviewed by one model locally and a different one in CI, and the CI one moved silently whenever a vendor shipped a new default. The adapter table now carries `defaultModel` (`claude`: `sonnet`, `codex`: `gpt-5.6-sol`) and the resolved model travels in the verdict JSON as `model` alongside `agent`, so a stored score says what produced it and two scores are only compared when both match. The adapter suppresses its pinned default whenever the `--claude-arg` passthrough already names a model, which is required rather than tidy: codex rejects a repeated `--model` with a clap usage error, so emitting both would have broken every run using the pre-existing escape hatch. `--model` values are validated as bare model names and rejected when they start with `-`, since the value is spliced into the agent's argv; `--model` with `--agent none` is an error rather than a silently ignored input. Codex reasoning effort remains deliberately unpinned as a vendor-specific knob (`--claude-arg -c --claude-arg model_reasoning_effort=low`).
- Two invariants keep the new context set from corrupting the verdict, each stated in the prompt and enforced in `parse-report.js`. The manifests are disjoint: a path in both `## Reviewed Files` and `## Review Context` is a parse failure, because the deduction ledger is a test-quality rubric and scoring a story or a controller with it produces a meaningless number. And context may raise a finding but never waive one: it is prose from the same author as the change, so without that rule a story asserting a bad practice is acceptable here becomes a silent scoring override. The CLI additionally rejects a report claiming a stronger `Context Basis` than the run supplied, while allowing a weaker one.

### Changed

- Documentation sweep for correctness and concision across `docs/`, `README.md`, and the workflow templates that emit text into generated artifacts. `docs/` drops from 17,608 to 12,273 lines with no workflow, parameter, footgun, or caveat removed. `docs/reference/troubleshooting.md` 837 to 315, `docs/reference/configuration.md` 1,149 to 531, `docs/tutorials/learn-testing-tea-academy.md` 258 to 67 (it was a second copy of the how-to and is now a tutorial), and `docs/explanation/` down 29% by collapsing arguments that were stated in full in three to six places into one owner plus pointers.
- `docs/explanation/subagent-architecture.md` merged into `docs/explanation/step-file-architecture.md`. The two documented one subsystem from opposite sides and neither was complete alone: the worker-split map lived in one and the resulting speedups in the other.
- The nine `docs/how-to/workflows/*` guides no longer repeat a 9 to 13 line invocation preamble each. `docs/reference/commands.md` gains `## Invoking a TEA Workflow` as the single canonical description of the three invocation surfaces, and the guides point at it. The reference had also kept documenting the superseded weighted-average `test-review` score after `steps-c/step-03f-aggregate-scores.md` moved to the deduction ledger, and kept documenting maintainability as an NFR domain after the workflow moved to scalability.
- Removed `test:cli` from the default `npm test` script (and Husky pre-commit hook) to keep local git hooks fast, running `test:cli` as part of CI validation in `quality.yaml` and `publish.yaml`.
- `test-review` now has a single scoring model. The deduction ledger printed in `test-review-template.md` (Critical -10, High -5, Medium -2, Low -1, plus six bonus categories worth 0 or 5 each) is authoritative, and `steps-c/step-03f-aggregate-scores.md` no longer computes a competing weighted average of the four quality dimensions. Grades are limited to A/B/C/D/F. Two live runs over an identical file set had returned 83 and 92 under the old ambiguity, one of them printing a breakdown that did not sum to its own total.
- `tea-test-review` recomputes the ledger from the report's own violation counts and rejects a report whose published score contradicts its breakdown, whose bonus total is not a multiple of 5 within 0-30, or that omits the `## Quality Score Breakdown` section. The prompt states the same arithmetic, so the strict check never demands a shape the reviewer was not told to produce.
- `tea-test-review` no longer forbids the scratch files the skill itself requires: the prompt permits the `/tmp/tea-test-review-*.json` outputs that `steps-c/step-03*` write and that `step-03` aborts without, while still forbidding every other write, including the test files under review.
- `output_file_override` is now honored where reports are actually written. Each step that resolves `{outputFile}` states that a non-empty override replaces the frontmatter default, so the input works for native skill runs and not only through the CLI prompt.
- NFR workflow boundary clarified: `test-design` now owns NFR planning (thresholds, planned evidence, NFR-derived risks) and `nfr-assess` is reframed as NFR Evidence Audit — evaluating implementation evidence against planned thresholds after code exists.
- `nfr-assess` step-02 now checks for an existing `test-design` NFR plan first and uses it as the primary threshold source, falling back to raw documents only for missing or UNKNOWN thresholds.
- TEA agent menu gains a `GATE` routing intent that guides users through the release gate sequence (optional test-review → optional nfr-assess → trace Phase 2 gate) without merging those workflows.
- NFR domains in `nfr-assess` corrected from "maintainability" to "scalability" to match the four parallel subagent domains (security, performance, reliability, scalability).
- TEA phase table updated: `nfr-assess` marked optional at the Release phase.
- NFR planning items in `test-design` step-05 output checklist conditioned on NFR scope.
- Engagement models table: TEA Solo row for NFR Evidence Audit updated from No to Optional.
- GitHub Actions workflow dependencies upgraded to Node 24-compatible major versions:
  - `actions/checkout@v5`
  - `actions/setup-node@v6`
  - `actions/create-github-app-token@v3`
- Publish releases now use `[Unreleased]` changelog notes before falling back to generated GitHub release notes when an exact version section is missing.
- Documented workflow-local knowledge resources as intentional self-contained skill packaging and added validation for workflow-local knowledge indexes.

- Normalized the `test-review` checklist's Recommendation vocabulary to the canonical four-value enum (`checklist.md`).
- `test-review` score aggregation now emits a CRITICAL severity tier (`step-03f`), mapped to the report's `Critical Issues (Must Fix)` section, matching the template's four-tier violations line; `generate_inline_comments` is now a defined workflow input (default `false`) instead of an unresolved reference in the checklist.
- `test-review` reports now carry a machine-readable `## Reviewed Files` manifest section in `test-review-template.md`, and every step's first-save frontmatter snippet declares `workflowType: 'testarch-test-review'`. A report produced from the template alone now satisfies the headless verdict schema, so a clean review can no longer be reported as a parse failure when the agent follows the template rather than prompt prose.
- `tea-test-review` isolation and agent environment corrections: artifacts written directly to the project root are copied back under the chmod isolation fallback (previously `EACCES`, surfacing a clean review as exit 3), the macOS sandbox profile permits the `/tmp` subagent output files the workflow's own step contract requires, and the minimal agent environment keeps `USER`, `LOGNAME`, and `CLAUDE_CODE_OAUTH_TOKEN` so a subscription or token login stays authenticated.
- `tea-test-review` chmod isolation now restores the project tree's exact permission bits from a snapshot taken before the lock. The previous `chmod -R u+w` restore is not an inverse of `chmod -R a-w`: it stripped group and other write bits and left deliberately read-only files writable.
- `tea-test-review` reviewed-files manifest ignores prose lines and strips inline markup, so a sentence inside the report's `## Reviewed Files` section can no longer inflate the `--min-files` evidence floor; a section with no file paths is a parse failure rather than a pass.
- `tea-test-review` no longer false-fails a valid report whose `stepsCompleted` frontmatter is a YAML flow sequence wrapped across several lines, which is the shape a formatter produces once the list outgrows one line. A live run produced an otherwise complete 742-line report and the CLI rejected it with exit 3.
- `tea-test-review` prompt names the `## Decision` heading literally instead of describing it as "Decision Recommendations", which is what the template calls a different thing. A live `--agent codex` review of a real Playwright spec produced a complete, correct 257-line report (`Request Changes`, five High violations, every planted defect found) and the CLI rejected it with exit 3 for a missing `## Decision` section, because the agent named the heading after the sentence in the prompt rather than after the template. Claude happened to get it right by reading the template. This is the false-failure case `docs/explanation/test-review-cli-architecture.md` warns about: a strict check whose wording differs from the prompt is not a gate.
- Corrected a false claim in `cli/lib/agent-adapters.js` and the CLI reference: `OPENAI_API_KEY` is not a working credential fallback for `--agent codex`. codex 0.146.0 never reads it and authenticates only from `~/.codex/auth.json`; a run with only the variable set sends no credential at all and fails `401 ... Missing bearer or basic authentication in header`. Verified with `HOME` pointed at an empty directory, where the error changes to `Incorrect API key provided` only after `printenv OPENAI_API_KEY | codex login --with-api-key`, which proves the key is sent only once that file exists. Every earlier codex verification ran against a developer machine's existing subscription login, so the API-key path had never been exercised.
- `tea-test-review` no longer strips markdown emphasis characters globally when reading the report's file manifests, which silently rewrote any `snake_case` path in the evidence list (`tests/user_profile.spec.ts` became `tests/userprofile.spec.ts` in the verdict JSON). Only emphasis that wraps a whole value is removed. The same bug would have reduced the new `pr_diff` basis value to `prdiff`.
- `cli/examples/pr-test-review.yml` pins `TEA_VERSION: 1.20.0`, the first release that ships the `tea-test-review` bin. The template was authored against 1.19.1, which publishes the review skill with an empty `bin`, so any repository that copied it installed a package with no CLI and failed on `tea-test-review: command not found` after two successful install steps.
- The PR comment digest names the reviewed files instead of only counting them, so a finding that cites a line number is attributable on a pull request touching more than one test file. Applies to all three comment builders: `cli/examples/pr-test-review.yml`, the repo's own dogfood workflow (`.github/workflows/tea-test-review.yaml`), and the standalone `tea-test-review` action.

---

## [1.22.0] - 2026-08-09

### Fixed

- All forty-two `resolve_customization.py` call sites are invoked with `uv run` instead of a bare `python3` (#120). The script declares `requires-python = ">=3.11"` and hard-exits below it, because `tomllib` is a 3.11 stdlib addition. On macOS without Homebrew or Ubuntu 22.04, where `python3` is 3.10, activation fell through to the skill's "if the script fails" path and hand-merged the TOML layers in-context — no error surfaced, so a run could resolve customization subtly wrong and look fine. `uv run` reads the script's own `requires-python` and provisions a matching interpreter, so whatever `python3` resolves to on your PATH no longer matters. Covers the agent, all nine testarch workflows, and their `steps-v`/`steps-e`/`steps-c` hooks.
- The customization guidance in `docs/reference/troubleshooting.md` and `docs/how-to/customization/extend-tea-with-custom-workflows.md` uses `uv run` (#120). These are the extension guides, so every custom TEA workflow authored from them was reproducing the defect on day one.
- Removed remaining certificate wording from the `bmad-teach-me-testing` plan doc, completing the rename to completion summary.

### Requirements

- `uv` is what you need; a system Python is not. TEA skills no longer invoke a bare interpreter. Install [`uv`](https://docs.astral.sh/uv/) and it provisions the right Python per script.

---

## [1.16.0] - 2026-05-08

### Added

- Claude Cowork marketplace plugin support.
- TEA Phase 3 command examples in the overview docs, including direct slash commands and Codex skill invocations.
- System-level and per-epic `test-design` usage examples in the TEA overview docs.

### Changed

- Catalog dependency metadata now uses `preceded-by` and `followed-by` column names.
- TEA overview command guidance now distinguishes workflow names, TEA menu codes, slash commands, and Codex skills.

### Fixed

- Normalized `module-help.csv` to the documented 13-column schema.
- Clarified the exact `/bmad:tea:ci` command path for Phase 3 CI setup.
- Clarified the difference between Phase 3 system-level `test-design` and Phase 4 per-epic `test-design`.

---

## [1.2.4] - 2026-02-22

### Changed

- **All workflow descriptions optimized** for skill selection and display
  - Descriptions shortened and made more concise for better UI rendering
  - Added explicit trigger phrases (e.g., "Use when user says 'lets write acceptance tests'") to improve skill detection
  - Affected workflows: `atdd`, `automate`, `ci`, `framework`, `nfr-assess`, `teach-me-testing`, `test-design`, `test-review`, `trace`
  - Removed redundant `web_bundle: false` from workflow.yaml files

## [Historical Unreleased Notes]

### Added

- **Playwright CLI Integration**: New `playwright-cli.md` knowledge fragment (42 total)
- **Browser Automation Config**: New `tea_browser_automation` config with 4 modes: `auto`, `cli`, `mcp`, `none`
- **Auto Mode Heuristic**: Smart CLI/MCP selection per workflow action with fallback
- **How-To Guide**: `docs/how-to/customization/configure-browser-automation.md`
- **Knowledge Test Script**: `test:knowledge` npm script added to test chain

### Changed

- **Breaking**: `tea_use_mcp_enhancements` (boolean) replaced by `tea_browser_automation` (string)
  - `true` -> `"auto"` (recommended), `false` -> `"none"`
- All workflow preflight steps updated to read `tea_browser_automation`
- All browser-touching workflow steps updated with CLI/MCP/auto branching
- Subagent context passes `browser_automation` instead of `use_mcp_enhancements`
- Module subheader updated to reference Playwright CLI
- **Breaking**: Orchestration terminology standardized to `subagent` / `agent-team` (removed `subprocess` wording)
  - Renamed worker step files from `*-subprocess-*` to `*-subagent-*` in `automate`, `atdd`, `nfr-assess`, and `test-review`
  - Updated orchestration mode resolution examples to use `subagent` only
  - Renamed architecture docs: `subprocess-architecture.md` -> `subagent-architecture.md`, `subprocess-implementation-status.md` -> `subagent-implementation-status.md`
  - Updated docs navigation, troubleshooting references, and workflow/resource indexes to new names
  - Updated workflow contract labels/examples from `subprocess` to `subagent` (for example `subagent_execution`, `subagentType`)

### Deprecated

- `tea_use_mcp_enhancements` flag — use `tea_browser_automation` instead
- `enable-tea-mcp-enhancements.md` guide — redirects to `configure-browser-automation.md`

---

## [1.0.0] - 2026-01-XX (Upcoming)

### 🎉 TEA Module Independence Release

TEA (Test Engineering Architect) is now a standalone BMAD module, extracted from the core BMAD Method repository. This release marks TEA's independence as a dedicated test strategy and quality engineering module.

### Added

#### Core Infrastructure

- **Standalone Module**: TEA now installable independently via `npx bmad-method install`
- **Module Namespace**: All commands now use `/bmad:tea:*` namespace
- **Agent Persona**: Murat (Master Test Architect and Quality Advisor)
- **Configuration System**: 6 module variables with installation prompts
  - `test_artifacts` - Base output folder for test artifacts
  - `tea_use_playwright_utils` - Playwright Utils integration toggle
  - `tea_use_mcp_enhancements` - Playwright MCP enhancements toggle
  - `test_framework` - Default framework preference (future)
  - `risk_threshold` - Risk cutoff for mandatory testing (future)
  - Output folder configurations: `test_design_output`, `test_review_output`, `trace_output`

#### Workflows (8 Total)

All workflows implement the **trivariate step pattern** (Create/Edit/Validate):

1. **Framework Setup (`TF` / `/bmad:tea:framework`)**
   - Scaffold Playwright/Cypress test frameworks
   - Configure project structure and dependencies
   - Setup test configuration and helpers

2. **CI/CD Integration (`CI` / `/bmad:tea:ci`)**
   - Generate GitHub Actions and GitLab CI pipelines
   - Configure quality gates and test execution
   - Setup test reporting and artifact management

3. **Test Design (`TD` / `/bmad:tea:test-design`)**
   - System-level and epic-level test planning
   - Risk-based test strategy with P0-P3 prioritization
   - Test coverage planning and traceability mapping

4. **ATDD (`AT` / `/bmad:tea:atdd`)**
   - Generate failing acceptance tests (TDD red phase)
   - **Subagent Architecture**: Parallel API + E2E test generation
   - Acceptance criteria validation checklist

5. **Test Automation (`TA` / `/bmad:tea:automate`)**
   - Expand automation coverage systematically
   - **Subagent Architecture**: Parallel API + E2E test generation
   - Coverage gap analysis and prioritization

6. **Test Review (`RV` / `/bmad:tea:test-review`)**
   - Comprehensive test quality audit (0-100 scoring)
   - **Subagent Architecture**: Parallel evaluation across 5 quality dimensions
     - Determinism
     - Isolation
     - Maintainability
     - Coverage
     - Performance
   - Actionable improvement recommendations

7. **Requirements Tracing (`TR` / `/bmad:tea:trace`)**
   - Map requirements to test coverage
   - Gap analysis and missing test identification
   - Go/No-Go release gate decision

8. **NFR Assessment (`NR` / `/bmad:tea:nfr-assess`)**
   - Non-functional requirements evaluation
   - **Subagent Architecture**: Parallel assessment across 4 NFR domains
     - Security
     - Performance
     - Reliability
     - Scalability
   - Evidence-based scoring with recommendations

#### Subagent Architecture (Phase 5)

- **19 Subagent Step Files** for parallel execution:
  - `automate`: 3 subagent files (2 parallel + aggregate)
  - `atdd`: 3 subagent files (2 parallel + aggregate)
  - `test-review`: 6 subagent files (5 parallel + aggregate)
  - `nfr-assess`: 5 subagent files (4 parallel + aggregate)
  - `trace`: Two-phase separation (coverage → gate decision)
- **Temp File Outputs**: Each subagent writes to `/tmp/bmad-tea-*` files
- **Aggregation Step**: Consolidates subagent results into final output
- **Documentation**: Complete subagent architecture documentation in `docs/explanation/`

#### Knowledge Base System

- **35 Knowledge Fragments** organized by category:
  - Architecture & Fixtures (5 fragments)
  - Data & Setup (3 fragments)
  - Network & Reliability (5 fragments)
  - Test Execution & CI (4 fragments)
  - Quality & Standards (4 fragments)
  - Risk & Gates (3 fragments)
  - Selectors & Timing (2 fragments)
  - Feature Flags & Testing Patterns (2 fragments)
  - Playwright-Utils Integration (6 fragments)
- **Context Engineering**: Dynamic fragment loading per workflow
- **CSV-Based Index**: `src/agents/bmad-tea/resources/tea-index.csv` for fragment management
- **Consistency**: Ensures standardized outputs across workflows

#### Documentation

- **Diataxis-Compliant Structure**: 29 markdown files across 4 categories
  - **Tutorials**: TEA Lite 30-minute quickstart
  - **How-To Guides**: 9 workflow guides + 4 customization guides
  - **Explanation**: 11 concept docs (engagement models, risk-based testing, knowledge base system, etc.)
  - **Reference**: 3 reference docs (commands, configuration, knowledge base index)
  - **Glossary**: Comprehensive terminology reference
- **Documentation Site**: Ready for deployment to `test-architect.bmad-method.org`
- **Build Tools**: Documentation build pipeline, link validation, and auto-fix tools
- **LLM Discovery**: `llms.txt` and `llms-full.txt` for AI agent consumption

#### Engagement Models

- **No TEA**: Continue with existing testing approach
- **TEA Solo**: Standalone use on non-BMAD projects
- **TEA Lite**: Fast onboarding with `automate` workflow only
- **Integrated**: Full TEA integration with BMAD Method (Phases 3-4 + release gates)
- **Enterprise**: Complete quality governance with all 9 workflows

#### Testing & Quality

- **85 Automated Tests**: Complete test coverage
  - 52 agent schema validation tests
  - 33 installation component tests
- **Pre-commit Hooks**: Automated quality checks
  - ESLint + Prettier formatting
  - Markdownlint validation (204 files)
  - Documentation link validation
  - Schema validation
- **Lint-Staged**: Auto-fix on commit for JS, YAML, JSON, and Markdown

### Changed

#### Breaking Changes

- **Command Namespace**: Changed from `/bmad:bmm:tea:*` to `/bmad:tea:*`
  - Old: `/bmad:bmm:tea:test-design`
  - New: `/bmad:tea:test-design`
- **Module Installation**: Now requires separate installation step
  - TEA no longer included by default with BMAD Method
  - Install via: `npx bmad-method install` → Select "Test Architect (TEA)"
- **File Paths**: Knowledge base moved from `src/bmm/testarch/` to `src/testarch/`
- **Agent ID**: Changed from `_bmad/bmm/tea` to `_bmad/tea/`
- **Configuration**: Module-specific variables now in `src/module.yaml` instead of BMM config

#### Improvements

- **Step File Architecture**: All workflows converted to trivariate pattern
  - `steps-c/` (Create mode) - 5-7 steps per workflow
  - `steps-e/` (Edit mode) - 2 steps per workflow
  - `steps-v/` (Validate mode) - 1 step per workflow
- **Validation Reports**: Comprehensive validation with checklist scoring
- **Documentation Links**: All internal links validated and fixed (309 → 0 broken links)
- **Subagent Optimization**: Parallel execution for faster workflow completion

### Fixed

- All documentation links updated from `/docs/tea/` to `/docs/`
- Knowledge base path references updated from BMM structure to standalone
- Agent schema validation for module independence
- Pre-commit hook compatibility with documentation build process

### Documentation

- Website: [test-architect.bmad-method.org](https://test-architect.bmad-method.org) (upcoming)
- Repository: [github.com/bmad-code-org/bmad-method-test-architecture-enterprise](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise)
- Full Documentation: Available in `llms-full.txt` (~445K chars, ~111K tokens)

### Technical Details

- **Lines of Code**: ~20K lines (workflows, knowledge base, documentation)
- **Step Files**: 134 total step files across 9 workflows
- **Knowledge Fragments**: 34 reusable testing patterns
- **Documentation Files**: 204 markdown files
- **Test Coverage**: 85 automated tests (100% passing)
- **Supported Frameworks**: Playwright, Cypress
- **Node Version**: >=20.0.0

---

## Version History

- **1.0.0** (2026-01-XX) - TEA Module Independence Release
  - Standalone module extraction from BMAD Method
  - 9 workflows with subagent architecture
  - 34 knowledge base fragments
  - Complete documentation suite

---
