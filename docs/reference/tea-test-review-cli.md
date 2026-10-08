---
title: 'tea-test-review CLI'
description: 'Headless CI runner for the bmad-testarch-test-review skill: flags, exit codes, JSON verdict schema, and security model'
---

# tea-test-review CLI

`tea-test-review` is a headless runner for the [Test Review](/docs/how-to/workflows/run-test-review.md) workflow (`bmad-testarch-test-review`). It splits a pull request's diff into the test files to review and the rest of the change to read as context, drives the skill non-interactively, parses the resulting `test-review.md` against a strict schema, and emits a JSON verdict with a CI-friendly exit code.

The skill is the source of truth for all review logic (checklist, scoring, report template). The CLI only resolves the skill, scopes the review, runs the agent, parses the report. How it's built: [Test Review CLI Architecture](/docs/explanation/test-review-cli-architecture.md).

## Prerequisites

- Node.js 20+, with the `tea-test-review` bin (`npm install --global bmad-method-test-architecture-enterprise`, or via `npx`).
- The review skill ships inside the CLI package. `tea-test-review` reviews with the `bmad-testarch-test-review` skill and `bmod-tea` knowledge base from its own install, so the skill and the CLI are always one version and the reviewed repo needs no BMAD files and no TEA module. When the CLI is installed outside the checkout (a global install, or a pinned install step in CI), that copy is out of reach of the pull request under review, so it cannot edit the reviewer that judges it. A CLI installed as a project dependency lives in the checkout's `node_modules`; pin its version in CI. Two flags change the source:
  - **`--project-skill`** reviews with the copy the project vendored instead, probed at `.claude/skills/bmad-testarch-test-review`, `.agents/skills/bmad-testarch-test-review`, `skills/bmad-testarch-test-review`, and last the classic installer's `_bmad/tea/workflows/testarch/bmad-testarch-test-review`, which a project upgraded from v6 can still hold. The control-plane guard applies to it: a PR diff that edits the vendored skill or its `bmod-tea` knowledge base exits 2.
  - **`--skill-root <path>`** names an exact skill directory, for example one unpacked from a tarball you vetted. Copy `bmod-tea` beside it: the skill reads its knowledge base from the folder beside it, and the CLI exits 2 before any agent call when `bmod-tea/knowledge/tea-index.csv` is missing.
- The agent CLI is the caller's to install and log in. When the selected CLI is missing, or its login status command (asked only when the CLI's own help lists it, and not when a credential variable the CLI reads itself is set) reports a logged-out session, the run exits 2 with the install or login command before any agent call, and `--retries` never repeats it. A custom `--agent-cmd` is not the vendor CLI, so only its presence is checked.
- For `--agent claude` (default): the `claude` CLI on `PATH`, authenticated via subscription/keychain login or `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN` in the environment.
- For `--agent codex`: the `codex` CLI on `PATH`, authenticated via `codex login`, which stores credentials in `$HOME/.codex/auth.json`. **`OPENAI_API_KEY` in the environment is not enough**: codex 0.146.0 never reads it, and a run with only that variable set sends no credential at all and fails with `401 ... Missing bearer or basic authentication in header`. On a machine with no interactive login, such as any CI runner, write the auth file first with `printenv OPENAI_API_KEY | codex login --with-api-key`, or pass `CODEX_API_KEY` through with `--env-pass CODEX_API_KEY`.
- For `--agent agy`: the `agy` CLI on `PATH` with its Antigravity session ready. It accepts `--model`; without an override it uses the session's model. This adapter sends the complete prompt through the `--print` process argument because `agy` does not consume the prompt from stdin.
- For `--agent custom`: an explicit `--agent-cmd` executable that reads the prompt from stdin, runs non-interactively in the project directory, writes the report path named in the prompt, and exits nonzero on failure. Supply every runner argument with `--agent-arg` and allow required credential variables through with `--env-pass`.

## Run it locally

Install the CLI once. This adds the `tea-test-review` command to your `PATH`; it does not install the TEA module into any project, and it leaves an existing `claude` or `codex` install alone.

```bash
npm install --global bmad-method-test-architecture-enterprise@latest
```

Run it from the project root against the files you want reviewed. The skill comes from the CLI install, so nothing else has to be fetched:

```bash
tea-test-review \
  --agent codex \
  --files playwright/tests/api/checkout.spec.ts \
  --output /tmp/tea-review.md \
  --json /tmp/tea-review.json
```

To review with the skill a project vendored instead, add `--project-skill`.

Three things worth knowing before the first run:

- **Use `--files` for uncommitted work.** The default scoping is `git diff <base>...HEAD`, which only sees committed changes. Once the tests are committed, drop `--files` and use `--base main` to exercise the real pull-request scoping.
- **It prints nothing while the agent works,** which can take several minutes. Pipe through `tee` if you want a file to watch.
- **`--agent none` costs nothing.** It prints the prompt bundle and exits without spawning an agent, which is the fastest way to confirm the right files are in the review set.

Authentication is whatever your agent CLI already uses. A `claude` or `codex` subscription login stored under `$HOME` is passed through and needs no API key. For claude, the key variables in Prerequisites work as a fallback; for codex they do not, so see the `--agent codex` note above before running anywhere without an interactive login.

## Run it in CI

The CLI is the whole integration. It runs the same way in any CI, because everything the review needs is in it: the skill, the retry, the pull-request base lookup, the comment text and the GitHub publisher. A CI job installs the CLI and an agent, logs the agent in, and runs one command.

