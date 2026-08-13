---
title: 'TEA Command Reference'
description: Quick reference for all 9 TEA workflows - inputs, outputs, and links to detailed guides
---

# TEA Command Reference

Quick reference for all 9 TEA (Test Engineering Architect) workflows. For detailed step-by-step guides, see the how-to documentation.

All workflows listed here are current and supported in TEA, including `nfr-assess`.

**Invocation by tool:**

- Claude Code / Cursor / Windsurf: use slash commands (for example, `/bmad:tea:automate`)
- Codex: use `$` skills from `.agents/skills` (for example, `$bmad-tea-testarch-automate`)
- Custom TEA extensions: package the workflow as custom content/module and attach it to `bmad-tea` via customization. See [Extend TEA with Custom Workflows](../how-to/customization/extend-tea-with-custom-workflows.md)

## Quick Index

- [`teach-me-testing`](#teach-me-testing) - Learn testing (TEA Academy)
- [`test-design`](#test-design) - Risk-based test planning
- [`framework`](#framework) - Scaffold test framework
- [`ci`](#ci) - Setup CI/CD pipeline
- [`atdd`](#atdd) - Acceptance TDD
- [`automate`](#automate) - Test automation
- [`test-review`](#test-review) - Quality audit
- [`nfr-assess`](#nfr-assess) - NFR Evidence Audit
- [`trace`](#trace) - Coverage traceability
- [`GATE`](#gate-agent-menu-shortcut) - Release gate routing helper (agent menu only)

---

## teach-me-testing

**Purpose:** Interactive learning companion - teaches testing fundamentals through advanced practices

**Phase:** Learning / Onboarding (before all other phases)

**Frequency:** Once per learner (can revisit sessions anytime)

**Key Inputs:**

- Role (QA, Dev, Lead, VP)
- Experience level (beginner, intermediate, experienced)
- Learning goals

**Key Outputs:**

- Progress tracking file (`teaching-progress/{user}-tea-progress.yaml`)
- Session notes for each completed session
- Completion summary (after all 7 sessions)
- Learning artifacts (notes, test examples)

**7 Sessions:**

1. Quick Start (30 min) - TEA Lite intro, engagement models
2. Core Concepts (45 min) - Risk-based testing, P0-P3, DoD
3. Architecture (60 min) - Fixtures, network-first, data factories
4. Test Design (60 min) - Risk assessment, coverage planning
5. ATDD & Automate (60 min) - TDD red-green, test generation
6. Quality & Trace (45 min) - Test review, traceability, metrics
7. Advanced Patterns (ongoing) - 42 knowledge fragments exploration

**Features:**

- Multi-session with state persistence (pause/resume anytime)
- Non-linear (jump to any session based on experience)
- Quiz validation (≥70% to pass)
- Role-adapted examples (QA/Dev/Lead/VP)
- Automatic progress tracking

**How-To Guide:** [Learn Testing with TEA Academy](/docs/how-to/workflows/teach-me-testing.md)

**Tutorial:** [Learn Testing with TEA Academy](/docs/tutorials/learn-testing-tea-academy.md)

---

## framework

**Purpose:** Scaffold production-ready test framework (Playwright or Cypress)

**Phase:** Phase 3 (Solutioning)

**Frequency:** Once per project

**Key Inputs:**

- Tech stack, test framework choice, testing scope

**Key Outputs:**

- `tests/` directory with `support/fixtures/` and `support/helpers/`
- `playwright.config.ts` or `cypress.config.ts`
- `.env.example`, `.nvmrc`
- Sample tests with best practices

**How-To Guide:** [Setup Test Framework](/docs/how-to/workflows/setup-test-framework.md)

---

## ci

**Purpose:** Setup CI/CD pipeline with selective testing and burn-in

**Phase:** Phase 3 (Solutioning)

**Frequency:** Once per project

**Key Inputs:**

- CI platform (GitHub Actions, GitLab CI, etc.)
- Sharding strategy, burn-in preferences

**Key Outputs:**

- Platform-specific CI workflow (`.github/workflows/test.yml`, etc.)
- Parallel execution configuration
- Burn-in loops for flakiness detection
- Secrets checklist

**How-To Guide:** [Setup CI Pipeline](/docs/how-to/workflows/setup-ci.md)

---

## test-design

**Purpose:** Risk-based test planning with coverage strategy and NFR planning

**Phase:** Phase 3 (system-level), Phase 4 (epic-level)

**Frequency:** Once (system), per epic (epic-level)

**Modes:**

- **System-level:** Architecture testability review and NFR planning (TWO documents)
- **Epic-level:** Per-epic risk and NFR planning (ONE document)

**Key Inputs:**

- System-level: Architecture, PRD, ADRs
- Epic-level: Epic, stories, acceptance criteria

**Key Outputs:**

**System-Level (TWO Documents):**

- `test-design-architecture.md` - For Architecture/Dev teams
  - Quick Guide (🚨 BLOCKERS / ⚠️ HIGH PRIORITY / 📋 INFO ONLY)
  - Risk assessment with scoring
  - Testability concerns and gaps
  - NFR thresholds, unknowns, and planned evidence
  - Mitigation plans
- `test-design-qa.md` - For QA team
  - Test execution recipe
  - Coverage plan (P0/P1/P2/P3 with checkboxes)
  - Sprint 0 setup requirements
  - NFR test coverage and evidence plan

**Epic-Level (ONE Document):**

- `test-design-epic-N.md`
  - Risk assessment (probability × impact scores)
  - Test priorities (P0-P3)
  - Coverage strategy
  - NFR planning when NFRs are in scope
  - Mitigation plans

**Why Two Documents for System-Level?**

- Architecture teams scan blockers in <5 min
- QA teams have actionable test recipes
- No redundancy (cross-references instead)
- Clear separation (what to deliver vs how to test)

**Browser Automation (CLI/MCP):** Exploratory mode (live browser UI discovery)

**How-To Guide:** [Run Test Design](/docs/how-to/workflows/run-test-design.md)

---

## atdd

**Purpose:** Generate red-phase acceptance test scaffolds BEFORE implementation (TDD red phase)

**Phase:** Phase 4 (Implementation)

**Frequency:** Per story (optional)

**Key Inputs:**

- Story with acceptance criteria, test design, test levels

**Key Outputs:**

- Red-phase test scaffolds (`tests/api/`, `tests/e2e/`) marked with `test.skip()`
- Implementation checklist keyed to `story_key`
- Story metadata / handoff paths for downstream `dev-story` consumption

**Browser Automation (CLI/MCP):** Recording mode (for skeleton UI only - rare)

**How-To Guide:** [Run ATDD](/docs/how-to/workflows/run-atdd.md)

---

## automate

**Purpose:** Expand test coverage after implementation

**Phase:** Phase 4 (Implementation)

**Frequency:** Per story/feature

**Key Inputs:**

- Feature description, test design, existing tests to avoid duplication

**Key Outputs:**

- Comprehensive test suite (`tests/e2e/`, `tests/api/`)
- Updated fixtures, README
- Definition of Done summary

**Browser Automation (CLI/MCP):** Healing + Recording modes (fix tests, verify selectors)

**How-To Guide:** [Run Automate](/docs/how-to/workflows/run-automate.md)

---

## test-review

**Purpose:** Audit test quality with 0-100 scoring

**Phase:** Phase 4 (optional per story), Release Gate

**Frequency:** Per epic or before release

**Key Inputs:**

- Test scope (file, directory, or entire suite)

**Key Outputs:**

- `test-review.md` with quality score (0-100)
- Critical issues with fixes
- Recommendations
- Category scores (Determinism, Isolation, Maintainability, Performance)
- Coverage guidance is informational only; coverage scoring and gates are handled by `trace`

**Scoring Categories:**

- Determinism: 30%
- Isolation: 30%
- Maintainability: 25%
- Performance: 15%

**How-To Guide:** [Run Test Review](/docs/how-to/workflows/run-test-review.md)

---

## nfr-assess

**Purpose:** Audit implemented NFR evidence against defined thresholds

**Phase:** Release Gate; optional earlier evidence audit when implementation evidence exists

**Frequency:** Per release (enterprise projects)

**Key Inputs:**

- NFR categories (Security, Performance, Reliability, Maintainability)
- Thresholds from PRD, architecture, or `test-design`
- Evidence locations (test reports, scans, metrics, logs, monitoring, CI results)

**Key Outputs:**

- `nfr-assessment.md`
- Category assessments (PASS/CONCERNS/FAIL)
- Mitigation plans
- Gate decision inputs

**Boundary:** Use `test-design` to plan NFR thresholds and evidence before implementation. Use `nfr-assess` after evidence exists to audit the evidence.

**How-To Guide:** [Run NFR Evidence Audit](/docs/how-to/workflows/run-nfr-assess.md)

---

## trace

**Purpose:** Coverage traceability + quality gate decision

**Phase:** Phase 2/4 (traceability), Release Gate (decision)

**Frequency:** Baseline, per epic refresh, release gate

**Two-Phase Workflow:**

**Phase 1: Coverage Traceability**

- Coverage oracle items → test mapping
- Coverage classification (FULL/PARTIAL/NONE)
- Gap prioritization
- Output: `traceability-matrix.md`

**Phase 2: Gate Decision**

- PASS/CONCERNS/FAIL/WAIVED decision
- Evidence-based (coverage %, quality scores, NFRs)
- Output: `gate-decision-{gate_type}-{story_id}.md`

**Gate Rules:**

- P0 coverage: 100% required
- P1 coverage: ≥90% for PASS, 80-89% for CONCERNS, <80% FAIL
- Overall coverage: ≥80% required

**How-To Guide:** [Run Trace](/docs/how-to/workflows/run-trace.md)

---

## GATE (Agent Menu Shortcut)

**Purpose:** Release gate routing helper — not a standalone workflow; produces no artifact of its own.

**Trigger:** Type `GATE` in chat after loading the TEA agent (`bmad-tea`).

**What it does:** Determines which release gate evidence exists and guides you through the correct sequence:

1. (Optional) `test-review` — final test quality audit
2. (Optional) `nfr-assess` — NFR Evidence Audit
3. `trace` Phase 2 — PASS/CONCERNS/FAIL/WAIVED gate decision

The agent asks which evidence is available and routes to the right workflow. It does not merge these workflows; each workflow is invoked separately in sequence.

**When to use:** When you are approaching a release and want a single starting point that covers all release gate checks without needing to know which workflow to invoke first.

---

## Summary Table

| Command            | Phase      | Frequency                 | Primary Output             |
| ------------------ | ---------- | ------------------------- | -------------------------- |
| `teach-me-testing` | Learning   | Once per learner          | Progress + notes + summary |
| `test-design`      | 3, 4       | System + per epic         | Test design + NFR plan     |
| `framework`        | 3          | Once                      | Test infrastructure        |
| `ci`               | 3          | Once                      | CI/CD pipeline             |
| `atdd`             | 4          | Per story (optional)      | Failing tests              |
| `automate`         | 4          | Per story                 | Passing tests              |
| `test-review`      | 4, Gate    | Per epic/release          | Quality report             |
| `nfr-assess`       | Gate       | Per release               | NFR evidence audit         |
| `trace`            | 2, 4, Gate | Baseline + refresh + gate | Coverage matrix + decision |

---

## See Also

**How-To Guides (Detailed Instructions):**

- [Learn Testing with TEA Academy](/docs/how-to/workflows/teach-me-testing.md)
- [Setup Test Framework](/docs/how-to/workflows/setup-test-framework.md)
- [Setup CI Pipeline](/docs/how-to/workflows/setup-ci.md)
- [Run Test Design](/docs/how-to/workflows/run-test-design.md)
- [Run ATDD](/docs/how-to/workflows/run-atdd.md)
- [Run Automate](/docs/how-to/workflows/run-automate.md)
- [Run Test Review](/docs/how-to/workflows/run-test-review.md)
- [Run NFR Evidence Audit](/docs/how-to/workflows/run-nfr-assess.md)
- [Run Trace](/docs/how-to/workflows/run-trace.md)

**Explanation:**

- [TEA Overview](/docs/explanation/tea-overview.md) - Complete TEA lifecycle
- [Engagement Models](/docs/explanation/engagement-models.md) - When to use which workflows

**Reference:**

- [TEA Configuration](/docs/reference/configuration.md) - Config options
- [Knowledge Base Index](/docs/reference/knowledge-base.md) - Pattern fragments

---

Generated with [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
