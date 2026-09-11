# Test Design: Epic 9 - Show the last successful sync time on the technician home screen

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description                                                                                                  | Probability | Impact | Score | Mitigation      | Owner  | Timeline |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------ | ----------- | ------ | ----- | --------------- | ------ | -------- |
| R-001   | SEC      | The sync timestamp could expose sensitive personal data to an unauthorized person with access to the screen. | 2           | 3      | 6     | Access review   | Mobile | Q3       |
| R-002   | DATA     | Reading the settings store could corrupt the stored record and drop a queued entry.                          | 2           | 3      | 6     | Read-only guard | Mobile | Q3       |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description                                                                                           | Probability | Impact | Score | Mitigation           | Owner   |
| ------- | -------- | ----------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | -------------------- | ------- |
| R-003   | PERF     | The extra read could slow the home screen render and degrade startup latency.                         | 2           | 2      | 4     | Benchmark the screen | Mobile  |
| R-004   | OPS      | The new row cannot be disabled without a new build, so a bad rollout has no kill switch.              | 2           | 2      | 4     | Add a flag           | Release |
| R-005   | BUS      | A relative time on a device whose clock has drifted reads as recent when the last sync was hours ago. | 2           | 2      | 4     | Label the timezone   | Mobile  |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description                                                                 | Probability | Impact | Score | Action   |
| ------- | -------- | --------------------------------------------------------------------------- | ----------- | ------ | ----- | -------- |
| R-006   | TECH     | A device that has never synced has no value for the row.                    | 2           | 1      | 2     | Document |
| R-007   | BUS      | The wording of the relative time has not been reviewed by the content team. | 1           | 1      | 1     | Document |

## Test Coverage Plan

### P0 (Critical)

| Requirement               | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------------------- | ---------- | --------- | ---------- | ----- | ----- |
| Timestamp exposure review | E2E        | R-001     | 2          | QA    |       |
| Store is opened read-only | Unit       | R-002     | 3          | DEV   |       |

### P2 (Medium)

| Requirement                | Test Level | Risk Link | Test Count | Owner | Notes |
| -------------------------- | ---------- | --------- | ---------- | ----- | ----- |
| Render budget holds        | Component  | R-003     | 2          | DEV   |       |
| Flag disables the row      | E2E        | R-004     | 1          | QA    |       |
| Relative time is correct   | Unit       | R-005     | 3          | DEV   |       |
| Absent value hides the row | Component  | R-006     | 2          | DEV   |       |
| Wording review             | Unit       | R-007     | 1          | DEV   |       |
