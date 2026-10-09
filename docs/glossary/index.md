---
title: 'TEA Glossary'
description: Terminology reference for Test Architect (TEA)
---

Terminology reference for Test Architect (TEA).

## Core Concepts

| Term                      | Definition                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Agent**                 | AI persona with a role, such as analyst, architect, developer, or test architect.                                          |
| **BMad**                  | Breakthrough Method of Agile AI-Driven Development. An AI-assisted development framework with agents and guided workflows. |
| **BMad Method**           | AI-assisted development method covering planning, architecture, implementation, and testing.                               |
| **BMM**                   | BMad Method Module. The development agents and workflows supplied by BMad Method.                                          |
| **Scale-Adaptive System** | Workflow selection that adjusts planning depth to the project.                                                             |
| **Workflow**              | A guided process that uses an AI agent to produce an artifact or complete a task.                                          |

## Scale and Complexity

| Term                        | Definition                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **BMad Method Track**       | Full product planning track using PRD + Architecture + UX. Best for products, platforms, and complex features.                                |
| **Enterprise Method Track** | Extended planning track adding Security Architecture, DevOps Strategy, and Test Strategy. Best for compliance needs and multi-tenant systems. |
| **Planning Track**          | Planning path selected for the scope and complexity of the work.                                                                              |
| **Quick Flow Track**        | Fast implementation track using tech-spec only. Best for bug fixes, small features, and clear-scope changes.                                  |

## Planning Documents

| Term                      | Definition                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture Document** | _BMad Method/Enterprise._ System-wide design document defining structure, components, data models, integration patterns, security, and deployment. |
| **Epics**                 | Groups of related stories that deliver a feature.                                                                                                  |
| **Game Brief**            | _BMGD._ Document capturing game's core vision, pillars, target audience, and scope. Foundation for the GDD.                                        |
| **GDD**                   | _BMGD._ Game Design Document describing mechanics, systems, and content.                                                                           |
| **PRD**                   | _BMad Method/Enterprise._ Product Requirements Document containing vision, goals, FRs, NFRs, and success criteria. Focuses on WHAT to build.       |
| **Product Brief**         | _Phase 1._ Optional strategic document capturing product vision, market context, and high-level requirements before detailed planning.             |
| **Tech-Spec**             | _Quick Flow._ Technical plan covering the problem, solution, file changes, and testing.                                                            |

## Workflow and Phases

| Term                        | Definition                                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 0: Documentation**  | _Brownfield._ Conditional prerequisite phase creating codebase documentation before planning. Only required if existing docs are insufficient. |
| **Phase 1: Analysis**       | Discovery phase including brainstorming, research, and product brief creation. Optional for Quick Flow, recommended for BMad Method.           |
| **Phase 2: Planning**       | Required phase creating formal requirements. Routes to tech-spec (Quick Flow) or PRD (BMad Method/Enterprise).                                 |
| **Phase 3: Solutioning**    | _BMad Method/Enterprise._ Architecture design phase including creation, validation, and gate checks.                                           |
| **Phase 4: Implementation** | Required sprint-based development through story-by-story iteration using sprint-planning, create-story, dev-story, and code-review workflows.  |
| **Quick Spec Flow**         | Fast-track workflow for Quick Flow projects going straight from idea to tech-spec to implementation.                                           |
| **Workflow Init**           | Initialization workflow creating bmm-workflow-status.yaml, detecting project type, and determining planning track.                             |
| **Workflow Status**         | Universal entry point checking for existing status file, displaying progress, and recommending next action.                                    |

## Agents and Roles

| Term                 | Definition                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Analyst**          | Agent that initializes workflows, conducts research, creates product briefs, and tracks progress. Often the entry point for new projects.                           |
| **Architect**        | Agent designing system architecture, creating architecture documents, and validating designs. Primary agent for Phase 3.                                            |
| **BMad Master**      | BMad Core agent that runs party mode and guides work across modules.                                                                                                |
| **DEV**              | Developer agent implementing stories, writing code, running tests, and performing code reviews. Primary implementer in Phase 4.                                     |
| **Game Architect**   | _BMGD._ Agent designing game system architecture and validating game-specific technical designs.                                                                    |
| **Game Designer**    | _BMGD._ Agent creating game design documents (GDD) and running game-specific workflows.                                                                             |
| **Party Mode**       | Multi-agent collaboration feature where agents discuss challenges together. BMad Master orchestrates, selecting 2-3 relevant agents per message.                    |
| **PM**               | Product Manager agent creating PRDs and tech-specs. Primary agent for Phase 2 planning.                                                                             |
| **SM**               | Scrum Master agent managing sprints, creating stories, and coordinating implementation. Primary orchestrator for Phase 4.                                           |
| **TEA**              | Test Engineering Architect. Agent responsible for test strategy, quality gates, NFR planning, and NFR evidence audit. Spans Phase 3, Phase 4, and the release gate. |
| **Technical Writer** | Agent specialized in creating technical documentation, diagrams, and maintaining documentation standards.                                                           |
| **UX Designer**      | Agent creating UX design documents, interaction patterns, and visual specifications for UI-heavy projects.                                                          |

