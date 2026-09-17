---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - '_bmad-output/planning-artifacts/epics.md'
  - 'test/results/eval-all/latest.json'
  - 'test/evals/suite-manifest.json'
  - 'test/contracts/'
  - 'test/replay/'
  - 'docs/explanation/eval-quality-roadmap.md'
  - 'docs/explanation/eval-quality-adoption-guide.md'
  - 'docs/explanation/eval-quality-command-adapter.md'
  - 'CHANGELOG.md'
---

# TEA Live Eval Remediation

## Overview

This document defines the follow-up work required by the first complete live `eval:all` baseline recorded in TEA 1.27.1.
It leaves the completed 47-story adoption plan unchanged.

## Requirements Inventory

### Functional Requirements

FR1: Preserve the recorded 1.27.1 baseline unchanged.

FR2: Add case-level and repetition-level diagnostics so every failed aggregate identifies the responsible outputs.

FR3: Classify each finding as a TEA workflow defect, model instability, harness defect, corpus defect, or oracle defect before changing code.

FR4: Fix ATDD generation to reach 100% intended-reason failures, 100% criteria coverage, zero non-assertion exits, zero unmapped tests, and zero instability.

FR5: Fix `bmad-tea` routing to meet the 75% clarification threshold and eliminate confident routing on genuinely ambiguous requests.

FR6: Preserve fragment-selection's 100% required recall and zero forbidden selections while eliminating the two unstable cases.

FR7: Fix NFR evidence handling to reach 100% grounded citations, zero fabricated citations, and zero unstable cases.

FR8: Fix test-design coverage mapping to reach at least 80%, eliminate risks beyond the declared ceiling, and eliminate instability.

FR9: Fix trace run metadata to reach 100% accuracy and eliminate instability.

FR10: Add a deterministic regression case for every confirmed root cause before changing the relevant skill or workflow.

FR11: Run each affected suite live against the same runner, model, fixtures, repetitions, and thresholds after its fix.

FR12: Run the complete live suite once after all focused suites pass, record the result, and compare it with the 1.27.1 baseline through `compareDominance`.

FR13: Update the changelog and correct stale factual claims in the existing eval documentation.

FR14: Add a public How TEA Is Tested page that explains deterministic checks, behavioral evaluations, clean controls, seeded defects, gameability probes, live runs, and recorded results in plain language.

FR15: Explain the ownership boundary: TEA designs domain-specific evaluations and interprets their gaps, while `eval-quality` validates contracts, preflights environments, verifies evidence, scores runs, and measures evaluation strength.

FR16: Link the new page from the TEA overview and the existing self-testing section, and register it in the documentation site navigation.

FR17: Reconcile the README, adoption guide, roadmap, and command-adapter page with the completed 1.27.1 state, including all ten skills covered and the first full live baseline recorded.

### NonFunctional Requirements

NFR1: Do not lower thresholds, remove cases, weaken ground truth, or exclude a failing suite.

NFR2: Keep ground truth outside agent prompts and staged workspaces.

NFR3: Keep environment failures separate from measured quality failures.

NFR4: Preserve fresh workspace and command-port isolation for every retry attempt.

NFR5: Require the full `npm test` chain and every CI job to pass.

NFR6: Preserve existing public skill names and command compatibility.

NFR7: Keep implementation of the future Evaluate skill outside this remediation story.

NFR8: Describe the Evaluate skill only as planned work until it ships, while documenting the TEA and `eval-quality` ownership boundary it will use.

NFR9: Hold factual counts and current-state claims on the new page through the existing documentation gates whenever a machine-readable source exists.

### Additional Requirements

- Use the recorded aggregate failures as discovery inputs, then capture fresh case-level evidence before editing a workflow.
- Keep the same Claude Code runner, resolved Sonnet model, fixture digests, prompt digests, repetition counts, and declared thresholds when establishing comparability with the baseline.
- Treat a surviving `environment-timeout` or `environment-transport` failure according to the bounded retry policy and record it as an environment result.
- Version any intentional scorer or result-schema change and replay all stored evidence through the changed scorer.
- Add every new deterministic check to `npm test` and the matching CI workflow step.
- Keep the new public explanation short and user-facing, with links to the detailed roadmap, adoption guide, and command-adapter page for implementation detail.

