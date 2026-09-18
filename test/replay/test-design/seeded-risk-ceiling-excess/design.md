# Test Design: Epic 7 - Offline order capture for field technicians

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description                                                                                                                                             | Probability | Impact | Score |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- |
| R-001   | SEC      | The outbound queue is stored unencrypted on the device, so anyone reaching the local file can read the stored card reference.                           | 2           | 3      | 6     |
| R-002   | DATA     | Concurrent offline edits to the same work order overwrite each other on sync, because the server applies queued edits by arrival with no version check. | 3           | 3      | 9     |
| R-003   | TECH     | A rejected payload is retried forever with no backoff and no attempt cap, so one bad item loops until the application is killed.                        | 3           | 2      | 6     |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description                                                                                                         | Probability | Impact | Score |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- |
| R-004   | PERF     | A 2000 item backlog may not finish syncing inside the 30 second budget on the mid-range hardware the fleet carries. | 2           | 2      | 4     |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description                                                                                                           | Probability | Impact | Score |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- |
| R-006   | DATA     | The server applies queued edits by arrival with no timestamp check, so a later arrival can replace an earlier edit.   | 1           | 2      | 2     |
| R-007   | TECH     | A rejected payload has no dead-letter path, so the application needs a defined destination for work it cannot accept. | 1           | 2      | 2     |
| R-008   | OPS      | The release has no staged rollout, so operators need a controlled way to observe the feature before broad deployment. | 1           | 1      | 1     |
| R-009   | PERF     | A full backlog must finish syncing within the stated budget, so throughput needs a representative workload check.     | 1           | 1      | 1     |
| R-005   | OPS      | There is no feature flag, so a bad release cannot be turned off without shipping a new store build.                   | 1           | 2      | 2     |

## Test Coverage Plan

### P0 (Critical)

| Requirement                     | Test Level  | Risk Link |
| ------------------------------- | ----------- | --------- |
| Queue is encrypted at rest      | Integration | R-001     |
| Concurrent edits do not clobber | E2E         | R-002     |

### P1 (High)

| Requirement        | Test Level | Risk Link |
| ------------------ | ---------- | --------- |
| Retry policy stops | Unit       | R-003     |

### P2 (Medium)

| Requirement               | Test Level | Risk Link |
| ------------------------- | ---------- | --------- |
| Backlog sync budget       | API        | R-004     |
| Flag disables the feature | E2E        | R-005     |
