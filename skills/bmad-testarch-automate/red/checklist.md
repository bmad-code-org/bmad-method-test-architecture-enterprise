# ATDD Workflow Validation Checklist

Use this checklist to assess red-mode deliverables and verification evidence. Create runs `{skill-root}/resources/run-and-heal.md` after generation and aggregation; that resource is authoritative for execution, repair scope and stopping conditions. Validate assesses available evidence without repair or requiring a passing suite. Edit checks the requested changes and never runs the healing loop. A completed generation workflow records unresolved, blocked or disabled red verification honestly.

## Prerequisites

Before starting this workflow, verify:

- [ ] Story approved with clear acceptance criteria (AC must be testable)
- [ ] Development sandbox/environment ready
- [ ] Framework scaffolding exists (run `framework` workflow if missing)
- [ ] Test framework configuration available (playwright.config.ts or cypress.config.ts)
- [ ] Package.json has test dependencies installed (Playwright or Cypress)

**Halt if missing:** Framework scaffolding or story acceptance criteria

---

## Step 1: Story Context and Requirements

- [ ] Story markdown file loaded and parsed successfully
- [ ] All acceptance criteria identified and extracted
- [ ] Supplied criterion ids preserved; unnamed criteria assigned the lowest unused `AC-<n>` ids in source order
- [ ] Criterion registry persisted with `id`, `idSource`, and criterion text
- [ ] Affected systems and components identified
- [ ] Technical constraints documented
- [ ] Framework configuration loaded (playwright.config.ts or cypress.config.ts)
- [ ] Test directory structure identified from config
- [ ] Existing fixture patterns reviewed for consistency
- [ ] Similar test patterns searched and found in `{test_dir}`
- [ ] Knowledge base fragments loaded:
  - [ ] `fixture-architecture.md`
  - [ ] `data-factories.md`
  - [ ] `component-tdd.md`
  - [ ] `network-first.md`
  - [ ] `test-quality.md`

---

## Step 2: Test Level Selection and Strategy

- [ ] Each acceptance criterion analyzed for appropriate test level
- [ ] Test level selection framework applied (E2E vs API vs Component vs Unit)
- [ ] E2E tests: Critical user journeys and multi-system integration identified
- [ ] API tests: Business logic and service contracts identified
- [ ] Component tests: UI component behavior and interactions identified
- [ ] Unit tests: Pure logic and edge cases identified (if applicable)
- [ ] Duplicate coverage avoided (same behavior not tested at multiple levels unnecessarily)
- [ ] Tests prioritized using P0-P3 framework (if a test-design document exists in `{test_artifacts}/test-design/` or, for older runs, the `{test_artifacts}/` root)
- [ ] Primary test level set in `primary_level` variable (typically E2E or API)
- [ ] Test levels documented in ATDD checklist

---

## Step 3: Red-Phase Test Scaffolds Generated

### Test File Structure Created

- [ ] Test files organized in appropriate directories:
  - [ ] `tests/e2e/` for end-to-end tests
  - [ ] `tests/api/` for API tests
  - [ ] `tests/component/` for component tests
  - [ ] `tests/support/` for infrastructure (fixtures, factories, helpers)

### E2E Tests (If Applicable)

- [ ] E2E test files created in `tests/e2e/`
- [ ] All tests follow Given-When-Then format
- [ ] Tests use `data-testid` selectors (not CSS classes or fragile selectors)
- [ ] One assertion per test (atomic test design)
- [ ] No hard waits or sleeps (explicit waits only)
- [ ] Network-first pattern applied (route interception BEFORE navigation)
- [ ] Tests are generated as `test.skip()` scaffolds
- [ ] Activation guidance is documented for the current task

### API Tests (If Applicable)

- [ ] API test files created in `tests/api/`
- [ ] Tests follow Given-When-Then format
- [ ] API contracts validated (request/response structure)
- [ ] HTTP status codes verified
- [ ] Response body validation includes all required fields
- [ ] Error cases tested (400, 401, 403, 404, 500)
- [ ] Tests are generated as `test.skip()` scaffolds

### Component Tests (If Applicable)

- [ ] Component test files created in `tests/component/`
- [ ] Tests follow Given-When-Then format
- [ ] Component mounting works correctly
- [ ] Interaction testing covers user actions (click, hover, keyboard)
- [ ] State management within component validated
- [ ] Props and events tested
- [ ] Tests are generated as `test.skip()` scaffolds

