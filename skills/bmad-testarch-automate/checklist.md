# Automate Workflow Validation Checklist

Use this checklist to assess expand-mode deliverables and execution evidence. Create runs the shared `{skill-root}/resources/run-and-heal.md` after generation and aggregation; that resource is authoritative for execution, repair scope and stopping conditions. Validate assesses available evidence without repair or requiring a passing suite. Edit checks the requested changes and never runs the healing loop. A completed generation workflow records failing, blocked or disabled execution honestly.

## Prerequisites

Before starting this workflow, verify:

- [ ] Framework scaffolding configured (playwright.config.ts or cypress.config.ts exists)
- [ ] Test directory structure exists (tests/ folder with subdirectories)
- [ ] Package.json has test framework dependencies installed

**Halt only if:** Framework scaffolding is completely missing (run `framework` workflow first)

**Note:** BMad artifacts (story, tech-spec, PRD) are OPTIONAL - workflow can run without them
**Note:** Expand mode generates tests for implemented code. If red-mode outputs exist, use them as input and avoid duplicate coverage. Test review remains a separate workflow.

---

## Step 1: Execution Mode Determination and Context Loading

### Mode Detection

- [ ] Execution mode correctly determined:
  - [ ] BMad-Integrated Mode (story_file variable set) OR
  - [ ] Standalone Mode (target_feature or target_files set) OR
  - [ ] Auto-discover Mode (no targets specified)

### BMad Artifacts (If Available - OPTIONAL)

- [ ] Story markdown loaded (if `{story_file}` provided)
- [ ] Acceptance criteria extracted from story (if available)
- [ ] Tech-spec.md loaded (if `{use_tech_spec}` true and file exists)
- [ ] Test-design document loaded (if `{use_test_design}` true and a file exists in `{test_artifacts}/test-design/` or, for older runs, the `{test_artifacts}/` root)
- [ ] PRD.md loaded (if `{use_prd}` true and file exists)
- [ ] **Note**: Absence of BMad artifacts does NOT halt workflow

### Framework Configuration

- [ ] Test framework config loaded (playwright.config.ts or cypress.config.ts)
- [ ] Test directory structure identified from `{test_dir}`
- [ ] Existing test patterns reviewed
- [ ] Test runner capabilities noted (parallel execution, fixtures, etc.)

### Coverage Analysis

- [ ] Existing test files searched in `{test_dir}` (if `{analyze_coverage}` true)
- [ ] Tested features vs untested features identified
- [ ] Coverage gaps mapped (tests to source files)
- [ ] Existing fixture and factory patterns checked

### Knowledge Base Fragments Loaded

- [ ] `test-levels-framework.md` - Test level selection
- [ ] `test-priorities.md` - Priority classification (P0-P3)
- [ ] `fixture-architecture.md` - Fixture patterns with auto-cleanup
- [ ] `data-factories.md` - Factory patterns using faker
- [ ] `selective-testing.md` - Targeted test execution strategies
- [ ] `ci-burn-in.md` - Flaky test detection patterns
- [ ] `test-quality.md` - Test design principles

---

## Step 2: Automation Targets Identification

### Target Determination

**BMad-Integrated Mode (if story available):**

- [ ] Acceptance criteria mapped to test scenarios
- [ ] Features implemented in story identified
- [ ] Existing ATDD tests checked (if any), looking in `{test_artifacts}/atdd/` first and then the legacy `{test_artifacts}/` root
- [ ] Expansion beyond ATDD planned (edge cases, negative paths)

**Standalone Mode (if no story):**

- [ ] Specific feature analyzed (if `{target_feature}` specified)
- [ ] Specific files analyzed (if `{target_files}` specified)
- [ ] Features auto-discovered (if `{auto_discover_features}` true)
- [ ] Features prioritized by:
  - [ ] No test coverage (highest priority)
  - [ ] Complex business logic
  - [ ] External integrations (API, database, auth)
  - [ ] Critical user paths (login, checkout, etc.)

### Test Level Selection

- [ ] Test level selection framework applied (from `test-levels-framework.md`)
- [ ] E2E tests identified: Critical user journeys, multi-system integration
- [ ] API tests identified: Business logic, service contracts, data transformations
- [ ] Component tests identified: UI behavior, interactions, state management
- [ ] Unit tests identified: Pure logic, edge cases, error handling

