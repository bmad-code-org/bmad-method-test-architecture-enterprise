---
title: 'Run Test Review in CI'
description: 'Gate pull requests on a headless Test Review with GitHub Actions, GitLab or any other CI'
---

# Run Test Review in CI

Make Test Review a required check on every pull request. The job installs `tea-test-review` and an agent CLI, supplies the agent's credentials from a CI secret, and runs one command. The job's exit code is the verdict.

You choose the agent and the gate policy. The [tea-test-review CLI reference](/docs/reference/tea-test-review-cli.md) lists the flags, exit codes and verdict schema.

Before you start:

- Check out the full history; the review diffs changed test files against the base ref.
- Store the agent's credential as a CI secret. The templates use `--agent claude` with `ANTHROPIC_API_KEY`. A Codex runner has no interactive login, so follow the `--agent codex` note in the [prerequisites](/docs/reference/tea-test-review-cli.md#prerequisites) first.
- Pin both installs to published versions you vetted. The templates pin TEA `3.1.0` and Claude Code `2.1.220`. The installed CLI is the reviewer's control plane, and an unpublished version fails the install.

## GitHub Actions

The [`tea-test-review` GitHub Action](https://github.com/muratkeremozcan/tea-test-review) is the shortest route. One `uses: muratkeremozcan/tea-test-review@v3` step checks out the pull request, installs TEA and the agent CLI, runs the review, posts the comment and check run, and uploads the report. Copy its proven [Claude](https://github.com/muratkeremozcan/tea-test-review#claude) or [Codex](https://github.com/muratkeremozcan/tea-test-review#codex) workflow, and pin `tea-version` and `claude-code-version` or `codex-version` in its `with:` block to versions you vetted; the agent CLI versions default to `latest`. To also start a review from a pull request comment, add the `issue_comment` trigger to the workflow; a `@mention` then runs the review behind a trusted-author gate ([setup](https://github.com/muratkeremozcan/tea-test-review#trigger-the-review-from-a-pr-comment)).

To own the job yourself, start from the template. [`cli/examples/pr-test-review.yml`](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/examples/pr-test-review.yml) is the tested template, with the gate-policy flags annotated. It is one job with `contents: read`, `pull-requests: write` and `checks: write`, a full-history checkout, a skip for fork pull requests (forks receive no secrets), the pinned installs, and an artifact upload for the report and the verdict. Its review step is:

```bash
tea-test-review --github --pr "$PR_NUMBER" --artifact-name tea-test-review --output test-review.md --json test-review.json
```

`--github` opens a check run before the review starts, closes it with the verdict, and keeps one comment on the pull request up to date. Make the job a required status check to gate merges.

## GitLab

GitLab has no `--github` equivalent: the CLI writes the comment text, and the job posts it. The job is [`cli/examples/gitlab-ci.yaml`](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/examples/gitlab-ci.yaml). Its core keeps the review's exit code while still posting the comment:

```bash
git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
status=0
tea-test-review --base "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" --agent claude \
  --run-url "$CI_JOB_URL" --artifact-name tea-test-review \
  --output test-review.md --json test-review.json --comment-out tea-comment.md || status=$?
# post tea-comment.md as a merge request note, then:
exit "$status"
```

`--base` names the merge request's target branch, and `--run-url` and `--artifact-name` let the comment link the job and its artifact. `--comment-out` is written for every outcome, including a run that produced no verdict, so a broken gate is posted too.

## Jenkins, Buildkite and other CIs

Run the GitLab command above with your CI's own base branch and job URL, then publish the `tea-comment.md` that `--comment-out` writes wherever the pull request lives. A GitHub repository on Jenkins or Buildkite passes `--github` and a `GITHUB_TOKEN`, plus `--pr <number>` and `--repo <owner/name>` when the job has no `GITHUB_*` variables. `--head-sha`, `--run-url` and `--check-name` fill in what a non-Actions run does not carry.

## Read the result

Exit `0` is a pass, a skip or a waived failure, and `1` a failed verdict. Exits `2` and `3` mean the gate itself broke and can never be waived; with `--github` or `--comment-out` they reach the pull request as a "Broken gate" comment. Causes: [exit codes](/docs/reference/tea-test-review-cli.md#exit-codes).

A passing gate means the changed tests met the rubric the CLI scored. It does not show that the tests cover the change; [Trace](/docs/how-to/workflows/run-trace.md) answers that.
