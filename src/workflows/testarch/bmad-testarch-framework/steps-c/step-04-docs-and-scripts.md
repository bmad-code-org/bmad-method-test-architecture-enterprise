---
name: 'step-04-docs-and-scripts'
description: 'Document setup and add package.json scripts'
nextStepFile: '{skill-root}/steps-c/step-05-validate-and-summary.md'
outputFile: '{test_dir}/README.md'
progressFile: '{test_artifacts}/framework-setup-progress.md'
---

# Step 4: Documentation & Scripts

## STEP GOAL

Create test documentation and add build/test scripts appropriate for `{detected_stack}`.

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

## 1. tests/README.md

Create `{outputFile}` and include:

- Setup instructions
- Running tests (local/headed/debug)
- Architecture overview (fixtures, factories, helpers)
- Best practices (selectors, isolation, cleanup)
- CI integration notes
- Knowledge base references

---

## 2. Build & Test Scripts

**If {detected_stack} is `frontend` or `fullstack`:**

Add to `package.json` at minimum:

- `test:e2e`: framework execution command (e.g., `npx playwright test`)

**If {detected_stack} is `backend` or `fullstack`:**

Add the idiomatic test commands for the detected framework:

- **Python (pytest)**: Add to `pyproject.toml` scripts or `Makefile`: `pytest`, `pytest --cov`, `pytest -m integration`
- **Java (JUnit)**: Add to `build.gradle`/`pom.xml`: `./gradlew test`, `mvn test`, `mvn verify` (integration)
- **Go**: Add to `Makefile`: `go test ./...`, `go test -race ./...`, `go test -cover ./...`
- **C#/.NET**: Add to CI scripts or `Makefile`: `dotnet test`, `dotnet test --collect:"XPlat Code Coverage"`
- **Ruby (RSpec)**: Add to `Gemfile` binstubs or `Makefile`: `bundle exec rspec`, `bundle exec rspec spec/integration`

**If {detected_stack} is `mobile`:**

Add to `package.json` (React Native/Expo) or the `Makefile` (native):

- `test:flows`: `maestro test {maestro_root}/` (or explicitly passing `.maestro/config.yaml`) — the full device suite
- `test:flows:p0`: `maestro test {maestro_root}/ --include-tags P0` — the PR-gate subset
- `test:unit`: the app's own unit runner (`jest`, `vitest`, `xcodebuild test`, `./gradlew test`, `flutter test`)
- `maestro:studio`: `maestro studio` — interactive flow authoring and element inspection

Document that `maestro test` needs a booted simulator or emulator and an installed build, so the device suite is not part of the default `npm test`.

---

## 3. Write-Time Enforcement Hook

The knowledge fragments are advisory and `test-review` is post-hoc. Between the two sits the write itself, and nothing occupied it: a `.only`, a `waitForTimeout`, or a `Thread.sleep` could be written, committed, and only caught at review. This step installs the hook that blocks the write instead.

Install it whenever the agent platform supports tool hooks. Claude Code does, through `.claude/settings.json`. Cursor, Windsurf, and Codex do not have an equivalent write-time interception point today, so on those platforms skip this section, say so in the summary, and note that `bmad-testarch-test-review` remains the enforcement path.

### 3.1 Copy the hook script

Copy `{skill-root}/resources/hooks/tea-enforce.cjs` to `{project-root}/.claude/hooks/tea-enforce.cjs` **byte for byte**. Do not retype it, do not trim it, and do not "adapt" its rule table: the rules are generated from `bmad-testarch-test-review/steps-c/criteria-registry.md` and a test in the TEA repo asserts the two still agree. A locally edited copy silently opts the project out of that guarantee.

The script has no dependencies and runs on the Node that installed TEA. The `.cjs` extension is deliberate so it keeps working in a project whose `package.json` sets `"type": "module"`.

### 3.2 Write the gate configuration

Create `{project-root}/.tea/enforce-config.json` describing the stack you actually detected. **This is the gate.** Every rule fires only on files matching these globs, so a stack the project does not have cannot produce a violation. Never write a glob for a stack you did not detect, and never assume Playwright.

