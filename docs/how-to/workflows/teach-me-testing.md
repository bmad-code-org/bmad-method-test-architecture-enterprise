---
title: 'How to Learn Testing with TEA Academy'
description: Multi-session learning companion that teaches testing fundamentals through advanced practices with state persistence
---

# How to Learn Testing with TEA Academy

Learn testing through seven self-paced TEA Academy sessions.
The workflow saves your progress so you can pause and resume.

## When to Use This

- **New QA engineers:** Complete onboarding in testing fundamentals
- **Developers:** Learn testing from an integration perspective
- **Team leads:** Understand architecture patterns and team practices
- **VPs/Managers:** Grasp testing strategy and quality metrics
- **Anyone:** Who wants to learn testing without requiring an instructor

## What You'll Learn

### 7 Progressive Sessions

1. **Quick Start (30 min)**: TEA Lite intro, understand engagement models
2. **Core Concepts (45 min)**: Risk-based testing (P0-P3), Definition of Done
3. **Architecture & Patterns (60 min)**: Fixtures, network-first patterns, data factories
4. **Test Design (60 min)**: Risk assessment and coverage planning workflow
5. **ATDD & Automate (60 min)**: TDD red-green approach, test generation
6. **Quality & Trace (45 min)**: Test review (rubric 5.0 criteria and severity scoring), coverage traceability
7. **Advanced Patterns (ongoing)**: Explore 59 knowledge fragments on-demand

### What You'll Gain

Each session produces notes you can use on your project.
The completion summary records your scores and the topics covered.

## Prerequisites

- 30-90 minutes per session (you can pause and resume)

## How It Works

### Starting Fresh

- **Claude Code / Cursor / Windsurf:** `/bmad-teach-me-testing`
- **Codex:** `$bmad-teach-me-testing`
- **Inside a `/bmad-tea` chat:** `TMT`