### Test Quality Validation

- [ ] All tests use Given-When-Then structure with clear comments
- [ ] All tests have descriptive names explaining what they test
- [ ] Every executable leaf title carries exactly one declared `AC-<n>` id from the criterion registry
- [ ] Every declared acceptance criterion has exactly one red-phase leaf scaffold
- [ ] Secondary branches and journeys are recorded for green-phase automation
- [ ] Criterion-defining assertion is the first assertion that can fail and directly isolates the exact newly promised status, scalar, or property
- [ ] API setup responses from unimplemented endpoints remain opaque before the criterion assertion
- [ ] E2E criterion-defining assertion is the first potentially failing operation and owns the browser journey
- [ ] State-transition criteria exercise the transition-bearing branch first
- [ ] No duplicate tests (same behavior tested multiple times)
- [ ] No flaky patterns (race conditions, timing issues)
- [ ] No test interdependencies (tests can run in any order)
- [ ] Tests are deterministic (same input always produces same result)

---

## Step 4: Data Infrastructure Built

### Data Factories Created

- [ ] Factory files created in `tests/support/factories/`
- [ ] Factories use `@faker-js/faker` for unconstrained random fields and retain exact criterion-defined business inputs and boundary overrides
- [ ] Factories support overrides for specific test scenarios
- [ ] Factories generate complete valid objects matching API contracts
- [ ] Helper functions for bulk creation provided (e.g., `createUsers(count)`)
- [ ] Factory exports are properly typed (TypeScript)

### Test Fixtures Created

- [ ] Fixture files created in `tests/support/fixtures/`
- [ ] All fixtures use Playwright's `test.extend()` pattern
- [ ] Fixtures have setup phase (arrange test preconditions)
- [ ] Fixtures provide data to tests via `await use(data)`
- [ ] Fixtures have teardown phase with auto-cleanup (delete created data)
- [ ] Fixtures are composable (can use other fixtures if needed)
- [ ] Fixtures are isolated (each test gets fresh data)
- [ ] Fixtures are type-safe (TypeScript types defined)

### Mock Requirements Documented

- [ ] External service mocking requirements identified
- [ ] Mock endpoints documented with URLs and methods
- [ ] Success response examples provided
- [ ] Failure response examples provided
- [ ] Mock requirements documented in ATDD checklist for DEV team

### data-testid Requirements Listed

- [ ] All required data-testid attributes identified from E2E tests
- [ ] data-testid list organized by page or component
- [ ] Each data-testid has clear description of element it targets
- [ ] data-testid list included in ATDD checklist for DEV team

---

## Step 5: Implementation Checklist Created

- [ ] Implementation checklist created with clear structure
- [ ] Each scaffolded test mapped to concrete implementation tasks
- [ ] Tasks include:
  - [ ] Route/component creation
  - [ ] Business logic implementation
  - [ ] API integration
  - [ ] data-testid attribute additions
  - [ ] Error handling
  - [ ] Test execution command
  - [ ] Completion checkbox
- [ ] Red-Green-Refactor workflow documented in checklist
- [ ] RED phase marked verified only when every criterion executes and fails for its intended missing behavior; blocked, failed or disabled verification recorded explicitly
- [ ] GREEN phase tasks listed for DEV team
- [ ] REFACTOR phase guidance provided
- [ ] Execution commands provided:
  - [ ] Run all tests: `npm run test:e2e`
  - [ ] Run specific test file
  - [ ] Run in headed mode
  - [ ] Debug specific test
- [ ] Estimated effort included (hours or story points)

---

## Step 6: Deliverables Generated

### ATDD Checklist Document Created

- [ ] Output file created at `{test_artifacts}/atdd/atdd-checklist-{story_key}.md`
- [ ] Frontmatter carries `runScope: story` and `runKey: story-{story_key}`, matching the story this run covers
- [ ] No checklist for another story was read or written, and no earlier run's content was merged into this checklist
- [ ] Document follows template structure from `{skill-root}/red/atdd-checklist-template.md`
- [ ] Document includes all required sections:
  - [ ] Story summary
  - [ ] Acceptance criteria breakdown
  - [ ] Red-phase test scaffolds created (paths and line counts)
  - [ ] Data factories created
  - [ ] Fixtures created
  - [ ] Mock requirements
  - [ ] Required data-testid attributes
  - [ ] Implementation checklist
  - [ ] Red-green-refactor workflow
  - [ ] Execution commands
  - [ ] Next steps for DEV team
