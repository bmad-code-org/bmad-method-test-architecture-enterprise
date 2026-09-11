# Test Design: Epic 7 - Offline order capture for field technicians

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description                                                                                                                                             | Probability | Impact | Score | Mitigation                               | Owner    | Timeline |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ---------------------------------------- | -------- | -------- |
| R-001   | SEC      | The outbound queue is stored unencrypted on the device, so anyone reaching the local file can read the stored card reference.                           | 2           | 3      | 6     | Encrypt the queue                        | Mobile   | Q3       |
| R-002   | DATA     | Concurrent offline edits to the same work order overwrite each other on sync, because the server applies queued edits by arrival with no version check. | 3           | 3      | 9     | Add a version check                      | Platform | Q3       |
| R-003   | TECH     | A rejected payload is retried forever with no backoff and no attempt cap, so one bad item loops until the application is killed.                        | 3           | 2      | 6     | Cap attempts and add a dead-letter queue | Mobile   | Q3       |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description                                                                                                         | Probability | Impact | Score | Mitigation       | Owner  |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ---------------- | ------ |
| R-004   | PERF     | A 2000 item backlog may not finish syncing inside the 30 second budget on the mid-range hardware the fleet carries. | 2           | 2      | 4     | Batch the upload | Mobile |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description                                                                                         | Probability | Impact | Score | Action  |
| ------- | -------- | --------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ------- |
| R-005   | OPS      | There is no feature flag, so a bad release cannot be turned off without shipping a new store build. | 1           | 2      | 2     | Monitor |

## Test Coverage Plan

### P0 (Critical)

| Requirement                     | Test Level  | Risk Link | Test Count | Owner | Notes |
| ------------------------------- | ----------- | --------- | ---------- | ----- | ----- |
| Queue is encrypted at rest      | Integration | R-001     | 3          | QA    |       |
| Concurrent edits do not clobber | E2E         | R-002     | 4          | QA    |       |

### P1 (High)

| Requirement        | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------------ | ---------- | --------- | ---------- | ----- | ----- |
| Retry policy stops | Unit       | R-003     | 5          | DEV   |       |

### P2 (Medium)

| Requirement               | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------------------- | ---------- | --------- | ---------- | ----- | ----- |
| Backlog sync budget       | API        | R-004     | 2          | QA    |       |
| Flag disables the feature | E2E        | R-005     | 1          | QA    |       |
