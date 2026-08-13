---
title: 'How to Run Test Design with TEA'
description: How to create comprehensive test plans using TEA's test-design workflow
---

Use TEA's `test-design` workflow to create comprehensive test plans with risk assessment, NFR planning, and coverage strategies.

## When to Use This

**System-level (Phase 3):**

- After architecture is complete
- Before implementation-readiness gate
- To validate architecture testability
- To define NFR thresholds, unknowns, and planned evidence before implementation

**Epic-level (Phase 4):**

- At the start of each epic
- Before implementing stories in the epic
- To identify epic-specific testing needs
- To refine NFR validation when the epic has security, performance, reliability, scalability, compliance, or maintainability requirements

:::note[Prerequisites]

- BMad Method installed
- TEA agent available
- For system-level: Architecture document complete
- For epic-level: Epic defined with stories
  :::

## Steps

### 1. Load the TEA Agent or Skill

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-test-design` (or `/bmad-tea`)
- **Codex:** `$bmad-tea-testarch-test-design` (or `$bmad-tea`)
- **Agent Menu Trigger (inside `/bmad-tea` chat):** `test-design` or `TD`

### 2. Run the Test Design Workflow

```bash
/bmad-testarch-test-design
```

### 3. Specify the Mode

TEA will ask if you want:

- **System-level** — For architecture testability review and NFR planning (Phase 3)
- **Epic-level** — For epic-specific test and NFR planning (Phase 4)

### 4. Provide Context

For system-level:

- Point to your architecture document
- Reference any ADRs (Architecture Decision Records)
- Include PRD NFRs, SLO/SLA targets, compliance requirements, and known monitoring needs

For epic-level:

- Specify which epic you're planning
- Reference the epic file with stories
- Mention any NFR-heavy scenarios or inherited system-level NFR plans

### 5. Review the Output

TEA generates test design document(s) based on mode.

## What You Get

**System-Level Output (TWO Documents):**

TEA produces two focused documents for system-level mode:

1. **`test-design-architecture.md`** (for Architecture/Dev teams)
   - Purpose: Architectural concerns, testability gaps, NFR requirements
   - Quick Guide with 🚨 BLOCKERS / ⚠️ HIGH PRIORITY / 📋 INFO ONLY
   - Risk assessment (high/medium/low-priority with scoring)
   - NFR testability requirements: thresholds, unknowns, architecture gaps, planned evidence
   - Testability concerns and architectural gaps
   - Risk mitigation plans for high-priority risks (≥6)
   - Assumptions and dependencies

2. **`test-design-qa.md`** (for QA team)
   - Purpose: Test execution recipe, coverage plan, Sprint 0 setup
   - Test coverage plan (P0/P1/P2/P3 with detailed scenarios + checkboxes)
   - NFR test coverage plan with planned validation tools and evidence artifacts
   - Sprint 0 setup requirements (blockers, infrastructure, environments)

`test-design` does **not** make final NFR PASS/CONCERNS/FAIL decisions. It defines the thresholds and evidence that `nfr-assess` audits later.

**Why Two Documents?**

- **Architecture teams** can scan blockers in <5 min (Quick Guide format)
- **QA teams** have actionable test recipes (step-by-step with checklists)
- **No redundancy** between documents (cross-references instead of duplication)
- **Clear separation** of concerns (what to deliver vs how to test)

**Epic-Level Output (ONE Document):**

**`test-design-epic-N.md`** (combined risk assessment + test plan)

- Risk assessment for the epic
- Test priorities (P0-P3)
- Coverage plan
- NFR planning when NFRs are in scope
- Regression hotspots (for brownfield)
- Integration risks
- Mitigation strategies

## Test Design for Different Tracks

| Track          | Phase 3 Focus                                    | Phase 4 Focus                              |
| -------------- | ------------------------------------------------ | ------------------------------------------ |
| **Greenfield** | System-level testability + NFR planning          | Per-epic risk assessment and test plan     |
| **Brownfield** | System-level + existing test baseline            | Regression hotspots, integration/NFR risks |
| **Enterprise** | Compliance-aware testability + NFR evidence plan | Security/performance/compliance focus      |

## Examples

**System-Level (Two Documents):**

- `cluster-search/cluster-search-test-design-architecture.md` - Architecture doc with Quick Guide
- `cluster-search/cluster-search-test-design-qa.md` - QA doc with test scenarios

**Key Pattern:**

- Architecture doc: "ASR-1: OAuth 2.1 required (see QA doc for 12 test scenarios)"
- QA doc: "OAuth tests: 12 P0 scenarios (see Architecture doc R-001 for risk details)"
- No duplication, just cross-references

## Tips

- **Run system-level right after architecture** — Early testability review
- **Shift NFRs left** — Define thresholds and planned evidence before implementation
- **Run epic-level at the start of each epic** — Targeted test planning
- **Update if ADRs change** — Keep test design aligned
- **Use output to guide other workflows** — Feeds into `atdd` and `automate`
- **Use `nfr-assess` later** — Audit evidence after tests, scans, metrics, or logs exist
- **Architecture teams review Architecture doc** — Focus on blockers and mitigation plans
- **QA teams use QA doc as implementation guide** — Follow test scenarios and Sprint 0 checklist

## Next Steps

After test design:

1. **Setup Test Framework** — If not already configured
2. **Implementation Readiness** — System-level feeds into gate check
3. **Story Implementation** — Epic-level guides testing during dev
4. **NFR Evidence Audit** — Run `nfr-assess` after implementation evidence exists