- [ ] Checklist frontmatter includes `storyId`, `storyKey`, `storyFile`, `atddChecklistPath`, and generated test file paths
- [ ] If a writable story file was provided, ATDD artifacts were linked back into story context
- [ ] If a story file could not be updated, manual handoff instructions are present

### Red-Phase Scaffolds Verified

- [ ] All generated acceptance test scaffolds are marked with `test.skip()`
- [ ] No scaffold was emitted as an active passing test before implementation
- [ ] Create verification activates only generated leaf skips in a disposable copy; permanent scaffolds and all other skips remain unchanged
- [ ] Implementation activation guidance is documented: remove the current task's leaf `test.skip()` when development begins, then confirm RED before implementing
- [ ] Any assumptions or expected failure reasons are documented in ATDD checklist
- [ ] Fresh execution evidence captured for every generated leaf, including actual assertion/load status, criterion mapping, verification route and any native-runner fallback reason

### Summary Provided

- [ ] Summary includes:
  - [ ] Story ID
  - [ ] Primary test level
  - [ ] Test counts (E2E, API, Component)
  - [ ] Test file paths
  - [ ] Factory count
  - [ ] Fixture count
  - [ ] Mock requirements count
  - [ ] data-testid count
  - [ ] Implementation task count
  - [ ] Estimated effort
  - [ ] Next steps for DEV team
  - [ ] Output file path
  - [ ] Knowledge base references applied

---

## Quality Checks

### Test Design Quality

- [ ] Tests are readable (clear Given-When-Then structure)
- [ ] Tests are maintainable (use factories and fixtures with exact scenario-defined inputs and expectations)
- [ ] Tests are isolated (no shared state between tests)
- [ ] Tests are deterministic (no race conditions or flaky patterns)
- [ ] Tests are atomic (one assertion per test)
- [ ] Tests are fast (no unnecessary waits or delays)

### Playwright Utils Mandate (if `tea_use_playwright_utils` is true)

Per `playwright-utils-mandate.md`. Skip this section entirely when the flag is false, and for Cypress and non-Playwright suites. A red-phase scaffold is held to the same standard as a green test.

- [ ] `{test_dir}/support/merged-fixtures.ts` exists and composes with `mergeTests`
- [ ] Every scaffold imports `test` from the merged fixtures, not from `@playwright/test`
- [ ] Application API calls use `interceptNetworkCall`, not `page.route` or `page.waitForResponse`
- [ ] API scaffolds use `apiRequest`, not the raw `request` fixture
- [ ] Async waits use `recurse`, not `page.waitForTimeout`
- [ ] Report output uses `log`, not `console.log`
- [ ] Authenticated journeys take `authToken` from the auth-session fixture, or the missing auth wiring is listed in the ATDD checklist
- [ ] Package name is `@seontechnologies/playwright-utils` everywhere (never `@playwright-utils/*`)
- [ ] Every remaining vanilla call carries a `// playwright-utils deviation: <reason>` comment and appears in the checklist's deviation list

### Pact.js Utils Mandate (if `tea_use_pactjs_utils` is true and contract tests are in scope)

Per `pactjs-utils-mandate.md`. Skip entirely when the flag is false, when `@seontechnologies/pactjs-utils` is not installed, or when the project has no consumer-provider boundary — the flag never means a project should have contract tests.

- [ ] Contract artifacts generated only against a real consumer-provider boundary, with the reason stated when skipped
- [ ] `@seontechnologies/pactjs-utils` and `@pact-foundation/pact` present in `package.json`
- [ ] Provider states built with `createProviderState`, never a hand-cast `.given('name', obj as JsonMap)`
- [ ] Verifier options built with `buildVerifierOptions` / `buildMessageVerifierOptions`, never a literal options object
- [ ] Auth injection uses `createRequestFilter` or `noOpRequestFilter`, never bespoke middleware
- [ ] PactV4 builder callbacks use `setJsonContent` / `setJsonBody` rather than repeated inline lambdas
- [ ] `zodToPactMatchers` used where the project already has a Zod schema
- [ ] `executeTest` exercises the real consumer client via the `pact-consumer-di.md` injection, or the reason it cannot is stated
- [ ] Exactly one `addInteraction()` per `it()` block
- [ ] Consumer Vitest config carries `fileParallelism: false` AND `pool: 'forks'` AND `singleFork: true`; provider config carries the pool pair
- [ ] Every interaction carries its `// Provider endpoint:` comment and provider-scrutiny evidence
- [ ] Package name is `@seontechnologies/pactjs-utils` everywhere
- [ ] Every remaining raw-Pact construct carries a `// pactjs-utils deviation: <reason>` comment and appears in the summary's deviation list

