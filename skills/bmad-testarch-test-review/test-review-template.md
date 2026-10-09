---
workflowType: 'testarch-test-review'
runScope: ''
runKey: ''
---

# Test Quality Review: {test_filename}

**Quality Score**: {score}/100 ({grade} - {assessment})
**Raw Deduction Score**: {raw_score}/100
**Score Cap**: {score_cap}/100
**Score Override Rule**: {score_override_rule}
**Review Date**: {YYYY-MM-DD}
**Review Mode**: {pr | full-file}
**Reviewer**: {headless: the CLI fills this in; interactive: user_name}

---

<!-- A headless run carries only the frontmatter above. In a headless run do not write `stepsCompleted`, `lastStep`, `lastSaved`, `workflowStatus` or `inputDocuments`: they are resume state for an interactive run and mean nothing in CI. -->

Note: This review audits existing tests; it does not generate tests.
Coverage mapping and coverage gates are out of scope here. Use `trace` for coverage decisions.

## Executive Summary

**Overall Assessment**: {Excellent | Good | Acceptable | Needs Improvement | Critical Issues}

**Recommendation**: {Approve | Approve with Comments | Request Changes | Block}
**Verdict Rule**: {verdict_rule}

<!-- COMPUTED, never chosen. steps-c/step-03f-aggregate-scores.md §3b derives this from the
     deduped violation counts: any CRITICAL => Block; any HIGH => Request Changes; score < 70 =>
     Request Changes; any remaining finding => Approve with Comments; otherwise Approve. Copy the
     computed value into this line and into `## Decision` unchanged: the CLI rejects a report
     whose two copies disagree. A waiver changes the exit code, never this value. -->

**Context Basis**: {none | pr_diff | pr_diff_truncated}

**Context Waivers Applied**: 0

**Execution Mode**: {agent-team | subagent | sequential}

<!-- Context can add findings and clarify impact. It cannot waive a rubric violation, change severity, or alter the score. This machine-readable value must remain 0. -->

### Key Strengths

{Optional, at most three bullets. Omit the subsection when there is nothing specific to credit.}

✅ {strength}

### Advisory Observations

{Optional. Useful unscored suggestions that do not affect the score or recommendation. Omit the subsection when empty; never render an empty bullet or `n/a`.}

ℹ️ {unscored_optional_suggestion}

### Summary

{One short paragraph: the verdict in plain words and what kind of problem drives it. Name no finding's location, quote no finding's text; the findings below carry them. A pull request review speaks only to what the pull request changed or broke.}

---

## Quality Criteria Assessment

| Criterion                            | Status                          | Violations | Basis        | Notes                           |
| ------------------------------------ | ------------------------------- | ---------- | ------------ | ------------------------------- |
| BDD Format (Given-When-Then)         | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | {basis}      | {brief_note}                    |
| Test IDs                             | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | {basis}      | {brief_note}                    |
| Priority Markers (P0/P1/P2/P3)       | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | {basis}      | {brief_note}                    |
| Disabled or Focused Tests            | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | Absolute     | {brief_note}                    |
| Hard Waits (sleep, waitForTimeout)   | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | Absolute     | {brief_note}                    |
| Determinism (no conditionals)        | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | {basis}      | {brief_note}                    |
| Isolation (cleanup, no shared state) | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | Absolute     | {brief_note}                    |
| Fixture Patterns                     | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | {basis}      | {brief_note}                    |
| Data Factories                       | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | {basis}      | {brief_note}                    |
| Network-First Pattern                | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | {basis}      | {brief_note}                    |
| Playwright Utils Adoption            | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | {basis}      | {brief_note}                    |
| Pact.js Utils Adoption               | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | {basis}      | {brief_note}                    |
| Explicit Assertions                  | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | Absolute     | {brief_note}                    |
| Test Length (≤1000 lines)            | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | Absolute     | {lines} lines                   |
| Test Duration (≤1.5 min)             | ➖ Not measured                 | -          | Not measured | A static read cannot time a run |
| Flakiness Patterns                   | {✅ PASS \| ⚠️ WARN \| ❌ FAIL} | {count}    | {basis}      | {brief_note}                    |

