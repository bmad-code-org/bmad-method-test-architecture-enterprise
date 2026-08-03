# CLI examples

`pr-test-review.yml` is the full annotated template, start there. These two cover real adaptations.

## A central reusable-workflows repo

Some orgs centralize CI logic: one repo owns `workflow_call` workflows, consuming repos call them. If that repo already has a comment-triggered `@claude` reviewer (opt-in, advisory, fired from `issue_comment`), don't graft TEA onto it. TEA needs to run on every PR automatically and gate merges, a different job than an on-demand advisory review. Add it as its own pair, same shape as whatever pattern you already use:

- **Reusable workflow** (central repo, e.g. `rwf-tea-test-review.yml`): copy the `review` and `comment` jobs from `pr-test-review.yml` into a `workflow_call` workflow. Promote `--min-score`, `--max-critical`, `--min-files`, and the pinned `TEA_VERSION` to `inputs:`, and the Anthropic key to a required secret.
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
    # ...same steps as pr-test-review.yml's `review` job...
    run: tea-test-review --base "$BASE_REF" --min-score ${{ inputs.min_score }} --agent claude --skill-root "$GITHUB_WORKSPACE/_bmad/tea/workflows/testarch/bmad-testarch-test-review" --output test-review.md --json test-review.json
```

```yaml
# .github/workflows/tea-test-review.yml (caller, per consuming repo)
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  tea-test-review:
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
run: tea-test-review --base "$BASE_REF" --test-dir playwright --min-score 80 --agent claude --skill-root "$GITHUB_WORKSPACE/_bmad/tea/workflows/testarch/bmad-testarch-test-review" --output test-review.md --json test-review.json
```
