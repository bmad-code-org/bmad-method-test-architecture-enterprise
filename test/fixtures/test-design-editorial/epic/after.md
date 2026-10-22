# Test Design: Epic 4 - Refund requests from the customer portal

## Overview

This plan covers refund requests from the customer portal.

Sources: `docs/epics/epic-4-refunds.md` (Stories 4.1 to 4.3) and `docs/architecture/payments.md#refund-api`.

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description                                                                                                                                       | Probability | Impact | Score | Mitigation                                       | Owner    | Timeline |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ------------------------------------------------ | -------- | -------- |
| R-001   | DATA     | A refund submitted twice can be paid twice, because the refund API has no idempotency key (epic-4-refunds.md, AC 4.2.3).                           | 3           | 3      | 9     | Require an `Idempotency-Key` header              | Payments | Sprint 5 |
| R-002   | SEC      | A customer can request a refund for another customer's order by changing the order ID in the URL, because the API does not check ownership (payments.md, "Refund API"). | 2           | 3      | 6     | Check order ownership before creating the refund | Payments | Sprint 5 |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description                                                                                       | Probability | Impact | Score | Mitigation                     | Owner    |
| ------- | -------- | ------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ------------------------------ | -------- |
| R-003   | PERF     | The p95 latency target for the refund status page is UNKNOWN; the PRD states no number.            | 2           | 2      | 4     | Ask the PM for a p95 threshold | Platform |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description                                                                                                 | Probability | Impact | Score | Action  |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ------- |
| R-004   | BUS      | The German refund reason label `Rückerstattung abgelehnt` is missing from the translation file.              | 1           | 2      | 2     | Monitor |

## Test Coverage Plan

**Note:** P0/P1/P2/P3 = priority, NOT execution timing.

### P0 (Critical)

| Test IDs | Requirement                                       | Test Level | Risk Link | Test Count | Notes                                                                                                                                                       |
| -------- | ------------------------------------------------- | ---------- | --------- | ---------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-001   | Duplicate refund submissions are paid once        | API        | R-001     |          3 | Send `{"orderId": "ord_123", "amount": 4999}` twice with the same `Idempotency-Key`. Expect exactly one refund, and expect `409` from the second call. |
| P0-002   | A customer cannot refund another customer's order | API        | R-002     |          2 | Request a refund for an order the customer does not own. Expect `403`, and expect no refund row.                                                          |

### P1 (High)

| Test IDs | Requirement                                 | Test Level | Risk Link | Test Count | Notes                                                                                                   |
| -------- | ------------------------------------------- | ---------- | --------- | ---------: | ------------------------------------------------------------------------------------------------------- |
| P1-001   | Refund status page meets its latency target | E2E        | R-003     |          1 | Planned. The threshold is UNKNOWN, so this test cannot run until the PM sets one; then measure p95 latency. |

### P2 (Medium)

| Test IDs | Requirement                        | Test Level | Risk Link | Test Count | Notes                                                                            |
| -------- | ---------------------------------- | ---------- | --------- | ---------: | -------------------------------------------------------------------------------- |
| P2-001   | German refund reason label renders | Component  | R-004     |          1 | Render with locale `de-DE` and expect the exact text `Rückerstattung abgelehnt`. |

## Execution Strategy

Run every functional test on every PR; the suite is expected to finish in ≤ 10 minutes. Set `retries: 1` in CI.

## Quality Gate Criteria

- P0 pass rate = 100%.
- P1 pass rate ≥ 95%.
- No refund amount may exceed the captured payment amount (assert `refund.amount <= payment.captured_amount`).

## Assumptions

1. The refunds API is reachable in staging by Sprint 5. The Payments team has not confirmed this.
2. Partial refunds are out of scope for Epic 4 (epic-4-refunds.md, "Not in Scope").
