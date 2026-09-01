---
name: 'step-02-generate-pipeline'
description: 'Generate CI pipeline configuration with adaptive orchestration (agent-team, subagent, or sequential)'
nextStepFile: '{skill-root}/steps-c/step-03-configure-quality-gates.md'
knowledgeIndex: './resources/tea-index.csv'
outputFile: '{test_artifacts}/ci-pipeline-progress.md'
---

# Step 2: Generate CI Pipeline

## STEP GOAL

Create platform-specific CI configuration with test execution, sharding, burn-in, and artifacts.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- ✅ Resolve execution mode from explicit user request first, then config
- ✅ Apply fallback rules deterministically when requested mode is unsupported

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

## 0. Resolve Execution Mode (User Override First)

```javascript
const orchestrationContext = {
  config: {
    execution_mode: config.tea_execution_mode || 'auto', // "auto" | "subagent" | "agent-team" | "sequential"
    capability_probe: config.tea_capability_probe !== false, // true by default
  },
  timestamp: new Date().toISOString().replace(/[:.]/g, '-'),
};

const normalizeUserExecutionMode = (mode) => {
  if (typeof mode !== 'string') return null;
  const normalized = mode.trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');

  if (normalized === 'auto') return 'auto';
  if (normalized === 'sequential') return 'sequential';
  if (normalized === 'subagent' || normalized === 'sub agent' || normalized === 'subagents' || normalized === 'sub agents') {
    return 'subagent';
  }
  if (normalized === 'agent team' || normalized === 'agent teams' || normalized === 'agentteam') {
    return 'agent-team';
  }

  return null;
};

const normalizeConfigExecutionMode = (mode) => {
  if (mode === 'subagent') return 'subagent';
  if (mode === 'auto' || mode === 'sequential' || mode === 'subagent' || mode === 'agent-team') {
    return mode;
  }
  return null;
};

// Explicit user instruction in the active run takes priority over config.
const explicitModeFromUser = normalizeUserExecutionMode(runtime.getExplicitExecutionModeHint?.() || null);

const requestedMode = explicitModeFromUser || normalizeConfigExecutionMode(orchestrationContext.config.execution_mode) || 'auto';
const probeEnabled = orchestrationContext.config.capability_probe;

const supports = { subagent: false, agentTeam: false };
if (probeEnabled) {
  supports.subagent = runtime.canLaunchSubagents?.() === true;
  supports.agentTeam = runtime.canLaunchAgentTeams?.() === true;
}

let resolvedMode = requestedMode;
if (requestedMode === 'auto') {
  if (supports.agentTeam) resolvedMode = 'agent-team';
  else if (supports.subagent) resolvedMode = 'subagent';
  else resolvedMode = 'sequential';
} else if (probeEnabled && requestedMode === 'agent-team' && !supports.agentTeam) {
  resolvedMode = supports.subagent ? 'subagent' : 'sequential';
} else if (probeEnabled && requestedMode === 'subagent' && !supports.subagent) {
  resolvedMode = 'sequential';
}
```

Resolution precedence:

1. Explicit user request in this run (`agent team` => `agent-team`; `subagent` => `subagent`; `sequential`; `auto`)
2. `tea_execution_mode` from config
3. Runtime capability fallback (when probing enabled)

## 1. Resolve Output Path and Select Template

Determine the pipeline output file path based on the detected `ci_platform`:

| CI Platform      | Output Path                                 | Template File                                   |
| ---------------- | ------------------------------------------- | ----------------------------------------------- |
| `github-actions` | `{project-root}/.github/workflows/test.yml` | `./github-actions-template.yaml`                |
| `gitlab-ci`      | `{project-root}/.gitlab-ci.yml`             | `./gitlab-ci-template.yaml`                     |
| `jenkins`        | `{project-root}/Jenkinsfile`                | `./jenkins-pipeline-template.groovy`            |
| `azure-devops`   | `{project-root}/azure-pipelines.yml`        | `./azure-pipelines-template.yaml`               |
| `harness`        | `{project-root}/.harness/pipeline.yaml`     | `./harness-pipeline-template.yaml`              |
| `circle-ci`      | `{project-root}/.circleci/config.yml`       | _(no template; generate from first principles)_ |

Use templates from `./` when available. Adapt the template to the project's `test_stack_type` and `test_framework`.

---

