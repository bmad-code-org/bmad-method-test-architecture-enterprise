---
title: 'Learn Testing with TEA Academy'
description: Start your testing journey with TEA Academy - 7 progressive sessions from fundamentals to advanced practices
---

# Learn Testing with TEA Academy

**Time:** 1-2 weeks (self-paced, 7 sessions)
**Who:** QA engineers, developers, leads, VPs - anyone learning testing
**What:** Progressive learning from fundamentals to advanced TEA practices

## What is TEA Academy?

TEA Academy is an interactive learning companion that teaches testing through 7 structured sessions. Unlike reading documentation, TEA Academy:

- **Teaches progressively:** Build knowledge session by session
- **Validates understanding:** Quiz after each session (≥70% to pass)
- **Tracks progress:** Resume anytime with automatic state persistence
- **Adapts to your role:** Examples customized for QA/Dev/Lead/VP
- **Generates artifacts:** Session notes and completion certificate

## Quick Start

### 1. Load TEA Agent

```bash
tea
```

### 2. Start TEA Academy

```bash
TMT
```

Or type:

```bash
teach-me-testing
```

### 3. Complete Assessment

Answer 4 questions:

- Your role (QA/Dev/Lead/VP)
- Experience level (beginner/intermediate/experienced)
- Learning goals
- Pain points (optional)

### 4. Choose Your First Session

The session menu shows all 7 sessions. Pick based on your experience:

**Beginners:** Start with Session 1 (Quick Start)
**Intermediate:** Review Session 2 (Core Concepts) or jump to Session 3
**Experienced:** Jump directly to Session 7 (Advanced Patterns)

### 5. Complete Sessions

Each session:

- Teaches concepts with examples
- Validates understanding with 3-question quiz
- Generates session notes
- Saves progress automatically

### 6. Earn Your Certificate

Complete all 7 sessions to receive your TEA Academy completion certificate!

## The 7 Sessions

### Session 1: Quick Start (30 min)

**What you'll learn:**

- What is TEA and why it exists
- TEA Lite 30-minute approach
- 9 workflows overview
- 5 engagement models

**Perfect for:** Everyone - establishes foundation

### Session 2: Core Concepts (45 min)

**What you'll learn:**

- Testing as engineering philosophy
- Risk-based testing (P0-P3 matrix)
- Probability × Impact scoring
- Definition of Done (7 quality principles)

**Perfect for:** Beginners and intermediate learners

### Session 3: Architecture & Patterns (60 min)

**What you'll learn:**

- Fixture composition
- Network-first patterns
- Data factories
- Step-file architecture

**Perfect for:** Intermediate and experienced learners wanting TEA patterns

### Session 4: Test Design (60 min)

**What you'll learn:**

- Test Design workflow
- Risk/testability assessment
- Coverage planning strategy
- Test levels framework

**Perfect for:** Anyone planning test coverage

### Session 5: ATDD & Automate (60 min)

**What you'll learn:**

- ATDD workflow (red-green TDD)
- Automate workflow (coverage expansion)
- Component TDD patterns
- API testing without browser

**Perfect for:** Developers and QA engineers writing tests

### Session 6: Quality & Trace (45 min)

**What you'll learn:**

- Test Review workflow (5 dimensions)
- Quality scoring (0-100)
- Trace workflow (requirements traceability)
- Release gate decisions

**Perfect for:** Quality-focused engineers and leads

### Session 7: Advanced Patterns (Ongoing)

**What you'll learn:**

- Menu-driven exploration of 34 knowledge fragments
- Deep-dive into specific patterns as needed
- GitHub repository browsing

**Categories:**

- Testing Patterns (9 fragments)
- Playwright Utils (11 fragments)
- Configuration & Governance (6 fragments)
- Quality Frameworks (5 fragments)
- Authentication & Security (3 fragments)

**Perfect for:** Everyone; it adapts to your experience level

## Progress Tracking

### Automatic Saves

Progress is saved after:

- Assessment complete
- Each quiz completion
- Each session notes generation
- User-initiated exit

### Resume Capability

Run the workflow anytime - it automatically:

- Detects existing progress
- Shows dashboard with completion status
- Offers to resume where you left off

### Your Artifacts

All generated artifacts are saved:

```
{test_artifacts}/
├── teaching-progress/
│   └── {your-name}-tea-progress.yaml       # Progress tracking
└── tea-academy/
    └── {your-name}/
        ├── session-01-notes.md              # Session notes
        ├── session-02-notes.md
        ├── ...
        ├── session-07-notes.md
        └── tea-completion-certificate.md    # Certificate (after all 7)
```

## Customization by Role

### QA Engineers

**Focus:** Practical workflow usage, coverage expansion, quality metrics
**Examples:** Test suite maintenance, framework setup, CI configuration
**Recommended sessions:** All 7 (comprehensive QA onboarding)

### Developers

**Focus:** TDD approach, integration testing, API testing
**Examples:** Feature development with tests, red-green-refactor, mocking
**Recommended sessions:** 1, 2, 5, 3, 4 (TDD-focused path)

### Tech Leads

**Focus:** Architecture decisions, team patterns, code review standards
**Examples:** Establishing team standards, fixture architecture, CI governance
**Recommended sessions:** 1, 3, 4, 6, 7 (architecture and quality focus)

### VPs/Managers

**Focus:** Testing strategy, ROI, team scalability, quality metrics
**Examples:** Justifying automation investment, risk-based prioritization
**Recommended sessions:** 1, 2, 4, 6 (strategy and metrics focus)

## FAQ

**How long does it take?**
1-2 weeks for new QAs completing all 7 sessions. Experienced engineers can complete in 3-4 hours by jumping to relevant sessions.

**Can I skip sessions?**
Yes! Jump to any session from the menu. Sessions are independent but build on concepts.

**What if I fail a quiz?**
You can review the content and try again, or continue anyway. Your score is recorded.

**Can I retake sessions?**
Yes! Run the workflow and select any session again. It will update your score.

**Do I need to complete all 7 sessions?**
For the completion certificate, yes. But you can learn from individual sessions anytime.

**Can multiple people use this?**
Yes! Progress files are per-user. Each team member gets their own progress tracking.

## Next Steps After Completion

Once you've completed TEA Academy, you're ready to:

1. **Apply TEA to your project:**
   - Run [Framework](./setup-test-framework.md) to set up test architecture
   - Run [Test Design](./run-test-design.md) to plan coverage
   - Run [ATDD](./run-atdd.md) or [Automate](./run-automate.md) to generate tests

2. **Use TEA workflows:**
   - All 9 workflows are now familiar to you
   - Choose the right workflow for your task

3. **Explore knowledge fragments:**
   - 34 fragments for just-in-time learning
   - Revisit Session 7 anytime

4. **Share knowledge:**
   - Help team members through TEA Academy
   - Contribute to TEA methodology improvements

## Related

- [TEA Overview](/explanation/tea-overview/) - Understand TEA architecture
- [Getting Started](/tutorials/tea-lite-quickstart/) - Quick 30-minute intro
- [Knowledge Base](/reference/knowledge-base/) - All 34 knowledge fragments
- [Commands](/reference/commands/) - TEA agent command reference