<!-- {basis} states what decided the row, per steps-c/criteria-registry.md: `Absolute`,
     `Applicability: <what the file must do>`, or `Convention: <key> (<adopted> of <sampled> sampled)` —
     that exact literal form, "sampled" spelled out both after the count and at the close, e.g.
     `Convention: priorityMarkers ({adopted} of {sampled} sampled)`. When a headless run supplies a pre-computed
     `convention_baseline` (see step-02-discover-tests.md §2b's CLI exception), `<sampled>` here MUST
     equal the corpus's `sampled` value exactly, and `<adopted>` MUST be 0 for any mechanically-checked
     key the run reports found zero real occurrences of — the CLI parses this line verbatim and rejects
     a report that disagrees with what it actually measured. A row that does not apply to this repository
     (a closed convention or applicability gate, a utility the project does not use) is omitted from the table:
     its absence is not something to report. A bare WARN with no basis is the defect this column exists to
     prevent: it reads identically in a repo that has the convention and one that has never used it, so the
     reader cannot tell drift from the rubric's own preference. Never leave {basis} unfilled.
     Measured and unmeasured are different claims. Test Length uses the exact line counts the run supplies.
     Test Duration is always `Not measured`: a static read cannot time a run. State no test count, assertion
     count or duration unless the run supplied it or you label it `(estimate)`. -->

**Total Violations**: {critical_count} Critical, {high_count} High, {medium_count} Medium, {low_count} Low

<!-- Exactly one line below, exactly one of two literal forms — the CLI parses it and rejects any other
     shape: `{sampled} test files sampled outside the review set`, or, only when the baseline could not
     be measured, `unavailable: {reason}` in place of the whole value after the colon. Omit the line
     entirely only when a headless run recorded baselineUnavailable AND you are citing no
     "Convention: <key> (...)" fraction anywhere in the report; otherwise it is required. -->

**Convention Baseline**: {sampled} test files sampled outside the review set

---

## Quality Score Breakdown

```text
Starting Score:          100
Critical Violations:     -{critical_count} × 10 = -{critical_deduction}
High Violations:         -{high_count} × 5 = -{high_deduction}
Medium Violations:       -{medium_count} × 2 = -{medium_deduction}
Low Violations:          -{low_count} × 1 = -{low_deduction}

Bonus Points:
  Excellent BDD:         +{0|5}
  Comprehensive Fixtures: +{0|5}
  Data Factories:        +{0|5}
  Network-First:         +{0|5}
  Perfect Isolation:     +{0|5}
  All Test IDs:          +{0|5}
                         --------
Total Bonus:             +{bonus_total}

Raw Deduction Score:     {raw_score}/100
Score Cap:               {score_cap}/100 ({highest_severity_or_none})
Effective Score:         {final_score}/100
Grade:                   {grade}
```

<!-- This ledger is the workflow's only scoring model (see steps-c/step-03f-aggregate-scores.md).
     Every bonus line is 0 or 5, never a partial value, and the six categories above are the
     complete set. {grade} is exactly one of A, B, C, D, F, with no modifier such as A+ or B-.
     The deduction lines and bonus must sum to {raw_score}. The highest finding severity caps
     that raw score at Critical 69, High 79, Medium 89, or Low 99; no findings use cap 100.
     {final_score} is min(raw score, cap), must equal the **Quality Score** line, and determines
     the grade. Headless runners compute and normalize all score and grade fields. -->

---

<!-- **Row** is the criteria-registry identity that produced the finding (C1, H2, M4, ...). It is what makes one reviewer's finding comparable to another's. A finding with no row has no severity either, so it is not a finding. Each finding appears once, here: one location, one explanation of the failure, one concrete fix. Include code only when it clarifies the evidence. -->

## Critical Issues (Must Fix)

{If no critical issues: "No critical issues detected. ✅"}

### {issue_number}. {Issue Title}

**Severity**: P0 (Critical)
**Location**: `{filename}:{line_number}`
**Row**: {registry_row_id}
**Provenance**: {introduced | modified | pre_existing; omit when changed-line evidence is unavailable}

**Issue**: {what is wrong and why it fails, in two or three sentences}

**Fix**: {the concrete change, with a short snippet only when it clarifies}

---

## Recommendations (Should Fix)

{If no recommendations: "No additional recommendations. ✅"}

### {rec_number}. {Recommendation Title}

**Severity**: {P1 (High) | P2 (Medium) | P3 (Low)}
**Location**: `{filename}:{line_number}`
**Row**: {registry_row_id}
**Provenance**: {introduced | modified | pre_existing; omit when changed-line evidence is unavailable}

**Issue**: {what could be improved and why, in two or three sentences}

**Fix**: {the concrete change, with a short snippet only when it clarifies}

---

## Decision

**Recommendation**: {Approve | Approve with Comments | Request Changes | Block}

---

<!-- Machine-readable evidence manifest. Every file actually reviewed, one repo-relative path per line, nothing else in this section: headless runners parse it verbatim as the reviewed-file list. -->

## Reviewed Files

- {relative_path_1}
- {relative_path_2}

<!-- Machine-readable context manifest. Every context artifact actually read, one repo-relative path per line, or the single word `none`. Required whenever Context Basis is not `none`. These files were read, never scored: no path may appear in both this section and Reviewed Files. -->

## Review Context

- {context_path_1}
- {context_path_2}

<!-- Disclosure manifest. Present whenever anything a reader would expect in the reviewed set is not there; omit the whole section when nothing was excluded. One repo-relative path per line, each with one of the three reasons from step-02-discover-tests: `path does not exist`, `file could not be parsed`, or `format not scorable by the ledger`. When the run supplied an ---BEGIN UNSCORABLE--- block, reproduce every path in it here verbatim with the third reason, dropping none — the CLI rejects a report that dropped one. Nothing here was reviewed or scored, and no path here may appear in Reviewed Files. A manifest that silently omits a changed test artifact reads as though the diff held nothing else to review. -->

## Excluded From Review Set

- {unscorable_path_1} — format not scorable by the ledger
- {missing_path_1} — path does not exist
- {unparseable_path_1} — file could not be parsed

`--test-glob` brings any of these into the review set when it should be scored.