### GitHub Actions

`--github` opens a check run before the review starts, closes it with the verdict, and keeps one comment on the pull request up to date. The job's exit code is the verdict.

```yaml
name: TEA Test Review
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions: {}
jobs:
  review:
    runs-on: ubuntu-latest
    # Forks receive no secrets, so skip them rather than fail.
    if: github.event.pull_request.head.repo.full_name == github.repository
    permissions:
      contents: read
      pull-requests: write
      checks: write
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0 # the review diffs changed test files against the base ref
          persist-credentials: false
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - name: Install the pinned CLI and agent
        run: npm install --global bmad-method-test-architecture-enterprise@<exact version> @anthropic-ai/claude-code@<exact version>
      - name: Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ github.token }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: tea-test-review --github --pr "$PR_NUMBER" --artifact-name tea-test-review --output test-review.md --json test-review.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: tea-test-review
          path: |
            test-review.md
            test-review.json
```

Make the job a required status check to gate merges. [`cli/examples/pr-test-review.yml`](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/examples/pr-test-review.yml) is this workflow with the gate-policy flags annotated.

The standalone [`tea-test-review` action](https://github.com/muratkeremozcan/tea-test-review) adds the GitHub-only conveniences around the same CLI: `@mention` triggers with a trusted-author gate, the agent install and login, and the artifact upload.

### GitLab

GitLab has no `--github` equivalent: the CLI runs the review and writes the comment text, and the job posts it. `--base` names the merge request's target branch, and `--run-url` and `--artifact-name` let the comment link the job and its artifact.

```yaml
tea-test-review:
  stage: test
  image: node:22
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  variables:
    GIT_DEPTH: '0'
  script:
    - npm install --global bmad-method-test-architecture-enterprise@<exact version> @anthropic-ai/claude-code@<exact version>
    - git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
    - |
      status=0
      tea-test-review --base "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" --agent claude \
        --run-url "$CI_JOB_URL" --artifact-name tea-test-review \
        --output test-review.md --json test-review.json --comment-out tea-comment.md || status=$?
      if [ -s tea-comment.md ]; then
        curl --silent --fail --request POST --header "PRIVATE-TOKEN: $GITLAB_API_TOKEN" \
          --data-urlencode "body@tea-comment.md" \
          "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests/$CI_MERGE_REQUEST_IID/notes" || echo "could not post the comment"
      fi
      exit "$status"
  artifacts:
    when: always
    paths: [test-review.md, test-review.json, tea-comment.md]
```

`--comment-out` is written for every outcome, including a run that produced no verdict, so a broken gate is posted too. The note is a new one on every pipeline; to update one in place, look up your earlier note by its hidden marker the way `--github` does on GitHub.

### Jenkins, Buildkite and other CIs

Run the same command, then publish `tea-comment.md` wherever the pull request lives. A GitHub repository on Jenkins or Buildkite passes `--github` and a `GITHUB_TOKEN`, along with `--pr <number>` and `--repo <owner/name>` when the job has no `GITHUB_*` variables, and gets the check run and the comment without any GitHub Actions. `--head-sha`, `--run-url` and `--check-name` fill in what a non-Actions run does not carry.

## Flags

| Flag                                                   | Default                                                            | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--base <ref>`                                         | `origin/main`                                                      | Git base ref to diff changed files. With `--pr`, the pull request's base branch is used unless `--base` is given.                                                                                                                                                                                                                                                                                                                                          |
| `--files <list>`                                       | -                                                                  | Explicit review set (repeatable, comma-separated); skips the git diff and test-file filter.                                                                                                                                                                                                                                                                                                                                                                |
| `--scope <scope>`                                      | derived                                                            | `review_scope` override (`single` \| `directory` \| `suite`); default `single` for one file, else `directory`.                                                                                                                                                                                                                                                                                                                                             |
| `--test-dir <dir>`                                     | `tests`                                                            | `test_dir` hint passed to the skill.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--focus <text>`                                       | -                                                                  | Requester focus note handed to the reviewer verbatim; may raise scrutiny, never waives, and is quoted as a `**Focus**:` line.                                                                                                                                                                                                                                                                                                                              |
| `--test-glob <substring-or-regex>`                     | -                                                                  | Extra test-file matcher (substring or `/regex/`, repeatable).                                                                                                                                                                                                                                                                                                                                                                                              |
| `--project-root <dir>`                                 | current directory                                                  | Consuming project root.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--skill-root <path>`                                  | the packaged skill                                                 | Trusted skill root (must contain `SKILL.md`); skips the packaged skill and the install probe. Outside `--project-root`, the control-plane guard is moot.                                                                                                                                                                                                                                                                                                   |
| `--project-skill`                                      | off                                                                | Review with the skill installed in `--project-root` instead of the packaged one. The control-plane guard applies. Not combinable with `--skill-root`.                                                                                                                                                                                                                                                                                                      |
| `--pr <number>`                                        | -                                                                  | Pull request number. When `--base` is not given, resolves the PR's base branch through the GitHub API (`GITHUB_TOKEN`, and `GITHUB_REPOSITORY` or `--repo`; `GITHUB_API_URL` for GitHub Enterprise). `GITHUB_BASE_REF`, set on `pull_request` runs, answers without a request. A failed lookup exits 2 and names `--base` as the bypass. Not combinable with `--files`.                                                                                    |
| `--repo <owner/name>`                                  | `GITHUB_REPOSITORY`                                                | Repository for the `--pr` lookup.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--retries <n>`                                        | `1` when `CI` is set, else `0`                                     | Extra attempts after an agent or report-parse failure (exit 3). Each attempt starts from no report and no verdict. Exit 1 and 2 are never retried. At most 5, since every attempt is a paid agent run.                                                                                                                                                                                                                                                     |
| `--comment-out <file>`                                 | -                                                                  | Also write the pull-request comment, rendered from the final verdict, to this file. Written for every outcome, including a failure that left no verdict.                                                                                                                                                                                                                                                                                                   |
| `--run-url <url>`                                      | built from the `GITHUB_*` variables                                | Link to this CI run, shown in the comment and on the check run.                                                                                                                                                                                                                                                                                                                                                                                            |
| `--artifact-name <name>`                               | -                                                                  | Name of the artifact the job uploads the report and verdict to. The comment names it as available once the upload step has finished; without this flag the comment promises no artifact.                                                                                                                                                                                                                                                                   |
| `--github`                                             | off                                                                | Publish to GitHub: open a check run before the review, close it with the verdict, and upsert one pull-request comment. Repository, pull request, token and API URL come from `--repo`, `--pr` and the standard `GITHUB_*` variables. A failure to publish is a warning and never changes the exit code.                                                                                                                                                    |
| `--head-sha <sha>`                                     | event payload, then the API                                        | Pull request head commit the check run attaches to. Only with `--github`.                                                                                                                                                                                                                                                                                                                                                                                  |
| `--check-name <name>`                                  | `TEA Test Review`                                                  | Check run name. Branch protection matches it exactly, so the agent is not part of it. Only with `--github`.                                                                                                                                                                                                                                                                                                                                                |
| `--no-check-run` / `--no-pr-comment`                   | both published                                                     | With `--github`, publish only the comment or only the check run.                                                                                                                                                                                                                                                                                                                                                                                           |
| `--output <file>`                                      | `test-review.md`                                                   | Report path the agent writes. Passed to the workflow as `output_file_override`, so it replaces the workflow's own default path.                                                                                                                                                                                                                                                                                                                            |
| `--json <file>`                                        | -                                                                  | Also write the verdict JSON here.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--agent <agent>`                                      | `claude`                                                           | `agy`, `claude`, or `codex` use built-in adapters; `custom` uses the portable runner contract; `none` prints the prompt only.                                                                                                                                                                                                                                                                                                                              |
| `--model <model>`                                      | `claude`: `sonnet`, `codex`: `gpt-5.6-sol`, `agy`: session default | Model for a built-in adapter. Rejected with `custom` and `none`; select a custom runner's model through `--agent-arg`.                                                                                                                                                                                                                                                                                                                                     |
| `--agent-cmd <path>`                                   | the selected adapter's command                                     | Override a built-in executable; required with `--agent custom`.                                                                                                                                                                                                                                                                                                                                                                                            |
| `--agent-arg <arg>`                                    | -                                                                  | Extra argument appended to the selected agent's argv (repeatable).                                                                                                                                                                                                                                                                                                                                                                                         |
| `--env-pass <NAME>`                                    | -                                                                  | Env var allowed through beyond the default set (repeatable).                                                                                                                                                                                                                                                                                                                                                                                               |
| `--timeout-ms <n>`                                     | 20 min + 2 min per reviewed file, capped at 30 min                 | Agent wall-clock timeout: on POSIX the agent's process group gets SIGTERM, then SIGKILL 2 s later if it is still running. On Windows, a kill-on-close Job Object stops the agent and ordinary descendants when the turn ends. No supported vendor CLI caps turns, so this bounds a stuck run, with up to 2 s spent reading the output the agent left. The timeout applies to each attempt, so with `--retries n` a run can take up to (n+1) times as long. |
| `--execution-mode <mode>`                              | `auto`                                                             | Force `tea_execution_mode` (`auto`\|`agent-team`\|`subagent`\|`sequential`), overriding the project config.                                                                                                                                                                                                                                                                                                                                                |
| `--capability-probe` / `--no-capability-probe`         | `true`                                                             | Force `tea_capability_probe`. With it off, the requested execution mode is honored strictly.                                                                                                                                                                                                                                                                                                                                                               |
| `--min-score <n>`                                      | -                                                                  | Fail when the quality score is below `n` (0-100).                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--max-critical <n>`                                   | no cap                                                             | Fail when Critical violations exceed `n`.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--min-files <n>`                                      | `1`                                                                | Fail when fewer than `n` files are reviewed.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--fail-on <level>`                                    | `request-changes`                                                  | Weakest recommendation that fails CI.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--gate-on <mode>`                                     | `introduced` for git diff; `all` with `--files`                    | Gate on PR-owned findings (`introduced`) or every finding (`all`).                                                                                                                                                                                                                                                                                                                                                                                         |
| `--fail-on-skip`                                       | off                                                                | Exit 1 instead of 0 on skip (no changed test files).                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--waive <reason>`                                     | -                                                                  | Waive a fail (exit 0), record the reason; requires `--waive-until`. Exit 2/3 never waivable.                                                                                                                                                                                                                                                                                                                                                               |
| `--waive-until <YYYY-MM-DD>`                           | -                                                                  | Waiver expiry; must be a real future calendar date.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--isolate` / `--no-isolate`                           | isolated when `CI` is set                                          | Run the agent under filesystem isolation.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--use-playwright-utils` / `--no-use-playwright-utils` | resolved (below)                                                   | Force `tea_use_playwright_utils`.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--use-pactjs-utils` / `--no-use-pactjs-utils`         | resolved (below)                                                   | Force `tea_use_pactjs_utils`.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--pact-mcp <mode>`                                    | resolved (below)                                                   | Force `tea_pact_mcp` (`mcp` \| `none`).                                                                                                                                                                                                                                                                                                                                                                                                                    |

## The comment, the check run and `render`

One renderer turns the verdict JSON into every human surface, so the pull-request comment, the check-run text and a job summary cannot disagree. It needs no network.

```bash
tea-test-review render --verdict test-review.json --as comment   # with the hidden marker
tea-test-review render --verdict test-review.json --as summary   # the same text, no marker
tea-test-review render --verdict test-review.json --as check     # first line is the check title
```

`render` also takes `--agent`, `--run-url`, `--artifact-name`, `--focus` and `--exit-code <0-3>`. A verdict file that is missing or unreadable exits 2, unless `--exit-code` says how the review ended, in which case it renders a broken gate.

For a clean pull-request review the comment is a few lines:

```text
TeA test quality: Pass for the changed tests
Reviewed 12 changed test files at 61901be9. No findings attributable to this PR.
```

It leads with the gate verdict and the reviewed head commit. A failing review adds up to three findings that affect the gate, most severe first, each with its severity, `path:line` and its own title; further findings are counted and left to the report. Findings the gate does not count, the raw score, the cap formula, the list of reviewed files and the report itself stay out of the comment. A compact line names the reviewer (agent and model), the TeA CLI version and the rubric version, so scores are compared with the rubric that produced them. The comment never inlines the report.

Each state reads differently:

| State                    | Headline                                                                  | Check run                                                            |
| ------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Gate passed              | "Pass for the changed tests"                                              | success                                                              |
| Gate failed              | "Fail:" and the recommendation, the gate failures and the gating findings | failure                                                              |
| Failure waived           | the recommendation, "waived until" and the date, and the reason           | success                                                              |
| No changed tests         | "Skipped" and what the pull request did change                            | neutral, or failure when `--fail-on-skip` turns the skip into exit 1 |
| `--agent none`           | "No review performed", a dry run and not a verdict                        | neutral                                                              |
| No verdict (exit 2 or 3) | "Broken gate", the cause, and that it is not approved tests               | failure                                                              |

The comment names an uploaded report only when you pass `--artifact-name`, and says the artifact is available once its upload step has finished, because the comment is usually posted before that step runs.

### Publishing with `--github`

`--github` writes these surfaces to GitHub for you. The check run opens before the review starts, so a slow agent shows as in progress on the pull request; it closes with the verdict's conclusion. The comment is found by its hidden marker, tagged by agent, and updated in place, so a push updates one comment and two agents reviewing one pull request keep one comment each. A comment left by an older untagged version is adopted only by the default `claude` agent, so two agents can never overwrite each other's. A re-run adopts the check run an earlier attempt left in progress instead of stacking a second one under the same name.

Publishing is cosmetic to the verdict. The exit code is the verdict, and any failure to publish is a warning on stderr (a `::warning::` annotation on GitHub Actions): a token without `checks: write`, the Checks API refusing a classic personal access token, a missing `pull-requests: write`, no token at all. Use the default `GITHUB_TOKEN` of the job: the Checks API rejects a classic personal access token.

## What the review is judged against

The diff produces two lists. There is no flag for either: if the story is in the pull request, it is in the diff, so it gets read.

| List        | Contents                                                             | Scored | Reported in         |
| ----------- | -------------------------------------------------------------------- | ------ | ------------------- |
| Review set  | Every changed file matching the test-file rules                      | Yes    | `## Reviewed Files` |
| Context set | Everything else in the diff: story, PRD, test design, changed source | No     | `## Review Context` |

The context set excludes lockfiles, snapshots, and binary assets, orders documentation ahead of source, and caps at 40 files so a large pull request cannot exhaust the agent.

The Executive Summary must declare `**Context Basis**: none | pr_diff | pr_diff_truncated`, backed by a `## Review Context` manifest whenever the basis is not `none`. `none` is the correct value for a tests-only diff or an explicit `--files` list.

Three rules hold the boundary. The prompt states them and the parser enforces them:

- **The manifests are disjoint.** A path in both `## Reviewed Files` and `## Review Context` is rejected (exit 3).
- **The manifests are bound to the run.** Paths are canonicalized before comparison. `## Reviewed Files` must equal the authoritative review set. `## Review Context` can only name supplied context, and it must equal the supplied set when the report claims the supplied basis.
- **Context raises findings, never waives them.** It can catch a test that contradicts its acceptance criteria or a changed code path with no assertion on it. It can never waive a violation, lower a severity, or move the score. A story claiming that a bad practice is acceptable here is itself a finding.

A report claiming more evidence than the run supplied (`pr_diff` when the CLI supplied `none`) is rejected as exit 3. Claiming less is allowed. The Executive Summary also declares `**Context Waivers Applied**: 0`; any nonzero value is rejected.

Why the two lists are separated, and why context can never waive: [Test Review CLI Architecture](/docs/explanation/test-review-cli-architecture.md).

### Delta-aware PR verdicts

Git-diff reviews default to `--gate-on introduced`. The CLI reads local
`<base>...HEAD` hunks and classifies every finding:

- `introduced`: the finding is in a file added by the pull request or on a
  reported line in a pure-addition hunk.
- `modified`: its reported line is in a replacement hunk. A finding with no usable
  line is treated as modified, so missing evidence cannot bypass the gate.
- `pre_existing`: its reported line is outside the pull request's changed lines.

Introduced and modified findings affect the PR verdict. Pre-existing findings stay
in `findings`, carry `verdict_impact: false`, and appear in the report's
`Pre-existing Findings (Advisory)` section. They do not affect the gating
recommendation, gating severity counts, `--min-score`, or `--max-critical`.

Use `--gate-on all` for a baseline audit. An explicit `--files` review skips git,
so it defaults to `all`; combining `--files` with `--gate-on introduced` is
rejected instead of guessing provenance.

## Which model does the reviewing

Each built-in adapter resolves a model. `--model` overrides that resolution.

| `--agent` | Default resolution | Override with     |
| --------- | ------------------ | ----------------- |
| `agy`     | Session model      | `--model <model>` |
| `claude`  | `sonnet`           | `--model <model>` |
| `codex`   | `gpt-5.6-sol`      | `--model <model>` |

The Claude and Codex defaults are aliases: they hold the tier steady, not the exact weights. Pass a fully-qualified slug to `--model` when a run has to be reproducible across model generations. Agy's session default is unpinned until an explicit model is supplied.

The resolved built-in model travels in the verdict JSON as `model`, alongside `agent`. Two scores are only comparable when those two fields match. A model supplied through a built-in adapter's `--agent-arg` becomes the resolved value too. Combining `--model` with a passthrough model, or declaring multiple passthrough models, is rejected before spawn. `agy` records `model: null` when it uses the session default and records the explicit value when `--model` is supplied.

`--agent custom` has no universal model flag. Select its model through `--agent-arg`; its verdict records `agent: "custom"` and `model: null`. Keep the custom runner command and model in CI configuration when results need to be compared over time. `--model` is rejected with `custom` and with `none`, which runs no agent.

**Codex reasoning effort is a second unstated input, and it is not pinned here.** A local `model_reasoning_effort = "max"` costs about ten extra seconds even on a one-word prompt, and far more on a real review. It is codex-only, so it gets no vendor-agnostic flag; set it per run with `--agent-arg -c --agent-arg model_reasoning_effort=low`.

`--claude-arg` remains accepted as a deprecated alias for workflows created before multi-vendor support. It emits a migration warning and preserves argument order. New workflows should use `--agent-arg`.

Why the model is pinned rather than left to the vendor CLI: [Test Review CLI Architecture](/docs/explanation/test-review-cli-architecture.md).

## TEA config resolution

Four config keys pick which knowledge fragments load, and two more decide how step-03 orchestrates its quality workers. The CLI states all six in the prompt, because a key it leaves unstated is one the agent decides for itself.

One of the four is fixed by the headless contract: `tea_browser_automation=none`. The other five, the three fragment keys plus the orchestration pair `tea_execution_mode` and `tea_capability_probe`, resolve by precedence, highest first:

1. Explicit flag (`--use-pactjs-utils`, `--no-use-playwright-utils`, `--pact-mcp mcp`, `--execution-mode sequential`, `--no-capability-probe`)
2. The project's `[modules.tea]` table, merged from `_bmad/config.toml`, `_bmad/custom/config.toml`, and `_bmad/custom/config.user.toml`, later files winning (written by `bmad setup tea`). Only when `_bmad/config.toml` does not exist does the CLI read a legacy `_bmad/tea/config.yaml` instead, so CI set up for an older TEA keeps working
3. Module default from `skills/bmod-tea/bmod.toml`: `tea_use_playwright_utils: true`, `tea_use_pactjs_utils: true`, `tea_pact_mcp: mcp`, `tea_execution_mode: auto`, `tea_capability_probe: true`

`step-03-quality-evaluation.md` reads the orchestration pair, probes the runtime, dispatches its four quality workers in parallel when it can launch them, and resolves to `sequential` when it cannot. Both keys are stated in the prompt because `auto` with the probe off resolves to `sequential` on every run, which would leave the parallel path unreachable. The report's `**Execution Mode**:` line records which one it resolved to.

A missing config is normal: CI installs the skill without running `bmad setup tea`. Content that exists but is invalid is an error (exit 2): a `tea_use_*` value that is not a boolean or the string `"true"` or `"false"`, a `tea_pact_mcp` or `tea_execution_mode` outside its enum, unparseable TOML or YAML, a `[modules.tea]` that is not a table, or a legacy file that is not a mapping. The strings `"true"` and `"false"`, as `bmad setup` writes them, are coerced.

**In CI, state what you need.** With no config and no flag, a contract-testing repo gets `tea_use_pactjs_utils: true` and loads the `pactjs-utils-*`/`pact-*` fragments, which is what a repo on those utilities wants. A repo writing raw `@pact-foundation/pact` should commit a `[modules.tea]` table in `_bmad/config.toml` or pass `--no-use-pactjs-utils`, so the review loads `contract-testing.md` and scores against the rules that repo actually follows.

## Exit codes

| Code | Meaning                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Review passed, was skipped, or a verdict failure was waived.                                                                                                                                                      |
| `1`  | Review verdict fail: failing recommendation, `--min-score`, `--max-critical`, `--min-files`, `--fail-on-skip`, or a deletions-only diff, without an active waiver.                                                |
| `2`  | Environment or config error: skill not found, agent CLI missing or logged out, invalid flags, unsafe paths, git diff failure, a failed `--pr` base lookup, or the control-plane guard.                            |
| `3`  | Agent or parse failure: agent errored, wrote no fresh report, or the report failed strict validation. `--retries` repeats an agent or parse failure first; a failure to write the report artifact is not retried. |

### Waived semantics

`--waive <reason> --waive-until <YYYY-MM-DD>` turns any exit-1 outcome into exit `0`, adds `waived: true`, `waiveReason`, `waiveUntil` to the verdict, and prints a `WAIVED` banner to stdout. Exit codes 2 and 3 are **never** waivable: a broken gate or an unparseable report is not a verdict.

## JSON verdict schema

A review verdict (also written to `--json <file>` when given):

```json
{
  "report": "test-review.md",
  "files": ["tests/checkout.spec.ts"],
  "agent": "claude",
  "model": "sonnet",
  "gateOn": "introduced",
  "gatingQualityScore": 89,
  "gatingViolations": { "critical": 0, "high": 0, "medium": 2, "low": 3 },
  "recommendation": "Approve with Comments",
  "rawQualityScore": 92,
  "qualityScore": 79,
  "scoreCap": 79,
  "scoreOverrideRule": "Highest severity High caps effective score at 79: min(raw deduction score 92, 79) = 79.",
  "verdictRule": "No Critical or High, effective score >= 70, and findings remain => Approve with Comments.",
  "violations": { "critical": 0, "high": 1, "medium": 2, "low": 3 },
  "findings": [
    {
      "criterion_id": "H1",
      "severity": "High",
      "path": "tests/checkout.spec.ts",
      "line": 16,
      "provenance": "pre_existing",
      "changed_line_evidence": {
        "fileStatus": "modified",
        "changed": false,
        "ranges": [{ "start": 40, "end": 52, "provenance": "modified" }],
        "reason": "the reported line is outside every added-side diff hunk"
      },
      "deduction": 5,
      "verdict_impact": false,
      "row": "H1",
      "file": "tests/checkout.spec.ts",
      "section": "Recommendations (Should Fix)",
      "title": "Hard wait orders two steps"
    }
  ],
  "reviewProvenance": {
    "teaCliVersion": "1.24.0",
    "skillRubricVersion": "4.0",
    "modelIdentifier": "sonnet",
    "baseSha": "0123456789abcdef0123456789abcdef01234567",
    "headSha": "89abcdef0123456789abcdef0123456789abcdef",
    "triggerComment": null,
    "workflowRun": "https://github.com/example/project/actions/runs/123",
    "gateMode": "introduced",
    "sources": {
      "teaCliVersion": "package.json",
      "skillRubricVersion": "test-review-template.md Workflow metadata"
    }
  },
  "reviewedFiles": ["tests/checkout.spec.ts"],
  "contextBasis": "pr_diff",
  "contextFiles": ["docs/stories/checkout-decline.md", "src/checkout/payment.ts"],
  "contextWaiversApplied": 0,
  "keyStrengths": ["Fully deterministic, no conditional branching or timing dependencies"],
  "keyWeaknesses": ["Missing explicit test IDs on two test cases"],
  "advisoryObservations": ["Consider extracting the login flow into a shared fixture"],
  "executionMode": "subagent",
  "conventionBaseline": {
    "baselineUnavailable": false,
    "corpusSize": 47,
    "sampled": 8,
    "scanned": 40,
    "sampledFiles": ["tests/login.spec.ts", "tests/profile.spec.ts"],
    "conventions": {
      "priorityMarkers": { "mechanical": true, "adopted": 0, "mechanicalSignal": false },
      "testIds": { "mechanical": true, "adopted": 6, "mechanicalSignal": true },
      "bddNaming": { "mechanical": false }
    }
  }
}
```

`findings` is one entry per finding block documented under `## Critical Issues (Must Fix)` and `## Recommendations (Should Fix)`, in report order. The stable automation fields are `criterion_id`, `severity`, `path`, `line`, `provenance`, `deduction`, and `verdict_impact`. PR classification also adds `changed_line_evidence`. The old `row` and `file` names and the display-only `section` and `title` remain for compatibility. `provenance` is `introduced`, `modified`, or `pre_existing` when diff evidence is available; older or unclassified reports use `unknown`. `violations` and `qualityScore` remain the full-review values. `gatingViolations` and `gatingQualityScore` are used by the selected gate mode. When the delta gate changes the recommendation, `allFindingsRecommendation` preserves the full-review recommendation.

Per severity, `findings` agrees with `violations`: exactly for Critical and High, and never exceeding it for Medium and Low, which a report may summarize in prose. A disagreement is a parse failure (exit 3), so the two fields can never describe different reviews.

`reviewProvenance` records the TeA package version, rubric version, resolved model, base/head commits, GitHub trigger comment, workflow run, and gate mode. Unknown values are `null`. Its `sources` map names the source or fallback for every value, so a local run or custom adapter never invents CI or model metadata.

`contextWaiversApplied` is strict and always `0`. `keyStrengths`, `keyWeaknesses`, and `advisoryObservations` are best-effort, pulled from the report's Executive Summary bullet lists (the third from an "Advisory Observations" subsection, capped at ten items) for PR-comment display; they're not part of the gating contract, a report that omits them still passes or fails on its own merits and the fields just come back as `[]`.

`executionMode` is the mode `step-03-quality-evaluation.md`'s capability probe resolved for this run: `agent-team`, `subagent`, or `sequential`. It is absent when the report states none. Without it a run that asked for parallel workers and silently fell back to `sequential` was indistinguishable afterwards from one that got what it asked for, which made any speed claim about the run unfalsifiable.

`conventionBaseline` is the CLI's own deterministic measurement of step-02-discover-tests.md §2b's convention baseline, never the agent's. It travels in the verdict alongside `agent` and `model`, so a stored score also says what house convention it was judged against and how that was established.

[`cli/lib/convention-baseline.js`](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/lib/convention-baseline.js) computes `sampledFiles` and per-key `mechanicalSignal` by reading file content, never by asking the agent. The report's own `Convention: <key> (<adopted> of <sampled> sampled)` citations are rejected (exit 3) when they disagree with that scan. The sharpest case: a citation claiming nonzero adoption for a key the scan found zero real occurrences of anywhere in the scanned corpus.

`sampled` and `scanned` are two different corpora out of one ranking. `sampled` (8) is what the agent is told to read and the denominator every citation uses; it is a turn budget, since the agent has no shell and opens one file per turn. `scanned` (40) is how many files the CLI opened itself for the mechanical detectors, which costs no turns, so it stays wide: the zero-signal floor is only as strong as the corpus it observed nothing in.

The field is absent only when no baseline was computed for this run, such as a bare `parseReport` call in a unit test with no CLI around it.

A failing verdict adds `gateFailures` (machine-readable reasons, e.g. `"insufficient evidence: 1 files reviewed (3 required)"`); a waived failure adds `waived`, `waiveReason`, `waiveUntil`. A diff carrying changed test artifacts the ledger has no criteria for (Gherkin features, `.http` collections) adds `unscorableTestArtifacts` naming them, so a consumer reading only the verdict learns a changed test artifact went unscored. `reportedQualityScore` and `reportedRecommendation` carry what the agent stated whenever the derived ledger values replaced it.

The full key set is declared as `VERDICT_KEYS` in [`cli/test-review.js`](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/test-review.js). Every published payload is asserted against it, and `test/contracts/test-review.contract.json` derives its response descriptor from it rather than restating it. `FINDING_KEYS` in `cli/lib/parse-report.js` declares each finding record.

A skipped review (no changed test files):

```json
{
  "skipped": true,
  "reason": "no changed test files in diff",
  "recommendation": null,
  "qualityScore": null,
  "files": [],
  "contextBasis": "none",
  "contextFiles": [],
  "gateOn": "all",
  "reviewProvenance": {
    "teaCliVersion": "1.24.0",
    "skillRubricVersion": "4.0",
    "modelIdentifier": "sonnet",
    "baseSha": null,
    "headSha": null,
    "triggerComment": null,
    "workflowRun": null,
    "gateMode": "all",
    "sources": {}
  }
}
```

A skip carries no `agent`, `model`, `violations`, or `findings`, because no agent ran and nothing judged anything: an empty `findings` array would say a review looked and found nothing. A deletions-only diff uses `reason: "only test deletions in diff; nothing to review"` and adds `deletedFiles`. A skip whose diff held unscorable test artifacts adds `unscorableTestArtifacts` and says so in `reason`. A waived skip gains the waiver fields. The skip shape is declared as `SKIP_KEYS` beside `VERDICT_KEYS`. With `--agent none` the payload is `{ "promptOnly": true, "files": [...], "contextFiles": [...], "contextBasis": "...", "unscorableTestArtifacts": [...] }`.

## Reviewed-files manifest contract

The verdict's `files` manifest comes from the report's own `## Reviewed Files` section: what the agent actually reviewed. `--min-files` evaluates this manifest.

The report itself is strictly validated:

- YAML frontmatter: `workflowType: testarch-test-review`, non-empty `stepsCompleted`
- Matching `**Recommendation**` lines in both the Executive Summary and Decision sections (one of `Approve` / `Approve with Comments` / `Request Changes` / `Block`)
- A bounded `**Quality Score**: N/100`
- A `**Total Violations**` line with all four severity counts
- A `## Quality Score Breakdown` ledger
- The Reviewed Files manifest
- Exactly one `**Context Basis**` line in the Executive Summary, plus a run-bound `## Review Context` manifest whenever the basis is not `none`
- Exactly one `**Context Waivers Applied**: 0` line in the Executive Summary
- Every finding under `## Critical Issues (Must Fix)` / `## Recommendations (Should Fix)` cites a real `**Row**: <id>` whose criteria-registry.md severity matches its own `**Severity**` line; the number of Critical findings documented must equal the Critical count in `**Total Violations**`, the number of P1 (High) findings documented must equal the High count, and the documented Medium and Low findings must not outnumber their counts

Fenced code blocks are stripped first, so a quoted example can't spoof a verdict. Markdown emphasis is stripped only where it wraps a whole value, so `tests/user_profile.spec.ts` survives the manifest intact.

The score is computed rather than trusted. The CLI first evaluates the raw deduction score: `100 - (Critical × 10 + High × 5 + Medium × 2 + Low × 1) + Total Bonus`. It then caps the effective `qualityScore` by the highest finding severity: Critical 69, High 79, Medium 89, Low 99, or 100 with no findings. `rawQualityScore` preserves the uncapped ledger result. `scoreOverrideRule` and `verdictRule` state the exact rules used. The effective score controls the grade and `--min-score` gate.

The bonus is read from the template's `Total Bonus:             +N` line, and a `| Total Bonus | N |` table row is accepted as well, because agents reflow the ledger into a table and a rendering choice should not decide a gate. The published report is normalized to show the raw score, cap, effective score, grade, and verdict rule.

A report declaring Critical violations alongside an approve-type recommendation is rejected as an inconsistent verdict (exit 3): Critical means Must Fix. Stale artifacts are never parsed, output files are deleted before the run and must be freshly written by it.

The `**Total Violations**` summary line is not trusted either. The CLI counts the finding blocks actually documented under `## Critical Issues (Must Fix)` and the P1 (High) ones under `## Recommendations (Should Fix)`, then rejects a report whose summary disagrees with what it wrote (exit 3). This closes a real defect: a report documented a genuine Critical finding in prose while its summary line claimed zero, and the CLI computed Approve at 100/100 from the summary alone.

Exact equality is scoped to Critical and High, the two severities `deriveRecommendation` acts on. Medium and Low are bounded in one direction: a report may summarize a counted Medium finding in prose rather than write a block for it, and may never document more findings than it counted, which would deduct less than its own findings require. [`cli/lib/registry-rows.js`](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/lib/registry-rows.js) reads the row→severity map straight from the skill's own `criteria-registry.md`, so the mapping never drifts from the shipped rubric.

The finding blocks are read exactly once, and both this cross-check and the verdict's `findings` array come out of that single pass. A consumer therefore never has to re-parse the markdown report to learn which defects were found: the verdict is the contract.

## Example workflow

[Example CI workflow](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/examples/pr-test-review.yml) is a copy-paste starting template: one job, full-history checkout, the CLI and agent installed from exactly-pinned npm versions, `--github` for the check run and the comment, and an artifact upload for the report and the verdict JSON. Make the job a required status check to gate merges.

[Adapting it](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/examples/README.md) covers a central reusable-workflows repo, a repo already using a third-party review bot like CodeRabbit, and GitLab.

## Security model

- **Prompt delivery**: `claude`, `codex`, and `custom` receive the complete prompt on stdin, so their prompt does not appear in process arguments. `agy` requires the prompt in its `--print` argument. Its complete prompt can therefore be visible to local process inspection and CI diagnostics; use it only in an appropriately isolated runner.
- **Agent execution**: the `claude` adapter strips repo customizations and limits tools to `Read,Write,Edit,Glob,Grep,Task`. `Task` is delegation, which `step-03-quality-evaluation.md` needs to dispatch its four quality workers in parallel; without it the workflow's capability probe finds no launcher and every run falls back to `sequential`. The `codex` adapter confines its run with `--sandbox workspace-write`. Both are the `scoped-artifact-writes` tier, which is what this CLI runs at; a caller of `cli/lib/run-agent.js` that declares `read-only`, as the fragment-selection eval and `tea-fragment-selection-runner` do, gets `Read,Glob,Grep` and `--sandbox read-only`, with no delegation, and only a `command-execution` declaration adds `Bash`. The `agy` adapter uses `--dangerously-skip-permissions`, with filesystem limits supplied by the CLI's isolation wrapper. A custom runner receives only the arguments supplied at the command line, so its caller owns the equivalent tool and approval policy. Every adapter gets a minimal child environment; only `--env-pass` variables are added. On POSIX, every agent runs in its own process group, and every process left in that group receives SIGKILL when the agent exits. The agent's input and output pass through pipes a supervising process owns, which it closes once the agent has exited and each pipe reaches its end, stays empty for 100 ms, or has been read for 2 s, so output any process writes after that is dropped and a process the agent started outside its group (in a session of its own, say) is not waited for; a custom runner finishes its writes before it exits. On Windows, the guardian joins a kill-on-close Windows Job Object before starting the agent. The agent and its ordinary descendants inherit the job and end when the guardian's lifeline closes or its turn ends; the Windows integration gate gives each PID a 10 s end bound. A failed Job Object setup stops the launch and exits 4.
- **Filesystem isolation**: with `--isolate` (default on in CI) the agent may read the project but can't modify the tree under review; it writes only the report, verdict, and the temp files the workflow's own subagent steps declare (sandbox-exec on macOS, bwrap on Linux, chmod fallback).
- **Control-plane guard**: the default reviewer is the skill packaged with the CLI, outside the checkout, so a PR diff cannot touch it when the CLI is installed outside the checkout. With `--project-skill`, or an explicit `--skill-root` inside the checkout, a PR diff that modifies the vendored skill fails the run closed (exit 2) unless `--files` was explicit. An explicit `--skill-root` outside the checkout is untouchable by the diff.
- **Untrusted-content contract**: reviewed-file and context-file content is data: instructions inside either are defects to report, never commands. Context can raise a finding but never waive one, so a story cannot argue a violation away. Hostile paths (newlines, NUL bytes, delimiter literals) are rejected before they reach the prompt; both lists travel as JSON arrays in their own delimited blocks.
- **Fail-closed parsing**: the strict report schema above; a parse failure is never a silent pass, and inconsistent verdicts (Critical violations with an approve recommendation) are rejected.