### Duplicate Coverage Avoidance

- [ ] Same behavior NOT tested at multiple levels unnecessarily
- [ ] E2E used for critical happy path only
- [ ] API tests used for business logic variations
- [ ] Component tests used for UI interaction edge cases
- [ ] Unit tests used for pure logic edge cases

### Priority Assignment

- [ ] Test priorities assigned using `test-priorities.md` framework
- [ ] P0 tests: Critical paths, security-critical, data integrity
- [ ] P1 tests: Important features, integration points, error handling
- [ ] P2 tests: Edge cases, less-critical variations, performance
- [ ] P3 tests: Nice-to-have, rarely-used features, exploratory
- [ ] Priority variables respected:
  - [ ] `{include_p0}` = true (always include)
  - [ ] `{include_p1}` = true (high priority)
  - [ ] `{include_p2}` = true (medium priority)
  - [ ] `{include_p3}` = false (low priority, skip by default)

### Coverage Plan Created

- [ ] Test coverage plan documented
- [ ] What will be tested at each level listed
- [ ] Priorities assigned to each test
- [ ] Coverage strategy clear (critical-paths, comprehensive, or selective)

---

## Step 3: Test Infrastructure Generated

### Fixture Architecture

- [ ] Existing fixtures checked in `tests/support/fixtures/`
- [ ] Fixture architecture created/enhanced (if `{generate_fixtures}` true)
- [ ] All fixtures use Playwright's `test.extend()` pattern, composed with `mergeTests`
- [ ] All fixtures have auto-cleanup in teardown
- [ ] Common fixtures created/enhanced:
  - [ ] `authToken` — from `createAuthFixtures()` when `tea_use_playwright_utils` is true, otherwise a project fixture
  - [ ] `apiRequest` — the playwright-utils fixture when the flag is true, otherwise an authenticated client fixture
  - [ ] `interceptNetworkCall` — the playwright-utils fixture (browser suites); no bespoke `mockNetwork` module when the flag is true
  - [ ] testDatabase (with auto-cleanup)

### Data Factories

- [ ] Existing factories checked in `tests/support/factories/`
- [ ] Factory architecture created/enhanced (if `{generate_factories}` true)
- [ ] Factories use `@faker-js/faker` for unconstrained random fields and support exact criterion-defined business inputs and boundary overrides
- [ ] All factories support overrides for specific scenarios
- [ ] Common factories created/enhanced:
  - [ ] User factory (email, password, name, role)
  - [ ] Product factory (name, price, SKU)
  - [ ] Order factory (items, total, status)
- [ ] Cleanup helpers provided (e.g., deleteUser(), deleteProduct())

### Helper Utilities

- [ ] Existing helpers checked in `tests/support/helpers/` (if `{update_helpers}` true)
- [ ] Common utilities created/enhanced:
  - [ ] waitFor (polling for complex conditions)
  - [ ] retry (retry helper for flaky operations)
  - [ ] testData (test data generation)
  - [ ] assertions (custom assertion helpers)

---

## Step 4: Test Files Generated

### Test File Structure

- [ ] Test files organized correctly:
  - [ ] `tests/e2e/` for E2E tests
  - [ ] `tests/api/` for API tests
  - [ ] `tests/component/` for component tests
  - [ ] `tests/unit/` for unit tests
  - [ ] `tests/support/` for fixtures/factories/helpers

### E2E Tests (If Applicable)

- [ ] E2E test files created in `tests/e2e/`
- [ ] All tests follow Given-When-Then format
- [ ] All tests have priority tags ([P0], [P1], [P2], [P3]) in test name
- [ ] All tests use data-testid selectors (not CSS classes)
- [ ] One assertion per test (atomic design)
- [ ] No hard waits or sleeps (explicit waits only)
- [ ] Network-first pattern applied (route interception BEFORE navigation)
- [ ] Clear Given-When-Then comments in test code

### API Tests (If Applicable)

- [ ] API test files created in `tests/api/`
- [ ] All tests follow Given-When-Then format
- [ ] All tests have priority tags in test name
- [ ] API contracts validated (request/response structure)
- [ ] HTTP status codes verified
- [ ] Response body validation includes required fields
- [ ] Error cases tested (400, 401, 403, 404, 500)
- [ ] JWT token format validated (if auth tests)