```json
{
  "testGlobs": [],
  "pactConfigGlobs": [],
  "excludeGlobs": [],
  "disabledRules": [],
  "maxFileLines": 1000,
  "stopScanWindowSeconds": 900,
  "maxScannedFiles": 5000,
  "hookSha256": ""
}
```

`maxScannedFiles` caps the `--stop` sweep. Leave it at 5000 unless the project is a monorepo large enough to hit it, in which case raise it deliberately rather than wondering why the sweep went quiet.

Set `hookSha256` to the sha256 of the file you copied in 3.1: `shasum -a 256 .claude/hooks/tea-enforce.cjs` (or `sha256sum` on Linux), taking the hash only. On `--stop`, and only there, the hook compares its own file against that value and warns once if they differ. It never blocks on a mismatch. This exists because 3.1's "copy it byte for byte" points at a test that lives in the TEA repository: nothing inside this project would otherwise notice that the copy was edited locally, and an edited copy is silently outside that test's guarantee. An empty string turns the check off.

Fill `testGlobs` from the frameworks selected in step 2 and the directories scaffolded in step 3:

| Detected surface | Add to `testGlobs`                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Playwright       | `{test_dir}/**/*.spec.{ts,js}`                                                                                                       |
| Cypress          | `cypress/e2e/**/*.cy.{ts,js}`                                                                                                        |
| Vitest / Jest    | `**/*.test.{ts,tsx,js,jsx}`, `**/*.spec.{ts,tsx,js,jsx}` scoped to `{test_dir}` and the source tree that holds co-located unit tests |
| Pact (consumer)  | `**/*.pacttest.{ts,js}`                                                                                                              |
| pytest           | `tests/**/test_*.py`, `**/*_test.py`                                                                                                 |
| JUnit            | `src/test/java/**/*{Test,Tests,IT}.java`                                                                                             |
| Go test          | `**/*_test.go`                                                                                                                       |
| Maestro          | `{maestro_root}/**/*.{yaml,yml}`                                                                                                     |

Fill `pactConfigGlobs` only when a pact vitest config exists: `**/vitest.config.pact.{ts,js}`. Rows H6 and H8 are scoped to that path and cannot fire anywhere else.

Fill `excludeGlobs` with the k6 script directory when k6 is present, for example `k6/**` or `load-tests/**`. A k6 script's `sleep(1)` is the documented way to model think-time between iterations, so H1 firing there would be the hook wrong about the one language where the pattern is correct. Say in the summary that k6 scripts are excluded and why.

Leave `disabledRules` empty. It exists so a project can turn a row off deliberately and explain itself in the commit, not so the scaffold can pre-soften the rules.

### 3.3 Register the hooks

Merge into `{project-root}/.claude/settings.json`. If the file already exists, **merge** — read it, add the entries below to the existing `hooks` object, and preserve everything else. Overwriting a user's settings file is a defect, not a scaffold.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/tea-enforce.cjs\" --pre" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|Bash",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/tea-enforce.cjs\" --post" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/tea-enforce.cjs\" --stop" }]
      }
    ]
  }
}
```

All three are required, and each one covers a hole the others cannot:

- `--pre` blocks the write before it lands. It sees only what the tool is about to write, which is why it is not sufficient on its own.
- `--post` re-reads the affected file from disk in full. This is what catches a write made through Bash (`cat > x.spec.ts`, `sed -i`, `tee`), a violation split across two edits, and a violation sitting in the part of the file the edit never touched.
- `--stop` sweeps test files modified during the turn. This is what catches a codegen script that wrote files it never named on its command line.

The hook fails open: a malformed payload, an unreadable config, or an internal error exits 0 and allows the write. A broken enforcement hook must never become an agent that cannot write files.

### 3.4 Document it

Add a short section to `{outputFile}` naming the installed rules, the fact that severity comes from the criteria registry rather than from the hook, and how to turn a rule off (`disabledRules`, with the reason in the commit). A blocking rule the team cannot find the source of is a rule the team will delete.

---

## 4. Save Progress

**Save this step's accumulated work to `{progressFile}`.**

- **If `{progressFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-04-docs-and-scripts']
  lastStep: 'step-04-docs-and-scripts'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{progressFile}` already exists**, update:
  - Add `'step-04-docs-and-scripts'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-04-docs-and-scripts'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
