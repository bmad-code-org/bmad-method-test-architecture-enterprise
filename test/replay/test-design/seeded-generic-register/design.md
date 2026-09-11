# Test Design: Epic 7 - Offline order capture for field technicians

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description                                                                                                                 | Probability | Impact | Score | Mitigation         | Owner    | Timeline |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ------------------ | -------- | -------- |
| R-001   | SEC      | A queued order from one organization could be applied to another organization's data, so tenant isolation has to be proven. | 2           | 3      | 6     | Assert isolation   | Platform | Q3       |
| R-002   | BUS      | The payment gateway is unavailable when the queue uploads, so the customer is never charged for the work.                   | 2           | 3      | 6     | Add reconciliation | Billing  | Q3       |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description                                                                                                        | Probability | Impact | Score | Mitigation      | Owner    |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------ | ----------- | ------ | ----- | --------------- | -------- |
| R-003   | OPS      | Queued order data could leave its jurisdiction before it is uploaded, which is a GDPR and data residency exposure. | 2           | 2      | 4     | Confirm routing | Platform |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description                                                                                                      | Probability | Impact | Score | Action   |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | -------- |
| R-004   | TECH     | The order screen has to stay usable with a screen reader and has to render correctly in every supported browser. | 1           | 2      | 2     | Document |

## Test Coverage Plan

### P0 (Critical)

| Requirement            | Test Level | Risk Link | Test Count | Owner | Notes |
| ---------------------- | ---------- | --------- | ---------- | ----- | ----- |
| Tenant isolation holds | API        | R-001     | 3          | QA    |       |
| Charging reconciles    | API        | R-002     | 2          | QA    |       |

### P2 (Medium)

| Requirement         | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------------- | ---------- | --------- | ---------- | ----- | ----- |
| Regional routing    | API        | R-003     | 2          | QA    |       |
| Accessibility sweep | E2E        | R-004     | 1          | QA    |       |