### UX Design Requirements

None.

### FR Coverage Map

FR1: Epic 1 - Preserve the recorded baseline.
FR2: Epic 1 - Make aggregate failures actionable at case and repetition level.
FR3: Epic 1 - Root-cause every recorded finding before implementation changes.
FR4: Epic 1 - Close ATDD behavioral failures.
FR5: Epic 1 - Close TEA routing behavioral failures.
FR6: Epic 1 - Stabilize fragment selection while preserving its perfect selection scores.
FR7: Epic 1 - Close NFR evidence-grounding and stability failures.
FR8: Epic 1 - Close test-design coverage, restraint, and stability failures.
FR9: Epic 1 - Close trace metadata and stability failures.
FR10: Epic 1 - Prove each confirmed defect with deterministic regression evidence.
FR11: Epic 1 - Verify each affected suite live under comparable conditions.
FR12: Epic 1 - Run, record, and compare the final complete live suite.
FR13: Epic 1 - Record the change and correct existing documentation.
FR14: Epic 1 - Publish a plain-language explanation of how TEA is tested.
FR15: Epic 1 - Explain the TEA and eval-quality ownership boundary.
FR16: Epic 1 - Make the explanation discoverable in the public documentation.
FR17: Epic 1 - Reconcile all existing eval pages with the completed baseline.

## Epic List

### Epic 1: Close and Explain TEA's Live Quality Baseline

TEA users can rely on every shipped skill meeting its declared behavioral thresholds, with reproducible evidence and clear public documentation of how TEA is tested.

**FRs covered:** FR1 through FR17.

### Story 1.1: Make live evaluation failures diagnosable

As a TEA maintainer,
I want every live suite result to identify which case and repetition contributed to a failed metric,
So that a recorded aggregate can be investigated without guessing or discarding the evidence.

**FRs covered:** FR1, FR2, FR3, FR10.

**Acceptance Criteria:**

**Given** the committed 1.27.1 run records only aggregate measurements and failure names
**When** a live harness writes a suite result through `--json`
**Then** the record includes case-level and repetition-level diagnostic entries for every measured run
**And** each entry identifies the case, repetition, completion state, stability signature, metric contributions, failure class, and output or artifact evidence needed for triage

**Given** a run fails before producing measurable output
**When** its diagnostic entry is written
**Then** the entry carries the environment failure class and reason
**And** it contributes no low score to a quality metric

**Given** a suite produces repeated answers for the same case
**When** those answers differ
**Then** the record identifies the exact cases and signatures that caused instability
**And** the suite manifest explicitly declares every stability ceiling the harness enforces

**Given** the new diagnostic shape changes a stored result schema or scorer projection
**When** the change is implemented
**Then** the schema or scorer version is advanced
**And** every stored replay output reproduces its expected result under the new version

**Given** the 1.27.1 baseline is the source of this work
**When** diagnostics are added
**Then** `test/results/eval-all/history/2026-09-17T12-23-09-218Z.json` remains byte-for-byte unchanged
**And** the new behavior is proven with deterministic fixtures covering a quality failure, an environment failure, and an unstable pair

**Given** implementation is complete
**When** repository validation runs
**Then** `npm test` and all quality workflow jobs pass
**And** `CHANGELOG.md` records the diagnostic capability under Unreleased

### Story 1.2: Make ATDD scaffolds fail for the intended reason

As a user generating red-phase acceptance tests,
I want every generated test mapped to a supplied criterion and failing through its intended assertion,
So that the red phase proves missing behavior instead of broken scaffolding.

**FRs covered:** FR4, FR10, FR11, FR13.

**Acceptance Criteria:**