### Consumer Contract Tests / CDC (If `use_pactjs_utils` Enabled)

**Provider Endpoint Comments:**

- [ ] Every Pact interaction has `// Provider endpoint:` comment
- [ ] Comment includes exact file path to provider route handler, OR uses the TODO form when provider is inaccessible
- [ ] Comment follows format: `// Provider endpoint: <path> -> <METHOD> <route>` or `// Provider endpoint: TODO — provider source not accessible, verify manually`

**Provider Source Scrutiny:**

- [ ] Provider route handlers and/or OpenAPI spec read before generating each interaction
- [ ] Status codes verified against provider source (e.g., 201 not assumed 200)
- [ ] Field names cross-referenced with provider type/DTO definitions
- [ ] Data types verified (string ID vs number ID, date formats)
- [ ] Enum/union values extracted from provider validation schemas
- [ ] Required request fields and headers checked against provider validation
- [ ] Nested response structures match provider's actual response construction
- [ ] Scrutiny evidence documented as block comment in each test file

**CDC Quality Gates:**

- [ ] Postel's Law enforced: exact values in `withRequest`, matchers in `willRespondWith`
- [ ] Response matchers (`like`, `eachLike`, `string`, `integer`) used only in `willRespondWith`
- [ ] Provider state names are consistent with provider's state handler naming
- [ ] DI pattern used for consumer function imports (actual consumer code, not raw `fetch()`)
- [ ] One logical endpoint per Pact interaction (no multi-endpoint interactions)

### Component Tests (If Applicable)

- [ ] Component test files created in `tests/component/`
- [ ] All tests follow Given-When-Then format
- [ ] All tests have priority tags in test name
- [ ] Component mounting works correctly
- [ ] Interaction testing covers user actions (click, hover, keyboard)
- [ ] State management validated
- [ ] Props and events tested

### Unit Tests (If Applicable)

- [ ] Unit test files created in `tests/unit/`
- [ ] All tests follow Given-When-Then format
- [ ] All tests have priority tags in test name
- [ ] Pure logic tested (no dependencies)
- [ ] Edge cases covered
- [ ] Error handling tested

### Quality Standards Enforced

- [ ] All tests use Given-When-Then format with clear comments
- [ ] All tests have descriptive names with priority tags
- [ ] No duplicate tests (same behavior tested multiple times)
- [ ] No flaky patterns (race conditions, timing issues)
- [ ] No test interdependencies (tests can run in any order)
- [ ] Tests are deterministic (same input always produces same result)
- [ ] All tests use data-testid selectors (E2E tests)
- [ ] No hard waits: `await page.waitForTimeout()` (forbidden)
- [ ] No conditional flow: `if (await element.isVisible())` (forbidden)
- [ ] No try-catch for test logic (only for cleanup)
- [ ] Factories isolate generated input data; fixed business values and boundary inputs required by the criterion remain exact
- [ ] No page object classes (tests are direct and simple)
- [ ] No shared state between tests

### Network-First Pattern Applied

- [ ] Interception set up BEFORE navigation (E2E tests with network requests)
- [ ] Interception declared before `page.goto()` to prevent race conditions — via `interceptNetworkCall` when `tea_use_playwright_utils` is true, via `page.route()` when it is false
- [ ] Network-first pattern verified in all E2E tests that make API calls

### Playwright Utils Mandate (if `tea_use_playwright_utils` is true)

Per `playwright-utils-mandate.md`. Skip this section entirely when the flag is false, and for Maestro, Cypress, and non-Playwright backend suites.

- [ ] Every spec imports `test` from the project's merged fixtures, not from `@playwright/test`
- [ ] `{test_dir}/support/merged-fixtures.ts` exists and composes with `mergeTests`
- [ ] Application API calls in UI tests use `interceptNetworkCall`, not `page.route` or `page.waitForResponse`
- [ ] API tests and in-test setup/teardown use `apiRequest`, not the raw `request` fixture
- [ ] Async waits use `recurse`, not `page.waitForTimeout` or a hand-written poll loop
- [ ] Report output uses `log`, not `console.log`
- [ ] File-download assertions use `handleDownload` plus the matching `read*` helper
- [ ] Authenticated state comes from the `authToken` fixture, or the missing auth wiring is named in the summary
- [ ] `network-error-monitor` is in the merge for browser suites, with opt-outs only on tests that expect an error response
- [ ] Package name is `@seontechnologies/playwright-utils` everywhere (never `@playwright-utils/*`)
- [ ] Every remaining vanilla call carries a `// playwright-utils deviation: <reason>` comment and appears in the summary's deviation list

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

