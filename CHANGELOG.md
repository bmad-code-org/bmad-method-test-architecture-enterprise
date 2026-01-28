# Changelog

All notable changes to the Test Architect (TEA) module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
   - **Subprocess Architecture**: Parallel API + E2E test generation
   - Acceptance criteria validation checklist

5. **Test Automation (`TA` / `/bmad:tea:automate`)**
   - Expand automation coverage systematically
   - **Subprocess Architecture**: Parallel API + E2E test generation
   - Coverage gap analysis and prioritization

6. **Test Review (`RV` / `/bmad:tea:test-review`)**
   - Comprehensive test quality audit (0-100 scoring)
   - **Subprocess Architecture**: Parallel evaluation across 5 quality dimensions
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
   - **Subprocess Architecture**: Parallel assessment across 4 NFR domains
     - Security
     - Performance
     - Reliability
     - Scalability
   - Evidence-based scoring with recommendations

#### Subprocess Architecture (Phase 5)

- **19 Subprocess Step Files** for parallel execution:
  - `automate`: 3 subprocess files (2 parallel + aggregate)
  - `atdd`: 3 subprocess files (2 parallel + aggregate)
  - `test-review`: 6 subprocess files (5 parallel + aggregate)
  - `nfr-assess`: 5 subprocess files (4 parallel + aggregate)
  - `trace`: Two-phase separation (coverage → gate decision)
- **Temp File Outputs**: Each subprocess writes to `/tmp/bmad-tea-*` files
- **Aggregation Step**: Consolidates subprocess results into final output
- **Documentation**: Complete subprocess architecture documentation in `docs/explanation/`

#### Knowledge Base System

- **34 Knowledge Fragments** organized by category:
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
- **CSV-Based Index**: `src/testarch/tea-index.csv` for fragment management
- **Consistency**: Ensures standardized outputs across workflows

#### Documentation

- **Diataxis-Compliant Structure**: 29 markdown files across 4 categories
  - **Tutorials**: TEA Lite 30-minute quickstart
  - **How-To Guides**: 8 workflow guides + 4 customization guides
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
- **Enterprise**: Complete quality governance with all 8 workflows

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
- **Subprocess Optimization**: Parallel execution for faster workflow completion

### Fixed

- All documentation links updated from `/docs/tea/` to `/docs/`
- Knowledge base path references updated from BMM structure to standalone
- Agent schema validation for module independence
- Pre-commit hook compatibility with documentation build process

### Migration Guide

For users migrating from BMM-embedded TEA, see [`docs/MIGRATION.md`](docs/MIGRATION.md) for:

- Command namespace updates
- Installation instructions
- Configuration changes
- Path reference updates
- Troubleshooting common issues

### Documentation

- Website: [test-architect.bmad-method.org](https://test-architect.bmad-method.org) (upcoming)
- Repository: [github.com/bmad-code-org/bmad-method-test-architecture-enterprise](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise)
- Full Documentation: Available in `llms-full.txt` (~445K chars, ~111K tokens)

### Technical Details

- **Lines of Code**: ~20K lines (workflows, knowledge base, documentation)
- **Step Files**: 134 total step files across 8 workflows
- **Knowledge Fragments**: 34 reusable testing patterns
- **Documentation Files**: 204 markdown files
- **Test Coverage**: 85 automated tests (100% passing)
- **Supported Frameworks**: Playwright, Cypress
- **Node Version**: >=20.0.0

---

## [Unreleased]

_Future releases will be documented here._

---

## Version History

- **1.0.0** (2026-01-XX) - TEA Module Independence Release
  - Standalone module extraction from BMAD Method
  - 8 workflows with subprocess architecture
  - 34 knowledge base fragments
  - Complete documentation suite

---

_For detailed migration instructions, see [docs/MIGRATION.md](docs/MIGRATION.md)_