**Given** the recorded ATDD baseline reports a 0.625 intended-reason rate, 0.5 criteria coverage, three non-assertion exits, eight unmapped tests, and one unstable case
**When** `npm run eval:atdd -- --agent claude --runs 2 --json <path>` is run with Story 1.1 diagnostics
**Then** every failing case and repetition is identified
**And** each root cause is classified before the workflow, harness, corpus, or oracle changes

**Given** a confirmed ATDD defect
**When** its fix is implemented
**Then** a deterministic regression fixture fails when the defect is restored and passes with the fix
**And** the existing fixture, ground truth, thresholds, and criterion identifiers remain intact

**Given** the focused live suite runs after the fix
**When** both declared repetitions complete
**Then** intended-reason rate and criteria coverage are 1
**And** vacuous passes, skipped scaffolds, load errors, non-assertion exits, unmapped tests, production mutations, and unstable cases are all zero

**Given** the story is complete
**When** repository validation runs
**Then** `npm test` and all quality workflow jobs pass
**And** `CHANGELOG.md` records the user-facing ATDD correction under Unreleased

### Story 1.3: Make TEA ask when routing is genuinely ambiguous

As a user describing a testing need in ordinary language,
I want TEA to ask a focused question when several workflows fit,
So that it does not choose a workflow before the deciding information exists.

**FRs covered:** FR5, FR10, FR11, FR13.

**Acceptance Criteria:**

**Given** the recorded routing baseline has route accuracy 1, clarification recall 0.125, and five confident routes on ambiguous intents
**When** `npm run eval:routing -- --agent claude --runs 2 --json <path>` is run with Story 1.1 diagnostics
**Then** every ambiguous intent that was routed is identified with both repetitions
**And** the root cause is classified before the agent menu, routing instructions, harness, corpus, or oracle changes

**Given** the four ambiguous controls in the corpus
**When** `bmad-tea` cannot select one workflow from the supplied facts
**Then** it asks for the missing deciding information
**And** it names the relevant choices without activating either one

**Given** clear and unservable controls
**When** routing is re-evaluated
**Then** clear-intent route accuracy remains at least 0.9
**And** decline recall remains at least 0.75 with zero confident routes on unservable requests

**Given** the focused live suite runs after the fix
**When** both declared repetitions complete
**Then** clarification recall is at least 0.75
**And** confident routes on ambiguous intents are zero, scope fidelity remains at least 0.875, and unstable cases remain within the declared ceiling

**Given** the story is complete
**When** repository validation runs
**Then** a deterministic replay case proves each corrected routing branch
**And** `npm test`, all quality workflow jobs, and the Unreleased changelog entry pass review

### Story 1.4: Make fragment selection reproducible

As a TEA maintainer,
I want identical workflow contexts to select the same knowledge fragments across repetitions,
So that a workflow receives a stable instruction set.

**FRs covered:** FR6, FR10, FR11, FR13.

**Acceptance Criteria:**

**Given** the recorded fragment-selection baseline has required recall 1, forbidden rate 0, and two unstable cases
**When** `npm run eval:fragment-selection -- --agent claude --runs 2 --json <path>` is run with Story 1.1 diagnostics
**Then** the two unstable cases and their differing fragment sets are identified
**And** each difference is traced to the workflow instructions, selector prompt, parser, harness, corpus, or oracle before implementation changes

**Given** a confirmed source of instability
**When** its fix is implemented
**Then** a deterministic regression fixture proves the unstable branch
**And** the required and forbidden fragment sets remain derived from the workflow step files

**Given** the focused live suite runs after the fix
**When** both declared repetitions complete
**Then** required recall remains 1 and forbidden rate remains 0
**And** unstable cases are zero under an explicit manifest threshold

**Given** the story is complete
**When** repository validation runs
**Then** `npm test` and all quality workflow jobs pass
**And** `CHANGELOG.md` records the stability correction under Unreleased

### Story 1.5: Ground every NFR claim in supplied evidence

As a user relying on an NFR assessment,
I want every cited fact to resolve to evidence in the supplied bundle,
So that the assessment never supports a decision with an invented source.

**FRs covered:** FR7, FR10, FR11, FR13.

**Acceptance Criteria:**