## Status and Tracking

| Term                         | Definition                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **bmm-workflow-status.yaml** | _Phases 1-3._ Tracking file showing current phase, completed workflows, and next recommended actions.            |
| **DoD**                      | Definition of Done. Criteria for completing work, such as passing tests, reviewed code, and updated docs.        |
| **Epic Status Progression**  | `backlog → in-progress → done`.                                                                                  |
| **Gate Check**               | An implementation-readiness review of the PRD, architecture, and epics before Phase 4.                           |
| **Retrospective**            | Workflow after each epic capturing learnings and improvements for continuous improvement.                        |
| **sprint-status.yaml**       | _Phase 4._ Single source of truth for implementation tracking containing all epics, stories, and their statuses. |
| **Story Status Progression** | `backlog → ready-for-dev → in-progress → review → done`.                                                         |

## Project Types

| Term                     | Definition                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Brownfield**           | Existing project with established codebase and patterns. Requires understanding existing architecture and planning integration. |
| **Convention Detection** | _Quick Flow._ Feature auto-detecting existing code style, naming conventions, and frameworks from brownfield codebases.         |
| **document-project**     | _Brownfield._ Workflow analyzing and documenting existing codebase with three scan levels: quick, deep, exhaustive.             |
| **Feature Flags**        | _Brownfield._ Implementation technique for gradual rollout, easy rollback, and A/B testing of new functionality.                |
| **Greenfield**           | New project starting from scratch with freedom to establish patterns, choose stack, and design from clean slate.                |
| **Integration Points**   | _Brownfield._ Specific locations where new code connects with existing systems. Must be documented in tech-specs.               |

## Implementation Terms

| Term                    | Definition                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Context Engineering** | Loading the standards and project facts an AI agent needs for its task.                                                        |
| **Correct Course**      | Workflow that assesses a change during implementation and proposes updates to the plan.                                        |
| **Shard / Sharding**    | Splitting large planning documents into section-based files for LLM optimization. Phase 4 workflows load only needed sections. |
| **Sprint**              | Time-boxed period of development work, typically 1-2 weeks.                                                                    |
| **Sprint Planning**     | Workflow initializing Phase 4 by creating sprint-status.yaml and extracting epics/stories from planning docs.                  |
| **Story**               | A unit of implementable work with acceptance criteria. Related stories form an epic.                                           |
| **Story Context**       | Implementation guidance embedded in story files during create-story, referencing existing patterns and approaches.             |
| **Story File**          | Markdown file containing story description, acceptance criteria, technical notes, and testing requirements.                    |
| **Track Selection**     | Automatic analysis by `bmad` suggesting appropriate track based on complexity indicators. User can override.                   |

## Game Development Terms

| Term                           | Definition                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **Core Fantasy**               | _BMGD._ The experience players seek from the game.                                                   |
| **Core Loop**                  | _BMGD._ The cycle of actions players repeat during play.                                             |
| **Design Pillar**              | _BMGD._ Core principle guiding all design decisions. Typically 3-5 pillars define a game's identity. |
| **Environmental Storytelling** | _BMGD._ Story told through the game world.                                                           |
| **Game Type**                  | _BMGD._ Genre classification determining which specialized GDD sections are included.                |
| **MDA Framework**              | _BMGD._ Mechanics → Dynamics → Aesthetics. A framework for analyzing game design.                    |
| **Meta-Progression**           | _BMGD._ Persistent progression carrying between individual runs or sessions.                         |
| **Metroidvania**               | _BMGD._ Genre featuring interconnected world exploration with ability-gated progression.             |
| **Narrative Complexity**       | _BMGD._ How central story is to the game: Critical, Heavy, Moderate, or Light.                       |
| **Permadeath**                 | _BMGD._ Game mechanic where character death is permanent, typically requiring a new run.             |
| **Player Agency**              | _BMGD._ Degree to which players can make meaningful choices affecting outcomes.                      |
| **Procedural Generation**      | _BMGD._ Generating game content with algorithms.                                                     |
| **Roguelike**                  | _BMGD._ Genre featuring procedural generation, permadeath, and run-based progression.                |

## Test Architect (TEA) Concepts

