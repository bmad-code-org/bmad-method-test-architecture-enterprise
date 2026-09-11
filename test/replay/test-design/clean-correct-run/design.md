# Test Design: Epic 9 - Show the last successful sync time on the technician home screen

## Risk Assessment

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description                                                                                                                                     | Probability | Impact | Score | Mitigation                                              | Owner  |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ------------------------------------------------------- | ------ |
| R-001   | BUS      | A relative time on a device whose clock has drifted reads as recent when the last sync was hours ago, so a technician trusts stale work orders. | 2           | 2      | 4     | Render from the recorded instant and label the timezone | Mobile |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description                                                                                                                         | Probability | Impact | Score | Action   |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | -------- |
| R-002   | TECH     | A device that has never synced has no value for the row, and the absent case has to hide the row instead of rendering an empty one. | 2           | 1      | 2     | Document |

## Test Coverage Plan

### P1 (High)

| Requirement                                | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------------------------------------ | ---------- | --------- | ---------- | ----- | ----- |
| Relative time matches the recorded instant | Unit       | R-001     | 3          | DEV   |       |

### P2 (Medium)

| Requirement                         | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------------------------------- | ---------- | --------- | ---------- | ----- | ----- |
| A device with no sync hides the row | Component  | R-002     | 2          | DEV   |       |
