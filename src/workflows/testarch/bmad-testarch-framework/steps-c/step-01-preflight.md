---
name: 'step-01-preflight'
description: 'Verify prerequisites and gather project context'
nextStepFile: '{skill-root}/steps-c/step-02-select-framework.md'
outputFile: '{test_artifacts}/framework/framework-setup-progress.md'
legacyOutputFile: '{test_artifacts}/framework-setup-progress.md'
resumeStepFile: '{skill-root}/steps-c/step-01b-resume.md'
---

# Step 1: Preflight Checks

## STEP GOAL

Verify the project is ready for framework scaffolding and gather key context.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🚫 Halt if preflight requirements fail

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

## 1. Stack Detection

**Read `config.test_stack_type`** from `{config_source}`.

**Auto-Detection Algorithm** (when `test_stack_type` is `"auto"` or not configured):

- Scan `{project-root}` for project manifests:
  - **Mobile indicators**: `.maestro/` or `maestro/` flow directory, `app.json`/`app.config.*` declaring expo or react-native, `Podfile`, `android/app/build.gradle`, `*.xcodeproj`/`*.xcworkspace`, `pubspec.yaml`
  - **Frontend indicators**: `package.json` with react/vue/angular/next dependencies, `playwright.config.*`, `vite.config.*`, `webpack.config.*`
  - **Backend indicators**: `pyproject.toml`, `pom.xml`/`build.gradle`, `go.mod`, `*.csproj`/`*.sln`, `Gemfile`, `Cargo.toml`
  - **Check mobile first.** A React Native or Expo project carries `package.json` with react and misdetects as `frontend` otherwise.
  - **Mobile present** = `mobile`; frontend and backend both present = `fullstack`; only frontend = `frontend`; only backend = `backend`
  - A project containing both a mobile client and a backend service detects as `mobile` by default. Run separate framework scaffolding passes (or specify `test_stack_type = backend` for the backend surface) when scaffolding both mobile and backend test frameworks.
- Explicit `test_stack_type` config value overrides auto-detection
- **Backward compatibility**: if `test_stack_type` is not in config, treat as `"auto"` (preserves current frontend behavior for existing installs)

Store result as `{detected_stack}` = `frontend` | `backend` | `fullstack` | `mobile`

---

## 2. Validate Prerequisites

**If {detected_stack} is `frontend` or `fullstack`:**

- `package.json` exists in project root
- No existing E2E framework (`playwright.config.*`, `cypress.config.*`, `cypress.json`)

**If {detected_stack} is `mobile`:**

- App manifest exists (`app.json`, `app.config.*`, `android/app/build.gradle`, `*.xcodeproj`/`*.xcworkspace`, `pubspec.yaml`)
- Recognize existing Maestro (`maestro/`, `.maestro/`) or Appium configuration if present

**If {detected_stack} is `backend` or `fullstack`:**

- At least one backend project manifest exists (`pyproject.toml`, `pom.xml`, `build.gradle`, `go.mod`, `*.csproj`, `Gemfile`, `Cargo.toml`)
- No existing test framework config that conflicts (e.g., `conftest.py` with full pytest suite, `src/test/` with JUnit suite)

- Architecture/stack context available (project type, bundler, dependencies)

If any fail, **HALT** and report the missing requirement.

---

## 3. Gather Project Context

**If {detected_stack} is `frontend` or `fullstack`:**

- Read `package.json` to identify framework, bundler, dependencies

**If {detected_stack} is `mobile`:**

- Read app manifest (`app.json`, `Podfile`, `build.gradle`, `pubspec.yaml`) to identify mobile framework (React Native/Expo, Native Android/iOS, Flutter), language, and toolchain
- Load mobile language and toolchain context required for unit, component, and flow scaffolding

**If {detected_stack} is `backend` or `fullstack`:**

- Read the relevant project manifest (`pyproject.toml`, `pom.xml`, `go.mod`, `*.csproj`, `Gemfile`, `Cargo.toml`) to identify language, framework, and dependencies

- Check for architecture docs (`architecture.md`, `tech-spec*.md`) if available
- Note auth requirements and APIs (if documented)

---

## 4. Confirm Findings

Summarize:

- Project type and bundler
- Whether a framework is already installed
- Any relevant context docs found

---

## 5. Check for an Existing Checkpoint

Check whether `{outputFile}` already exists. A project has one test framework setup, so a checkpoint at this path belongs to a previous run of this workflow.
When it does not exist, also check `{legacyOutputFile}`, where runs before the `framework/` folder wrote the checkpoint. Only an in-progress legacy checkpoint counts here; a completed one stays where it is and this run starts fresh in the folder.

A checkpoint that carries no `workflowStatus` predates that key: treat it as `'completed'` when its `lastStep` is `'step-05-validate-and-summary'`, and as `'in-progress'` otherwise.

- **No checkpoint:** this is a fresh run. Proceed to Save Progress.
- **Exists with `workflowStatus: 'in-progress'`:** a previous run was interrupted. Display its `lastStep` and `lastSaved`, then ask:

  > "An unfinished test framework setup was last saved {lastSaved} at step {lastStep}. Resume it, or start over? Starting over replaces the checkpoint."

  **Halt** until the user answers. A headless or autonomous run starts over. If they resume, load `{resumeStepFile}`, read it completely, and execute it. If they start over, replace `{outputFile}` entirely in Save Progress and leave any legacy checkpoint untouched.

- **Exists with `workflowStatus: 'completed'`:** a finished run. Replace `{outputFile}` entirely in Save Progress.

**Never merge two runs into one checkpoint.** A `stepsCompleted` array carried over from a prior run makes the resume dashboard and its routing report steps this run never performed.

---

### 6. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

Create the `{test_artifacts}/framework/` folder if it does not exist. Write the file with YAML frontmatter, replacing any prior content as decided in the previous section:

```yaml
---
workflowStatus: 'in-progress'
stepsCompleted: ['step-01-preflight']
lastStep: 'step-01-preflight'
lastSaved: '{date}'
---
```

Then write this step's output below the frontmatter.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
