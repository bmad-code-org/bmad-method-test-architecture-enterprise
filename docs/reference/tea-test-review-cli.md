---
title: 'tea-test-review CLI'
description: 'Headless CI runner for the bmad-testarch-test-review skill: flags, exit codes, JSON verdict schema, and security model'
---

# tea-test-review CLI

`tea-test-review` is a headless runner for the [Test Review](/docs/how-to/workflows/run-test-review.md) workflow (`bmad-testarch-test-review`). It splits a pull request's diff into the test files to review and the rest of the change to read as context, drives the skill non-interactively, parses the resulting `test-review.md` against a strict schema, and emits a JSON verdict with a CI-friendly exit code.

The skill is the source of truth for all review logic (checklist, scoring, report template). The CLI only resolves the skill, scopes the review, runs the agent, parses the report. How it's built: [Test Review CLI Architecture](/docs/explanation/test-review-cli-architecture.md).

## Prerequisites

- Node.js 20+, with the `tea-test-review` bin (`npm install --global bmad-method-test-architecture-enterprise`, or via `npx`).
- The `bmad-testarch-test-review` skill present in the workspace **when the CLI runs**. The reviewed repo doesn't need to commit BMAD files or install the TEA module; CI can fetch the skill as a build step (see the [example workflow](#example-workflow)). Two ways to supply it:
  - **Discovered in the project**: probed at `_bmad/tea/workflows/testarch/bmad-testarch-test-review`, `.claude/skills/bmad-testarch-test-review`, `.agents/skills/bmad-testarch-test-review`. Local-dev case.
  - **Pinned with `--skill-root <path>`** (recommended for CI): unpack from a pinned npm tarball, point `--skill-root` at it. Reviewer never comes from the PR checkout.
- For `--agent claude` (default): the `claude` CLI on `PATH`, authenticated via subscription/keychain login or `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN` in the environment.
- For `--agent codex`: the `codex` CLI on `PATH`, authenticated via `codex login`, which stores credentials in `$HOME/.codex/auth.json`. **`OPENAI_API_KEY` in the environment is not enough**: codex 0.146.0 never reads it, and a run with only that variable set sends no credential at all and fails with `401 ... Missing bearer or basic authentication in header`. On a machine with no interactive login, such as any CI runner, write the auth file first with `printenv OPENAI_API_KEY | codex login --with-api-key`.

## Run it locally

Install the CLI once. This adds the `tea-test-review` command to your `PATH`; it does not install the TEA module into any project, and it leaves an existing `claude` or `codex` install alone.

```bash
npm install --global bmad-method-test-architecture-enterprise@latest
```

**If the project already has the TEA module** (any of the three probed locations above), that is the whole setup. Run it from the project root against the files you want reviewed:

```bash
tea-test-review \
  --agent codex \
  --files playwright/tests/api/checkout.spec.ts \
  --output /tmp/tea-review.md \
  --json /tmp/tea-review.json
```

**If it doesn't**, point `--skill-root` at the copy that shipped with the CLI. The global install includes the skill, so nothing else has to be fetched:

```bash
export TEA_SKILL="$(npm prefix -g)/lib/node_modules/bmad-method-test-architecture-enterprise/src/workflows/testarch/bmad-testarch-test-review"

tea-test-review --agent codex --skill-root "$TEA_SKILL" --files tests/checkout.spec.ts
```

Three things worth knowing before the first run:

- **Use `--files` for uncommitted work.** The default scoping is `git diff <base>...HEAD`, which only sees committed changes. Once the tests are committed, drop `--files` and use `--base main` to exercise the real pull-request scoping.
- **It prints nothing while the agent works,** which can take several minutes. Pipe through `tee` if you want a file to watch.
- **`--agent none` costs nothing.** It prints the prompt bundle and exits without spawning an agent, which is the fastest way to confirm the skill resolved and the right files are in the review set.

