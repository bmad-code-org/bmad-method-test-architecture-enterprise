---
stepsCompleted: ['step-01-preflight', 'step-02-generate-pipeline', 'step-03-configure-quality-gates', 'step-04-validate-and-summary']
lastStep: 'step-04-validate-and-summary'
lastSaved: '2026-08-12'
---

# CI/CD Pipeline Progress

## Step 1: Preflight Checks

### Git Repository

`.git/` present; remote `origin` configured and resolves to `github.com`.

### Stack Detection

`test_stack_type`: `fullstack`. Frontend indicators found at `apps/web/playwright.config.ts` and `apps/web/src/pages/`; backend indicators found at `apps/api/src/routes/` and `apps/api/package.json`.

### Test Framework

- Frontend/E2E: Playwright (`apps/web/playwright.config.ts` present, `@playwright/test` installed).
- Backend: Vitest (`apps/api/vitest.config.ts` present, `test` script wired in `package.json`).

### Local Test Run

`npm run test:e2e` (Playwright) and `npm test` (Vitest) both pass locally before CI setup proceeded.

### CI Platform Detection

No existing CI configuration found under `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, or similar. Git remote resolves to `github.com`; `ci_platform` set to `github-actions`.

### Environment Context

`.nvmrc` pins Node `20.11.0`. Package manager: npm (`package-lock.json` present); dependency cache keys on the lockfile hash.

### TEA Config Flags

- `tea_use_playwright_utils`: `true`, and `@seontechnologies/playwright-utils` is a listed dependency. Burn-in in Step 3 uses `runBurnIn` instead of `--only-changed`.
- `tea_use_pactjs_utils`: `false`. No `pact/` or `tests/contract/` directory and no Pact packages in `package.json`; the contract-testing stage is omitted from the generated pipeline.

## Step 2: Generate CI Pipeline

### Output Path and Template

Config written to `.github/workflows/test.yml`, adapted from `github-actions-template.yaml` for a Node.js fullstack stack.

Execution mode resolved to `sequential`: the run requested `auto`, and no agent-team or subagent runtime was available.

### Pipeline Stages

| Stage         | Purpose                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| `lint`        | ESLint across `apps/web` and `apps/api`.                                                                   |
| `test`        | Vitest for the backend (single job, coverage on) and Playwright E2E for the frontend (4-way shard matrix). |
| `test-review` | Headless `tea-test-review --fail-on request-changes` gate on pull requests that touch test files.          |
| `burn-in`     | Flaky-detection loop for the Playwright suite.                                                             |
| `report`      | Aggregates shard and burn-in results into the job summary.                                                 |

No `contract-test` stage: `tea_use_pactjs_utils` is `false`.

### Test Execution Configuration

- Parallel sharding: 4 shards for the Playwright matrix, `fail-fast: false`.
- CI retries: 2 attempts per shard on transient failures.
- Artifacts: Playwright HTML report, JUnit XML, and traces/videos on failure, uploaded on `failure()` only, 30-day retention.
- Caching: npm dependencies keyed on the `package-lock.json` hash; Playwright browser binaries cached separately under the same key scheme.
- Only the Playwright job runs `npx playwright install --with-deps chromium`; the Vitest job installs no browser.
- Each test job reconciles its executed test count against discovery and fails when a runner manifest silently omits tests.
- Test and burn-in commands can fail the job. `continue-on-error` is used only by artifact-upload steps.

### Helper Scripts and Documentation

- `scripts/test-changed.sh`: runs the affected Vitest and Playwright projects from the merge base.
- `scripts/ci-local.sh`: mirrors the fixed install, lint, Vitest, and Playwright commands used by the pipeline.
- `scripts/burn-in.sh`: invokes `playwright/scripts/burn-in-changed.ts` for 10 iterations and exits on the first failure.
- `docs/ci.md`: documents triggers, stages, cache behavior, local reproduction, artifacts, and common failures.
- `docs/ci-secrets-checklist.md`: documents `ANTHROPIC_API_KEY` setup, rotation, and least-privilege handling for the review gate, plus `SLACK_WEBHOOK_URL` for notifications.

## Step 3: Quality Gates & Notifications

### Burn-In Configuration

`tea_use_playwright_utils` is `true`, so burn-in calls `runBurnIn` from `@seontechnologies/playwright-utils/burn-in` via `playwright/scripts/burn-in-changed.ts`, configured with `playwright/config/.burn-in.config.ts` and `baseBranch: 'main'`. Runs on pull requests and on a weekly Sunday 02:00 UTC cron. Gate promotion is tied to burn-in stability: a burn-in failure blocks merge through the required status check, and failure artifacts (HTML report, traces) are uploaded.

### Quality Gates

- Minimum pass rates: P0 100%, P1 ≥ 95%.
- `test-review` installs pinned versions of `bmad-method-test-architecture-enterprise` and the Claude CLI, then runs `tea-test-review --agent claude --base origin/main --fail-on request-changes --output test-review.md --json test-review.json` on pull requests that touch files under `apps/web/tests/` or `apps/api/test/`. The skill resolves from the installed TEA package. `ANTHROPIC_API_KEY` is passed from GitHub Actions secrets to the review step only. A `Request Changes` or `Block` verdict fails the required check.
- No contract-testing gate configured (`tea_use_pactjs_utils` is `false`).

### Notifications

Failure notifications post to Slack (`#eng-ci-alerts`) via `slackapi/slack-github-action` on `test`, `burn-in`, or `test-review` job failure. The notification payload links the failing run and the uploaded artifact.

