---
title: 'Learn Testing with TEA Academy'
description: Walk through your first TEA Academy session, from invocation to session notes
---

# Learn Testing with TEA Academy

TEA Academy teaches testing through 7 progressive sessions with quizzes and saved progress. This tutorial walks you through starting it and completing Session 1. Budget 45 minutes.

**Who it is for:** QA engineers, developers, leads, and managers learning testing.

## Prerequisites

- BMad installed with the TEA module (`npx bmad-method install`)

## Step 1: Start the Workflow

- **Claude Code / Cursor / Windsurf:** `/bmad-teach-me-testing`
- **Codex:** `$bmad-teach-me-testing`
- **Inside a `/bmad-tea` chat:** `TMT`

Full invocation rules: [Invoking a TEA Workflow](/docs/reference/commands.md#invoking-a-tea-workflow).

## Step 2: Answer the Assessment

On a first run, the workflow asks four questions before showing you anything:

1. **Your role:** QA, Dev, Lead, or VP. This picks the examples used throughout.
2. **Experience level:** beginner, intermediate, or experienced. This picks your recommended path.
3. **Learning goals:** what you want out of the course.
4. **Pain points** (optional): what is going wrong on your current project.

Answer as your real role. A "Lead" answer produces architecture and code-review examples; a "Dev" answer produces TDD and API-testing examples for the same concepts.

The session menu appears next, showing all 7 sessions with completion state and a recommended next session.

## Step 3: Complete Session 1

Pick **Session 1: Quick Start** (30 minutes). It runs in four beats:

1. **Teaching.** What TEA is, the TEA Lite 30-minute path, the 9 workflows, and the 5 engagement models, with examples matched to the role you gave.
2. **Quiz.** Three questions. 70% or higher passes. If you score lower, choose `[R]` to review the content again or `[C]` to continue with the score recorded.
3. **Session notes.** The workflow writes `session-01-notes.md` with the key takeaways.
4. **Back to the menu.** Pick the next session or exit. You can jump to any session; they are independent.

## Step 4: Confirm Your Progress Saved

Progress is written after the assessment, after each quiz, after each set of session notes, and on exit. Look under your configured `test_artifacts` folder (default `docs/test-artifacts`):

```text
docs/test-artifacts/
├── teaching-progress/
│   └── alex-tea-progress.yaml
└── tea-academy/
    └── alex/
        └── session-01-notes.md
```

Run the workflow again at any time. It detects the progress file, shows your dashboard, and offers to resume.

## Next Steps

You have completed one session of seven. The rest cover core concepts, architecture patterns, test design, ATDD and automate, quality and trace, and a menu-driven tour of the 54 knowledge fragments.

- [How to Learn Testing with TEA Academy](/docs/how-to/workflows/teach-me-testing.md) for the full session list, learning paths by experience, role customization, and troubleshooting
- [Getting Started with Test Architect](/docs/tutorials/tea-lite-quickstart.md) to generate and run real tests in 30 minutes
- [Knowledge Base](/docs/reference/knowledge-base.md) for the 54 fragments