---

## Create Terminal: Test Validation and Healing

Only Create executes `{skill-root}/resources/run-and-heal.md`. Validate inspects execution evidence and Edit checks requested changes; neither repairs nor requires a passing full suite. The shared resource governs conflicting execution or repair advice elsewhere in this checklist. Generation and aggregation finish before this loop; structural validation after the loop cannot start more repair rounds.

### Healing Configuration and Resume

- [ ] Settings resolved from explicit run instructions, then `modules.tea`, then defaults:
  - [ ] `{auto_validate}` setting noted (default: true)
  - [ ] `{auto_heal_failures}` setting noted (default: true)
  - [ ] `{max_healing_iterations}` setting noted (default: 3; capped at three)
  - [ ] `{use_mcp_healing}` setting noted (default: true; available diagnosis tools only)
- [ ] `auto_validate = false` recorded as execution disabled; healing also disabled
- [ ] `auto_heal_failures = false` or zero repair rounds executes once and reports without repairs
- [ ] On Resume, retained settings and `healing_rounds_used` loaded before any progress write
- [ ] Round count initialized to zero at first loop entry, including legacy Resume with no counter and no prior repair evidence; otherwise retained
- [ ] Original generated scope, acceptance criteria, assertions and production baseline retained

### Healing Knowledge Fragments

- [ ] `test-healing-patterns.md`, `selector-resilience.md` and `timing-debugging.md` loaded completely before diagnosing failures
- [ ] Playwright Utils and Pact.js Utils mandates retained when applicable
- [ ] Source, runner reports and traces used when optional browser tools are unavailable

### Test Execution and Classification

- [ ] Every generated test executed with the project's configured runner, services and existing timeout/retry settings when validation is enabled and available
- [ ] Fresh scoped reports capture command, exit status, total/passed/failed/skipped counts, load errors, full error messages and stack traces
- [ ] Missing, skipped or empty execution evidence cannot count as passing coverage
- [ ] Each failure classified with runtime/source evidence: selector, timing, data, network, hard wait, syntax/import/setup, real product defect or unknown/environment
- [ ] Product defects and unavailable environments preserved and reported before considering any test repair

### Bounded Healing Loop

- [ ] Only confirmed defects in this run's generated tests/support files repaired when healing is enabled
- [ ] Stale selector corrected only after observing the same intended element and its existing test ID, role/name or scoped locator
- [ ] Timing or hard-wait defect corrected by awaiting the actual effect or registering its event/state wait before the trigger
- [ ] Data/setup defect corrected from authoritative factory or setup evidence while retaining exact expected business outcomes
- [ ] Network defect corrected only within the known service/URL or existing declared external double; real SUT failure preserved
- [ ] Syntax/import/setup defect corrected using actual project conventions and exports
- [ ] Criteria, assertion operators/expected values, coverage and production source unchanged
- [ ] No added skip, `test.fixme()`, expected-failure annotation, relaxed matcher, larger test timeout, arbitrary sleep or SUT mock hides a failure
- [ ] Incremented `healing_rounds_used` persisted before edits; Resume retains this budget
- [ ] Repaired tests and tests sharing changed support executed again, with fresh final execution of the complete generated scope
- [ ] Stopped when generated coverage passes, only preserved/blocked failures remain, or the configured maximum of three repair rounds is used

### Execution and Healing Report

- [ ] Report written in this scope's existing automation summary even when healing is disabled or execution is blocked
- [ ] Resolved settings, diagnosis tools, rounds used, commands and report/trace paths recorded
- [ ] Initial and final execution counts and status (`passed`, `failed`, `could not measure` or `disabled`) recorded
- [ ] Each healed file:line includes failure class, evidence and exact change
- [ ] Confirmed product defects retain unchanged assertions and reproduction evidence
- [ ] Unresolved generated test failures remain active with attempts and next action documented
- [ ] Environment blockers or unknown causes recorded without speculative repairs
- [ ] Generation completion distinguished from passing execution; no green claim for unresolved results