**Given** the recorded NFR baseline has correct domain and gate decisions, grounded citation accuracy of 0.9852941176470589, twenty-two fabricated citations, and two unstable cases
**When** `npm run eval:nfr -- --agent claude --runs 2 --json <path>` is run with Story 1.1 diagnostics
**Then** every fabricated or unstable citation is attributed to its bundle, domain, case, and repetition
**And** each root cause is classified before the workflow, evidence parser, harness, corpus, or oracle changes

**Given** an NFR claim references evidence
**When** the assessment is scored
**Then** the citation resolves to a supplied file and supported statement
**And** absent evidence produces the workflow's declared undecidable or concern state

**Given** a confirmed evidence-grounding defect
**When** its fix is implemented
**Then** a deterministic replay case restores the defect and observes the intended failure
**And** domain status, threshold fidelity, overall status, gate agreement, and clean-control behavior remain unchanged

**Given** the focused live suite runs after the fix
**When** both bundles complete both repetitions
**Then** grounded citation accuracy is 1
**And** fabricated citations, unsupported passes, clean false positives, duplicate domain sections, gate disagreements, unstable cases, and fixture mutations are all zero

**Given** the story is complete
**When** repository validation runs
**Then** `npm test` and all quality workflow jobs pass
**And** `CHANGELOG.md` records the evidence-grounding correction under Unreleased

### Story 1.6: Keep test design coverage grounded and restrained

As a user receiving an epic-level test design,
I want material risks mapped to suitable coverage without inventing extra risks,
So that the plan focuses execution on what the epic actually supports.

**FRs covered:** FR8, FR10, FR11, FR13.

**Acceptance Criteria:**

**Given** the recorded test-design baseline has full grounded-risk recall and precision, coverage mapping accuracy of 0.5, eleven risks above the declared ceiling, and two unstable cases
**When** `npm run eval:test-design -- --agent claude --runs 2 --json <path>` is run with Story 1.1 diagnostics
**Then** every missed mapping, excess risk, and unstable case is attributed to its fixture and repetition
**And** each root cause is classified before the workflow, parser, harness, corpus, or oracle changes

**Given** the seeded epic and the clean control epic
**When** test design identifies and maps their risks
**Then** every material risk maps to an accepted coverage class
**And** the output stays within each fixture's declared risk ceiling

**Given** a confirmed mapping or restraint defect
**When** its fix is implemented
**Then** a deterministic replay case restores the defect and observes the intended failure
**And** scale, arithmetic, category, band, risk-id, link, priority, and grounding checks remain fully accurate

**Given** the focused live suite runs after the fix
**When** both epics complete both repetitions
**Then** coverage mapping accuracy is at least 0.8
**And** risk-ceiling excess, ungrounded risks, unscored tables, missed top-severity risks, unstable cases, and fixture mutations are all zero

**Given** the story is complete
**When** repository validation runs
**Then** `npm test` and all quality workflow jobs pass
**And** `CHANGELOG.md` records the test-design correction under Unreleased

### Story 1.7: Make trace metadata complete and stable

As a user consuming a traceability result,
I want every run to carry complete and repeatable provenance,
So that the result can be compared and audited later.

**FRs covered:** FR9, FR10, FR11, FR13.

**Acceptance Criteria:**

**Given** the recorded trace baseline has perfect criterion, gate, arithmetic, oracle, waiver, and live-evidence accuracy with run metadata accuracy 0.9 and one unstable case
**When** `npm run eval:trace -- --agent claude --runs 2 --json <path>` is run with Story 1.1 diagnostics
**Then** every missing metadata field and unstable signature is attributed to its fixture and repetition
**And** each root cause is classified before the workflow, artifact contract, parser, harness, corpus, or oracle changes

**Given** a trace run completes
**When** its summary and matrix are written
**Then** every declared provenance field carries the real run value or the contract's explicit unknown representation
**And** repeated runs over identical inputs agree on all fields included in the stability signature

**Given** a confirmed metadata or stability defect
**When** its fix is implemented
**Then** a deterministic replay case restores the defect and observes the intended failure
**And** every previously perfect trace metric remains at its recorded value

