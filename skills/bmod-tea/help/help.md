# Test Architect knowledge

This document covers the skills of the `tea` module: what each one gives the user, when to recommend it, and what to offer next. Full documentation: <https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/llms.txt>

## The skills

- `bmad-tea`: Murat, the Master Test Architect, for risk-based test strategy, fixture architecture, API, UI, mobile and contract testing, and release gates. Recommend him when the user wants testing advice or does not know which TEA workflow fits; he routes to the rest.
- `bmad-teach-me-testing`: teaches testing fundamentals in 7 sessions (TEA Academy), with a progress file, session notes and a completion summary. Recommend it to someone learning testing, at any phase.
- `bmad-testarch-test-design`: risk-based test planning, producing a test design document. Recommend it during solutioning, before tests or a framework exist. Afterwards offer `bmad-testarch-framework`.
- `bmad-testarch-framework`: owns production-ready framework and CI setup, with framework-only, CI-only, or both scope. It installs Playwright Utils or Pact.js Utils when enabled. Recommend it during solutioning, after test design. Ask “Do you want CI too?” once when CI intent is unclear.
- `bmad-testarch-ci`: compatibility entry to the canonical framework skill with CI scope preset. It keeps legacy customizations and checkpoints and offers framework setup in the same run when a framework is missing.
- `bmad-testarch-atdd`: writes failing (red-phase) acceptance tests and an ATDD checklist before a story is implemented. Recommend it after a story is created. Afterwards offer the dev story skill.
- `bmad-testarch-automate`: expands test coverage into a test suite. Recommend it during implementation, after ATDD or once code exists.
- `bmad-testarch-evaluate`: builds and runs a scored, evidence-backed evaluation of an agent, skill, workflow or tool-use system. Recommend it after automation when the target's behavior needs proof. Afterwards offer `bmad-testarch-ci` to enforce it.
- `bmad-testarch-test-review`: audits test quality with a 0-100 score and a review report. Recommend it after tests are written. Afterwards offer `bmad-testarch-trace`.
- `bmad-testarch-nfr`: audits the evidence for non-functional requirements and writes an NFR report. Recommend it after automation, before a release.
- `bmad-testarch-trace`: maps requirements to tests in a traceability matrix and makes the PASS, CONCERNS, FAIL or WAIVED gate decision. Recommend it after test review, for the release gate.

For a release gate, the order is: `bmad-testarch-test-review` (optional), `bmad-testarch-nfr` (optional), then `bmad-testarch-trace`.

## Where things land

Every workflow writes under the test artifacts folder, chosen at setup as `modules.tea.test_artifacts`. Evaluate writes evaluation folders under `evals/` by default; a team changes that with `evaluations_folder` in `_bmad/custom/bmad-testarch-evaluate.toml`. `bmad setup tea` shows and changes the setup answers.

## More detail

This document should be enough to route the user. Read a topic file only when the question is about its subject.

| Topic file             | Read when the user asks about                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `help/integrations.md` | What a TEA setup answer does, or installing Playwright Utils, Pact.js Utils, the Playwright CLI or MCP, or the SmartBear MCP |