## Security: Script Injection Prevention

> **CRITICAL:** Treat `${{ inputs.* }}` and the entire `${{ github.event.* }}` namespace as unsafe by default. ALWAYS route them through `env:` intermediaries and reference as double-quoted `"$ENV_VAR"` in `run:` blocks. NEVER interpolate them directly.

When the generated pipeline is extended into reusable workflows (`on: workflow_call`), manual dispatch (`on: workflow_dispatch`), or composite actions, these values become user-controllable and can inject arbitrary shell commands.

**Two rules for generated `run:` blocks:**

1. **No direct interpolation** — pass unsafe contexts through `env:`, reference as `"$ENV_VAR"`
2. **Inputs must be DATA, not COMMANDS** — never accept command-shaped inputs (e.g., `inputs.install-command`) that get executed as shell code. Even through `env:`, running `$CMD` where CMD comes from an input is still command injection. Use fixed commands and pass inputs only as arguments.

```yaml
# ✅ SAFE — input is DATA interpolated into a fixed command
- name: Run tests
  env:
    TEST_GREP: ${{ inputs.test-grep }}
  run: |
    # Security: inputs passed through env: to prevent script injection
    npx playwright test --grep "$TEST_GREP"

# ❌ NEVER — direct GitHub expression injection
- name: Run tests
  run: |
    npx playwright test --grep "${{ inputs.test-grep }}"

# ❌ NEVER — executing input-derived env var as a command
- name: Install
  env:
    CMD: ${{ inputs.install-command }}
  run: $CMD
```

Include a `# Security: inputs passed through env: to prevent script injection` comment in generated YAML wherever this pattern is applied.

**Safe contexts** (do NOT need `env:` intermediaries): `${{ steps.*.outputs.* }}`, `${{ matrix.* }}`, `${{ runner.os }}`, `${{ github.sha }}`, `${{ github.ref }}`, `${{ secrets.* }}`, `${{ env.* }}`.

---

## 2. Pipeline Stages

Include stages:

- lint
- test (parallel shards)
- contract-test (if `tea_use_pactjs_utils` enabled)
- burn-in (flaky detection)
- report (aggregate + publish)

---

## 3. Test Execution

- Parallel sharding enabled
- CI retries configured
- Capture artifacts (HTML report, JUnit XML, traces/videos on failure)
- Cache dependencies (language-appropriate: node_modules, .venv, .m2, go module cache, NuGet, bundler)

Write the selected pipeline configuration to the resolved output path from step 1. Adjust test commands based on `test_stack_type` and `test_framework`:

- **Frontend/Fullstack**: Include browser install, E2E/component test commands, Playwright/Cypress artifacts
- **Backend (Node.js)**: Use `npm test` or framework-specific commands (`vitest`, `jest`), skip browser install
- **Backend (Python)**: Use `pytest` with coverage (`pytest --cov`), install via `pip install -r requirements.txt` or `poetry install`
- **Backend (Java/Kotlin)**: Use `mvn test` or `gradle test`, cache `.m2/repository` or `.gradle/caches`
- **Backend (Go)**: Use `go test ./...` with coverage (`-coverprofile`), cache Go modules
- **Backend (C#/.NET)**: Use `dotnet test` with coverage, restore NuGet packages
- **Backend (Ruby)**: Use `bundle exec rspec` with coverage, cache `vendor/bundle`
- **Mobile**: Two-tier pipeline, because the device layer is the expensive one. Load `mobile-ci-device-lab.md` before generating this leg; it carries the artifact, caching, and pinning details the rest of these bullets summarize:
  - **Build artifact**: flows run against a release-shaped build (unsigned APK, simulator IPA) or a development build that the job installs. Never against a prebuilt development shell such as Expo Go: the native modules the flows need are absent, and it adds a dev server, a manifest exchange, and a third-party launch to the CI path that users never take.
  - **Every push**: unit and component tests plus contract tests. No emulator, no app build. This is the gate people wait on.
  - **PR**: build the app once, boot ONE emulator or simulator on the primary target, run `maestro test {maestro_root}/ --include-tags P0` (where `{maestro_root}` is the resolved Maestro root directory: `maestro/` or `.maestro/`). Skip the browser install entirely; there is no browser.
  - **Nightly and release candidate**: full flow suite across the device matrix (primary, oldest supported OS, one small screen).
  - **Runner**: Android emulators need a Linux runner with KVM (`ubuntu-latest` with `runs-on` hardware acceleration enabled); iOS simulators require a macOS runner, which is billed at a premium, so keep the macOS leg off the per-push path.
  - **Install**: replace unpinned installer scripts with a release-pinned or checksum-verified release artifact (e.g., `export MAESTRO_VERSION=1.39.0; curl -fsSL "https://github.com/mobile-dev-inc/maestro/releases/download/cli-${MAESTRO_VERSION}/maestro.zip" -o maestro.zip` or pinned installer with SHA-256 verification) and cache `~/.maestro`. Then **assert the resolved version** in the job. A presence check does not catch drift, and package-manager and `curl | bash` installers both float.
  - **Emulator step**: the `reactivecircus/android-emulator-runner` `script:` input is split on newlines and each line runs as its own `sh -c`, so `set -euo pipefail`, variables, `cd`, and multi-line blocks do not carry between lines. Emit a single line invoking a checked-in script. Cache the AVD snapshot with the split `actions/cache/restore` plus `actions/cache/save` form, pass `ram-size`/`disk-size`/`cores` on the AVD-creation step **only** (the action re-appends them to `config.ini` on every run, which makes the emulator reject the snapshot at boot), and put an image version component in the cache key.
  - **Artifacts**: upload the per-step statuses, hierarchy dumps, screenshots, video, AND device logs on failure, resolving the newest run directory rather than globbing a flat filename that recent versions no longer write. The hierarchy dump captured at failure is what identifies a selector break; the failure screenshot is taken after teardown and frequently shows the launcher, so do not lead with it.
  - **Cache**: Gradle or CocoaPods plus the JS toolchain for React Native and Expo.

### Contract Testing Pipeline (if `tea_use_pactjs_utils` enabled)

**If `tea_use_pactjs_utils` is enabled**, use `{knowledgeIndex}` to load:

- `pact-consumer-framework-setup.md` — determinism gate, `jq -S` publish normalization, PR-only provider branch detection, additive branch-aware `can-i-deploy`, 1:1 local/CI parity
- `pactjs-utils-consumer-helpers.md` — one-interaction-per-`it()` determinism rule
- `pactjs-utils-provider-verifier.md` — `buildVerifierOptions`, scoped consumer branch selectors, provider revision metadata, `isBreakingChangeTolerantBranch`, breaking change patterns, and FFI-safe Vitest config
- `pactjs-utils-request-filter.md` — `createRequestFilter` auth injection patterns for CI pipeline auth setup
- `pact-broker-webhooks.md` — PactFlow → GitHub webhook auth, exact registered provider target checkout, rotation runbook, and staleness monitoring

When `tea_use_pactjs_utils` is enabled, add a `contract-test` stage after `test`:

**Required env block** (add to the generated pipeline):

```yaml
env:
  PACT_BROKER_BASE_URL: ${{ secrets.PACT_BROKER_BASE_URL }}
  PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
  GITHUB_SHA: ${{ github.sha }} # auto-set by GitHub Actions
  GITHUB_BRANCH: ${{ github.head_ref || github.ref_name }} # NOT auto-set — must be defined explicitly
```

> **Note:** `GITHUB_SHA` is auto-set by GitHub Actions, but `GITHUB_BRANCH` is **not** — it must be derived from `github.head_ref` (for PRs) or `github.ref_name` (for pushes). The pactjs-utils library reads both from `process.env`.

1. **Consumer test (determinism gate) + publish**: Run consumer contract tests as a determinism gate, then publish pacts to broker — each step calls the same `npm run` script a developer runs locally (1:1 parity)
   - `npm run test:pact:consumer` — **this is the determinism gate**: runs `scripts/check-pact-determinism.sh` which invokes the inner `test:pact:consumer:run` N times (default 3) and fails if generated pact JSON is not byte-stable across runs. Never fold this into the publish step — keep it as its own visible CI step so failures are attributable to generation vs publish.
   - `npm run publish:pact` — publishes to the broker; internally normalizes interactions via `jq -S '.interactions |= sort_by(...)'` as defense-in-depth against any ordering drift that slips past the gate.
   - Ensure `jq` is available on the runner. It is preinstalled on GitHub `ubuntu-latest`; for other runner images or self-hosted runners, add an explicit install step (e.g., `apt-get install -y jq` or `brew install jq`) before any contract-test or publish command.
   - Only publish on PR and main branch pushes.

2. **Provider verification**: Run provider verification against published pacts
   - `npm run test:pact:provider:remote:contract`
   - `buildVerifierOptions` auto-reads `PACT_BROKER_BASE_URL`, `PACT_BROKER_TOKEN`, `PACT_CONSUMER_BRANCH`, `PACT_PROVIDER_VERSION`, `PACT_PROVIDER_BRANCH`, `GITHUB_SHA`, and `GITHUB_BRANCH`
   - An explicit consumer branch requires a scoped `consumer`; emit both or neither
   - Provider Vitest config (`vitest.config.contract.ts`) **must** use `pool: 'forks'` + `poolOptions.forks.singleFork: true` (see `pactjs-utils-provider-verifier.md` Example 8) — required for message providers and any multi-file provider contract suite to keep Pact Rust FFI state coherent. The SAME config is required on the consumer side (`vitest.config.pact.ts`) alongside `fileParallelism: false` — see `pact-consumer-framework-setup.md` Example 2.
   - Verification results published to broker when `CI=true`

3. **Can-I-Deploy gate**: Block deployment if contracts are incompatible
   - `npm run can:i:deploy:provider`
   - Ensure the script adds `--retry-while-unknown=10 --retry-interval=30` for async verification
   - On consumer PRs with a named provider branch, preserve the environment check: `--ignore` only that provider, then run a second check with `--pacticipant <provider> --branch <name>`. Both calls fail hard. Never replace `--to-environment` globally.

4. **Webhook job**: Add `repository_dispatch` trigger for `contract_requiring_verification_published` event
   - Provider verification runs when consumers publish new pacts
   - Check out the exact provider version and branch registered in PactFlow; fail when that target is unavailable or the commit is outside the registered branch
   - Ensures compatibility is checked on both consumer and provider changes
   - Webhook authentication uses a dedicated GitHub machine user + classic PAT (`repo` scope, no expiration) stored as a PactFlow secret. See `pact-broker-webhooks.md` for the full pattern, rotation runbook, and staleness monitoring. A silently-expired PAT is the most common non-code cause of `can-i-deploy` timeouts with `There is no verified pact between ...`.

5. **Breaking change handling**: When `PACT_BREAKING_CHANGE=true` env var is set:
   - Provider test passes `includeMainAndDeployed: false` to `buildVerifierOptions` — omits main and deployed selectors while retaining matching branch and any scoped `consumerBranch`
   - Coordinate with consumer team before removing the flag

6. **Record deployment**: After successful deployment, record version in broker
   - `npm run record:provider:deployment --env=production`

7. **Staleness monitoring (recommended)**: Scheduled CI job (e.g., daily) that asserts recent verification results exist for each critical consumer/provider pair — surfaces silent webhook failures before they block a release. See `pact-broker-webhooks.md` Example 4.

Required CI secrets: `PACT_BROKER_BASE_URL`, `PACT_BROKER_TOKEN`

**If `tea_pact_mcp` is `"mcp"`:** Reference the SmartBear MCP `Can I Deploy` and `Matrix` tools for pipeline guidance in `pact-mcp.md`.

**`tea_pact_mcp` defaults to `"mcp"`, and Pact artifacts are gated on relevance, not on this flag.** Follow `pact-mcp.md` § _When the Tools Are Not Reachable_: the probe is a tool-list check and never a broker call, its result is recorded once per run as `pact_mcp_reachable`, and the fallback order is provider source, then an OpenAPI spec, then `confidence-gate.md`. Report the outcome once and continue; never block, never retry, never present inferred provider states as broker data.

---

### 4. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-02-generate-pipeline']
  lastStep: 'step-02-generate-pipeline'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-02-generate-pipeline'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-02-generate-pipeline'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

### 5. Orchestration Notes for This Step

For this step, treat these work units as parallelizable when `resolvedMode` is `agent-team` or `subagent`:

- Worker A: resolve platform path/template and produce base pipeline skeleton (section 1)
- Worker B: construct stage definitions and test execution blocks (sections 2-3)
- Worker C: contract-testing block (only when `tea_use_pactjs_utils` is true)

If `resolvedMode` is `sequential`, execute sections 1→4 in order.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
