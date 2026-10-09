---
title: 'Getting Started with Test Architect'
description: Generate and run Playwright tests for an existing demo app with TEA
---

**Test Architect (TEA) Lite** uses `automate` to test features that already exist.
This tutorial adds framework setup and a short test plan so you can start with an empty project.
Allow about 30 minutes after installing the prerequisites.

## What You'll Build

- A Playwright test framework
- A risk-based test plan
- Tests for TodoMVC's create, complete, and filter actions

## Prerequisites

- Node.js 22.20 or later
- [uv](https://docs.astral.sh/uv/) for BMad setup
- An AI coding assistant that supports skills
- A project folder open in that assistant

The demo is [TodoMVC React](https://todomvc.com/examples/react/dist/).
It runs in the browser and keeps todos in React state.

:::tip[Quick Path]
Set up TEA → scaffold with `framework` → plan with `test-design` → generate with `automate` → run `npx playwright test`.
Use `/bmad-testarch-<skill>` in Claude Code, Cursor, or Windsurf, and `$bmad-testarch-<skill>` in Codex.
:::

## TEA Approaches Explained

TEA Lite covers existing features.
TEA Solo lets you choose individual skills with your own requirements.
TEA Integrated follows the BMad development phases.
See [Engagement Models](/docs/explanation/engagement-models.md) for all five models.

## Step 0: Setup (2 minutes)

Open [TodoMVC](https://todomvc.com/examples/react/dist/):

1. Add two todos by typing and pressing Enter.
2. Complete one using its checkbox.
3. Switch between the All, Active, and Completed filters.

## Step 1: Install BMad and Scaffold Framework (10 minutes)

### Install BMad Method and TEA

In your project folder:

```bash
npx skills add bmad-code-org/BMAD-METHOD
npx skills add bmad-code-org/bmad-method-test-architecture-enterprise
```

The first command adds BMad core, including the `bmad` setup skill.
The second adds TEA.
In your assistant chat, run:

```text
bmad setup tea
```

Keep the defaults except `tea_use_playwright_utils: false` and `tea_browser_automation: none` for this plain Playwright example.
Setup creates `_bmad/config.toml` with your answers.

### Load TEA Agent

Load the agent to use its skill menu:

- Claude Code / Cursor / Windsurf: `/bmad-tea`
- Codex: `$bmad-tea`

You can also invoke each skill directly.

### Scaffold Test Framework

- Claude Code / Cursor / Windsurf: `/bmad-testarch-framework`
- Codex: `$bmad-testarch-framework`
- Inside a TEA chat: `TF`

This tutorial sets up the test framework only. You can add CI later.

Tell TEA:

```text
We're testing the React TodoMVC app at https://todomvc.com/examples/react/dist/.
Use Playwright with TypeScript for browser E2E tests.
Set up the test framework only. We'll add CI later.
```

Review the generated `tests/` structure, `playwright.config.ts`, environment example, and Node version file.
Install the dependencies and browsers:

```bash
npm install
npx playwright install
```

## Step 2: Your First Test Design (5 minutes)

### Run Test Design

- Claude Code / Cursor / Windsurf: `/bmad-testarch-test-design`
- Codex: `$bmad-testarch-test-design`
- Inside a TEA chat: `TD`

Ask for an epic-level plan for epic 1:

```text
Plan browser tests for TodoMVC's create, complete, delete, and filter actions.
Focus on creating todos and the All, Active, and Completed filters.
```

Review `test-design/test-design-epic-1.md` under your configured `test_artifacts` folder.
It should identify risks, assign P0-P3 priorities, and name the scenarios to test.
Use those priorities to choose what to generate first.

## Step 3: Generate Tests for Existing Features (5 minutes)

### Run Automate

- Claude Code / Cursor / Windsurf: `/bmad-testarch-automate`
- Codex: `$bmad-testarch-automate`
- Inside a TEA chat: `TA`

Give TEA the app URL and the plan's path:

```text
Generate Playwright tests for https://todomvc.com/examples/react/dist/.
Use the epic 1 test plan under my test artifacts folder.
Cover its P0 and P1 scenarios.
```

A `tests/e2e/todomvc.spec.ts` suite can look like this:

```typescript
import { test, expect } from '@playwright/test';

test.describe('TodoMVC: core functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://todomvc.com/examples/react/dist/');
  });

  test('creates a new todo', async ({ page }) => {
    const todoInput = page.getByTestId('text-input');
    await todoInput.fill('Buy groceries');
    await todoInput.press('Enter');

    await expect(page.getByTestId('todo-item')).toHaveText('Buy groceries');
  });

  test('marks a todo as complete', async ({ page }) => {
    const todoInput = page.getByTestId('text-input');
    await todoInput.fill('Complete tutorial');
    await todoInput.press('Enter');

    const toggle = page.getByTestId('todo-item-toggle');
    await toggle.check();

    await expect(toggle).toBeChecked();
  });

  test('filters todos by status', async ({ page }) => {
    const todoInput = page.getByTestId('text-input');
    await todoInput.fill('Buy groceries');
    await todoInput.press('Enter');
    await todoInput.fill('Write tests');
    await todoInput.press('Enter');

    await page.getByTestId('todo-item-toggle').first().check();

    await page.getByRole('link', { name: 'Active' }).click();
    await expect(page.getByTestId('todo-item')).toHaveText(['Write tests']);

    await page.getByRole('link', { name: 'Completed' }).click();
    await expect(page.getByTestId('todo-item')).toHaveText(['Buy groceries']);
  });
});
```

TEA also writes test-running instructions and an automation summary with its Definition of Done checklist.

### With Playwright Utils (Optional Enhancement)

To use Playwright Utils on your own project, follow [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md).
With the flag enabled and the package installed, TEA uses its helpers for the capabilities they cover.
TodoMVC keeps its data in browser state, so this example creates todos through the UI.

## Step 4: Run and Validate (5 minutes)

### Run the Tests

```bash
npx playwright test
```

For a Chromium-only configuration, the example suite should report three passing tests.
A configuration with several browser projects runs the suite once per project.
Read any failure before continuing; the public demo can change.

### View Test Report

```bash
npx playwright show-report
```

The HTML reporter must be enabled in your Playwright configuration.
Use the report's screenshots and traces to investigate failures when those artifacts are configured.

### What Just Happened?

You used `framework`, `test-design`, and `automate` to build and run tests for an existing app.

## What You Learned

### Quick Reference

| Action             | Claude Code / Cursor / Windsurf | Codex                        | TEA menu |
| ------------------ | ------------------------------- | ---------------------------- | -------- |
| Load agent         | `/bmad-tea`                     | `$bmad-tea`                  | n/a      |
| Scaffold framework | `/bmad-testarch-framework`      | `$bmad-testarch-framework`   | `TF`     |
| Test design        | `/bmad-testarch-test-design`    | `$bmad-testarch-test-design` | `TD`     |
| Generate tests     | `/bmad-testarch-automate`       | `$bmad-testarch-automate`    | `TA`     |

### TEA Principles

Use risk to prioritize scenarios, review the plan before generation, and assert the result of each user action.

## Understanding ATDD vs Automate

Use `automate` when the feature already exists.
Use Automate red mode to create acceptance test scaffolds before implementation, then complete the red → green → refactor cycle.
See [Automate Red Mode](/docs/how-to/workflows/run-automate.md#red-mode).

## Next Steps

### Level Up Your TEA Skills

- [Framework CI Setup](/docs/how-to/workflows/setup-test-framework.md#ci-setup) to run tests on pull requests
- [Review Test Quality](/docs/how-to/workflows/run-test-review.md) to audit the generated suite
- [TEA Configuration](/docs/reference/configuration.md) for setup options
- [TEA Command Reference](/docs/reference/commands.md) for all eight skills

### Try TEA Solo

Bring your own requirements and run the skills you need on any project.
See [TEA Solo](/docs/explanation/engagement-models.md#model-2-tea-solo).

### Go Full TEA Integrated

Follow [TEA Integrated](/docs/explanation/engagement-models.md#model-4-tea-integrated-greenfield) for testing alongside BMad planning, architecture, and implementation.

## Common Questions

### Why can't my tests find elements?

Check the failing locator against the page's current markup.
The example uses `text-input`, `todo-item`, and `todo-item-toggle` test IDs, and accessible link names for filters.
Scope a locator to one todo row when several elements match.
See [Troubleshooting](/docs/reference/troubleshooting.md).

### How do I fix network timeouts?

Check that the demo loads in your browser and read the error to identify which timeout fired.
If navigation needs more time, set `navigationTimeout` under `use` and allow a longer test timeout:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 60_000,
  use: {
    navigationTimeout: 45_000,
  },
});
```

Playwright documents each setting in [Timeouts](https://playwright.dev/docs/test-timeouts).

## Getting Help

- [TEA documentation](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/)
- [GitHub Issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues)