### Knowledge Base Integration

- [ ] playwright-utils-mandate.md applied to all generated specs (if `tea_use_playwright_utils` is true)
- [ ] fixture-architecture.md patterns applied to all fixtures
- [ ] data-factories.md patterns applied to all factories
- [ ] network-first.md patterns applied to E2E tests with network requests
- [ ] component-tdd.md patterns applied to component tests
- [ ] test-quality.md principles applied to all test design

### Code Quality

- [ ] All TypeScript types are correct and complete
- [ ] No linting errors in generated test files
- [ ] Consistent naming conventions followed
- [ ] Imports are organized and correct
- [ ] Code follows project style guide

---

## Integration Points

### With DEV Agent

- [ ] ATDD checklist provides clear implementation guidance
- [ ] Implementation tasks are granular and actionable
- [ ] data-testid requirements are complete and clear
- [ ] Mock requirements include all necessary details
- [ ] Execution commands work correctly

### With Story Workflow

- [ ] Story ID correctly referenced in output files
- [ ] Acceptance criteria from story accurately reflected in tests
- [ ] Technical constraints from story considered in test design

### With Framework Workflow

- [ ] Test framework configuration correctly detected and used
- [ ] Directory structure matches framework setup
- [ ] Fixtures and helpers follow established patterns
- [ ] Naming conventions consistent with framework standards

### With test-design Workflow (If Available)

Test-design documents live in `{test_artifacts}/test-design/` (`test-design-epic-{epic_num}.md`, or the system-level `test-design-qa.md` and `test-design-architecture.md`); older runs left them in the `{test_artifacts}/` root.

- [ ] P0 scenarios from test-design prioritized in ATDD
- [ ] Risk assessment from test-design considered in test coverage
- [ ] Coverage strategy from test-design aligned with ATDD tests

---

## Completion Criteria

Check the generation deliverables below and record the shared loop's actual red verification status before marking Create complete. Validate reports unmet criteria; Edit checks the changed outputs. Generation completion cannot claim verified red when execution is wrong-reason, unavailable or disabled.

- [ ] **Story acceptance criteria analyzed** and mapped to appropriate test levels
- [ ] **Red-phase test scaffolds created** at all appropriate levels (E2E, API, Component)
- [ ] **Given-When-Then format** used consistently across all tests
- [ ] **RED verification status recorded** from fresh criterion-mapped execution evidence, or explicitly reported as failed, could not measure or disabled; scaffold generation and activation guidance alone cannot prove RED
- [ ] **Network-first pattern** applied to E2E tests with network requests
- [ ] **Data factories created** using faker for unconstrained fields and exact scenario overrides for criterion-defined inputs
- [ ] **Fixtures created** with auto-cleanup in teardown
- [ ] **Mock requirements documented** for external services
- [ ] **data-testid attributes listed** for DEV team
- [ ] **Implementation checklist created** mapping tests to code tasks
- [ ] **Red-green-refactor workflow documented** in ATDD checklist
- [ ] **Execution commands provided** and verified to work
- [ ] **ATDD checklist document created** and saved to correct location
- [ ] **Output file formatted correctly** using template structure
- [ ] **Knowledge base references applied** and documented in summary
- [ ] **No unreported test quality issues** (flaky patterns, race conditions, uncontrolled fixture data)

---

## Common Issues and Resolutions

### Issue: Tests pass before implementation

**Problem:** A test passes even though no implementation code exists yet.

**Resolution:**

- Review test to ensure it's testing actual behavior, not mocked/stubbed behavior
- Check if test is accidentally using existing functionality
- Verify test assertions are correct and meaningful
- Report the observed passing behavior and reassess the requested scope from the unchanged criterion; preserve the original business assertion and product implementation

### Issue: Network-first pattern not applied

**Problem:** Route interception happens after navigation, causing race conditions.

**Resolution:**

