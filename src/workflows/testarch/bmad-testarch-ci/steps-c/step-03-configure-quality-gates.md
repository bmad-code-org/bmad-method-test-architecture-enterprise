---
name: 'step-03-configure-quality-gates'
description: 'Configure burn-in, quality gates, and notifications'
nextStepFile: '{skill-root}/steps-c/step-04-validate-and-summary.md'
knowledgeIndex: './resources/tea-index.csv'
outputFile: '{test_artifacts}/ci-pipeline-progress.md'
---

# Step 3: Quality Gates & Notifications

## STEP GOAL

Configure burn-in loops, quality thresholds, and notification hooks.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config, loaded artifacts, and knowledge fragments
- Focus: this step's goal only
- Limits: do not execute future steps
- Dependencies: prior steps' outputs (if any)

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Burn-In Configuration

Use `{knowledgeIndex}` to load `ci-burn-in.md` guidance:

- Run N-iteration burn-in for flaky detection
- Gate promotion based on burn-in stability

**If `tea_use_playwright_utils` is true and the stack is Playwright**, also load `burn-in.md` and `playwright-utils-mandate.md`, and drive selection with the utility instead of `--only-changed`:

```typescript
// playwright/scripts/burn-in-changed.ts
import { runBurnIn } from '@seontechnologies/playwright-utils/burn-in';

await runBurnIn({
  configPath: 'playwright/config/.burn-in.config.ts',
  baseBranch: 'main',
});
```

The pipeline step then calls that script rather than composing a `--grep` by hand. `--only-changed` treats a config or type-definition edit as a reason to run the whole suite; the utility's skip patterns and percentage control are the reason the flag exists. This is a RECOMMENDED-level utility per the mandate: it needs a config file and a script, so scaffold both. If the user declines, keep the plain `npx playwright test` loop and say in the summary that burn-in selection stayed unfiltered.

Skip this for Cypress, Maestro, and non-Playwright backend suites; those keep the `ci-burn-in.md` shape.

**Stack-conditional burn-in:**

- **Frontend or Fullstack** (`test_stack_type` is `frontend` or `fullstack`): Enable burn-in by default. Burn-in targets UI flakiness (race conditions, selector instability, timing issues).
- **Backend only** (`test_stack_type` is `backend`): Skip burn-in by default. Backend tests (unit, integration, API) are deterministic and rarely exhibit UI-related flakiness. If the user explicitly requests burn-in for backend, honor that override.
- **Mobile** (`test_stack_type` is `mobile`): Enable burn-in by default, and scope it to new and changed Maestro flows only. Device flows are the most flake-prone level in any suite (emulator boot, app install, animation timing, real network), so a new flow that has not survived repeated runs is not evidence. Never burn in the whole flow suite on a PR: run the changed flows N times on the primary target, and leave the full matrix to the nightly job.

**The gate must be able to fail.** Per `evidence-integrity.md`, `continue-on-error` belongs on artifact collection and never on a step that runs tests, and a runner manifest that names a subset of the discovered test files is a silent coverage hole rather than a configuration choice. Reconcile the executed count against the discovered count in the job, so a suite that quietly stopped running most of itself fails instead of passing faster.

**Security: Script injection prevention for reusable burn-in workflows:**

When burn-in is extracted into a reusable workflow (`on: workflow_call`), all `${{ inputs.* }}` values MUST be passed through `env:` intermediaries and referenced as quoted `"$ENV_VAR"`. Never interpolate them directly.

**Inputs must be DATA, not COMMANDS.** Do not accept command-shaped inputs (e.g., `inputs.install-command`, `inputs.test-command`) that get executed as shell code — even through `env:`, running `$CMD` is still command injection. Use fixed commands (e.g., `npm ci`, `npx playwright test`) and pass inputs only as data arguments.

```yaml
# ✅ SAFE — fixed commands with data-only inputs
- name: Install dependencies
  run: npm ci
- name: Run burn-in loop
  env:
    TEST_GREP: ${{ inputs.test-grep }}
    BURN_IN_COUNT: ${{ inputs.burn-in-count }}
    BASE_REF: ${{ inputs.base-ref }}
  run: |
    # Security: inputs passed through env: to prevent script injection
    for i in $(seq 1 "$BURN_IN_COUNT"); do
      echo "Burn-in iteration $i/$BURN_IN_COUNT"
      npx playwright test --grep "$TEST_GREP" || exit 1
    done
```

---

## 2. Quality Gates

Define:

- Minimum pass rates (P0 = 100%, P1 ≥ 95%)
- Fail CI on critical test failures
- Optional: require traceability or nfr-assess output before release

**Contract testing gate** (if `tea_use_pactjs_utils` is enabled):

Use `{knowledgeIndex}` to load:

- `pact-consumer-framework-setup.md` — determinism gate (`check-pact-determinism.sh`), `jq -S` publish normalization, 1:1 local/CI parity
- `pactjs-utils-consumer-helpers.md` — one-interaction-per-`it()` determinism rule
- `pactjs-utils-provider-verifier.md` — `buildVerifierOptions`, broker config, breaking change patterns, vitest `pool: 'forks'` + `singleFork` (same rule applies to consumer AND provider)
- `pactjs-utils-request-filter.md` — `createRequestFilter` auth injection patterns for CI pipeline auth setup
- `pact-broker-webhooks.md` — webhook auth pattern, PAT rotation runbook, staleness monitoring (webhook failures silently break `can-i-deploy`)

- **Determinism gate must pass** (consumer side): `npm run test:pact:consumer` runs the suite N times and fails on byte-different pact JSON before any publish is attempted. This is a non-negotiable pre-publish gate.
- **can-i-deploy must pass** before any deployment to staging or production
- Block the deployment pipeline if contract verification fails
- Treat consumer pact publishing failures as CI failures (contracts must stay up-to-date)
- Provider verification must pass for all consumer pacts before merge
- **Staleness alert**: scheduled job asserts recent verifications exist — a missing signal indicates a silently-broken webhook (usually an expired GitHub PAT on the PactFlow secret; see `pact-broker-webhooks.md` rotation runbook).

---

## 3. Notifications

Configure:

- Failure notifications (Slack/email)
- Artifact links

---

### 4. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-03-configure-quality-gates']
  lastStep: 'step-03-configure-quality-gates'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-03-configure-quality-gates'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-03-configure-quality-gates'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