---

## Step 6: Documentation and Scripts Updated

### Test README Updated

- [ ] `tests/README.md` created or updated (if `{update_readme}` true)
- [ ] Test suite structure overview included
- [ ] Test execution instructions provided (all, specific files, by priority)
- [ ] Fixture usage examples provided
- [ ] Factory usage examples provided
- [ ] Priority tagging convention explained ([P0], [P1], [P2], [P3])
- [ ] How to write new tests documented
- [ ] Common patterns documented
- [ ] Anti-patterns documented (what to avoid)

### package.json Scripts Updated

- [ ] package.json scripts added/updated (if `{update_package_scripts}` true)
- [ ] `test:e2e` script for all E2E tests
- [ ] `test:e2e:p0` script for P0 tests only
- [ ] `test:e2e:p1` script for P0 + P1 tests
- [ ] `test:api` script for API tests
- [ ] `test:component` script for component tests
- [ ] `test:unit` script for unit tests (if applicable)

### Generated-Scope Execution Recorded

- [ ] Create's shared loop execution evidence reused in the summary; no second repair loop started
- [ ] `{auto_validate}` controls generated-scope execution, enabled by default
- [ ] A legacy `{run_tests_after_generation}` preference for an additional suite run does not override `auto_validate`; broader execution requires an explicit requested scope and is never a completion gate
- [ ] Test results, determinism concerns, setup requirements and known issues documented

---

## Step 6: Automation Summary Generated

### Automation Summary Document

- [ ] Output file created at `{test_artifacts}/automate/automation-summary-{run_key}.md`
- [ ] `run_key` follows the shared grammar (`story-{story_key}`, `epic-{epic_num}`, `target-{slug}`, or `system`) and was resolved before the first save
- [ ] Frontmatter carries `runScope` and `runKey` matching this run's scope
- [ ] No summary for another scope was read or written, and no earlier run's content was merged into this summary
- [ ] Document includes execution mode (BMad-Integrated, Standalone, Auto-discover)
- [ ] Feature analysis included (source files, coverage gaps) - Standalone mode
- [ ] Tests created listed (E2E, API, Component, Unit) with counts and paths
- [ ] Infrastructure created listed (fixtures, factories, helpers)
- [ ] Test execution instructions provided
- [ ] Coverage analysis included:
  - [ ] Total test count
  - [ ] Priority breakdown (P0, P1, P2, P3 counts)
  - [ ] Test level breakdown (E2E, API, Component, Unit counts)
  - [ ] Coverage percentage (if calculated)
  - [ ] Coverage status (acceptance criteria covered, gaps identified)
- [ ] Definition of Done checklist included
- [ ] Next steps provided
- [ ] Recommendations included (if Standalone mode)

### Summary Provided to User

- [ ] Concise summary output provided
- [ ] Total tests created across test levels
- [ ] Priority breakdown (P0, P1, P2, P3 counts)
- [ ] Infrastructure counts (fixtures, factories, helpers)
- [ ] Test execution command provided
- [ ] Output file path provided
- [ ] Next steps listed

---

## Quality Checks

### Test Design Quality

- [ ] Tests are readable (clear Given-When-Then structure)
- [ ] Tests are maintainable (use factories/fixtures with exact scenario-defined inputs and expectations)
- [ ] Tests are isolated (no shared state between tests)
- [ ] Tests are deterministic (no race conditions or flaky patterns)
- [ ] Tests are atomic (one assertion per test)
- [ ] Tests are fast (no unnecessary waits or delays)
- [ ] Tests are lean (files under {max_file_lines} lines)

### Knowledge Base Integration

- [ ] Test level selection framework applied (from `test-levels-framework.md`)
- [ ] Priority classification applied (from `test-priorities.md`)
- [ ] Fixture architecture patterns applied (from `fixture-architecture.md`)
- [ ] Data factory patterns applied (from `data-factories.md`)
- [ ] Selective testing strategies considered (from `selective-testing.md`)
- [ ] Flaky test detection patterns considered (from `ci-burn-in.md`)
- [ ] Test quality principles applied (from `test-quality.md`)

### Code Quality