- Move the interception BEFORE `await page.goto()`. With `tea_use_playwright_utils` true that means declaring `const call = interceptNetworkCall({ url })` above the navigation and awaiting it after; with the flag false it means moving `await page.route()` above the navigation.
- Review `network-first.md` for the principle and `intercept-network-call.md` for the mechanism
- Update all E2E tests to follow network-first pattern

### Issue: Hardcoded test data in tests

**Problem:** Generated setup invents identities or shares fixture data across tests.

**Resolution:**

- Move generated setup identities and random input data into factories while preserving criterion-defined exact expected values
- Use `faker` for unconstrained random fields; preserve exact criterion-defined business inputs, boundary cases and expected outcomes
- Update data-factories to support all required test scenarios

### Issue: Fixtures missing auto-cleanup

**Problem:** Fixtures create data but don't clean it up in teardown.

**Resolution:**

- Add cleanup logic after `await use(data)` in fixture
- Call deletion/cleanup functions in teardown
- Verify cleanup works by checking database/storage after test run

### Issue: Tests have multiple assertions

**Problem:** Tests verify multiple behaviors in single test (not atomic).

**Resolution:**

- Split into separate tests (one assertion per test)
- Each test should verify exactly one behavior
- Use descriptive test names to clarify what each test verifies

### Issue: Tests depend on execution order

**Problem:** Tests fail when run in isolation or different order.

**Resolution:**

- Remove shared state between tests
- Each test should create its own test data
- Use fixtures for consistent setup across tests
- Verify tests can run with `.only` flag

---

## Notes for TEA Agent

- **Preflight halt is critical:** Do not proceed if story has no acceptance criteria or framework is missing
- **RED phase verification:** Run the shared Create loop by default and report verified red only from intended assertion failures; the DEV handoff identifies disabled, blocked or wrong-reason verification
- **Network-first pattern:** Route interception BEFORE navigation prevents race conditions
- **One assertion per test:** Atomic tests provide clear failure diagnosis
- **Auto-cleanup is non-negotiable:** Every fixture must clean up data in teardown
- **Use knowledge base:** Load relevant fragments (fixture-architecture, data-factories, network-first, component-tdd, test-quality) for guidance
- **Share with DEV agent:** ATDD checklist provides implementation roadmap from red to green

## Create Terminal: Red Execution and Healing

Only Create runs `{skill-root}/resources/run-and-heal.md`; its execution and stopping rules govern conflicting repair advice elsewhere in this checklist.

- [ ] `auto_validate = true`, `auto_heal_failures = true`, `max_healing_iterations = 3` and `use_mcp_healing = true` defaults resolved from explicit instructions and `modules.tea`
- [ ] Validation disabled explicitly means no execution/healing; healing disabled or zero rounds means execution without repairs
- [ ] On Resume, retained settings and `healing_rounds_used` loaded before any write; zero initialized at first loop entry, including legacy Resume with no counter and no prior repair evidence; otherwise saved count retained
- [ ] Original generated scope, criterion registry, assertions and source baseline retained
- [ ] All generated scaffolds executed in a disposable copy; every permanent scaffold skip call and business assertion preserved byte for byte
- [ ] Compatible available `tea-atdd-red-check` used for browserless loopback tests with project-derived process budget; otherwise project-native runner uses original config/environment
- [ ] Fresh per-file results capture load errors, every selected project/attempt's actual statuses and full assertion messages
- [ ] Every criterion's verified red result reaches its intended missing behavior with genuine assertion provenance and no setup/load error
- [ ] Selector, timing, data, network, hard wait and syntax/import/setup failures classified from runtime/source evidence
- [ ] Only confirmed wrong-reason defects in this run's permanent generated tests/support repaired, preserving skips and exact business expectations; re-copy and re-activate before each re-run
- [ ] Incremented round count saved before repair; at most three total repair rounds including pre-interruption work
- [ ] No added skip, `test.fixme()`, expected-failure annotation, relaxed assertion, larger test timeout or SUT mock hides a failure
- [ ] Correct red failures and real product defects preserved without repair; production/config unchanged
- [ ] Passing, skipped, empty, unmapped, interrupted, wrong-reason or unavailable executions reported honestly
- [ ] Commands, runner/fallback reason, process budget, settings, rounds, counts, healed files, evidence and remaining failures recorded in this story's checklist
- [ ] Generation completion distinguished from verified red; unresolved failures or disabled execution cannot claim RED

Validate inspects these results without repair or requiring a passing suite.
Edit checks only the requested changes and never invokes run-and-heal.