| Term                               | Definition                                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ATDD**                           | Acceptance Test-Driven Development. Creating red-phase acceptance test scaffolds before implementation.                                                                                                                                  |
| **Behavioral Evaluation Contract** | The `contract.json` of an evaluation folder: the behaviors a target must show and the oracles that judge them. `eval-quality` compiles and seals it before a run.                                                                        |
| **Browser Automation**             | Playwright CLI and/or MCP servers enabling live browser interaction during test generation. CLI provides token-efficient stateless commands; MCP provides rich stateful automation. Configured via `tea_browser_automation`.             |
| **Burn-in Testing**                | Running tests multiple times (typically 5-10 iterations) to detect flakiness and intermittent failures.                                                                                                                                  |
| **CI Setup**                       | The CI phase of `bmad-testarch-framework`. The `bmad-testarch-ci` compatibility command and `CI` menu code select it.                                                                                                                    |
| **Component Testing**              | Testing UI components in isolation using framework-specific tools (Cypress Component Testing or Vitest + React Testing Library).                                                                                                         |
| **Coverage Traceability**          | Mapping coverage oracle items such as requirements, contract endpoints, external pointers, or inferred journeys to implemented tests with classification (FULL/PARTIAL/NONE) to identify gaps and measure completeness.                  |
| **Engagement Model**               | One of five ways to use TEA: No TEA, TEA Solo, TEA Lite, TEA Integrated (Greenfield), or TEA Integrated (Brownfield). Enterprise adds a track to the Integrated models. See [Engagement Models](/docs/explanation/engagement-models.md). |
| **Epic-Level Test Design**         | Test planning per epic (Phase 4) focusing on risk assessment, priorities, and coverage strategy for that specific epic.                                                                                                                  |
| **Evaluate**                       | The `bmad-testarch-evaluate` workflow (menu code `EV`). Builds a scored evaluation, identifies gaps, and hands a CI plan to `ci`. Uses the `tea-evaluate` runtime.                                                                       |
| **Evaluation Folder**              | The folder under the `evaluations_folder` setting that holds one evaluation: `evaluation.json`, the contract, the probes, the corpus, the committed baseline and the CI plan. Every `tea-evaluate` command takes it with `--evaluation`. |
| **Framework Setup**                | The `bmad-testarch-framework` skill. Select framework only, CI only, or both by prompt; unclear CI scope prompts "Do you want CI too?" once. Create, Resume, Validate, and Edit select the operation.                                    |
| **Fixture Architecture**           | Pattern of building pure functions first, then wrapping in framework-specific fixtures for testability, reusability, and composition.                                                                                                    |
| **Gate Decision**                  | The derived release decision: PASS, CONCERNS, or FAIL. A human may grant WAIVED separately; trace validates and reports filed waivers while retaining its derived decision.                                                              |
| **Knowledge Fragment**             | Individual markdown file in TEA's knowledge base covering a specific testing pattern or practice (59 fragments total).                                                                                                                   |
| **Network-First Pattern**          | Registering a network wait or intercept before the action that triggers the request, then waiting for its response.                                                                                                                      |
| **NFR Evidence Audit**             | Validation of non-functional requirement evidence (security, performance, reliability, maintainability) against defined thresholds.                                                                                                      |
| **No TEA**                         | Engagement model 1. Skip all TEA workflows and keep the team's existing testing approach. A valid choice when that approach already works.                                                                                               |
| **Playwright Utils**               | The optional `@seontechnologies/playwright-utils` package of Playwright fixtures and helpers.                                                                                                                                            |
| **Risk-Based Testing**             | Testing approach where depth scales with business impact using probability × impact scoring (1-9 scale).                                                                                                                                 |
| **System-Level Test Design**       | Test planning at architecture level (Phase 3) focusing on testability review, ADR mapping, and test infrastructure needs.                                                                                                                |
| **tea-index.csv**                  | Manifest file tracking all knowledge fragments, their descriptions, tags, tier, and fragment path.                                                                                                                                       |
| **TEA Academy**                    | The `teach-me-testing` workflow (menu code `TMT`): seven sessions with quizzes, saved progress, and examples matched to your role.                                                                                                       |
| **TEA Integrated**                 | Engagement models 4 and 5. Full BMad Method integration with TEA workflows across Phase 2, 3, 4, and the release gate. Greenfield starts from scratch; Brownfield adds a Phase 2 coverage baseline and a regression-hotspot focus.       |
| **TEA Lite**                       | Engagement model 3. Use `automate` on existing features, with `framework` setup when needed.                                                                                                                                             |
| **TEA Solo**                       | Engagement model 2. Standalone use of TEA workflows without BMad Method integration; you bring your own requirements.                                                                                                                    |
| **Test Priorities**                | Classification system for test importance: P0 (critical path), P1 (high value), P2 (medium value), P3 (low value).                                                                                                                       |

---

## See Also

- [TEA Overview](/docs/explanation/tea-overview.md): the ten workflows and the phase lifecycle
- [Evaluate Your First Skill](/docs/tutorials/evaluate-your-first-skill.md): the Evaluate terms above in a first scored run
- [Engagement Models](/docs/explanation/engagement-models.md): the five models defined above
- [TEA Knowledge Base](/docs/reference/knowledge-base.md): fragment index
- [TEA Command Reference](/docs/reference/commands.md): workflow reference
- [TEA Configuration](/docs/reference/configuration.md): config options