- [ ] All TypeScript types are correct and complete
- [ ] No linting errors in generated test files
- [ ] Consistent naming conventions followed
- [ ] Imports are organized and correct
- [ ] Code follows project style guide
- [ ] No console.log or debug statements in test code

---

## Integration Points

### With Framework Workflow

- [ ] Test framework configuration detected and used
- [ ] Directory structure matches framework setup
- [ ] Fixtures and helpers follow established patterns
- [ ] Naming conventions consistent with framework standards

### With BMad Workflows (If Available - OPTIONAL)

**With Story Workflow:**

- [ ] Story ID correctly referenced in output (if story available)
- [ ] Acceptance criteria from story reflected in tests (if story available)
- [ ] Technical constraints from story considered (if story available)

**With test-design Workflow:**

- [ ] P0 scenarios from test-design prioritized (if test-design available)
- [ ] Risk assessment from test-design considered (if test-design available)
- [ ] Coverage strategy aligned with test-design (if test-design available)

**With atdd Workflow:**

- [ ] ATDD artifacts provided or located (manual handoff; `atdd` not auto-run)
- [ ] Existing ATDD tests checked (if story had ATDD workflow run)
- [ ] Expansion beyond ATDD planned (edge cases, negative paths)
- [ ] No duplicate coverage with ATDD tests

### With CI Pipeline

- [ ] Tests can run in CI environment
- [ ] Tests are parallelizable (no shared state)
- [ ] Tests have appropriate timeouts
- [ ] Tests clean up their data (no CI environment pollution)

---

## Completion Criteria

Check the generation deliverables below and record the shared loop's actual execution status before marking Create complete. Validate reports unmet criteria; Edit checks the changed outputs. Passing execution is reported separately from workflow completion.

- [ ] **Execution mode determined** (BMad-Integrated, Standalone, or Auto-discover)
- [ ] **Framework configuration loaded** and validated
- [ ] **Coverage analysis completed** (gaps identified if analyze_coverage true)
- [ ] **Automation targets identified** (what needs testing)
- [ ] **Test levels selected** appropriately (E2E, API, Component, Unit)
- [ ] **Duplicate coverage avoided** (same behavior not tested at multiple levels)
- [ ] **Test priorities assigned** (P0, P1, P2, P3)
- [ ] **Fixture architecture created/enhanced** with auto-cleanup
- [ ] **Data factories created/enhanced** using faker for unconstrained fields and exact scenario overrides for criterion-defined inputs
- [ ] **Helper utilities created/enhanced** (if needed)
- [ ] **Test files generated** at appropriate levels (E2E, API, Component, Unit)
- [ ] **Given-When-Then format used** consistently across all tests
- [ ] **Priority tags added** to all test names ([P0], [P1], [P2], [P3])
- [ ] **data-testid selectors used** in E2E tests (not CSS classes)
- [ ] **Network-first pattern applied** (route interception before navigation)
- [ ] **Quality standards enforced** (no hard waits, no flaky patterns, self-cleaning, deterministic)
- [ ] **Test README updated** with execution instructions and patterns
- [ ] **package.json scripts updated** with test execution commands
- [ ] **Generated-scope execution recorded** with resolved settings and passed, failed, blocked or disabled status
- [ ] **Confirmed test repairs attempted within the retained budget** when enabled; no requirement to heal real product defects or every unresolved failure
- [ ] **Execution and healing report generated** with commands, counts, changes and remaining issues
- [ ] **Remaining failures reported** with unchanged assertions and reproduction evidence
- [ ] **Automation summary created** and saved to correct location
- [ ] **Output file formatted correctly**
- [ ] **Knowledge base references applied** and documented (including healing fragments if used)
- [ ] **No unreported test quality issues** (flaky patterns, race conditions, uncontrolled fixture data, page objects)
- [ ] **Provider scrutiny completed or gracefully degraded** for all CDC interactions — each interaction either has scrutiny evidence or a TODO marker (if `use_pactjs_utils` enabled)
- [ ] **Provider endpoint comments present** on every Pact interaction (if `use_pactjs_utils` enabled)

---

## Common Issues and Resolutions

### Issue: BMad artifacts not found

**Problem:** Story, tech-spec, or PRD files not found when variables are set.

**Resolution:**

