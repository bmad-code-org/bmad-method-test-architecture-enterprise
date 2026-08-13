# Changelog

All notable changes to the Test Architect (TEA) module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Stable releases now convert `[Unreleased]` into a dated version section on their own. The publish workflow runs `tools/stamp-changelog.js` after the version bump and commits `CHANGELOG.md` with it, so the GitHub Release step finds an exact version heading instead of falling back to an `[Unreleased]` block that grows across releases. Contributors keep writing under `[Unreleased]` exactly as before. Covered by `npm run test:changelog`.
- `docs/reference/live-verification-results.md` publishes the live results JSON schema and the `{target}-LIVE-{NNN}` test-case ID format so any producer can emit it: an agent, a shell script, a CI job, or a person recording an outcome by hand. An example ships with the workflow at `src/workflows/testarch/bmad-testarch-trace/resources/live-verification-results.example.json`.
- `collection_mode: runtime_manifest` is implemented rather than only declared. It reads the live results file as the run's only evidence source and skips static test discovery; a missing or unreadable file resolves `collection_status` to `INACCESSIBLE` instead of reporting 0% coverage. The mode implies the `live` coverage level, so it can no longer be configured into collecting nothing. Because static discovery is skipped, `heuristics.auth_negative_path_status` and `error_path_status` report `unknown` under this mode rather than asserting `present` from an analysis that never ran.
- `e2e-trace-summary.json` gains a `live_evidence` block (disposition counts, recorded and current source sha, freshness, `requirements_live_only`) and a `coverage.by_level.live` bucket. `schema_version` moves to `0.2.0`; both additions are additive.
- Step 4 now emits `collection_status` into the Phase 1 coverage matrix, resolved through the same collection-mode map Step 5 falls back to, so `waived`, `restricted`, `inaccessible`, and `deferred_shared` runs stay gate-ineligible.

### Fixed

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