**Given** the focused live suite runs after the fix
**When** both fixture sets complete both repetitions
**Then** run metadata accuracy is 1
**And** unstable cases, clean false positives, invented criteria, duplicate criteria, and fixture mutations are all zero

**Given** the story is complete
**When** repository validation runs
**Then** `npm test` and all quality workflow jobs pass
**And** `CHANGELOG.md` records the trace correction under Unreleased

### Story 1.8: Record the passing complete live baseline

As a TEA maintainer,
I want one complete comparable live run after every focused remediation passes,
So that the repository carries evidence for the quality claim it publishes.

**FRs covered:** FR12, FR13.

**Acceptance Criteria:**

**Given** Stories 1.2 through 1.7 have each passed their focused live suite under the declared runner, model, fixtures, repetitions, and thresholds
**When** `npm run eval:all -- --agent claude --json <path>` runs once from a clean commit
**Then** all declared repetitions across all suites complete
**And** every suite meets its declared thresholds with no unaccounted skill

**Given** a retryable environment timeout or transport failure occurs
**When** the bounded retry policy is exhausted
**Then** the run is treated according to the recorded-run policy
**And** every attempt uses a fresh workspace and command port

**Given** the complete run exits
**When** `tools/record-eval-run.js` records it
**Then** the unedited result becomes `test/results/eval-all/latest.json`
**And** a timestamped history entry preserves the prior 1.27.1 baseline and the new run

**Given** the new run and the 1.27.1 baseline
**When** they are compared through `compareDominance`
**Then** the comparison names the relation for every comparable result
**And** any comparability refusal names the exact changed key and remains in the record

**Given** the story is complete
**When** repository validation runs
**Then** the full `npm test` chain and every quality workflow job pass
**And** `CHANGELOG.md` records the new baseline without rewriting the measured result

### Story 1.9: Explain how TEA is tested

As a TEA user or BMAD skill author,
I want a short public explanation of how TEA proves its own behavior,
So that I can understand the evidence behind TEA and reuse the approach for another skill.

**FRs covered:** FR13, FR14, FR15, FR16, FR17.

**Acceptance Criteria:**

**Given** the current explanation is spread across the README, roadmap, adoption guide, and command-adapter page
**When** `docs/explanation/how-tea-is-tested.md` is added
**Then** it explains deterministic repository checks, behavioral evaluations, clean controls, seeded defects, gameability probes, repeated live runs, recorded results, and the three exit classes in plain language
**And** it links to the detailed roadmap, adoption guide, command-adapter page, and recorded baseline

**Given** TEA and `eval-quality` have different responsibilities
**When** the page explains their boundary
**Then** TEA owns understanding the target, designing the domain-specific evaluation, authoring or deriving the corpus and oracles, and interpreting gaps
**And** `eval-quality` owns contract validation and sealing, environment preflight, evidence verification, scoring, and evaluation-strength measurement

**Given** the Evaluate skill has not shipped
**When** the page describes what is coming
**Then** it labels Evaluate as planned work
**And** it explains that the skill will fill in the target-specific adapter, controlled mutations and rollback, probe corpus, clean and mutant runs, evidence, oracles, and rubrics around `eval-quality`

**Given** the 1.27.1 upgrade and Story 1.8 baseline are complete
**When** existing documentation is reconciled
**Then** the README, adoption guide, roadmap, and command-adapter page state that all ten TEA skills have behavioral coverage
**And** stale claims about framework, teach-me-testing, and suites that had never run live are removed

**Given** the new page is public
**When** documentation navigation is built
**Then** the TEA overview, README self-testing section, and Starlight sidebar link to it
**And** every factual count or current-state claim with a machine-readable source is registered in the existing documentation gates

**Given** the documentation story is complete
**When** validation runs
**Then** `npm run docs:validate-links`, `npm run lint:md`, `npm run format:check`, `npm run docs:build`, and the full `npm test` chain pass
**And** `CHANGELOG.md` records the new public explanation under Unreleased
