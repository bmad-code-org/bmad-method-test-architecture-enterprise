---
title: 'Learn Testing with TEA Academy'
description: Walk through your first TEA Academy session, from invocation to session notes
sidebar:
  order: 1
---

# Learn Testing with TEA Academy

TEA Academy has seven testing sessions with quizzes and saved progress.
This tutorial covers Session 1.
Allow 45 minutes for setup and the session.

For QA engineers, developers, leads, and managers learning testing.

## Prerequisites

- TEA installed and set up: `npx skills add bmad-code-org/bmad-method-test-architecture-enterprise`, then `bmad setup tea` in your assistant chat

<a id="step-1-start-the-workflow"></a>

## Step 1: Start the Skill

- **Claude Code / Cursor / Windsurf:** `/bmad-teach-me-testing`
- **Codex:** `$bmad-teach-me-testing`
- **Inside a `/bmad-tea` chat:** `TMT`

Full invocation rules: [Invoking a TEA Skill](/docs/reference/commands.md#invoking-a-tea-skill).

## Step 2: Answer the Assessment

On a first run, answer four assessment questions:

1. **Your role:** QA, Dev, Lead, or VP.
   This picks the examples used throughout.
2. **Experience level:** beginner, intermediate, or experienced.
   This picks your recommended path.
3. **Learning goals:** what you want out of the course.
4. **Pain points** (optional): what is going wrong on your current project.

Answer as your real role.
A "Lead" answer produces architecture and code-review examples; a "Dev" answer produces TDD and API-testing examples for the same concepts.

The session menu appears next, showing all 7 sessions with completion state and a recommended next session.

## Step 3: Complete Session 1

Pick **Session 1: Quick Start** (30 minutes):

1. **Teaching.** What TEA is, the TEA Lite 30-minute path, the skill menu, and the 5 engagement models, with examples matched to the role you gave.
2. **Quiz.** Three questions. 70% or higher passes.
   If you score lower, choose `[R]` to review the content again or `[C]` to continue with the score recorded.
3. **Session notes.** The skill writes `session-01-notes.md` with the key takeaways.
4. **Back to the menu.** Pick the next session or exit.
   You can jump to any session; they are independent.

## Step 4: Confirm Your Progress Saved

Progress is saved after the assessment, each quiz, session notes, and exit.
Look under your configured `test_artifacts` folder (default `_bmad-output/test-artifacts`):

```text
_bmad-output/test-artifacts/
├── teaching-progress/
│   └── alex-tea-progress.yaml
└── tea-academy/
    └── alex/
        └── session-01-notes.md
```

Run the skill again to see your saved progress and resume.

## Next Steps

The remaining sessions cover testing concepts, architecture, test design, ATDD, automation, review, traceability, and the knowledge base.

- [How to Learn Testing with TEA Academy](/docs/how-to/workflows/teach-me-testing.md) for the full session list, learning paths by experience, role customization, and troubleshooting
- [Getting Started with Test Architect](/docs/tutorials/tea-lite-quickstart.md) to generate and run real tests in 30 minutes
- [Knowledge Base](/docs/reference/knowledge-base.md) for the 59 fragments
