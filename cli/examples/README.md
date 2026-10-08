# CLI examples

`pr-test-review.yml` is the full annotated GitHub Actions template, start there. `gitlab-ci.yaml` is the same review on GitLab merge requests. The sections below cover real adaptations.

## A central reusable-workflows repo

Some orgs centralize CI logic: one repo owns `workflow_call` workflows, consuming repos call them. If that repo already has a comment-triggered `@claude` reviewer (opt-in, advisory, fired from `issue_comment`), don't graft TEA onto it. TEA needs to run on every PR automatically and gate merges, a different job than an on-demand advisory review. Add it as its own workflow pair, same shape as whatever pattern you already use:

- **Reusable workflow** (central repo, e.g. `rwf-tea-test-review.yml`): copy the `review` job from `pr-test-review.yml` into a `workflow_call` workflow. `--github` already publishes the comment and the check run from that one job. Promote `--min-score`, `--max-critical`, `--min-files`, and the pinned `TEA_VERSION` to `inputs:`, and the Anthropic key to a required secret.
- **Caller** (each consuming repo, or the central repo itself for dogfooding): a thin `pull_request`-triggered workflow that does `uses: <org>/<central-repo>/.github/workflows/rwf-tea-test-review.yml@<ref>`.

Keep the trigger on `pull_request`. That's what makes it a required check: it runs automatically, no one has to remember to summon it.

```yaml
# rwf-tea-test-review.yml (central repo): only what differs from pr-test-review.yml
on:
  workflow_call:
    inputs:
      min_score: { type: number, required: false, default: 80 }
    secrets:
      anthropic_api_key:
        required: true
jobs:
  review:
    # ...same steps as pr-test-review.yml's `review` job, including its env block
    # (GITHUB_TOKEN: ${{ github.token }} and PR_NUMBER: ${{ github.event.pull_request.number }})...
    run: tea-test-review --github --pr "$PR_NUMBER" --min-score ${{ inputs.min_score }} --agent claude --artifact-name tea-test-review --output test-review.md --json test-review.json
```

```yaml
# .github/workflows/tea-test-review.yml (caller, per consuming repo)
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  tea-test-review:
    # A reusable workflow's token is limited by the caller's job permissions, and a
    # permission that is missing only shows up as a warning that nothing was published.
    permissions:
      contents: read
      pull-requests: write
      checks: write
    uses: <org>/<central-repo>/.github/workflows/rwf-tea-test-review.yml@v1
    with:
      min_score: 80
    secrets:
      anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

## A repo already using a third-party review bot (CodeRabbit, etc.)

Third-party review bots are configured entirely through their own SaaS-side file, there's no hook in there for invoking an external CLI. Leave that file alone. Add a new, independent `pull_request`-triggered workflow (same shape as `pr-test-review.yml`) next to it.

The two don't compete. Check whether the bot's config sets a required commit status or a request-changes gate. If it doesn't (most default/free configs are advisory-only, commenting on the diff without blocking merges), TEA test-review can be the actual required check that config deliberately leaves open, scoped specifically to test quality rather than the whole diff.

Adjust flags to your layout, for example a monorepo with tests outside the default directory:

```yaml
run: tea-test-review --github --pr "$PR_NUMBER" --test-dir playwright --min-score 80 --agent claude --artifact-name tea-test-review --output test-review.md --json test-review.json
```