Full invocation rules: [Invoking a TEA Workflow](/docs/reference/commands.md#invoking-a-tea-workflow).

### Initial Assessment

The workflow will ask about:

- **Your role:** QA, Dev, Lead, or VP (customizes examples)
- **Experience level:** Beginner, intermediate, or experienced
- **Learning goals:** What you want to achieve
- **Pain points:** (Optional) Current testing challenges

### Session Menu (The Hub)

After assessment, you'll see a menu of all 7 sessions with:

- ✅ Completed sessions (with scores)
- 🔄 In-progress sessions
- ⬜ Not-started sessions
- Completion percentage
- Recommended next session

Choose any session from the menu.

### Session Flow

Each session follows this pattern:

1. **Teaching**: Concepts presented with role-adapted examples
2. **Quiz**: 3 questions to validate understanding (≥70% to pass)
3. **Session Notes**: Artifact generated with key takeaways
4. **Progress Update**: Automatic save (can pause anytime)
5. **Return to Menu**: Choose next session or exit

### Progress Tracking

Your progress is automatically saved:

- **Progress file:** `{test_artifacts}/teaching-progress/{your-name}-tea-progress.yaml`
- **Session notes:** `{test_artifacts}/tea-academy/{your-name}/session-{N}-notes.md`
- **Completion summary:** `{test_artifacts}/tea-academy/{your-name}/tea-completion-summary.md` (after all 7 sessions)

### Resuming Later

Run the workflow again to resume from your saved progress.

## Learning Paths by Experience

### Beginners (New to Testing)

**Recommended path:** Sessions 1 → 2 → 3 → 4 → 5 → 6 → 7

Start at Session 1 and work through sequentially.
Each session builds on previous concepts.

**Time commitment:** 1-2 weeks (30-90 min per session)

### Intermediate (Have Written Tests)

**Recommended path:** Sessions 1 → 2 → 3 → 4 → 5 → 6 → 7

You might breeze through Sessions 1-2 and focus on 3-6.

**Time commitment:** 1 week (can skip familiar topics)

### Experienced (Strong Testing Background)

**Recommended path:** Jump to Sessions 3, 4, 7

Skip fundamentals, focus on:

- Session 3: TEA architecture patterns
- Session 4: Test Design workflow
- Session 7: Advanced patterns (59 knowledge fragments)

**Time commitment:** 3-4 hours (highly targeted)

## Session Details

### Session 1: Quick Start (30 min)

**Topics:**

- What is TEA and why it exists
- TEA Lite approach (30-minute value)
- Engagement models (Lite/Solo/Integrated/Enterprise/Brownfield)
- Automate workflow overview

**Resources:** TEA Overview, TEA Lite Quickstart, Automate Workflow docs

### Session 2: Core Concepts (45 min)

**Topics:**

- Testing as engineering philosophy
- Risk-based testing (P0-P3 matrix)
- Probability × Impact scoring
- Definition of Done (7 quality principles)

**Resources:** Testing as Engineering, Risk-Based Testing, Test Quality Standards docs **Knowledge Fragments:** test-quality.md, probability-impact.md

### Session 3: Architecture & Patterns (60 min)

**Topics:**

- Fixture composition patterns
- Network-first patterns (prevent race conditions)
- Data factories
- Step-file architecture

**Resources:** Fixture Architecture, Network-First Patterns, Step-File Architecture docs **Knowledge Fragments:** fixture-architecture.md, network-first.md, data-factories.md

### Session 4: Test Design (60 min)

**Topics:**

- Test Design workflow
- Risk/testability assessment
- Coverage planning (unit/integration/E2E)
- Test priorities matrix (P0-P3 coverage targets)

**Resources:** Test Design workflow docs **Knowledge Fragments:** test-levels-framework.md, test-priorities-matrix.md

### Session 5: ATDD & Automate (60 min)

**Topics:**

- ATDD workflow (failing tests first)
- TDD red-green-refactor loop
- Automate workflow (coverage expansion)
- API testing patterns

**Resources:** ATDD, Automate workflow docs **Knowledge Fragments:** component-tdd.md, api-testing-patterns.md, api-request.md

### Session 6: Quality & Trace (45 min)

**Topics:**

- Test Review workflow: rubric 5.0 criteria, deductions, severity caps (69/79/89/99), and a bonus cap of 25
- Trace workflow (coverage traceability)
- Quality metrics that matter (P0/P1 coverage vs vanity metrics)
- Release gate decisions

**Resources:** Test Review, Trace workflow docs

### Session 7: Advanced Patterns (Ongoing)

**Topics:**

- Menu-driven exploration of 59 knowledge fragments
- 5 categories: Testing Patterns, Playwright Utils, Configuration & Governance, Quality Frameworks, Auth & Security
- Deep-dive into specific patterns as needed
- GitHub links for browsing source

**Resources:** All 59 knowledge fragments **GitHub:** [Knowledge Base Repository](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/tree/main/skills/bmod-tea/knowledge)

## Completion Summary

Complete all 7 sessions to receive your TEA Academy completion summary with:

- Session completion dates and scores
- Average score across all sessions
- Skills acquired checklist
- Learning artifacts paths
- Recommended next steps

## Tips for Success

Practice each topic on your project before moving on.
Pause whenever needed; the workflow saves progress after each quiz.

## Role-Based Customization

The workflow adapts examples based on your role:

**QA Engineers:** Practical testing focus, workflow usage, coverage expansion **Developers:** Integration perspective, TDD approach, API testing **Tech Leads:** Architecture decisions, team patterns, code review standards **VPs/Managers:** Strategy, ROI, quality metrics, team scaling

## Troubleshooting

### Progress file not found

If you've run the workflow before but it doesn't detect your progress:

- Check: `{test_artifacts}/teaching-progress/{your-name}-tea-progress.yaml`
- Workflow auto-creates on first run

### Quiz failing repeatedly

If scoring <70% on quizzes:

- Select [R] to review content again
- Or select [C] to continue (score recorded, you can retake later)

### Want to restart from scratch

Delete your progress file.
`{test_artifacts}` is the `test_artifacts` value under `[modules.tea]` in `_bmad/config.toml` (default `{project-root}/_bmad-output/test-artifacts`), and `{your-name}` is the name you gave in the initial assessment.
With those defaults and the name `alex`:

```bash
rm _bmad-output/test-artifacts/teaching-progress/alex-tea-progress.yaml
```

## Related Workflows

Use these workflows to practice:

- [Framework](/docs/how-to/workflows/setup-test-framework.md): Set up test framework
- [Test Design](/docs/how-to/workflows/run-test-design.md): Plan test coverage
- Automation [red mode (ATDD)](/docs/how-to/workflows/run-atdd.md): Generate and verify failing acceptance tests first
- Automation [expand mode](/docs/how-to/workflows/run-automate.md): Add coverage, run generated tests, and repair test issues
- [Test Review](/docs/how-to/workflows/run-test-review.md): Audit test quality
- [Trace](/docs/how-to/workflows/run-trace.md): Requirements traceability

## Additional Resources

- **Documentation:** [TEA Overview](/explanation/tea-overview/)
- **Knowledge Base:** [Knowledge Base Reference](/reference/knowledge-base/)
- **GitHub Fragments:** [Knowledge Base Repository](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/tree/main/skills/bmod-tea/knowledge)

## Support

Questions or issues?
See [Troubleshooting](/reference/troubleshooting/) or file an issue on the GitHub repository.
