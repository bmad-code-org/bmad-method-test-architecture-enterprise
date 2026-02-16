# Audit Standards Integration

## Purpose

When the **Audit Standards Enterprise (ASE)** module is installed (`{project-root}/_bmad/audit/` exists), TEA workflows gain enhanced traceability by linking tests to formal requirement IDs defined through ISO 29148 and other compliance standards.

This fragment teaches TEA how to detect, extract, and use formal requirement IDs from audited project artifacts.

## Detection

ASE integration is active when **either** condition is true:

1. **Module installed:** Directory `{project-root}/_bmad/audit/` exists
2. **FR IDs present:** PRD or requirements documents contain formal ID patterns (see below)

If neither condition is met, all audit-related fields are omitted — TEA behaves exactly as before.

## Requirement ID Formats

### Functional Requirements (FR)

| Pattern | Level | Example | Source |
|---------|-------|---------|--------|
| `FR-[AREA]-###` | Software (SRS/PRD) | FR-AUTH-001 | ISO 29148 Clause 9 |
| `SYS-FUNC-###` | System (SyRS) | SYS-FUNC-012 | ISO 29148 Clause 8 |
| `STK-BIZ-###` | Stakeholder (StRS) | STK-BIZ-003 | ISO 29148 Clause 7 |

Common AREA tags: AUTH, USER, DATA, SEARCH, NOTIFY, PAY, REPORT, ADMIN, API, UI

### Non-Functional Requirements (NFR)

| Pattern | Level | Example | Source |
|---------|-------|---------|--------|
| `NFR-[AREA]-###` | Software (SRS/PRD) | NFR-PERF-001 | ISO 29148 Clause 9 |
| `SYS-PERF-###` | System (SyRS) | SYS-PERF-005 | ISO 29148 Clause 8 |
| `SYS-SEC-###` | System security | SYS-SEC-002 | ISO 29148 Clause 8 |
| `SYS-USAB-###` | System usability | SYS-USAB-001 | ISO 29148 Clause 8 |

Common NFR AREA tags: PERF, SEC, AVAIL, SCALE, USAB, MAINT, PORT, COMPAT

### Extraction Regex

```
FR:  /(?:FR|SYS-FUNC|STK-[A-Z]+)-[A-Z]+-\d{3}/g
NFR: /(?:NFR|SYS-(?:PERF|SEC|USAB|AVAIL|SCALE|MAINT))-[A-Z]*-?\d{3}/g
```

## Traceability Chain

When audit IDs are present, TEA extends the standard traceability chain:

```
Standard:  Story AC → Test Cases → Coverage
Extended:  FR/NFR ID → Story AC → Test Cases → Coverage → V&V Method
```

The extended chain enables:
- **FR completeness check:** Every FR-XXX-### has at least one test
- **NFR coverage check:** Every NFR-XXX-### has an assessment or test
- **Upstream traceability:** Tests trace back to formal requirements, not just stories
- **V&V method validation:** Test type matches the assigned V&V method (Test/Demonstration/Analysis/Inspection)

## TEA Workflow Integration Points

### Trace Workflow (TR)
- **step-01:** Extract FR IDs from PRD/requirements alongside acceptance criteria
- **step-03:** Add `FR ID` column to traceability matrix
- **step-05:** Add FR completeness metric to gate decision

### Test Design Workflow (TD)
- **step-02:** Extract FR IDs when loading PRD context
- **template:** Add `FR ID` column to test coverage plan tables

### NFR Assessment Workflow (NR)
- **step-01:** Extract NFR IDs when loading PRD/tech-spec context
- **template:** Add `NFR ID` column to assessment tables

## V&V Method Mapping

When V&V methods are assigned in audited requirements, TEA can validate test type alignment:

| V&V Method | Expected TEA Coverage |
|------------|----------------------|
| **Test** | Automated test (unit/integration/E2E) |
| **Demonstration** | E2E test or manual test scenario |
| **Analysis** | Code review finding or architectural analysis |
| **Inspection** | Code review or static analysis result |

## Output Enrichment

When audit integration is active, TEA reports include:
- `FR Coverage` metric: percentage of FR IDs with at least one test
- `NFR Coverage` metric: percentage of NFR IDs with assessment
- `Audit Module` field in gate YAML: `installed: true`
- Individual FR/NFR ID columns in mapping tables

---

*This knowledge fragment supports TEA ↔ Audit Standards Enterprise module integration.*
