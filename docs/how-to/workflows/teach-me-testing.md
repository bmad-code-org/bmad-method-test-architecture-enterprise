---
title: 'How to Learn Testing with TEA Academy'
description: Multi-session learning companion that teaches testing fundamentals through advanced practices with state persistence
---

# How to Learn Testing with TEA Academy

Use TEA's `teach-me-testing` workflow (TEA Academy) to learn testing progressively through 7 structured sessions. Designed for self-paced learning over 1-2 weeks with automatic progress tracking.

## When to Use This

- **New QA engineers:** Complete onboarding in testing fundamentals
- **Developers:** Learn testing from an integration perspective
- **Team leads:** Understand architecture patterns and team practices
- **VPs/Managers:** Grasp testing strategy and quality metrics
- **Anyone:** Who wants to learn testing without requiring an instructor

**Perfect for:**

- Company onboarding (new QAs complete in 1-2 weeks)
- Self-paced learning (pause and resume anytime)
- Non-linear exploration (jump to any session based on experience)
- Building testing knowledge that scales

## What You'll Learn

### 7 Progressive Sessions

1. **Quick Start (30 min)** - TEA Lite intro, understand engagement models
2. **Core Concepts (45 min)** - Risk-based testing (P0-P3), Definition of Done
3. **Architecture & Patterns (60 min)** - Fixtures, network-first patterns, data factories
4. **Test Design (60 min)** - Risk assessment and coverage planning workflow
5. **ATDD & Automate (60 min)** - TDD red-green approach, test generation
6. **Quality & Trace (45 min)** - Test review (5 dimensions), requirements traceability
7. **Advanced Patterns (ongoing)** - Explore 35 knowledge fragments on-demand

### What You'll Gain

- ✅ Testing fundamentals (risk-based, test pyramid, types)
- ✅ TEA methodology (9 workflows, architecture patterns)
- ✅ Practical skills (write your first good test)
- ✅ Knowledge artifacts (session notes, completion certificate)
- ✅ Confidence to apply TEA to your project

## Prerequisites

- BMad Method installed with TEA module
- Access to TEA documentation and knowledge base
- 30-90 minutes per session (can pause and resume)
- Willingness to learn progressively over 1-2 weeks

## How It Works

### Starting Fresh

Start a fresh chat and load TEA:

```
tea
```

Then select Teach Me Testing:

```
TMT
```

Or directly:

```
teach-me-testing
```

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

**Jump to any session** - You're not locked into a linear path!

### Session Flow

Each session follows this pattern:

1. **Teaching** - Concepts presented with role-adapted examples
2. **Quiz** - 3 questions to validate understanding (≥70% to pass)
3. **Session Notes** - Artifact generated with key takeaways
4. **Progress Update** - Automatic save (can pause anytime)
5. **Return to Menu** - Choose next session or exit

### Progress Tracking

Your progress is automatically saved:

- **Progress file:** `{test_artifacts}/teaching-progress/{your-name}-tea-progress.yaml`
- **Session notes:** `{test_artifacts}/tea-academy/{your-name}/session-{N}-notes.md`
- **Certificate:** `{test_artifacts}/tea-academy/{your-name}/tea-completion-certificate.md` (after all 7 sessions)

### Resuming Later

Simply run the workflow again - it automatically detects your progress and shows where you left off.

## Learning Paths by Experience

### Beginners (New to Testing)

**Recommended path:** Sessions 1 → 2 → 3 → 4 → 5 → 6 → 7

Start at Session 1 and work through sequentially. Each session builds on previous concepts.

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
- Session 7: Advanced patterns (35 knowledge fragments)

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

**Resources:** Testing as Engineering, Risk-Based Testing, Test Quality Standards docs
**Knowledge Fragments:** test-quality.md, probability-impact.md

### Session 3: Architecture & Patterns (60 min)

**Topics:**

- Fixture composition patterns
- Network-first patterns (prevent race conditions)
- Data factories
- Step-file architecture (the pattern this workflow uses!)

**Resources:** Fixture Architecture, Network-First Patterns, Step-File Architecture docs
**Knowledge Fragments:** fixture-architecture.md, network-first.md, data-factories.md

### Session 4: Test Design (60 min)

**Topics:**

- Test Design workflow
- Risk/testability assessment
- Coverage planning (unit/integration/E2E)
- Test priorities matrix (P0-P3 coverage targets)

**Resources:** Test Design workflow docs
**Knowledge Fragments:** test-levels-framework.md, test-priorities-matrix.md

### Session 5: ATDD & Automate (60 min)

**Topics:**

- ATDD workflow (failing tests first)
- TDD red-green-refactor loop
- Automate workflow (coverage expansion)
- API testing patterns

**Resources:** ATDD, Automate workflow docs
**Knowledge Fragments:** component-tdd.md, api-testing-patterns.md, api-request.md

### Session 6: Quality & Trace (45 min)

**Topics:**

- Test Review workflow (5 dimensions: determinism, isolation, maintainability, coverage, performance)
- Trace workflow (requirements traceability)
- Quality metrics that matter (P0/P1 coverage vs vanity metrics)
- Release gate decisions

**Resources:** Test Review, Trace workflow docs

### Session 7: Advanced Patterns (Ongoing)

**Topics:**

- Menu-driven exploration of 35 knowledge fragments
- 5 categories: Testing Patterns, Playwright Utils, Configuration & Governance, Quality Frameworks, Auth & Security
- Deep-dive into specific patterns as needed
- GitHub links for browsing source

**Resources:** All 35 knowledge fragments
**GitHub:** [Knowledge Base Repository](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/tree/main/src/testarch/knowledge)

## Completion Certificate

Complete all 7 sessions to receive your TEA Academy completion certificate with:

- Session completion dates and scores
- Average score across all sessions
- Skills acquired checklist
- Learning artifacts paths
- Recommended next steps

## Tips for Success

1. **Set aside dedicated time** - Each session requires focus (30-90 min)
2. **Take your own notes** - Session notes are generated, but add personal insights
3. **Apply immediately** - Practice concepts on your current project
4. **Explore fragments** - Session 7 has 35 fragments for deep-dive topics
5. **Share with team** - Help others learn by sharing your experience
6. **Don't rush** - Learning takes time, pause and resume as needed

## Role-Based Customization

The workflow adapts examples based on your role:

**QA Engineers:** Practical testing focus, workflow usage, coverage expansion
**Developers:** Integration perspective, TDD approach, API testing
**Tech Leads:** Architecture decisions, team patterns, code review standards
**VPs/Managers:** Strategy, ROI, quality metrics, team scaling

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

Delete your progress file to start fresh:

```bash
rm {test_artifacts}/teaching-progress/{your-name}-tea-progress.yaml
```

## Related Workflows

After completing TEA Academy, you're ready to use:

- [Framework](./setup-test-framework.md) - Set up test framework
- [Test Design](./run-test-design.md) - Plan test coverage
- [ATDD](./run-atdd.md) - Generate failing tests first
- [Automate](./run-automate.md) - Expand test coverage
- [Test Review](./run-test-review.md) - Audit test quality
- [Trace](./run-trace.md) - Requirements traceability

## Additional Resources

- **Documentation:** [TEA Overview](/explanation/tea-overview/)
- **Knowledge Base:** [Knowledge Base Reference](/reference/knowledge-base/)
- **GitHub Fragments:** [Knowledge Base Repository](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/tree/main/src/testarch/knowledge)

## Support

Questions or issues? See [Troubleshooting](/reference/troubleshooting/) or file an issue on the GitHub repository.
