---
title: CI Compatibility Entry
description: Use the CI command to start Framework CI setup
---

# CI Compatibility Entry

CI starts the [Framework skill's CI setup](/docs/how-to/workflows/setup-test-framework.md#ci-setup). Use `/bmad-testarch-ci` in Claude Code, Cursor, or Windsurf, `$bmad-testarch-ci` in Codex, or `CI` in a TEA agent chat. You can also request CI only or both phases through `/bmad-testarch-framework` or `$bmad-testarch-framework`. Existing CI customizations and saved checkpoints keep working.

See [Framework CI setup](/docs/how-to/workflows/setup-test-framework.md#ci-setup) for platforms, preflight execution, pipeline generation, and quality gates, and [evaluation plans](/docs/how-to/workflows/setup-test-framework.md#evaluation-plans) for evaluation jobs.

## Earlier Links

These anchors keep links from earlier versions usable. Open the linked section for the full guidance.

<a id="how-to-set-up-ci-pipeline-with-tea"></a>
[Framework CI Setup](/docs/how-to/workflows/setup-test-framework.md#ci-setup)

<a id="when-to-use-this"></a>
[When to Use This](/docs/how-to/workflows/setup-test-framework.md#ci-when-to-use-this)

<a id="prerequisites"></a>
[Prerequisites](/docs/how-to/workflows/setup-test-framework.md#ci-prerequisites)

<a id="steps"></a>
[Steps](/docs/how-to/workflows/setup-test-framework.md#ci-steps)

<a id="1-run-ci-setup"></a>
[1. Run CI Setup](/docs/how-to/workflows/setup-test-framework.md#ci-1-run-ci-setup)

<a id="2-select-cicd-platform"></a>
[2. Select CI/CD Platform](/docs/how-to/workflows/setup-test-framework.md#ci-2-select-cicd-platform)

<a id="3-configure-test-strategy"></a>
[3. Configure Test Strategy](/docs/how-to/workflows/setup-test-framework.md#ci-3-configure-test-strategy)

<a id="repository-structure"></a>
[Repository Structure](/docs/how-to/workflows/setup-test-framework.md#ci-repository-structure)

<a id="parallel-execution"></a>
[Parallel Execution](/docs/how-to/workflows/setup-test-framework.md#ci-parallel-execution)

<a id="burn-in-loops"></a>
[Burn-In Loops](/docs/how-to/workflows/setup-test-framework.md#ci-burn-in-loops)

<a id="4-review-generated-ci-configuration"></a>
[4. Review Generated CI Configuration](/docs/how-to/workflows/setup-test-framework.md#ci-4-review-generated-ci-configuration)

<a id="github-actions-githubworkflowstestyml"></a>
[GitHub Actions (`.github/workflows/test.yml`):](/docs/how-to/workflows/setup-test-framework.md#ci-github-actions-githubworkflowstestyml)

<a id="gitlab-ci-gitlab-ciyml"></a>
[GitLab CI (`.gitlab-ci.yml`):](/docs/how-to/workflows/setup-test-framework.md#ci-gitlab-ci-gitlab-ciyml)

<a id="burn-in-testing"></a>
[Burn-In Testing](/docs/how-to/workflows/setup-test-framework.md#ci-burn-in-testing)

<a id="option-1-classic-burn-in-playwright-built-in"></a>
[Option 1: Classic Burn-In (Playwright Built-In)](/docs/how-to/workflows/setup-test-framework.md#ci-option-1-classic-burn-in-playwright-built-in)

<a id="option-2-smart-burn-in-playwright-utils"></a>
[Option 2: Smart Burn-In (Playwright Utils)](/docs/how-to/workflows/setup-test-framework.md#ci-option-2-smart-burn-in-playwright-utils)

<a id="5-configure-secrets"></a>
[5. Configure Secrets](/docs/how-to/workflows/setup-test-framework.md#ci-5-configure-secrets)

<a id="6-test-the-ci-pipeline"></a>
[6. Test the CI Pipeline](/docs/how-to/workflows/setup-test-framework.md#ci-6-test-the-ci-pipeline)

<a id="push-and-verify"></a>
[Push and Verify](/docs/how-to/workflows/setup-test-framework.md#ci-push-and-verify)

<a id="test-on-pull-request"></a>
[Test on Pull Request](/docs/how-to/workflows/setup-test-framework.md#ci-test-on-pull-request)

<a id="evaluation-plans"></a>
[Evaluation Plans](/docs/how-to/workflows/setup-test-framework.md#evaluation-plans)

<a id="what-you-get"></a>
[What You Get](/docs/how-to/workflows/setup-test-framework.md#ci-what-you-get)

<a id="automated-test-execution"></a>
[Automated Test Execution](/docs/how-to/workflows/setup-test-framework.md#ci-automated-test-execution)

<a id="parallel-execution-1"></a>
[Parallel Execution](/docs/how-to/workflows/setup-test-framework.md#ci-parallel-execution-1)

<a id="selective-testing"></a>
[Selective Testing](/docs/how-to/workflows/setup-test-framework.md#ci-selective-testing)

<a id="flakiness-detection"></a>
[Flakiness Detection](/docs/how-to/workflows/setup-test-framework.md#ci-flakiness-detection)

<a id="artifact-collection"></a>
[Artifact Collection](/docs/how-to/workflows/setup-test-framework.md#ci-artifact-collection)

<a id="tips"></a>
[Tips](/docs/how-to/workflows/setup-test-framework.md#ci-tips)

<a id="start-simple-add-complexity"></a>
[Start Simple, Add Complexity](/docs/how-to/workflows/setup-test-framework.md#ci-start-simple-add-complexity)

<a id="optimize-for-feedback-speed"></a>
[Optimize for Feedback Speed](/docs/how-to/workflows/setup-test-framework.md#ci-optimize-for-feedback-speed)

<a id="use-test-tags"></a>
[Use Test Tags](/docs/how-to/workflows/setup-test-framework.md#ci-use-test-tags)

<a id="monitor-ci-performance"></a>
[Monitor CI Performance](/docs/how-to/workflows/setup-test-framework.md#ci-monitor-ci-performance)

<a id="handle-flaky-tests"></a>
[Handle Flaky Tests](/docs/how-to/workflows/setup-test-framework.md#ci-handle-flaky-tests)

<a id="secure-secrets"></a>
[Secure Secrets](/docs/how-to/workflows/setup-test-framework.md#ci-secure-secrets)

<a id="cache-aggressively"></a>
[Cache Aggressively](/docs/how-to/workflows/setup-test-framework.md#ci-cache-aggressively)

<a id="common-issues"></a>
[Common Issues](/docs/how-to/workflows/setup-test-framework.md#ci-common-issues)

<a id="tests-pass-locally-fail-in-ci"></a>
[Tests Pass Locally, Fail in CI](/docs/how-to/workflows/setup-test-framework.md#ci-tests-pass-locally-fail-in-ci)

<a id="ci-takes-too-long"></a>
[CI Takes Too Long](/docs/how-to/workflows/setup-test-framework.md#ci-ci-takes-too-long)

<a id="burn-in-always-fails"></a>
[Burn-In Always Fails](/docs/how-to/workflows/setup-test-framework.md#ci-burn-in-always-fails)

<a id="out-of-ci-minutes"></a>
[Out of CI Minutes](/docs/how-to/workflows/setup-test-framework.md#ci-out-of-ci-minutes)

<a id="related-guides"></a>
[Related Guides](/docs/how-to/workflows/setup-test-framework.md#ci-related-guides)

<a id="understanding-the-concepts"></a>
[Understanding the Concepts](/docs/how-to/workflows/setup-test-framework.md#ci-understanding-the-concepts)

<a id="reference"></a>
[Reference](/docs/how-to/workflows/setup-test-framework.md#ci-reference)
