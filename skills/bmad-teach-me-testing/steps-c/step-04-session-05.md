---
name: 'step-04-session-05'
description: 'Session 5: ATDD & Automate - TDD red-green approach, generate tests (60 min)'

progressFile: '{test_artifacts}/teaching-progress/{user_name}-tea-progress.yaml'
sessionNotesTemplate: '../templates/session-notes-template.md'
sessionNotesFile: '{test_artifacts}/tea-academy/{user_name}/session-05-notes.md'
nextStepFile: '{skill-root}/steps-c/step-03-session-menu.md'
---

# Step 4: Session 5 - ATDD & Automate

## STEP GOAL:

To teach ATDD (red-green TDD) and Automate workflows for test generation in a 60-minute session.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 🛑 NEVER generate content without user input
- 📖 CRITICAL: Read complete step file before action
- ✅ YOU MUST ALWAYS SPEAK OUTPUT In {communication_language}

### Role Reinforcement:

- ✅ Master Test Architect and Teaching Guide
- ✅ Collaborative learning

### Step-Specific Rules:

- 🎯 Focus on Session 5 (ATDD & Automate)
- 💬 Teach TDD approach

## EXECUTION PROTOCOLS:

- 🎯 Load docs just-in-time
- 💾 Generate notes
- 📖 Update progress
- ⏭️ Return to hub

## MANDATORY SEQUENCE

### 1. Welcome

"🧪 **Session 5: ATDD & Automate** (60 minutes)

**Objective:** Generate tests with TDD red-green approach

**What you'll learn:**

- Automation red mode (failing tests first)
- Automation expand mode (expand coverage)
- Component TDD
- API testing patterns

Let's generate some tests!"

### 2. Update Progress (Started)

Load {progressFile} and update session-05-atdd-automate:

- Set `status: 'in-progress'`
- Set `started_date: {current_date}` if not already set

Save the updated progress file.

### 3. Teaching: Automation Red Mode (ATDD)

"### 🔴 ATDD: Acceptance-Driven Test Development

**TDD Red Phase:** Write failing tests FIRST

**Automation red mode:** `/bmad-testarch-atdd` and `AT` select red by default. `/bmad-testarch-automate` also supports an explicit red request.

**Create sequence:**

1. **Preflight:** Check prerequisites
2. **Test Strategy:** Define what to test
3. **Generate FAILING Tests:** Red phase (tests fail because code doesn't exist yet)
4. **Run and Heal:** Confirm each failure matches missing behavior; repair test errors for up to three rounds
5. **Implement Code:** Green phase (make tests pass)

**Why Failing Tests First:**

- Validates tests actually test something
- Prevents false positives
- Drives implementation (tests define behavior)

{Role-adapted example}

**Documentation:** <https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/how-to/workflows/run-atdd/>"

### 4. Teaching: Automation Expand Mode

"### 🤖 Automate: Expand Test Coverage

**Purpose:** Generate tests for existing features

**Automation expand mode:** `/bmad-testarch-automate` and `TA` select expand by default. An explicit mode in the prompt selects red or expand. Unattended runs keep the invoked command's default when mode is unclear.

**Create sequence:**

1. **Identify Targets:** What needs testing
2. **Generate Tests:** API and/or E2E tests
3. **Run and Heal:** Execute generated tests, classify failures, repair test issues, and rerun up to three rounds
4. **Review Results:** Passing tests establish coverage; real product defects retain their assertions and remain findings

**Two modes in one automation skill:**

- ATDD: Tests first, then code (red → green)
- Expand: Code first, then tests (coverage expansion)

Create runs execute and heal by default. Validate reports findings and Edit checks the requested changes; neither operation repairs tests. Each mode keeps its original customization hooks and output folder.

{Role-adapted example}

**Documentation:** <https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/how-to/workflows/run-automate/>"

### 5. Teaching: Component TDD

"### 🔄 Component TDD Red-Green Loop

**Pattern:**

1. **Red:** Write failing test
2. **Green:** Minimal code to pass
3. **Refactor:** Improve code, tests stay green
4. **Repeat:** Next requirement

**Example:**

```typescript
// RED: Test fails (function doesn't exist)
test('calculates total price', () => {
  expect(calculateTotal([10, 20])).toBe(30);
});

// GREEN: Minimal implementation
function calculateTotal(prices) {
  return prices.reduce((a, b) => a + b, 0);
}

// REFACTOR: Add validation, tests still green
```

{Role-adapted example}

**Knowledge Fragment:** component-tdd.md"

### 6. Teaching: API Testing Patterns

"### 🌐 API Testing Patterns

**Pure API Testing (no browser):**

- Fast execution
- Test business logic
- Validate responses
- Schema validation

**Pattern:**

```typescript
test('GET /users returns user list', async ({ request }) => {
  const response = await request.get('/api/users');
  expect(response.ok()).toBeTruthy();
  const users = await response.json();
  expect(users).toHaveLength(10);
});
```

{Role-adapted example}

**Knowledge Fragment:** api-testing-patterns.md, api-request.md"

### 7. Quiz (3 questions)

**Q1:** "What is the 'red' phase in TDD?
A) Tests fail (code doesn't exist yet)
B) Tests pass
C) Code is refactored
D) Tests are deleted"

Correct: A

**Q2:** "What's the difference between automation red/expand modes?
A) ATDD generates E2E, Automate generates API tests
B) ATDD writes tests first (red phase), Automate tests existing code
C) ATDD is faster than Automate
D) They're the same workflow"

Correct: B

**Q3:** "Why use pure API tests without a browser?
A) They look prettier
B) They're easier to debug
C) They're faster and test business logic directly
D) They're required by TEA"

Correct: C

Calculate score, handle <70% retry.

### 8. Generate Session Notes

Create {sessionNotesFile} with Session 5 content:

- Automation red mode (ATDD, red-green TDD)
- Automation expand mode (coverage expansion)
- Component TDD
- API testing patterns
- Docs: ATDD, Automate
- Fragments: component-tdd.md, api-testing-patterns.md, api-request.md
- Quiz results

### 9. Update Progress (Completed)

Update session-05-atdd-automate: completed, score, notes.
Increment sessions_completed, update percentage.
Append 'step-04-session-05' to stepsCompleted.
Set next_recommended: 'session-06-quality-trace'.

### 10. Complete Message

"🎉 **Session 5 Complete!** Score: {score}/100
You can now generate tests with ATDD and Automate!
Progress: {completion_percentage}%"

### 11. Menu

[A] Advanced Elicitation [P] Party Mode [C] Continue to Session Menu

Return to {nextStepFile}.

---

## 🚨 SUCCESS METRICS

✅ ATDD and Automate taught, TDD explained, quiz passed, notes generated, progress updated, returned to hub.
