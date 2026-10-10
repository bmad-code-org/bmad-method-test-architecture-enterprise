# TEA: Test Engineering Architect

[Documentation](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/) · [Getting started](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/tutorials/tea-lite-quickstart/) · [Contributing](./CONTRIBUTING.md) · [MIT license](./LICENSE)

TEA is a BMad module for test planning, automation, evaluation, and release decisions.
Its agent, Murat, uses eight skills and a shared testing knowledge base to turn requirements and risks into tests and evidence.
You can use TEA on its own or alongside BMad Method.

TEA helps you:

- Plan coverage by risk and priority, from P0 to P3.
- Set up a test framework and CI, write acceptance tests, and expand automation.
- Review test quality against a fixed criteria registry.
- Evaluate skills, agents, and AI features with scored probes and regression checks.
- Trace requirements to evidence and make PASS, CONCERNS, or FAIL release decisions, with waivers recorded separately.

## Install

Install the skills from GitHub:

```bash
npx skills add bmad-code-org/bmad-method-test-architecture-enterprise
```

Setup needs [uv](https://docs.astral.sh/uv/) and the `bmad` and `bmod-core-tools` skills from BMad Method core.
If those skills are missing, install them:

```bash
npx skills add bmad-code-org/BMAD-METHOD --skill bmad bmod-core-tools
```

Then type this in your assistant chat:

```text
bmad setup tea
```

Setup asks about your test stack, integrations, and output folder, then writes the answers to `_bmad/config.toml`.
Run it again to change those answers.
The [configuration reference](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/reference/configuration/) covers team and personal overrides.

The GitHub install follows `main`.
To install a tagged release, replace `<version>` with the release number:

```bash
npx skills add https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/tree/v<version>/skills
```

<a id="start-with-one-workflow"></a>

## Start with one skill

Ten commands start the eight skills: Framework includes CI setup; Automate includes red and expand modes.

In Claude Code, Cursor, and Windsurf, type `/bmad-testarch-test-design` in chat.
In Codex, type `$bmad-testarch-test-design`.
You can also load `/bmad-tea` or `$bmad-tea` and choose a menu code.
Each skill can run directly in a fresh session.

| Skill                                                                                                                           | Command                      | Menu | Use it to                                            |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---- | ---------------------------------------------------- |
| [Automate](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/how-to/workflows/run-automate/)             | `/bmad-testarch-automate`    | TA   | Generate red acceptance scaffolds or expand coverage |
| [Test Review](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/how-to/workflows/run-test-review/)       | `/bmad-testarch-test-review` | RV   | Audit test quality and score findings                |
| [Test Design](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/how-to/workflows/run-test-design/)       | `/bmad-testarch-test-design` | TD   | Plan risks, coverage, and NFR evidence               |
| [Framework](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/how-to/workflows/setup-test-framework/)    | `/bmad-testarch-framework`   | TF   | Set up a test framework, CI, or both                 |
| [NFR](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/how-to/workflows/run-nfr-assess/)                | `/bmad-testarch-nfr`         | NR   | Audit implemented NFR evidence                       |
| [Trace](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/how-to/workflows/run-trace/)                   | `/bmad-testarch-trace`       | TR   | Map requirements to tests and decide a release gate  |
| [Teach Me Testing](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/how-to/workflows/teach-me-testing/) | `/bmad-teach-me-testing`     | TMT  | Learn testing through seven sessions                 |

Evaluate:

- [Evaluate](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/tutorials/evaluate-your-first-skill/): `/bmad-testarch-evaluate`, menu `EV`. Build and run a behavioral evaluation.

Framework and CI setup share one skill, `bmad-testarch-framework`.
Ask for framework only, CI only, or both; TEA infers the scope from your prompt and asks "Do you want CI too?" once when CI scope is unclear in an interactive session. An unattended request with unclear scope runs framework setup only and states that CI was excluded.
`/bmad-testarch-ci` and the `CI` menu code still work and start the same skill's CI setup, with your existing CI customizations.
Create, Resume, Validate, and Edit remain available for the selected setup scope.

Automation uses `red` mode before implementation and `expand` mode for existing code. Your prompt selects the mode. `/bmad-testarch-atdd` and `AT` default to red; `/bmad-testarch-automate` and `TA` default to expand. Existing commands and customization files keep working. Create runs execute the generated tests and repair test issues for up to three rounds. Red confirms the intended missing behavior; expand aims for passing coverage and reports product defects.

For Codex, replace the leading `/` in the table with `$`.
The agent menu also accepts `GATE` to route you through test review, NFR evidence audit, and trace Phase 2.

Choose a starting path:

- [TEA Lite](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/tutorials/tea-lite-quickstart/) for an existing project that needs more test coverage.
- [TEA Academy](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/tutorials/learn-testing-tea-academy/) to learn testing.
- [TEA Overview](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/explanation/tea-overview/) for the lifecycle and skill order.
- [Evaluate Your First Skill](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/tutorials/evaluate-your-first-skill/) for a runnable evaluation tutorial.

## How it works

Each skill loads one step file at a time.
The steps define the task, the evidence to collect, and when to stop.
They load the knowledge fragments needed for that task from `skills/bmod-tea/knowledge/tea-index.csv`.
Skills can delegate independent tasks when the assistant supports workers; execution mode is configurable.

Review findings use fixed criteria and severity rules.
Trace applies coverage thresholds and evidence checks to the release decision.
Generated tests and reports still need review, and a release gate depends on the evidence collected.
See [step-file architecture](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/explanation/step-file-architecture/), [test quality standards](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/explanation/test-quality-standards/), and [risk-based testing](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/explanation/risk-based-testing/).

Planning and traceability work across stacks.
Test generation and execution support vary by target.
The [execution-target matrix](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/reference/execution-targets/) lists the supported stacks and their limits.

## Command-line tools

TEA also publishes an npm package for CI and terminal use.
It requires Node.js 22.20.0 or later:

```bash
npm install --save-dev bmad-method-test-architecture-enterprise
```

- [`tea-teach`](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/reference/tea-teach-cli/) teaches one learner turn and keeps conversation and session progress.
- [`tea-test-review`](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/reference/tea-test-review-cli/) runs the review skill against changed tests and returns a gate verdict.
- [`tea-evaluate`](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/reference/tea-evaluate-cli/) checks, runs, scores, and compares behavioral evaluations.

For `tea-evaluate`, install `eval-quality` alongside TEA in the evaluations folder:

```bash
npm install --prefix evals bmad-method-test-architecture-enterprise eval-quality
npm exec --prefix evals -- tea-evaluate --help
```

The npm package includes the skills used by the tools.
See the [CI examples](./cli/examples/README.md) for test-review integration.

## Contributing

[CONTRIBUTING.md](./CONTRIBUTING.md) covers local checks, pull requests, and publishing.
[How TEA Is Tested](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/explanation/how-tea-is-tested/) explains the test and evaluation layers.
The [test suite guide](./test/README.md) has commands for running individual suites and live evaluations.

## Community

- [Discord](https://discord.gg/gk8jAdXWmj) for help and discussion.
- [GitHub Issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues) for bugs and feature requests.
- [YouTube](https://youtube.com/@BMadCode) for tutorials.
- [BMad website](https://bmadcode.com) and [X](https://x.com/BMadCode).

You can support BMad by starring the repository, [buying a coffee](https://buymeacoffee.com/bmad), or contacting [contact@bmadcode.com](mailto:contact@bmadcode.com) about sponsorship.

## License

[MIT](./LICENSE).
