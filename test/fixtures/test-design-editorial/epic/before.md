# Test Design: Epic 4 - Refund requests from the customer portal

## Overview

It is worth noting that refunds are an absolutely critical part of the customer experience, and industry best practice says that refund flows should always be tested very thoroughly. This comprehensive test design leverages a robust, risk-based approach to deliver a world-class level of confidence in the refund feature.

Sources: `docs/epics/epic-4-refunds.md` (Stories 4.1 to 4.3) and `docs/architecture/payments.md#refund-api`.

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description                                                                                                                                                                                              | Probability | Impact | Score | Mitigation                                       | Owner    | Timeline |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ------------------------------------------------ | -------- | -------- |
| R-001   | DATA     | Basically, as far as we can tell, it seems that a refund that is submitted twice may potentially be paid twice, because Story 4.2 says the API has no idempotency key at all (epic-4-refunds.md, AC 4.2.3). | 3           | 3      | 9     | Require an `Idempotency-Key` header              | Payments | Sprint 5 |
| R-002   | SEC      | It is important to note that a customer can actually request a refund for another customer's order by simply changing the order ID in the URL, since ownership is not checked (payments.md, "Refund API"). | 2           | 3      | 6     | Check order ownership before creating the refund | Payments | Sprint 5 |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description                                                                                                                                                       | Probability | Impact | Score | Mitigation                     | Owner    |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ------------------------------ | -------- |
| R-003   | PERF     | The refund status page is expected to respond quickly, but the latency target for p95 is UNKNOWN at this time because the PRD simply does not state a number yet. | 2           | 2      | 4     | Ask the PM for a p95 threshold | Platform |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description                                                                                                                       | Probability | Impact | Score | Action  |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ------- |
| R-004   | BUS      | Refund reason labels are shown in English only, and the German label `Rückerstattung abgelehnt` is not in the translation file yet. | 1           | 2      | 2     | Monitor |

## Test Coverage Plan

**Note:** P0/P1/P2/P3 = priority, NOT execution timing.

### P0 (Critical)

| Test IDs | Requirement                                   | Test Level | Risk Link | Test Count | Notes                                                                                                                                                                           |
| -------- | --------------------------------------------- | ---------- | --------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-001   | Duplicate refund submissions are paid once    | API        | R-001     |          3 | We will make sure that sending the same body `{"orderId": "ord_123", "amount": 4999}` twice with one `Idempotency-Key` creates exactly one refund and the second call returns `409`. |
| P0-002   | A customer cannot refund another customer's order | API        | R-002     |          2 | It goes without saying that the request should be rejected; the API must return `403` and must not create a refund row.                                                            |

### P1 (High)

| Test IDs | Requirement                          | Test Level | Risk Link | Test Count | Notes                                                                                                                       |
| -------- | ------------------------------------ | ---------- | --------- | ---------: | --------------------------------------------------------------------------------------------------------------------------- |
| P1-001   | Refund status page meets its latency target | E2E        | R-003     |          1 | Once the threshold is known, measure p95 latency; until then the threshold is UNKNOWN and this test is planned, not runnable. |

### P2 (Medium)

| Test IDs | Requirement                     | Test Level | Risk Link | Test Count | Notes                                                                                  |
| -------- | ------------------------------- | ---------- | --------- | ---------: | -------------------------------------------------------------------------------------- |
| P2-001   | German refund reason label renders | Component  | R-004     |          1 | Render with locale `de-DE` and expect the exact text `Rückerstattung abgelehnt`. |

## Execution Strategy

Basically, the plan is to run everything in PRs. All of the functional tests will run on every PR, since the whole suite should comfortably finish in ≤ 10 minutes. Retries should be limited to `retries: 1` in CI.

## Quality Gate Criteria

- P0 pass rate = 100%.
- P1 pass rate ≥ 95%.
- No refund amount may exceed the captured payment amount (assert `refund.amount <= payment.captured_amount`).

## Assumptions

1. The refunds API is reachable in staging by Sprint 5; this has not been confirmed by the Payments team yet.
2. Partial refunds are out of scope for Epic 4 (epic-4-refunds.md, "Not in Scope").