## Step 4: Validate & Summarize

### Validation Checklist

- Config file created: `.github/workflows/test.yml`, confirmed.
- Stages and sharding configured: `lint`, `test` (4-shard Playwright matrix), `test-review`, `burn-in`, `report`, confirmed.
- Burn-in and artifacts enabled: confirmed (see Step 2 and Step 3).
- Helper scripts executable and syntax-checked: `scripts/test-changed.sh`, `scripts/ci-local.sh`, and `scripts/burn-in.sh`, confirmed.
- Pipeline and documentation validation: workflow parsed by `actionlint`; `docs/ci.md` and `docs/ci-secrets-checklist.md` created, confirmed.
- Secrets/variables documented: `ANTHROPIC_API_KEY` and `SLACK_WEBHOOK_URL`, confirmed below.
- Remote-only checks such as cache hits, dashboard job visibility, and measured duration remain pending until the first pushed run. They are recorded as post-workflow actions rather than reported as passes.

### Completion Summary

- **CI platform:** GitHub Actions. **Config path:** `.github/workflows/test.yml`.
- **Key stages enabled:** `lint`, `test` (parallel Playwright sharding plus Vitest), `test-review` (`tea-test-review --fail-on request-changes`), `burn-in`, `report`.
- **Artifacts:** Playwright HTML report, JUnit XML, traces/videos on failure, 30-day retention.
- **Notifications:** Slack alert on `test`/`burn-in`/`test-review` failure via `SLACK_WEBHOOK_URL`.
- **Required secrets:** `ANTHROPIC_API_KEY` for the Claude-backed test-review gate and `SLACK_WEBHOOK_URL` for Slack notifications. `GITHUB_TOKEN` is provided automatically by GitHub Actions.

**Next steps:**

- Add `ANTHROPIC_API_KEY` and `SLACK_WEBHOOK_URL` under repository Settings → Secrets and variables → Actions.
- Commit `.github/workflows/test.yml` and push to trigger the first run.
- Open a pull request to exercise the `test-review` gate end to end.
- Verify cache hits, shard distribution, artifact paths, and runtime targets in the first pushed run.
- Watch the first burn-in run on the next Sunday cron, or trigger it manually, before relying on its stability signal.