Authentication is whatever your agent CLI already uses. A `claude` or `codex` subscription login stored under `$HOME` is passed through and needs no API key. For claude, the key variables in Prerequisites work as a fallback; for codex they do not, so see the `--agent codex` note above before running anywhere without an interactive login.

## Try it in CI

The fastest path is the standalone [`tea-test-review` action](https://github.com/muratkeremozcan/tea-test-review), which wraps everything below into one step: it unpacks the skill from a pinned npm tarball outside the checkout, installs the CLI and agent, runs the review, and upserts the report as a single pull-request comment.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0 # the review diffs changed test files against the base ref
    persist-credentials: false

- uses: muratkeremozcan/tea-test-review@<sha>
  with:
    agent: codex
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

The job needs `contents: read` and `pull-requests: write`, and forks receive no secrets, so guard it with `if: github.event.pull_request.head.repo.full_name == github.repository`. Prefer the copy-paste workflow under [Example workflow](#example-workflow) instead when you want the two-job shape in your own repository rather than a third-party action.

## Flags

| Flag                                                   | Default                                    | Purpose                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `--base <ref>`                                         | `origin/main`                              | Git base ref to diff changed files.                                                                                               |
| `--files <list>`                                       | -                                          | Explicit review set (repeatable, comma-separated); skips the git diff and test-file filter.                                       |
| `--scope <scope>`                                      | derived                                    | `review_scope` override (`single` \| `directory` \| `suite`); default `single` for one file, else `directory`.                    |
| `--test-dir <dir>`                                     | `tests`                                    | `test_dir` hint passed to the skill.                                                                                              |
| `--test-glob <substring-or-regex>`                     | -                                          | Extra test-file matcher (substring or `/regex/`, repeatable).                                                                     |
| `--project-root <dir>`                                 | current directory                          | Consuming project root.                                                                                                           |
| `--skill-root <path>`                                  | probe the project                          | Trusted skill root (must contain `SKILL.md`); skips the install probe. Outside `--project-root`, the control-plane guard is moot. |
| `--output <file>`                                      | `test-review.md`                           | Report path the agent writes.                                                                                                     |
| `--json <file>`                                        | -                                          | Also write the verdict JSON here.                                                                                                 |
| `--agent <agent>`                                      | `claude`                                   | `claude` or `codex` spawn the matching CLI via its adapter (`cli/lib/agent-adapters.js`); `none` prints the prompt only.          |
| `--model <model>`                                      | `claude`: `sonnet`, `codex`: `gpt-5.6-sol` | Model the agent runs on. Overrides whatever the vendor CLI would pick from its own config. Rejected with `--agent none`.          |
| `--agent-cmd <path>`                                   | the selected adapter's command             | Override the agent executable; the selected `--agent` adapter's argv/env still apply (advanced).                                  |
| `--claude-arg <arg>`                                   | -                                          | Extra argument appended to the selected agent's argv (repeatable; name predates multi-vendor support).                            |
| `--env-pass <NAME>`                                    | -                                          | Env var allowed through beyond the default set (repeatable).                                                                      |
| `--timeout-ms <n>`                                     | `1800000` (30 min)                         | Agent wall-clock timeout (SIGTERM on expiry).                                                                                     |
| `--min-score <n>`                                      | -                                          | Fail when the quality score is below `n` (0-100).                                                                                 |
| `--max-critical <n>`                                   | no cap                                     | Fail when Critical violations exceed `n`.                                                                                         |
| `--min-files <n>`                                      | `1`                                        | Fail when fewer than `n` files are reviewed.                                                                                      |
| `--fail-on <level>`                                    | `request-changes`                          | Weakest recommendation that fails CI.                                                                                             |
| `--fail-on-skip`                                       | off                                        | Exit 1 instead of 0 on skip (no changed test files).                                                                              |
| `--waive <reason>`                                     | -                                          | Waive a fail (exit 0), record the reason; requires `--waive-until`. Exit 2/3 never waivable.                                      |
| `--waive-until <YYYY-MM-DD>`                           | -                                          | Waiver expiry; must be a real future calendar date.                                                                               |
| `--isolate` / `--no-isolate`                           | isolated when `CI` is set                  | Run the agent under filesystem isolation.                                                                                         |
| `--use-playwright-utils` / `--no-use-playwright-utils` | resolved (below)                           | Force `tea_use_playwright_utils`.                                                                                                 |
| `--use-pactjs-utils` / `--no-use-pactjs-utils`         | resolved (below)                           | Force `tea_use_pactjs_utils`.                                                                                                     |
| `--pact-mcp <mode>`                                    | resolved (below)                           | Force `tea_pact_mcp` (`mcp` \| `none`).                                                                                           |

## What the review is judged against

A spec judged with no idea what changed underneath it is a spelling check. So the diff produces two lists, not one:

- **The review set** is every changed file matching the test-file rules. It is scored against the deduction ledger and reported in `## Reviewed Files`.
- **The context set** is everything else in the diff: the story, the PRD, the test design, the changed source. It is read so the reviewer can tell whether the tests match what changed, and it is never scored.

There is no flag for any of this. If the story is in the pull request, it is in the diff, so it gets read. The set excludes lockfiles, snapshots, and binary assets, orders documentation ahead of source, and caps at 40 files so a large pull request cannot exhaust the agent.

The report must publish what it had, as `**Context Basis**: none | pr_diff | pr_diff_truncated` in the Executive Summary, backed by a `## Review Context` manifest whenever the basis is not `none`. `none` is the honest outcome for a tests-only diff or an explicit `--files` list, and it keeps an Approve readable as "these tests are well built" rather than "these tests match the story".

Three rules hold the boundary. The prompt states them and the parser enforces them:

- **The manifests are disjoint.** A path in both `## Reviewed Files` and `## Review Context` is rejected (exit 3). Scoring a story or a controller against a test-quality rubric produces a number that means nothing.
- **The manifests are bound to the run.** Paths are canonicalized before comparison. `## Reviewed Files` must equal the authoritative review set. `## Review Context` can only name supplied context, and it must equal the supplied set when the report claims the supplied basis.
- **Context raises findings, never waives them.** It can catch a test that contradicts its acceptance criteria or a changed code path with no assertion on it. It can never waive a violation, lower a severity, or move the score. Context is untrusted content in exactly the way reviewed files are, and it is prose from the same author as the change, so a story claiming a bad practice is acceptable here is itself a finding.

A report claiming more evidence than the run supplied (`pr_diff` when the CLI supplied `none`) is rejected as exit 3. Claiming less is allowed: a reviewer that ignored its context is a quality problem visible in the report. The Executive Summary also declares `**Context Waivers Applied**: 0`; any nonzero value is rejected.

## Which model does the reviewing

Vendor-agnostic is not model-agnostic. A score is a judgment, and the thing making the judgment is an input to the gate like any other.

Left unstated, the model is whatever the vendor CLI resolves for itself: `~/.codex/config.toml` or `~/.claude/settings.json` on a developer machine, and the vendor's built-in default on a CI runner, which has neither file. The same pull request would then be reviewed by one model locally and a different one in CI, and the CI one would move whenever the vendor shipped a new default. So each adapter pins a model, and `--model` overrides it:

| `--agent` | Pinned default | Set with          |
| --------- | -------------- | ----------------- |
| `claude`  | `sonnet`       | `--model <model>` |
| `codex`   | `gpt-5.6-sol`  | `--model <model>` |

The resolved model travels in the verdict JSON as `model`, alongside `agent`, so a stored verdict says what produced it. A model supplied through `--claude-arg` becomes the resolved value too. Combining `--model` with a passthrough model, or declaring multiple passthrough models, is rejected before spawn. Two scores are only comparable when those two fields match.

The pinned values are aliases: they hold the tier steady, not the exact weights. Pass a fully-qualified slug to `--model` when a run has to be reproducible across model generations.

`--model` is rejected with `--agent none`, which runs no agent. Honoring it there would be a lie, and quietly dropping it is the failure mode `--model` exists to remove.

**Codex reasoning effort is a second unstated input, and it is not pinned here.** A local `model_reasoning_effort = "max"` costs about ten extra seconds even on a one-word prompt, and far more on a real review. It is codex-only, so it gets no vendor-agnostic flag; set it per run with `--claude-arg -c --claude-arg model_reasoning_effort=low`.

## TEA config resolution

Four config keys pick which knowledge fragments load: Playwright Utils profile, `pactjs-utils` set, Pact MCP, and browser evidence (`tea_browser_automation`). The CLI states all four in the prompt: an unstated key is a key the agent decides itself, and identical files could then review against different knowledge.

The headless contract fixes browser evidence to `tea_browser_automation=none`, plus a separate execution-mode key to `tea_execution_mode=sequential`. The other three fragment keys resolve by precedence, highest first:

1. Explicit flag (`--use-pactjs-utils`, `--no-use-playwright-utils`, `--pact-mcp mcp`)
2. `<project-root>/_bmad/tea/config.yaml` (written by `npx bmad-method install`)
3. Module default from `src/module.yaml`: `tea_use_playwright_utils: true`, `tea_use_pactjs_utils: false`, `tea_pact_mcp: none`

A missing `config.yaml` is normal: CI installs the skill without running the interactive installer, so no config file is expected. Content that exists but is invalid is an error (exit 2): non-boolean `tea_use_*`, a `tea_pact_mcp` outside the enum, unparseable YAML, or a non-mapping file. Quoted booleans (`'true'`, `'false'`) are coerced.

**In CI, state what you need.** A contract-testing repo gets `tea_use_pactjs_utils: false` by default, loads `contract-testing.md` instead of the `pactjs-utils-*`/`pact-*` fragments, and won't flag a missing determinism gate. Commit `_bmad/tea/config.yaml` or pass `--use-pactjs-utils`.

## Exit codes

| Code | Meaning                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | Review passed, was skipped, or a verdict failure was waived.                                                                                                       |
| `1`  | Review verdict fail: failing recommendation, `--min-score`, `--max-critical`, `--min-files`, `--fail-on-skip`, or a deletions-only diff, without an active waiver. |
| `2`  | Environment or config error: skill not found, invalid flags, unsafe paths, git diff failure, or the control-plane guard.                                           |
| `3`  | Agent or parse failure: agent errored, wrote no fresh report, or the report failed strict validation.                                                              |

### Waived semantics

`--waive <reason> --waive-until <YYYY-MM-DD>` turns any exit-1 outcome into exit `0`, adds `waived: true`, `waiveReason`, `waiveUntil` to the verdict, and prints a `WAIVED` banner to stdout. Exit codes 2 and 3 are **never** waivable: a broken gate or an unparseable report is not a verdict.

## JSON verdict schema

A passing review (also written to `--json <file>` when given):

```json
{
  "report": "test-review.md",
  "files": ["tests/checkout.spec.ts"],
  "agent": "claude",
  "model": "sonnet",
  "recommendation": "Approve",
  "qualityScore": 92,
  "violations": { "critical": 0, "high": 1, "medium": 2, "low": 3 },
  "reviewedFiles": ["tests/checkout.spec.ts"],
  "contextBasis": "pr_diff",
  "contextFiles": ["docs/stories/checkout-decline.md", "src/checkout/payment.ts"],
  "contextWaiversApplied": 0,
  "keyStrengths": ["Fully deterministic, no conditional branching or timing dependencies"],
  "keyWeaknesses": ["Missing explicit test IDs on two test cases"]
}
```

`contextWaiversApplied` is strict and always `0`. `keyStrengths` and `keyWeaknesses` are best-effort, pulled from the report's Executive Summary bullet lists for PR-comment display; they're not part of the gating contract, a report that omits them still passes or fails on its own merits and the fields just come back as `[]`.

A failing verdict adds `gateFailures` (machine-readable reasons, e.g. `"insufficient evidence: 1 files reviewed (3 required)"`); a waived failure adds `waived`, `waiveReason`, `waiveUntil`.

A skipped review (no changed test files):

```json
{
  "skipped": true,
  "reason": "no changed test files in diff",
  "recommendation": null,
  "qualityScore": null,
  "files": [],
  "contextBasis": "none",
  "contextFiles": []
}
```

A skip carries no `agent` or `model`, because no agent ran and nothing judged anything. A deletions-only diff uses `reason: "only test deletions in diff; nothing to review"` and adds `deletedFiles`. A waived skip gains the waiver fields. With `--agent none` the payload is `{ "promptOnly": true, "files": [...], "contextFiles": [...], "contextBasis": "..." }`.

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

Fenced code blocks are stripped first, so a quoted example can't spoof a verdict. Markdown emphasis is stripped only where it wraps a whole value, so `tests/user_profile.spec.ts` survives the manifest intact.

The score is recomputed rather than trusted: the CLI evaluates `100 - (Critical × 10 + High × 5 + Medium × 2 + Low × 1) + Total Bonus` against the report's own violation counts, and rejects a score that contradicts its breakdown, a bonus total outside the legal multiples of 5 from 0 to 30, or a missing breakdown section. The prompt states this same arithmetic.

A report declaring Critical violations alongside an approve-type recommendation is rejected as an inconsistent verdict (exit 3): Critical means Must Fix. Stale artifacts are never parsed, output files are deleted before the run and must be freshly written by it.

## Example workflow

[Example CI workflow](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/examples/pr-test-review.yml) is a copy-paste starting template: two jobs (review + PR comment), full-history checkout, skill and CLI installed from an exactly-pinned npm version, `--skill-root "$GITHUB_WORKSPACE/_bmad/tea/workflows/testarch/bmad-testarch-test-review"`, artifacts uploaded for both report and verdict JSON, and a find-and-update PR comment that distinguishes pass, fail, skip, and infrastructure failure. Make the `review` job a required status check to gate merges.

The comment carries the score/recommendation/violations digest plus up to three `keyWeaknesses` bullets, and inlines the full report in a collapsed `<details>` block (falling back to an artifact link alone above ~40,000 characters, GitHub's comment body cap is 65,536) so a reviewer can paste it straight into an AI coding agent to apply the fixes.

[Adapting it](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/examples/README.md) covers two common real-world shapes: a central reusable-workflows repo, and a repo already using a third-party review bot like CodeRabbit.

## Security model

- **Stdin prompt delivery**: the prompt travels to the agent on stdin, never argv, so it can't leak through process lists.
- **Safe-mode agent execution**: `--safe-mode` (repo customizations stripped), a restricted tool set (`Read,Write,Edit,Glob,Grep`), a minimal child environment; only `--env-pass` variables are added.
- **Filesystem isolation**: with `--isolate` (default on in CI) the agent may read the project but can't modify the tree under review; it writes only the report, verdict, and the temp files the workflow's own subagent steps declare (sandbox-exec on macOS, bwrap on Linux, chmod fallback).
- **Control-plane guard**: a PR diff that modifies the vendored skill fails the run closed (exit 2) unless `--files` was explicit. An explicit `--skill-root` outside the checkout is untouchable by the diff.
- **Untrusted-content contract**: reviewed-file and context-file content is data: instructions inside either are defects to report, never commands. Context can raise a finding but never waive one, so a story cannot argue a violation away. Hostile paths (newlines, NUL bytes, delimiter literals) are rejected before they reach the prompt; both lists travel as JSON arrays in their own delimited blocks.
- **Fail-closed parsing**: the strict report schema above; a parse failure is never a silent pass, and inconsistent verdicts (Critical violations with an approve recommendation) are rejected.