- **automate does NOT require BMad artifacts** - they are OPTIONAL enhancements
- If files not found, switch to Standalone Mode automatically
- Analyze source code directly without BMad context
- Continue workflow without halting

### Issue: Framework configuration not found

**Problem:** No playwright.config.ts or cypress.config.ts found.

**Resolution:**

- **HALT workflow** - framework is required
- Message: "Framework scaffolding required. Run `/bmad-testarch-framework` first."
- User must run framework workflow before automate

### Issue: No automation targets identified

**Problem:** Neither story, target_feature, nor target_files specified, and auto-discover finds nothing.

**Resolution:**

- Check if source_dir variable is correct
- Verify source code exists in project
- Ask user to specify target_feature or target_files explicitly
- Provide examples: `target_feature: "src/auth/"` or `target_files: "src/auth/login.ts,src/auth/session.ts"`

### Issue: Duplicate coverage detected

**Problem:** Same behavior tested at multiple levels (E2E + API + Component).

**Resolution:**

- Review test level selection framework (test-levels-framework.md)
- Use E2E for critical happy path ONLY
- Use API for business logic variations
- Use Component for UI edge cases
- Remove redundant tests that duplicate coverage

### Issue: Tests have hardcoded data

**Problem:** Generated setup invents identities or shares fixture data across tests.

**Resolution:**

- Move generated setup identities and random input data into factories while preserving criterion-defined exact expected values
- Use faker for unconstrained random fields; preserve exact criterion-defined business inputs, boundary cases and expected outcomes
- Update data-factories to support all required test scenarios
- Example: `createUser({ email: faker.internet.email() })`

### Issue: Tests are flaky

**Problem:** Tests fail intermittently, pass on retry.

**Resolution:**

- Remove all hard waits (`page.waitForTimeout()`)
- Use the project's mandated event/state wait helpers, including `recurse` when Playwright Utils requires it
- Apply network-first pattern (route interception before navigation)
- Remove conditional flow (`if (await element.isVisible())`)
- Ensure tests are deterministic (no race conditions)
- Record repeated-run evidence when explicitly requested through a separate burn-in scope; it cannot extend the shared loop's three repair rounds or become a completion gate

### Issue: Fixtures don't clean up data

**Problem:** Test data persists after test run, causing test pollution.

**Resolution:**

- Ensure all fixtures have cleanup in teardown phase
- Cleanup happens AFTER `await use(data)`
- Call deletion/cleanup functions (deleteUser, deleteProduct, etc.)
- Verify cleanup works by checking database/storage after test run

### Issue: Tests too slow

**Problem:** Tests take longer than 90 seconds (max_test_duration).

**Resolution:**

- Remove unnecessary waits and delays
- Use parallel execution where possible
- Retain the scenario's declared external doubles and real SUT boundary; report slow real behavior without inventing a success mock
- Select API coverage for business logic during coverage planning while preserving every scenario and assertion during healing
- Optimize generated fixture setup within the existing project environment; preserve the required service/database boundary

---

## Notes for TEA Agent

- **automate is flexible:** Can work with or without BMad artifacts (story, tech-spec, PRD are OPTIONAL)
- **Standalone mode is powerful:** Analyze any codebase and generate tests independently
- **Auto-discover mode:** Scan codebase for features needing tests when no targets specified
- **Framework is the ONLY hard requirement:** HALT if framework config missing, otherwise proceed
- **Avoid duplicate coverage:** E2E for critical paths only, API/Component for variations
- **Priority tagging enables selective execution:** P0 tests run on every commit, P1 on PR, P2 nightly
- **Network-first pattern prevents race conditions:** Route interception BEFORE navigation
- **No page objects:** Keep tests simple, direct, and maintainable
- **Use knowledge base:** Load relevant fragments (test-levels, test-priorities, fixture-architecture, data-factories, healing patterns) for guidance
- **Deterministic tests only:** No hard waits, no conditional flow, no flaky patterns allowed
- **Default healing:** Create executes generated tests through the shared resource and repairs confirmed test defects within at most three rounds, with the retained Resume count
- **Graceful degradation:** Source and execution evidence support diagnosis without Playwright MCP; unavailable execution remains a reported blocker
- **Remaining failures:** Keep assertions and report product defects, environment blockers and unresolved test defects
